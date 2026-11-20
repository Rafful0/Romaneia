import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ButtonLink, Button, Card, PageHeader, QueryState, StatusRomaneioBadge } from '../components/ui'
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
              <div className="mb-2 flex justify-between text-sm">
                <span>{r.progresso.separados} de {r.progresso.total} itens separados</span>
                <span className="font-semibold" data-testid="percentual">{r.progresso.percentual}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={r.progresso.percentual} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-brand transition-all" style={{ width: `${r.progresso.percentual}%` }} />
              </div>
            </Card>
            <div className="flex flex-col gap-2">
              {r.itens.map((it) => {
                const feito = !!it.separado_em
                const enviando = m.isPending && m.variables?.id === it.id
                return (
                  <Card key={it.id} className={'flex items-center justify-between gap-4 ' + (feito ? 'border-brand/40' : '')}>
                    <div>
                      <div className="font-medium">{it.produto_nome} <span className="font-mono text-xs text-muted">{it.produto_codigo}</span></div>
                      <div className="text-xl font-semibold">{qtd(it.quantidade_total)} {it.unidade}</div>
                      {feito && <div className="text-xs text-brand">Separado por {it.separado_por_nome} em {dataHora(it.separado_em)}</div>}
                    </div>
                    <Button variant={feito ? 'secondary' : 'primary'} disabled={travado || (m.isPending && !enviando)} loading={enviando}
                      aria-label={(feito ? 'Desmarcar ' : 'Marcar como separado ') + it.produto_nome + ' ' + it.unidade}
                      onClick={() => m.mutate(it)}>
                      {feito ? 'Desmarcar' : 'Marcar separado'}
                    </Button>
                  </Card>
                )
              })}
            </div>
          </>
        )
      }}
    </QueryState>
  )
}
