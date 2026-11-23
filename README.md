# Romaneia — protótipo funcional

Sistema para organizar **pedidos a fornecedores → rotas → romaneios de separação**. A empresa cria a própria conta e faz,
pela interface, o fluxo completo: criar conta → fornecedores → produtos → pedido → confirmação → envio pelo WhatsApp →
rota → romaneio → separação → histórico, com tudo gravado no PostgreSQL.

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

Na subida, o backend roda `alembic upgrade head`. **Não há dados de demonstração**: o banco começa vazio e o primeiro
acesso é pelo **Criar conta** (abaixo). Para apagar tudo e recomeçar do zero: `docker compose down -v`.

### Criar conta (cadastro self-service)

Na tela de login, **Criar conta** cria uma **empresa nova** com você como admin, por:
- **E-mail** ou **celular** + senha (mín. 8 caracteres), confirmados por um código de 6 dígitos válido por 10 minutos
  (5 tentativas). **No protótipo o código não é enviado de verdade** (`VERIFICACAO_MODO=dev`): ele aparece na própria
  tela, marcado como simulado, e no log do backend. Envio real por e-mail/SMS ainda não foi implementado.
- **Google**, quando configurado (abaixo). Na primeira vez, pede só o nome da empresa. Se já existir uma conta de
  senha com o mesmo e-mail, o Google é **recusado** (não vincula automaticamente): como o código do cadastro não prova
  posse do e-mail no modo dev, quem cadastrou o e-mail de outra pessoa manteria o acesso pela senha.
- O modo simulado precisa ser ligado explicitamente (`VERIFICACAO_MODO=dev`, já é o padrão do docker compose). Sem ele,
  o cadastro por código é recusado em vez de devolver o código.

Depois, o login aceita e-mail **ou** celular (em qualquer formato: `(11) 98765-4321`, `11987654321`, `+55 11 ...`).

### Login com Google (opcional)

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), crie um projeto, configure a
   **tela de consentimento OAuth** (tipo "Externo", modo de teste, com seu e-mail como usuário de teste) e crie uma
   credencial **ID do cliente OAuth** do tipo **Aplicativo da Web**.
2. Em **URIs de redirecionamento autorizados**, adicione `http://localhost:8080/api/auth/google/retorno`
   (troque o host se `APP_URL` for outro).
3. Coloque `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env` e rode `docker compose up -d`.
   O botão "Entrar com Google" aparece sozinho (o frontend consulta `/api/auth/provedores`).

Troque `JWT_SECRET`, `POSTGRES_PASSWORD` e `APP_DB_PASSWORD` em qualquer ambiente que não seja a sua máquina.

### Desenvolvimento sem rebuild

```bash
docker compose up -d db backend
cd frontend && npm install && npm run dev        # http://localhost:5173 (proxy /api -> :8000)
```

Backend local (fora do Docker): `cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt`,
copie `backend/.env.example` para `backend/.env`, rode `alembic upgrade head` e `uvicorn app.main:app --reload`.

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
O pytest usa o mesmo papel `romaneia_app` do compose: se você mudou `APP_DB_PASSWORD` no `.env`, exporte o mesmo valor antes de rodar os testes.
As migrações nunca trocam a senha de um papel que já existe; para trocar, use `ALTER ROLE romaneia_app PASSWORD '...'`.
O E2E cria dados com nomes únicos (`E2E ... <timestamp>`) a cada execução.

## Arquitetura e regras

### Multiempresa e segurança
- Toda tabela de negócio tem `empresa_id`, **RLS habilitado e forçado** (`FORCE ROW LEVEL SECURITY`) e política
  `empresa_id = current_setting('app.empresa_id')`.
- A API conecta com o papel `romaneia_app` (sem `SUPERUSER`/`BYPASSRLS`). Migrações usam o dono do esquema.
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
- **Fornecedores**: cada empresa cadastra os números de WhatsApp de quem fornece para ela (nome, número, observação).
  O número é normalizado (DDI 55) e não pode repetir na mesma empresa; a lista abre a conversa no WhatsApp (wa.me).
- **Pedido é feito a um fornecedor** (ativo, da própria empresa).
- **WhatsApp (link wa.me)**: no pedido, o botão "Enviar no WhatsApp" abre o WhatsApp do usuário com o pedido pronto para
  o número do fornecedor ("Segue o pedido #N da <empresa>", entrega, itens e observação; cancelado avisa com o motivo).
  O envio é manual, então o sistema não registra se a mensagem foi de fato enviada.
- **Separação** com controle otimista por item (`versao`): marcar/desmarcar com versão antiga retorna 409 informando
  quem marcou. Ninguém sobrescreve em silêncio o que outra pessoa fez.

### Papéis
- **admin**: tudo, mais inativar fornecedores e produtos e ver o histórico (auditoria). Quem cria a conta é admin.
- **operador**: cadastros, pedidos, rotas, romaneios e separação.

### API (prefixo `/api`)
`auth/login|logout|me|provedores`, `auth/cadastro/iniciar|confirmar`, `auth/cadastro/google`, `auth/google/iniciar|retorno`, `fornecedores`, `produtos`, `pedidos` (+ `/confirmar`, `/cancelar`), `rotas` (+ `/pedidos`,
`/romaneios`), `romaneios` (+ `/itens/{id}/separacao`), `dashboard`, `usuarios`, `auditoria`, `health`.
Listas paginadas: `?page=&page_size=` → `{items, total, page, page_size}`.
Erros: `{"erro": {"codigo", "mensagem", "detalhes"}}`. Documentação interativa em http://localhost:8000/docs.

## O que funciona e o que não funciona

**Funciona e tem teste automatizado:** criação de conta por e-mail e celular (com código simulado), login por e-mail
ou celular, logout/sessão expirada, rotas privadas, dashboard, fornecedores, produtos (código único, apelidos),
pedidos a fornecedores (itens múltiplos, filtros, confirmar, cancelar com justificativa, edição com revisão), link de
WhatsApp do pedido para o fornecedor, rotas (incluir/remover, pedidos sem rota), romaneios (geração, visão por
produto/fornecedor/pedidos de origem, versões), separação (responsável, horário, %, conflito entre usuários), histórico
com filtro por período e usuário, isolamento entre empresas.

**Parcial / não verificado:**
- Login com Google: o fluxo completo (PKCE, state, nonce, conferência do id_token, vínculo e conta nova) tem testes
  automatizados com o Google **simulado**, mas não foi testado contra o Google de verdade, que exige o Client ID.
- Código de verificação do cadastro: simulado (aparece na tela e no log); não há envio real de e-mail/SMS.
- Impressão do romaneio: há CSS de `@media print` (esconde menu e botões, fundo branco), mas a saída impressa não foi conferida.
- Responsivo: pensado para notebook; em tablet o menu lateral só estreita. Não há layout mobile.
- O formulário de pedido carrega até 100 fornecedores/produtos ativos num `<select>` (sem busca incremental).

**Não implementado (fora do escopo deste protótipo):**
- Gestão de usuários pela interface (convidar funcionários para a empresa); recuperação de senha; reativar fornecedor/produto inativado.
- Revogação de token no logout (o JWT vale até expirar se tiver sido copiado), limite de tentativas de login, token CSRF
  (a proteção atual é `SameSite=Lax` + CORS restrito + JSON).
- Envio automático de WhatsApp (API oficial da Meta), confirmação de entrega/leitura.
- IA, otimização de rotas, LGPD completa, estimativa de custos, deploy em produção.
