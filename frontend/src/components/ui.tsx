import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Link, type LinkProps } from 'react-router-dom'
import { STATUS_PEDIDO, STATUS_ROMANEIO } from '../lib/format'
import type { StatusPedido, StatusRomaneio } from '../types'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-strong text-white hover:bg-brand-hover',
  secondary: 'bg-surface-2 text-ink border border-line-strong hover:bg-line',
  danger: 'bg-transparent text-danger border border-danger/60 hover:bg-danger/10',
  ghost: 'bg-transparent text-ink-2 hover:text-ink hover:bg-surface-2',
}

// "btn" é só um marcador: o Td encolhe botões de ação para a linha da tabela não crescer.
const btn = (variant: Variant, className?: string) =>
  cx('btn inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded px-3.5 text-sm font-medium transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50', VARIANTS[variant], className)

export function Button({ variant = 'primary', loading, className, children, disabled, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button {...p} disabled={disabled || loading} aria-busy={loading || undefined} className={btn(variant, className)}>
      {loading && <Spinner small />}{children}
    </button>
  )
}

/** Navegação com aparência de botão (evita <button> dentro de <a>). */
export const ButtonLink = ({ variant = 'primary', className, ...p }: LinkProps & { variant?: Variant }) =>
  <Link {...p} className={btn(variant, className)} />

const campo = 'w-full rounded border border-line-strong bg-surface-2 px-3 text-sm text-ink ' +
  'focus:border-brand focus-visible:outline-offset-0 disabled:opacity-60 aria-[invalid=true]:border-danger'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => <input ref={ref} {...p} className={cx(campo, 'h-9', className)} />)
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...p }, ref) => <select ref={ref} {...p} className={cx(campo, 'h-9', className)} />)
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} {...p} className={cx(campo, 'py-2', className)} />)

/** Label + controle + mensagem de erro. O filho recebe o id via render prop. */
export function Field({ label, erro, children, className }:
  { label: string; erro?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-ink-2">{label}</label>
      {children(id)}
      {erro && <span role="alert" className="text-xs text-danger">{erro}</span>}
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-md border border-line bg-surface p-4 print-plain', className)}>{children}</div>
}

export function PageHeader({ titulo, sub, acoes }: { titulo: string; sub?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-4">
      <div className="min-w-0">
        <h1 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.011em]">{titulo}</h1>
        {sub && <div className="mt-1.5 text-sm text-muted">{sub}</div>}
      </div>
      {acoes && <div className="no-print flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

const TONS = {
  cinza: 'bg-surface-2 text-ink-2', verde: 'bg-brand/12 text-brand', azul: 'bg-info/12 text-info',
  amarelo: 'bg-warn/12 text-warn', vermelho: 'bg-danger/12 text-danger', roxo: 'bg-done/12 text-done',
}
export function Badge({ tom = 'cinza', children }: { tom?: keyof typeof TONS; children: ReactNode }) {
  return <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-medium leading-4', TONS[tom])}>{children}</span>
}
const TOM_PEDIDO: Record<StatusPedido, keyof typeof TONS> = {
  pendente: 'amarelo', confirmado: 'azul', em_separacao: 'roxo', separado: 'verde', cancelado: 'vermelho',
}
const TOM_ROMANEIO: Record<StatusRomaneio, keyof typeof TONS> = {
  ativo: 'azul', desatualizado: 'amarelo', substituido: 'cinza', concluido: 'verde',
}
// O ponto marca "isto é um status" e separa dos rótulos neutros (unidade, apelido).
const ponto = <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
export const StatusPedidoBadge = ({ s }: { s: StatusPedido }) => <Badge tom={TOM_PEDIDO[s]}>{ponto}{STATUS_PEDIDO[s]}</Badge>
export const StatusRomaneioBadge = ({ s }: { s: StatusRomaneio }) => <Badge tom={TOM_ROMANEIO[s]}>{ponto}{STATUS_ROMANEIO[s]}</Badge>

/** Quantidade + unidade: número tabular à direita, unidade numa casa fixa de 3 caracteres,
 *  para "10 cx", "2,5 kg" e "120 un" alinharem pelo número numa coluna com text-right. */
export const Qtd = ({ v, un, className }: { v: string; un: string; className?: string }) => (
  <span className={cx('whitespace-nowrap', className)}>
    <span className="font-semibold">{v}</span> <span className="inline-block w-[3ch] text-left font-mono text-[0.8em] text-muted">{un}</span>
  </span>
)

/** Cabeçalho de coluna numérica (alinhado à direita, como as células). */
export const Num = ({ children }: { children: ReactNode }) => <span className="block text-right">{children}</span>

export function Spinner({ small }: { small?: boolean }) {
  return <span role="status" aria-label="Carregando"
    className={cx('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', small ? 'h-3.5 w-3.5' : 'h-6 w-6 text-brand')} />
}

export function EmptyState({ titulo, acao }: { titulo: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line-strong/60 py-10 text-center">
      <p className="text-sm text-muted">{titulo}</p>
      {acao}
    </div>
  )
}

export function ErrorState({ erro, onRetry }: { erro: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-md border border-danger/40 bg-danger/5 py-8 text-center">
      <p className="text-sm text-danger">{erro instanceof Error ? erro.message : 'Erro ao carregar'}</p>
      <Button variant="secondary" onClick={onRetry}>Tentar novamente</Button>
    </div>
  )
}

/** Carregando / erro com retry / vazio / conteúdo — o mesmo padrão em todas as telas. */
export function QueryState<T>({ q, vazio, children }:
  { q: UseQueryResult<T>; vazio?: (d: T) => ReactNode | false; children: (d: T) => ReactNode }) {
  if (q.isPending) return <div className="flex justify-center py-10"><Spinner /></div>
  if (q.isError) return <ErrorState erro={q.error} onRetry={() => q.refetch()} />
  const v = vazio?.(q.data)
  return <>{v || children(q.data)}</>
}

export function Modal({ titulo, aberto, onClose, children }:
  { titulo: string; aberto: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus()
    return () => window.removeEventListener('keydown', esc)
  }, [aberto, onClose])
  if (!aberto) return null
  return (
    <div className="no-print fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border border-line-strong/50 bg-surface p-5 shadow-2xl shadow-black/50">
        <h2 className="mb-4 border-b border-line pb-3 text-base font-semibold">{titulo}</h2>
        {children}
      </div>
    </div>
  )
}

export function Pagination({ page, pageSize, total, onPage }:
  { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / pageSize))
  if (paginas <= 1) return null
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted no-print">
      <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
      <span>Página {page} de {paginas}</span>
      <Button variant="ghost" disabled={page >= paginas} onClick={() => onPage(page + 1)}>Próxima</Button>
    </div>
  )
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface print-plain">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-surface-2 text-xs text-ink-2">
          <tr>{head.map((h, i) => <th key={i} className="h-9 whitespace-nowrap px-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}
// Linhas de 36px: botões de ação dentro da célula ficam compactos e não esticam a linha.
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) =>
  <td className={cx('px-3 py-2 align-middle [&_.btn]:-my-1 [&_.btn]:h-7 [&_.btn]:px-2.5', className)}>{children}</td>
