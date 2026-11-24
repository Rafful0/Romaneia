import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/render'
import type { Pedido } from '../types'
import { PedidoDetalhePage } from './PedidoDetalhePage'

afterEach(() => vi.restoreAllMocks())

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const pedido = (extra: Partial<Pedido> = {}): Pedido => ({
  id: 'p1', numero: 7, fornecedor_id: 'f', fornecedor_nome: 'Moinho', fornecedor_telefone: '5511977776666',
  rota_id: null, rota_nome: null, rota_data: null, data_entrega: '2026-12-01', status: 'confirmado', observacao: null,
  motivo_cancelamento: null, revisao: 1, criado_em: '2026-11-20T10:00:00Z', atualizado_em: '', criado_por_nome: 'Ana',
  qtd_itens: 1, nao_identificados: 0,
  itens: [{ id: 'i', posicao: 0, produto_id: 'x', produto_codigo: 'FAR', produto_nome: 'Farinha', texto_original: null, quantidade: '10.000', unidade: 'fd' }],
  envios_whatsapp: [{ id: 'e1', motivo: 'pedido', status: 'falhou', tipo_mensagem: 'texto', telefone: '5511977776666',
    erro: 'Fora da janela de 24 h: o fornecedor precisa ter mandado mensagem', criado_em: '', atualizado_em: '2026-11-20T10:01:00Z' }],
  ...extra,
})

function montar(automatico: boolean, p: Pedido) {
  const f = vi.spyOn(globalThis, 'fetch').mockImplementation(async (u, init) => {
    const url = String(u)
    if (url.endsWith('/whatsapp/status')) return json({ automatico, modelo: false })
    if (url.endsWith('/auth/me')) return json({ id: 'u', nome: 'Ana', papel: 'admin', empresa: 'Padaria' })
    if (url.endsWith('/pedidos/p1/whatsapp') && init?.method === 'POST') {
      return json(pedido({ envios_whatsapp: [{ ...p.envios_whatsapp[0], id: 'e2', status: 'enviado', erro: null }, ...p.envios_whatsapp] }), 202)
    }
    return json(p)
  })
  renderApp(<Routes><Route path="/pedidos/:id" element={<PedidoDetalhePage />} /></Routes>, '/pedidos/p1')
  return f
}

describe('PedidoDetalhePage — WhatsApp automático', () => {
  it('mostra a falha com o motivo e reenvia', async () => {
    const f = montar(true, pedido())
    expect(await screen.findByText('Falhou')).toBeInTheDocument()
    expect(screen.getByText(/Fora da janela de 24 h/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar' }))
    expect(await screen.findByText('Enviado')).toBeInTheDocument()
    expect(f.mock.calls.some(([u, i]) => String(u).endsWith('/pedidos/p1/whatsapp') && i?.method === 'POST')).toBe(true)
    expect(screen.getByRole('link', { name: 'Abrir no WhatsApp' })).toHaveAttribute('href', expect.stringContaining('wa.me/5511977776666'))
  })

  it('sem configuração mantém só o link manual', async () => {
    montar(false, pedido({ envios_whatsapp: [] }))
    expect(await screen.findByRole('link', { name: 'Enviar no WhatsApp' })).toBeInTheDocument()
    expect(screen.queryByText('WhatsApp do fornecedor')).not.toBeInTheDocument()
  })
})
