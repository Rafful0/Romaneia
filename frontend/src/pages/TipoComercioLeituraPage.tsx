import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Badge, ButtonLink, EmptyState, Field, Num, PageHeader, Qtd, QueryState, Select, Table, Td } from '../components/ui'
import { qtd } from '../lib/format'
import { api } from '../services/api'

const PERIODOS = [30, 90, 180, 365]

export function TipoComercioLeituraPage() {
  const { id } = useParams()
  const [dias, setDias] = useState(90)
  const q = useQuery({ queryKey: ['tipos-comercio', 'leitura', id, dias], queryFn: () => api.tiposComercio.leitura(id!, dias), placeholderData: keepPreviousData })
  return (
    <QueryState q={q}>
      {(l) => (
        <>
          <PageHeader titulo={`O que pede: ${l.tipo.nome}`}
            sub={<span className="flex items-center gap-2">{l.tipo.total_clientes} cliente(s) ativo(s) · {l.total_pedidos} pedido(s) no período
              {!l.tipo.ativo && <Badge>Inativo</Badge>}</span>}
            acoes={<ButtonLink to="/tipos-comercio" variant="secondary">Voltar</ButtonLink>} />
          <Field label="Período (data de entrega)" className="mb-4 w-56">
            {(fid) => (
              <Select id={fid} value={dias} onChange={(e) => setDias(Number(e.target.value))}>
                {PERIODOS.map((d) => <option key={d} value={d}>Últimos {d} dias e próximos</option>)}
              </Select>
            )}
          </Field>
          {l.itens.length === 0
            ? <EmptyState titulo="Ainda não há pedidos de clientes deste tipo no período. A leitura aparece conforme os pedidos forem feitos."
                acao={<ButtonLink to="/clientes" variant="secondary">Classificar clientes</ButtonLink>} />
            : (
              <>
                <p className="mb-3 text-sm text-muted">Produtos mais pedidos, por produto e unidade (pedidos cancelados não entram).</p>
                <Table head={['Produto', 'Unidade', 'Aparece em', <Num>Clientes</Num>, <Num>Quantidade total</Num>]}>
                  {l.itens.map((i) => (
                    <tr key={i.produto_id + i.unidade}>
                      <Td><span className="font-mono text-xs text-muted">{i.produto_codigo}</span> <span className="font-medium">{i.produto_nome}</span>
                        {!i.produto_ativo && <span className="ml-2"><Badge>inativo</Badge></span>}</Td>
                      <Td className="font-mono text-xs text-ink-2">{i.unidade}</Td>
                      <Td>{i.pedidos} de {l.total_pedidos} pedidos ({Math.round((100 * i.pedidos) / l.total_pedidos)}%)</Td>
                      <Td className="text-right">{i.clientes}</Td>
                      <Td className="text-right"><Qtd v={qtd(i.quantidade_total)} un={i.unidade} /></Td>
                    </tr>
                  ))}
                </Table>
              </>
            )}
        </>
      )}
    </QueryState>
  )
}
