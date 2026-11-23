import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ButtonLink, Button, Card, PageHeader, Qtd, QueryState, StatusRomaneioBadge } from '../components/ui'
import { useToast } from '../hooks/useToast'
import { dataHora, qtd } from '../lib/format'
import { ApiError, api } from '../services/api'
import type { RomaneioItem } from '../types'

export function SeparacaoPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  // Recarrega a cada 10s para mostrar o que outras pessoas marcaram.
  const q = useQuery({ queryKey: ['romaneio', id], queryFn: () => api.romaneios.obter(id!), refetchInterval: 10_000 })
  const m = useMutation({
    mutationFn: (it: RomaneioItem) => api.romaneios.separar(id!, it.id, !it.separado_em, it.versao),
    onSuccess: (r) => {
      qc.setQueryData(['romaneio', id], r)
      for (const k of ['romaneios', 'pedidos', 'dashboard', 'rota']) qc.invalidateQueries({ queryKey: [k] })
      if (r.status === 'concluido') toast.ok('Separação concluída!')
    },
    onError: (e) => {
      toast.erro(e)
      if (e instanceof ApiError && e.status === 409) qc.invalidateQueries({ queryKey: ['romaneio', id] })
    },
  })
  return (
    <QueryState q={q}>
      {(r) => {
        const travado = r.status !== 'ativo' && r.status !== 'concluido'
        return (
          <>
            <PageHeader titulo={`Separação — ${r.rota_nome}`} sub={<span className="flex items-center gap-2">v{r.versao} <StatusRomaneioBadge s={r.status} /></span>}
              acoes={<ButtonLink to={`/romaneios/${r.id}`} variant="secondary">Ver romaneio</ButtonLink>} />
            {travado && (
              <div role="alert" className="mb-4 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
                Este romaneio está {r.status}; a separação está bloqueada. <Link to={`/rotas/${r.rota_id}`} className="underline">Ir para a rota</Link>.
              </div>
            )}
            <Card className="mb-4">
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="text-ink-2">{r.progresso.separados} de {r.progresso.total} itens separados</span>
                <span className="text-2xl font-semibold tracking-[-0.02em]" data-testid="percentual">{r.progresso.percentual}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-sm bg-surface-2" role="progressbar" aria-valuenow={r.progresso.percentual} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${r.progresso.percentual}%` }} />
              </div>
            </Card>
            {/* Lista de conferência: quantidade primeiro ("10 cx Farinha", como o pedido é falado);
                item feito ganha trilho verde e esmaece para cinza legível (sem opacidade). */}
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface">
              {r.itens.map((it) => {
                const feito = !!it.separado_em
                const enviando = m.isPending && m.variables?.id === it.id
                return (
                  <li key={it.id} className={'flex items-center gap-4 border-l-[3px] py-3 pl-3 pr-4 ' + (feito ? 'border-l-brand bg-brand/[0.04]' : 'border-l-transparent')}>
                    <Qtd v={qtd(it.quantidade_total)} un={it.unidade} className={'w-32 shrink-0 text-right text-xl ' + (feito ? 'text-muted' : '')} />
                    <div className="min-w-0 flex-1">
                      <div className={feito ? 'text-ink-2' : 'font-medium'}>{it.produto_nome} <span className="font-mono text-xs text-muted">{it.produto_codigo}</span></div>
                      {feito && <div className="mt-0.5 text-xs text-brand">Separado por {it.separado_por_nome} em {dataHora(it.separado_em)}</div>}
                    </div>
                    <Button variant={feito ? 'secondary' : 'primary'} disabled={travado || (m.isPending && !enviando)} loading={enviando}
                      aria-label={(feito ? 'Desmarcar ' : 'Marcar como separado ') + it.produto_nome + ' ' + it.unidade}
                      onClick={() => m.mutate(it)}>
                      {feito ? 'Desmarcar' : 'Marcar separado'}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </>
        )
      }}
    </QueryState>
  )
}
