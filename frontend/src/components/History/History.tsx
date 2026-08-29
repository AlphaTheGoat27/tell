import { useEffect, useState } from 'react'
import { listHands, type Hand } from '../../api'

type HistoryProps = { userId: string; refreshKey?: number }

export function History({ userId, refreshKey }: HistoryProps) {
  const [hands, setHands] = useState<Hand[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    let cancelled = false
    listHands(userId)
      .then((res) => {
        if (!cancelled) setHands(res.hands)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [userId, refreshKey])

  const allTags = new Set<string>()
  hands?.forEach((h) => h.leak_tags.forEach((t) => allTags.add(t)))
  const tagList = ['all', ...Array.from(allTags)]

  const filtered = hands?.filter((h) => {
    if (filter === 'all') return true
    return h.leak_tags.includes(filter as Hand['leak_tags'][number])
  }) ?? []

  return (
    <div className="info-card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="info-card-title">Past hands</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
            Every hand you\'ve analyzed, stored with leak tags for cross-hand pattern detection via Firestore vector search.
          </div>
        </div>
        {hands && hands.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tagList.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setFilter(tag)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  border: filter === tag ? '1px solid #d4af37' : '1px solid rgba(255,255,255,0.08)',
                  background: filter === tag ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.02)',
                  color: filter === tag ? '#d4af37' : 'rgba(255,255,255,0.55)',
                  cursor: 'pointer',
                }}
              >
                {tag === 'all' ? 'All hands' : tag.replace(/_/g, ' ')}
                {tag !== 'all' && (
                  <span style={{ marginLeft: 6, opacity: 0.6 }}>
                    ({hands.filter((h) => h.leak_tags.includes(tag as Hand['leak_tags'][number])).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {loadError && <div className="reasoning-block bad" style={{ marginTop: 16 }}>Couldn't reach the backend.</div>}
      {!loadError && hands === null && <div style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>}
      {!loadError && hands !== null && hands.length === 0 && (
        <div style={{ marginTop: 20, padding: '28px 0', textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
          No analyzed hands yet. Go to the Table tab and paste a hand history — or use the demo hand to see this fill up.
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((hand) => (
            <div
              key={hand.id}
              style={{
                padding: 14,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)',
                display: 'grid',
                gap: 10,
                gridTemplateColumns: 'auto 1fr auto',
                alignItems: 'center',
              }}
              className="fade-in"
            >
              <div style={{ display: 'flex', gap: 6 }}>
                {hand.hero_cards.map((card) => {
                  const suit = card.at(-1) || ''
                  const isRed = suit === 'h' || suit === 'd'
                  return (
                    <div
                      key={card}
                      style={{
                        width: 36,
                        height: 50,
                        borderRadius: 5,
                        background: 'linear-gradient(145deg, #fff, #f0f0f0)',
                        color: isRed ? '#dc2626' : '#111',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        padding: '3px 4px',
                        fontSize: 10,
                        fontWeight: 800,
                        lineHeight: 1,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      }}
                    >
                      <span>{card.slice(0, -1)}{{ s: '♠', h: '♥', d: '♦', c: '♣' }[suit]}</span>
                      <span style={{ alignSelf: 'flex-end', transform: 'rotate(180deg)' }}>{card.slice(0, -1)}{{ s: '♠', h: '♥', d: '♦', c: '♣' }[suit]}</span>
                    </div>
                  )
                })}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    Board: {hand.board.length ? hand.board.join(' ') : 'preflop only'}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    · {hand.num_opponents + 1}-max
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    · {hand.decision_points.length} decision{hand.decision_points.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {hand.leak_tags.length > 0 ? (
                    hand.leak_tags.map((t) => (
                      <span key={t} className="leak-badge">⚠ {t.replace(/_/g, ' ')}</span>
                    ))
                  ) : (
                    <span className="good-badge">✓ no leaks flagged</span>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right', minWidth: 100 }}>
                {hand.decision_points.map((dp, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', padding: '1px 0' }}>
                    <span className="good-badge" style={{ marginRight: 6 }}>{dp.street}</span>
                    {dp.computed_equity != null
                      ? `${(dp.computed_equity * 100).toFixed(0)}%`
                      : dp.action_taken}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
