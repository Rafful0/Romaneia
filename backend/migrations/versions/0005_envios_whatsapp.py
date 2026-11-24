"""Envios automáticos de WhatsApp (Cloud API da Meta) por pedido.

Revision ID: 0005
"""
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    create table envios_whatsapp (
      id uuid primary key default gen_random_uuid(),
      empresa_id uuid not null references empresas(id),
      pedido_id uuid not null,
      motivo text not null check (motivo in ('pedido', 'cancelamento')),
      telefone text not null,
      tipo_mensagem text check (tipo_mensagem in ('texto', 'modelo')),
      status text not null default 'pendente'
        check (status in ('pendente', 'enviando', 'enviado', 'entregue', 'lido', 'falhou')),
      wa_message_id text unique,
      erro text,
      criado_por uuid not null,
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now(),
      foreign key (empresa_id, pedido_id) references pedidos(empresa_id, id),
      foreign key (empresa_id, criado_por) references usuarios(empresa_id, id)
    );
    create index envios_whatsapp_pedido_idx on envios_whatsapp (empresa_id, pedido_id, criado_em desc);
    alter table envios_whatsapp enable row level security;
    alter table envios_whatsapp force row level security;
    create policy tenant on envios_whatsapp
      using (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid)
      with check (empresa_id = nullif(current_setting('app.empresa_id', true), '')::uuid);
    grant select, insert, update on envios_whatsapp to romaneia_app;

    -- O webhook da Meta não sabe a empresa: atualiza só pelo id da mensagem, sem nunca regredir o status
    -- (ex.: "entregue" que chega depois de "lido" é ignorado).
    create function whatsapp_atualizar_status(p_wamid text, p_status text, p_erro text) returns void
    language plpgsql security definer set search_path = public as $$
    declare ordem constant text[] := array['pendente', 'enviando', 'enviado', 'entregue', 'lido'];
    begin
      update envios_whatsapp e set status = p_status, erro = coalesce(p_erro, e.erro), atualizado_em = now()
      where e.wa_message_id = p_wamid
        and ((p_status = 'falhou' and e.status not in ('entregue', 'lido'))
          or (p_status <> 'falhou'
              and array_position(ordem, p_status) > coalesce(array_position(ordem, e.status), 0)));
    end $$;
    revoke all on function whatsapp_atualizar_status(text, text, text) from public;
    grant execute on function whatsapp_atualizar_status(text, text, text) to romaneia_app;
    """)


def downgrade() -> None:
    op.execute("drop function if exists whatsapp_atualizar_status(text, text, text); drop table if exists envios_whatsapp;")
