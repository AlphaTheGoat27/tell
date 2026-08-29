import { useEffect, useState } from 'react'
import { listHands, type Hand } from '../../api'

type HistoryProps = { userId: string; refreshKey?: number }

export function History({ userId, refreshKey }: HistoryProps) {
  const [hands, setHands] = useState<Hand[] | null>(null)
  const [loadError, setLoadError] = useState(false)

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

  return (
    <section aria-label="History" className="history-panel">
      <h2>Past hands</h2>

      {loadError && <p className="error-text">Couldn't reach the backend.</p>}
      {!loadError && hands === null && <p className="hint-text">Loading…</p>}
      {!loadError && hands !== null && hands.length === 0 && (
        <p className="hint-text">No analyzed hands yet.</p>
      )}

      {hands && hands.length > 0 && (
        <ul className="history-list">
          {hands.map((hand) => (
            <li key={hand.id} className="history-row">
              <span className="history-cards">{hand.hero_cards.join(' ')}</span>
              <span className="history-board">{hand.board.join(' ') || 'preflop only'}</span>
              <span className="history-leaks">
                {hand.leak_tags.length > 0
                  ? hand.leak_tags.map((t) => t.replace(/_/g, ' ')).join(', ')
                  : 'no leaks flagged'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}