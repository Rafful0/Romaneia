import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ButtonLink, Button, Card, Num, PageHeader, Qtd, QueryState, StatusPedidoBadge, StatusRomaneioBadge, Table, Td } from '../components/ui'
import { data, dataHora, qtd } from '../lib/format'
import { api } from '../services/api'

const ABAS = [['produto', 'Por produto'], ['cliente', 'Por cliente'], ['pedidos', 'Pedidos de origem']] as const

export function RomaneioDetalhePage() {
  const { id } = useParams()
  const [aba, setAba] = useState<(typeof ABAS)[number][0]>('produto')
  const q = useQuery({ queryKey: ['romaneio', id], queryFn: () => api.romaneios.obter(id!) })
  return (
    <QueryState q={q}>
      {(r) => (
        <>
          <PageHeader titulo={`Romaneio — ${r.rota_nome}`}
            sub={<span className="flex flex-wrap items-center gap-2">{data(r.rota_data)} · v{r.versao} <StatusRomaneioBadge s={r.status} />
              · gerado por {r.gerado_por_nome} em {dataHora(r.gerado_em)}</span>}
            acoes={<>
              <ButtonLink to={`/rotas/${r.rota_id}`} variant="ghost">Ver rota</ButtonLink>
              <Button variant="secondary" onClick={() => window.print()}>Imprimir</Button>
              {(r.status === 'ativo' || r.status === 'concluido') && <ButtonLink to={`/romaneios/${r.id}/separacao`}>Separação</ButtonLink>}
            </>} />
          {r.status === 'desatualizado' && (
            <div role="alert" className="no-print mb-4 rounded-md border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
              Desatualizado: {r.motivo_desatualizado}. <Link to={`/rotas/${r.rota_id}`} className="underline">Gere uma nova versão na rota</Link>.
            </div>
          )}
          {r.status === 'substituido' && <p className="no-print mb-4 text-sm text-muted">Esta versão foi substituída por uma mais recente.</p>}
          <div className="mb-4 text-sm text-ink-2">Separação: {r.progresso.separados}/{r.progresso.total} itens ({r.progresso.percentual}%)</div>

          <div role="tablist" className="no-print mb-4 flex gap-4 border-b border-line">
            {ABAS.map(([k, rot]) => (
              <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
                className={'-mb-px border-b-2 py-2 text-sm font-medium transition-colors ' + (aba === k ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink')}>
                {rot}
              </button>
            ))}
          </div>

          {aba === 'produto' && (
            <Table head={['Código', 'Produto', <Num>Total</Num>, 'Origem', 'Separado']}>
              {r.itens.map((i) => (
                <tr key={i.id}>
                  <Td className="whitespace-nowrap font-mono text-xs text-ink-2">{i.produto_codigo}</Td>
                  <Td className="font-medium">{i.produto_nome}</Td>
                  <Td className="pr-6 text-right text-base"><Qtd v={qtd(i.quantidade_total)} un={i.unidade} /></Td>
                  <Td className="text-xs text-muted">{i.origens.map((o) => `#${o.pedido_numero} ${o.cliente_nome}: ${qtd(o.quantidade)}`).join(' · ')}</Td>
                  <Td className={'whitespace-nowrap ' + (i.separado_em ? 'text-brand' : 'text-muted')}>{i.separado_em ? `✓ ${i.separado_por_nome}` : '☐'}</Td>
                </tr>
              ))}
            </Table>
          )}
          {aba === 'cliente' && (
            <div className="grid gap-3 md:grid-cols-2">
              {r.por_cliente.map((c) => (
                <Card key={c.cliente_id} className="p-0!">
                  <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5">
                    <h3 className="font-semibold">{c.cliente_nome}</h3>
                    <span className="font-mono text-xs text-muted">{c.pedidos.map((n) => `#${n}`).join(', ')}</span>
                  </div>
                  <ul className="divide-y divide-line px-4 text-sm">
                    {c.itens.map((i, n) => (
                      <li key={n} className="flex items-baseline justify-between gap-3 py-1.5">
                        <span>{i.produto_nome}</span><Qtd v={qtd(i.quantidade)} un={i.unidade} />
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
          {aba === 'pedidos' && (
            <Table head={['Nº', 'Cliente', 'Status atual', 'Revisão no romaneio']}>
              {r.pedidos.map((p) => (
                <tr key={p.id}>
                  <Td><Link to={`/pedidos/${p.id}`} className="font-mono hover:text-brand">#{p.numero}</Link></Td>
                  <Td>{p.cliente_nome}</Td>
                  <Td><StatusPedidoBadge s={p.status} /></Td>
                  <Td>{p.pedido_revisao}{p.revisao_atual !== p.pedido_revisao && <span className="ml-2 text-warn">(atual: {p.revisao_atual})</span>}</Td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </QueryState>
  )
}
