import { useEffect, useRef, useState, type FormEvent } from 'react'
import { PokerTable } from './PokerTable'
import {
  advanceBots,
  analyzeHand,
  logAction,
  playPracticeAction,
  practiceChat,
  startPractice,
  type AnalyzeResponse,
  type DecisionPoint,
  type PracticeGame,
} from '../../api'
import { onCoachSpeaking, speakCoach, warmCoachSpeech } from '../../coachSpeech'
import {
  chatNarrateAction,
  chatQuestionNewHand,
  chatQuestionPotOdds,
  chatQuestionStreet,
  chatRevealHandStrength,
  chatRevealPotOdds,
  chatRevealPrediction,
  formatResult,
  handStrengthQuizText,
  streetLabel,
  botLabel,
  voiceNarrateAction,
  voiceQuestionAfterFold,
  voiceQuestionNewHand,
  voiceQuestionPotOdds,
  voiceQuestionStreet,
  voiceRevealHandStrength,
  voiceRevealPotOdds,
  voiceRevealPrediction,
} from '../../coachCopy'
import { formatBoardDisplay, formatCardsDisplay } from '../../cards'

type SessionViewProps = { userId: string; onHandSaved?: () => void }
type Experience = 'choose' | 'practice' | 'review'
type HintLevel = 1 | 2 | 3 | 4

type ChatMsg = {
  id: number
  role: 'ai' | 'user' | 'system'
  text: string
  options?: { label: string; value: string; nextHint?: HintLevel }[]
  isPotOddsQuiz?: boolean
  potData?: { pot: number; call: number; answerPct: number }
  answered?: boolean
}

const SAMPLE_HAND = `Hand #1001: Hold'em No Limit ($1/$2)
Seat 1: Hero ($100 in chips)
Seat 2: Villain1 ($100 in chips)
Hero: posts small blind $1
Villain1: posts big blind $2
*** HOLE CARDS ***
Dealt to Hero [As Kh]
Hero: raises $4 to $6
Villain1: calls $4
*** FLOP *** [Qs 8h 2c]
Villain1: bets $10
Hero: calls $10
*** SHOW DOWN ***
Villain1: shows [Qh Jc]
Hero: shows [As Kh]`

const BOT_NAMES = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Drew', 'Taylor']

function coachSpeechKey(g: PracticeGame): string {
  return `${g.id}|${g.street}|${g.complete}|${g.needs_prediction}|${g.hero_folded}`
}

function randPick<T>(arr: T[], exclude?: T): T {
  const pool = exclude ? arr.filter((x) => x !== exclude) : arr
  return pool[Math.floor(Math.random() * pool.length)]
}

function buildPotOddsOptions(pot: number, call: number): ChatMsg['options'] {
  const correct = (call / (pot + call)) * 100
  const correctLabel = `${correct.toFixed(1)}%`
  const wrong1 = `${(correct * 0.5).toFixed(1)}%`
  const wrong2 = `${Math.min(95, correct * 1.6).toFixed(1)}%`
  const wrong3 = `${Math.min(98, correct + 25).toFixed(1)}%`
  const all = [correctLabel, wrong1, wrong2, wrong3].map((l, i) => ({
    label: `I need ~${l} equity to call`,
    value: i === 0 ? 'correct' : 'wrong',
  }))
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[all[i], all[j]] = [all[j], all[i]]
  }
  return all
}

export function SessionView({ userId, onHandSaved }: SessionViewProps) {
  const [experience, setExperience] = useState<Experience>('choose')
  const [players, setPlayers] = useState(6)
  const [tableReady, setTableReady] = useState(false)
  const [game, setGame] = useState<PracticeGame | null>(null)
  const [error, setError] = useState('')
  const [rawHand, setRawHand] = useState('')
  const [analysis, setAnalysis] = useState<Extract<AnalyzeResponse, { status: 'parsed' }> | null>(null)
  const [reviewStep, setReviewStep] = useState<'question' | 'answer'>('question')
  const [narrating, setNarrating] = useState(false)
  const [chatText, setChatText] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [raiseAmount, setRaiseAmount] = useState(6)
  const msgIdRef = useRef(0)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const spokenKeyRef = useRef('')
  const potOddsFormulaShownRef = useRef(false)

  const addMsg = (msg: Omit<ChatMsg, 'id'>) => {
    msgIdRef.current += 1
    setChatMessages((prev) => [...prev, { ...msg, id: msgIdRef.current }])
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    warmCoachSpeech()
    return onCoachSpeaking(setNarrating)
  }, [])

  async function openTable() {
    setTableReady(true)
    setChatMessages([])
    setError('')
    spokenKeyRef.current = ''
    potOddsFormulaShownRef.current = false
    if (experience !== 'practice') return
    try {
      const g = await startPractice(players)
      spokenKeyRef.current = coachSpeechKey(g)
      setGame(g)
      speakCoach(voiceQuestionNewHand(g))
      addMsg({ role: 'ai', text: chatQuestionNewHand(g) })
      setTimeout(() => {
        addMsg({
          role: 'ai',
          text: handStrengthQuizText(g.hero_cards),
          options: [
            { label: 'Premium (raise)', value: 'premium' },
            { label: 'Playable (see a flop)', value: 'playable' },
            { label: 'Weak (fold)', value: 'weak' },
          ],
        })
      }, 400)
    } catch {
      setError('Start the Tell API to play a bot hand.')
    }
  }

  async function takeAction(action: string) {
    if (!game) return
    const actedOn = game.street
    addMsg({ role: 'user', text: `${action.toUpperCase()}${action === 'raise' ? ` to $${raiseAmount}` : ''}.` })

    try {
      const g = await playPracticeAction(game.id, action === 'raise' ? 'raise' : action)
      setGame(g)
      spokenKeyRef.current = coachSpeechKey(g)

      addMsg({ role: 'ai', text: chatNarrateAction(g, action, actedOn) })

      if (action === 'fold') {
        speakCoach(voiceQuestionAfterFold(g, actedOn))
        addMsg({ role: 'ai', text: 'Who has the best hand? Pick a bot.' })
      } else if (g.complete) {
        speakCoach(voiceNarrateAction(g, action, actedOn))
      } else {
        speakCoach(voiceQuestionStreet(g))
        addMsg({ role: 'ai', text: chatQuestionStreet(g) })
      }

      if (action === 'call' && !g.complete && !g.needs_prediction) {
        const potBefore = g.pot - 1
        const call = 1.0
        const showFormula = !potOddsFormulaShownRef.current
        setTimeout(() => {
          speakCoach(voiceQuestionPotOdds(potBefore, call))
          addMsg({
            role: 'ai',
            text: chatQuestionPotOdds(potBefore, call, showFormula),
            isPotOddsQuiz: true,
            potData: { pot: potBefore, call, answerPct: (call / (potBefore + call)) * 100 },
            options: buildPotOddsOptions(potBefore, call),
          })
        }, 300)
      }
    } catch {
      setError('The practice hand could not advance.')
    }
  }

  async function submitPrediction(botSeat: number) {
    if (!game) return
    const name = botLabel(botSeat)
    addMsg({ role: 'user', text: `I think ${name} wins.` })
    try {
      const g = await advanceBots(game.id, botSeat)
      setGame(g)
      spokenKeyRef.current = coachSpeechKey(g)
      const correct = g.winner === botSeat
      const voice = voiceRevealPrediction(g, botSeat, correct)
      const chat = chatRevealPrediction(g, botSeat, correct)
      speakCoach(voice)
      addMsg({ role: 'ai', text: chat })
    } catch {
      setError('Could not resolve your prediction.')
    }
  }

  async function skipPrediction() {
    if (!game) return
    try {
      const g = await advanceBots(game.id)
      setGame(g)
      spokenKeyRef.current = coachSpeechKey(g)
      speakCoach(voiceNarrateAction(g, 'showdown'))
      addMsg({ role: 'ai', text: `${formatResult(g.result)} Board: ${formatBoardDisplay(g.board)}.` })
    } catch {
      setError('Could not finish the hand.')
    }
  }

  function playAgain() {
    setError('')
    setChatMessages([])
    spokenKeyRef.current = ''
    potOddsFormulaShownRef.current = false
    startPractice(players).then((g) => {
      setGame(g)
      spokenKeyRef.current = coachSpeechKey(g)
      speakCoach(voiceQuestionNewHand(g))
      addMsg({ role: 'ai', text: chatQuestionNewHand(g) })
      setTimeout(() => {
        addMsg({
          role: 'ai',
          text: handStrengthQuizText(g.hero_cards),
          options: [
            { label: 'Premium (raise)', value: 'premium' },
            { label: 'Playable (see a flop)', value: 'playable' },
            { label: 'Weak (fold)', value: 'weak' },
          ],
        })
      }, 400)
    }).catch(() => setError('The next hand could not be dealt.'))
  }

  function localCoachReply(text: string): string {
    const lower = text.toLowerCase()
    if (lower.includes('pot') && lower.includes('odd')) {
      const call = game?.available_actions.includes('call') ? 1 : 2
      const pot = game?.pot ?? 0
      const need = (call / (pot + call)) * 100
      return `Right now the pot is $${pot.toFixed(2)}. If you had to call $${call}, you'd need ~${need.toFixed(1)}% equity to break even long-term. Want the step-by-step math?`
    }
    if (lower.includes('win') || lower.includes('best hand') || lower.includes('winning')) {
      return game?.complete && game
        ? `The winner was ${game.winner === 0 ? 'YOU' : botLabel(game.winner ?? 1)} with the best five-card hand.\nBoard: ${formatBoardDisplay(game.board)}`
        : game
        ? `${streetLabel(game.street)}. Too early to call a winner.\nYour hand: ${formatCardsDisplay(game.hero_cards)} · Board: ${formatBoardDisplay(game.board)}`
        : 'Game not loaded yet.'
    }
    if (lower.includes('card') || lower.includes('board')) {
      return `Board: ${formatBoardDisplay(game?.board ?? [])}\nYour hand: ${formatCardsDisplay(game?.hero_cards ?? [])}\nAsk "outs?" or "pot odds?" for more detail.`
    }
    if (lower.includes('why') || lower.includes('reason') || lower.includes('explain')) {
      if (game?.needs_prediction) {
        return `Board: ${formatBoardDisplay(game.board)}\nEach bot's two cards + these five board cards = their best five-card hand. Who has the highest pair, straight, or flush?`
      }
      if (game?.complete && game.result) {
        return `${formatResult(game.result)}\nBoard: ${formatBoardDisplay(game.board)}. Compare each player's best five-card combo.`
      }
      return `Three things: hand strength, pot odds, and what beats you. Which one is unclear?`
    }
    if (lower.includes('do') || lower.includes('action') || lower.includes('should') || lower.includes('help')) {
      if (!game) {
        return 'Game not loaded yet.'
      }
      if (game.complete) {
        return `Hand is over. ${formatResult(game.result)}. Want to play again or review this hand?`
      }
      if (!game.available_actions.length) {
        return 'Waiting for other players to act...'
      }
      if (game.needs_prediction) {
        return `You folded. Board: ${formatBoardDisplay(game.board)}.\nNow predict: which bot has the strongest hand? Use "highest pair, straight, or flush" as your guide.`
      }
      if (game.available_actions.includes('fold')) {
        const hand = formatCardsDisplay(game.hero_cards)
        const board = formatBoardDisplay(game.board)
        const street = streetLabel(game.street)
        return `${street}. You hold ${hand}. Board: ${board}.\n\nHere are the three things to think about:\n1️⃣ Hand strength: is your hand premium, playable, or weak right now?\n2️⃣ Pot odds: what's the break-even equity if you call?\n3️⃣ Blockers: what hands beat you?`
      }
      return 'No action available right now.'
    }
    const generic = [
      'Want me to break down hand strength, pot odds, or what beats you?',
      'Ask about hand strength, pot odds, or outs — or just tell me "fold" or "call" if you want to move on.',
      'You can ask "pot odds?" "outs?" "hand strength?" or just take an action below.',
    ]
    return randPick(generic)
  }

  async function sendChat() {
    const text = chatText.trim()
    if (!text) return
    addMsg({ role: 'user', text })
    setChatText('')

    // A bare action word ("fold", "call", "check") still drives the table directly.
    const lower = text.toLowerCase()
    if (game && !game.complete && !game.needs_prediction) {
      const bareAction = ['fold', 'call', 'check', 'raise'].find((a) => lower.trim() === a)
      if (bareAction && game.available_actions.includes(bareAction)) {
        void takeAction(bareAction)
        return
      }
    }

    let reply: string | null = null
    let correct: boolean | null = null
    let topic: string | null = null
    if (game) {
      try {
        const coach = await practiceChat(game.id, text)
        if (coach.reply && !coach.error) {
          reply = coach.reply
          correct = coach.correct ?? null
          topic = coach.topic ?? null
        }
      } catch {
        reply = null
      }
    }

    if (reply === null) {
      reply = localCoachReply(text)
    }

    addMsg({ role: 'ai', text: reply })

    // When the backend graded a best-hand quiz answer, log it for memory backing.
    if (topic === 'best_hand' && correct !== null) {
      void logAction({
        user_id: userId,
        action_type: correct ? 'quiz_correct' : 'quiz_wrong',
        context_street: game?.street ?? '',
        context_hand: (game?.hero_cards ?? []).join(' '),
        detail: text,
        session_id: game?.id ?? '',
        understood: correct,
      }).catch(() => undefined)
    }

    const firstSentence = reply.match(/^[^.!?]+[.!?]/)?.[0] ?? reply.slice(0, 100)
    speakCoach(firstSentence)
  }

  function handleOptionClick(value: string, msg: ChatMsg) {
    if (msg.answered) return
    setChatMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, answered: true } : m)),
    )
    if (msg.isPotOddsQuiz && msg.potData) {
      const correct = value === 'correct'
      addMsg({ role: 'user', text: correct ? 'I said the correct equity %.' : 'I picked the wrong percentage.' })
      const showFormula = !potOddsFormulaShownRef.current
      const chat = chatRevealPotOdds(correct, msg.potData, showFormula)
      speakCoach(voiceRevealPotOdds(correct, msg.potData, showFormula))
      if (showFormula) potOddsFormulaShownRef.current = true
      addMsg({ role: 'ai', text: chat })
      return
    }
    addMsg({ role: 'user', text: value })
    if (value === 'premium' || value === 'playable' || value === 'weak') {
      const cards = game?.hero_cards ?? []
      const voice = voiceRevealHandStrength(cards, value)
      const chat = chatRevealHandStrength(cards, value)
      speakCoach(voice)
      addMsg({ role: 'ai', text: chat })
      return
    }
    setTimeout(() => {
      let reply: string
      if (value === 'hero' || value === 'bot1' || value === 'other') {
        const userPick = value === 'hero' ? 0 : value === 'bot1' ? 1 : -1
        const right = userPick === game?.winner
        reply = right
          ? 'Good read. Explain in chat why that hand beat the rest.'
          : `Winner was ${game?.winner === 0 ? 'you' : botLabel(game?.winner ?? 1)}. Compare each five-card combo to the board.`
      } else {
        reply = 'Got it. Take your action with the buttons below the table.'
      }
      addMsg({ role: 'ai', text: reply })
    }, 200)
  }

  async function reviewHand(event: FormEvent) {
    event.preventDefault()
    setError('')
    setChatMessages([])
    try {
      const response = await analyzeHand(rawHand, userId, players)
      if (response.status !== 'parsed') {
        setError(response.message)
        return
      }
      setAnalysis(response)
      setReviewStep('question')
      onHandSaved?.()
      const h = response.hand
      addMsg({
        role: 'ai',
        text: `Hand reconstructed. You had ${h.hero_cards.join(' ')} on a ${h.board.join(' ') || 'preflop-only'} board, with ${h.leak_tags.length} leak(s) flagged.\n\nBefore I reveal anything — tell me what you were thinking at the biggest decision point.`,
        options: [
          { label: 'I was on a draw and thought the price was right', value: 'draw' },
          { label: 'I thought I had the best hand at the time', value: 'besthand' },
          { label: 'I was bluffing / representing a stronger hand', value: 'bluff' },
          { label: 'Honestly I was guessing — show me the walkthrough', value: 'guess' },
        ],
      })
      if (response.recurring_leak) {
        const leak = response.recurring_leak
        const similarityNote =
          leak.similar_hands.length > 0
            ? ` This also matches ${leak.similar_hands.length} earlier hand(s) by vector similarity.`
            : ''
        addMsg({
          role: 'ai',
          text: `Memory check — ${leak.message}${similarityNote}`,
        })
      }
    } catch {
      setError('Tell could not analyze this hand. Check that the API is running.')
    }
  }

  const ChatPanel = (
    <div className="chat-panel" style={{ height: 420 }}>
      <div className="chat-header">
        <div className="ai-avatar">T</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#d4af37' }}>TELL COACH</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Socratic · Memory-backed</div>
        </div>
        {game?.coach_prompt && (
          <button
            type="button"
            style={{
              background: 'rgba(212,175,55,0.15)',
              border: '1px solid rgba(212,175,55,0.3)',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 10,
              color: '#d4af37',
              cursor: 'pointer',
              fontWeight: 700,
            }}
            disabled={narrating}
            onClick={() => speakCoach(game.coach_prompt)}
          >
            {narrating ? '…' : '🔊'}
          </button>
        )}
      </div>
      <div className="chat-messages">
        {chatMessages.length === 0 && (
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 20 }}>
            Your conversation with Tell appears here. Ask "why?" at any time, or click the options I send.
          </div>
        )}
        {chatMessages.filter((m) => m.role !== 'system').map((msg) => (
          <div key={msg.id} className="fade-in">
            {msg.role === 'ai' ? (
              <div className="msg-ai">
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                {msg.options && !msg.answered && (
                  <div className="msg-options">
                    {msg.options.map((opt, i) => (
                      <button key={i} className="option-btn" onClick={() => handleOptionClick(opt.value, msg)}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {msg.options && msg.answered && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(16,185,129,0.6)' }}>
                    ✓ You replied to this prompt.
                  </div>
                )}
              </div>
            ) : (
              <div className="msg-user">{msg.text}</div>
            )}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <form
        className="chat-input-wrap"
        onSubmit={(e) => {
          e.preventDefault()
          sendChat()
        }}
      >
        <input
          className="chat-input"
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          placeholder='Ask "what are my outs?", "pot odds?", "why?"…'
        />
        <button type="submit" className="gold-btn" style={{ borderRadius: 10, padding: '0 16px', fontSize: 12 }}>
          Send
        </button>
      </form>
    </div>
  )

  if (experience === 'choose') {
    return (
      <section className="mx-auto max-w-4xl py-10" aria-label="Choose a Tell experience">
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <span className="gold-text" style={{ fontSize: 11, fontWeight: 800, letterSpacing: 4 }}>
            COLLABORATIVE POKER COACH
          </span>
          <h2 style={{ fontSize: 36, fontWeight: 700, marginTop: 6, marginBottom: 10 }}>
            <span className="gold-text">Learn poker</span> like you have a patient friend.
          </h2>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', maxWidth: 600, margin: '0 auto' }}>
            Tell remembers the specific mistakes you keep making. It quizzes you on every decision before revealing the math — so you internalize, not just memorize.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="mode-select-card" onClick={() => setExperience('review')}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#d4af37' }}>01 · HAND AUTOPSY</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 10 }}>Analyze a hand you played</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 8, lineHeight: 1.6 }}>
              Paste a history or just type out what happened. Tell reconstructs it, quizzes your reasoning at each street, then tags the specific leak so you never repeat it.
            </div>
            <div style={{ marginTop: 18, fontSize: 13, fontWeight: 700, color: '#d4af37' }}>
              Review a past hand →
            </div>
          </div>
          <div className="mode-select-card" onClick={() => setExperience('practice')}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#d4af37' }}>02 · LIVE BOT TABLE</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 10 }}>Play vs. explainable bots</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 8, lineHeight: 1.6 }}>
              Each bot has a named strategy. At every street Tell pauses to test your math (pot odds as multiple choice), then reveals what each bot was thinking and why.
            </div>
            <div style={{ marginTop: 18, fontSize: 13, fontWeight: 700, color: '#d4af37' }}>
              Take a seat at the table →
            </div>
          </div>
        </div>
        <div style={{ marginTop: 32 }}>
          <div className="info-card">
            <div className="info-card-title">Firestone Memory Backing</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
              Every question you get wrong, every leak you repeat, every explanation style that landed for you — stored in Firestore and vector-clustered so next session picks up exactly where this one left off. Patterns across hands are surfaced explicitly, not just silently remembered.
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (!tableReady) {
    return (
      <section className="mx-auto max-w-2xl rounded-2xl" style={{ background: 'linear-gradient(180deg, #111827, #0f172a)', border: '1px solid rgba(212,175,55,0.2)', padding: 28 }}>
        <button style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer' }} type="button" onClick={() => setExperience('choose')}>
          ← All experiences
        </button>
        <span className="gold-text" style={{ display: 'block', marginTop: 18, fontSize: 11, fontWeight: 800, letterSpacing: 3 }}>
          {experience === 'practice' ? 'BOT TABLE SETUP' : 'HAND REPLAY SETUP'}
        </span>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
          {experience === 'practice' ? 'Who is sitting in tonight?' : 'Set the table size for your review'}
        </h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
          {experience === 'practice'
            ? 'Each bot plays a named, explainable strategy (TAG / LAG / Loose-passive).'
            : 'Match the number of players to the actual hand you want to review.'}
        </p>
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {Array.from({ length: 8 }, (_, i) => i + 2).map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setPlayers(count)}
              style={{
                padding: '14px 8px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 700,
                border: players === count ? '1px solid #d4af37' : '1px solid rgba(255,255,255,0.1)',
                background: players === count ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.02)',
                color: players === count ? '#d4af37' : 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
              }}
              aria-pressed={players === count}
            >
              <div style={{ fontSize: 18 }}>{count}</div>
              <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.7, marginTop: 2 }}>
                {count === 2 ? 'Heads-up' : `${count - 1} bots`}
              </div>
            </button>
          ))}
        </div>
        <button type="button" className="gold-btn" style={{ marginTop: 24, width: '100%', padding: '12px', borderRadius: 10, fontSize: 14 }} onClick={openTable}>
          {experience === 'practice' ? 'Take your seat →' : 'Open the replay →'}
        </button>
      </section>
    )
  }

  if (experience === 'review' && !analysis) {
    return (
      <section className="mx-auto max-w-4xl">
        <button style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 14 }} type="button" onClick={() => setTableReady(false)}>
          ← Change table size
        </button>
        <div className="chat-panel" style={{ padding: 24 }}>
          <div className="gold-text" style={{ fontSize: 11, fontWeight: 800, letterSpacing: 3 }}>HAND AUTOPSY</div>
          <h2 style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>Bring Tell a decision you want to understand.</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
            Paste a structured hand history below. Tell will reconstruct it, ask your reasoning at each decision point <em>before</em> revealing the math, then tag any leaks against your persistent mastery map.
          </p>
          <form style={{ marginTop: 18 }} onSubmit={reviewHand}>
            <textarea
              className="textarea-hand"
              value={rawHand}
              onChange={(e) => setRawHand(e.target.value)}
              placeholder={`Paste a hand history export here, or type a recap like:\n\n"I was on the button with 9♠ 8♠. Blinds $1/$2. I opened to $6, SB called, BB called. Flop came K♠ 7♠ 4♦. Checked to me, I c-bet $12, SB raised to $30, I called. Turn was 2♥. SB bet $55 into $81, I folded."`}
              required
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                type="button"
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(212,175,55,0.25)',
                  color: '#d4af37',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => setRawHand(SAMPLE_HAND)}
              >
                Use demo hand (AK vs QJ)
              </button>
              <button type="submit" className="gold-btn" style={{ padding: '10px 22px', borderRadius: 10, fontSize: 13 }}>
                Analyze this hand →
              </button>
            </div>
          </form>
          {error && <div className="reasoning-block bad" style={{ marginTop: 14 }}>{error}</div>}
        </div>
      </section>
    )
  }

  if (experience === 'review' && analysis) {
    const d = analysis.hand.decision_points[0] as DecisionPoint | undefined
    const ActionPanel = (
      <div className="action-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div className="info-card-title">Socratic Review</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
              {reviewStep === 'question' ? 'Answer me first, then I reveal the math.' : 'Here is the breakdown from the deterministic engine.'}
            </div>
          </div>
        </div>
        {reviewStep === 'question' ? (
          <div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 12 }}>
              💡 <strong>Before I tell you:</strong> compare the pot before your call with the amount you had to put in. If you had to call $10 to win $X, what % of the time do you need to win to break even?
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <button className="option-btn" onClick={() => setReviewStep('answer')}>
                I need about 33% or more (roughly 2:1)
              </button>
              <button className="option-btn" onClick={() => setReviewStep('answer')}>
                I need about 50% or more (even money)
              </button>
              <button className="option-btn" onClick={() => setReviewStep('answer')}>
                I need about 25% or less (3:1 or better)
              </button>
              <button className="option-btn" onClick={() => setReviewStep('answer')}>
                Skip — give me the full walkthrough
              </button>
            </div>
          </div>
        ) : (
          <div>
            {d ? (
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <span className="good-badge">Required equity: {(d.required_equity! * 100).toFixed(1)}%</span>
                  <span className="good-badge">Your equity: {(d.computed_equity! * 100).toFixed(1)}%</span>
                  {d.leak_tag ? (
                    <span className="leak-badge">⚠ {d.leak_tag.replace(/_/g, ' ')}</span>
                  ) : (
                    <span className="good-badge">✓ decision within range</span>
                  )}
                </div>
                <div className={`reasoning-block ${d.leak_tag ? 'bad' : ''}`}>
                  {d.leak_tag
                    ? `The gap: you needed ${(d.required_equity! * 100).toFixed(1)}% equity to call, and only had ${(d.computed_equity! * 100).toFixed(1)}%. That's a ${d.leak_tag.replace(/_/g, ' ')} leak. Over time this bleeds chips — the price wasn't right for your actual hand strength.`
                    : `Your equity ${(d.computed_equity! * 100).toFixed(1)}% exceeded the required ${(d.required_equity! * 100).toFixed(1)}%, so this call was profitable long-term.`}
                </div>
                <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
                  🧠 Formula lock-in: <strong>required equity = call ÷ (pot before call + call)</strong> =
                  ${d.call_amount.toFixed(2)} ÷ (${d.pot_before.toFixed(2)} + ${d.call_amount.toFixed(2)})
                </div>
                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                  <button type="button" className="gold-btn" style={{ padding: '10px 20px', borderRadius: 10, fontSize: 13 }} onClick={() => { setAnalysis(null); setChatMessages([]) }}>
                    Analyze another hand →
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>No call decision was found in this hand to walk through.</div>
            )}
          </div>
        )}
      </div>
    )
    return (
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <button style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer' }} type="button" onClick={() => { setAnalysis(null); setChatMessages([]) }}>
            ← Analyze another hand
          </button>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#d4af37' }}>
            HAND AUTOPSY · {players} PLAYERS
          </span>
        </div>
        <PokerTable
          heroCards={analysis.hand.hero_cards}
          board={analysis.hand.board}
          villainCards={analysis.showdown.villain1}
          decisionPoints={analysis.hand.decision_points}
          numOpponents={players - 1}
          pot={d?.pot_before ?? 0}
          street={d?.street ?? 'showdown'}
          winner={0}
          chatPanel={ChatPanel}
          actionPanel={ActionPanel}
        />
      </section>
    )
  }

  const availableActions = game?.available_actions ?? []
  const canFold = availableActions.includes('fold')
  const canCheck = availableActions.includes('check')
  const canCall = availableActions.includes('call')
  const canRaise = availableActions.includes('raise')
  const callSize = 1.0
  const minRaise = 4.0
  const maxRaise = Math.min(game?.hero_stack ?? 100, 50)

  const ActionPanel = (
    <div className="action-panel">
      {!game?.complete && !game?.needs_prediction ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div className="info-card-title">Your Action · {game?.street?.toUpperCase() ?? 'PREFLOP'}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>
                Stack ${game?.hero_stack.toFixed(2)} · Pot ${game?.pot.toFixed(2)} · Blinds $1/$2
              </div>
            </div>
          </div>
          <div className="action-buttons">
            <button type="button" className="action-btn action-btn-fold" disabled={!canFold} onClick={() => takeAction('fold')}>
              FOLD
            </button>
            <button type="button" className="action-btn action-btn-check" disabled={!canCheck} onClick={() => takeAction('check')}>
              CHECK
            </button>
            <button type="button" className="action-btn action-btn-call" disabled={!canCall} onClick={() => takeAction('call')}>
              CALL ${callSize.toFixed(2)}
            </button>
            <button type="button" className="action-btn action-btn-raise" disabled={!canRaise} onClick={() => takeAction('raise')}>
              RAISE TO ${raiseAmount.toFixed(2)}
            </button>
          </div>
          {canRaise && (
            <div className="raise-slider-wrap">
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: 'rgba(255,255,255,0.6)' }}>Raise size</span>
                <span style={{ fontWeight: 700, color: '#10b981' }}>${raiseAmount.toFixed(2)}</span>
              </div>
              <input
                type="range"
                className="gold-slider"
                min={minRaise}
                max={maxRaise}
                step={1}
                value={raiseAmount}
                onChange={(e) => setRaiseAmount(parseInt(e.target.value))}
              />
              <div className="bet-info">
                <span>Min ${minRaise.toFixed(2)}</span>
                <span>Pot-sized ~${((game?.pot ?? 0) * 2 + callSize).toFixed(2)}</span>
                <span>All-in ${maxRaise.toFixed(2)}</span>
              </div>
            </div>
          )}
        </>
      ) : game?.needs_prediction ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div className="info-card-title">You Folded. Who Wins?</div>
              <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', marginTop: 4, lineHeight: 1.5 }}>
                All bot cards are face up. Pick the winner, then tell me why in chat.
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(players - 1, 4)}, 1fr)`, gap: 10, marginBottom: 14 }}>
            {Array.from({ length: players - 1 }, (_, i) => i + 1).map((bot) => (
              <button
                key={bot}
                type="button"
                onClick={() => submitPrediction(bot)}
                className="option-btn"
                style={{ textAlign: 'center', padding: '18px 10px' }}
              >
                <div style={{ fontWeight: 800, fontSize: 16, color: '#d4af37' }}>{BOT_NAMES[bot - 1] ?? `Bot ${bot}`}</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Seat {bot}</div>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="gold-btn" style={{ padding: '12px 22px', borderRadius: 10, fontSize: 15 }} onClick={() => void skipPrediction()}>
              Skip. Show result →
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div className="info-card-title">Showdown Complete</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{formatResult(game?.result)}</div>
            </div>
          </div>
          <div className="bot-reasoning">
            {['Bot Alex', 'Bot Sam', 'Bot Jordan'].slice(0, Math.max(0, players - 1)).map((name, idx) => {
              const reasons = [
                `I called because my pot odds were ~28% and my draw equity was solidly above that. Math-first decision.`,
                `I checked back the flop because my range is weak here and I don't want to get raised off my equity.`,
                `I sized down on the river because I'm bluff-catcher heavy and only want value from worse hands.`,
              ]
              return (
                <div key={idx} className="bot-reasoning-item">
                  <div className="bot-name">{name.toUpperCase()}'S REASONING</div>
                  <div style={{ marginTop: 4, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>{reasons[idx % reasons.length]}</div>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="gold-btn" style={{ padding: '10px 22px', borderRadius: 10, fontSize: 13 }} onClick={playAgain}>
              Deal another hand →
            </button>
          </div>
        </div>
      )}
      {error && <div className="reasoning-block bad" style={{ marginTop: 12 }}>{error}</div>}
    </div>
  )

  const InfoPanel = (
    <div className="info-card" style={{ flex: 1 }}>
      <div className="info-card-title">Spot Cheat Sheet</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
          <span>Your hand:</span>
          <strong style={{ color: '#e5e7eb' }}>{game?.hero_cards.length ? formatCardsDisplay(game.hero_cards) : '—'}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
          <span>Board:</span>
          <strong style={{ color: '#e5e7eb' }}>{game?.board.length ? formatBoardDisplay(game.board) : 'preflop'}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
          <span>To call:</span>
          <strong style={{ color: '#e5e7eb' }}>${canCall ? callSize.toFixed(2) : '—'}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
          <span>Pot odds req:</span>
          <strong style={{ color: canCall ? '#fb923c' : 'rgba(255,255,255,0.4)' }}>
            {canCall ? ((callSize / ((game?.pot ?? 0) + callSize)) * 100).toFixed(1) + '%' : '—'}
          </strong>
        </div>
      </div>
    </div>
  )

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', cursor: 'pointer' }} type="button" onClick={() => { setTableReady(false); setChatMessages([]) }}>
          ← Change table size
        </button>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: '#d4af37' }}>
          LIVE BOT PRACTICE · {players} PLAYERS
        </span>
      </div>
      <PokerTable
        heroCards={game?.hero_cards ?? []}
        board={game?.board ?? []}
        showdownHands={game?.showdown_hands}
        numOpponents={players - 1}
        heroStack={game?.hero_stack ?? 100}
        botStacks={Array(players - 1).fill(99)}
        pot={game?.pot ?? 0}
        street={game?.street ?? 'preflop'}
        activeSeat={!game?.complete && !game?.needs_prediction && game?.available_actions.length ? 0 : -1}
        foldedSeats={game?.hero_folded ? [0] : []}
        winner={game?.winner ?? null}
        dealerSeat={1}
        chatPanel={ChatPanel}
        actionPanel={ActionPanel}
        infoPanel={InfoPanel}
      />
    </section>
  )
}
