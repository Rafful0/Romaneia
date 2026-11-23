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
    <div className="grid min-h-full place-items-center p-4">
      <form noValidate onSubmit={f.handleSubmit((d) => m.mutate(d))}
        className="flex w-full max-w-sm flex-col gap-4 rounded-md border border-line bg-surface p-7">
        <div className="mb-1 flex items-center gap-2.5 border-b border-line pb-4">
          <span aria-hidden className="size-2.5 rounded-[2px] bg-brand" />
          <h1 className="text-lg font-semibold tracking-[-0.01em]">Entrar no Romaneia</h1>
        </div>
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
  )
}
