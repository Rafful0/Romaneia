from datetime import date
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends

from app import domain, whatsapp
from app.deps import Ctx, Pagina, ctx
from app.errors import AppError, nao_encontrado
from app.routers.romaneios import invalidar
from app.schemas import CancelarIn, PedidoIn

router = APIRouter(prefix="/pedidos", tags=["pedidos"])
STATUS = set(domain.TRANSICOES)

SELECT = """select p.id, p.numero, p.fornecedor_id, fo.nome fornecedor_nome, fo.telefone fornecedor_telefone, p.rota_id, r.nome rota_nome, r.data rota_data,
  p.data_entrega, p.status, p.observacao, p.motivo_cancelamento, p.revisao, p.criado_em, p.atualizado_em,
  u.nome criado_por_nome,
  (select count(*) from pedido_itens i where i.pedido_id = p.id) qtd_itens,
  (select count(*) from pedido_itens i where i.pedido_id = p.id and i.produto_id is null) nao_identificados
from pedidos p join fornecedores fo on fo.id = p.fornecedor_id left join rotas r on r.id = p.rota_id
join usuarios u on u.id = p.criado_por"""


def detalhe(c: Ctx, pid) -> dict:
    p = c.um(f"{SELECT} where p.id = :id", id=pid)
    if not p:
        raise nao_encontrado("Pedido")
    itens = c.todos("""select i.id, i.posicao, i.produto_id, pr.codigo produto_codigo, pr.nome produto_nome,
                              i.texto_original, i.quantidade::text quantidade, i.unidade
                       from pedido_itens i left join produtos pr on pr.id = i.produto_id
                       where i.pedido_id = :id order by i.posicao""", id=pid)
    envios = c.todos("""select id, motivo, status, tipo_mensagem, telefone, erro, criado_em, atualizado_em
                        from envios_whatsapp where pedido_id = :id order by criado_em desc""", id=pid)
    return {**dict(p), "itens": itens, "envios_whatsapp": envios}


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


def _fornecedor_ativo(c: Ctx, fornecedor_id) -> None:
    fo = c.um("select ativo from fornecedores where id = :id", id=fornecedor_id)
    if not fo:  # inclui fornecedor de outra empresa (invisível pelo RLS)
        raise AppError(422, "fornecedor_invalido", "Fornecedor não encontrado", {"campo": "fornecedor_id"})
    if not fo["ativo"]:
        raise AppError(422, "fornecedor_inativo", "Fornecedor inativo", {"campo": "fornecedor_id"})


def _travar(c: Ctx, pid) -> dict:
    p = c.um("select id, numero, status, rota_id, fornecedor_id from pedidos where id = :id for update", id=pid)
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
      and (:b = '' or fo.nome ilike '%' || :b || '%' or p.numero::text = :b)"""
    prm = {"st": status, "de": de, "ate": ate, "sr": sem_rota, "b": busca.strip()}
    total = c.q(f"select count(*) from pedidos p join fornecedores fo on fo.id = p.fornecedor_id where {filtro}",
                **prm).scalar()
    itens = c.todos(f"{SELECT} where {filtro} order by p.numero desc limit :lim offset :off",
                    **prm, lim=pg.page_size, off=pg.offset)
    return pg.resposta(itens, total)


@router.get("/{pid}")
def obter(pid: UUID, c: Ctx = Depends(ctx)):
    return detalhe(c, pid)


@router.post("", status_code=201)
def criar(d: PedidoIn, c: Ctx = Depends(ctx)):
    _fornecedor_ativo(c, d.fornecedor_id)
    pid = c.q("insert into pedidos (empresa_id, fornecedor_id, data_entrega, observacao, criado_por) "
              "values (:e, :cl, :de, :o, :u) returning id",
              e=c.empresa_id, cl=d.fornecedor_id, de=d.data_entrega, o=d.observacao, u=c.usuario_id).scalar()
    _gravar_itens(c, pid, d)
    out = detalhe(c, pid)
    c.auditar("criar", "pedido", pid, {"numero": out["numero"], "itens": len(d.itens)})
    return out


@router.put("/{pid}")
def editar(pid: UUID, d: PedidoIn, c: Ctx = Depends(ctx)):
    p = _travar(c, pid)
    if p["status"] not in domain.EDITAVEIS:
        raise AppError(409, "pedido_nao_editavel", f"Pedido '{p['status']}' não pode ser alterado")
    if str(d.fornecedor_id) != str(p["fornecedor_id"]):
        _fornecedor_ativo(c, d.fornecedor_id)
    if p["status"] == "confirmado" and any(it.produto_id is None for it in d.itens):
        raise AppError(422, "item_nao_identificado", "Pedido confirmado não pode ter item sem produto identificado")
    anteriores = {str(r["produto_id"]) for r in c.todos(
        "select produto_id from pedido_itens where pedido_id = :p and produto_id is not null", p=pid)}
    _gravar_itens(c, pid, d, anteriores)
    c.q("update pedidos set fornecedor_id=:cl, data_entrega=:de, observacao=:o, revisao = revisao + 1, "
        "atualizado_em = now() where id = :id", id=pid, cl=d.fornecedor_id, de=d.data_entrega, o=d.observacao)
    if p["status"] == "confirmado":
        invalidar(c, f"Pedido #{p['numero']} alterado", pedido_id=pid, rota_id=p["rota_id"])
    c.auditar("editar", "pedido", pid, {"numero": p["numero"], "itens": len(d.itens)})
    return detalhe(c, pid)


@router.post("/{pid}/confirmar")
def confirmar(pid: UUID, tarefas: BackgroundTasks, c: Ctx = Depends(ctx)):
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
    _enviar_depois(c, tarefas, pid, "pedido")
    return detalhe(c, pid)


@router.post("/{pid}/cancelar")
def cancelar(pid: UUID, d: CancelarIn, tarefas: BackgroundTasks, c: Ctx = Depends(ctx)):
    p = _travar(c, pid)
    domain.validar_transicao(p["status"], "cancelado")
    if p["status"] == "confirmado":
        invalidar(c, f"Pedido #{p['numero']} cancelado", pedido_id=pid, rota_id=p["rota_id"])
    c.q("update pedidos set status = 'cancelado', motivo_cancelamento = :m, atualizado_em = now() where id = :id",
        id=pid, m=d.motivo)
    c.auditar("cancelar", "pedido", pid, {"numero": p["numero"], "motivo": d.motivo})
    # Só avisa o fornecedor do cancelamento se ele chegou a receber o pedido.
    if c.um("select 1 from envios_whatsapp where pedido_id = :p and motivo = 'pedido' "
            "and status in ('enviado','entregue','lido')", p=pid):
        _enviar_depois(c, tarefas, pid, "cancelamento")
    return detalhe(c, pid)


def _enviar_depois(c: Ctx, tarefas: BackgroundTasks, pid, motivo: str, manual: bool = False) -> None:
    envio = whatsapp.agendar(c, pid, motivo, manual)
    if envio:  # roda depois do commit da requisição, fora da transação
        tarefas.add_task(whatsapp.processar, c.empresa_id, envio)


@router.post("/{pid}/whatsapp", status_code=202)
def enviar_whatsapp(pid: UUID, tarefas: BackgroundTasks, c: Ctx = Depends(ctx)):
    """Envia (ou reenvia) o pedido ao fornecedor pela API; pedido cancelado manda o aviso de cancelamento."""
    if not whatsapp.configurado():
        raise AppError(409, "whatsapp_nao_configurado", "Envio automático pelo WhatsApp não está configurado")
    p = _travar(c, pid)
    if p["status"] == "pendente":
        raise AppError(409, "pedido_pendente", "Confirme o pedido antes de enviar ao fornecedor")
    if c.um("select 1 from envios_whatsapp where pedido_id = :p and status in ('pendente','enviando')", p=pid):
        raise AppError(409, "envio_em_andamento", "Já há um envio em andamento para este pedido")
    _enviar_depois(c, tarefas, pid, "cancelamento" if p["status"] == "cancelado" else "pedido", manual=True)
    return detalhe(c, pid)
