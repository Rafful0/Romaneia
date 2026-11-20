import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = { id: number; tipo: 'ok' | 'erro'; texto: string }
const Ctx = createContext<{ ok: (t: string) => void; erro: (t: unknown) => void } | null>(null)
let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [lista, setLista] = useState<Toast[]>([])
  const add = useCallback((tipo: Toast['tipo'], texto: string) => {
    const id = ++seq
    setLista((l) => [...l, { id, tipo, texto }])
    setTimeout(() => setLista((l) => l.filter((t) => t.id !== id)), tipo === 'erro' ? 7000 : 4000)
  }, [])
  const ok = useCallback((t: string) => add('ok', t), [add])
  const erro = useCallback((e: unknown) => add('erro', e instanceof Error ? e.message : String(e)), [add])
  return (
    <Ctx.Provider value={{ ok, erro }}>
      {children}
      <div className="no-print fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2" aria-live="polite">
        {lista.map((t) => (
          <div key={t.id} role={t.tipo === 'erro' ? 'alert' : 'status'}
            className={`rounded-md border px-4 py-3 text-sm shadow-lg ${t.tipo === 'erro'
              ? 'border-danger/50 bg-[#2a1414] text-danger' : 'border-brand/40 bg-[#0f2418] text-brand'}`}>
            {t.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast fora do ToastProvider')
  return c
}
