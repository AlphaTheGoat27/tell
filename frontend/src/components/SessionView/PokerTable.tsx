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
  focusStreet?: string
  playerNames?: string[]
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
  'seat-8',
]

type CardSize = 'sm' | 'hero' | 'board'

function Card({
  card,
  down = false,
  size = 'board',
  delay = 0,
}: {
  card?: string
  down?: boolean
  size?: CardSize
  delay?: number
}) {
  if (down) {
    return (
      <div
        className={`card-back ${size === 'sm' ? 'card--sm' : size === 'hero' ? 'card--hero' : 'card--board'} card-deal`}
        style={{ animationDelay: `${delay}ms` }}
      />
    )
  }
  if (!card) {
    return <span className={`card-slot ${size === 'board' ? 'card--board' : ''}`} />
  }
  const suit = card.at(-1)!.toLowerCase()
  const rank = card.slice(0, -1).toUpperCase() === 'T' ? '10' : card.slice(0, -1).toUpperCase()
  const isRed = suit === 'h' || suit === 'd'
  const sizeClass = size === 'sm' ? 'card--sm' : size === 'hero' ? 'card--hero' : 'card--board'
  return (
    <div
      className={`card ${isRed ? 'red' : 'black'} ${sizeClass} card-deal`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="corner-tl">
        <span className="rank">{rank}</span>
        <span className="suit">{symbols[suit]}</span>
      </div>
      <span className="pip">{symbols[suit]}</span>
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
  focusStreet,
  playerNames,
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
    if (showdownHands?.[seat]?.length) return showdownHands[seat]
    if (seat === 0) return heroCards
    if (seat === 1 && villainCards.length) return villainCards
    return []
  }
  const stackFor = (seat: number) => {
    if (seat === 0) return heroStack
    return botStacks[seat - 1] ?? 100
  }
  const nameFor = (seat: number) => {
    if (playerNames?.[seat]) return playerNames[seat]
    if (seat === 0) return 'You'
    const names = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Drew', 'Taylor', 'Bob']
    return names[seat - 1] ?? `Bot ${seat}`
  }
  const showCards = (seat: number) => {
    if (seat === 0) return true
    if (showdownHands?.length) return true
    if (villainCards.length && seat === 1) return true
    return false
  }
  const hasLeaks = decisionPoints.some((dp) => dp.leak_tag)

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
      {/* Left: the table and everything about the current decision */}
      <div className="flex flex-col gap-5 min-w-0">
        <div className="table-stage">
          <div className="felt-table" style={{ aspectRatio: '16 / 10', minHeight: 430 }}>
          {Array.from({ length: totalSeats }).map((_, seat) => {
            const isHero = seat === 0
            const isActive = activeSeat === seat
            const isFolded = foldedSeats.includes(seat)
            const isWinner = winner === seat
            return (
              <div key={seat} className={`seat ${seatPositions[seat] ?? 'seat-3'}`}>
                <div
                  className={`player-label ${isHero ? 'hero' : ''} ${isActive ? 'active' : ''} ${isFolded ? 'folded' : ''}`}
                >
                  <span className="name">
                    {nameFor(seat)}
                    {isWinner && ' · wins'}
                  </span>
                  <span className="stack">${stackFor(seat).toFixed(2)}</span>
                </div>
                <div className="player-cards">
                  {[0, 1].map((i) => (
                    <Card
                      key={i}
                      card={handFor(seat)[i]}
                      down={!showCards(seat) && !isFolded}
                      size={isHero ? 'hero' : 'sm'}
                      delay={seat * 70 + i * 50}
                    />
                  ))}
                </div>
                {dealerSeat === seat && <div className="dealer-chip">D</div>}
              </div>
            )
          })}
          <div className="board-area">
            <span className="street-label">{street}</span>
            <div className="pot-display">
              <span className="pot-label">Pot</span>
              <span className="pot-amount">${pot.toFixed(2)}</span>
            </div>
            <div className="board-cards">
              {Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} card={board[i]} size="board" delay={250 + i * 110} />
              ))}
            </div>
          </div>
          </div>
        </div>

        {decisionPoints.length > 0 && (
          <div className="info-card fade-in">
            <div className="info-card-title">Decision breakdown</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {decisionPoints.map((dp, i) => {
                const dimmed = focusStreet && dp.street !== focusStreet
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                      opacity: dimmed ? 0.45 : 1,
                    }}
                  >
                    <span className="neutral-badge" style={{ minWidth: 62, justifyContent: 'center' }}>
                      {dp.street}
                    </span>
                    {dp.required_equity != null && (
                      <span style={{ fontSize: 13.5, color: 'var(--text-dim)' }}>
                        Needed <strong style={{ color: 'var(--text)' }}>{(dp.required_equity * 100).toFixed(1)}%</strong>
                      </span>
                    )}
                    {dp.computed_equity != null && (
                      <span style={{ fontSize: 13.5, color: 'var(--text-dim)' }}>
                        had <strong style={{ color: 'var(--text)' }}>{(dp.computed_equity * 100).toFixed(1)}%</strong>
                      </span>
                    )}
                    {dp.leak_tag ? (
                      <span className="leak-badge">{dp.leak_tag.replace(/_/g, ' ')}</span>
                    ) : (
                      <span className="good-badge">solid</span>
                    )}
                  </div>
                )
              })}
            </div>
            {!hasLeaks && (
              <div className="reasoning-block" style={{ marginTop: 10 }}>
                No leaks flagged in these decisions — your math lined up with what the spot required.
              </div>
            )}
          </div>
        )}

        {actionPanel}
      </div>

      {/* Right: the coach conversation, always visible */}
      <div
        className="flex flex-col gap-5 min-w-0 xl:sticky xl:top-[84px]"
        style={{ height: 'min(760px, calc(100vh - 108px))' }}
      >
        {chatPanel}
        {infoPanel}
      </div>
    </div>
  )
}
