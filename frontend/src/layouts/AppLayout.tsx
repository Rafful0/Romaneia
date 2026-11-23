import { useMutation, useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { api } from '../services/api'
import type { Usuario } from '../types'

// Ordem do fluxo do dia (pedido → rota → romaneio), depois cadastros, depois auditoria; `quebra` abre um grupo.
const LINKS = [
  { to: '/', rotulo: 'Dashboard', fim: true },
  { to: '/pedidos', rotulo: 'Pedidos' },
  { to: '/rotas', rotulo: 'Rotas' },
  { to: '/romaneios', rotulo: 'Romaneios' },
  { to: '/clientes', rotulo: 'Clientes', quebra: true },
  { to: '/tipos-comercio', rotulo: 'Tipos de comércio' },
  { to: '/produtos', rotulo: 'Produtos' },
  { to: '/historico', rotulo: 'Histórico', admin: true, quebra: true },
]

export function AppLayout({ usuario }: { usuario: Usuario }) {
  const qc = useQueryClient()
  const nav = useNavigate()
  const toast = useToast()
  const sair = useMutation({
    mutationFn: api.auth.logout,
    onSuccess: () => { qc.clear(); qc.setQueryData(['me'], null); nav('/login') },
    onError: toast.erro,
  })
  return (
    <div className="flex h-full">
      <aside className="no-print flex w-56 shrink-0 flex-col border-r border-line bg-surface max-md:w-44">
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
          <span aria-hidden className="size-2.5 rounded-[2px] bg-brand" />
          <span className="text-[0.9375rem] font-semibold tracking-[-0.01em]">Romaneia</span>
        </div>
        <nav className="flex flex-1 flex-col gap-px px-2 py-3" aria-label="Principal">
          {LINKS.filter((l) => !l.admin || usuario.papel === 'admin').map((l) => (
            <NavLink key={l.to} to={l.to} end={l.fim}
              className={({ isActive }) => 'relative rounded px-3 py-1.5 text-sm transition-colors ' + (l.quebra ? 'mt-4 ' : '') + (isActive
                ? 'bg-surface-2 font-medium text-ink before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand'
                : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
              {l.rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-4 text-xs">
          <div className="font-medium text-ink">{usuario.nome}</div>
          <div className="text-muted">{usuario.empresa}</div>
          <div className="mb-3 text-muted">{usuario.papel === 'admin' ? 'Administrador' : 'Operador'}</div>
          <Button variant="secondary" className="w-full" loading={sair.isPending} onClick={() => sair.mutate()}>Sair</Button>
        </div>
      </aside>
      {/* Conteúdo alinhado à barra lateral (não centralizado): tabelas largas usam a tela toda. */}
      <main className="flex-1 overflow-y-auto px-8 py-6 max-md:px-4 max-md:py-4">
        <div className="max-w-[88rem]"><Outlet /></div>
      </main>
    </div>
  )
}
