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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { rot: 'Pendentes', v: d.pendentes, to: '/pedidos?status=pendente' },
                { rot: 'Confirmados', v: d.confirmados, to: '/pedidos?status=confirmado' },
                { rot: 'Em separação', v: d.em_separacao, to: '/pedidos?status=em_separacao' },
                { rot: 'Sem rota', v: d.sem_rota, to: '/rotas' },
              ].map((c) => (
                <Link key={c.rot} to={c.to} className="group">
                  <Card className="transition group-hover:border-brand/50">
                    <div className="text-xs text-muted">{c.rot}</div>
                    <div className="mt-1 text-3xl font-semibold" data-testid={`contador-${c.rot}`}>{c.v}</div>
                  </Card>
                </Link>
              ))}
            </div>
            <h2 className="mb-3 mt-8 text-sm font-semibold text-muted">Atividade recente</h2>
            {d.atividade_recente.length === 0
              ? <EmptyState titulo="Nenhuma atividade ainda." acao={<ButtonLink to="/clientes" variant="secondary">Cadastrar cliente</ButtonLink>} />
              : (
                <Card className="divide-y divide-line p-0">
                  {d.atividade_recente.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                      <span><span className="font-medium">{a.usuario_nome ?? 'Sistema'}</span>{' '}
                        <span className="text-muted">{descreverAtividade(a.acao, a.entidade, a.detalhes)}</span></span>
                      <span className="shrink-0 text-xs text-muted">{dataHora(a.criado_em)}</span>
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
