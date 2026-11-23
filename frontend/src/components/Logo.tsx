import { useId } from 'react'

/**
 * Marca do Romaneia: um "R" desenhado como rota de entrega.
 * Sai do depósito (anel), sobe a haste, contorna a barriga do R e termina a perna no cliente (ponto cheio).
 */
export function LogoMarca({ className }: { className?: string }) {
  const g = useId() // id único: várias marcas na mesma página não compartilham o gradiente
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4cc47f" />
          <stop offset="1" stopColor="#1a6f3d" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#${g})`} />
      <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 32V10h9a7 7 0 0 1 0 14h-5l11 11" strokeWidth="4" />
        <circle cx="16" cy="36" r="3" strokeWidth="2.5" />
      </g>
      <circle cx="31" cy="35" r="4" fill="#fff" />
    </svg>
  )
}

/** Marca + nome. O texto é o nome acessível; a marca é decorativa. */
export function Logo({ grande }: { grande?: boolean }) {
  return (
    <span className={'inline-flex items-center ' + (grande ? 'gap-3 md:gap-4' : 'gap-2.5')}>
      <LogoMarca className={grande ? 'size-10 md:size-14' : 'size-7'} />
      <span className={grande
        ? 'text-3xl font-semibold tracking-[-0.03em] md:text-5xl'
        : 'text-[0.9375rem] font-semibold tracking-[-0.01em]'}>
        Romaneia
      </span>
    </span>
  )
}
