import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, EVENTO_401 } from './api'

const resposta = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.restoreAllMocks())

describe('api', () => {
  it('envia cookie e monta query sem valores vazios', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(resposta(200, { items: [], total: 0, page: 1, page_size: 20 }))
    await api.pedidos.listar({ status: 'pendente', de: '', ate: null, page: 2 })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/pedidos?status=pendente&page=2')
    expect((init as RequestInit).credentials).toBe('include')
  })

  it('converte erro padronizado em ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      resposta(409, { erro: { codigo: 'conflito_separacao', mensagem: 'Alterado por outra pessoa', detalhes: { versao_atual: 2 } } }))
    const e = await api.romaneios.separar('r', 'i', true, 1).catch((x) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(409)
    expect(e.codigo).toBe('conflito_separacao')
    expect(e.message).toBe('Alterado por outra pessoa')
  })

  it('401 fora do login dispara evento de sessão expirada', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(resposta(401, { erro: { codigo: 'sessao_expirada', mensagem: 'expirou' } }))
    const ouvinte = vi.fn()
    window.addEventListener(EVENTO_401, ouvinte)
    await api.fornecedores.listar({}).catch(() => {})
    await api.auth.login('a@b.c', 'x').catch(() => {})
    window.removeEventListener(EVENTO_401, ouvinte)
    expect(ouvinte).toHaveBeenCalledTimes(1)
  })

  it('falha de rede vira mensagem amigável', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const e = await api.dashboard().catch((x) => x)
    expect(e.codigo).toBe('rede')
  })
})
