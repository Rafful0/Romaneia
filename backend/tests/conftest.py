"""Testes rodam contra um PostgreSQL real (o mesmo do docker compose), num banco separado romaneia_test.

TEST_PG_ADMIN_URL: URL do superusuário apontando para qualquer banco (padrão: o do docker compose).
"""
import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ADMIN = make_url(os.environ.get("TEST_PG_ADMIN_URL", "postgresql+psycopg://romaneia:romaneia_dev@localhost:5432/postgres"))
DB = "romaneia_test"
APP_PW = "app_test_pw"
os.environ["MIGRATION_DATABASE_URL"] = ADMIN.set(database=DB).render_as_string(hide_password=False)
os.environ["APP_DB_PASSWORD"] = APP_PW
os.environ["DATABASE_URL"] = ADMIN.set(database=DB, username="romaneia_app", password=APP_PW).render_as_string(
    hide_password=False)
os.environ["JWT_SECRET"] = "segredo-de-teste-com-mais-de-32-caracteres!"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"

SENHA = "senha-teste-123"


@pytest.fixture(scope="session", autouse=True)
def banco():
    eng = create_engine(ADMIN, isolation_level="AUTOCOMMIT")
    with eng.connect() as c:
        c.execute(text(f"drop database if exists {DB} with (force)"))
        c.execute(text(f"create database {DB}"))
    eng.dispose()
    from alembic import command
    from alembic.config import Config
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "migrations"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture()
def owner():
    eng = create_engine(os.environ["MIGRATION_DATABASE_URL"])
    yield eng
    eng.dispose()


@pytest.fixture(autouse=True)
def limpar(owner):
    yield
    with owner.begin() as c:
        c.execute(text("truncate empresas, usuarios, clientes, produtos, produto_apelidos, rotas, pedidos, "
                       "pedido_itens, romaneios, romaneio_pedidos, romaneio_itens, romaneio_item_origens, "
                       "auditoria cascade"))


def _criar_empresa(owner, sufixo: str) -> dict:
    from app.security import hash_senha
    h = hash_senha(SENHA)
    with owner.begin() as c:
        emp = c.execute(text("insert into empresas (nome) values (:n) returning id"), {"n": f"Empresa {sufixo}"}).scalar()
        ids = {}
        for papel in ("admin", "operador"):
            ids[papel] = c.execute(text(
                "insert into usuarios (empresa_id, nome, email, senha_hash, papel) values (:e,:n,:m,:h,:p) returning id"),
                {"e": emp, "n": f"{papel} {sufixo}", "m": f"{papel}@{sufixo.lower()}.test", "h": h, "p": papel}).scalar()
    return {"id": str(emp), "usuarios": {k: str(v) for k, v in ids.items()}, "sufixo": sufixo.lower()}


def logar(email: str):
    from fastapi.testclient import TestClient
    from app.main import app
    cli = TestClient(app)
    r = cli.post("/api/auth/login", json={"email": email, "senha": SENHA})
    assert r.status_code == 200, r.text
    return cli


@pytest.fixture()
def emp_a(owner):
    return _criar_empresa(owner, "A")


@pytest.fixture()
def emp_b(owner):
    return _criar_empresa(owner, "B")


@pytest.fixture()
def admin_a(emp_a):
    return logar("admin@a.test")


@pytest.fixture()
def oper_a(emp_a):
    return logar("operador@a.test")


@pytest.fixture()
def admin_b(emp_b):
    return logar("admin@b.test")


# ---- helpers de cenário ----
def novo_cliente(cli, nome="Cliente X"):
    r = cli.post("/api/clientes", json={"nome": nome})
    assert r.status_code == 201, r.text
    return r.json()


def novo_produto(cli, codigo="P1", unidade="cx", nome=None):
    r = cli.post("/api/produtos", json={"codigo": codigo, "nome": nome or f"Produto {codigo}", "unidade": unidade})
    assert r.status_code == 201, r.text
    return r.json()


def novo_pedido(cli, cliente_id, itens, data="2026-12-01"):
    return cli.post("/api/pedidos", json={"cliente_id": cliente_id, "data_entrega": data, "itens": itens})


def nova_rota(cli, nome="Rota 1", data="2026-12-01"):
    r = cli.post("/api/rotas", json={"nome": nome, "data": data})
    assert r.status_code == 201, r.text
    return r.json()
