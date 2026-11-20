import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ToastProvider } from './hooks/useToast'
import { ApiError } from './services/api'
import './index.css'

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Erros 4xx são definitivos (ex.: 404, 401); só repetimos falhas de rede/5xx.
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <BrowserRouter><App /></BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
