# Romaneia — protótipo funcional

Sistema para distribuidoras organizarem **pedidos → rotas → romaneios de separação**. Um funcionário faz, pela interface,
o fluxo completo: login → cliente → produtos → pedido → confirmação → rota → romaneio → separação → histórico,
com tudo gravado no PostgreSQL.

> **Protótipo**, não produto final. Veja [O que funciona e o que não funciona](#o-que-funciona-e-o-que-não-funciona).

## Stack

| Camada | Tecnologia |
|---|---|
| Banco | PostgreSQL 16, RLS forçado por empresa, FKs compostas `(empresa_id, id)`, migrações Alembic |
| Backend | FastAPI + SQLAlchemy Core (psycopg 3), Pydantic v2, argon2, JWT em cookie HttpOnly |
| Frontend | React 18 + TypeScript + Vite + Tailwind 4, React Router, TanStack Query, React Hook Form + Zod |
| Testes | pytest (contra Postgres real), Vitest + Testing Library, Playwright (E2E) |

## Como rodar

Requisito: Docker com Compose.

```bash
cp .env.example .env      # opcional: os padrões servem para desenvolvimento local
docker compose up --build
```

- App: http://localhost:8080
- API: http://localhost:8000/api (health check: `/api/health`)
- PostgreSQL: `localhost:5432`

Na subida, o backend roda `alembic upgrade head` e o seed de demonstração (`RUN_SEED=true`).
Para recomeçar do zero: `docker compose down -v`.

### Credenciais de demonstração (seed)

Dados **fictícios**, criados por `backend/app/seed.py` na empresa "Distribuidora Demonstração (dados fictícios)":

| Usuário | Papel | Senha |
|---|---|---|
| `admin@demo.test` | admin | valor de `SEED_PASSWORD` (padrão `demo1234`) |
| `operador@demo.test` | operador | idem |

Troque `SEED_PASSWORD`, `JWT_SECRET`, `POSTGRES_PASSWORD` e `APP_DB_PASSWORD` em qualquer ambiente que não seja a sua máquina.

### Desenvolvimento sem rebuild

```bash
docker compose up -d db backend
cd frontend && npm install && npm run dev        # http://localhost:5173 (proxy /api -> :8000)
```

Backend local (fora do Docker): `cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt`,
copie `backend/.env.example` para `backend/.env`, rode `alembic upgrade head`, `python -m app.seed` e `uvicorn app.main:app --reload`.

## Como testar

```bash
# Backend: precisa do Postgres do compose rodando (cria/destrói o banco romaneia_test)
docker compose up -d db
cd backend && .venv/Scripts/python -m pytest -q

# Frontend: testes de componente/unidade
cd frontend && npm test

# E2E: fluxo completo no navegador contra a stack do compose (http://localhost:8080)
docker compose up -d
cd frontend && PW_CHANNEL=msedge npx playwright test     # ou: npx playwright install chromium && npx playwright test
```

`TEST_PG_ADMIN_URL` muda o Postgres usado pelo pytest; `E2E_BASE_URL` muda o alvo do Playwright.
O E2E cria dados com nomes únicos (`E2E ... <timestamp>`) a cada execução.

## Arquitetura e regras

### Multiempresa e segurança
- Toda tabela de negócio tem `empresa_id`, **RLS habilitado e forçado** (`FORCE ROW LEVEL SECURITY`) e política
  `empresa_id = current_setting('app.empresa_id')`.
- A API conecta com o papel `romaneia_app` (sem `SUPERUSER`/`BYPASSRLS`). Migrações e seed usam o dono do esquema.
- Cada requisição abre **uma transação** e fixa a empresa com `set_config(..., true)` (vale só nessa transação).
- A empresa vem **sempre do token**; corpos com campos extras (ex.: `empresa_id`) são rejeitados (`extra="forbid"`).
  O papel é relido do banco a cada requisição, então rebaixar ou inativar um usuário vale na hora.
- FKs compostas `(empresa_id, x_id)` impedem referência cruzada entre empresas até para o superusuário.
- Login usa a única função fora do RLS (`auth_buscar_usuario`, `SECURITY DEFINER`), que busca só pelo e-mail.
  Senha errada e e-mail inexistente dão a mesma resposta.
- `auditoria` é só-acréscimo para o papel da aplicação (sem `UPDATE`/`DELETE`).
- Cookie `HttpOnly`, `SameSite=Lax`, `Secure` configurável; CORS restrito às origens de `CORS_ORIGINS`.

### Regras de domínio
- **Quantidade** > 0, no máximo 3 casas decimais; unidades contáveis (`un, cx, pct, dz, fd`) exigem inteiro. Valores
  inválidos são **rejeitados**, nunca arredondados. Validado no front (Zod), na API (Pydantic + domínio) e no banco (`CHECK`).
- **Item não identificado** (sem produto, só descrição) é permitido em pedido pendente, mas **bloqueia a confirmação**.
- **Máquina de estados** (em `app/domain.py` e espelhada num trigger do banco):
  `pendente → confirmado | cancelado`, `confirmado → em_separacao | cancelado`, `em_separacao → separado`, `separado → em_separacao`.
  Cancelamento exige justificativa (mín. 3 caracteres, também `CHECK` no banco).
- **Consolidação** por **produto + unidade**: 10 cx e 10 kg do mesmo produto são duas linhas, nunca 20.
- **Versão do romaneio**: alterar, cancelar, confirmar, incluir ou remover pedido de uma rota com romaneio ativo marca o
  romaneio como **desatualizado**, que bloqueia a separação até que uma nova versão seja gerada (a anterior fica "substituída").
  Se a separação já começou, essas alterações são **recusadas (409)**, para não invalidar trabalho físico em andamento.
- **Separação** com controle otimista por item (`versao`): marcar/desmarcar com versão antiga retorna 409 informando
  quem marcou. Ninguém sobrescreve em silêncio o que outra pessoa fez.

### Papéis
- **admin**: tudo, mais inativar clientes/produtos e ver o histórico (auditoria).
- **operador**: cadastros, pedidos, rotas, romaneios e separação.

### API (prefixo `/api`)
`auth/login|logout|me`, `clientes`, `produtos`, `pedidos` (+ `/confirmar`, `/cancelar`), `rotas` (+ `/pedidos`,
`/romaneios`), `romaneios` (+ `/itens/{id}/separacao`), `dashboard`, `usuarios`, `auditoria`, `health`.
Listas paginadas: `?page=&page_size=` → `{items, total, page, page_size}`.
Erros: `{"erro": {"codigo", "mensagem", "detalhes"}}`. Documentação interativa em http://localhost:8000/docs.

## O que funciona e o que não funciona

**Funciona e tem teste automatizado:** login/logout/sessão expirada, rotas privadas, dashboard, clientes, produtos
(código único, apelidos), pedidos (itens múltiplos, filtros, confirmar, cancelar com justificativa, edição com revisão),
rotas (incluir/remover, pedidos sem rota), romaneios (geração, visão por produto/cliente/pedidos de origem, versões),
separação (responsável, horário, %, conflito entre usuários), histórico com filtro por período e usuário, isolamento entre empresas.

**Parcial / não verificado:**
- Impressão do romaneio: há CSS de `@media print` (esconde menu e botões, fundo branco), mas a saída impressa não foi conferida.
- Responsivo: pensado para notebook; em tablet o menu lateral só estreita. Não há layout mobile.
- O formulário de pedido carrega até 100 clientes/produtos ativos num `<select>` (sem busca incremental).

**Não implementado (fora do escopo deste protótipo):**
- Gestão de usuários pela interface (usuários só via seed/SQL); reativar cliente/produto inativado.
- Revogação de token no logout (o JWT vale até expirar se tiver sido copiado), limite de tentativas de login, token CSRF
  (a proteção atual é `SameSite=Lax` + CORS restrito + JSON).
- WhatsApp, IA, otimização de rotas, LGPD completa, estimativa de custos, deploy em produção.
