"""Regras de domínio puras (sem banco): unidades, quantidades, transições, consolidação."""
import re
from collections import defaultdict
from decimal import Decimal

from app.errors import AppError

# Unidades contáveis só aceitam quantidade inteira; nunca arredondamos em silêncio.
UNIDADES_INTEIRAS = {"un", "cx", "pct", "dz", "fd"}
UNIDADES_FRACIONADAS = {"kg", "g", "l", "ml"}
UNIDADES = UNIDADES_INTEIRAS | UNIDADES_FRACIONADAS

TRANSICOES = {
    "pendente": {"confirmado", "cancelado"},
    "confirmado": {"em_separacao", "cancelado"},
    "em_separacao": {"separado"},
    "separado": {"em_separacao"},
    "cancelado": set(),
}
EDITAVEIS = {"pendente", "confirmado"}


def validar_quantidade(quantidade: Decimal, unidade: str, campo: str = "quantidade") -> None:
    if unidade not in UNIDADES:
        raise AppError(422, "unidade_invalida", f"Unidade '{unidade}' não é válida", {"campo": campo})
    if not quantidade.is_finite() or quantidade <= 0:
        raise AppError(422, "quantidade_invalida", "Quantidade deve ser maior que zero", {"campo": campo})
    if unidade in UNIDADES_INTEIRAS and quantidade != quantidade.to_integral_value():
        raise AppError(422, "quantidade_invalida",
                       f"Unidade '{unidade}' exige quantidade inteira (recebido {quantidade})", {"campo": campo})


def validar_transicao(atual: str, novo: str) -> None:
    if novo not in TRANSICOES.get(atual, set()):
        raise AppError(409, "transicao_invalida", f"Não é possível mudar o pedido de '{atual}' para '{novo}'")


def consolidar(itens: list[dict]) -> dict[tuple[str, str], dict]:
    """itens: [{pedido_id, produto_id, unidade, quantidade}] -> {(produto_id, unidade): {total, origens}}.

    Chave é produto + unidade: 10 cx e 10 kg do mesmo produto viram duas linhas, nunca 20.
    """
    out: dict[tuple[str, str], dict] = {}
    for it in itens:
        if it["produto_id"] is None:
            raise AppError(422, "item_nao_identificado", "Há item sem produto identificado")
        chave = (str(it["produto_id"]), it["unidade"])
        linha = out.setdefault(chave, {"total": Decimal(0), "origens": defaultdict(Decimal)})
        linha["total"] += Decimal(it["quantidade"])
        linha["origens"][str(it["pedido_id"])] += Decimal(it["quantidade"])
    return out


def normalizar_telefone(tel: str | None) -> str | None:
    """Celular/fixo BR -> só dígitos com DDI 55, ou None se não der para saber o número com segurança.

    Mesma regra de frontend/src/lib/whatsapp.ts (telefoneWhatsApp).
    """
    bruto = (tel or "").strip()
    d = re.sub(r"\D", "", bruto).lstrip("0")
    if bruto.startswith("+") and not d.startswith("55"):
        return None  # DDI estrangeiro
    if len(d) in (10, 11):
        return "55" + d
    if len(d) in (12, 13) and d.startswith("55"):
        return d
    return None


# Conjunto seguro de caracteres: sem vírgula, aspas ou <>, que o parser de e-mail leria como outro destinatário.
EMAIL_RE = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$")


def normalizar_email(email: str | None) -> str | None:
    e = (email or "").strip().lower()
    return e if EMAIL_RE.match(e) else None
