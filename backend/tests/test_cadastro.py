from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.config import settings
from app.main import app
from app.routers import auth as auth_mod
from tests.conftest import SENHA

SENHA_NOVA = "senha-forte-123"


def iniciar(cli, metodo="email", destino="dona@padaria.test", **extra):
    corpo = {"metodo": metodo, "destino": destino, "nome": "Dona Maria", "empresa": "Padaria da Maria",
             "senha": SENHA_NOVA, **extra}
    return cli.post("/api/auth/cadastro/iniciar", json=corpo)


def test_cadastro_por_email_cria_empresa_e_admin():
    cli = TestClient(app)
    r = iniciar(cli)
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["destino"] == "dona@padaria.test" and len(p["codigo_dev"]) == 6
    r = cli.post("/api/auth/cadastro/confirmar", json={"cadastro_id": p["cadastro_id"], "codigo": p["codigo_dev"]})
    assert r.status_code == 201, r.text
    assert r.json() == {**r.json(), "nome": "Dona Maria", "papel": "admin", "empresa": "Padaria da Maria"}
    assert cli.get("/api/auth/me").json()["empresa"] == "Padaria da Maria"  # já entra logado
    assert cli.get("/api/fornecedores").json()["total"] == 0  # empresa nova, vazia
    acoes = {a["acao"] for a in cli.get("/api/auditoria").json()["items"]}
    assert "criar_conta" in acoes
    # depois entra pela tela de login normalmente
    novo = TestClient(app)
    assert novo.post("/api/auth/login", json={"login": "Dona@Padaria.test", "senha": SENHA_NOVA}).status_code == 200


def test_cadastro_por_celular_e_login_com_numero_formatado():
    cli = TestClient(app)
    p = iniciar(cli, metodo="telefone", destino="(11) 98888-7777").json()
    assert p["destino"] == "5511988887777"
    assert cli.post("/api/auth/cadastro/confirmar",
                    json={"cadastro_id": p["cadastro_id"], "codigo": p["codigo_dev"]}).status_code == 201
    for login in ("11988887777", "+55 11 98888-7777", "(11) 98888-7777"):
        r = TestClient(app).post("/api/auth/login", json={"login": login, "senha": SENHA_NOVA})
        assert r.status_code == 200, login
    assert TestClient(app).post("/api/auth/login", json={"login": "11988887777", "senha": "errada"}).status_code == 401


@pytest.mark.parametrize("metodo,destino", [("email", "sem-arroba"), ("telefone", "1234"), ("telefone", "+1 415 555 0100")])
def test_destino_invalido(metodo, destino):
    r = iniciar(TestClient(app), metodo=metodo, destino=destino)
    assert r.status_code == 422 and r.json()["erro"]["codigo"] == "destino_invalido"


def test_senha_curta_e_campo_extra_recusados():
    cli = TestClient(app)
    assert iniciar(cli, senha="1234567").status_code == 422
    assert iniciar(cli, papel="admin").status_code == 422  # nada além do esperado entra pelo corpo


def test_email_ou_celular_ja_cadastrado(emp_a):
    r = iniciar(TestClient(app), destino="ADMIN@a.test")
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "conta_existente"


def test_codigo_errado_conta_tentativas_e_bloqueia():
    cli = TestClient(app)
    p = iniciar(cli).json()
    errado = "000000" if p["codigo_dev"] != "000000" else "111111"
    for restantes in (4, 3, 2, 1, 0):
        r = cli.post("/api/auth/cadastro/confirmar", json={"cadastro_id": p["cadastro_id"], "codigo": errado})
        assert r.status_code == 422 and r.json()["erro"]["detalhes"]["restantes"] == restantes
    r = cli.post("/api/auth/cadastro/confirmar", json={"cadastro_id": p["cadastro_id"], "codigo": p["codigo_dev"]})
    assert r.status_code == 410  # bloqueado mesmo com o código certo
    r = cli.post("/api/auth/cadastro/confirmar", json={"cadastro_id": p["cadastro_id"], "codigo": p["codigo_dev"]})
    assert r.status_code == 404  # pendência apagada


def test_codigo_expirado(owner):
    cli = TestClient(app)
    p = iniciar(cli).json()
    with owner.begin() as c:
        c.execute(text("update cadastros_pendentes set expira_em = now() - interval '1 minute'"))
    r = cli.post("/api/auth/cadastro/confirmar", json={"cadastro_id": p["cadastro_id"], "codigo": p["codigo_dev"]})
    assert r.status_code == 410


def test_novo_pedido_de_codigo_invalida_o_anterior():
    cli = TestClient(app)
    p1 = iniciar(cli).json()
    p2 = iniciar(cli).json()
    assert cli.post("/api/auth/cadastro/confirmar",
                    json={"cadastro_id": p1["cadastro_id"], "codigo": p1["codigo_dev"]}).status_code == 404
    assert cli.post("/api/auth/cadastro/confirmar",
                    json={"cadastro_id": p2["cadastro_id"], "codigo": p2["codigo_dev"]}).status_code == 201


def test_codigo_nao_fica_em_texto_puro(owner):
    p = iniciar(TestClient(app)).json()
    with owner.begin() as c:
        linha = c.execute(text("select codigo_hash, senha_hash from cadastros_pendentes")).mappings().one()
    assert p["codigo_dev"] not in linha["codigo_hash"] and SENHA_NOVA not in linha["senha_hash"]


def test_empresas_criadas_pelo_cadastro_sao_isoladas(admin_a):
    admin_a.post("/api/fornecedores", json={"nome": "Fornecedor da A", "telefone": "11988887777"})
    cli = TestClient(app)
    p = iniciar(cli).json()
    cli.post("/api/auth/cadastro/confirmar", json={"cadastro_id": p["cadastro_id"], "codigo": p["codigo_dev"]})
    assert cli.get("/api/fornecedores").json()["total"] == 0
    assert admin_a.get("/api/fornecedores").json()["total"] == 1


# ---------- Google (troca de código simulada) ----------
@pytest.fixture()
def google(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "cid-teste")
    monkeypatch.setattr(settings, "google_client_secret", "segredo-teste")
    estado = {"claims": {}}

    def falso(code, verifier):
        assert code == "codigo-do-google" and verifier
        return estado["claims"]

    monkeypatch.setattr(auth_mod, "trocar_codigo_google", falso)
    return estado


def ir_ao_google(cli):
    r = cli.get("/api/auth/google/iniciar", follow_redirects=False)
    assert r.status_code == 302
    q = parse_qs(urlparse(r.headers["location"]).query)
    assert q["client_id"] == ["cid-teste"] and q["code_challenge_method"] == ["S256"]
    assert q["redirect_uri"] == [f"{settings.app_url}/api/auth/google/retorno"]
    return q["state"][0], q["nonce"][0]


def claims(nonce, email="nova@google.test", sub="g-123", **extra):
    return {"iss": "https://accounts.google.com", "aud": "cid-teste", "sub": sub, "email": email,
            "email_verified": True, "name": "Nova Pessoa", "nonce": nonce,
            "exp": datetime.now(timezone.utc).timestamp() + 300, **extra}


def voltar(cli, state):
    return cli.get(f"/api/auth/google/retorno?code=codigo-do-google&state={state}", follow_redirects=False)


def test_provedores_reflete_configuracao(google):
    assert TestClient(app).get("/api/auth/provedores").json()["google"] is True


def test_google_desativado_sem_credenciais():
    assert TestClient(app).get("/api/auth/provedores").json()["google"] is False
    assert TestClient(app).get("/api/auth/google/iniciar", follow_redirects=False).status_code == 404


def test_google_conta_nova_pede_nome_da_empresa(google):
    cli = TestClient(app)
    state, nonce = ir_ao_google(cli)
    google["claims"] = claims(nonce)
    r = voltar(cli, state)
    assert r.status_code == 302 and r.headers["location"] == f"{settings.app_url}/cadastro/google"
    assert cli.get("/api/auth/cadastro/google").json() == {"nome": "Nova Pessoa", "email": "nova@google.test"}
    r = cli.post("/api/auth/cadastro/google", json={"empresa": "Restaurante Novo"})
    assert r.status_code == 201 and r.json()["empresa"] == "Restaurante Novo" and r.json()["papel"] == "admin"
    assert cli.get("/api/auth/me").status_code == 200
    # próxima vez com o mesmo Google: entra direto
    cli2 = TestClient(app)
    state, nonce = ir_ao_google(cli2)
    google["claims"] = claims(nonce)
    r = voltar(cli2, state)
    assert r.headers["location"] == f"{settings.app_url}/"
    assert cli2.get("/api/auth/me").json()["empresa"] == "Restaurante Novo"


def test_google_nao_vincula_conta_de_senha_existente(google, emp_a, owner):
    """Evita pré-sequestro: quem criou conta de senha com o e-mail de outra pessoa não ganha o Google dela."""
    cli = TestClient(app)
    state, nonce = ir_ao_google(cli)
    google["claims"] = claims(nonce, email="admin@a.test", sub="g-admin-a")
    r = voltar(cli, state)
    assert r.headers["location"] == f"{settings.app_url}/login?erro=google_conta_existente"
    assert cli.get("/api/auth/me").status_code == 401
    with owner.begin() as c:
        assert c.execute(text("select google_sub from usuarios where email = 'admin@a.test'")).scalar() is None
    assert TestClient(app).post("/api/auth/login", json={"login": "admin@a.test", "senha": SENHA}).status_code == 200


def test_cadastro_por_codigo_recusado_fora_do_modo_dev(monkeypatch, emp_a):
    monkeypatch.setattr(settings, "verificacao_modo", "desativado")
    r = iniciar(TestClient(app))
    assert r.status_code == 501 and "codigo_dev" not in r.text
    # conta existente recebe a mesma resposta: com o cadastro desligado não dá para descobrir quem tem conta
    assert iniciar(TestClient(app), destino="admin@a.test").status_code == 501


@pytest.mark.parametrize("estrago", [
    {"nonce": "outro"}, {"aud": "outro-client"}, {"iss": "https://evil.test"}, {"email_verified": False},
    {"exp": 0},
])
def test_google_recusa_id_token_invalido(google, estrago):
    cli = TestClient(app)
    state, nonce = ir_ao_google(cli)
    google["claims"] = claims(nonce) | estrago
    r = voltar(cli, state)
    assert r.headers["location"] == f"{settings.app_url}/login?erro=google"
    assert cli.get("/api/auth/me").status_code == 401


def test_google_recusa_state_trocado_e_sem_cookie(google):
    cli = TestClient(app)
    state, nonce = ir_ao_google(cli)
    google["claims"] = claims(nonce)
    assert voltar(cli, "state-forjado").headers["location"].endswith("/login?erro=google")
    assert voltar(TestClient(app), state).headers["location"].endswith("/login?erro=google")  # outro navegador


def test_concluir_google_sem_cookie_falha():
    r = TestClient(app).post("/api/auth/cadastro/google", json={"empresa": "X"})
    assert r.status_code == 404


# ---------- e-mail de verdade (SMTP simulado) ----------
@pytest.fixture()
def smtp(monkeypatch):
    import smtplib
    import ssl
    enviados, estado = [], {"falhar": False}

    class SMTPFalso:
        def __init__(self, host, porta, timeout):
            assert (host, porta) == ("smtp.teste", 587)
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def starttls(self, context=None):
            estado["tls"] = context is not None and context.verify_mode == ssl.CERT_REQUIRED and context.check_hostname
        def login(self, u, s): estado["login"] = (u, s)
        def send_message(self, m):
            if estado["falhar"]:
                raise smtplib.SMTPException("caiu")
            enviados.append(m)

    monkeypatch.setattr(smtplib, "SMTP", SMTPFalso)
    for k, v in {"verificacao_modo": "real", "smtp_host": "smtp.teste", "smtp_usuario": "romaneia@teste",
                 "smtp_senha": "senha-app"}.items():
        monkeypatch.setattr(settings, k, v)
    return {"enviados": enviados, "estado": estado}


def test_modo_real_envia_codigo_por_email_e_nao_devolve_na_resposta(smtp):
    cli = TestClient(app)
    r = iniciar(cli)
    assert r.status_code == 201 and "codigo_dev" not in r.json()
    (m,) = smtp["enviados"]
    assert m["To"] == "dona@padaria.test" and m["From"] == "romaneia@teste"
    assert smtp["estado"]["tls"] and smtp["estado"]["login"] == ("romaneia@teste", "senha-app")
    codigo = m["Subject"].split()[0]
    assert len(codigo) == 6 and codigo in m.get_content()
    r = cli.post("/api/auth/cadastro/confirmar", json={"cadastro_id": r.json()["cadastro_id"], "codigo": codigo})
    assert r.status_code == 201


def test_modo_real_sem_sms_recusa_celular_antes_de_consultar(smtp, emp_a):
    assert TestClient(app).get("/api/auth/provedores").json()["cadastro_celular"] is False
    r = iniciar(TestClient(app), metodo="telefone", destino="(11) 98888-7777")
    assert r.status_code == 501 and smtp["enviados"] == []


def test_falha_no_smtp_vira_erro_claro(smtp):
    smtp["estado"]["falhar"] = True
    r = iniciar(TestClient(app))
    assert r.status_code == 502 and r.json()["erro"]["codigo"] == "envio_falhou"


def test_modo_real_sem_smtp_configurado_recusa(monkeypatch):
    monkeypatch.setattr(settings, "verificacao_modo", "real")
    assert TestClient(app).get("/api/auth/provedores").json()["cadastro_email"] is False
    assert iniciar(TestClient(app)).status_code == 501
