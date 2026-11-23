import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import { LoginPage } from './LoginPage'

afterEach(() => vi.restoreAllMocks())

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const chamadasLogin = (f: { mock: { calls: unknown[][] } }) => f.mock.calls.filter(([u]) => String(u).includes('/auth/login'))

describe('LoginPage', () => {
  it('valida campos antes de chamar a API', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { google: false, verificacao_simulada: true }))
    renderApp(<LoginPage />, '/login')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Informe o e-mail ou celular')).toBeInTheDocument()
    expect(screen.getByText('Informe a senha')).toBeInTheDocument()
    expect(chamadasLogin(f)).toHaveLength(0)
  })

  it('mostra erro da API e bloqueia o botão durante o envio', async () => {
    let responder!: (r: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation((u) => String(u).includes('/auth/login')
      ? new Promise((ok) => { responder = ok })
      : Promise.resolve(json(200, { google: false, verificacao_simulada: true })))
    renderApp(<LoginPage />, '/login')
    await userEvent.type(screen.getByLabelText('E-mail ou celular'), '(11) 98765-4321')
    await userEvent.type(screen.getByLabelText('Senha'), 'errada')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Entrar/ })).toBeDisabled())
    responder(json(401, { erro: { codigo: 'credenciais_invalidas', mensagem: 'E-mail/celular ou senha incorretos' } }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail/celular ou senha incorretos')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })

  it('mostra o botão do Google só quando está configurado', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { google: true, verificacao_simulada: true }))
    renderApp(<LoginPage />, '/login')
    const google = await screen.findByRole('link', { name: 'Entrar com Google' })
    expect(google).toHaveAttribute('href', '/api/auth/google/iniciar')
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/cadastro')
  })

  it('avisa quando o Google recusou o login', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { google: true, verificacao_simulada: true }))
    renderApp(<LoginPage />, '/login?erro=google')
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível entrar com o Google')
  })
})
