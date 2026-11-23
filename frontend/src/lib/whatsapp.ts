import type { Pedido } from '../types'
import { data, qtd } from './format'

/** Telefone BR -> só dígitos com DDI 55, ou null se não der para saber o número com segurança. */
export function telefoneWhatsApp(tel: string | null | undefined): string | null {
  const d = (tel ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (/^\s*\+/.test(tel ?? '') && !d.startsWith('55')) return null // DDI estrangeiro: não é número BR
  if (d.length === 10 || d.length === 11) return `55${d}` // DDD + número
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return null
}

/** "5511977776666" -> "+55 (11) 97777-6666" (só exibição). */
export function formatarTelefone(d: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d)
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : d
}

/** Mensagem do pedido para o fornecedor (quem compra é a empresa logada). */
export function mensagemPedido(p: Pedido, empresa: string): string {
  if (p.status === 'cancelado') {
    return [
      `Olá, ${p.fornecedor_nome}! O pedido #${p.numero} da ${empresa} foi cancelado.`,
      ...(p.motivo_cancelamento ? [`Motivo: ${p.motivo_cancelamento}`] : []),
    ].join('\n')
  }
  const itens = p.itens.map((i) => `- ${qtd(i.quantidade)} ${i.unidade} ${i.produto_nome ?? i.texto_original ?? ''}`.trimEnd())
  return [
    `Olá, ${p.fornecedor_nome}! Segue o pedido #${p.numero} da ${empresa}.`,
    `Entrega: ${data(p.data_entrega)}`,
    '',
    'Itens:',
    ...itens,
    ...(p.observacao ? ['', `Observação: ${p.observacao}`] : []),
    '',
    'Pode confirmar o recebimento, por favor?',
  ].join('\n')
}

/** Link click-to-chat: abre o WhatsApp do fornecedor com o pedido pronto; quem envia é o usuário. */
export function linkWhatsApp(p: Pedido, empresa: string): string | null {
  const tel = telefoneWhatsApp(p.fornecedor_telefone)
  return tel && `https://wa.me/${tel}?text=${encodeURIComponent(mensagemPedido(p, empresa))}`
}
