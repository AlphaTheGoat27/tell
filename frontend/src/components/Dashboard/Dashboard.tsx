import { useEffect, useState, type ReactNode } from 'react'
import { getMastery } from '../../api'

type DashboardProps = { userId: string; isSignedIn?: boolean; refreshKey?: number }

function scoreLabel(score: number): { label: string; cls: string } {
  if (score < 0.4) return { label: 'weak', cls: 'leak-badge' }
  if (score < 0.7) return { label: 'developing', cls: '' }
  return { label: 'strong', cls: 'good-badge' }
}

function barColor(score: number): string {
  if (score < 0.4) return '#b02a2a'
  if (score < 0.7) return '#e08b00'
  return '#2e9e5b'
}

function TreeLeaf({
  concept,
  score,
  untouched = false,
}: {
  concept: string
  score?: number
  untouched?: boolean
}) {
  const info = CONCEPT_INFO[concept]
  const { label, cls } = untouched ? { label: 'not measured', cls: '' } : scoreLabel(score ?? 0)
  return (
    <div className="tree-leaf">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{info?.icon ?? '🧠'}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700 }}>
          {info?.title ?? concept.replace(/_/g, ' ')}
        </span>
        {!untouched && (
          <span style={{ fontSize: 15, fontWeight: 900 }} className="gold-text">
            {Math.round((score ?? 0) * 100)}%
          </span>
        )}
        {cls ? (
          <span className={cls}>{label}</span>
        ) : (
          <span style={{ fontSize: 12.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{label}</span>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.5 }}>
        {untouched
          ? 'No data yet — this branch grows the first time Tell sees you use it.'
          : info?.description}
      </div>
      {!untouched && (
        <div style={{ marginTop: 8, height: 7, borderRadius: 4, background: 'rgba(26,26,26,0.12)', overflow: 'hidden' }}>
          <div
            style={{
              width: `${Math.round((score ?? 0) * 100)}%`,
              height: '100%',
              background: barColor(score ?? 0),
              borderRadius: 4,
            }}
          />
        </div>
      )}
    </div>
  )
}

function TreeBranch({
  title,
  tone,
  hint,
  children,
  emptyNote,
}: {
  title: string
  tone: 'good' | 'mid' | 'bad' | 'flat'
  hint: string
  children?: ReactNode
  emptyNote?: string
}) {
  const toneBg =
    tone === 'good' ? '#e2f4e6' : tone === 'mid' ? '#fff6d6' : tone === 'bad' ? '#fbe7ea' : 'var(--panel-2)'
  return (
    <div className="tree-branch">
      <div
        className="branch-label"
        style={{ background: toneBg }}
      >
        {title}
        <span style={{ fontWeight: 500, color: 'var(--text-dim)', textTransform: 'none', letterSpacing: 0 }}>
          — {hint}
        </span>
      </div>
      {children}
      {emptyNote && (
        <div style={{ marginLeft: 20, fontSize: 13, color: 'var(--text-faint)', padding: '4px 0 8px' }}>{emptyNote}</div>
      )}
    </div>
  )
}

const CONCEPT_INFO: Record<string, { title: string; description: string; icon: string }> = {
  pot_odds: {
    title: 'Pot Odds & Required Equity',
    description: 'Can you correctly calculate what % equity you need to call given the pot size and bet?',
    icon: '🧮',
  },
  preflop_ranges: {
    title: 'Preflop Hand Selection',
    description: 'Opening the right hands from the right position — the foundation of every session.',
    icon: '🎴',
  },
  bet_sizing: {
    title: 'Postflop Bet Sizing',
    description: 'Knowing when to go thin, when to go big, and when to check it back.',
    icon: '📏',
  },
  hand_reading: {
    title: 'Board Texture & Hand Reading',
    description: 'What do the flop/turn/river favor in each player\'s range?',
    icon: '🔍',
  },
}

export function Dashboard({ userId, isSignedIn = false, refreshKey }: DashboardProps) {
  const [scores, setScores] = useState<Record<string, number> | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    // Mastery belongs to a signed-in account; demo mode shows the gate UI.
    if (!isSignedIn) return
    let cancelled = false
    getMastery(userId)
      .then((mastery) => {
        if (!cancelled) setScores(mastery.scores)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId, refreshKey, isSignedIn])

  const concepts = scores ? Object.entries(scores) : []
  const overall = concepts.length ? concepts.reduce((s, [, v]) => s + v, 0) / concepts.length : 0
  const weakest = concepts.slice().sort((a, b) => a[1] - b[1])[0]

  const strengths = concepts.filter(([, v]) => v >= 0.7).sort((a, b) => b[1] - a[1])
  const developing = concepts.filter(([, v]) => v >= 0.4 && v < 0.7).sort((a, b) => b[1] - a[1])
  const needsWork = concepts.filter(([, v]) => v < 0.4).sort((a, b) => a[1] - b[1])
  const untouched = scores
    ? Object.keys(CONCEPT_INFO).filter((c) => !(c in scores))
    : []

  if (!isSignedIn) {
    return (
      <div className="panel fade-in" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <span className="eyebrow">Dashboard</span>
        <h2 className="section-title" style={{ fontSize: 23, marginTop: 8 }}>
          Your skill tree grows with your account
        </h2>
        <p className="section-sub" style={{ margin: '8px auto 0', maxWidth: 520 }}>
          Mastery is tracked per signed-in player, and demo mode is shared — so there’s nothing to
          chart here yet. Sign in with Google and every hand you play or analyze feeds your tree.
        </p>
        <div style={{ marginTop: 16, fontSize: 13.5, color: 'var(--text-dim)' }}>
          Sign out, then choose <strong>Sign in with Google</strong> to start tracking your game.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="mode-select-card" style={{ cursor: 'default', background: '#fff6d6' }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 2, color: 'var(--gold-ink)' }}>OVERALL MASTERY</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 10 }}>
            <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }} className="gold-text">
              {concepts.length ? Math.round(overall * 100) : '—'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-dim)', paddingBottom: 8 }}>/ 100</div>
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.6 }}>
            {concepts.length
              ? 'Rolling exponential score across every concept you\'ve touched.'
              : 'Submit a hand or play a bot round to seed your mastery map.'}
          </div>
          {concepts.length > 0 && (
            <div style={{ marginTop: 14, height: 8, borderRadius: 4, background: 'rgba(26,26,26,0.12)', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.round(overall * 100)}%`,
                height: '100%',
                background: '#1a1a1a',
                borderRadius: 4,
              }} />
            </div>
          )}
        </div>

        <div className="mode-select-card" style={{ cursor: 'default', background: '#fbe7ea' }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 2, color: weakest ? 'var(--red-ink)' : 'var(--gold-ink)' }}>
            {weakest ? '⚠ TOP RECURRING LEAK' : 'FIRST STEP'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>
            {weakest
              ? CONCEPT_INFO[weakest[0]]?.title ?? weakest[0].replace(/_/g, ' ')
              : 'Play a hand to find your leaks'}
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.6 }}>
            {weakest
              ? CONCEPT_INFO[weakest[0]]?.description ?? 'This concept keeps coming up weaker than the others. Drill it specifically.'
              : 'Tell uses vector similarity search across Firestore to surface patterns — even across hands that look nothing alike on the surface.'}
          </div>
          {weakest && (
            <span className={scoreLabel(weakest[1]).cls} style={{ display: 'inline-block', marginTop: 12 }}>
              Currently: {scoreLabel(weakest[1]).label} ({Math.round(weakest[1] * 100)}%)
            </span>
          )}
        </div>

        <div className="mode-select-card" style={{ cursor: 'default', background: '#e2f4e6' }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 2, color: 'var(--green-ink)' }}>✓ FIRESTORE</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>Persistent Memory Bank</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.6 }}>
            Every hand, every leak, every explanation you respond best to is vector-embedded and stored for next session.
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="good-badge">Vector search</span>
            <span className="good-badge">Per-user scope</span>
            <span className="good-badge">Session continuity</span>
          </div>
        </div>
      </div>

      <div className="info-card" style={{ padding: 24 }}>
        <div className="info-card-title">Concept-by-concept mastery map</div>
        <div style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 2, marginBottom: 16 }}>
          Updated after every hand you analyze or play. Rolling EWA score (not last-hand-only).
        </div>

        {loadError && <div className="reasoning-block bad">Couldn't reach the backend — check that the Tell API is running.</div>}
        {!loadError && scores === null && <div style={{ fontSize: 14, color: 'var(--text-faint)' }}>Loading…</div>}
        {!loadError && scores !== null && concepts.length === 0 && (
          <div style={{ fontSize: 14, color: 'var(--text-faint)', padding: '28px 0', textAlign: 'center' }}>
            No data yet. Jump back to the Table tab and either paste a hand or play a live bot round to start building this.
          </div>
        )}

        {concepts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {concepts.map(([concept, score]) => {
              const info = CONCEPT_INFO[concept]
              const { label, cls } = scoreLabel(score)
              return (
                <div
                  key={concept}
                  style={{
                    padding: 14,
                    borderRadius: 2,
                    border: '1px solid var(--border)',
                    background: 'rgba(26,26,26,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 2,
                      background: 'rgba(26,26,26,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
                    }}>
                      {info?.icon ?? '🧠'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                          {info?.title ?? concept.replace(/_/g, ' ')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ fontSize: 18, fontWeight: 900 }} className="gold-text">
                            {Math.round(score * 100)}%
                          </div>
                          {cls ? <span className={cls}>{label}</span> : <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{label}</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.5 }}>
                        {info?.description}
                      </div>
                      <div style={{ marginTop: 10, height: 8, borderRadius: 4, background: 'rgba(26,26,26,0.12)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.round(score * 100)}%`,
                            height: '100%',
                            background: score < 0.4
                              ? '#b02a2a'
                              : score < 0.7
                                ? '#e08b00'
                                : '#2e9e5b',
                            borderRadius: 4,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="info-card" style={{ padding: 24 }}>
        <div className="info-card-title">Skill tree · what's strong vs what to drill</div>
        <div style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 2, marginBottom: 18 }}>
          Your game as a tree: green branches are reliable strengths, red branches are the leaks to
          drill next. Every branch grows from hands you play and analyze.
        </div>

        {loadError && <div className="reasoning-block bad">Couldn't reach the backend — check that the Tell API is running.</div>}
        {!loadError && scores === null && <div style={{ fontSize: 14, color: 'var(--text-faint)' }}>Loading…</div>}

        {!loadError && scores !== null && (
          <div className="skill-tree">
            <div className="tree-root">🌳 Your Poker Game</div>

            {concepts.length === 0 && (
              <div className="tree-branch">
                <div className="branch-label" style={{ background: 'var(--panel-2)' }}>
                  Fresh seed
                  <span style={{ fontWeight: 500, color: 'var(--text-dim)', textTransform: 'none', letterSpacing: 0 }}>
                    — nothing measured yet
                  </span>
                </div>
                <div style={{ marginLeft: 20, fontSize: 13.5, color: 'var(--text-faint)', padding: '4px 0 8px' }}>
                  Play a bot hand or analyze a pasted hand and your first branches appear here.
                </div>
              </div>
            )}

            {strengths.length > 0 && (
              <TreeBranch
                title={`✓ Strengths (${strengths.length})`}
                tone="good"
                hint="lean on these"
              >
                {strengths.map(([c, v]) => (
                  <TreeLeaf key={c} concept={c} score={v} />
                ))}
              </TreeBranch>
            )}

            {developing.length > 0 && (
              <TreeBranch
                title={`◐ Developing (${developing.length})`}
                tone="mid"
                hint="almost there"
              >
                {developing.map(([c, v]) => (
                  <TreeLeaf key={c} concept={c} score={v} />
                ))}
              </TreeBranch>
            )}

            {needsWork.length > 0 && (
              <TreeBranch
                title={`⚠ Needs work (${needsWork.length})`}
                tone="bad"
                hint="drill these next"
              >
                {needsWork.map(([c, v]) => (
                  <TreeLeaf key={c} concept={c} score={v} />
                ))}
              </TreeBranch>
            )}

            {untouched.length > 0 && (
              <TreeBranch
                title={`· Untested (${untouched.length})`}
                tone="flat"
                hint="no data yet"
              >
                {untouched.map((c) => (
                  <TreeLeaf key={c} concept={c} untouched />
                ))}
              </TreeBranch>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
