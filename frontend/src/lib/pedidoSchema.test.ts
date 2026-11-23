import { describe, expect, it } from 'vitest'
import { qtd } from './format'
import { itemSchema, pedidoSchema } from './pedidoSchema'

const item = (quantidade: string, unidade: string, extra = {}) =>
  ({ produto_id: 'p1', texto_original: '', quantidade, unidade, ...extra })

describe('itemSchema', () => {
  it.each([['0', 'kg'], ['-1', 'kg'], ['abc', 'kg'], ['1.2345', 'kg'], ['1,5', 'cx'], ['', 'un']])(
    'rejeita quantidade %s %s sem corrigir', (q, u) => {
      expect(itemSchema.safeParse(item(q, u)).success).toBe(false)
    })

  it('aceita vírgula decimal e envia com ponto, sem arredondar', () => {
    const r = itemSchema.parse(item('1,25', 'kg'))
    expect(r.quantidade).toBe('1.25')
  })

  it('exige produto ou descrição', () => {
    expect(itemSchema.safeParse(item('1', 'kg', { produto_id: '' })).success).toBe(false)
    const r = itemSchema.parse(item('1', 'kg', { produto_id: '', texto_original: 'queijo' }))
    expect(r.produto_id).toBeNull()
  })
})

describe('pedidoSchema', () => {
  it('exige fornecedor e ao menos um item', () => {
    const r = pedidoSchema.safeParse({ fornecedor_id: '', data_entrega: '2026-12-01', observacao: '', itens: [] })
    expect(r.success).toBe(false)
    if (!r.success) {
      const campos = r.error.issues.map((i) => i.path[0])
      expect(campos).toContain('fornecedor_id')
      expect(campos).toContain('itens')
    }
  })
})

describe('qtd', () => {
  it('formata sem alterar o valor', () => {
    expect(qtd('15.000')).toBe('15')
    expect(qtd('1.250')).toBe('1,25')
    expect(qtd('100.000')).toBe('100')
    expect(qtd('10')).toBe('10')
  })
})
