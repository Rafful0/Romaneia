import { expect, test, type Page } from '@playwright/test'

// Cadastro self-service pela interface: e-mail e celular (código simulado do protótipo),
// fornecedor com WhatsApp, sair e entrar de novo com a conta criada.
const ts = Date.now().toString().slice(-8)
const SENHA = 'senha-e2e-123'
const EMPRESA = `Padaria E2E ${ts}`
const EMAIL = `maria.${ts}@e2e.test`
const CELULAR = `(11) 9${ts.slice(0, 4)}-${ts.slice(4)}`

async function criarConta(page: Page, metodo: 'E-mail' | 'Celular', destino: string, empresa: string) {
  await page.goto('/login')
  await page.getByRole('link', { name: 'Criar conta' }).click()
  await expect(page.getByRole('heading', { name: 'Criar conta' })).toBeVisible()
  await page.getByRole('radio', { name: metodo }).check({ force: true }) // input visualmente oculto; o rótulo é o alvo do clique
  await page.getByLabel('Seu nome').fill('Maria E2E')
  await page.getByLabel('Nome da empresa').fill(empresa)
  await page.getByRole('textbox', { name: metodo === 'E-mail' ? 'E-mail' : 'Celular (com DDD)', exact: true }).fill(destino)
  await page.getByLabel('Senha (mín. 8 caracteres)').fill(SENHA)
  await page.getByLabel('Confirmar senha').fill(SENHA)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: metodo === 'E-mail' ? 'Confirme seu e-mail' : 'Confirme seu celular' })).toBeVisible()
  return (await page.getByTestId('codigo-dev').textContent())!.trim()
}

async function confirmar(page: Page, codigo: string) {
  await page.getByLabel('Código').fill(codigo)
  await page.getByRole('button', { name: 'Confirmar e criar conta' }).click()
}

async function sair(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

async function entrar(page: Page, login: string) {
  await page.getByLabel('E-mail ou celular').fill(login)
  await page.getByLabel('Senha').fill(SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

test('cliente cria conta por e-mail, cadastra fornecedor e entra de novo', async ({ page }) => {
  // validação antes de enviar
  await page.goto('/cadastro')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByText('Informe seu nome')).toBeVisible()

  const codigo = await criarConta(page, 'E-mail', EMAIL, EMPRESA)
  await confirmar(page, codigo === '000000' ? '111111' : '000000')
  await expect(page.getByRole('alert')).toContainText('Código incorreto')
  await confirmar(page, codigo)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText(EMPRESA)).toBeVisible() // nova empresa, já logado como admin
  await expect(page.getByText('Administrador')).toBeVisible()

  // fornecedor com número de WhatsApp
  await page.getByRole('link', { name: 'Fornecedores' }).click()
  await page.getByRole('button', { name: 'Novo fornecedor' }).first().click()
  const d = page.getByRole('dialog')
  await d.getByLabel('Número do WhatsApp *').fill('1234')
  await d.getByLabel('Nome *').fill('Moinho E2E')
  await d.getByRole('button', { name: 'Salvar' }).click()
  await expect(d.getByText('Número inválido')).toBeVisible()
  await d.getByLabel('Número do WhatsApp *').fill('(11) 97777-6666')
  await d.getByLabel('Observação').fill('Farinha e fermento')
  await d.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Fornecedor cadastrado' }).last()).toBeVisible()
  const wa = page.getByRole('link', { name: 'Abrir conversa com Moinho E2E no WhatsApp' })
  await expect(wa).toHaveAttribute('href', 'https://wa.me/5511977776666')
  await expect(wa).toContainText('+55 (11) 97777-6666')

  // mesmo número duas vezes é recusado
  await page.getByRole('button', { name: 'Novo fornecedor' }).first().click()
  await page.getByRole('dialog').getByLabel('Nome *').fill('Duplicado')
  await page.getByRole('dialog').getByLabel('Número do WhatsApp *').fill('11977776666')
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Este número já é do fornecedor Moinho E2E' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()

  // sair e entrar de novo com o e-mail criado; dados persistem
  await sair(page)
  await entrar(page, EMAIL.toUpperCase())
  await page.getByRole('link', { name: 'Fornecedores' }).click()
  await page.reload()
  await expect(page.getByRole('cell', { name: 'Moinho E2E', exact: true })).toBeVisible()

  // dados de outras contas não aparecem aqui (empresas isoladas)
  await page.getByRole('link', { name: 'Produtos' }).click()
  await expect(page.getByText('Nenhum produto cadastrado.')).toBeVisible()
})

test('cliente cria conta pelo celular e entra com o número', async ({ page }) => {
  const codigo = await criarConta(page, 'Celular', CELULAR, `${EMPRESA} (cel)`)
  await expect(page.getByText(`+55 ${CELULAR}`)).toBeVisible()
  await confirmar(page, codigo)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await sair(page)
  await entrar(page, CELULAR.replace(/\D/g, '')) // só dígitos também funciona
  await expect(page.getByText(`${EMPRESA} (cel)`)).toBeVisible()

  // o mesmo celular não cria outra conta
  await sair(page)
  await page.getByRole('link', { name: 'Criar conta' }).click()
  await page.getByRole('radio', { name: 'Celular' }).check({ force: true })
  await page.getByLabel('Seu nome').fill('Outra')
  await page.getByLabel('Nome da empresa').fill('Outra')
  await page.getByLabel('Celular (com DDD)').fill(CELULAR)
  await page.getByLabel('Senha (mín. 8 caracteres)').fill(SENHA)
  await page.getByLabel('Confirmar senha').fill(SENHA)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('alert')).toContainText('Já existe uma conta com este celular')
})
