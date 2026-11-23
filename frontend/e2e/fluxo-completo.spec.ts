import { expect, test, type Page } from '@playwright/test'

// Fluxo completo pela interface, com a API e o PostgreSQL reais (sem dados de demonstração):
// criar conta → login → fornecedor → produtos → pedido → confirmação → WhatsApp → rota → romaneio → separação → histórico,
// recarregando páginas para provar que os dados persistem.
const ts = Date.now().toString().slice(-7)
const SENHA = 'senha-e2e-123'
const NOME = `Ana E2E ${ts}`
const EMAIL = `ana.${ts}@e2e.test`
const EMPRESA = `Padaria E2E ${ts}`
const FORNECEDOR = `E2E Moinho ${ts}`
const P1 = { codigo: `E2E${ts}A`, nome: `E2E Farinha ${ts}`, un: 'cx' }
const P2 = { codigo: `E2E${ts}B`, nome: `E2E Tomate ${ts}`, un: 'kg' }
const ROTA = `E2E Rota ${ts}`

async function toast(page: Page, texto: string | RegExp) {
  await expect(page.getByRole('status').filter({ hasText: texto }).last()).toBeVisible()
}

test('fluxo completo do usuário, com persistência após recarregar', async ({ page }) => {
  // 1. Conta nova pelo cadastro (o banco não tem demonstração)
  await page.goto('/cadastro')
  await page.getByLabel('Seu nome').fill(NOME)
  await page.getByLabel('Nome da empresa').fill(EMPRESA)
  await page.getByRole('textbox', { name: 'E-mail', exact: true }).fill(EMAIL)
  await page.getByLabel('Senha (mín. 8 caracteres)').fill(SENHA)
  await page.getByLabel('Confirmar senha').fill(SENHA)
  await page.getByRole('button', { name: 'Continuar' }).click()
  const codigo = (await page.getByTestId('codigo-dev').textContent())!.trim()
  await page.getByLabel('Código').fill(codigo)
  await page.getByRole('button', { name: 'Confirmar e criar conta' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.getByRole('button', { name: 'Sair' }).click()

  // 2. Rota privada redireciona para o login; erro primeiro, depois sucesso e volta para onde tentou ir
  await page.goto('/pedidos')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('E-mail ou celular').fill(EMAIL)
  await page.getByLabel('Senha').fill('senha-errada')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toContainText('E-mail/celular ou senha incorretos')
  await page.getByLabel('Senha').fill(SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/pedidos$/)
  await expect(page.getByRole('heading', { name: 'Pedidos' })).toBeVisible()

  // 3. Fornecedor com WhatsApp
  await page.getByRole('link', { name: 'Fornecedores' }).click()
  await page.getByRole('button', { name: 'Novo fornecedor' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Informe o nome')).toBeVisible()
  await page.getByRole('dialog').getByLabel('Nome *').fill(FORNECEDOR)
  await page.getByRole('dialog').getByLabel('Número do WhatsApp *').fill('(11) 90000-0000')
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await toast(page, 'Fornecedor cadastrado')
  await expect(page.getByRole('cell', { name: FORNECEDOR, exact: true })).toBeVisible()

  // 4. Produtos (unidades diferentes; apelido pesquisável)
  await page.getByRole('link', { name: 'Produtos' }).click()
  for (const p of [P1, P2]) {
    await page.getByRole('button', { name: 'Novo produto' }).first().click()
    const d = page.getByRole('dialog')
    await d.getByLabel('Código *').fill(p.codigo)
    await d.getByLabel('Nome *').fill(p.nome)
    await d.getByLabel('Unidade *').selectOption(p.un)
    if (p === P1) await d.getByLabel(/Apelidos/).fill(`farinha${ts}`)
    await d.getByRole('button', { name: 'Salvar' }).click()
    await toast(page, 'Produto criado')
  }
  await page.getByLabel('Buscar produtos').fill(`farinha${ts}`)
  await expect(page.getByRole('cell', { name: P1.nome })).toBeVisible()
  await expect(page.getByRole('cell', { name: P2.nome })).toHaveCount(0)
  // código duplicado é recusado
  await page.getByRole('button', { name: 'Novo produto' }).first().click()
  await page.getByRole('dialog').getByLabel('Código *').fill(P1.codigo.toLowerCase())
  await page.getByRole('dialog').getByLabel('Nome *').fill('Duplicado')
  await page.getByRole('dialog').getByLabel('Unidade *').selectOption('un')
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Já existe produto com o código' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()

  // 5. Pedido ao fornecedor com 3 itens: 10 cx e 10 kg do MESMO produto + 2,5 kg de outro
  await page.getByRole('link', { name: 'Pedidos', exact: true }).click()
  await page.getByRole('link', { name: 'Novo pedido' }).first().click()
  await page.getByLabel('Fornecedor *').selectOption({ label: FORNECEDOR })
  const itens = page.getByTestId('item-pedido')
  const preencher = async (n: number, prod: typeof P1, qtd: string, un?: string) => {
    const it = itens.nth(n)
    await it.getByRole('combobox').first().selectOption({ label: `${prod.codigo} — ${prod.nome} (${prod.un})` })
    await it.getByLabel('Quantidade *').fill(qtd)
    if (un) await it.getByLabel('Unidade *').selectOption(un)
  }
  await preencher(0, P1, '1,5') // fracionado em caixa: inválido
  await page.getByRole('button', { name: 'Criar pedido' }).click()
  await expect(page.getByText('Unidade "cx" exige número inteiro')).toBeVisible()
  await preencher(0, P1, '10')
  await page.getByRole('button', { name: 'Adicionar item' }).click()
  await preencher(1, P1, '10', 'kg')
  await page.getByRole('button', { name: 'Adicionar item' }).click()
  await preencher(2, P2, '2,5')
  await page.getByRole('button', { name: 'Criar pedido' }).click()
  await toast(page, /Pedido #\d+ criado/)
  await expect(page.getByText('Pendente').first()).toBeVisible()
  const pedidoUrl = page.url()
  const pedidoId = pedidoUrl.split('/').pop()!
  const numero = (await page.getByRole('heading', { level: 1 }).textContent())!.replace(/\D/g, '')

  // 6. Confirmação + WhatsApp para o fornecedor
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()
  await toast(page, `Pedido #${numero} confirmado`)
  await page.reload()
  await expect(page.getByText('Confirmado').first()).toBeVisible()
  const wa = await page.getByRole('link', { name: 'Enviar no WhatsApp' }).getAttribute('href')
  expect(wa).toMatch(/^https:\/\/wa\.me\/5511900000000\?text=/)
  const texto = decodeURIComponent(wa!.split('text=')[1])
  expect(texto).toContain(`Olá, ${FORNECEDOR}! Segue o pedido #${numero} da ${EMPRESA}.`)
  expect(texto).toContain(`- 10 cx ${P1.nome}`)
  expect(texto).toContain(`- 10 kg ${P1.nome}`)

  // 7. Rota: criar, incluir o pedido
  await page.getByRole('link', { name: 'Rotas' }).click()
  await expect(page.getByRole('link', { name: `#${numero}` })).toBeVisible() // aparece em "Pedidos sem rota"
  await page.getByRole('button', { name: 'Nova rota' }).first().click()
  await page.getByRole('dialog').getByLabel('Nome *').fill(ROTA)
  await page.getByRole('dialog').getByRole('button', { name: 'Criar rota' }).click()
  await expect(page.getByRole('heading', { name: ROTA })).toBeVisible()
  await page.getByLabel('Pedido sem rota').selectOption(pedidoId)
  await page.getByRole('button', { name: 'Incluir', exact: true }).click()
  await toast(page, 'Pedido incluído na rota')
  await expect(page.getByRole('row').filter({ hasText: `#${numero}` })).toContainText(FORNECEDOR)

  // 8. Romaneio: consolidação por produto + unidade
  await page.getByRole('button', { name: 'Gerar romaneio' }).click()
  await toast(page, 'Romaneio v1 gerado')
  await expect(page.getByRole('heading', { name: `Romaneio — ${ROTA}` })).toBeVisible()
  const linhas = page.getByRole('row').filter({ hasText: P1.nome })
  await expect(linhas).toHaveCount(2) // 10 cx e 10 kg NÃO são somados
  await expect(linhas.filter({ hasText: '10 cx' })).toHaveCount(1)
  await expect(linhas.filter({ hasText: '10 kg' })).toHaveCount(1)
  await expect(page.getByRole('row').filter({ hasText: P2.nome })).toContainText('2,5 kg')
  await page.getByRole('tab', { name: 'Por fornecedor' }).click()
  await expect(page.getByRole('heading', { name: FORNECEDOR })).toBeVisible()
  await page.getByRole('tab', { name: 'Pedidos de origem' }).click()
  await expect(page.getByRole('row').filter({ hasText: `#${numero}` })).toBeVisible()
  const romaneioUrl = page.url()

  // 9. Separação com responsável, horário e % de conclusão
  await page.getByRole('link', { name: 'Separação' }).click()
  await expect(page.getByTestId('percentual')).toHaveText('0%')
  for (const alvo of [`${P1.nome} cx`, `${P1.nome} kg`, `${P2.nome} kg`]) {
    await page.getByRole('button', { name: `Marcar como separado ${alvo}` }).click()
    await expect(page.getByRole('button', { name: `Desmarcar ${alvo}` })).toBeVisible()
  }
  await expect(page.getByTestId('percentual')).toHaveText('100%')
  await toast(page, 'Separação concluída!')
  await expect(page.getByText(`Separado por ${NOME} em`).first()).toBeVisible()

  // 10. Persistência: recarregar tudo
  await page.reload()
  await expect(page.getByTestId('percentual')).toHaveText('100%')
  await expect(page.getByText(`Separado por ${NOME}`)).toHaveCount(3)
  await page.goto(romaneioUrl)
  await expect(page.getByText('Concluído').first()).toBeVisible()
  await page.goto(pedidoUrl)
  await expect(page.getByText('Separado').first()).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(ROTA) })).toBeVisible()

  // 11. Histórico (auditoria real) com filtro por usuário
  await page.getByRole('link', { name: 'Histórico' }).click()
  await page.getByLabel('Usuário').selectOption({ label: NOME })
  for (const txt of [`confirmou pedido #${numero}`, `criou pedido #${numero}`, 'gerou romaneio', 'concluiu romaneio',
    `criou fornecedor ${FORNECEDOR}`, 'criou a conta']) {
    await expect(page.getByRole('cell', { name: txt }).first()).toBeVisible()
  }

  // 12. Dashboard reflete o banco; logout protege as rotas
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByText(`confirmou pedido #${numero}`).first()).toBeVisible()
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto(pedidoUrl)
  await expect(page).toHaveURL(/\/login$/)
})
