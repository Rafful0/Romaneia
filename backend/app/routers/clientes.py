from uuid import UUID

from fastapi import APIRouter, Depends

from app.deps import Ctx, Pagina, admin, ctx
from app.errors import nao_encontrado
from app.schemas import ClienteIn

router = APIRouter(prefix="/clientes", tags=["clientes"])
COLS = "id, nome, documento, telefone, endereco, ativo, criado_em, atualizado_em"


@router.get("")
def listar(busca: str = "", ativo: bool | None = None, pg: Pagina = Depends(), c: Ctx = Depends(ctx)):
    filtro = ("(:b = '' or nome ilike '%' || :b || '%' or documento ilike '%' || :b || '%') "
              "and (cast(:a as boolean) is null or ativo = cast(:a as boolean))")
    p = {"b": busca.strip(), "a": ativo}
    total = c.q(f"select count(*) from clientes where {filtro}", **p).scalar()
    itens = c.todos(f"select {COLS} from clientes where {filtro} order by ativo desc, lower(nome) "
                    f"limit :lim offset :off", **p, lim=pg.page_size, off=pg.offset)
    return pg.resposta(itens, total)


@router.get("/{cid}")
def obter(cid: UUID, c: Ctx = Depends(ctx)):
    r = c.um(f"select {COLS} from clientes where id = :id", id=cid)
    if not r:
        raise nao_encontrado("Cliente")
    return dict(r)


@router.post("", status_code=201)
def criar(d: ClienteIn, c: Ctx = Depends(ctx)):
    r = c.um(f"insert into clientes (empresa_id, nome, documento, telefone, endereco) "
             f"values (:e, :n, :d, :t, :en) returning {COLS}",
             e=c.empresa_id, n=d.nome, d=d.documento, t=d.telefone, en=d.endereco)
    c.auditar("criar", "cliente", r["id"], {"nome": d.nome})
    return dict(r)


@router.put("/{cid}")
def editar(cid: UUID, d: ClienteIn, c: Ctx = Depends(ctx)):
    r = c.um(f"update clientes set nome=:n, documento=:d, telefone=:t, endereco=:en, atualizado_em=now() "
             f"where id = :id returning {COLS}", id=cid, n=d.nome, d=d.documento, t=d.telefone, en=d.endereco)
    if not r:
        raise nao_encontrado("Cliente")
    c.auditar("editar", "cliente", cid, d.model_dump())
    return dict(r)


@router.post("/{cid}/inativar")
def inativar(cid: UUID, c: Ctx = Depends(admin)):
    r = c.um(f"update clientes set ativo=false, atualizado_em=now() where id = :id returning {COLS}", id=cid)
    if not r:
        raise nao_encontrado("Cliente")
    c.auditar("inativar", "cliente", cid, {"nome": r["nome"]})
    return dict(r)
