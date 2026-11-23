import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Badge, Button, ButtonLink, EmptyState, Field, Input, Modal, Num, PageHeader, Pagination, QueryState, Table, Td } from '../components/ui'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { api } from '../services/api'
import type { TipoComercio } from '../types'

const schema = z.object({ nome: z.string().trim().min(1, 'Informe o nome').max(200) })
type Form = z.infer<typeof schema>

function TipoForm({ inicial, onFechar }: { inicial?: TipoComercio; onFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { nome: inicial?.nome ?? '' } })
  const m = useMutation({
    mutationFn: (d: Form) => (inicial ? api.tiposComercio.editar(inicial.id, d.nome) : api.tiposComercio.criar(d.nome)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tipos-comercio'] }); qc.invalidateQueries({ queryKey: ['clientes'] })
      toast.ok(inicial ? 'Tipo de comércio atualizado' : 'Tipo de comércio criado'); onFechar()
    },
    onError: toast.erro,
  })
  const e = f.formState.errors
  return (
    <form onSubmit={f.handleSubmit((d) => m.mutate(d))} className="flex flex-col gap-3">
      <Field label="Nome *" erro={e.nome?.message}>
        {(id) => <Input id={id} placeholder="ex.: Padaria, Restaurante, Mercado" aria-invalid={!!e.nome} {...f.register('nome')} />}
      </Field>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onFechar}>Cancelar</Button>
        <Button type="submit" loading={m.isPending}>Salvar</Button>
      </div>
    </form>
  )
}

export function TiposComercioPage() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [editando, setEditando] = useState<TipoComercio | 'novo' | null>(null)
  const [inativando, setInativando] = useState<TipoComercio | null>(null)
  const q = useQuery({ queryKey: ['tipos-comercio', page], queryFn: () => api.tiposComercio.listar({ page }), placeholderData: keepPreviousData })
  const inativar = useMutation({
    mutationFn: (id: string) => api.tiposComercio.inativar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tipos-comercio'] }); toast.ok('Tipo de comércio inativado'); setInativando(null) },
    onError: toast.erro,
  })
  const novo = <Button onClick={() => setEditando('novo')}>Novo tipo</Button>
  return (
    <>
      <PageHeader titulo="Tipos de comércio" sub="Classifique os clientes (padaria, restaurante...) para ver o que cada tipo costuma pedir." acoes={novo} />
      <QueryState q={q} vazio={(d) => d.total === 0 && <EmptyState titulo="Nenhum tipo de comércio cadastrado." acao={novo} />}>
        {(d) => (
          <>
            <Table head={['Tipo', <Num>Clientes ativos</Num>, 'Situação', '']}>
              {d.items.map((t) => (
                <tr key={t.id} className={t.ativo ? '' : 'text-muted'}>
                  <Td><Link to={`/tipos-comercio/${t.id}`} className="font-medium hover:text-brand">{t.nome}</Link></Td>
                  <Td className="text-right">{t.total_clientes}</Td>
                  <Td>{t.ativo ? <Badge tom="verde">Ativo</Badge> : <Badge>Inativo</Badge>}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <ButtonLink to={`/tipos-comercio/${t.id}`} variant="ghost">O que pedem</ButtonLink>
                      <Button variant="ghost" onClick={() => setEditando(t)}>Editar</Button>
                      {t.ativo && usuario?.papel === 'admin' && <Button variant="ghost" onClick={() => setInativando(t)}>Inativar</Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pagination page={d.page} pageSize={d.page_size} total={d.total} onPage={setPage} />
          </>
        )}
      </QueryState>
      <Modal titulo={editando === 'novo' ? 'Novo tipo de comércio' : 'Editar tipo de comércio'} aberto={!!editando} onClose={() => setEditando(null)}>
        {editando && <TipoForm inicial={editando === 'novo' ? undefined : editando} onFechar={() => setEditando(null)} />}
      </Modal>
      <ConfirmDialog aberto={!!inativando} titulo="Inativar tipo de comércio" confirmar="Inativar" enviando={inativar.isPending}
        mensagem={`"${inativando?.nome}" não poderá ser escolhido em novos cadastros. Clientes que já têm esse tipo continuam com ele.`}
        onCancel={() => setInativando(null)} onConfirm={() => inativando && inativar.mutate(inativando.id)} />
    </>
  )
}
