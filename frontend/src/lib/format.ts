import type { StatusPedido, StatusRomaneio, Unidade } from '../types'

export const UNIDADES: { valor: Unidade; rotulo: string; inteira: boolean }[] = [
  { valor: 'un', rotulo: 'un — unidade', inteira: true },
  { valor: 'cx', rotulo: 'cx — caixa', inteira: true },
  { valor: 'pct', rotulo: 'pct — pacote', inteira: true },
  { valor: 'dz', rotulo: 'dz — dúzia', inteira: true },
  { valor: 'fd', rotulo: 'fd — fardo', inteira: true },
  { valor: 'kg', rotulo: 'kg — quilo', inteira: false },
  { valor: 'g', rotulo: 'g — grama', inteira: false },
  { valor: 'l', rotulo: 'l — litro', inteira: false },
  { valor: 'ml', rotulo: 'ml — mililitro', inteira: false },
]
export const unidadeInteira = (u: string) => UNIDADES.find((x) => x.valor === u)?.inteira ?? false

export const STATUS_PEDIDO: Record<StatusPedido, string> = {
  pendente: 'Pendente', confirmado: 'Confirmado', em_separacao: 'Em separação', separado: 'Separado', cancelado: 'Cancelado',
}
export const STATUS_ROMANEIO: Record<StatusRomaneio, string> = {
  ativo: 'Ativo', desatualizado: 'Desatualizado', substituido: 'Substituído', concluido: 'Concluído',
}

/** "15.000" -> "15"; "1.250" -> "1,25". Formata sem alterar o valor. */
export function qtd(v: string): string {
  const [int, dec = ''] = v.split('.')
  const d = dec.replace(/0+$/, '')
  return d ? `${int},${d}` : int
}

export function data(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function dataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export const hojeISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const ACOES: Record<string, string> = {
  criar: 'criou', editar: 'editou', inativar: 'inativou', confirmar: 'confirmou', cancelar: 'cancelou',
  gerar: 'gerou', invalidar: 'marcou como desatualizado', separar: 'separou item de', desmarcar: 'desmarcou item de',
  associar: 'incluiu pedido na', remover: 'removeu pedido da', concluir: 'concluiu', login: 'entrou no sistema',
}
const ENTIDADES: Record<string, string> = {
  cliente: 'cliente', produto: 'produto', pedido: 'pedido', rota: 'rota', romaneio: 'romaneio',
  romaneio_item: 'romaneio', usuario: '',
}
export function descreverAtividade(acao: string, entidade: string, detalhes: Record<string, unknown>): string {
  const alvo = detalhes.numero ? ` #${detalhes.numero}` : detalhes.nome ? ` ${detalhes.nome}`
    : detalhes.codigo ? ` ${detalhes.codigo}` : detalhes.rota ? ` ${detalhes.rota}` : ''
  const extra = detalhes.pedido ? ` (pedido #${detalhes.pedido})` : detalhes.versao ? ` v${detalhes.versao}` : ''
  return `${ACOES[acao] ?? acao} ${ENTIDADES[entidade] ?? entidade}${alvo}${extra}`.replace(/\s+/g, ' ').trim()
}
