"""Envio automático de pedidos ao fornecedor pela WhatsApp Cloud API (Meta).

Fluxo: a ação (confirmar/cancelar/reenviar) grava um envio "pendente" na mesma transação do pedido; depois da resposta,
uma tarefa em segundo plano chama a API fora de qualquer transação e grava o resultado. Falha no WhatsApp nunca desfaz
o pedido: o envio fica "falhou" com o motivo e pode ser reenviado.
"""
import json
import logging
import re
from decimal import Decimal

import httpx
from sqlalchemy import text

from app.config import settings
from app.db import engine, set_tenant
from app.errors import AppError

log = logging.getLogger("romaneia.whatsapp")


class ErroWhatsApp(Exception):
    def __init__(self, codigo, mensagem: str):
        super().__init__(mensagem)
        self.codigo, self.mensagem = codigo, mensagem


def configurado() -> bool:
    return bool(settings.whatsapp_token and settings.whatsapp_phone_number_id)


def enviar_api(payload: dict) -> dict:
    """POST /messages na Cloud API. Separado para os testes simularem a Meta."""
    url = f"{settings.whatsapp_api_url}/{settings.whatsapp_api_versao}/{settings.whatsapp_phone_number_id}/messages"
    r = httpx.post(url, json=payload, timeout=15, headers={"Authorization": f"Bearer {settings.whatsapp_token}"})
    try:
        dados = r.json()
    except ValueError:
        dados = {}
    if r.status_code >= 400:
        e = dados.get("error") or {}
        raise ErroWhatsApp(e.get("code"), e.get("message") or f"HTTP {r.status_code}")
    return dados


ERROS = {
    131047: "Fora da janela de 24 h: o fornecedor precisa ter mandado mensagem para o número do Romaneia nas últimas "
            "24 horas, ou configure um modelo de mensagem aprovado (WHATSAPP_MODELO).",
    131030: "Este número não está na lista de destinatários permitidos do número de teste da Meta.",
    131026: "Não foi possível entregar: o número do fornecedor pode não ter WhatsApp.",
    132001: "Modelo de mensagem não encontrado ou não aprovado na Meta.",
    190: "Token do WhatsApp inválido ou expirado. Gere um novo e atualize WHATSAPP_TOKEN.",
}


def traduzir(e: ErroWhatsApp) -> str:
    return ERROS.get(e.codigo, f"O WhatsApp recusou o envio ({e.codigo}): {e.mensagem}")


def _qtd(v) -> str:
    s = format(Decimal(v).normalize(), "f")
    return s.replace(".", ",")


def _param(v: str) -> str:
    # Parâmetro de modelo não aceita quebra de linha, tab nem 4+ espaços seguidos.
    s = re.sub(r"\s+", " ", str(v)).strip()
    return s if len(s) <= 1000 else s[:999] + "…"


def montar(d: dict) -> tuple[str, dict]:
    """d: dados do pedido + empresa + motivo. Devolve (tipo_mensagem, payload)."""
    itens = [f"{_qtd(i['quantidade'])} {i['unidade']} {i['descricao']}".strip() for i in d["itens"]]
    entrega = d["data_entrega"].strftime("%d/%m/%Y")
    base = {"messaging_product": "whatsapp", "recipient_type": "individual", "to": d["telefone"]}
    cancel = d["motivo"] == "cancelamento"

    modelo = settings.whatsapp_modelo_cancelamento if cancel else settings.whatsapp_modelo
    if modelo:
        params = ([d["fornecedor_nome"], d["numero"], d["empresa"], d["motivo_cancelamento"] or "-"] if cancel
                  else [d["fornecedor_nome"], d["numero"], d["empresa"], entrega, "; ".join(itens)])
        return "modelo", {**base, "type": "template", "template": {
            "name": modelo, "language": {"code": settings.whatsapp_modelo_idioma},
            "components": [{"type": "body", "parameters": [{"type": "text", "text": _param(p)} for p in params]}]}}

    if cancel:
        linhas = [f"Olá, {d['fornecedor_nome']}! O pedido #{d['numero']} da {d['empresa']} foi cancelado."]
        if d["motivo_cancelamento"]:
            linhas.append(f"Motivo: {d['motivo_cancelamento']}")
    else:
        linhas = [f"Olá, {d['fornecedor_nome']}! Segue o pedido #{d['numero']} da {d['empresa']}.",
                  f"Entrega: {entrega}", "", "Itens:", *[f"- {i}" for i in itens]]
        if d["observacao"]:
            linhas += ["", f"Observação: {d['observacao']}"]
        linhas += ["", "Pode confirmar o recebimento, por favor?"]
    return "texto", {**base, "type": "text", "text": {"preview_url": False, "body": "\n".join(linhas)}}


def agendar(c, pedido_id, motivo: str, manual: bool = False) -> str | None:
    """Grava o envio pendente na transação da requisição (c: Ctx). None se não há o que enviar agora.

    Envio manual acima do limite é recusado (429). Envio automático acima do limite fica registrado como "falhou",
    para nunca desfazer a confirmação/cancelamento do pedido.
    """
    if not configurado():
        return None
    if manual and c.q("select count(*) from envios_whatsapp where pedido_id = :p and criado_em > now() - interval '24 hours'",
                      p=pedido_id).scalar() >= settings.whatsapp_limite_reenvio_pedido:
        raise AppError(429, "limite_reenvio", "Limite de envios deste pedido nas últimas 24 h atingido. Tente amanhã.")
    no_limite = c.q("select count(*) from envios_whatsapp where criado_em > now() - interval '24 hours'"
                    ).scalar() >= settings.whatsapp_limite_dia_empresa  # RLS: só os envios desta empresa
    if no_limite and manual:
        raise AppError(429, "limite_diario", "Limite diário de mensagens de WhatsApp da empresa atingido.")
    tel = c.q("select fo.telefone from pedidos p join fornecedores fo on fo.id = p.fornecedor_id where p.id = :id",
              id=pedido_id).scalar()
    envio = c.q("insert into envios_whatsapp (empresa_id, pedido_id, motivo, telefone, criado_por, status, erro) "
                "values (:e, :p, :m, :t, :u, :s, :er) returning id",
                e=c.empresa_id, p=pedido_id, m=motivo, t=tel, u=c.usuario_id, s="falhou" if no_limite else "pendente",
                er="Limite diário de mensagens de WhatsApp da empresa atingido." if no_limite else None).scalar()
    return None if no_limite else str(envio)


def processar(empresa_id: str, envio_id: str) -> None:
    """Tarefa em segundo plano: reivindica o envio, chama a API e grava o resultado."""
    with engine.begin() as conn:
        set_tenant(conn, empresa_id)
        e = conn.execute(text("update envios_whatsapp set status = 'enviando', atualizado_em = now() "
                              "where id = :id and status = 'pendente' returning pedido_id, motivo, telefone, criado_por"),
                         {"id": envio_id}).mappings().first()
        if not e:  # já processado por outra tarefa
            return
        p = conn.execute(text("""select p.numero, p.data_entrega, p.observacao, p.motivo_cancelamento,
                                        fo.nome fornecedor_nome, em.nome empresa
                                 from pedidos p join fornecedores fo on fo.id = p.fornecedor_id
                                 join empresas em on em.id = p.empresa_id where p.id = :id"""),
                         {"id": e["pedido_id"]}).mappings().one()
        itens = conn.execute(text("""select i.quantidade, i.unidade, coalesce(pr.nome, i.texto_original, '') descricao
                                     from pedido_itens i left join produtos pr on pr.id = i.produto_id
                                     where i.pedido_id = :id order by i.posicao"""),
                             {"id": e["pedido_id"]}).mappings().all()
    tipo, payload = montar({**p, "itens": itens, "telefone": e["telefone"], "motivo": e["motivo"]})

    wamid, erro = None, None
    try:
        wamid = enviar_api(payload)["messages"][0]["id"]
    except ErroWhatsApp as err:
        erro = traduzir(err)
    except Exception as err:  # rede, resposta inesperada
        log.exception("[whatsapp] falha ao enviar")
        erro = f"Falha de comunicação com o WhatsApp: {err.__class__.__name__}"

    with engine.begin() as conn:
        set_tenant(conn, empresa_id, e["criado_por"])
        conn.execute(text("update envios_whatsapp set status = :s, tipo_mensagem = :t, wa_message_id = :w, erro = :er, "
                          "atualizado_em = now() where id = :id"),
                     {"s": "falhou" if erro else "enviado", "t": tipo, "w": wamid, "er": erro, "id": envio_id})
        conn.execute(text("insert into auditoria (empresa_id, usuario_id, acao, entidade, entidade_id, detalhes) "
                          "values (:e, :u, :a, 'pedido', :p, cast(:d as jsonb))"),
                     {"e": empresa_id, "u": e["criado_por"], "p": str(e["pedido_id"]),
                      "a": "falha_whatsapp" if erro else "enviar_whatsapp",
                      "d": json.dumps({"numero": p["numero"], "motivo": e["motivo"], "erro": erro})})
