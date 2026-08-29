import { useEffect, useState } from 'react'
import { getMastery } from '../../api'

type DashboardProps = { userId: string; refreshKey?: number }

function scoreLabel(score: number): { label: string; cls: string } {
  if (score < 0.4) return { label: 'weak', cls: 'leak-badge' }
  if (score < 0.7) return { label: 'developing', cls: '' }
  return { label: 'strong', cls: 'good-badge' }
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

export function Dashboard({ userId, refreshKey }: DashboardProps) {
  const [scores, setScores] = useState<Record<string, number> | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
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
  }, [userId, refreshKey])

  const concepts = scores ? Object.entries(scores) : []
  const overall = concepts.length ? concepts.reduce((s, [, v]) => s + v, 0) / concepts.length : 0
  const weakest = concepts.slice().sort((a, b) => a[1] - b[1])[0]

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="mode-select-card" style={{ cursor: 'default' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#d4af37' }}>OVERALL MASTERY</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 10 }}>
            <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1 }} className="gold-text">
              {concepts.length ? Math.round(overall * 100) : '—'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.5)', paddingBottom: 8 }}>/ 100</div>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6, lineHeight: 1.6 }}>
            {concepts.length
              ? 'Rolling exponential score across every concept you\'ve touched.'
              : 'Submit a hand or play a bot round to seed your mastery map.'}
          </div>
          {concepts.length > 0 && (
            <div style={{ marginTop: 14, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.round(overall * 100)}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #d4af37, #f0d76e)',
                borderRadius: 4,
              }} />
            </div>
          )}
        </div>

        <div className="mode-select-card" style={{ cursor: 'default' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: weakest ? '#f87171' : '#d4af37' }}>
            {weakest ? '⚠ TOP RECURRING LEAK' : 'FIRST STEP'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>
            {weakest
              ? CONCEPT_INFO[weakest[0]]?.title ?? weakest[0].replace(/_/g, ' ')
              : 'Play a hand to find your leaks'}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6, lineHeight: 1.6 }}>
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

        <div className="mode-select-card" style={{ cursor: 'default' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#10b981' }}>✓ FIRESTORE</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>Persistent Memory Bank</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6, lineHeight: 1.6 }}>
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
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2, marginBottom: 16 }}>
          Updated after every hand you analyze or play. Rolling EWA score (not last-hand-only).
        </div>

        {loadError && <div className="reasoning-block bad">Couldn't reach the backend — check that the Tell API is running.</div>}
        {!loadError && scores === null && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>}
        {!loadError && scores !== null && concepts.length === 0 && (
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', padding: '28px 0', textAlign: 'center' }}>
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
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: 'rgba(212,175,55,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
                    }}>
                      {info?.icon ?? '🧠'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb' }}>
                          {info?.title ?? concept.replace(/_/g, ' ')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ fontSize: 18, fontWeight: 900 }} className="gold-text">
                            {Math.round(score * 100)}%
                          </div>
                          {cls ? <span className={cls}>{label}</span> : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{label}</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 1.5 }}>
                        {info?.description}
                      </div>
                      <div style={{ marginTop: 10, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.round(score * 100)}%`,
                            height: '100%',
                            background: score < 0.4
                              ? 'linear-gradient(90deg, #c41e3a, #f87171)'
                              : score < 0.7
                                ? 'linear-gradient(90deg, #d97706, #fbbf24)'
                                : 'linear-gradient(90deg, #059669, #34d399)',
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
    </div>
  )
}
