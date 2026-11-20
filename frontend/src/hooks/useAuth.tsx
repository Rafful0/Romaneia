import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ApiError, api, EVENTO_401 } from '../services/api'

export function useAuth() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['me'], queryFn: api.auth.me, retry: false, staleTime: 5 * 60_000 })
  useEffect(() => {
    // Qualquer 401 (ex.: token expirado) derruba a sessão local e manda para o login.
    const on = () => { qc.setQueryData(['me'], null); qc.removeQueries({ predicate: (x) => x.queryKey[0] !== 'me' }) }
    window.addEventListener(EVENTO_401, on)
    return () => window.removeEventListener(EVENTO_401, on)
  }, [qc])
  const naoAutenticado = q.data === null || (q.error instanceof ApiError && q.error.status === 401)
  return { usuario: q.data ?? null, carregando: q.isPending, naoAutenticado, erro: naoAutenticado ? null : q.error, refetch: q.refetch }
}
