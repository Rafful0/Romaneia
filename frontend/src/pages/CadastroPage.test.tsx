import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import { CadastroPage, cadastroSchema } from './CadastroPage'

afterEach(() => vi.restoreAllMocks())

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const base = { metodo: 'email' as const, destino: 'a@b.co', nome: 'Ana', empresa: 'Padaria', senha: '12345678', confirmar: '12345678' }

describe('cadastroSchema', () => {
  it('aceita e-mail ou celular válidos', () => {
    expect(cadastroSchema.safeParse(base).success).toBe(true)
    expect(cadastroSchema.safeParse({ ...base, metodo: 'telefone', destino: '(11) 98765-4321' }).success).toBe(true)
  })
  it.each([
    [{ destino: 'sem-arroba' }, 'destino'],
    [{ metodo: 'telefone', destino: '1234' }, 'destino'],
    [{ senha: '1234567', confirmar: '1234567' }, 'senha'],
    [{ confirmar: 'outra-senha' }, 'confirmar'],
    [{ empresa: '  ' }, 'empresa'],
  ])('recusa %o', (troca, campo) => {
    const r = cadastroSchema.safeParse({ ...base, ...troca })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain(campo)
  })
})

describe('CadastroPage', () => {
  it('pede o código depois dos dados e mostra o código simulado do protótipo', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async (u) => String(u).includes('/cadastro/iniciar')
      ? json(201, { cadastro_id: 'c1', metodo: 'telefone', destino: '5511987654321', expira_em: '', codigo_dev: '482913' })
      : json(200, { google: false, verificacao_simulada: true }))
    renderApp(<CadastroPage />, '/cadastro')
    await userEvent.click(screen.getByLabelText('Celular'))
    await userEvent.type(screen.getByLabelText('Seu nome'), 'Ana')
    await userEvent.type(screen.getByLabelText('Nome da empresa'), 'Padaria da Ana')
    await userEvent.type(screen.getByLabelText('Celular (com DDD)'), '11 98765-4321')
    await userEvent.type(screen.getByLabelText('Senha (mín. 8 caracteres)'), 'senha-forte')
    await userEvent.type(screen.getByLabelText('Confirmar senha'), 'senha-forte')
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { name: 'Confirme seu celular' })).toBeInTheDocument()
    expect(screen.getByText('+55 (11) 98765-4321')).toBeInTheDocument()
    expect(screen.getByTestId('codigo-dev')).toHaveTextContent('482913')
    const corpo = JSON.parse(String((f.mock.calls.find(([u]) => String(u).includes('/cadastro/iniciar'))![1] as RequestInit).body))
    expect(corpo).toEqual({ metodo: 'telefone', destino: '11 98765-4321', nome: 'Ana', empresa: 'Padaria da Ana', senha: 'senha-forte' })
  })
})
