"""Usuário da empresa B não enxerga nem altera dados da A, mesmo trocando IDs na URL/corpo."""
import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError

from tests.conftest import nova_rota, novo_fornecedor, novo_pedido, novo_produto


@pytest.fixture()
def dados_a(admin_a):
    cl = novo_fornecedor(admin_a, "Fornecedor da A")
    pr = novo_produto(admin_a, "PA", "cx")
    ped = novo_pedido(admin_a, cl["id"], [{"produto_id": pr["id"], "quantidade": 1, "unidade": "cx"}]).json()
    admin_a.post(f"/api/pedidos/{ped['id']}/confirmar")
    rota = nova_rota(admin_a)
    admin_a.post(f"/api/rotas/{rota['id']}/pedidos", json={"pedido_id": ped["id"]})
    rom = admin_a.post(f"/api/rotas/{rota['id']}/romaneios").json()
    return {"fornecedor": cl, "produto": pr, "pedido": ped, "rota": rota, "romaneio": rom}


def test_listas_nao_mostram_dados_de_outra_empresa(dados_a, admin_b):
    for url in ("/api/fornecedores", "/api/produtos", "/api/pedidos", "/api/rotas", "/api/romaneios"):
        assert admin_b.get(url).json()["total"] == 0, url
    aud = admin_b.get("/api/auditoria?page_size=100").json()["items"]
    assert aud and all(x["usuario_nome"].endswith("B") for x in aud)  # só o próprio login da B
    assert len(admin_b.get("/api/usuarios").json()) == 2
    d = admin_b.get("/api/dashboard").json()
    assert d["confirmados"] == 0 and all(a["usuario_nome"].endswith("B") for a in d["atividade_recente"])


def test_ids_de_outra_empresa_dao_404(dados_a, admin_b):
    a = dados_a
    gets = [f"/api/fornecedores/{a['fornecedor']['id']}", f"/api/produtos/{a['produto']['id']}",
            f"/api/pedidos/{a['pedido']['id']}", f"/api/rotas/{a['rota']['id']}",
            f"/api/romaneios/{a['romaneio']['id']}"]
    for url in gets:
        assert admin_b.get(url).status_code == 404, url
    assert admin_b.put(f"/api/fornecedores/{a['fornecedor']['id']}", json={"nome": "hack", "telefone": "11911112222"}).status_code == 404
    assert admin_b.post(f"/api/fornecedores/{a['fornecedor']['id']}/inativar").status_code == 404
    assert admin_b.post(f"/api/pedidos/{a['pedido']['id']}/cancelar", json={"motivo": "hack"}).status_code == 404
    assert admin_b.post(f"/api/rotas/{a['rota']['id']}/romaneios").status_code == 404
    it = a["romaneio"]["itens"][0]
    r = admin_b.post(f"/api/romaneios/{a['romaneio']['id']}/itens/{it['id']}/separacao",
                     json={"separado": True, "versao": 1})
    assert r.status_code == 404


def test_nao_usa_referencias_de_outra_empresa(dados_a, admin_b):
    a = dados_a
    cl_b = novo_fornecedor(admin_b, "Fornecedor B")
    # produto da A num pedido da B
    r = novo_pedido(admin_b, cl_b["id"], [{"produto_id": a["produto"]["id"], "quantidade": 1, "unidade": "cx"}])
    assert r.status_code == 422
    # fornecedor da A num pedido da B
    pr_b = novo_produto(admin_b, "PB")
    r = novo_pedido(admin_b, a["fornecedor"]["id"], [{"produto_id": pr_b["id"], "quantidade": 1, "unidade": "cx"}])
    assert r.status_code == 422
    # pedido da A numa rota da B
    rota_b = nova_rota(admin_b)
    assert admin_b.post(f"/api/rotas/{rota_b['id']}/pedidos", json={"pedido_id": a["pedido"]["id"]}).status_code == 404


def test_dados_da_a_continuam_intactos(dados_a, admin_a, admin_b):
    test_ids_de_outra_empresa_dao_404(dados_a, admin_b)
    assert admin_a.get(f"/api/fornecedores/{dados_a['fornecedor']['id']}").json()["nome"] == "Fornecedor da A"
    assert admin_a.get(f"/api/pedidos/{dados_a['pedido']['id']}").json()["status"] == "confirmado"


def test_rls_no_banco_com_papel_da_aplicacao(dados_a, emp_a, emp_b):
    """Mesmo com SQL direto, o papel romaneia_app só vê a empresa fixada na transação."""
    eng = create_engine(os.environ["DATABASE_URL"])
    try:
        with eng.begin() as c:  # sem empresa definida: nada visível
            assert c.execute(text("select count(*) from fornecedores")).scalar() == 0
            assert c.execute(text("select count(*) from pedidos")).scalar() == 0
        with eng.begin() as c:
            c.execute(text("select set_config('app.empresa_id', :e, true)"), {"e": emp_b["id"]})
            assert c.execute(text("select count(*) from fornecedores")).scalar() == 0
            assert c.execute(text("update fornecedores set nome='x'")).rowcount == 0
        with pytest.raises(DBAPIError):  # inserir linha com empresa A estando na B
            with eng.begin() as c:
                c.execute(text("select set_config('app.empresa_id', :e, true)"), {"e": emp_b["id"]})
                c.execute(text("insert into fornecedores (empresa_id, nome, telefone) values (:a, 'intruso', '5511900000000')"), {"a": emp_a["id"]})
        with pytest.raises(DBAPIError):  # auditoria é só-acréscimo
            with eng.begin() as c:
                c.execute(text("select set_config('app.empresa_id', :e, true)"), {"e": emp_a["id"]})
                c.execute(text("delete from auditoria"))
        with eng.begin() as c:
            assert c.execute(text("select rolbypassrls or rolsuper from pg_roles where rolname = current_user")
                             ).scalar() is False
    finally:
        eng.dispose()


def test_fk_composta_impede_referencia_cruzada_mesmo_como_dono(dados_a, emp_b, owner):
    """Mesmo o superusuário (que ignora RLS) não consegue ligar pedido da B a fornecedor da A."""
    with pytest.raises(DBAPIError):
        with owner.begin() as c:
            c.execute(text("insert into pedidos (empresa_id, fornecedor_id, data_entrega, criado_por) "
                           "values (:b, :cl, '2026-12-01', :u)"),
                      {"b": emp_b["id"], "cl": dados_a["fornecedor"]["id"], "u": emp_b["usuarios"]["admin"]})
