import { z } from 'zod'
import type { PedidoIn, Unidade } from '../types'
import { UNIDADES, unidadeInteira } from './format'

const UN = UNIDADES.map((u) => u.valor) as [Unidade, ...Unidade[]]

export const itemSchema = z.object({
  produto_id: z.string(),
  texto_original: z.string().trim().max(500),
  quantidade: z.string().trim(),
  unidade: z.enum(UN, { message: 'Escolha a unidade' }),
}).superRefine((it, ctx) => {
  if (!it.produto_id && !it.texto_original) {
    ctx.addIssue({ code: 'custom', path: ['texto_original'], message: 'Escolha um produto ou descreva o item' })
  }
  const q = it.quantidade.replace(',', '.') // vírgula decimal pt-BR; nenhum outro ajuste no valor
  if (!/^\d+(\.\d{1,3})?$/.test(q) || Number(q) <= 0) {
    ctx.addIssue({ code: 'custom', path: ['quantidade'], message: 'Quantidade deve ser > 0 (até 3 casas decimais)' })
  } else if (unidadeInteira(it.unidade) && !Number.isInteger(Number(q))) {
    ctx.addIssue({ code: 'custom', path: ['quantidade'], message: `Unidade "${it.unidade}" exige número inteiro` })
  }
}).transform((it) => ({
  produto_id: it.produto_id || null,
  texto_original: it.texto_original || null,
  quantidade: it.quantidade.replace(',', '.'),
  unidade: it.unidade,
}))

export const pedidoSchema = z.object({
  cliente_id: z.string().min(1, 'Escolha o cliente'),
  data_entrega: z.string().min(1, 'Informe a data de entrega'),
  observacao: z.string().trim().max(500).transform((v) => v || null),
  itens: z.array(itemSchema).min(1, 'Adicione ao menos um item'),
}) satisfies z.ZodType<PedidoIn, z.ZodTypeDef, unknown>

export type PedidoForm = z.input<typeof pedidoSchema>
export const itemVazio = (): PedidoForm['itens'][number] =>
  ({ produto_id: '', texto_original: '', quantidade: '', unidade: '' as Unidade })
