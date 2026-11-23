from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends

from app.deps import Ctx, Pagina, ctx
from app.errors import AppError, nao_encontrado
from app.routers.romaneios import invalidar
from app.schemas import RotaIn, RotaPedidoIn

router = APIRouter(prefix="/rotas", tags=["rotas"])
RESUMO = """select r.id, r.nome, r.data, r.observacao, r.criado_em,
  (select count(*) from pedidos p where p.rota_id = r.id and p.status <> 'cancelado') total_pedidos,
  (select count(*) from pedidos p where p.rota_id = r.id and p.status = 'confirmado') confirmados,
  (select json_build_object('id', ro.id, 'versao', ro.versao, 'status', ro.status) from romaneios ro
     where ro.rota_id = r.id order by ro.versao desc limit 1) romaneio_atual
from rotas r"""


@router.get("")
def listar(data: date | None = None, pg: Pagina = Depends(), c: Ctx = Depends(ctx)):
    filtro = "(cast(:d as date) is null or r.data = :d)"
    total = c.q(f"select count(*) from rotas r where {filtro}", d=data).scalar()
    itens = c.todos(f"{RESUMO} where {filtro} order by r.data desc, lower(r.nome) limit :lim offset :off",
                    d=data, lim=pg.page_size, off=pg.offset)
    return pg.resposta(itens, total)


@router.get("/{rid}")
def obter(rid: UUID, c: Ctx = Depends(ctx)):
    r = c.um(f"{RESUMO} where r.id = :id", id=rid)
    if not r:
        raise nao_encontrado("Rota")
    pedidos = c.todos("""select p.id, p.numero, fo.nome fornecedor_nome, p.status, p.data_entrega,
        (select count(*) from pedido_itens i where i.pedido_id = p.id) qtd_itens,
        (select count(*) from pedido_itens i where i.pedido_id = p.id and i.produto_id is null) nao_identificados
        from pedidos p join fornecedores fo on fo.id = p.fornecedor_id where p.rota_id = :id order by p.numero""", id=rid)
    romaneios = c.todos("select id, versao, status, gerado_em from romaneios where rota_id = :id "
                        "order by versao desc", id=rid)
    return {**dict(r), "pedidos": pedidos, "romaneios": romaneios}


@router.post("", status_code=201)
def criar(d: RotaIn, c: Ctx = Depends(ctx)):
    rid = c.q("insert into rotas (empresa_id, nome, data, observacao, criado_por) values (:e,:n,:d,:o,:u) returning id",
              e=c.empresa_id, n=d.nome, d=d.data, o=d.observacao, u=c.usuario_id).scalar()
    c.auditar("criar", "rota", rid, d.model_dump())
    return obter(rid, c)


@router.post("/{rid}/pedidos")
def associar(rid: UUID, d: RotaPedidoIn, c: Ctx = Depends(ctx)):
    rota = c.um("select id, nome from rotas where id = :id for update", id=rid)
    if not rota:
        raise nao_encontrado("Rota")
    p = c.um("select id, numero, status, rota_id from pedidos where id = :id for update", id=d.pedido_id)
    if not p:
        raise nao_encontrado("Pedido")
    if p["status"] not in ("pendente", "confirmado"):
        raise AppError(409, "pedido_nao_roteavel", f"Pedido '{p['status']}' não pode ser colocado em rota")
    if p["rota_id"]:
        msg = "Pedido já está nesta rota" if str(p["rota_id"]) == str(rid) else "Pedido já está em outra rota; remova-o antes"
        raise AppError(409, "pedido_ja_roteado", msg)
    if p["status"] == "confirmado":
        invalidar(c, f"Pedido #{p['numero']} incluído na rota", rota_id=rid)
    c.q("update pedidos set rota_id = :r, atualizado_em = now() where id = :id", r=rid, id=d.pedido_id)
    c.auditar("associar", "rota", rid, {"pedido": p["numero"], "rota": rota["nome"]})
    return obter(rid, c)


@router.delete("/{rid}/pedidos/{pid}")
def remover(rid: UUID, pid: UUID, c: Ctx = Depends(ctx)):
    p = c.um("select id, numero, status from pedidos where id = :id and rota_id = :r for update", id=pid, r=rid)
    if not p:
        raise nao_encontrado("Pedido nesta rota")
    if p["status"] in ("em_separacao", "separado"):
        raise AppError(409, "pedido_em_separacao", "Pedido já está em separação e não pode sair da rota")
    if p["status"] == "confirmado":
        invalidar(c, f"Pedido #{p['numero']} removido da rota", pedido_id=pid, rota_id=rid)
    c.q("update pedidos set rota_id = null, atualizado_em = now() where id = :id", id=pid)
    c.auditar("remover", "rota", rid, {"pedido": p["numero"]})
    return obter(rid, c)
