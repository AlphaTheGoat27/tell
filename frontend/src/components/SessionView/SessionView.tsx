import { useState } from 'react'
import { analyzeHand, type AnalyzeResponse } from '../../api'
import { PokerTable } from './PokerTable'

const SAMPLE_HAND = `Hand #123: Hold'em No Limit ($0.50/$1.00)
Seat 1: Hero ($100.00 in chips)
Seat 2: Villain1 ($95.50 in chips)
Hero: posts small blind $0.50
Villain1: posts big blind $1.00
*** HOLE CARDS ***
Dealt to Hero [Ah Kd]
Hero: raises $2.50 to $3.00
Villain1: calls $2.00
*** FLOP *** [Kh 7c 2s]
Villain1: checks
Hero: bets $4.50
Villain1: calls $4.50
*** TURN *** [Kh 7c 2s 5d]
Villain1: checks
Hero: bets $10.00
Villain1: calls $10.00
*** RIVER *** [Kh 7c 2s 5d 9h]
Villain1: bets $20.00
Hero: calls $20.00
*** SHOW DOWN ***
Villain1: shows [Qh Qd] (a pair of Queens)
Hero: shows [Ah Kd] (a pair of Kings)`

type SessionViewProps = { userId: string; onHandSaved?: () => void }

export function SessionView({ userId, onHandSaved }: SessionViewProps) {
  const [rawText, setRawText] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!rawText.trim()) return
    setStatus('loading')
    setErrorMessage('')
    try {
      const response = await analyzeHand(rawText, userId)
      setResult(response)
      setStatus('idle')
      if (response.status === 'parsed') onHandSaved?.()
    } catch (err) {
      setStatus('error')
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <section aria-label="Hand Autopsy" className="session-view">
      <form onSubmit={handleSubmit} className="hand-form">
        <label htmlFor="hand-input">Paste a hand history export</label>
        <textarea
          id="hand-input"
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={10}
          placeholder="Paste a structured hand history export here..."
        />
        <div className="form-actions">
          <button type="button" className="ghost" onClick={() => setRawText(SAMPLE_HAND)}>
            Use sample hand
          </button>
          <button type="submit" disabled={status === 'loading' || !rawText.trim()}>
            {status === 'loading' ? 'Analyzing…' : 'Submit a hand'}
          </button>
        </div>
      </form>

      {status === 'error' && <p className="error-text">{errorMessage}</p>}

      {result?.status === 'needs_clarification' && (
        <p className="hint-text">{result.message}</p>
      )}

      {result?.status === 'parsed' && (
        <PokerTable
          heroCards={result.hand.hero_cards}
          board={result.hand.board}
          decisionPoints={result.hand.decision_points}
        />
      )}
    </section>
  )
}