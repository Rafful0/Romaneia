from decimal import Decimal

import pytest

from app import domain
from app.errors import AppError


@pytest.mark.parametrize("q,u", [("0", "kg"), ("-1", "cx"), ("1.5", "cx"), ("2.5", "dz"), ("NaN", "kg"), ("1", "ton")])
def test_quantidade_invalida_rejeitada(q, u):
    with pytest.raises(AppError):
        domain.validar_quantidade(Decimal(q), u)


@pytest.mark.parametrize("q,u", [("1", "cx"), ("10", "un"), ("0.5", "kg"), ("1.250", "l"), ("3.000", "cx")])
def test_quantidade_valida(q, u):
    domain.validar_quantidade(Decimal(q), u)


def test_unidades_diferentes_nao_somam():
    out = domain.consolidar([
        {"pedido_id": "p1", "produto_id": "X", "unidade": "cx", "quantidade": Decimal("10")},
        {"pedido_id": "p2", "produto_id": "X", "unidade": "kg", "quantidade": Decimal("10")},
        {"pedido_id": "p3", "produto_id": "X", "unidade": "cx", "quantidade": Decimal("5")},
    ])
    assert out[("X", "cx")]["total"] == Decimal("15")
    assert out[("X", "kg")]["total"] == Decimal("10")
    assert len(out) == 2
    assert dict(out[("X", "cx")]["origens"]) == {"p1": Decimal("10"), "p3": Decimal("5")}


def test_consolidar_recusa_item_nao_identificado():
    with pytest.raises(AppError):
        domain.consolidar([{"pedido_id": "p1", "produto_id": None, "unidade": "kg", "quantidade": Decimal(1)}])


@pytest.mark.parametrize("de,para", [("cancelado", "confirmado"), ("pendente", "em_separacao"),
                                     ("separado", "cancelado"), ("em_separacao", "cancelado"),
                                     ("confirmado", "pendente")])
def test_transicoes_invalidas(de, para):
    with pytest.raises(AppError):
        domain.validar_transicao(de, para)


def test_transicoes_validas():
    for de, alvos in domain.TRANSICOES.items():
        for para in alvos:
            domain.validar_transicao(de, para)
