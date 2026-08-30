import { useEffect, useState } from 'react'
import { getStorageInfo, listHands, type Hand } from '../../api'
import { formatBoardDisplay } from '../../cards'
import { SuitIcon } from '../../SuitIcon'
import { formatResult } from '../../coachCopy'

type HistoryProps = {
  userId: string
  isSignedIn?: boolean
  refreshKey?: number
  onReviewHand?: (handId: string) => void
}

function MiniCards({ cards }: { cards: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {cards.map((card) => {
        const suit = (card.at(-1) ?? '').toLowerCase()
        const rank = card.slice(0, -1).toUpperCase()
        const isRed = suit === 'h' || suit === 'd'
        return (
          <div key={card} className={`card card--sm ${isRed ? 'red' : 'black'} suit-${suit}`}>
            <div className="corner-tl">
              <span className="rank">{rank === 'T' ? '10' : rank}</span>
              <SuitIcon suit={suit} className="suit" />
            </div>
            <div className="pip">
              <SuitIcon suit={suit} />
            </div>
            <div className="corner-br">
              <span className="rank">{rank === 'T' ? '10' : rank}</span>
              <SuitIcon suit={suit} className="suit" />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function History({ userId, isSignedIn = false, refreshKey, onReviewHand }: HistoryProps) {
  const [hands, setHands] = useState<Hand[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [persistent, setPersistent] = useState<boolean | null>(null)

  useEffect(() => {
    getStorageInfo()
      .then((info) => setPersistent(info.persistent))
      .catch(() => setPersistent(null))
  }, [])

  useEffect(() => {
    // Saved hands belong to a signed-in account; demo mode shows the gate UI.
    if (!isSignedIn) return
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
  }, [userId, refreshKey, isSignedIn])

  const allTags = new Set<string>()
  hands?.forEach((h) => h.leak_tags.forEach((t) => allTags.add(t)))
  const tagList = ['all', ...Array.from(allTags)]

  const filtered =
    hands?.filter((h) => {
      if (filter === 'all') return true
      return h.leak_tags.includes(filter as Hand['leak_tags'][number])
    }) ?? []

  if (!isSignedIn) {
    return (
      <div className="panel fade-in" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <span className="eyebrow">Hand history</span>
        <h2 className="section-title" style={{ fontSize: 23, marginTop: 8 }}>
          History belongs to your account
        </h2>
        <p className="section-sub" style={{ margin: '8px auto 0', maxWidth: 520 }}>
          Demo mode is shared and temporary, so Tell doesn’t save hands here — and it never shows
          anyone else’s. Sign in with Google and every hand you play or analyze is stored in your
          private Firestore memory.
        </p>
        <div style={{ marginTop: 16, fontSize: 13.5, color: 'var(--text-dim)' }}>
          Sign out, then choose <strong>Sign in with Google</strong> to start building your history.
        </div>
      </div>
    )
  }

  return (
    <div className="panel fade-in" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">Hand history</span>
          <p className="section-sub" style={{ marginTop: 6 }}>
            Every hand you play or analyze, stored with leak tags in Firestore for cross-hand
            pattern detection.
          </p>
        </div>
        {hands && hands.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tagList.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`chip-btn ${filter === tag ? 'selected' : ''}`}
                style={{ padding: '7px 14px', fontSize: 13 }}
                onClick={() => setFilter(tag)}
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

      {persistent === false && (
        <div className="reasoning-block warn" style={{ marginTop: 16 }}>
          <strong style={{ color: '#8a5600' }}>Memory-only mode:</strong> this server isn’t connected
          to Firestore, so hands only live for the current backend session and won’t survive a
          restart. Set <code>GOOGLE_CLOUD_PROJECT</code> (see <code>backend/.env.example</code>) to
          keep your full history across sessions and devices.
        </div>
      )}
      {persistent === true && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: 'var(--green-ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="good-badge">Persistent</span>
          <span style={{ color: 'var(--text-dim)' }}>Hands are stored in Firestore and survive restarts.</span>
        </div>
      )}

      {loadError && <div className="reasoning-block bad" style={{ marginTop: 16 }}>Couldn't reach the backend — check that the Tell API is running.</div>}
      {!loadError && hands === null && <div style={{ marginTop: 20, fontSize: 14, color: 'var(--text-faint)' }}>Loading…</div>}
      {!loadError && hands !== null && hands.length === 0 && (
        <div style={{ marginTop: 20, padding: '28px 0', textAlign: 'center', fontSize: 14, color: 'var(--text-faint)', lineHeight: 1.7 }}>
          No hands yet. Finish a practice hand on the Play tab, or analyze one from the Analyze
          tab — they will show up here automatically.
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((hand) => (
            <div key={hand.id} className="hand-row fade-in">
              <MiniCards cards={hand.hero_cards} />

              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                  <span className={hand.source === 'played' ? 'neutral-badge' : 'good-badge'}>
                    {hand.source === 'played' ? 'Played' : 'Analyzed'}
                  </span>
                  {hand.result && (
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{formatResult(hand.result)}</span>
                  )}
                  {hand.hero_folded && hand.hero_fold_street && (
                    <span className="neutral-badge">folded on {hand.hero_fold_street}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 5 }}>
                  {hand.board.length ? formatBoardDisplay(hand.board) : 'preflop only'} ·{' '}
                  {hand.num_opponents + 1}-max · {hand.decision_points.length} decision
                  {hand.decision_points.length === 1 ? '' : 's'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {hand.leak_tags.length > 0 ? (
                    Array.from(new Set(hand.leak_tags)).map((t) => (
                      <span key={t} className="leak-badge">{t.replace(/_/g, ' ')}</span>
                    ))
                  ) : (
                    <span className="good-badge">no leaks flagged</span>
                  )}
                </div>
              </div>

              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <div>
                  {hand.decision_points.slice(0, 3).map((dp, i) => (
                    <div key={i} style={{ fontSize: 12.5, color: 'var(--text-dim)', padding: '1px 0', fontFamily: 'var(--font-mono)' }}>
                      {dp.street}{' '}
                      {dp.computed_equity != null
                        ? `${(dp.computed_equity * 100).toFixed(0)}%`
                        : dp.action_taken}
                    </div>
                  ))}
                </div>
                {onReviewHand && (
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ fontSize: 13, padding: '7px 14px' }}
                    onClick={() => onReviewHand(hand.id)}
                  >
                    Review
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
