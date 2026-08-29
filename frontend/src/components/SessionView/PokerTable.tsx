import type { ReactNode } from 'react'
import type { DecisionPoint } from '../../api'

type Props = {
  heroCards?: string[]
  board?: string[]
  decisionPoints?: DecisionPoint[]
  numOpponents?: number
  villainCards?: string[]
  showdownHands?: string[][]
  heroStack?: number
  botStacks?: number[]
  pot?: number
  street?: string
  activeSeat?: number
  foldedSeats?: number[]
  winner?: number | null
  dealerSeat?: number
  chatPanel: ReactNode
  actionPanel: ReactNode
  infoPanel?: ReactNode
}

const symbols: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
const seatPositions = [
  'seat-hero',
  'seat-1',
  'seat-2',
  'seat-3',
  'seat-4',
  'seat-5',
  'seat-6',
  'seat-7',
]

function Card({ card, down = false, delay = 0 }: { card?: string; down?: boolean; delay?: number }) {
  if (down) {
    return <div className="card-back" style={{ animationDelay: `${delay}ms` }} />
  }
  if (!card) {
    return <span style={{ width: 60, height: 84, borderRadius: 6, border: '2px dashed rgba(212,175,55,0.25)', background: 'rgba(255,255,255,0.02)' }} />
  }
  const suit = card.at(-1)!
  const rank = card.slice(0, -1)
  const isRed = suit === 'h' || suit === 'd'
  return (
    <div className={`card ${isRed ? 'red' : 'black'} card-deal`} style={{ animationDelay: `${delay}ms` }}>
      <div className="corner-tl">
        <span className="rank">{rank}</span>
        <span className="suit">{symbols[suit]}</span>
      </div>
      <div className="corner-br">
        <span className="rank">{rank}</span>
        <span className="suit">{symbols[suit]}</span>
      </div>
    </div>
  )
}

export function PokerTable({
  heroCards = [],
  board = [],
  decisionPoints = [],
  numOpponents = 1,
  villainCards = [],
  showdownHands,
  heroStack = 100,
  botStacks = [],
  pot = 0,
  street = 'preflop',
  activeSeat = -1,
  foldedSeats = [],
  winner = null,
  dealerSeat = 0,
  chatPanel,
  actionPanel,
  infoPanel,
}: Props) {
  const totalSeats = numOpponents + 1
  const handFor = (seat: number) => {
    if (showdownHands?.[seat]) return showdownHands[seat]
    if (seat === 0) return heroCards
    if (seat === 1 && villainCards.length) return villainCards
    return []
  }
  const stackFor = (seat: number) => {
    if (seat === 0) return heroStack
    return botStacks[seat - 1] ?? 100
  }
  const nameFor = (seat: number) => {
    if (seat === 0) return 'YOU'
    const names = ['BOT ALEX', 'BOT SAM', 'BOT JORDAN', 'BOT CASEY', 'BOT RILEY', 'BOT DREW', 'BOT TAYLOR']
    return names[seat - 1] ?? `BOT ${seat}`
  }
  const showCards = (seat: number) => {
    if (seat === 0) return true
    if (showdownHands?.length) return true
    if (villainCards.length && seat === 1) return true
    return false
  }
  const hasLeaks = decisionPoints.some((dp) => dp.leak_tag)
  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] min-h-180">
      <div className="flex flex-col gap-4">
        {chatPanel}
        {infoPanel}
      </div>
      <div className="flex flex-col gap-4">
        <div className="felt-table" style={{ aspectRatio: '16 / 10', minHeight: 440 }}>
          <span className="street-label">{street}</span>
          {Array.from({ length: totalSeats }).map((_, seat) => {
            const isHero = seat === 0
            const isActive = activeSeat === seat
            const isFolded = foldedSeats.includes(seat)
            const isWinner = winner === seat
            return (
              <div key={seat} className={`seat ${seatPositions[seat]}`}>
                <div className={`player-label ${isHero ? 'hero' : ''} ${isActive ? 'active' : ''} ${isFolded ? 'folded' : ''}`}>
                  <span className="name">
                    {nameFor(seat)}
                    {isWinner && ' 🏆'}
                  </span>
                  <span className="stack">${stackFor(seat).toFixed(2)}</span>
                </div>
                <div className="player-cards">
                  {[0, 1].map((i) => (
                    <Card
                      key={i}
                      card={handFor(seat)[i]}
                      down={!showCards(seat) && !isFolded}
                      delay={seat * 80 + i * 50}
                    />
                  ))}
                </div>
                {dealerSeat === seat && (
                  <div style={{ position: 'absolute', top: -6, right: -6 }} className="dealer-chip">D</div>
                )}
              </div>
            )
          })}
          <div className="board-area">
            <div className="pot-display">
              <div className="pot-label">Total Pot</div>
              <div className="pot-amount">${pot.toFixed(2)}</div>
            </div>
            <div className="board-cards">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} card={board[i]} delay={300 + i * 120} />
              ))}
            </div>
          </div>
        </div>
        {decisionPoints.length > 0 && (
          <div className="info-card fade-in">
            <div className="info-card-title">Decision Breakdown</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {decisionPoints.map((dp, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="good-badge">{dp.street}</span>
                  {dp.required_equity != null && (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                      Need: {(dp.required_equity * 100).toFixed(1)}%
                    </span>
                  )}
                  {dp.computed_equity != null && (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                      Had: {(dp.computed_equity * 100).toFixed(1)}%
                    </span>
                  )}
                  {dp.leak_tag ? (
                    <span className="leak-badge">⚠ {dp.leak_tag.replace(/_/g, ' ')}</span>
                  ) : (
                    <span className="good-badge">✓ solid</span>
                  )}
                </div>
              ))}
            </div>
            {!hasLeaks && decisionPoints.length > 0 && (
              <div className="reasoning-block" style={{ marginTop: 10 }}>
                Nice — no leaks flagged in these decisions. Your math lined up with what the spot required.
              </div>
            )}
          </div>
        )}
        {actionPanel}
      </div>
    </div>
  )
}
