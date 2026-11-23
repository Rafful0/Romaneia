import { describe, expect, it } from 'vitest'
import type { Pedido } from '../types'
import { linkWhatsApp, mensagemPedido, telefoneWhatsApp } from './whatsapp'

const pedido = (extra: Partial<Pedido> = {}): Pedido => ({
  id: 'p', numero: 42, cliente_id: 'c', cliente_nome: 'Mercado Bom Preço', cliente_telefone: '(11) 98765-4321',
  rota_id: null, rota_nome: null, rota_data: null, data_entrega: '2026-12-01', status: 'confirmado',
  observacao: null, motivo_cancelamento: null, revisao: 1, criado_em: '', atualizado_em: '', criado_por_nome: 'Ana',
  qtd_itens: 2, nao_identificados: 0,
  itens: [
    { id: '1', posicao: 0, produto_id: 'x', produto_codigo: 'ARR', produto_nome: 'Arroz 5kg', texto_original: null, quantidade: '10.000', unidade: 'cx' },
    { id: '2', posicao: 1, produto_id: 'y', produto_codigo: 'TOM', produto_nome: 'Tomate', texto_original: null, quantidade: '2.500', unidade: 'kg' },
  ],
  ...extra,
})

describe('telefoneWhatsApp', () => {
  it.each([
    ['(11) 98765-4321', '5511987654321'],
    ['11 3333-4444', '551133334444'],
    ['+55 (21) 99999-0000', '5521999990000'],
    ['011 98765-4321', '5511987654321'],
  ])('%s -> %s', (entrada, saida) => expect(telefoneWhatsApp(entrada)).toBe(saida))

  it.each([null, '', '98765-4321', '123', '+1 415 555 0100'])('recusa %s', (t) => expect(telefoneWhatsApp(t)).toBeNull())
})

describe('mensagemPedido', () => {
  it('lista itens com quantidade e unidade, sem somar unidades diferentes', () => {
    const m = mensagemPedido(pedido())
    expect(m).toContain('Seu pedido #42 foi confirmado.')
    expect(m).toContain('Entrega: 01/12/2026')
    expect(m).toContain('- 10 cx Arroz 5kg')
    expect(m).toContain('- 2,5 kg Tomate')
  })

  it('item não identificado usa a descrição original; cancelado mostra o motivo', () => {
    const m = mensagemPedido(pedido({
      status: 'cancelado', motivo_cancelamento: 'Cliente desistiu',
      itens: [{ id: '1', posicao: 0, produto_id: null, produto_codigo: null, produto_nome: null, texto_original: 'queijo minas', quantidade: '2.000', unidade: 'kg' }],
    }))
    expect(m).toContain('foi cancelado.')
    expect(m).toContain('Motivo: Cliente desistiu')
    expect(m).toContain('- 2 kg queijo minas')
  })
})

describe('linkWhatsApp', () => {
  it('monta wa.me com o texto codificado', () => {
    const url = linkWhatsApp(pedido())!
    expect(url.startsWith('https://wa.me/5511987654321?text=')).toBe(true)
    expect(decodeURIComponent(url.split('text=')[1])).toBe(mensagemPedido(pedido()))
  })

  it('sem telefone válido não gera link', () => {
    expect(linkWhatsApp(pedido({ cliente_telefone: null }))).toBeNull()
  })
})
