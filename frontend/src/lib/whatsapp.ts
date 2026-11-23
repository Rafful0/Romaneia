import type { Pedido, StatusPedido } from '../types'
import { data, qtd } from './format'

/** Telefone BR -> só dígitos com DDI 55, ou null se não der para saber o número com segurança. */
export function telefoneWhatsApp(tel: string | null | undefined): string | null {
  const d = (tel ?? '').replace(/\D/g, '').replace(/^0+/, '')
  if (/^\s*\+/.test(tel ?? '') && !d.startsWith('55')) return null // DDI estrangeiro: não é número BR
  if (d.length === 10 || d.length === 11) return `55${d}` // DDD + número
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d
  return null
}

const SITUACAO: Record<StatusPedido, string> = {
  pendente: 'foi recebido',
  confirmado: 'foi confirmado',
  em_separacao: 'está em separação',
  separado: 'está separado e pronto para entrega',
  cancelado: 'foi cancelado',
}

export function mensagemPedido(p: Pedido): string {
  const itens = p.itens.map((i) => `- ${qtd(i.quantidade)} ${i.unidade} ${i.produto_nome ?? i.texto_original ?? ''}`.trimEnd())
  return [
    `Olá, ${p.cliente_nome}! Seu pedido #${p.numero} ${SITUACAO[p.status]}.`,
    p.status === 'cancelado' && p.motivo_cancelamento ? `Motivo: ${p.motivo_cancelamento}` : `Entrega: ${data(p.data_entrega)}`,
    '',
    'Itens:',
    ...itens,
    '',
    'Qualquer dúvida, é só responder esta mensagem.',
  ].join('\n')
}

/** Link click-to-chat: abre o WhatsApp com a mensagem pronta; quem envia é o funcionário. */
export function linkWhatsApp(p: Pedido): string | null {
  const tel = telefoneWhatsApp(p.cliente_telefone)
  return tel && `https://wa.me/${tel}?text=${encodeURIComponent(mensagemPedido(p))}`
}
