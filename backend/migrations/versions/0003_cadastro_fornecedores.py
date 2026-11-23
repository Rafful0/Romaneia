"""Cadastro self-service (e-mail, celular, Google) e fornecedores.

Revision ID: 0003
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

TELEFONE_BR = "'^55[0-9]{10,11}$'"  # só dígitos, com DDI 55 (normalizado pela API)


def upgrade() -> None:
    op.execute(f"""
    -- Usuário pode entrar por e-mail, celular ou Google; precisa de pelo menos um, e de senha se não usar Google.
    alter table usuarios alter column email drop not null;
    alter table usuarios alter column senha_hash drop not null;
    alter table usuarios add column telefone text check (telefone is null or telefone ~ {TELEFONE_BR});
    alter table usuarios add column google_sub text;
    alter table usuarios add constraint usuarios_identificador_ck
      check (email is not null or telefone is not null or google_sub is not null);
    alter table usuarios add constraint usuarios_credencial_ck check (senha_hash is not null or google_sub is not null);
    create unique index usuarios_telefone_uq on usuarios (telefone);
    create unique index usuarios_google_uq on usuarios (google_sub);

    -- Busca para login/cadastro antes de saber a empresa (fora do RLS, como no 0001).
    drop function auth_buscar_usuario(text);
    create function auth_buscar_usuario(p_email text, p_telefone text, p_google_sub text)
    returns table (id uuid, empresa_id uuid, nome text, senha_hash text, papel text, ativo boolean,
                   email text, telefone text, google_sub text)
    language sql stable security definer set search_path = public as $$
      select id, empresa_id, nome, senha_hash, papel, ativo, email, telefone, google_sub from usuarios
      where (p_email is not null and lower(email) = lower(p_email))
         or (p_telefone is not null and telefone = p_telefone)
         or (p_google_sub is not null and google_sub = p_google_sub)
      order by (google_sub is not distinct from p_google_sub) desc
    $$;
    revoke all on function auth_buscar_usuario(text, text, text) from public;
    grant execute on function auth_buscar_usuario(text, text, text) to romaneia_app;

    -- Cria empresa + primeiro admin. Só a API chama, depois de verificar o código (ou o Google).
    create function criar_conta(p_empresa text, p_nome text, p_email text, p_telefone text,
                                p_google_sub text, p_senha_hash text)
    returns table (nova_empresa_id uuid, novo_usuario_id uuid)
    language plpgsql security definer set search_path = public as $$
    declare e uuid; u uuid;
    begin
      insert into empresas (nome) values (p_empresa) returning id into e;
      insert into usuarios (empresa_id, nome, email, telefone, google_sub, senha_hash, papel)
        values (e, p_nome, p_email, p_telefone, p_google_sub, p_senha_hash, 'admin') returning id into u;
      return query select e, u;
    end $$;
    revoke all on function criar_conta(text, text, text, text, text, text) from public;
    grant execute on function criar_conta(text, text, text, text, text, text) to romaneia_app;

    -- Cadastro aguardando código (ou nome da empresa, no Google). Ainda não tem empresa: sem RLS.
    create table cadastros_pendentes (
      id uuid primary key default gen_random_uuid(),
      metodo text not null check (metodo in ('email', 'telefone', 'google')),
      destino text not null,
      nome text not null,
      empresa_nome text,
      senha_hash text,
      google_sub text,
      codigo_hash text,
      tentativas integer not null default 0,
      expira_em timestamptz not null,
      criado_em timestamptz not null default now()
    );
    create index cadastros_pendentes_destino_idx on cadastros_pendentes (destino);
    grant select, insert, update, delete on cadastros_pendentes to romaneia_app;

    create table fornecedores (
      id uuid primary key default gen_random_uuid(),
      empresa_id uuid not null references empresas(id),
      nome text not null check (length(trim(nome)) > 0),
      telefone text not null check (telefone ~ {TELEFONE_BR}),
      observacao text,
      ativo boolean not null default true,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      unique (empresa_id, id)
    );
    create unique index fornecedores_telefone_uq on fornecedores (empresa_id, telefone);
    alter table fornecedores enable row level security;
    alter table fornecedores force row level security;
    create policy tenant on fornecedores
      using (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid)
      with check (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);
    grant select, insert, update, delete on fornecedores to romaneia_app;
    """)


def downgrade() -> None:
    op.execute("""
    drop table if exists fornecedores;
    drop table if exists cadastros_pendentes;
    drop function if exists criar_conta(text, text, text, text, text, text);
    drop function if exists auth_buscar_usuario(text, text, text);
    create function auth_buscar_usuario(p_email text)
    returns table (id uuid, empresa_id uuid, nome text, senha_hash text, papel text, ativo boolean)
    language sql stable security definer set search_path = public as $$
      select id, empresa_id, nome, senha_hash, papel, ativo from usuarios where lower(email) = lower(p_email)
    $$;
    revoke all on function auth_buscar_usuario(text) from public;
    grant execute on function auth_buscar_usuario(text) to romaneia_app;
    alter table usuarios drop constraint if exists usuarios_credencial_ck;
    alter table usuarios drop constraint if exists usuarios_identificador_ck;
    alter table usuarios drop column if exists google_sub;
    alter table usuarios drop column if exists telefone;
    """)
