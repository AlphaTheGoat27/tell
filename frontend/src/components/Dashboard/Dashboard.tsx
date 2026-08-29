import { useEffect, useState } from 'react'
import { getMastery } from '../../api'

type DashboardProps = { userId: string; refreshKey?: number }

function scoreLabel(score: number): string {
  if (score < 0.4) return 'weak'
  if (score < 0.7) return 'developing'
  return 'strong'
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

  return (
    <section aria-label="Dashboard" className="dashboard-panel">
      <h2>Your mastery map</h2>

      {loadError && <p className="error-text">Couldn't reach the backend.</p>}

      {!loadError && scores === null && <p className="hint-text">Loading…</p>}

      {!loadError && scores !== null && concepts.length === 0 && (
        <p className="hint-text">Submit a hand to start building your mastery map.</p>
      )}

      {concepts.length > 0 && (
        <ul className="mastery-list">
          {concepts.map(([concept, score]) => (
            <li key={concept} className="mastery-row">
              <span className="concept-name">{concept.replace(/_/g, ' ')}</span>
              <div className="mastery-bar">
                <div className="mastery-bar-fill" style={{ width: `${Math.round(score * 100)}%` }} />
              </div>
              <span className={`mastery-label ${scoreLabel(score)}`}>{scoreLabel(score)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}