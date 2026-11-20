import pytest

from tests.conftest import nova_rota, novo_cliente, novo_pedido, novo_produto


def confirmado(cli, cliente, itens):
    p = novo_pedido(cli, cliente, itens).json()
    assert cli.post(f"/api/pedidos/{p['id']}/confirmar").status_code == 200
    return p


@pytest.fixture()
def cenario(admin_a):
    cli = admin_a
    c1, c2 = novo_cliente(cli, "Alfa")["id"], novo_cliente(cli, "Beta")["id"]
    arroz = novo_produto(cli, "ARR", "cx", "Arroz")["id"]
    p1 = confirmado(cli, c1, [{"produto_id": arroz, "quantidade": 10, "unidade": "cx"}])
    p2 = confirmado(cli, c2, [{"produto_id": arroz, "quantidade": 10, "unidade": "kg"},
                              {"produto_id": arroz, "quantidade": 5, "unidade": "cx"}])
    pend = novo_pedido(cli, c2, [{"texto_original": "algo", "quantidade": 1, "unidade": "un"}]).json()
    rota = nova_rota(cli)
    for p in (p1, p2, pend):
        assert cli.post(f"/api/rotas/{rota['id']}/pedidos", json={"pedido_id": p["id"]}).status_code == 200
    return {"cli": cli, "rota": rota["id"], "p1": p1, "p2": p2, "pend": pend, "arroz": arroz, "c1": c1}


def gerar(cen):
    r = cen["cli"].post(f"/api/rotas/{cen['rota']}/romaneios")
    assert r.status_code == 201, r.text
    return r.json()


def test_consolidacao_por_produto_e_unidade(cenario):
    rom = gerar(cenario)
    linhas = {(i["produto_codigo"], i["unidade"]): i["quantidade_total"] for i in rom["itens"]}
    assert linhas == {("ARR", "cx"): "15.000", ("ARR", "kg"): "10.000"}  # 10 cx e 10 kg nunca somam
    assert rom["pendentes_ignorados"] == 1
    assert len(rom["pedidos"]) == 2
    assert [g["cliente_nome"] for g in rom["por_cliente"]] == ["Alfa", "Beta"]
    assert rom["versao"] == 1 and rom["status"] == "ativo"


def test_sem_pedidos_elegiveis(admin_a):
    rota = nova_rota(admin_a)
    r = admin_a.post(f"/api/rotas/{rota['id']}/romaneios")
    assert r.status_code == 422 and r.json()["erro"]["codigo"] == "sem_pedidos_elegiveis"


def test_pedido_em_outra_rota(cenario):
    cli = cenario["cli"]
    outra = nova_rota(cli, "Rota 2")
    r = cli.post(f"/api/rotas/{outra['id']}/pedidos", json={"pedido_id": cenario["p1"]["id"]})
    assert r.status_code == 409


def test_alterar_pedido_invalida_romaneio(cenario):
    cli = cenario["cli"]
    rom = gerar(cenario)
    r = cli.put(f"/api/pedidos/{cenario['p1']['id']}", json={
        "cliente_id": cenario["c1"], "data_entrega": "2026-12-01",
        "itens": [{"produto_id": cenario["arroz"], "quantidade": 12, "unidade": "cx"}]})
    assert r.status_code == 200
    atual = cli.get(f"/api/romaneios/{rom['id']}").json()
    assert atual["status"] == "desatualizado" and "alterado" in atual["motivo_desatualizado"]
    it = atual["itens"][0]
    r = cli.post(f"/api/romaneios/{rom['id']}/itens/{it['id']}/separacao",
                 json={"separado": True, "versao": it["versao"]})
    assert r.status_code == 409  # não separa romaneio desatualizado
    v2 = gerar(cenario)
    assert v2["versao"] == 2
    assert cli.get(f"/api/romaneios/{rom['id']}").json()["status"] == "substituido"
    assert {(i["unidade"], i["quantidade_total"]) for i in v2["itens"]} == {("cx", "17.000"), ("kg", "10.000")}


@pytest.mark.parametrize("acao", ["cancelar", "remover", "incluir", "confirmar_na_rota"])
def test_outras_mudancas_invalidam(cenario, acao):
    cli, rota = cenario["cli"], cenario["rota"]
    rom = gerar(cenario)
    if acao == "cancelar":
        r = cli.post(f"/api/pedidos/{cenario['p1']['id']}/cancelar", json={"motivo": "desistiu"})
    elif acao == "remover":
        r = cli.delete(f"/api/rotas/{rota}/pedidos/{cenario['p1']['id']}")
    elif acao == "incluir":
        p = confirmado(cli, cenario["c1"], [{"produto_id": cenario["arroz"], "quantidade": 1, "unidade": "cx"}])
        r = cli.post(f"/api/rotas/{rota}/pedidos", json={"pedido_id": p["id"]})
    else:
        cli.put(f"/api/pedidos/{cenario['pend']['id']}", json={
            "cliente_id": cenario["c1"], "data_entrega": "2026-12-01",
            "itens": [{"produto_id": cenario["arroz"], "quantidade": 1, "unidade": "cx"}]})
        r = cli.post(f"/api/pedidos/{cenario['pend']['id']}/confirmar")
    assert r.status_code == 200, r.text
    assert cli.get(f"/api/romaneios/{rom['id']}").json()["status"] == "desatualizado"


def test_separacao_fluxo_e_conflito(cenario, oper_a):
    cli = cenario["cli"]
    rom = gerar(cenario)
    a, b = rom["itens"]
    url = f"/api/romaneios/{rom['id']}/itens"
    r = cli.post(f"{url}/{a['id']}/separacao", json={"separado": True, "versao": a["versao"]})
    assert r.status_code == 200
    det = r.json()
    assert det["progresso"] == {"total": 2, "separados": 1, "percentual": 50}
    marcado = next(i for i in det["itens"] if i["id"] == a["id"])
    assert marcado["separado_por_nome"] == "admin A" and marcado["separado_em"]
    assert {p["status"] for p in det["pedidos"]} == {"em_separacao"}

    # operador com a versão antiga tenta desmarcar: não sobrescreve em silêncio
    r = oper_a.post(f"{url}/{a['id']}/separacao", json={"separado": False, "versao": a["versao"]})
    assert r.status_code == 409 and "admin A" in r.json()["erro"]["mensagem"]
    # dois usuários marcando o mesmo item com a mesma versão: só o primeiro vence
    r = oper_a.post(f"{url}/{b['id']}/separacao", json={"separado": True, "versao": b["versao"]})
    assert r.status_code == 200
    assert cli.post(f"{url}/{b['id']}/separacao", json={"separado": True, "versao": b["versao"]}).status_code == 409
    det = r.json()
    assert det["status"] == "concluido" and det["progresso"]["percentual"] == 100
    assert {p["status"] for p in det["pedidos"]} == {"separado"}

    # com separação feita, mudar a rota/pedido é bloqueado
    assert cli.delete(f"/api/rotas/{cenario['rota']}/pedidos/{cenario['p1']['id']}").status_code == 409
    assert cli.post(f"/api/pedidos/{cenario['p1']['id']}/cancelar", json={"motivo": "xx x"}).status_code == 409

    # desmarcar reabre o romaneio
    b_atual = next(i for i in det["itens"] if i["id"] == b["id"])
    r = oper_a.post(f"{url}/{b['id']}/separacao", json={"separado": False, "versao": b_atual["versao"]})
    assert r.json()["status"] == "ativo"
    assert {p["status"] for p in r.json()["pedidos"]} == {"em_separacao"}


def test_auditoria_de_separacao(cenario):
    cli = cenario["cli"]
    rom = gerar(cenario)
    it = rom["itens"][0]
    cli.post(f"/api/romaneios/{rom['id']}/itens/{it['id']}/separacao", json={"separado": True, "versao": 1})
    acoes = {a["acao"] for a in cli.get("/api/auditoria?page_size=100").json()["items"]}
    assert {"gerar", "separar", "associar"} <= acoes


def test_dashboard(cenario):
    d = cenario["cli"].get("/api/dashboard").json()
    assert (d["pendentes"], d["confirmados"], d["em_separacao"], d["sem_rota"]) == (1, 2, 0, 0)
    assert d["atividade_recente"]
