import { useEffect, useMemo, useRef, useState } from 'react'
import { speakCoach } from '../../coachSpeech'
import { formatCardDisplay } from '../../cards'

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
const SUITS = ['s', 'h', 'd', 'c']
const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
const ALL_CARDS = SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}`))

export type TargetKey = 'hero' | 'villain' | 'board'

/** Data the builder collects. Lifted into SessionView so the user can leave
 * (focus / review a hand) and come back to edit the same cards at any point. */
export type BuilderData = {
  hero: string[]
  villain: string[]
  board: string[]
  numOpponents: number
  streetBets: Record<string, number>
}

type HandBuilderProps = {
  busy: boolean
  data: BuilderData
  onDataChange: (updater: (prev: BuilderData) => BuilderData) => void
  onAnalyze: (rawText: string, numOpponents: number) => void
}

const EMPTY_BUILDER: BuilderData = {
  hero: [],
  villain: [],
  board: [],
  numOpponents: 1,
  streetBets: { flop: 10, turn: 15, river: 20 },
}

function isRed(card: string): boolean {
  const suit = card.slice(-1).toLowerCase()
  return suit === 'h' || suit === 'd'
}

/** Reconstructs a PokerStars-style hand history from the picked cards so the
 * deterministic parser runs without any typing. Villain1 bets each street that
 * has board cards and Hero calls — those calls become the decision points Tell
 * studies. */
function buildHistory(
  hero: string[],
  villain: string[],
  board: string[],
  numOpponents: number,
  streetBets: Record<string, number>,
): string {
  const lines: string[] = []
  lines.push(`Hand #1: Hold'em No Limit ($1/$2) - Tell table build`)
  lines.push('Seat 1: Hero ($200 in chips)')
  for (let i = 1; i <= numOpponents; i++) lines.push(`Seat ${i + 1}: Villain${i} ($200 in chips)`)
  lines.push('Hero: posts small blind $1')
  lines.push('Villain1: posts big blind $2')
  lines.push('*** HOLE CARDS ***')
  lines.push(`Dealt to Hero [${hero.join(' ')}]`)
  for (let i = numOpponents; i >= 2; i--) lines.push(`Villain${i}: folds`)
  lines.push('Villain1: raises $4 to $6')
  lines.push('Hero: calls $4')

  const streets: { name: string; header: string; count: number }[] = [
    { name: 'flop', header: 'FLOP', count: 3 },
    { name: 'turn', header: 'TURN', count: 4 },
    { name: 'river', header: 'RIVER', count: 5 },
  ]
  for (const street of streets) {
    if (board.length < street.count) break
    lines.push(`*** ${street.header} *** [${board.slice(0, street.count).join(' ')}]`)
    const bet = streetBets[street.name] ?? 10
    lines.push(`Villain1: bets $${bet}`)
    lines.push(`Hero: calls $${bet}`)
  }

  if (villain.length === 2) {
    lines.push('*** SHOW DOWN ***')
    lines.push(`Villain1: shows [${villain.join(' ')}]`)
    lines.push(`Hero: shows [${hero.join(' ')}]`)
  }
  return lines.join('\n')
}

function SlotCard({ card, onRemove }: { card?: string; onRemove?: () => void }) {
  if (!card) {
    return <button type="button" className="builder-card-slot" aria-label="Empty card slot" onClick={onRemove} />
  }
  const rank = card.slice(0, -1).toUpperCase() === 'T' ? '10' : card.slice(0, -1).toUpperCase()
  const suit = SUIT_SYMBOL[card.slice(-1).toLowerCase()]
  return (
    <button
      type="button"
      className={`builder-card-slot filled card card--sm ${isRed(card) ? 'red' : 'black'}`}
      style={{ animation: 'none' }}
      onClick={onRemove}
      title="Click to remove"
    >
      <div className="corner-tl">
        <span className="rank">{rank}</span>
        <span className="suit">{suit}</span>
      </div>
      <span className="pip">{suit}</span>
    </button>
  )
}

export function HandBuilder({ busy, data, onDataChange, onAnalyze }: HandBuilderProps) {
  const { hero, villain, board, numOpponents, streetBets } = data
  const [active, setActive] = useState<TargetKey>('hero')

  const used = useMemo(() => new Set([...hero, ...villain, ...board]), [hero, villain, board])

  const caps: Record<TargetKey, number> = { hero: 2, villain: 2, board: 5 }
  const values: Record<TargetKey, string[]> = { hero, villain, board }

  function stepHint(): string {
    if (hero.length < 2) return 'First, pick your two hole cards from the deck.'
    if (board.length === 0) return 'Now the flop — click the three board cards.'
    if (board.length > 0 && board.length < 3) return `The flop needs three cards — ${3 - board.length} to go.`
    if (board.length === 3) return 'Flop set. Add the turn card if the hand continued, or analyze now.'
    if (board.length === 4) return 'Add the river card if it went that far, or analyze now.'
    return 'Full board. Reveal Villain1’s cards for exact equity, or analyze.'
  }
  const hint = stepHint()

  // Speak the guidance each time the step changes.
  const lastHintRef = useRef('')
  useEffect(() => {
    if (hint !== lastHintRef.current) {
      lastHintRef.current = hint
      speakCoach(hint)
    }
  }, [hint])

  function assign(card: string) {
    onDataChange((prev) => {
      const all = [...prev.hero, ...prev.villain, ...prev.board]
      if (all.includes(card)) return prev
      const target = active
      const current = target === 'hero' ? prev.hero : target === 'villain' ? prev.villain : prev.board
      if (current.length >= caps[target]) return prev
      if (target === 'hero') return { ...prev, hero: [...current, card] }
      if (target === 'villain') return { ...prev, villain: [...current, card] }
      return { ...prev, board: [...current, card] }
    })
  }

  function removeFrom(target: TargetKey, index: number) {
    onDataChange((prev) => {
      if (target === 'hero') return { ...prev, hero: prev.hero.filter((_, i) => i !== index) }
      if (target === 'villain') return { ...prev, villain: prev.villain.filter((_, i) => i !== index) }
      return { ...prev, board: prev.board.filter((_, i) => i !== index) }
    })
  }

  function clearAll() {
    onDataChange(() => ({ ...EMPTY_BUILDER }))
    setActive('hero')
  }

  const canAnalyze = hero.length === 2 && [0, 3, 4, 5].includes(board.length)

  function submit() {
    if (!canAnalyze) return
    onAnalyze(buildHistory(hero, villain, board, numOpponents, streetBets), numOpponents)
  }

  const streetsWithCards = [
    { name: 'flop', label: 'Flop', present: board.length >= 3 },
    { name: 'turn', label: 'Turn', present: board.length >= 4 },
    { name: 'river', label: 'River', present: board.length >= 5 },
  ].filter((s) => s.present)

  return (
    <div className="builder-grid">
      <div className="reasoning-block" style={{ borderLeftColor: 'var(--accent)' }}>
        <strong style={{ color: 'var(--text)' }}>Coach:</strong> {hint} Click any filled card to remove it —
        everything here stays editable until you analyze.
      </div>

      {/* Target rows: click a group to set where the next deck card lands */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          className={`builder-target-row ${active === 'hero' ? 'active' : ''}`}
          onClick={() => setActive('hero')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setActive('hero')}
        >
          <span className="target-name">You (Hero)</span>
          {[0, 1].map((i) => (
            <SlotCard key={i} card={hero[i]} onRemove={() => hero[i] && removeFrom('hero', i)} />
          ))}
          <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>your two hole cards</span>
        </div>

        <div
          className={`builder-target-row ${active === 'board' ? 'active' : ''}`}
          onClick={() => setActive('board')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setActive('board')}
        >
          <span className="target-name">Board</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <SlotCard key={i} card={board[i]} onRemove={() => board[i] && removeFrom('board', i)} />
          ))}
          <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>flop · turn · river</span>
        </div>

        <div
          className={`builder-target-row ${active === 'villain' ? 'active' : ''}`}
          onClick={() => setActive('villain')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setActive('villain')}
        >
          <span className="target-name">Villain1</span>
          {[0, 1].map((i) => (
            <SlotCard key={i} card={villain[i]} onRemove={() => villain[i] && removeFrom('villain', i)} />
          ))}
          <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>optional — enables exact equity</span>
        </div>
      </div>

      {/* Deck */}
      <div>
        <div className="info-card-title">
          Deck · click a card to deal it into “{active === 'hero' ? 'your hand' : active === 'board' ? 'the board' : 'Villain1’s hand'}”
        </div>
        <div className="deck-grid">
          {ALL_CARDS.map((card) => {
            const disabled = used.has(card) || values[active].length >= caps[active]
            const rank = card.slice(0, -1).toUpperCase() === 'T' ? '10' : card.slice(0, -1).toUpperCase()
            const suit = SUIT_SYMBOL[card.slice(-1).toLowerCase()]
            return (
              <button
                key={card}
                type="button"
                className={`deck-card ${isRed(card) ? 'red' : 'black'}`}
                disabled={disabled}
                onClick={() => assign(card)}
                title={formatCardDisplay(card)}
              >
                <span>{rank}</span>
                <span>{suit}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Table setup: opponents + bet sizing */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div>
          <div className="info-card-title">Players in the hand</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                className={`chip-btn ${numOpponents === n ? 'selected' : ''}`}
                onClick={() => onDataChange((prev) => ({ ...prev, numOpponents: n }))}
              >
                {n === 1 ? 'Heads-up' : `${n} villains`}
              </button>
            ))}
          </div>
        </div>
        {streetsWithCards.length > 0 && (
          <div>
            <div className="info-card-title">Villain bet sizes (Hero calls)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {streetsWithCards.map((s) => (
                <div key={s.name} className="builder-action-row">
                  <span style={{ minWidth: 42, fontWeight: 600 }}>{s.label}</span>
                  <span style={{ color: 'var(--text-faint)' }}>Villain1 bets $</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={streetBets[s.name] ?? 10}
                    onChange={(e) =>
                      onDataChange((prev) => ({
                        ...prev,
                        streetBets: { ...prev.streetBets, [s.name]: Math.max(1, Number(e.target.value) || 1) },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn-ghost" onClick={clearAll}>
          Clear table
        </button>
        <button
          type="button"
          className="gold-btn"
          style={{ padding: '10px 20px', fontSize: 14 }}
          disabled={!canAnalyze || busy}
          onClick={submit}
        >
          {busy ? 'Analyzing…' : 'Analyze this hand'}
        </button>
      </div>
      {!canAnalyze && (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
          Pick your two hole cards
          {board.length > 0 && ![0, 3, 4, 5].includes(board.length) ? ' and finish the board (flop is 3 cards)' : ''} to analyze.
        </div>
      )}
    </div>
  )
}
