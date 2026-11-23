"""Pedido passa a ser feito a um fornecedor; saem clientes e tipos de comércio.

Revision ID: 0004
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Não há como converter pedido de cliente em pedido de fornecedor: recusa em vez de apagar dados em silêncio.
    op.execute("""
    do $$ begin
      if exists (select 1 from pedidos) then
        raise exception 'Existem pedidos ligados a clientes. Apague os dados (docker compose down -v) antes de migrar.';
      end if;
    end $$;

    alter table pedidos drop column cliente_id;
    alter table pedidos add column fornecedor_id uuid not null;
    alter table pedidos add foreign key (empresa_id, fornecedor_id) references fornecedores(empresa_id, id);
    create index pedidos_fornecedor_idx on pedidos (empresa_id, fornecedor_id);

    drop table clientes;
    drop table tipos_comercio;
    """)


def downgrade() -> None:
    raise NotImplementedError("0004 remove clientes e tipos de comércio; volte recriando o banco")
