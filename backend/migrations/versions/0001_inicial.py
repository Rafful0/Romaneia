"""Esquema inicial: multiempresa com RLS forçado e FKs compostas.

Revision ID: 0001
"""
import os

from alembic import op
from sqlalchemy import text

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TABELAS_TENANT = [
    "usuarios", "clientes", "produtos", "produto_apelidos", "rotas", "pedidos",
    "pedido_itens", "romaneios", "romaneio_pedidos", "romaneio_itens",
    "romaneio_item_origens", "auditoria",
]

UNIDADES = "('un','cx','pct','dz','fd','kg','g','l','ml')"

SCHEMA = f"""
create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  criado_em timestamptz not null default now()
);

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  nome text not null check (length(trim(nome)) > 0),
  email text not null,
  senha_hash text not null,
  papel text not null check (papel in ('admin','operador')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (empresa_id, id)
);
create unique index usuarios_email_uq on usuarios (lower(email));

create table clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  nome text not null check (length(trim(nome)) > 0),
  documento text,
  telefone text,
  endereco text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, id)
);
create index clientes_empresa_nome_idx on clientes (empresa_id, lower(nome));

create table produtos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  codigo text not null check (length(trim(codigo)) > 0),
  nome text not null check (length(trim(nome)) > 0),
  unidade text not null check (unidade in {UNIDADES}),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, id)
);
create unique index produtos_codigo_uq on produtos (empresa_id, lower(codigo));

create table produto_apelidos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  produto_id uuid not null,
  apelido text not null check (length(trim(apelido)) > 0),
  foreign key (empresa_id, produto_id) references produtos(empresa_id, id) on delete cascade
);
create unique index produto_apelidos_uq on produto_apelidos (empresa_id, lower(apelido));

create table rotas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  nome text not null check (length(trim(nome)) > 0),
  data date not null,
  observacao text,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, criado_por) references usuarios(empresa_id, id)
);

create table pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  empresa_id uuid not null references empresas(id),
  cliente_id uuid not null,
  rota_id uuid,
  data_entrega date not null,
  status text not null default 'pendente'
    check (status in ('pendente','confirmado','em_separacao','separado','cancelado')),
  observacao text,
  motivo_cancelamento text,
  revisao integer not null default 1,
  criado_por uuid not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, id),
  foreign key (empresa_id, cliente_id) references clientes(empresa_id, id),
  foreign key (empresa_id, rota_id) references rotas(empresa_id, id),
  foreign key (empresa_id, criado_por) references usuarios(empresa_id, id),
  check (status <> 'cancelado' or length(trim(coalesce(motivo_cancelamento, ''))) >= 3)
);
create index pedidos_status_idx on pedidos (empresa_id, status);
create index pedidos_rota_idx on pedidos (empresa_id, rota_id);

create table pedido_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  pedido_id uuid not null,
  posicao integer not null,
  produto_id uuid,
  texto_original text,
  quantidade numeric(12,3) not null check (quantidade > 0),
  unidade text not null check (unidade in {UNIDADES}),
  foreign key (empresa_id, pedido_id) references pedidos(empresa_id, id) on delete cascade,
  foreign key (empresa_id, produto_id) references produtos(empresa_id, id),
  check (produto_id is not null or length(trim(coalesce(texto_original, ''))) > 0)
);
create index pedido_itens_pedido_idx on pedido_itens (pedido_id);

create table romaneios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  rota_id uuid not null,
  versao integer not null,
  status text not null default 'ativo'
    check (status in ('ativo','desatualizado','substituido','concluido')),
  motivo_desatualizado text,
  gerado_por uuid not null,
  gerado_em timestamptz not null default now(),
  concluido_em timestamptz,
  unique (empresa_id, id),
  unique (empresa_id, rota_id, versao),
  foreign key (empresa_id, rota_id) references rotas(empresa_id, id),
  foreign key (empresa_id, gerado_por) references usuarios(empresa_id, id)
);

create table romaneio_pedidos (
  empresa_id uuid not null,
  romaneio_id uuid not null,
  pedido_id uuid not null,
  pedido_revisao integer not null,
  primary key (romaneio_id, pedido_id),
  foreign key (empresa_id, romaneio_id) references romaneios(empresa_id, id) on delete cascade,
  foreign key (empresa_id, pedido_id) references pedidos(empresa_id, id)
);
create index romaneio_pedidos_pedido_idx on romaneio_pedidos (pedido_id);

create table romaneio_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  romaneio_id uuid not null,
  produto_id uuid not null,
  unidade text not null check (unidade in {UNIDADES}),
  quantidade_total numeric(14,3) not null check (quantidade_total > 0),
  separado_por uuid,
  separado_em timestamptz,
  versao integer not null default 1,
  unique (empresa_id, id),
  unique (romaneio_id, produto_id, unidade),
  foreign key (empresa_id, romaneio_id) references romaneios(empresa_id, id) on delete cascade,
  foreign key (empresa_id, produto_id) references produtos(empresa_id, id),
  foreign key (empresa_id, separado_por) references usuarios(empresa_id, id),
  check ((separado_por is null) = (separado_em is null))
);

create table romaneio_item_origens (
  empresa_id uuid not null,
  romaneio_item_id uuid not null,
  pedido_id uuid not null,
  quantidade numeric(14,3) not null check (quantidade > 0),
  primary key (romaneio_item_id, pedido_id),
  foreign key (empresa_id, romaneio_item_id) references romaneio_itens(empresa_id, id) on delete cascade,
  foreign key (empresa_id, pedido_id) references pedidos(empresa_id, id)
);

create table auditoria (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references empresas(id),
  usuario_id uuid,
  acao text not null,
  entidade text not null,
  entidade_id text,
  detalhes jsonb not null default '{{}}'::jsonb,
  criado_em timestamptz not null default now(),
  foreign key (empresa_id, usuario_id) references usuarios(empresa_id, id)
);
create index auditoria_empresa_data_idx on auditoria (empresa_id, criado_em desc);

-- Máquina de estados também no banco (defesa em profundidade; espelha app/domain.py).
create function pedidos_validar_transicao() returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if (old.status, new.status) not in (
      ('pendente','confirmado'), ('pendente','cancelado'), ('confirmado','cancelado'),
      ('confirmado','em_separacao'), ('em_separacao','separado'), ('separado','em_separacao')) then
    raise exception 'transicao de status invalida: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger pedidos_transicao before update of status on pedidos
  for each row execute function pedidos_validar_transicao();

-- Login precisa achar o usuário antes de saber a empresa: única leitura fora do RLS,
-- restrita a um e-mail e executada com o dono (superusuário) do esquema.
create function auth_buscar_usuario(p_email text)
returns table (id uuid, empresa_id uuid, nome text, senha_hash text, papel text, ativo boolean)
language sql stable security definer set search_path = public as $$
  select id, empresa_id, nome, senha_hash, papel, ativo from usuarios where lower(email) = lower(p_email)
$$;
revoke all on function auth_buscar_usuario(text) from public;
"""


def upgrade() -> None:
    bind = op.get_bind()
    senha = os.environ.get("APP_DB_PASSWORD")
    if not senha:
        raise RuntimeError("APP_DB_PASSWORD não definido: necessário para criar o papel romaneia_app")
    bind.execute(text("select set_config('romaneia.app_pw', :pw, true)"), {"pw": senha})
    op.execute("""
    do $$ begin
      -- O papel é do cluster inteiro: nunca trocar a senha de um papel existente aqui (outro banco no mesmo
      -- servidor, ex. o de testes, derrubaria a aplicação). Troca de senha é manual: ALTER ROLE.
      if not exists (select 1 from pg_roles where rolname = 'romaneia_app') then
        execute format('create role romaneia_app login nosuperuser nobypassrls password %L',
                       current_setting('romaneia.app_pw'));
      else
        alter role romaneia_app login nosuperuser nobypassrls;
      end if;
    end $$;
    """)
    op.execute(SCHEMA)

    op.execute("alter table empresas enable row level security")
    op.execute("alter table empresas force row level security")
    op.execute("create policy tenant on empresas using (id = nullif(current_setting('app.empresa_id', true), '')::uuid)")
    for t in TABELAS_TENANT:
        op.execute(f"alter table {t} enable row level security")
        op.execute(f"alter table {t} force row level security")
        op.execute(
            f"create policy tenant on {t} "
            f"using (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid) "
            f"with check (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid)"
        )

    op.execute("grant usage on schema public to romaneia_app")
    op.execute("grant select on empresas to romaneia_app")
    for t in TABELAS_TENANT:
        if t != "auditoria":
            op.execute(f"grant select, insert, update, delete on {t} to romaneia_app")
    op.execute("grant select, insert on auditoria to romaneia_app")  # auditoria é só-acréscimo
    op.execute("grant usage on all sequences in schema public to romaneia_app")
    op.execute("grant execute on function auth_buscar_usuario(text) to romaneia_app")


def downgrade() -> None:
    op.execute("drop function if exists auth_buscar_usuario(text)")
    for t in reversed(["empresas", *TABELAS_TENANT]):
        op.execute(f"drop table if exists {t} cascade")
    op.execute("drop function if exists pedidos_validar_transicao()")
