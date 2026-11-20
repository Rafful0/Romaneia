import { useMutation, useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { api } from '../services/api'
import type { Usuario } from '../types'

const LINKS = [
  { to: '/', rotulo: 'Dashboard', fim: true },
  { to: '/pedidos', rotulo: 'Pedidos' },
  { to: '/clientes', rotulo: 'Clientes' },
  { to: '/produtos', rotulo: 'Produtos' },
  { to: '/rotas', rotulo: 'Rotas' },
  { to: '/romaneios', rotulo: 'Romaneios' },
  { to: '/historico', rotulo: 'Histórico', admin: true },
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
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-strong text-sm font-bold text-white">R</span>
          <span className="font-semibold tracking-tight">Romaneia</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Principal">
          {LINKS.filter((l) => !l.admin || usuario.papel === 'admin').map((l) => (
            <NavLink key={l.to} to={l.to} end={l.fim}
              className={({ isActive }) => 'rounded-md px-3 py-2 text-sm transition ' + (isActive
                ? 'bg-brand/10 font-medium text-brand' : 'text-muted hover:bg-surface-2 hover:text-ink')}>
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
      <main className="flex-1 overflow-y-auto p-6 max-md:p-4">
        <div className="mx-auto max-w-6xl"><Outlet /></div>
      </main>
    </div>
  )
}
