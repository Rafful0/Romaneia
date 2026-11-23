import pytest

from tests.conftest import novo_fornecedor, novo_pedido, novo_produto


@pytest.fixture()
def base(admin_a):
    return admin_a, novo_fornecedor(admin_a)["id"], novo_produto(admin_a, "CX1", "cx")["id"]


@pytest.mark.parametrize("q,u", [(0, "cx"), (-2, "cx"), ("1.5", "cx"), ("1.2345", "kg"), ("abc", "kg"), (1, "ton")])
def test_quantidade_invalida_nao_e_corrigida(base, q, u):
    cli, cl, p = base
    r = novo_pedido(cli, cl, [{"produto_id": p, "quantidade": q, "unidade": u}])
    assert r.status_code == 422, r.text
    assert cli.get("/api/pedidos").json()["total"] == 0  # nada gravado


def test_quantidade_gravada_exata(base):
    cli, cl, p = base
    r = novo_pedido(cli, cl, [{"produto_id": p, "quantidade": "3", "unidade": "cx"},
                              {"produto_id": p, "quantidade": "1.25", "unidade": "kg"}])
    assert r.status_code == 201
    assert [i["quantidade"] for i in r.json()["itens"]] == ["3.000", "1.250"]


def test_item_nao_identificado_bloqueia_confirmacao(base):
    cli, cl, p = base
    ped = novo_pedido(cli, cl, [{"texto_original": "aquele queijo", "quantidade": 2, "unidade": "kg"}]).json()
    r = cli.post(f"/api/pedidos/{ped['id']}/confirmar")
    assert r.status_code == 422 and r.json()["erro"]["codigo"] == "item_nao_identificado"
    r = cli.put(f"/api/pedidos/{ped['id']}", json={"fornecedor_id": cl, "data_entrega": "2026-12-01",
                                                  "itens": [{"produto_id": p, "quantidade": 2, "unidade": "cx"}]})
    assert r.status_code == 200 and r.json()["revisao"] == 2
    assert cli.post(f"/api/pedidos/{ped['id']}/confirmar").json()["status"] == "confirmado"


def test_item_sem_produto_e_sem_texto_rejeitado(base):
    cli, cl, _ = base
    assert novo_pedido(cli, cl, [{"quantidade": 1, "unidade": "kg"}]).status_code == 422


def test_pedido_confirmado_nao_aceita_item_nao_identificado(base):
    cli, cl, p = base
    ped = novo_pedido(cli, cl, [{"produto_id": p, "quantidade": 1, "unidade": "cx"}]).json()
    cli.post(f"/api/pedidos/{ped['id']}/confirmar")
    r = cli.put(f"/api/pedidos/{ped['id']}", json={"fornecedor_id": cl, "data_entrega": "2026-12-01",
                                                  "itens": [{"texto_original": "x", "quantidade": 1, "unidade": "kg"}]})
    assert r.status_code == 422


def test_cancelar_exige_justificativa(base):
    cli, cl, p = base
    ped = novo_pedido(cli, cl, [{"produto_id": p, "quantidade": 1, "unidade": "cx"}]).json()
    assert cli.post(f"/api/pedidos/{ped['id']}/cancelar", json={"motivo": "  "}).status_code == 422
    assert cli.post(f"/api/pedidos/{ped['id']}/cancelar", json={}).status_code == 422
    r = cli.post(f"/api/pedidos/{ped['id']}/cancelar", json={"motivo": "Cliente desistiu"})
    assert r.json()["status"] == "cancelado" and r.json()["motivo_cancelamento"] == "Cliente desistiu"


def test_transicoes_invalidas_via_api(base):
    cli, cl, p = base
    ped = novo_pedido(cli, cl, [{"produto_id": p, "quantidade": 1, "unidade": "cx"}]).json()
    cli.post(f"/api/pedidos/{ped['id']}/cancelar", json={"motivo": "teste"})
    r = cli.post(f"/api/pedidos/{ped['id']}/confirmar")
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "transicao_invalida"
    assert cli.put(f"/api/pedidos/{ped['id']}", json={"fornecedor_id": cl, "data_entrega": "2026-12-01", "itens": [
        {"produto_id": p, "quantidade": 1, "unidade": "cx"}]}).status_code == 409


def test_trigger_do_banco_bloqueia_transicao_mesmo_fora_da_api(base, owner):
    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError
    cli, cl, p = base
    ped = novo_pedido(cli, cl, [{"produto_id": p, "quantidade": 1, "unidade": "cx"}]).json()
    with pytest.raises(DBAPIError):
        with owner.begin() as c:
            c.execute(text("update pedidos set status='separado' where id=:i"), {"i": ped["id"]})


def test_fornecedor_inativo_nao_recebe_pedido(base):
    cli, cl, p = base
    cli.post(f"/api/fornecedores/{cl}/inativar")
    r = novo_pedido(cli, cl, [{"produto_id": p, "quantidade": 1, "unidade": "cx"}])
    assert r.status_code == 422 and r.json()["erro"]["codigo"] == "fornecedor_inativo"


def test_filtros_lista(base):
    cli, cl, p = base
    novo_pedido(cli, cl, [{"produto_id": p, "quantidade": 1, "unidade": "cx"}], data="2026-12-01")
    b = novo_pedido(cli, cl, [{"produto_id": p, "quantidade": 1, "unidade": "cx"}], data="2026-12-05").json()
    cli.post(f"/api/pedidos/{b['id']}/confirmar")
    assert cli.get("/api/pedidos?status=confirmado").json()["total"] == 1
    assert cli.get("/api/pedidos?de=2026-12-02").json()["total"] == 1
    assert cli.get("/api/pedidos?sem_rota=true").json()["total"] == 2
    assert cli.get("/api/pedidos?status=xpto").status_code == 422


def test_produto_codigo_unico_e_apelidos(admin_a):
    novo_produto(admin_a, "ABC")
    r = admin_a.post("/api/produtos", json={"codigo": "abc", "nome": "Outro", "unidade": "kg"})
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "codigo_duplicado"
    p = admin_a.post("/api/produtos", json={"codigo": "Q1", "nome": "Queijo", "unidade": "kg",
                                            "apelidos": ["mussarela"]}).json()
    assert p["apelidos"] == ["mussarela"]
    assert admin_a.get("/api/produtos?busca=mussa").json()["total"] == 1
    r = admin_a.post("/api/produtos", json={"codigo": "Q2", "nome": "Q", "unidade": "kg", "apelidos": ["Mussarela"]})
    assert r.status_code == 409


def test_paginacao(admin_a):
    for i in range(5):
        novo_fornecedor(admin_a, f"C{i}")
    r = admin_a.get("/api/fornecedores?page=2&page_size=2").json()
    assert r["total"] == 5 and len(r["items"]) == 2 and r["page"] == 2


def test_auditoria_registra_operacoes(base):
    cli, cl, p = base
    ped = novo_pedido(cli, cl, [{"produto_id": p, "quantidade": 1, "unidade": "cx"}]).json()
    cli.post(f"/api/pedidos/{ped['id']}/confirmar")
    acoes = [a["acao"] + ":" + a["entidade"] for a in cli.get("/api/auditoria?page_size=100").json()["items"]]
    assert {"criar:pedido", "confirmar:pedido", "criar:fornecedor", "criar:produto", "login:usuario"} <= set(acoes)
