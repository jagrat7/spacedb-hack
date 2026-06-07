import { Leaf, LeafSpray, Portrait, Star, initialsOf } from '@/components/cozy'

const cozyBtnBase =
  'btn3d font-pixel shrink-0 border-[3px] border-wood text-wood shadow-[0_3px_0_#2A1F18]'

const cozyBtnBg = {
  gold: 'linear-gradient(180deg,#F8CE6E,#EBA63A)',
  parch: 'var(--parch2)',
  sage: 'linear-gradient(180deg,#9bd6a3,#82C58C)',
} as const

export function CozyBtn({
  children,
  onClick,
  variant = 'parch',
  className = '',
}: {
  children: React.ReactNode
  onClick: () => void
  variant?: keyof typeof cozyBtnBg
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cozyBtnBase} px-2.5 py-1.5 text-[10px] tracking-wider sm:px-3 sm:py-2 sm:text-xs ${className}`}
      style={{ background: cozyBtnBg[variant] }}
    >
      {children}
    </button>
  )
}

/** Header profile chip — portrait, name/role, and actions in one wood panel. */
export function ProfileBar({
  name,
  role,
  onEdit,
  onSignOut,
}: {
  name: string
  role: string
  onEdit: () => void
  onSignOut: () => void
}) {
  return (
    <div className="wood-panel flex w-full items-center gap-2.5 px-3 py-2 sm:w-auto sm:gap-3 sm:px-4 sm:py-2.5">
      <Portrait initials={initialsOf(name)} size={36} live />
      <div className="min-w-0 flex-1 leading-tight sm:max-w-[12rem] sm:flex-none">
        <div className="truncate font-pixel text-sm text-wood">{name}</div>
        <div className="truncate font-sans text-[11px] font-bold text-wood2">
          {role}
        </div>
      </div>
      <div
        className="hidden h-9 w-px shrink-0 sm:block"
        style={{ background: 'rgba(58,44,34,0.22)' }}
        aria-hidden
      />
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <CozyBtn variant="gold" onClick={onEdit}>
          ✎ EDIT
        </CozyBtn>
        <CozyBtn variant="parch" onClick={onSignOut}>
          SIGN OUT
        </CozyBtn>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Shared chrome                                                       *
 * ------------------------------------------------------------------ */
export function Signboard() {
  return (
    <div className="relative w-fit">
      <div className="wood-panel bob flex items-center gap-2.5 px-5 py-2.5">
        <Leaf size={18} color="#4e9e63" />
        <span
          className="font-pixel text-2xl tracking-wide text-wood"
          style={{ textShadow: '0 1px 0 rgba(255,255,255,0.45)' }}
        >
          Overlap
        </span>
        <Leaf size={18} color="#4e9e63" flip />
      </div>
      <div className="absolute -left-4 -top-3">
        <LeafSpray size={32} />
      </div>
      <div className="absolute -right-4 -top-3">
        <LeafSpray size={32} flip />
      </div>
    </div>
  )
}

/** Carved parchment ribbon used as a section title. */
export function Ribbon({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-fit">
      <div
        className="flex items-center gap-2 px-5 py-1.5"
        style={{
          background: 'linear-gradient(180deg,#F8CE6E,#EBA63A)',
          border: '3px solid var(--wood)',
          borderRadius: 8,
          boxShadow: '0 3px 0 #2A1F18, inset 0 1px 0 rgba(255,255,255,0.4)',
        }}
      >
        <Star size={13} color="var(--goldd)" fill="var(--wood)" sw={1} />
        <span
          className="font-pixel"
          style={{ fontSize: 16, letterSpacing: '0.06em', color: 'var(--wood)' }}
        >
          {children}
        </span>
        <Star size={13} color="var(--goldd)" fill="var(--wood)" sw={1} />
      </div>
    </div>
  )
}

export function CozyField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-pixel text-[11px] tracking-wider text-wood2">
        {label}
      </span>
      {children}
    </label>
  )
}

export const inputClass =
  'border-[3px] border-wood bg-[#fffaf0] font-sans font-semibold text-wood placeholder:text-wood2/50 focus-visible:ring-gold/40'
