import { expect, test, type Page } from '@playwright/test'

// Fluxo completo pela interface, com a API e o PostgreSQL reais:
// login → cliente → produtos → pedido → confirmação → rota → romaneio → separação → histórico,
// recarregando páginas para provar que os dados persistem.
const SENHA = process.env.SEED_PASSWORD ?? 'demo1234'
const ts = Date.now().toString().slice(-7)
const CLIENTE = `E2E Mercado ${ts}`
const P1 = { codigo: `E2E${ts}A`, nome: `E2E Farinha ${ts}`, un: 'cx' }
const P2 = { codigo: `E2E${ts}B`, nome: `E2E Tomate ${ts}`, un: 'kg' }
const ROTA = `E2E Rota ${ts}`
const TIPO = `E2E Padaria ${ts}`

async function toast(page: Page, texto: string | RegExp) {
  await expect(page.getByRole('status').filter({ hasText: texto }).last()).toBeVisible()
}

test('fluxo completo do funcionário, com persistência após recarregar', async ({ page }) => {
  // 1. Rota privada redireciona para o login
  await page.goto('/pedidos')
  await expect(page).toHaveURL(/\/login$/)

  // 2. Login (erro primeiro, depois sucesso)
  await page.getByLabel('E-mail').fill('admin@demo.test')
  await page.getByLabel('Senha').fill('senha-errada')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos')
  await page.getByLabel('Senha').fill(SENHA)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/pedidos$/) // volta para onde tentou ir
  await expect(page.getByRole('heading', { name: 'Pedidos' })).toBeVisible()

  // 3. Tipo de comércio + cliente classificado
  await page.getByRole('link', { name: 'Tipos de comércio' }).click()
  await page.getByRole('button', { name: 'Novo tipo' }).first().click()
  await page.getByRole('dialog').getByLabel('Nome *').fill(TIPO)
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await toast(page, 'Tipo de comércio criado')
  await page.getByRole('link', { name: 'Clientes', exact: true }).click()
  await page.getByRole('button', { name: 'Novo cliente' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Informe o nome')).toBeVisible()
  await page.getByLabel('Nome *').fill(CLIENTE)
  await page.getByLabel('Telefone').fill('(11) 90000-0000')
  await page.getByRole('dialog').getByLabel('Tipo de comércio').selectOption({ label: TIPO })
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
  await toast(page, 'Cliente criado')
  await expect(page.getByRole('cell', { name: CLIENTE })).toBeVisible()

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

  // 5. Pedido com 3 itens: 10 cx e 10 kg do MESMO produto + 2,5 kg de outro
  await page.getByRole('link', { name: 'Pedidos' }).click()
  await page.getByRole('link', { name: 'Novo pedido' }).first().click()
  await page.getByLabel('Cliente *').selectOption({ label: CLIENTE })
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

  // 6. Confirmação
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()
  await toast(page, `Pedido #${numero} confirmado`)
  await page.reload()
  await expect(page.getByText('Confirmado').first()).toBeVisible()
  // WhatsApp (click-to-chat): link para o telefone do cliente com a mensagem do pedido
  const wa = await page.getByRole('link', { name: 'Enviar no WhatsApp' }).getAttribute('href')
  expect(wa).toMatch(/^https:\/\/wa\.me\/5511900000000\?text=/)
  const texto = decodeURIComponent(wa!.split('text=')[1])
  expect(texto).toContain(`Seu pedido #${numero} foi confirmado.`)
  expect(texto).toContain(`- 10 cx ${P1.nome}`)
  expect(texto).toContain(`- 10 kg ${P1.nome}`)

  // Leitura do tipo de comércio: o que clientes desse tipo pedem (por produto + unidade)
  await page.getByRole('link', { name: 'Tipos de comércio' }).click()
  await page.getByRole('row').filter({ hasText: TIPO }).getByRole('link', { name: 'O que pedem' }).click()
  await expect(page.getByRole('heading', { name: `O que pede: ${TIPO}` })).toBeVisible()
  const leitura = page.getByRole('row').filter({ hasText: P1.nome })
  await expect(leitura).toHaveCount(2)
  await expect(leitura.filter({ hasText: '10 cx' })).toContainText('1 de 1 pedidos (100%)')
  await expect(leitura.filter({ hasText: '10 kg' })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: P2.nome })).toContainText('2,5 kg')
  // Sugestão no próximo pedido do mesmo cliente
  await page.getByRole('link', { name: 'Pedidos', exact: true }).click()
  await page.getByRole('link', { name: 'Novo pedido' }).first().click()
  await page.getByLabel('Cliente *').selectOption({ label: CLIENTE })
  await expect(page.getByTestId('sugestoes')).toContainText(`Mais pedidos por clientes do tipo ${TIPO}`)
  await page.getByRole('button', { name: `Adicionar: ${P2.nome} em kg` }).click()
  await expect(itens.nth(0).getByRole('combobox').first()).toHaveValue(/.+/)
  await expect(page.getByRole('button', { name: `Já adicionado: ${P2.nome} em kg` })).toBeDisabled()

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
  await expect(page.getByRole('row').filter({ hasText: `#${numero}` })).toContainText(CLIENTE)

  // 8. Romaneio: consolidação por produto + unidade
  await page.getByRole('button', { name: 'Gerar romaneio' }).click()
  await toast(page, 'Romaneio v1 gerado')
  await expect(page.getByRole('heading', { name: `Romaneio — ${ROTA}` })).toBeVisible()
  const linhas = page.getByRole('row').filter({ hasText: P1.nome })
  await expect(linhas).toHaveCount(2) // 10 cx e 10 kg NÃO são somados
  await expect(linhas.filter({ hasText: '10 cx' })).toHaveCount(1)
  await expect(linhas.filter({ hasText: '10 kg' })).toHaveCount(1)
  await expect(page.getByRole('row').filter({ hasText: P2.nome })).toContainText('2,5 kg')
  await page.getByRole('tab', { name: 'Por cliente' }).click()
  await expect(page.getByRole('heading', { name: CLIENTE })).toBeVisible()
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
  await expect(page.getByText(/Separado por Ana Admin \(demo\) em/).first()).toBeVisible()

  // 10. Persistência: recarregar tudo
  await page.reload()
  await expect(page.getByTestId('percentual')).toHaveText('100%')
  await expect(page.getByText(/Separado por Ana Admin \(demo\)/)).toHaveCount(3)
  await page.goto(romaneioUrl)
  await expect(page.getByText('Concluído').first()).toBeVisible()
  await page.goto(pedidoUrl)
  await expect(page.getByText('Separado').first()).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(ROTA) })).toBeVisible()

  // 11. Histórico (auditoria real) com filtro por usuário
  await page.getByRole('link', { name: 'Histórico' }).click()
  await page.getByLabel('Usuário').selectOption({ label: 'Ana Admin (demo)' })
  for (const txt of [`confirmou pedido #${numero}`, `criou pedido #${numero}`, 'gerou romaneio', 'concluiu romaneio', `criou cliente ${CLIENTE}`]) {
    await expect(page.getByRole('cell', { name: txt }).first()).toBeVisible()
  }
  await page.getByLabel('Usuário').selectOption({ label: 'Otávio Operador (demo)' })
  await expect(page.getByRole('cell', { name: `criou pedido #${numero}` })).toHaveCount(0)

  // 12. Dashboard reflete o banco; logout protege as rotas
  await page.getByRole('link', { name: 'Dashboard' }).click()
  await expect(page.getByText(`confirmou pedido #${numero}`).first()).toBeVisible()
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto(pedidoUrl)
  await expect(page).toHaveURL(/\/login$/)
})
