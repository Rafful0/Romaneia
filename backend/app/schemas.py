from datetime import date
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Texto = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
TextoOpc = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] | None
Unidade = Literal["un", "cx", "pct", "dz", "fd", "kg", "g", "l", "ml"]


class Base(BaseModel):
    # extra="forbid": empresa_id/papel enviados no corpo são rejeitados, não ignorados em silêncio.
    model_config = ConfigDict(extra="forbid")


class LoginIn(Base):
    login: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]  # e-mail ou celular
    senha: Annotated[str, StringConstraints(min_length=1, max_length=200)]


class CadastroIniciarIn(Base):
    metodo: Literal["email", "telefone"]
    destino: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]
    nome: Texto
    empresa: Texto
    senha: Annotated[str, StringConstraints(min_length=8, max_length=200)]


class CadastroConfirmarIn(Base):
    cadastro_id: UUID
    codigo: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{6}$")]


class CadastroGoogleIn(Base):
    empresa: Texto


class FornecedorIn(Base):
    nome: Texto
    telefone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=8, max_length=30)]
    observacao: TextoOpc = None


class ProdutoIn(Base):
    codigo: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
    nome: Texto
    unidade: Unidade
    apelidos: list[Texto] = Field(default_factory=list, max_length=30)


class ItemIn(Base):
    produto_id: UUID | None = None
    texto_original: TextoOpc = None
    # decimal_places=3: mais casas é rejeitado (não arredondado).
    quantidade: Decimal = Field(gt=0, max_digits=12, decimal_places=3)
    unidade: Unidade


class PedidoIn(Base):
    fornecedor_id: UUID
    data_entrega: date
    observacao: TextoOpc = None
    itens: list[ItemIn] = Field(min_length=1, max_length=200)


class CancelarIn(Base):
    motivo: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)]


class RotaIn(Base):
    nome: Texto
    data: date
    observacao: TextoOpc = None


class RotaPedidoIn(Base):
    pedido_id: UUID


class SeparacaoIn(Base):
    separado: bool
    versao: int = Field(ge=1)  # versão que o usuário viu; diferente da atual => 409
