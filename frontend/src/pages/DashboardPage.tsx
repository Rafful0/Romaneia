import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ButtonLink, Card, EmptyState, PageHeader, QueryState } from '../components/ui'
import { dataHora, descreverAtividade } from '../lib/format'
import { api } from '../services/api'

export function DashboardPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 30_000 })
  return (
    <>
      <PageHeader titulo="Dashboard" acoes={<ButtonLink to="/pedidos/novo">Novo pedido</ButtonLink>} />
      <QueryState q={q}>
        {(d) => (
          <>
            {/* Um painel só, com divisórias de 1px (gap sobre fundo de linha), em vez de quatro cartões soltos. */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { rot: 'Pendentes', v: d.pendentes, to: '/pedidos?status=pendente' },
                { rot: 'Confirmados', v: d.confirmados, to: '/pedidos?status=confirmado' },
                { rot: 'Em separação', v: d.em_separacao, to: '/pedidos?status=em_separacao' },
                { rot: 'Sem rota', v: d.sem_rota, to: '/rotas' },
              ].map((c) => (
                <Link key={c.rot} to={c.to} className="rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 shadow-xl shadow-black/25 backdrop-blur-xl transition-colors hover:bg-white/[0.09]">
                  <div className="text-xs font-medium text-ink-2">{c.rot}</div>
                  <div className="mt-1 text-[2rem] font-semibold leading-tight tracking-[-0.02em]" data-testid={`contador-${c.rot}`}>{c.v}</div>
                </Link>
              ))}
            </div>
            <h2 className="mb-2 mt-8 text-sm font-semibold text-ink-2">Atividade recente</h2>
            {d.atividade_recente.length === 0
              ? <EmptyState titulo="Nenhuma atividade ainda." acao={<ButtonLink to="/fornecedores" variant="secondary">Cadastrar fornecedor</ButtonLink>} />
              : (
                <Card className="divide-y divide-white/[0.07] p-0!">
                  {d.atividade_recente.map((a) => (
                    <div key={a.id} className="flex items-baseline gap-4 px-4 py-2 text-sm">
                      <span className="w-32 shrink-0 text-xs text-muted">{dataHora(a.criado_em)}</span>
                      <span><span className="font-medium">{a.usuario_nome ?? 'Sistema'}</span>{' '}
                        <span className="text-ink-2">{descreverAtividade(a.acao, a.entidade, a.detalhes)}</span></span>
                    </div>
                  ))}
                </Card>
              )}
          </>
        )}
      </QueryState>
    </>
  )
}
