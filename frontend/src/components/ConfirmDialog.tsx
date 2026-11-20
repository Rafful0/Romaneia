import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button, Field, Modal, Textarea } from './ui'

const schema = z.object({ motivo: z.string().trim().min(3, 'Informe a justificativa (mín. 3 caracteres)').max(500) })

/** Confirmação para ações destrutivas; com `pedirMotivo`, exige justificativa antes de liberar o botão. */
export function ConfirmDialog({ aberto, titulo, mensagem, confirmar = 'Confirmar', pedirMotivo, enviando, onCancel, onConfirm }: {
  aberto: boolean; titulo: string; mensagem: string; confirmar?: string; pedirMotivo?: boolean; enviando?: boolean
  onCancel: () => void; onConfirm: (motivo: string) => void
}) {
  const f = useForm({ resolver: pedirMotivo ? zodResolver(schema) : undefined, defaultValues: { motivo: '' } })
  return (
    <Modal titulo={titulo} aberto={aberto} onClose={() => { f.reset(); onCancel() }}>
      <form onSubmit={f.handleSubmit((d) => onConfirm(d.motivo.trim()))} className="flex flex-col gap-4">
        <p className="text-sm text-muted">{mensagem}</p>
        {pedirMotivo && (
          <Field label="Justificativa" erro={f.formState.errors.motivo?.message}>
            {(id) => <Textarea id={id} rows={3} aria-invalid={!!f.formState.errors.motivo} {...f.register('motivo')} />}
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => { f.reset(); onCancel() }}>Voltar</Button>
          <Button type="submit" variant="danger" loading={enviando}>{confirmar}</Button>
        </div>
      </form>
    </Modal>
  )
}
