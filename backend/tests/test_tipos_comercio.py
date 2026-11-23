from tests.conftest import novo_cliente, novo_pedido, novo_produto


def novo_tipo(cli, nome="Padaria"):
    r = cli.post("/api/tipos-comercio", json={"nome": nome})
    assert r.status_code == 201, r.text
    return r.json()


def test_crud_e_nome_unico(admin_a, oper_a):
    t = novo_tipo(admin_a)
    assert t["ativo"] and t["total_clientes"] == 0
    r = admin_a.post("/api/tipos-comercio", json={"nome": "  padaria "})
    assert r.status_code == 409 and r.json()["erro"]["codigo"] == "nome_duplicado"
    assert admin_a.put(f"/api/tipos-comercio/{t['id']}", json={"nome": "Panificadora"}).json()["nome"] == "Panificadora"
    assert oper_a.post(f"/api/tipos-comercio/{t['id']}/inativar").status_code == 403  # só admin
    assert admin_a.post(f"/api/tipos-comercio/{t['id']}/inativar").json()["ativo"] is False
    assert admin_a.get("/api/tipos-comercio?ativo=true").json()["total"] == 0
    acoes = {(a["acao"], a["entidade"]) for a in admin_a.get("/api/auditoria?page_size=100").json()["items"]}
    assert {("criar", "tipo_comercio"), ("editar", "tipo_comercio"), ("inativar", "tipo_comercio")} <= acoes


def test_cliente_com_tipo(admin_a):
    t = novo_tipo(admin_a)
    cl = admin_a.post("/api/clientes", json={"nome": "Pão Quente", "tipo_comercio_id": t["id"]}).json()
    assert cl["tipo_comercio_id"] == t["id"] and cl["tipo_comercio_nome"] == "Padaria"
    assert admin_a.get(f"/api/tipos-comercio?ativo=true").json()["items"][0]["total_clientes"] == 1
    assert admin_a.get(f"/api/clientes?tipo_comercio_id={t['id']}").json()["total"] == 1
    # remover o tipo do cliente
    cl = admin_a.put(f"/api/clientes/{cl['id']}", json={"nome": "Pão Quente", "tipo_comercio_id": None}).json()
    assert cl["tipo_comercio_id"] is None


def test_tipo_inativo_nao_pode_ser_escolhido_mas_vinculo_existente_fica(admin_a):
    t = novo_tipo(admin_a)
    cl = admin_a.post("/api/clientes", json={"nome": "Pão Quente", "tipo_comercio_id": t["id"]}).json()
    admin_a.post(f"/api/tipos-comercio/{t['id']}/inativar")
    r = admin_a.post("/api/clientes", json={"nome": "Outro", "tipo_comercio_id": t["id"]})
    assert r.status_code == 422 and r.json()["erro"]["codigo"] == "tipo_comercio_inativo"
    # editar outro campo de quem já tem o tipo continua funcionando
    r = admin_a.put(f"/api/clientes/{cl['id']}", json={"nome": "Pão Quente 2", "tipo_comercio_id": t["id"]})
    assert r.status_code == 200


def test_leitura_por_produto_e_unidade(admin_a):
    padaria, rest = novo_tipo(admin_a, "Padaria"), novo_tipo(admin_a, "Restaurante")
    c1 = admin_a.post("/api/clientes", json={"nome": "P1", "tipo_comercio_id": padaria["id"]}).json()["id"]
    c2 = admin_a.post("/api/clientes", json={"nome": "P2", "tipo_comercio_id": padaria["id"]}).json()["id"]
    c3 = admin_a.post("/api/clientes", json={"nome": "R1", "tipo_comercio_id": rest["id"]}).json()["id"]
    farinha = novo_produto(admin_a, "FAR", "fd", "Farinha")["id"]
    fermento = novo_produto(admin_a, "FER", "kg", "Fermento")["id"]
    oleo = novo_produto(admin_a, "OLE", "cx", "Óleo")["id"]
    novo_pedido(admin_a, c1, [{"produto_id": farinha, "quantidade": 2, "unidade": "fd"},
                              {"produto_id": farinha, "quantidade": "5", "unidade": "kg"},
                              {"produto_id": fermento, "quantidade": "0.5", "unidade": "kg"}], data="2099-01-01")
    novo_pedido(admin_a, c2, [{"produto_id": farinha, "quantidade": 3, "unidade": "fd"},
                              {"texto_original": "aquele açúcar", "quantidade": 1, "unidade": "kg"}], data="2099-01-01")
    cancelado = novo_pedido(admin_a, c2, [{"produto_id": oleo, "quantidade": 9, "unidade": "cx"}], data="2099-01-01").json()
    admin_a.post(f"/api/pedidos/{cancelado['id']}/cancelar", json={"motivo": "desistiu"})
    novo_pedido(admin_a, c3, [{"produto_id": oleo, "quantidade": 1, "unidade": "cx"}], data="2099-01-01")

    r = admin_a.get(f"/api/tipos-comercio/{padaria['id']}/leitura").json()
    assert r["total_pedidos"] == 2 and r["tipo"]["total_clientes"] == 2
    linhas = [(i["produto_codigo"], i["unidade"], i["pedidos"], i["clientes"], i["quantidade_total"]) for i in r["itens"]]
    assert linhas == [
        ("FAR", "fd", 2, 2, "5.000"),   # 2 fd + 3 fd, os dois clientes
        ("FAR", "kg", 1, 1, "5.000"),   # kg em linha separada, nunca somado com fd
        ("FER", "kg", 1, 1, "0.500"),
    ]  # óleo: só em pedido cancelado (padaria) ou de outro tipo (restaurante); item sem produto fica de fora
    assert [i["produto_codigo"] for i in admin_a.get(f"/api/tipos-comercio/{rest['id']}/leitura").json()["itens"]] == ["OLE"]


def test_leitura_respeita_periodo(admin_a):
    t = novo_tipo(admin_a)
    cl = admin_a.post("/api/clientes", json={"nome": "P1", "tipo_comercio_id": t["id"]}).json()["id"]
    p = novo_produto(admin_a, "X", "un")["id"]
    novo_pedido(admin_a, cl, [{"produto_id": p, "quantidade": 1, "unidade": "un"}], data="2020-01-01")
    assert admin_a.get(f"/api/tipos-comercio/{t['id']}/leitura?dias=30").json()["total_pedidos"] == 0
    assert admin_a.get(f"/api/tipos-comercio/{t['id']}/leitura?dias=3650").json()["total_pedidos"] == 1
    assert admin_a.get(f"/api/tipos-comercio/{t['id']}/leitura?dias=0").status_code == 422


def test_isolamento_entre_empresas(admin_a, admin_b):
    t = novo_tipo(admin_a)
    assert admin_b.get("/api/tipos-comercio").json()["total"] == 0
    assert admin_b.get(f"/api/tipos-comercio/{t['id']}/leitura").status_code == 404
    assert admin_b.put(f"/api/tipos-comercio/{t['id']}", json={"nome": "hack"}).status_code == 404
    r = admin_b.post("/api/clientes", json={"nome": "X", "tipo_comercio_id": t["id"]})
    assert r.status_code == 422 and r.json()["erro"]["codigo"] == "tipo_comercio_invalido"
    novo_tipo(admin_b, "Padaria")  # mesmo nome em outra empresa é permitido
    assert novo_cliente(admin_b)["tipo_comercio_id"] is None
