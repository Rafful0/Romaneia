import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button, Field, Input } from '../components/ui'
import { api } from '../services/api'

const schema = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail').email('E-mail inválido'),
  senha: z.string().min(1, 'Informe a senha'),
})
type Form = z.infer<typeof schema>

export function LoginPage() {
  const qc = useQueryClient()
  const nav = useNavigate()
  const loc = useLocation()
  const f = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: '', senha: '' } })
  const m = useMutation({
    mutationFn: (d: Form) => api.auth.login(d.email, d.senha),
    onSuccess: (u) => {
      qc.setQueryData(['me'], u)
      nav((loc.state as { de?: string } | null)?.de ?? '/', { replace: true })
    },
  })
  const e = f.formState.errors
  return (
    // 40/60: marca à esquerda, formulário à direita; em telas estreitas a marca vira uma faixa no topo.
    <div className="grid min-h-full grid-rows-[auto_1fr] md:grid-cols-[2fr_3fr] md:grid-rows-1">
      <div className="flex items-center justify-center border-b border-line bg-surface px-6 py-10 md:border-r md:border-b-0">
        <div className="flex items-center gap-3 md:gap-4">
          <span aria-hidden className="size-5 rounded-[3px] bg-brand md:size-8 md:rounded-[4px]" />
          <span className="text-3xl font-semibold tracking-[-0.025em] md:text-5xl">Romaneia</span>
        </div>
      </div>
      <div className="grid place-items-center px-4 py-10 md:px-10">
        <form noValidate onSubmit={f.handleSubmit((d) => m.mutate(d))} className="flex w-full max-w-sm flex-col gap-4">
          <h1 className="mb-1 text-xl font-semibold tracking-[-0.01em]">Entrar no Romaneia</h1>
          <Field label="E-mail" erro={e.email?.message}>
            {(id) => <Input id={id} type="email" autoComplete="username" aria-invalid={!!e.email} {...f.register('email')} />}
          </Field>
          <Field label="Senha" erro={e.senha?.message}>
            {(id) => <Input id={id} type="password" autoComplete="current-password" aria-invalid={!!e.senha} {...f.register('senha')} />}
          </Field>
          {m.isError && <p role="alert" className="rounded border-l-2 border-danger bg-danger/10 px-3 py-2 text-sm text-danger">{m.error.message}</p>}
          <Button type="submit" loading={m.isPending}>Entrar</Button>
        </form>
      </div>
    </div>
  )
}
