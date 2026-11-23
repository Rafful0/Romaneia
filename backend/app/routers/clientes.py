from uuid import UUID

from fastapi import APIRouter, Depends

from app.deps import Ctx, Pagina, admin, ctx
from app.errors import AppError, nao_encontrado
from app.schemas import ClienteIn

router = APIRouter(prefix="/clientes", tags=["clientes"])
SELECT = """select c.id, c.nome, c.documento, c.telefone, c.endereco, c.ativo, c.criado_em, c.atualizado_em,
  c.tipo_comercio_id, t.nome tipo_comercio_nome
from clientes c left join tipos_comercio t on t.id = c.tipo_comercio_id"""


def _obter(c: Ctx, cid) -> dict:
    r = c.um(f"{SELECT} where c.id = :id", id=cid)
    if not r:
        raise nao_encontrado("Cliente")
    return dict(r)


def _validar_tipo(c: Ctx, tipo_id, atual=None) -> None:
    if tipo_id is None or str(tipo_id) == str(atual):
        return
    t = c.um("select ativo from tipos_comercio where id = :id", id=tipo_id)
    if not t:  # inclui tipo de outra empresa (invisível pelo RLS)
        raise AppError(422, "tipo_comercio_invalido", "Tipo de comércio não encontrado", {"campo": "tipo_comercio_id"})
    if not t["ativo"]:
        raise AppError(422, "tipo_comercio_inativo", "Tipo de comércio inativo", {"campo": "tipo_comercio_id"})


@router.get("")
def listar(busca: str = "", ativo: bool | None = None, tipo_comercio_id: UUID | None = None,
           pg: Pagina = Depends(), c: Ctx = Depends(ctx)):
    filtro = ("(:b = '' or c.nome ilike '%' || :b || '%' or c.documento ilike '%' || :b || '%') "
              "and (cast(:a as boolean) is null or c.ativo = cast(:a as boolean)) "
              "and (cast(:t as uuid) is null or c.tipo_comercio_id = :t)")
    p = {"b": busca.strip(), "a": ativo, "t": tipo_comercio_id}
    total = c.q(f"select count(*) from clientes c where {filtro}", **p).scalar()
    itens = c.todos(f"{SELECT} where {filtro} order by c.ativo desc, lower(c.nome) limit :lim offset :off",
                    **p, lim=pg.page_size, off=pg.offset)
    return pg.resposta(itens, total)


@router.get("/{cid}")
def obter(cid: UUID, c: Ctx = Depends(ctx)):
    return _obter(c, cid)


@router.post("", status_code=201)
def criar(d: ClienteIn, c: Ctx = Depends(ctx)):
    _validar_tipo(c, d.tipo_comercio_id)
    cid = c.q("insert into clientes (empresa_id, nome, documento, telefone, endereco, tipo_comercio_id) "
              "values (:e, :n, :d, :t, :en, :tc) returning id",
              e=c.empresa_id, n=d.nome, d=d.documento, t=d.telefone, en=d.endereco, tc=d.tipo_comercio_id).scalar()
    c.auditar("criar", "cliente", cid, {"nome": d.nome})
    return _obter(c, cid)


@router.put("/{cid}")
def editar(cid: UUID, d: ClienteIn, c: Ctx = Depends(ctx)):
    atual = _obter(c, cid)
    _validar_tipo(c, d.tipo_comercio_id, atual["tipo_comercio_id"])
    c.q("update clientes set nome=:n, documento=:d, telefone=:t, endereco=:en, tipo_comercio_id=:tc, "
        "atualizado_em=now() where id = :id",
        id=cid, n=d.nome, d=d.documento, t=d.telefone, en=d.endereco, tc=d.tipo_comercio_id)
    c.auditar("editar", "cliente", cid, d.model_dump())
    return _obter(c, cid)


@router.post("/{cid}/inativar")
def inativar(cid: UUID, c: Ctx = Depends(admin)):
    atual = _obter(c, cid)
    c.q("update clientes set ativo=false, atualizado_em=now() where id = :id", id=cid)
    c.auditar("inativar", "cliente", cid, {"nome": atual["nome"]})
    return _obter(c, cid)
