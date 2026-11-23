import pytest


def novo(cli, nome="Moinho Central", telefone="(11) 97777-6666", **extra):
    return cli.post("/api/fornecedores", json={"nome": nome, "telefone": telefone, **extra})


def test_crud_com_numero_normalizado(admin_a, oper_a):
    r = novo(oper_a)  # operador também cadastra
    assert r.status_code == 201, r.text
    f = r.json()
    assert f["telefone"] == "5511977776666" and f["ativo"]
    r = oper_a.put(f"/api/fornecedores/{f['id']}", json={"nome": "Moinho Central Ltda", "telefone": "+55 11 97777-6666",
                                                        "observacao": "Farinha e fermento"})
    assert r.json()["nome"] == "Moinho Central Ltda" and r.json()["observacao"] == "Farinha e fermento"
    assert oper_a.post(f"/api/fornecedores/{f['id']}/inativar").status_code == 403
    assert admin_a.post(f"/api/fornecedores/{f['id']}/inativar").json()["ativo"] is False
    acoes = {(a["acao"], a["entidade"]) for a in admin_a.get("/api/auditoria?page_size=100").json()["items"]}
    assert {("criar", "fornecedor"), ("editar", "fornecedor"), ("inativar", "fornecedor")} <= acoes


@pytest.mark.parametrize("tel", ["12345678", "98765-4321", "+1 415 555 0100", "abcdefgh"])
def test_numero_invalido(admin_a, tel):
    r = novo(admin_a, telefone=tel)
    assert r.status_code == 422 and r.json()["erro"]["codigo"] == "telefone_invalido"


def test_numero_duplicado_na_mesma_empresa(admin_a, admin_b):
    novo(admin_a)
    r = novo(admin_a, nome="Outro", telefone="11977776666")
    assert r.status_code == 409 and "Moinho Central" in r.json()["erro"]["mensagem"]
    assert novo(admin_b).status_code == 201  # outra empresa pode ter o mesmo fornecedor


def test_busca_por_nome_e_numero(admin_a):
    novo(admin_a)
    novo(admin_a, nome="Hortifruti Bom", telefone="21 98888-1111")
    assert admin_a.get("/api/fornecedores?busca=horti").json()["total"] == 1
    assert admin_a.get("/api/fornecedores?busca=97777").json()["total"] == 1
    assert admin_a.get("/api/fornecedores?busca=(21) 98888").json()["total"] == 1


def test_isolamento(admin_a, admin_b):
    f = novo(admin_a).json()
    assert admin_b.get("/api/fornecedores").json()["total"] == 0
    assert admin_b.put(f"/api/fornecedores/{f['id']}", json={"nome": "x", "telefone": "11911112222"}).status_code == 404
    assert admin_b.post(f"/api/fornecedores/{f['id']}/inativar").status_code == 404
