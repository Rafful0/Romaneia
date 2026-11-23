from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import app
from app.security import criar_token
from tests.conftest import SENHA


def test_login_e_me(admin_a):
    r = admin_a.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["papel"] == "admin"


def test_login_cookie_httponly(emp_a):
    r = TestClient(app).post("/api/auth/login", json={"login": "admin@a.test", "senha": SENHA})
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie


def test_senha_errada_e_email_inexistente_mesmo_erro(emp_a):
    cli = TestClient(app)
    r1 = cli.post("/api/auth/login", json={"login": "admin@a.test", "senha": "errada"})
    r2 = cli.post("/api/auth/login", json={"login": "ninguem@a.test", "senha": "errada"})
    assert r1.status_code == r2.status_code == 401
    assert r1.json() == r2.json()


def test_sem_cookie_401():
    r = TestClient(app).get("/api/fornecedores")
    assert r.status_code == 401
    assert r.json()["erro"]["codigo"] == "nao_autenticado"


def test_token_expirado(emp_a):
    cli = TestClient(app)
    cli.cookies.set("romaneia_token", criar_token(emp_a["usuarios"]["admin"], emp_a["id"], "admin", expira_min=-1))
    r = cli.get("/api/auth/me")
    assert r.status_code == 401
    assert r.json()["erro"]["codigo"] == "sessao_expirada"


def test_token_adulterado(emp_a):
    cli = TestClient(app)
    tok = criar_token(emp_a["usuarios"]["admin"], emp_a["id"], "admin")
    cli.cookies.set("romaneia_token", tok[:-3] + ("aaa" if not tok.endswith("aaa") else "bbb"))
    assert cli.get("/api/auth/me").status_code == 401


def test_logout_limpa_cookie(admin_a):
    assert admin_a.post("/api/auth/logout").status_code == 204
    assert admin_a.get("/api/auth/me").status_code == 401


def test_empresa_no_corpo_rejeitada(admin_a, emp_b):
    r = admin_a.post("/api/fornecedores", json={"nome": "X", "telefone": "11988887777", "empresa_id": emp_b["id"]})
    assert r.status_code == 422


def test_operador_nao_inativa_nem_ve_auditoria(oper_a):
    fo = oper_a.post("/api/fornecedores", json={"nome": "F", "telefone": "11988887777"}).json()
    assert oper_a.post(f"/api/fornecedores/{fo['id']}/inativar").status_code == 403
    assert oper_a.get("/api/auditoria").status_code == 403


def test_papel_rebaixado_vale_na_hora(admin_a, emp_a, owner):
    with owner.begin() as c:
        c.execute(text("update usuarios set papel='operador' where id=:i"), {"i": emp_a["usuarios"]["admin"]})
    assert admin_a.get("/api/auditoria").status_code == 403


def test_usuario_inativado_perde_acesso(admin_a, emp_a, owner):
    with owner.begin() as c:
        c.execute(text("update usuarios set ativo=false where id=:i"), {"i": emp_a["usuarios"]["admin"]})
    assert admin_a.get("/api/auth/me").status_code == 401
