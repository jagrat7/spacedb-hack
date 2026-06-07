import { Button } from '@/components/ui/button'
import { Flower, Portrait, StatBar, initialsOf } from '@/components/cozy'
import { parseList } from '@/lib/overlap/backend'
import type { Match, Profile } from '@/module_bindings/types'

export function MatchCard({
  other,
  match,
  selected,
  onOpen,
  onBegin,
  onReRun,
}: {
  other: Profile
  match?: Match
  selected: boolean
  onOpen: () => void
  onBegin: () => void
  onReRun: () => void
}) {
  const notStarted = !match
  const status = match?.status ?? 'pending'
  const complete = status === 'complete'
  const errored = status === 'error'
  const commonGround = match ? parseList(match.commonGround) : []

  return (
    <div className={`quest-card pinned relative ${selected ? 'selected' : ''}`}>
      <div className="absolute -right-3 -bottom-3 z-10 grow">
        <Flower size={20} petal={complete ? '#f6a8c0' : '#c6e4f0'} center="#fff1a8" />
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Portrait initials={initialsOf(other.name)} size={42} live={complete} />
            <div className="min-w-0">
              <div className="font-pixel text-base text-wood">{other.name}</div>
              <div className="truncate font-sans text-xs font-semibold text-wood2">
                {other.goals}
              </div>
            </div>
          </div>
          {complete && match ? (
            <div
              className="font-pixel tabnum"
              style={{ fontSize: 28, fontWeight: 700, color: 'var(--goldd)' }}
            >
              {match.score}
              <span style={{ fontSize: 16 }}>%</span>
            </div>
          ) : (
            <span className="font-pixel text-xs text-wood2">
              {errored ? 'error' : status === 'streaming' ? 'talking…' : 'scoring…'}
            </span>
          )}
        </div>

        {complete && match ? (
          <>
            <div className="grid gap-2.5">
              <StatBar label="Goal Alignment" value={match.metricGoals} delay={100} />
              <StatBar label="Shared Interests" value={match.metricShared} delay={200} />
              <StatBar label="Complementary" value={match.metricComplementary} delay={300} />
            </div>

            {commonGround.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {commonGround.map(t => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5 font-sans font-bold"
                    style={{
                      fontSize: 13,
                      color: 'var(--wood)',
                      background: '#bfe6c2',
                      border: '2px solid var(--wood)',
                      borderRadius: 999,
                      padding: '3px 10px',
                      boxShadow: '0 2px 0 #3A2C22',
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 99,
                        background: 'var(--saged)',
                      }}
                    />
                    {t}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : errored ? (
          <p className="py-2 font-sans text-sm font-semibold text-pink">
            {match?.summary || 'Matching failed.'}
          </p>
        ) : notStarted ? (
          <p className="py-3 font-sans text-sm font-semibold text-wood2">
            Your agents haven’t met yet. Begin the chat to see how you overlap.
          </p>
        ) : (
          <div className="flex items-center gap-2 py-3">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="tdot"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    background: 'var(--wood2)',
                    animationDelay: `${i * 0.16}s`,
                  }}
                />
              ))}
            </div>
            <span className="font-sans text-sm font-semibold text-wood2">
              The agents are getting acquainted…
            </span>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          {notStarted ? (
            <Button
              onClick={onBegin}
              className="btn3d font-pixel h-auto flex-1 border-[3px] border-wood py-2.5 text-sm text-wood shadow-[0_4px_0_#2A1F18]"
              style={{ background: 'linear-gradient(180deg,#8fd99b,#4e9e63)' }}
            >
              ✦ BEGIN CHAT
            </Button>
          ) : (
            <Button
              onClick={onOpen}
              className="btn3d font-pixel h-auto flex-1 border-[3px] border-wood py-2.5 text-sm text-wood shadow-[0_4px_0_#2A1F18]"
              style={{
                background: selected
                  ? 'var(--goldl)'
                  : 'linear-gradient(180deg,#F8CE6E,#EBA63A)',
              }}
            >
              {selected ? '✦ WATCHING' : '▶ OPEN CHAT'}
            </Button>
          )}
          {(complete || errored) && (
            <Button
              onClick={onReRun}
              className="btn3d font-pixel h-auto border-[3px] border-wood px-3 py-2.5 text-sm text-wood shadow-[0_4px_0_#2A1F18]"
              style={{ background: 'var(--parch2)' }}
            >
              ↻
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
