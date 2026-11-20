import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

describe('ConfirmDialog', () => {
  it('com pedirMotivo, não confirma sem justificativa', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog aberto titulo="Cancelar pedido" mensagem="Tem certeza?" pedirMotivo confirmar="Cancelar pedido"
      onCancel={() => {}} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    expect(await screen.findByText(/Informe a justificativa/)).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Justificativa'), '  Cliente desistiu  ')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar pedido' }))
    expect(onConfirm).toHaveBeenCalledWith('Cliente desistiu')
  })

  it('sem pedirMotivo confirma direto e "Voltar" cancela', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ConfirmDialog aberto titulo="Inativar" mensagem="Certeza?" confirmar="Inativar" onCancel={onCancel} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(onCancel).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Inativar' }))
    expect(onConfirm).toHaveBeenCalledWith('')
  })

  it('fechado não renderiza nada', () => {
    render(<ConfirmDialog aberto={false} titulo="X" mensagem="Y" onCancel={() => {}} onConfirm={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
