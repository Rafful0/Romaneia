import hashlib
import hmac
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import text

from app.config import settings
from app.db import engine
from app.deps import Ctx, ctx
from app.errors import AppError
from app.whatsapp import configurado

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])
STATUS_META = {"sent": "enviado", "delivered": "entregue", "read": "lido", "failed": "falhou"}


@router.get("/status")
def status(_: Ctx = Depends(ctx)):
    return {"automatico": configurado(), "modelo": bool(settings.whatsapp_modelo)}


@router.get("/webhook")
def verificar(request: Request):
    """Handshake de configuração do webhook no painel da Meta."""
    q = request.query_params
    if (settings.whatsapp_verify_token and q.get("hub.mode") == "subscribe"
            and hmac.compare_digest(q.get("hub.verify_token", ""), settings.whatsapp_verify_token)):
        return PlainTextResponse(q.get("hub.challenge", ""))
    raise AppError(403, "proibido", "Token de verificação inválido")


@router.post("/webhook")
async def receber(request: Request):
    """Status das mensagens (enviada/entregue/lida/falhou). Só aceita corpo assinado pela Meta."""
    corpo = await request.body()
    esperado = "sha256=" + hmac.new(settings.whatsapp_app_secret.encode(), corpo, hashlib.sha256).hexdigest()
    if not settings.whatsapp_app_secret or not hmac.compare_digest(request.headers.get("X-Hub-Signature-256", ""), esperado):
        raise AppError(403, "assinatura_invalida", "Assinatura do webhook inválida")
    dados = json.loads(corpo or b"{}")
    with engine.begin() as conn:
        for entrada in dados.get("entry", []):
            for mudanca in entrada.get("changes", []):
                for st in mudanca.get("value", {}).get("statuses", []):
                    novo = STATUS_META.get(st.get("status"))
                    if not novo or not st.get("id"):
                        continue
                    erro = "; ".join(f"{e.get('code')}: {e.get('title') or e.get('message')}" for e in st.get("errors", [])) or None
                    conn.execute(text("select whatsapp_atualizar_status(:w, :s, :e)"), {"w": st["id"], "s": novo, "e": erro})
    return {"ok": True}
