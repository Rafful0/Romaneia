import type { ReactNode } from 'react'
import { Logo } from '../components/Logo'
import { WhatsAppIcon } from '../components/WhatsAppIcon'

/** Decoração do painel do login: formas geométricas e o selo do WhatsApp. Só visual (aria-hidden). */
function FormasDeFundo() {
  const flutua = 'motion-safe:animate-flutuar'
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* brilhos difusos */}
      <div className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-brand/20 blur-3xl" />
      <div className="absolute -bottom-40 -left-24 size-[26rem] rounded-full bg-whatsapp/10 blur-3xl" />
      {/* malha de pontos */}
      <svg className="absolute top-8 left-8 h-28 w-40 text-brand/30" viewBox="0 0 160 112">
        <defs><pattern id="pontos" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2" fill="currentColor" /></pattern></defs>
        <rect width="160" height="112" fill="url(#pontos)" />
      </svg>
      {/* selo do WhatsApp */}
      <div className={`absolute top-[12%] right-[10%] hidden size-20 rotate-6 place-items-center rounded-3xl bg-linear-to-br from-whatsapp to-[#128c4a] shadow-xl shadow-black/40 sm:grid ${flutua}`}>
        <WhatsAppIcon className="size-11 text-white" />
      </div>
      {/* quadrado arredondado */}
      <div className={`absolute top-[22%] left-[9%] hidden size-16 -rotate-12 rounded-2xl bg-linear-to-br from-brand to-brand-strong shadow-lg shadow-black/40 md:block ${flutua} [animation-delay:-3s]`} />
      {/* anel */}
      <div className="absolute right-[8%] bottom-[12%] size-28 rounded-full border-[12px] border-brand/50" />
      {/* pílula */}
      <div className={`absolute bottom-[26%] left-[6%] hidden h-10 w-32 -rotate-[24deg] rounded-full bg-linear-to-r from-brand-strong to-whatsapp/80 shadow-lg shadow-black/40 md:block ${flutua} [animation-delay:-6s]`} />
      {/* onda */}
      <svg className="absolute bottom-10 left-[30%] hidden h-10 w-44 text-whatsapp/50 md:block" viewBox="0 0 176 40" fill="none">
        <path d="M4 20c14-16 28-16 42 0s28 16 42 0 28-16 42 0 28 16 42 0" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      </svg>
      {/* triângulo vazado */}
      <svg className="absolute top-[8%] left-[44%] hidden size-14 rotate-12 text-brand/45 md:block" viewBox="0 0 56 56" fill="none">
        <path d="M28 6 51 48H5Z" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      </svg>
      {/* balão de conversa */}
      <svg className={`absolute right-[22%] bottom-[30%] hidden h-14 w-16 -rotate-6 text-white/15 lg:block ${flutua} [animation-delay:-4.5s]`} viewBox="0 0 64 56" fill="currentColor">
        <path d="M10 2h44a8 8 0 0 1 8 8v24a8 8 0 0 1-8 8H28l-14 12v-12h-4a8 8 0 0 1-8-8V10a8 8 0 0 1 8-8Z" />
      </svg>
    </div>
  )
}

/** Moldura das telas de entrada (login e cadastro): marca à esquerda (40%), cartão de vidro à direita (60%).
 *  Em telas estreitas a marca vira uma faixa no topo. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-full grid-rows-[auto_1fr] md:grid-cols-[2fr_3fr] md:grid-rows-1">
      <div className="flex items-center justify-center border-b border-line bg-surface px-6 py-10 md:border-r md:border-b-0">
        <Logo grande />
      </div>
      <div className="relative grid place-items-center overflow-hidden bg-linear-to-br from-[#0f2c1d] via-bg to-[#0a2116] px-4 py-14 md:px-10">
        <FormasDeFundo />
        <div className="relative z-10 flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-white/15 bg-white/[0.06] p-8 shadow-2xl shadow-black/50 backdrop-blur-xl">
          {children}
        </div>
      </div>
    </div>
  )
}
