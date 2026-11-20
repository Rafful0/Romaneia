import json
from dataclasses import dataclass
from typing import Iterator

import jwt
from fastapi import Depends, Query, Request
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.db import engine, set_tenant
from app.errors import AppError
from app.security import ler_token

COOKIE = "romaneia_token"


@dataclass
class Ctx:
    conn: Connection
    usuario_id: str
    empresa_id: str
    papel: str
    nome: str

    def q(self, sql: str, **params):
        return self.conn.execute(text(sql), params)

    def um(self, sql: str, **params):
        return self.q(sql, **params).mappings().first()

    def todos(self, sql: str, **params):
        return [dict(r) for r in self.q(sql, **params).mappings().all()]

    def auditar(self, acao: str, entidade: str, entidade_id=None, detalhes: dict | None = None) -> None:
        self.q(
            "insert into auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, detalhes) "
            "values (:e, :u, :a, :ent, :eid, cast(:d as jsonb))",
            e=self.empresa_id, u=self.usuario_id, a=acao, ent=entidade,
            eid=str(entidade_id) if entidade_id else None, d=json.dumps(detalhes or {}, default=str),
        )


def ctx(request: Request) -> Iterator[Ctx]:
    """Autentica pelo cookie e abre UMA transação com a empresa do token fixada para o RLS."""
    token = request.cookies.get(COOKIE)
    if not token:
        raise AppError(401, "nao_autenticado", "Faça login para continuar")
    try:
        dados = ler_token(token)
    except jwt.ExpiredSignatureError:
        raise AppError(401, "sessao_expirada", "Sua sessão expirou. Faça login novamente")
    except jwt.InvalidTokenError:
        raise AppError(401, "token_invalido", "Sessão inválida. Faça login novamente")

    with engine.begin() as conn:
        set_tenant(conn, dados["emp"], dados["sub"])
        u = conn.execute(text("select id, nome, papel, ativo from usuarios where id = :id"),
                         {"id": dados["sub"]}).mappings().first()
        if not u or not u["ativo"]:
            raise AppError(401, "usuario_inativo", "Usuário inativo ou removido")
        # Papel vem do banco (fonte atual), empresa vem do token; nada vem do corpo/query.
        yield Ctx(conn, str(u["id"]), dados["emp"], u["papel"], u["nome"])


def admin(c: Ctx = Depends(ctx)) -> Ctx:
    if c.papel != "admin":
        raise AppError(403, "proibido", "Apenas administradores podem fazer isso")
    return c


class Pagina:
    def __init__(self, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
        self.page, self.page_size = page, page_size
        self.offset = (page - 1) * page_size

    def resposta(self, itens: list, total: int) -> dict:
        return {"items": itens, "total": total, "page": self.page, "page_size": self.page_size}
