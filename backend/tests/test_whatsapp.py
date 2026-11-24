import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from app import whatsapp as wa
from app.config import settings
from app.main import app
from tests.conftest import novo_fornecedor, novo_pedido, novo_produto


@pytest.fixture()
def meta(monkeypatch):
    """Simula a Cloud API: guarda os payloads e devolve um wamid (ou o erro configurado)."""
    monkeypatch.setattr(settings, "whatsapp_token", "token-teste")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "123456")
    estado = {"enviados": [], "erro": None}

    def falso(payload):
        if estado["erro"]:
            raise estado["erro"]
        estado["enviados"].append(payload)
        return {"messages": [{"id": f"wamid.{len(estado['enviados'])}"}]}

    monkeypatch.setattr(wa, "enviar_api", falso)
    return estado


@pytest.fixture()
def pedido(admin_a):
    fo = novo_fornecedor(admin_a, "Moinho Central")
    far = novo_produto(admin_a, "FAR", "fd", "Farinha")["id"]
    fer = novo_produto(admin_a, "FER", "kg", "Fermento")["id"]
    p = novo_pedido(admin_a, fo["id"], [{"produto_id": far, "quantidade": 10, "unidade": "fd"},
                                        {"produto_id": fer, "quantidade": "2.5", "unidade": "kg"},
                                        {"texto_original": "aquele açúcar", "quantidade": 1, "unidade": "kg"}]).json()
    return {"cli": admin_a, "id": p["id"], "numero": p["numero"], "fornecedor": fo}


def identificar_e_confirmar(pedido):
    """O item sem produto impede a confirmação; troca por um produto e confirma."""
    cli = pedido["cli"]
    acu = novo_produto(cli, "ACU", "kg", "Açúcar")["id"]
    itens = [{"produto_id": i["produto_id"] or acu, "texto_original": i["texto_original"], "quantidade": i["quantidade"],
              "unidade": i["unidade"]} for i in cli.get(f"/api/pedidos/{pedido['id']}").json()["itens"]]
    cli.put(f"/api/pedidos/{pedido['id']}", json={"fornecedor_id": pedido["fornecedor"]["id"], "data_entrega": "2026-12-01",
                                                  "observacao": "Entregar cedo", "itens": itens})
    return cli.post(f"/api/pedidos/{pedido['id']}/confirmar")


def test_sem_configuracao_nao_envia_nada(pedido):
    r = identificar_e_confirmar(pedido)
    assert r.status_code == 200 and r.json()["envios_whatsapp"] == []
    assert pedido["cli"].get("/api/whatsapp/status").json() == {"automatico": False, "modelo": False}
    assert pedido["cli"].post(f"/api/pedidos/{pedido['id']}/whatsapp").status_code == 409


def test_confirmar_envia_texto_ao_fornecedor(meta, pedido):
    r = identificar_e_confirmar(pedido)
    assert r.status_code == 200
    (payload,) = meta["enviados"]
    assert payload["to"] == pedido["fornecedor"]["telefone"] and payload["type"] == "text"
    corpo = payload["text"]["body"]
    assert f"Olá, Moinho Central! Segue o pedido #{pedido['numero']} da Empresa A." in corpo
    assert "Entrega: 01/12/2026" in corpo and "Observação: Entregar cedo" in corpo
    assert "- 10 fd Farinha" in corpo and "- 2,5 kg Fermento" in corpo and "- 1 kg Açúcar" in corpo
    env = pedido["cli"].get(f"/api/pedidos/{pedido['id']}").json()["envios_whatsapp"]
    assert [(e["motivo"], e["status"], e["tipo_mensagem"]) for e in env] == [("pedido", "enviado", "texto")]
    acoes = {a["acao"] for a in pedido["cli"].get("/api/auditoria?page_size=100").json()["items"]}
    assert "enviar_whatsapp" in acoes


def test_modelo_aprovado_vai_com_parametros_sem_quebra_de_linha(meta, pedido, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_modelo", "pedido_fornecedor")
    identificar_e_confirmar(pedido)
    t = meta["enviados"][0]["template"]
    assert t["name"] == "pedido_fornecedor" and t["language"]["code"] == "pt_BR"
    params = [p["text"] for p in t["components"][0]["parameters"]]
    assert params[:4] == ["Moinho Central", str(pedido["numero"]), "Empresa A", "01/12/2026"]
    assert params[4] == "10 fd Farinha; 2,5 kg Fermento; 1 kg Açúcar"
    assert all("\n" not in p for p in params)


def test_falha_da_meta_nao_desfaz_pedido_e_mostra_motivo(meta, pedido):
    meta["erro"] = wa.ErroWhatsApp(131047, "Re-engagement message")
    r = identificar_e_confirmar(pedido)
    assert r.status_code == 200
    det = pedido["cli"].get(f"/api/pedidos/{pedido['id']}").json()
    assert det["status"] == "confirmado"
    (env,) = det["envios_whatsapp"]
    assert env["status"] == "falhou" and "janela de 24 h" in env["erro"]
    # reenviar depois que o fornecedor escreveu
    meta["erro"] = None
    r = pedido["cli"].post(f"/api/pedidos/{pedido['id']}/whatsapp")
    assert r.status_code == 202
    env = pedido["cli"].get(f"/api/pedidos/{pedido['id']}").json()["envios_whatsapp"]
    assert [e["status"] for e in env] == ["enviado", "falhou"]


def test_reenviar_exige_pedido_confirmado(meta, pedido):
    r = pedido["cli"].post(f"/api/pedidos/{pedido['id']}/whatsapp")
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "pedido_pendente"


def test_cancelar_avisa_fornecedor_que_recebeu(meta, pedido):
    identificar_e_confirmar(pedido)
    pedido["cli"].post(f"/api/pedidos/{pedido['id']}/cancelar", json={"motivo": "Compramos em outro lugar"})
    assert len(meta["enviados"]) == 2
    corpo = meta["enviados"][1]["text"]["body"]
    assert corpo == (f"Olá, Moinho Central! O pedido #{pedido['numero']} da Empresa A foi cancelado.\n"
                     "Motivo: Compramos em outro lugar")


def test_cancelar_pedido_nunca_enviado_nao_manda_aviso(meta, pedido):
    pedido["cli"].post(f"/api/pedidos/{pedido['id']}/cancelar", json={"motivo": "Desistimos"})
    assert meta["enviados"] == []


def test_outra_empresa_nao_reenvia(meta, pedido, admin_b):
    identificar_e_confirmar(pedido)
    assert admin_b.post(f"/api/pedidos/{pedido['id']}/whatsapp").status_code == 404


@pytest.mark.parametrize("codigo,trecho", [(131030, "lista de destinatários"), (190, "Token"), (999, "(999)")])
def test_traducao_de_erros(codigo, trecho):
    assert trecho in wa.traduzir(wa.ErroWhatsApp(codigo, "x"))


# ---------- webhook ----------
def assinar(corpo: bytes, segredo="segredo-app") -> str:
    return "sha256=" + hmac.new(segredo.encode(), corpo, hashlib.sha256).hexdigest()


def status_meta(wamid, status):
    return json.dumps({"entry": [{"changes": [{"value": {"statuses": [{"id": wamid, "status": status}]}}]}]}).encode()


def test_webhook_verificacao(monkeypatch):
    cli = TestClient(app)
    q = "hub.mode=subscribe&hub.challenge=abc123&hub.verify_token="
    assert cli.get(f"/api/whatsapp/webhook?{q}qualquer").status_code == 403  # sem token configurado: fecha
    monkeypatch.setattr(settings, "whatsapp_verify_token", "meu-token")
    assert cli.get(f"/api/whatsapp/webhook?{q}errado").status_code == 403
    r = cli.get(f"/api/whatsapp/webhook?{q}meu-token")
    assert r.status_code == 200 and r.text == "abc123"


def test_webhook_atualiza_status_sem_regredir(meta, pedido, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "segredo-app")
    identificar_e_confirmar(pedido)
    cli = TestClient(app)
    for st in ("delivered", "read", "delivered"):  # "entregue" atrasado não volta o status
        corpo = status_meta("wamid.1", st)
        assert cli.post("/api/whatsapp/webhook", content=corpo, headers={"X-Hub-Signature-256": assinar(corpo)}).status_code == 200
    env = pedido["cli"].get(f"/api/pedidos/{pedido['id']}").json()["envios_whatsapp"]
    assert env[0]["status"] == "lido"


def test_webhook_recusa_assinatura_invalida(meta, pedido, monkeypatch):
    monkeypatch.setattr(settings, "whatsapp_app_secret", "segredo-app")
    identificar_e_confirmar(pedido)
    corpo = status_meta("wamid.1", "read")
    cli = TestClient(app)
    assert cli.post("/api/whatsapp/webhook", content=corpo, headers={"X-Hub-Signature-256": assinar(corpo, "outro")}).status_code == 403
    assert cli.post("/api/whatsapp/webhook", content=corpo).status_code == 403
    assert pedido["cli"].get(f"/api/pedidos/{pedido['id']}").json()["envios_whatsapp"][0]["status"] == "enviado"


def test_enviar_api_monta_requisicao_e_le_erro_da_meta(monkeypatch):
    import httpx
    monkeypatch.setattr(settings, "whatsapp_token", "tok")
    monkeypatch.setattr(settings, "whatsapp_phone_number_id", "999")
    chamadas = []

    def post(url, json, timeout, headers):
        chamadas.append((url, headers["Authorization"]))
        if json.get("to") == "erro":
            return httpx.Response(400, json={"error": {"code": 131030, "message": "Recipient not in allowed list"}})
        return httpx.Response(200, json={"messages": [{"id": "wamid.X"}]})

    monkeypatch.setattr(wa.httpx, "post", post)
    assert wa.enviar_api({"to": "5511"})["messages"][0]["id"] == "wamid.X"
    assert chamadas[0] == (f"https://graph.facebook.com/{settings.whatsapp_api_versao}/999/messages", "Bearer tok")
    with pytest.raises(wa.ErroWhatsApp) as e:
        wa.enviar_api({"to": "erro"})
    assert e.value.codigo == 131030
