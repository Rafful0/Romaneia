import { useMutation, useQueryClient } from '@tanstack/react-query'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
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
  { to: '/fornecedores', rotulo: 'Fornecedores', quebra: true },
  { to: '/produtos', rotulo: 'Produtos' },
  { to: '/historico', rotulo: 'Histórico', admin: true, quebra: true },
]

/** Fundo da área interna: o mesmo da tela de login, mais discreto para não competir com as tabelas. */
function FundoInterno() {
  return (
    <div aria-hidden className="no-print pointer-events-none absolute inset-0">
      <div className="absolute -top-40 -right-32 size-[34rem] rounded-full bg-brand/12 blur-3xl" />
      <div className="absolute -bottom-48 left-1/4 size-[30rem] rounded-full bg-whatsapp/[0.07] blur-3xl" />
      <svg className="absolute top-[45%] right-6 h-24 w-36 text-brand/15" viewBox="0 0 144 96">
        <defs><pattern id="pontos-app" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="currentColor" /></pattern></defs>
        <rect width="144" height="96" fill="url(#pontos-app)" />
      </svg>
      <div className="absolute -right-10 -bottom-10 size-40 rounded-full border-[14px] border-brand/[0.08]" />
      <svg className="absolute bottom-8 left-64 h-8 w-40 text-whatsapp/[0.12]" viewBox="0 0 176 40" fill="none">
        <path d="M4 20c14-16 28-16 42 0s28 16 42 0 28-16 42 0 28 16 42 0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </svg>
    </div>
  )
}

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
    <div className="app-fundo relative flex h-full overflow-hidden bg-linear-to-br from-[#0f2c1d] via-bg to-[#0a2116]">
      <FundoInterno />
      <aside className="no-print relative z-10 flex w-56 shrink-0 flex-col border-r border-white/10 bg-white/[0.04] backdrop-blur-xl max-md:w-44">
        <div className="flex h-14 items-center border-b border-white/10 px-4">
          <Logo />
        </div>
        <nav className="flex flex-1 flex-col gap-px px-2 py-3" aria-label="Principal">
          {LINKS.filter((l) => !l.admin || usuario.papel === 'admin').map((l) => (
            <NavLink key={l.to} to={l.to} end={l.fim}
              className={({ isActive }) => 'relative rounded-md px-3 py-1.5 text-sm transition-colors ' + (l.quebra ? 'mt-4 ' : '') + (isActive
                ? 'bg-white/10 font-medium text-ink before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-brand'
                : 'text-ink-2 hover:bg-white/[0.06] hover:text-ink')}>
              {l.rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 text-xs">
          <div className="font-medium text-ink">{usuario.nome}</div>
          <div className="text-muted">{usuario.empresa}</div>
          <div className="mb-3 text-muted">{usuario.papel === 'admin' ? 'Administrador' : 'Operador'}</div>
          <Button variant="secondary" className="w-full" loading={sair.isPending} onClick={() => sair.mutate()}>Sair</Button>
        </div>
      </aside>
      {/* Conteúdo alinhado à barra lateral (não centralizado): tabelas largas usam a tela toda. */}
      <main className="relative z-10 flex-1 overflow-y-auto px-8 py-6 max-md:px-4 max-md:py-4">
        <div className="max-w-[88rem]"><Outlet /></div>
      </main>
    </div>
  )
}
