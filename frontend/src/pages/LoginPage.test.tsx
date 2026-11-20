import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import { LoginPage } from './LoginPage'

afterEach(() => vi.restoreAllMocks())

describe('LoginPage', () => {
  it('valida campos antes de chamar a API', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
    renderApp(<LoginPage />, '/login')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Informe o e-mail')).toBeInTheDocument()
    expect(screen.getByText('Informe a senha')).toBeInTheDocument()
    expect(f).not.toHaveBeenCalled()
  })

  it('mostra erro da API e bloqueia o botão durante o envio', async () => {
    let responder!: (r: Response) => void
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((ok) => { responder = ok }))
    renderApp(<LoginPage />, '/login')
    await userEvent.type(screen.getByLabelText('E-mail'), 'admin@demo.test')
    await userEvent.type(screen.getByLabelText('Senha'), 'errada')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /Entrar/ })).toBeDisabled())
    responder(new Response(JSON.stringify({ erro: { codigo: 'credenciais_invalidas', mensagem: 'E-mail ou senha incorretos' } }), { status: 401 }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos')
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()
  })
})
