import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Link, type LinkProps } from 'react-router-dom'
import { STATUS_PEDIDO, STATUS_ROMANEIO } from '../lib/format'
import type { StatusPedido, StatusRomaneio } from '../types'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-strong text-white hover:bg-brand',
  secondary: 'bg-surface-2 text-ink border border-line hover:border-muted',
  danger: 'bg-transparent text-danger border border-danger/50 hover:bg-danger/10',
  ghost: 'bg-transparent text-muted hover:text-ink hover:bg-surface-2',
}

const btn = (variant: Variant, className?: string) =>
  cx('inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition',
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

const campo = 'w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted/70 ' +
  'focus:border-brand focus:outline-none aria-[invalid=true]:border-danger'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => <input ref={ref} {...p} className={cx(campo, className)} />)
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...p }, ref) => <select ref={ref} {...p} className={cx(campo, className)} />)
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} {...p} className={cx(campo, className)} />)

/** Label + controle + mensagem de erro. O filho recebe o id via render prop. */
export function Field({ label, erro, children, className }:
  { label: string; erro?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId()
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted">{label}</label>
      {children(id)}
      {erro && <span role="alert" className="text-xs text-danger">{erro}</span>}
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-lg border border-line bg-surface p-4 print-plain', className)}>{children}</div>
}

export function PageHeader({ titulo, sub, acoes }: { titulo: string; sub?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{titulo}</h1>
        {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
      </div>
      {acoes && <div className="no-print flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

const TONS = {
  cinza: 'bg-surface-2 text-muted border-line', verde: 'bg-brand/10 text-brand border-brand/30',
  azul: 'bg-sky-400/10 text-sky-300 border-sky-400/30', amarelo: 'bg-warn/10 text-warn border-warn/30',
  vermelho: 'bg-danger/10 text-danger border-danger/30', roxo: 'bg-violet-400/10 text-violet-300 border-violet-400/30',
}
export function Badge({ tom = 'cinza', children }: { tom?: keyof typeof TONS; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', TONS[tom])}>{children}</span>
}
const TOM_PEDIDO: Record<StatusPedido, keyof typeof TONS> = {
  pendente: 'amarelo', confirmado: 'azul', em_separacao: 'roxo', separado: 'verde', cancelado: 'vermelho',
}
const TOM_ROMANEIO: Record<StatusRomaneio, keyof typeof TONS> = {
  ativo: 'azul', desatualizado: 'amarelo', substituido: 'cinza', concluido: 'verde',
}
export const StatusPedidoBadge = ({ s }: { s: StatusPedido }) => <Badge tom={TOM_PEDIDO[s]}>{STATUS_PEDIDO[s]}</Badge>
export const StatusRomaneioBadge = ({ s }: { s: StatusRomaneio }) => <Badge tom={TOM_ROMANEIO[s]}>{STATUS_ROMANEIO[s]}</Badge>

export function Spinner({ small }: { small?: boolean }) {
  return <span role="status" aria-label="Carregando"
    className={cx('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', small ? 'h-3.5 w-3.5' : 'h-6 w-6 text-brand')} />
}

export function EmptyState({ titulo, acao }: { titulo: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line py-10 text-center">
      <p className="text-sm text-muted">{titulo}</p>
      {acao}
    </div>
  )
}

export function ErrorState({ erro, onRetry }: { erro: unknown; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-danger/40 bg-danger/5 py-8 text-center">
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
    <div className="no-print fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-surface p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">{titulo}</h2>
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
    <div className="overflow-x-auto rounded-lg border border-line print-plain">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
          <tr>{head.map((h, i) => <th key={i} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) =>
  <td className={cx('px-3 py-2 align-middle', className)}>{children}</td>
