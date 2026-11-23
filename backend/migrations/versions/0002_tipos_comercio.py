"""Tipos de comércio (padaria, restaurante...) e vínculo com o cliente.

Revision ID: 0002
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    create table tipos_comercio (
      id uuid primary key default gen_random_uuid(),
      empresa_id uuid not null references empresas(id),
      nome text not null check (length(trim(nome)) > 0),
      ativo boolean not null default true,
      criado_em timestamptz not null default now(),
      unique (empresa_id, id)
    );
    create unique index tipos_comercio_nome_uq on tipos_comercio (empresa_id, lower(nome));

    alter table clientes add column tipo_comercio_id uuid;
    alter table clientes add foreign key (empresa_id, tipo_comercio_id) references tipos_comercio(empresa_id, id);
    create index clientes_tipo_idx on clientes (empresa_id, tipo_comercio_id);

    alter table tipos_comercio enable row level security;
    alter table tipos_comercio force row level security;
    create policy tenant on tipos_comercio
      using (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid)
      with check (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);
    grant select, insert, update, delete on tipos_comercio to romaneia_app;
    """)


def downgrade() -> None:
    op.execute("alter table clientes drop column if exists tipo_comercio_id")
    op.execute("drop table if exists tipos_comercio")
