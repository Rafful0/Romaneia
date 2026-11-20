from fastapi import APIRouter, Depends, Response
from sqlalchemy import text

from app.config import settings
from app.db import engine, set_tenant
from app.deps import COOKIE, Ctx, ctx
from app.errors import AppError
from app.schemas import LoginIn
from app.security import criar_token, verificar_senha

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(dados: LoginIn, resp: Response):
    with engine.begin() as conn:
        u = conn.execute(text("select * from auth_buscar_usuario(:e)"), {"e": dados.email}).mappings().first()
        ok = verificar_senha(dados.senha, u["senha_hash"] if u else None)
        if not u or not ok or not u["ativo"]:
            raise AppError(401, "credenciais_invalidas", "E-mail ou senha incorretos")
        set_tenant(conn, u["empresa_id"], u["id"])
        conn.execute(text("insert into auditoria (empresa_id, usuario_id, acao, entidade, entidade_id) "
                          "values (:e, :u, 'login', 'usuario', :u)"), {"e": u["empresa_id"], "u": u["id"]})
        empresa = conn.execute(text("select nome from empresas where id = :e"), {"e": u["empresa_id"]}).scalar()
    token = criar_token(u["id"], u["empresa_id"], u["papel"])
    resp.set_cookie(COOKIE, token, httponly=True, secure=settings.cookie_secure, samesite="lax",
                    max_age=settings.jwt_expira_min * 60, path="/")
    return {"id": str(u["id"]), "nome": u["nome"], "papel": u["papel"], "empresa": empresa}


@router.post("/logout", status_code=204)
def logout(resp: Response):
    # shortcut: JWT sem lista de revogação; o token antigo vale até expirar se tiver sido copiado.
    resp.delete_cookie(COOKIE, path="/")


@router.get("/me")
def me(c: Ctx = Depends(ctx)):
    empresa = c.q("select nome from empresas where id = :e", e=c.empresa_id).scalar()
    return {"id": c.usuario_id, "nome": c.nome, "papel": c.papel, "empresa": empresa}
