from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.deps import Ctx, Pagina, admin, ctx
from app.errors import AppError, nao_encontrado
from app.schemas import TipoComercioIn

router = APIRouter(prefix="/tipos-comercio", tags=["tipos de comércio"])
SELECT = """select t.id, t.nome, t.ativo, t.criado_em,
  (select count(*) from clientes c where c.tipo_comercio_id = t.id and c.ativo) total_clientes
from tipos_comercio t"""


def _obter(c: Ctx, tid) -> dict:
    r = c.um(f"{SELECT} where t.id = :id", id=tid)
    if not r:
        raise nao_encontrado("Tipo de comércio")
    return dict(r)


def _nome_unico(c: Ctx, nome: str, tid=None) -> None:
    if c.um("select 1 from tipos_comercio where lower(nome) = lower(:n) and id is distinct from :id", n=nome, id=tid):
        raise AppError(409, "nome_duplicado", f"Já existe o tipo de comércio '{nome}'", {"campo": "nome"})


@router.get("")
def listar(ativo: bool | None = None, pg: Pagina = Depends(), c: Ctx = Depends(ctx)):
    filtro = "(cast(:a as boolean) is null or t.ativo = cast(:a as boolean))"
    total = c.q(f"select count(*) from tipos_comercio t where {filtro}", a=ativo).scalar()
    itens = c.todos(f"{SELECT} where {filtro} order by t.ativo desc, lower(t.nome) limit :lim offset :off",
                    a=ativo, lim=pg.page_size, off=pg.offset)
    return pg.resposta(itens, total)


@router.post("", status_code=201)
def criar(d: TipoComercioIn, c: Ctx = Depends(ctx)):
    _nome_unico(c, d.nome)
    tid = c.q("insert into tipos_comercio (empresa_id, nome) values (:e, :n) returning id",
              e=c.empresa_id, n=d.nome).scalar()
    c.auditar("criar", "tipo_comercio", tid, {"nome": d.nome})
    return _obter(c, tid)


@router.put("/{tid}")
def editar(tid: UUID, d: TipoComercioIn, c: Ctx = Depends(ctx)):
    _obter(c, tid)
    _nome_unico(c, d.nome, tid)
    c.q("update tipos_comercio set nome = :n where id = :id", n=d.nome, id=tid)
    c.auditar("editar", "tipo_comercio", tid, {"nome": d.nome})
    return _obter(c, tid)


@router.post("/{tid}/inativar")
def inativar(tid: UUID, c: Ctx = Depends(admin)):
    t = _obter(c, tid)
    # Clientes mantêm o vínculo (histórico); só não dá para escolher o tipo em novos cadastros.
    c.q("update tipos_comercio set ativo = false where id = :id", id=tid)
    c.auditar("inativar", "tipo_comercio", tid, {"nome": t["nome"]})
    return _obter(c, tid)


@router.get("/{tid}/leitura")
def leitura(tid: UUID, dias: int = Query(90, ge=1, le=3650), c: Ctx = Depends(ctx)):
    """Produtos mais pedidos pelos clientes deste tipo, por produto + unidade (unidades nunca se somam)."""
    tipo = _obter(c, tid)
    peds = """select p.id, p.cliente_id from pedidos p join clientes cl on cl.id = p.cliente_id
              where cl.tipo_comercio_id = :t and p.status <> 'cancelado'
                and p.data_entrega >= current_date - cast(:dias as integer)"""
    total = c.q(f"select count(*) from ({peds}) x", t=tid, dias=dias).scalar()
    itens = c.todos(f"""
        with peds as ({peds})
        select i.produto_id, pr.codigo produto_codigo, pr.nome produto_nome, pr.ativo produto_ativo, i.unidade,
               count(distinct i.pedido_id) pedidos, count(distinct peds.cliente_id) clientes,
               sum(i.quantidade)::text quantidade_total
        from pedido_itens i join peds on peds.id = i.pedido_id join produtos pr on pr.id = i.produto_id
        group by i.produto_id, pr.codigo, pr.nome, pr.ativo, i.unidade
        order by count(distinct i.pedido_id) desc, sum(i.quantidade) desc, lower(pr.nome)
        limit 20""", t=tid, dias=dias)
    return {"tipo": tipo, "dias": dias, "total_pedidos": total, "itens": itens}
