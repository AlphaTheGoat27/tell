import type { DecisionPoint } from '../../api'

type PokerTableProps = {
  heroCards?: string[]
  board?: string[]
  decisionPoints?: DecisionPoint[]
}

const SUIT_SYMBOL: Record<string, string> = { h: '♥', d: '♦', c: '♣', s: '♠' }

function Card({ card }: { card: string }) {
  const rank = card.slice(0, -1)
  const suit = card.slice(-1).toLowerCase()
  const isRed = suit === 'h' || suit === 'd'
  return (
    <span className={`playing-card${isRed ? ' red' : ''}`}>
      {rank}
      {SUIT_SYMBOL[suit] ?? suit}
    </span>
  )
}

function CardRow({ cards }: { cards: string[] }) {
  if (cards.length === 0) return <span className="no-cards">—</span>
  return (
    <span className="card-row">
      {cards.map((c, i) => (
        <Card key={`${c}-${i}`} card={c} />
      ))}
    </span>
  )
}

function LeakBadge({ tag }: { tag: DecisionPoint['leak_tag'] }) {
  if (!tag) return <span className="leak-badge ok">clean</span>
  return <span className="leak-badge leak">{tag.replace(/_/g, ' ')}</span>
}

export function PokerTable({ heroCards = [], board = [], decisionPoints = [] }: PokerTableProps) {
  return (
    <section className="poker-table" aria-label="Poker table">
      <div className="table-row">
        <span className="table-label">Your hand</span>
        <CardRow cards={heroCards} />
      </div>
      <div className="table-row">
        <span className="table-label">Board</span>
        <CardRow cards={board} />
      </div>

      {decisionPoints.length > 0 && (
        <div className="decision-points">
          <span className="table-label">Decisions</span>
          <ul>
            {decisionPoints.map((dp, i) => (
              <li key={i} className="decision-point">
                <span className="street">{dp.street}</span>
                <span className="math">
                  pot ${dp.pot_before.toFixed(2)} · call ${dp.call_amount.toFixed(2)}
                  {dp.required_equity != null && <> · needed {(dp.required_equity * 100).toFixed(1)}%</>}
                  {dp.computed_equity != null && <> · had {(dp.computed_equity * 100).toFixed(1)}%</>}
                </span>
                <LeakBadge tag={dp.leak_tag} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}