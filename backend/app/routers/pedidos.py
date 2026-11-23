from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends

from app import domain
from app.deps import Ctx, Pagina, ctx
from app.errors import AppError, nao_encontrado
from app.routers.romaneios import invalidar
from app.schemas import CancelarIn, PedidoIn

router = APIRouter(prefix="/pedidos", tags=["pedidos"])
STATUS = set(domain.TRANSICOES)

SELECT = """select p.id, p.numero, p.cliente_id, cl.nome cliente_nome, cl.telefone cliente_telefone, p.rota_id, r.nome rota_nome, r.data rota_data,
  p.data_entrega, p.status, p.observacao, p.motivo_cancelamento, p.revisao, p.criado_em, p.atualizado_em,
  u.nome criado_por_nome,
  (select count(*) from pedido_itens i where i.pedido_id = p.id) qtd_itens,
  (select count(*) from pedido_itens i where i.pedido_id = p.id and i.produto_id is null) nao_identificados
from pedidos p join clientes cl on cl.id = p.cliente_id left join rotas r on r.id = p.rota_id
join usuarios u on u.id = p.criado_por"""


def detalhe(c: Ctx, pid) -> dict:
    p = c.um(f"{SELECT} where p.id = :id", id=pid)
    if not p:
        raise nao_encontrado("Pedido")
    itens = c.todos("""select i.id, i.posicao, i.produto_id, pr.codigo produto_codigo, pr.nome produto_nome,
                              i.texto_original, i.quantidade::text quantidade, i.unidade
                       from pedido_itens i left join produtos pr on pr.id = i.produto_id
                       where i.pedido_id = :id order by i.posicao""", id=pid)
    return {**dict(p), "itens": itens}


def _gravar_itens(c: Ctx, pid, d: PedidoIn, produtos_anteriores: set = frozenset()) -> None:
    for n, it in enumerate(d.itens):
        campo = f"itens.{n}"
        domain.validar_quantidade(it.quantidade, it.unidade, f"{campo}.quantidade")
        if it.produto_id:
            prod = c.um("select id, ativo from produtos where id = :id", id=it.produto_id)
            if not prod:  # inclui produto de outra empresa (invisível pelo RLS)
                raise AppError(422, "produto_invalido", f"Item {n + 1}: produto não encontrado", {"campo": campo})
            if not prod["ativo"] and str(it.produto_id) not in produtos_anteriores:
                raise AppError(422, "produto_inativo", f"Item {n + 1}: produto inativo", {"campo": campo})
        elif not it.texto_original:
            raise AppError(422, "item_vazio", f"Item {n + 1}: escolha um produto ou descreva o item",
                           {"campo": campo})
    c.q("delete from pedido_itens where pedido_id = :p", p=pid)
    for n, it in enumerate(d.itens):
        c.q("insert into pedido_itens (empresa_id, pedido_id, posicao, produto_id, texto_original, quantidade, unidade) "
            "values (:e, :p, :n, :prod, :t, :q, :u)", e=c.empresa_id, p=pid, n=n, prod=it.produto_id,
            t=it.texto_original, q=it.quantidade, u=it.unidade)


def _cliente_ativo(c: Ctx, cliente_id) -> None:
    cl = c.um("select ativo from clientes where id = :id", id=cliente_id)
    if not cl:
        raise AppError(422, "cliente_invalido", "Cliente não encontrado", {"campo": "cliente_id"})
    if not cl["ativo"]:
        raise AppError(422, "cliente_inativo", "Cliente inativo", {"campo": "cliente_id"})


def _travar(c: Ctx, pid) -> dict:
    p = c.um("select id, numero, status, rota_id, cliente_id from pedidos where id = :id for update", id=pid)
    if not p:
        raise nao_encontrado("Pedido")
    return dict(p)


@router.get("")
def listar(status: str | None = None, de: date | None = None, ate: date | None = None,
           sem_rota: bool = False, busca: str = "", pg: Pagina = Depends(), c: Ctx = Depends(ctx)):
    if status and status not in STATUS:
        raise AppError(422, "validacao", f"Status inválido: {status}")
    filtro = """(cast(:st as text) is null or p.status = :st)
      and (cast(:de as date) is null or p.data_entrega >= :de) and (cast(:ate as date) is null or p.data_entrega <= :ate)
      and (not :sr or (p.rota_id is null and p.status in ('pendente','confirmado')))
      and (:b = '' or cl.nome ilike '%' || :b || '%' or p.numero::text = :b)"""
    prm = {"st": status, "de": de, "ate": ate, "sr": sem_rota, "b": busca.strip()}
    total = c.q(f"select count(*) from pedidos p join clientes cl on cl.id = p.cliente_id where {filtro}",
                **prm).scalar()
    itens = c.todos(f"{SELECT} where {filtro} order by p.numero desc limit :lim offset :off",
                    **prm, lim=pg.page_size, off=pg.offset)
    return pg.resposta(itens, total)


@router.get("/{pid}")
def obter(pid: UUID, c: Ctx = Depends(ctx)):
    return detalhe(c, pid)


@router.post("", status_code=201)
def criar(d: PedidoIn, c: Ctx = Depends(ctx)):
    _cliente_ativo(c, d.cliente_id)
    pid = c.q("insert into pedidos (empresa_id, cliente_id, data_entrega, observacao, criado_por) "
              "values (:e, :cl, :de, :o, :u) returning id",
              e=c.empresa_id, cl=d.cliente_id, de=d.data_entrega, o=d.observacao, u=c.usuario_id).scalar()
    _gravar_itens(c, pid, d)
    out = detalhe(c, pid)
    c.auditar("criar", "pedido", pid, {"numero": out["numero"], "itens": len(d.itens)})
    return out


@router.put("/{pid}")
def editar(pid: UUID, d: PedidoIn, c: Ctx = Depends(ctx)):
    p = _travar(c, pid)
    if p["status"] not in domain.EDITAVEIS:
        raise AppError(409, "pedido_nao_editavel", f"Pedido '{p['status']}' não pode ser alterado")
    if str(d.cliente_id) != str(p["cliente_id"]):
        _cliente_ativo(c, d.cliente_id)
    if p["status"] == "confirmado" and any(it.produto_id is None for it in d.itens):
        raise AppError(422, "item_nao_identificado", "Pedido confirmado não pode ter item sem produto identificado")
    anteriores = {str(r["produto_id"]) for r in c.todos(
        "select produto_id from pedido_itens where pedido_id = :p and produto_id is not null", p=pid)}
    _gravar_itens(c, pid, d, anteriores)
    c.q("update pedidos set cliente_id=:cl, data_entrega=:de, observacao=:o, revisao = revisao + 1, "
        "atualizado_em = now() where id = :id", id=pid, cl=d.cliente_id, de=d.data_entrega, o=d.observacao)
    if p["status"] == "confirmado":
        invalidar(c, f"Pedido #{p['numero']} alterado", pedido_id=pid, rota_id=p["rota_id"])
    c.auditar("editar", "pedido", pid, {"numero": p["numero"], "itens": len(d.itens)})
    return detalhe(c, pid)


@router.post("/{pid}/confirmar")
def confirmar(pid: UUID, c: Ctx = Depends(ctx)):
    p = _travar(c, pid)
    domain.validar_transicao(p["status"], "confirmado")
    r = c.um("select count(*) total, count(*) filter (where produto_id is null) sem_produto "
             "from pedido_itens where pedido_id = :p", p=pid)
    if r["total"] == 0:
        raise AppError(422, "pedido_vazio", "Pedido sem itens não pode ser confirmado")
    if r["sem_produto"]:
        raise AppError(422, "item_nao_identificado",
                       f"Há {r['sem_produto']} item(ns) sem produto identificado; edite o pedido antes de confirmar")
    c.q("update pedidos set status = 'confirmado', atualizado_em = now() where id = :id", id=pid)
    if p["rota_id"]:
        invalidar(c, f"Pedido #{p['numero']} confirmado na rota", rota_id=p["rota_id"])
    c.auditar("confirmar", "pedido", pid, {"numero": p["numero"]})
    return detalhe(c, pid)


@router.post("/{pid}/cancelar")
def cancelar(pid: UUID, d: CancelarIn, c: Ctx = Depends(ctx)):
    p = _travar(c, pid)
    domain.validar_transicao(p["status"], "cancelado")
    if p["status"] == "confirmado":
        invalidar(c, f"Pedido #{p['numero']} cancelado", pedido_id=pid, rota_id=p["rota_id"])
    c.q("update pedidos set status = 'cancelado', motivo_cancelamento = :m, atualizado_em = now() where id = :id",
        id=pid, m=d.motivo)
    c.auditar("cancelar", "pedido", pid, {"numero": p["numero"], "motivo": d.motivo})
    return detalhe(c, pid)
