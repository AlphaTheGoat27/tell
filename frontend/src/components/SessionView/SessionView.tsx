import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { PokerTable } from './PokerTable'
import { HandBuilder, type BuilderData } from './HandBuilder'
import {
  advanceBots,
  analyzeHand,
  getMastery,
  listHands,
  logAction,
  playPracticeAction,
  practiceChat,
  reviewSavedHand,
  startPractice,
  type AnalyzeResponse,
  type Hand,
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
  classifyStartingHand,
  coachFocusFor,
  formatResult,
  handStrengthQuizText,
  streetLabel,
  botLabel,
  type CoachFocus,
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
import { useSpeechToText } from '../../useSpeechToText'

type SessionViewProps = {
  mode: 'play' | 'analyze'
  userId: string
  isSignedIn?: boolean
  onHandSaved?: () => void
  initialHandId?: string | null
  onConsumeInitialHand?: () => void
}

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

type AnalyzeStep = 'source' | 'focus' | 'review'

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

const BOT_NAMES = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Drew', 'Taylor', 'Bob']
const ALL_STREETS = ['preflop', 'flop', 'turn', 'river'] as const
const BOARD_LEN: Record<string, number> = { preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 }

const RANK_ORDER = '23456789TJQKA'
const SUIT_NAMES: Record<string, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' }

function rankValue(card: string): number {
  return RANK_ORDER.indexOf(card[0].toUpperCase()) + 2
}

function estimateOuts(hero: string[], board: string[]): { outs: number; notes: string[] } {
  if (board.length < 3) return { outs: 0, notes: [] }
  const all = [...hero, ...board]
  const notes: string[] = []
  let outs = 0

  const suitCounts: Record<string, number> = {}
  for (const c of all) {
    const s = c.slice(-1).toLowerCase()
    suitCounts[s] = (suitCounts[s] ?? 0) + 1
  }
  for (const [suit, count] of Object.entries(suitCounts)) {
    if (count === 4) {
      outs += 9
      notes.push(`9 outs to a ${SUIT_NAMES[suit] ?? suit} flush`)
    }
  }

  const ranks = new Set(all.map((c) => rankValue(c)))
  if (ranks.has(14)) ranks.add(1)
  const missingRanks = new Set<number>()
  for (let start = 1; start <= 10; start++) {
    const windowRanks = [start, start + 1, start + 2, start + 3, start + 4]
    const missing = windowRanks.filter((r) => !ranks.has(r))
    if (missing.length === 1) missingRanks.add(missing[0])
  }
  if (missingRanks.size > 0) {
    outs += missingRanks.size * 4
    notes.push(`${missingRanks.size * 4} outs to a straight`)
  }

  return { outs, notes }
}

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

function streetsInHand(h: Hand): string[] {
  const found = new Set<string>(['preflop'])
  h.actions.forEach((a) => ALL_STREETS.includes(a.street as never) && found.add(a.street))
  if (h.board.length >= 3) found.add('flop')
  if (h.board.length >= 4) found.add('turn')
  if (h.board.length >= 5) found.add('river')
  return ALL_STREETS.filter((s) => found.has(s))
}

function playersInHand(h: Hand): string[] {
  if (h.player_names?.length) return h.player_names
  const names = ['Hero']
  for (const key of Object.keys(h.showdown ?? {})) {
    if (key !== 'hero') names.push(key)
  }
  while (names.length < h.num_opponents + 1) names.push(`Villain ${names.length}`)
  return names
}

function showdownBySeat(hand: Hand, playerList: string[]): string[][] {
  const sd = hand.showdown ?? {}
  return playerList.map((name) => {
    const key = Object.keys(sd).find((k) => k.toLowerCase() === name.toLowerCase())
    return key ? sd[key] : []
  })
}

function MiniCards({ cards }: { cards: string[] }) {
  const symbols: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {cards.map((card) => {
        const suit = (card.at(-1) ?? '').toLowerCase()
        const rank = card.slice(0, -1).toUpperCase()
        const isRed = suit === 'h' || suit === 'd'
        return (
          <div key={card} className={`card card--sm ${isRed ? 'red' : 'black'}`} style={{ animation: 'none' }}>
            <div className="corner-tl">
              <span className="rank">{rank === 'T' ? '10' : rank}</span>
              <span className="suit">{symbols[suit]}</span>
            </div>
            <span className="pip">{symbols[suit]}</span>
            <div className="corner-br">
              <span className="rank">{rank === 'T' ? '10' : rank}</span>
              <span className="suit">{symbols[suit]}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function SessionView({ mode, userId, isSignedIn = false, onHandSaved, initialHandId, onConsumeInitialHand }: SessionViewProps) {
  // ---- shared ----
  const [players, setPlayers] = useState(6)
  const [error, setError] = useState('')
  const [narrating, setNarrating] = useState(false)
  const [chatText, setChatText] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const msgIdRef = useRef(0)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ---- play mode ----
  const [tableReady, setTableReady] = useState(mode === 'play' ? false : true)
  const [game, setGame] = useState<PracticeGame | null>(null)
  const [raiseAmount, setRaiseAmount] = useState(6)
  const [acting, setActing] = useState(false)
  const spokenKeyRef = useRef('')
  const potOddsFormulaShownRef = useRef(false)

  // ---- analyze mode ----
  const [analyzeStep, setAnalyzeStep] = useState<AnalyzeStep>('source')
  const [savedHands, setSavedHands] = useState<Hand[] | null>(null)
  const [savedHandsError, setSavedHandsError] = useState(false)
  const [loadingHandId, setLoadingHandId] = useState('')
  const [rawHand, setRawHand] = useState('')
  const [parsing, setParsing] = useState(false)
  const [analysis, setAnalysis] = useState<Extract<AnalyzeResponse, { status: 'parsed' }> | null>(null)
  const [reviewStep, setReviewStep] = useState<'question' | 'answer'>('question')
  const [focusStreet, setFocusStreet] = useState<string>('preflop')
  const [focusPlayers, setFocusPlayers] = useState<string[]>([])

  // How the user wants to bring a fresh hand: type/paste, dictate, or build.
  const [importMethod, setImportMethod] = useState<'type' | 'speak' | 'build'>('type')
  // Builder state lives here (not in the component) so leaving to focus/review
  // and coming back keeps every picked card editable.
  const [builderData, setBuilderData] = useState<BuilderData>({
    hero: [],
    villain: [],
    board: [],
    numOpponents: 1,
    streetBets: { flop: 10, turn: 15, river: 20 },
  })

  // Weakness-driven coaching: the user's mastery map (built from every
  // stored hand) decides what this session should drill.
  const [coachFocus, setCoachFocus] = useState<CoachFocus>(null)
  const focusAnnouncedRef = useRef(false)

  useEffect(() => {
    // The backend returns empty scores for unauthenticated callers, so demo
    // mode naturally gets no focus.
    let cancelled = false
    getMastery(userId)
      .then((m) => {
        if (!cancelled) setCoachFocus(coachFocusFor(m))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [userId])

  const speech = useSpeechToText((text) => {
    setChatText(text)
    void submitChat(text)
  })

  // Dictation for the Analyze import: the transcript lands in the hand box so
  // it can be edited before analyzing.
  const dictation = useSpeechToText((text) => {
    setRawHand((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
    setImportMethod('type')
  })

  const addMsg = (msg: Omit<ChatMsg, 'id'>) => {
    msgIdRef.current += 1
    setChatMessages((prev) => [...prev, { ...msg, id: msgIdRef.current }])
  }

  // Shares the weakness focus once per session. In play mode the voice is
  // bundled into the opening question's speech (a second speakCoach call would
  // cancel it); in analyze mode it speaks standalone. Returns the voice suffix.
  function announceFocus(opts: { speak: 'bundled' | 'standalone'; delayMs?: number }): string {
    if (!coachFocus || focusAnnouncedRef.current) return ''
    focusAnnouncedRef.current = true
    const focus = coachFocus
    setTimeout(() => {
      addMsg({ role: 'ai', text: `🎯 Session focus — ${focus.title}\n${focus.chat}` })
      if (opts.speak === 'standalone') speakCoach(focus.voice)
    }, opts.delayMs ?? 1500)
    return opts.speak === 'bundled' ? ` ${focus.voice}` : ''
  }

  // Race fallback: if the mastery fetch lands AFTER the session opened,
  // announce the focus as soon as it exists.
  useEffect(() => {
    if (!coachFocus || focusAnnouncedRef.current) return
    const inPlaySession = mode === 'play' && tableReady && !!game && !game.complete
    const inReview = mode === 'analyze' && analyzeStep === 'review'
    if (!inPlaySession && !inReview) return
    focusAnnouncedRef.current = true
    const focus = coachFocus
    setTimeout(() => {
      addMsg({ role: 'ai', text: `🎯 Session focus — ${focus.title}\n${focus.chat}` })
      speakCoach(focus.voice)
    }, 600)
  }, [coachFocus, mode, tableReady, game, analyzeStep])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  useEffect(() => {
    warmCoachSpeech()
    return onCoachSpeaking(setNarrating)
  }, [])

  // Ctrl+S / Cmd+S talks to the coach: toggles the microphone so the user can
  // ask out loud instead of typing. A stable listener reads the latest toggle
  // through a ref so it never goes stale across re-renders.
  const speechToggleRef = useRef(speech.toggle)
  const speechSupportedRef = useRef(speech.supported)
  useEffect(() => {
    speechToggleRef.current = speech.toggle
    speechSupportedRef.current = speech.supported
  }, [speech.toggle, speech.supported])
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (speechSupportedRef.current) speechToggleRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (mode !== 'analyze') return
    // The backend returns an empty list for unauthenticated callers, so demo
    // mode naturally sees no saved hands.
    let cancelled = false
    listHands(userId)
      .then((res) => {
        if (!cancelled) setSavedHands(res.hands)
      })
      .catch(() => {
        if (!cancelled) setSavedHandsError(true)
      })
    return () => {
      cancelled = true
    }
  }, [mode, userId])

  // Deep link from History: open a specific saved hand straight into focus.
  useEffect(() => {
    if (mode !== 'analyze' || !initialHandId || savedHands === null) return
    const target = savedHands.find((h) => h.id === initialHandId)
    onConsumeInitialHand?.()
    if (target) {
      void openSavedHand(target.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialHandId, savedHands])

  function resetChat() {
    setChatMessages([])
    spokenKeyRef.current = ''
    potOddsFormulaShownRef.current = false
  }

  // =====================================================================
  // PLAY MODE
  // =====================================================================

  async function openTable() {
    setTableReady(true)
    resetChat()
    setError('')
    try {
      const g = await startPractice(players, userId)
      spokenKeyRef.current = coachSpeechKey(g)
      setGame(g)
      const focusVoice = announceFocus({ speak: 'bundled' })
      speakCoach(voiceQuestionNewHand(g) + focusVoice)
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
    if (!game || acting) return
    const actedOn = game.street
    setActing(true)
    addMsg({ role: 'user', text: `${action.toUpperCase()}${action === 'raise' ? ` to $${raiseAmount}` : ''}.` })

    try {
      const g = await playPracticeAction(game.id, action === 'raise' ? 'raise' : action)
      if (g.error) {
        setError(g.error)
        return
      }
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
      onHandSaved?.()
    } catch {
      setError('The practice hand could not advance.')
    } finally {
      setActing(false)
    }
  }

  async function submitPrediction(botSeat: number) {
    if (!game) return
    const name = botLabel(botSeat)
    addMsg({ role: 'user', text: `I think ${name} wins.` })
    try {
      const g = await advanceBots(game.id, botSeat)
      if (g.error) {
        setError(g.error)
        return
      }
      setGame(g)
      spokenKeyRef.current = coachSpeechKey(g)
      const correct = g.winner === botSeat
      const voice = voiceRevealPrediction(g, botSeat, correct)
      const chat = chatRevealPrediction(g, botSeat, correct)
      speakCoach(voice)
      addMsg({ role: 'ai', text: chat })
      void logAction({
        user_id: userId,
        action_type: correct ? 'quiz_correct' : 'quiz_wrong',
        context_street: g.street,
        detail: `predicted ${name}`,
        option_label: 'hand_reading',
        session_id: g.id,
        understood: correct,
      }).catch(() => undefined)
      onHandSaved?.()
    } catch {
      setError('Could not resolve your prediction.')
    }
  }

  async function skipPrediction() {
    if (!game) return
    try {
      const g = await advanceBots(game.id)
      if (g.error) {
        setError(g.error)
        return
      }
      setGame(g)
      spokenKeyRef.current = coachSpeechKey(g)
      speakCoach(voiceNarrateAction(g, 'showdown'))
      addMsg({ role: 'ai', text: `${formatResult(g.result)} Board: ${formatBoardDisplay(g.board)}.` })
      onHandSaved?.()
    } catch {
      setError('Could not finish the hand.')
    }
  }

  function playAgain() {
    setError('')
    resetChat()
    startPractice(players, userId)
      .then((g) => {
        setGame(g)
        spokenKeyRef.current = coachSpeechKey(g)
        const focusVoice = announceFocus({ speak: 'bundled' })
        speakCoach(voiceQuestionNewHand(g) + focusVoice)
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
      })
      .catch(() => setError('The next hand could not be dealt.'))
  }

  // =====================================================================
  // COACH CHAT (shared)
  // =====================================================================

  const reviewFocusDp = useMemo(() => {
    if (mode !== 'analyze' || !analysis || analyzeStep !== 'review') return undefined
    return analysis.hand.decision_points.find((dp) => dp.street === focusStreet)
  }, [mode, analysis, analyzeStep, focusStreet])

  function localCoachReply(text: string): string {
    const lower = text.toLowerCase()

    // When reviewing a saved hand, answer against that hand's facts.
    if (mode === 'analyze' && analysis && analyzeStep === 'review') {
      const h = analysis.hand
      const boardNow = h.board.slice(0, BOARD_LEN[focusStreet] ?? 5)
      const dp = reviewFocusDp
      const others = focusPlayers.filter((p) => p.toLowerCase() !== 'hero')
      if (lower.includes('pot') && lower.includes('odd')) {
        if (dp) {
          const need = (dp.required_equity ?? 0) * 100
          return `At the ${streetLabel(focusStreet).toLowerCase()} decision you had to call $${dp.call_amount.toFixed(2)} into a $${dp.pot_before.toFixed(2)} pot.\nRequired equity = $${dp.call_amount.toFixed(2)} ÷ ($${dp.pot_before.toFixed(2)} + $${dp.call_amount.toFixed(2)}) = ${need.toFixed(1)}%.`
        }
        return `You had no call decision on the ${streetLabel(focusStreet).toLowerCase()} in this hand — the pot-odds test applies when someone bets and you must pay to continue.`
      }
      if (lower.includes('board') || lower.includes('card')) {
        return `On the ${streetLabel(focusStreet).toLowerCase()} the board was ${formatBoardDisplay(boardNow)}.\nYou held ${formatCardsDisplay(h.hero_cards)}.`
      }
      if (lower.includes('who') || lower.includes('win') || lower.includes('best hand')) {
        if (analysis.showdown && Object.keys(analysis.showdown).length) {
          const lines = Object.entries(analysis.showdown)
            .filter(([k]) => k !== 'hero')
            .map(([k, cards]) => `${k}: ${formatCardsDisplay(cards)}`)
          return `At showdown — ${lines.join(' · ')}.\nYou had ${formatCardsDisplay(h.hero_cards)}. Compare each best five-card combo against ${formatBoardDisplay(h.board)}.`
        }
        return `No showdown cards are known for this hand — it ended before everyone showed down.`
      }
      if (dp?.leak_tag) {
        return `The engine flagged ${dp.leak_tag.replace(/_/g, ' ')} on the ${streetLabel(focusStreet).toLowerCase()}: you needed ${(dp.required_equity! * 100).toFixed(1)}% equity but had ${(dp.computed_equity! * 100).toFixed(1)}%.\nAgainst ${others.join(' and ') || 'the table'}, the price simply wasn't there.`
      }
      return `You're reviewing the ${streetLabel(focusStreet).toLowerCase()} with ${others.join(', ') || 'the field'}.\nBoard: ${formatBoardDisplay(boardNow)}. Your hand: ${formatCardsDisplay(h.hero_cards)}.\nAsk me about "pot odds", "the board", or "who had the best hand".`
    }

    if (lower.includes('pot') && lower.includes('odd')) {
      const call = game?.available_actions.includes('call') ? 1 : 2
      const pot = game?.pot ?? 0
      const need = (call / (pot + call)) * 100
      return `Pot odds, step by step.\n1. The pot holds $${pot.toFixed(2)} and it costs $${call.toFixed(2)} to call.\n2. If you call, the final pot is $${(pot + call).toFixed(2)}.\n3. Required equity = call ÷ final pot = $${call.toFixed(2)} ÷ $${(pot + call).toFixed(2)} = ${need.toFixed(1)}%.\nThe rule: if you win this spot more than ${need.toFixed(1)}% of the time, calling makes money long-term. If you win it less, every call bleeds chips. That break-even number is the whole game of calling.`
    }
    if (/\bouts?\b/.test(lower)) {
      const heroCards = game?.hero_cards ?? []
      const board = game?.board ?? []
      if (board.length < 3) {
        return `Outs count the cards that improve you — that only starts once the flop is out. Right now focus on hand strength: ${formatCardsDisplay(heroCards)}.`
      }
      const { outs, notes } = estimateOuts(heroCards, board)
      if (!outs) {
        return `No clean flush or straight draw right now. Board: ${formatBoardDisplay(board)}.\nWhen you don't have a draw, outs stop mattering — the question becomes whether your made hand is ahead. Think about what pairs or better you beat.`
      }
      const toCome = 5 - board.length
      const multiplier = toCome === 2 ? 4 : 2
      const hitPct = Math.min(95, outs * multiplier)
      return `Your outs, step by step. You have ${notes.join(', ')} — ${outs} outs total.\nRule of ${toCome === 2 ? '4 and 2' : '2'}: with ${toCome} card${toCome === 2 ? 's' : ''} to come, multiply outs by ${multiplier}. ${outs} × ${multiplier} ≈ ${hitPct}% chance to hit.\nNow connect it to price: if you need about 25% equity to call, and you hit ${hitPct}% of the time, the draw pays. If the price asks for more than ${hitPct}%, fold and save the chips.`
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
        return `${street}. You hold ${hand}. Board: ${board}.\n\nThree things to think about:\n1. Hand strength: is your hand premium, playable, or weak right now?\n2. Pot odds: what's the break-even equity if you call?\n3. Blockers: what hands beat you?`
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

  async function submitChat(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    addMsg({ role: 'user', text: trimmed })
    setChatText('')

    // In play mode a bare action word drives the table directly.
    const lower = trimmed.toLowerCase()
    if (game && !game.complete && !game.needs_prediction) {
      const bareAction = ['fold', 'call', 'check', 'raise'].find((a) => lower === a)
      if (bareAction && game.available_actions.includes(bareAction)) {
        void takeAction(bareAction)
        return
      }
    }

    let reply: string | null = null
    let correct: boolean | null = null
    let topic: string | null = null
    if (game && mode === 'play') {
      try {
        const coach = await practiceChat(game.id, trimmed, userId)
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
      reply = localCoachReply(trimmed)
    }

    addMsg({ role: 'ai', text: reply })

    if (topic === 'best_hand' && correct !== null) {
      void logAction({
        user_id: userId,
        action_type: correct ? 'quiz_correct' : 'quiz_wrong',
        context_street: game?.street ?? '',
        context_hand: (game?.hero_cards ?? []).join(' '),
        detail: trimmed,
        session_id: game?.id ?? '',
        understood: correct,
      }).catch(() => undefined)
    }

    // Teaching mode: speak the whole explanation so the coach keeps talking.
    // The user can listen to the end, or interrupt by speaking / typing —
    // the next message cancels this line automatically.
    speakCoach(reply)
  }

  function handleOptionClick(value: string, msg: ChatMsg) {
    if (msg.answered) return
    setChatMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, answered: true } : m)))
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
      const read = classifyStartingHand(cards)
      const voice = voiceRevealHandStrength(cards, value)
      const chat = chatRevealHandStrength(cards, value)
      speakCoach(voice)
      addMsg({ role: 'ai', text: chat })
      if (cards.length === 2 && game) {
        const correct = value === read.tier
        void logAction({
          user_id: userId,
          action_type: correct ? 'quiz_correct' : 'quiz_wrong',
          context_street: 'preflop',
          context_hand: cards.join(' '),
          detail: value,
          option_label: 'preflop_ranges',
          session_id: game.id,
          understood: correct,
        }).catch(() => undefined)
      }
      return
    }
    if (value === 'draw' || value === 'besthand' || value === 'bluff' || value === 'guess') {
      const replies: Record<string, string> = {
        draw: 'A draw means you were paying for future equity. The question is always: was the price lower than your chance to hit? Let\'s check the math below.',
        besthand: 'If you thought you were ahead, the follow-up is what worse hands would still pay you off — and what beats you. The breakdown below shows the numbers.',
        bluff: 'A bluff needs fold equity to work. Below we\'ll see whether the price you paid matched the chance they actually fold.',
        guess: 'Honest answer — that\'s the most useful one. The walkthrough below gives you the repeatable checklist: strength, price, what beats you.',
      }
      addMsg({ role: 'ai', text: replies[value] })
      if (mode === 'analyze') setReviewStep('answer')
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

  // =====================================================================
  // ANALYZE MODE
  // =====================================================================

  function enterFocusStep(parsed: Extract<AnalyzeResponse, { status: 'parsed' }>) {
    setAnalysis(parsed)
    const hand = parsed.hand
    const streets = streetsInHand(hand)
    const firstLeak = hand.decision_points.find((dp) => dp.leak_tag)?.street
    const defaultStreet = firstLeak ?? (streets.includes('river') ? hand.decision_points.at(-1)?.street ?? 'preflop' : streets[streets.length - 1])
    setFocusStreet(streets.includes(defaultStreet) ? defaultStreet : streets[0])
    setFocusPlayers(playersInHand(hand))
    setAnalyzeStep('focus')
  }

  async function openSavedHand(handId: string) {
    setError('')
    setLoadingHandId(handId)
    try {
      const response = await reviewSavedHand(handId)
      if (response.status !== 'parsed') {
        setError(response.message)
        return
      }
      enterFocusStep(response)
    } catch {
      setError('Could not load that hand. Check that the API is running.')
    } finally {
      setLoadingHandId('')
    }
  }

  async function parseRawText(rawText: string, opponents: number) {
    setError('')
    setParsing(true)
    try {
      const response = await analyzeHand(rawText, userId, opponents)
      if (response.status !== 'parsed') {
        setError(response.message)
        return
      }
      onHandSaved?.()
      enterFocusStep(response)
    } catch {
      setError('Tell could not analyze this hand. Check that the API is running.')
    } finally {
      setParsing(false)
    }
  }

  async function parseNewHand(event: FormEvent) {
    event.preventDefault()
    await parseRawText(rawHand, players)
  }

  function startReview() {
    if (!analysis) return
    setReviewStep('question')
    setAnalyzeStep('review')
    resetChat()
    announceFocus({ speak: 'standalone', delayMs: 0 })
    const h = analysis.hand
    const boardNow = h.board.slice(0, BOARD_LEN[focusStreet] ?? 5)
    const others = focusPlayers.filter((p) => p.toLowerCase() !== 'hero')
    const boardLine = boardNow.length ? `Board: ${formatBoardDisplay(boardNow)}.` : 'No board cards yet.'
    addMsg({
      role: 'ai',
      text: `Let's look at the ${streetLabel(focusStreet).toLowerCase()}.\n${boardLine} You hold ${formatCardsDisplay(h.hero_cards)}${others.length ? `, in the hand with ${others.join(', ')}` : ''}.\n\nBefore any math — what were you thinking at this point?`,
      options: [
        { label: 'I was on a draw and thought the price was right', value: 'draw' },
        { label: 'I thought I had the best hand at the time', value: 'besthand' },
        { label: 'I was bluffing / representing a stronger hand', value: 'bluff' },
        { label: 'Honestly I was guessing — show me the walkthrough', value: 'guess' },
      ],
    })
    if (analysis.recurring_leak) {
      const leak = analysis.recurring_leak
      const similarityNote =
        leak.similar_hands.length > 0
          ? ` This also matches ${leak.similar_hands.length} earlier hand(s) by vector similarity.`
          : ''
      addMsg({ role: 'ai', text: `Memory check — ${leak.message}${similarityNote}` })
    }
  }

  function backToSource() {
    setAnalyzeStep('source')
    setAnalysis(null)
    setChatMessages([])
    setError('')
  }

  // =====================================================================
  // CHAT PANEL (shared render)
  // =====================================================================

  const micState = speech.status
  const ChatPanel = (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="ai-avatar">T</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gold-ink)' }}>Tell Coach</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>
            {micState === 'recording'
              ? 'Listening… click the mic or Ctrl+S to finish'
              : micState === 'transcribing'
                ? 'Transcribing…'
                : 'Ctrl+S to talk · Socratic · Memory-backed'}
          </div>
        </div>
        {game?.coach_prompt && (
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: '6px 12px', fontSize: 12 }}
            disabled={narrating}
            onClick={() => speakCoach(game.coach_prompt)}
            title="Repeat the coach prompt"
          >
            {narrating ? '…' : 'Replay'}
          </button>
        )}
      </div>
      <div className="chat-messages">
        {chatMessages.length === 0 && (
          <div style={{ fontSize: 14, color: 'var(--text-hint)', textAlign: 'center', padding: '24px 12px', lineHeight: 1.6 }}>
            Your conversation with Tell appears here.
            <br />
            Ask “why?” at any time, click the options I send, or use the mic to talk.
          </div>
        )}
        {chatMessages
          .filter((m) => m.role !== 'system')
          .map((msg) => (
            <div key={msg.id} className="fade-in">
              {msg.role === 'ai' ? (
                <div className="msg-ai">
                  <div>{msg.text}</div>
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
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-dim)' }}>
                      You replied to this prompt.
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
      {speech.error && (
        <div style={{ padding: '6px 12px 0', fontSize: 12.5, color: 'var(--red-ink)' }} role="alert">
          {speech.error}
        </div>
      )}
      <form
        className="chat-input-wrap"
        onSubmit={(e) => {
          e.preventDefault()
          void submitChat(chatText)
        }}
      >
        {speech.supported && (
          <button
            type="button"
            className={`mic-btn ${micState === 'recording' ? 'recording' : ''}`}
            onClick={speech.toggle}
            disabled={micState === 'transcribing'}
            title={micState === 'recording' ? 'Stop recording (Ctrl+S)' : 'Speak to the coach (Ctrl+S)'}
            aria-label="Microphone"
          >
            {micState === 'transcribing' ? (
              <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M21 12a9 9 0 1 1-6.2-8.56" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
                <path d="M12 18v3.5M8.5 21.5h7" strokeLinecap="round" />
              </svg>
            )}
          </button>
        )}
        <input
          className="chat-input"
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          placeholder='Ask “what are my outs?”, “pot odds?”, “why?”… or tap the mic'
        />
        <button type="submit" className="gold-btn" style={{ padding: '9px 16px', fontSize: 13.5 }}>
          Send
        </button>
      </form>
    </div>
  )

  // =====================================================================
  // RENDER: PLAY MODE
  // =====================================================================

  if (mode === 'play') {
    if (!tableReady) {
      return (
        <section className="mx-auto max-w-2xl fade-in">
          <span className="eyebrow">Live bot table</span>
          <h2 className="section-title">Who is sitting in tonight?</h2>
          <p className="section-sub">
            Each bot plays a named, explainable strategy (TAG / LAG / Loose-passive). Every hand you
            finish is saved to your Firestore memory so the coach can study your patterns.
          </p>
          <div style={{ marginTop: 22, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {Array.from({ length: 8 }, (_, i) => i + 2).map((count) => (
              <button
                key={count}
                type="button"
                className={`chip-btn ${players === count ? 'selected' : ''}`}
                onClick={() => setPlayers(count)}
                aria-pressed={players === count}
                style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}
              >
                <span style={{ fontSize: 18, fontWeight: 700 }}>{count}</span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {count === 2 ? 'Heads-up' : `${count - 1} bots`}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="gold-btn"
            style={{ marginTop: 22, width: '100%', padding: 13, fontSize: 15 }}
            onClick={openTable}
          >
            Take your seat
          </button>
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
                <div className="info-card-title">Your action · {game?.street?.toUpperCase() ?? 'PREFLOP'}</div>
                <div style={{ fontSize: 13.5, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', background: 'rgba(26,26,26,0.05)', border: '1px solid var(--border)', borderRadius: 2, padding: '4px 10px', width: 'fit-content', marginTop: 4 }}>
                  Stack ${(game?.hero_stack ?? 0).toFixed(2)} · Pot ${(game?.pot ?? 0).toFixed(2)} · Blinds $0.50/$1.00
                </div>
              </div>
            </div>
            <div className="action-buttons">
              <button type="button" className="action-btn action-btn-fold" disabled={!canFold || acting} onClick={() => takeAction('fold')}>
                Fold
              </button>
              <button type="button" className="action-btn action-btn-check" disabled={!canCheck || acting} onClick={() => takeAction('check')}>
                Check
              </button>
              <button type="button" className="action-btn action-btn-call" disabled={!canCall || acting} onClick={() => takeAction('call')}>
                Call ${callSize.toFixed(2)}
              </button>
              <button type="button" className="action-btn action-btn-raise" disabled={!canRaise || acting} onClick={() => takeAction('raise')}>
                Raise ${raiseAmount.toFixed(0)}
              </button>
            </div>
            {canRaise && (
              <div className="raise-slider-wrap">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-dim)' }}>Raise size</span>
                  <span style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>${raiseAmount.toFixed(2)}</span>
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
                  <span>Min ${minRaise.toFixed(0)}</span>
                  <span>Pot ~${((game?.pot ?? 0) * 2 + callSize).toFixed(0)}</span>
                  <span>All-in ${maxRaise.toFixed(0)}</span>
                </div>
              </div>
            )}
          </>
        ) : game?.needs_prediction ? (
          <div>
            <div className="info-card-title">You folded — who wins?</div>
            <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 12 }}>
              All bot cards are face up. Pick the winner, then tell me why in chat.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(players - 1, 4)}, 1fr)`, gap: 8, marginBottom: 14 }}>
              {Array.from({ length: players - 1 }, (_, i) => i + 1).map((bot) => (
                <button
                  key={bot}
                  type="button"
                  onClick={() => submitPrediction(bot)}
                  className="option-btn"
                  style={{ textAlign: 'center', padding: '12px 8px' }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gold-ink)' }}>{BOT_NAMES[bot - 1] ?? `Bot ${bot}`}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Seat {bot}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="gold-btn" style={{ padding: '10px 18px', fontSize: 14 }} onClick={() => void skipPrediction()}>
                Skip — show result
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="info-card-title">Showdown complete</div>
            <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 6 }}>{formatResult(game?.result)}</div>
            <div className="bot-reasoning">
              {(game?.bot_reasoning ?? []).slice(0, Math.max(0, players - 1)).map((br, idx) => (
                <div key={idx} className="bot-reasoning-item">
                  <div className="bot-name">{br.bot_name.toUpperCase()} · {br.personality.toUpperCase()}</div>
                  <div style={{ marginTop: 3, color: 'var(--text-dim)' }}>{br.reasoning}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="gold-btn" style={{ padding: '10px 18px', fontSize: 14 }} onClick={playAgain}>
                Deal another hand
              </button>
            </div>
          </div>
        )}
        {error && <div className="reasoning-block bad" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    )

    const InfoPanel = (
      <div className="info-card">
        <div className="info-card-title">Spot cheat sheet</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-dim)', display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>Your hand</span>
            <strong style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {game?.hero_cards.length ? formatCardsDisplay(game.hero_cards) : '—'}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>Board</span>
            <strong style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {game?.board.length ? formatBoardDisplay(game.board) : 'preflop'}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>To call</span>
            <strong style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {canCall ? `$${callSize.toFixed(2)}` : '—'}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>Pot odds needed</span>
            <strong style={{ color: canCall ? 'var(--text)' : 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {canCall ? `${((callSize / ((game?.pot ?? 0) + callSize)) * 100).toFixed(1)}%` : '—'}
            </strong>
          </div>
        </div>
      </div>
    )

    const FocusCard = coachFocus ? (
      <div className="info-card" style={{ borderLeft: '4px solid var(--amber)' }}>
        <div className="info-card-title">🎯 Session focus · from your hands</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-dim)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text)' }}>{coachFocus.title}.</strong>{' '}
          {coachFocus.chat}
        </div>
      </div>
    ) : null

    return (
      <section className="fade-in">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button className="btn-ghost" type="button" onClick={() => { setTableReady(false); setChatMessages([]) }}>
            ← Change table size
          </button>
          <span className="eyebrow">Live practice · {players} players</span>
        </div>
        <PokerTable
          heroCards={game?.hero_cards ?? []}
          board={game?.board ?? []}
          showdownHands={game?.showdown_hands}
          numOpponents={players - 1}
          heroStack={game?.hero_stack ?? 100}
          botStacks={game?.bot_stacks ?? Array(players - 1).fill(99)}
          pot={game?.pot ?? 0}
          street={game?.street ?? 'preflop'}
          activeSeat={!game?.complete && !game?.needs_prediction && game?.available_actions.length ? 0 : -1}
          foldedSeats={game?.hero_folded ? [0] : []}
          winner={game?.winner ?? null}
          dealerSeat={1}
          chatPanel={ChatPanel}
          actionPanel={ActionPanel}
          infoPanel={<>{FocusCard}{InfoPanel}</>}
        />
      </section>
    )
  }

  // =====================================================================
  // RENDER: ANALYZE MODE
  // =====================================================================

  if (analyzeStep === 'source') {
    return (
      <section className="fade-in" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>
        <div className="panel" style={{ padding: 22, background: '#e0f1fb' }}>
          <span className="eyebrow">01 · From your history</span>
          <h2 className="section-title" style={{ fontSize: 21 }}>Analyze a hand you already played</h2>
          <p className="section-sub" style={{ marginBottom: 16 }}>
            Every hand you play or paste is stored in Firestore. Pick one below, then choose the
            street and the players to focus on.
          </p>
          {savedHandsError && <div className="reasoning-block bad">Couldn't reach the backend — check that the Tell API is running.</div>}
          {!savedHandsError && savedHands === null && (
            <div style={{ fontSize: 14, color: 'var(--text-faint)', padding: '18px 0' }}>Loading your hands…</div>
          )}
          {!savedHandsError && savedHands !== null && savedHands.length === 0 && (
            <div style={{ fontSize: 14, color: 'var(--text-faint)', padding: '18px 0', lineHeight: 1.6 }}>
              {isSignedIn
                ? 'Nothing saved yet. Finish a practice hand on the Play tab, or paste a new hand on the right.'
                : 'Demo mode doesn’t save hands — sign in with Google to build a history you can re-open here. You can still paste or build a hand on the right to study it now.'}
            </div>
          )}
          {savedHands && savedHands.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
              {savedHands.map((hand) => (
                <div
                  key={hand.id}
                  className="hand-row clickable"
                  onClick={() => void openSavedHand(hand.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && void openSavedHand(hand.id)}
                >
                  <MiniCards cards={hand.hero_cards} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 3 }}>
                      <span className={hand.source === 'played' ? 'neutral-badge' : 'good-badge'}>
                        {hand.source === 'played' ? 'Played' : 'Analyzed'}
                      </span>
                      {hand.result && (
                        <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{formatResult(hand.result)}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                      {hand.board.length ? formatBoardDisplay(hand.board) : 'preflop only'} · {hand.num_opponents + 1}-max
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 84 }}>
                    {loadingHandId === hand.id ? (
                      <span style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>Opening…</span>
                    ) : hand.leak_tags.length > 0 ? (
                      Array.from(new Set(hand.leak_tags)).slice(0, 2).map((t) => (
                        <span key={t} className="leak-badge" style={{ display: 'flex', marginBottom: 3 }}>
                          {t.replace(/_/g, ' ')}
                        </span>
                      ))
                    ) : (
                      <span className="good-badge">no leaks</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel" style={{ padding: 22, background: '#fff6d6' }}>
          <span className="eyebrow">02 · New hand</span>
          <h2 className="section-title" style={{ fontSize: 21 }}>Bring Tell a fresh decision</h2>
          <p className="section-sub" style={{ marginBottom: 14 }}>
            Choose whichever way is easiest for you — paste a hand history, tell Tell about it out
            loud, or build it on the table card by card. You pick the street and players after.
          </p>

          <div className="method-tabs" role="tablist" aria-label="How to bring the hand">
            <button
              type="button"
              role="tab"
              aria-selected={importMethod === 'type'}
              className={`method-tab ${importMethod === 'type' ? 'active' : ''}`}
              onClick={() => setImportMethod('type')}
            >
              ⌨ Paste / type
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={importMethod === 'speak'}
              className={`method-tab ${importMethod === 'speak' ? 'active' : ''}`}
              onClick={() => setImportMethod('speak')}
            >
              🎤 Speak it
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={importMethod === 'build'}
              className={`method-tab ${importMethod === 'build' ? 'active' : ''}`}
              onClick={() => setImportMethod('build')}
            >
              🂡 Build on the table
            </button>
          </div>

          {importMethod === 'speak' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '18px 8px 22px', textAlign: 'center' }}>
              <button
                type="button"
                className={`mic-btn ${dictation.status === 'recording' ? 'recording' : ''}`}
                style={{ width: 72, height: 72 }}
                onClick={dictation.toggle}
                disabled={dictation.status === 'transcribing' || !dictation.supported}
                title="Speak the hand recap"
                aria-label="Speak the hand recap"
              >
                {dictation.status === 'transcribing' ? (
                  <svg className="spin" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M21 12a9 9 0 1 1-6.2-8.56" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
                    <path d="M12 18v3.5M8.5 21.5h7" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>
                {dictation.status === 'recording'
                  ? 'Listening… click the mic when you’re done'
                  : dictation.status === 'transcribing'
                    ? 'Transcribing…'
                    : 'Click the mic and recap the hand out loud'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', maxWidth: 420, lineHeight: 1.6 }}>
                Say it like you’d tell a friend: “I had nine-eight suited on the button, opened to
                six, flop came king-seven-four…” — Tell drops the transcript into the text box so
                you can tweak it before analyzing.
              </div>
              {dictation.error && <div style={{ fontSize: 13, color: 'var(--red-ink)' }}>{dictation.error}</div>}
              {!dictation.supported && (
                <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>
                  Microphone dictation isn’t available in this browser — use paste/type or the table builder.
                </div>
              )}
            </div>
          )}

          {importMethod === 'build' && (
            <HandBuilder
              busy={parsing}
              data={builderData}
              onDataChange={setBuilderData}
              onAnalyze={(text, opponents) => void parseRawText(text, opponents)}
            />
          )}

          {importMethod === 'type' && (
            <form onSubmit={parseNewHand}>
              <textarea
                className="textarea-hand"
                value={rawHand}
                onChange={(e) => setRawHand(e.target.value)}
                placeholder={`Paste a hand history export here, or type a recap like:\n\n"I was on the button with 9s 8s. Blinds $1/$2. I opened to $6, SB called, BB called. Flop came Ks 7s 4d. Checked to me, I c-bet $12, SB raised to $30, I called."`}
                required
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
                <button type="button" className="btn-ghost" onClick={() => setRawHand(SAMPLE_HAND)}>
                  Use demo hand (A♠K♥ vs Q♥J♣)
                </button>
                {dictation.supported && (
                  <button
                    type="button"
                    className={`btn-ghost ${dictation.status === 'recording' ? 'recording' : ''}`}
                    style={dictation.status === 'recording' ? { background: 'var(--red)', color: '#fff', borderColor: 'var(--red-ink)' } : undefined}
                    onClick={dictation.toggle}
                    disabled={dictation.status === 'transcribing'}
                    title="Dictate the hand recap into the box"
                  >
                    {dictation.status === 'recording'
                      ? '● Listening… click to stop'
                      : dictation.status === 'transcribing'
                        ? 'Transcribing…'
                        : '🎤 Speak it into the box'}
                  </button>
                )}
                <button type="submit" className="gold-btn" style={{ padding: '10px 20px', fontSize: 14 }} disabled={parsing}>
                  {parsing ? 'Parsing…' : 'Analyze this hand'}
                </button>
              </div>
            </form>
          )}
          {error && <div className="reasoning-block bad" style={{ marginTop: 12 }}>{error}</div>}
        </div>
      </section>
    )
  }

  if (analyzeStep === 'focus' && analysis) {
    const hand = analysis.hand
    const streets = streetsInHand(hand)
    const roster = playersInHand(hand)
    return (
      <section className="fade-in mx-auto" style={{ maxWidth: 860 }}>
        <button className="btn-ghost" type="button" onClick={backToSource} style={{ marginBottom: 16 }}>
          ← Edit this hand / choose a different one
        </button>
        <div className="panel" style={{ padding: 24, background: '#e2f4e6' }}>
          <span className="eyebrow">Set your focus</span>
          <h2 className="section-title" style={{ fontSize: 22 }}>What part of this hand do you want to understand?</h2>

          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', margin: '18px 0 22px', padding: 14, background: 'rgba(30,27,18,0.03)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <MiniCards cards={hand.hero_cards} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
                {hand.board.length ? formatBoardDisplay(hand.board) : 'Preflop only'}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, alignItems: 'center' }}>
                <span className={hand.source === 'played' ? 'neutral-badge' : 'good-badge'}>
                  {hand.source === 'played' ? 'Played hand' : 'Analyzed hand'}
                </span>
                <span className="neutral-badge">{hand.num_opponents + 1}-max</span>
                {hand.result && <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{formatResult(hand.result)}</span>}
                {Array.from(new Set(hand.leak_tags)).map((t) => (
                  <span key={t} className="leak-badge">{t.replace(/_/g, ' ')}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="info-card-title">Street</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {ALL_STREETS.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip-btn ${focusStreet === s ? 'selected' : ''}`}
                disabled={!streets.includes(s)}
                onClick={() => setFocusStreet(s)}
              >
                {streetLabel(s)}
              </button>
            ))}
          </div>

          <div className="info-card-title">Players in the hand</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
            {roster.map((name) => {
              const selected = focusPlayers.includes(name)
              return (
                <button
                  key={name}
                  type="button"
                  className={`chip-btn ${selected ? 'selected' : ''}`}
                  onClick={() =>
                    setFocusPlayers((prev) =>
                      selected
                        ? prev.length > 1
                          ? prev.filter((p) => p !== name)
                          : prev
                        : [...prev, name],
                    )
                  }
                >
                  {selected ? '✓ ' : ''}{name === 'hero' ? 'Hero' : name}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="gold-btn" style={{ padding: '11px 24px', fontSize: 14.5 }} onClick={startReview}>
              Start the review
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (analyzeStep === 'review' && analysis) {
    const hand = analysis.hand
    const roster = focusPlayers.length ? focusPlayers : playersInHand(hand)
    const seatHands = showdownBySeat(hand, roster)
    const boardNow = hand.board.slice(0, BOARD_LEN[focusStreet] ?? 5)
    const dp = hand.decision_points.find((d) => d.street === focusStreet)

    const ActionPanel = (
      <div className="action-panel">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div className="info-card-title">Socratic review · {streetLabel(focusStreet)}</div>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>
              {reviewStep === 'question'
                ? 'Answer me first, then I reveal the math.'
                : 'Here is the breakdown from the deterministic engine.'}
            </div>
          </div>
        </div>
        {reviewStep === 'question' ? (
          <div>
            <div style={{ fontSize: 14, color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.6 }}>
              Before I tell you anything: compare the pot before your call with the amount you had to
              put in. What percentage of the time do you need to win to break even?
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              <button className="option-btn" onClick={() => setReviewStep('answer')}>
                About 33% or more (roughly 2:1)
              </button>
              <button className="option-btn" onClick={() => setReviewStep('answer')}>
                About 50% or more (even money)
              </button>
              <button className="option-btn" onClick={() => setReviewStep('answer')}>
                About 25% or less (3:1 or better)
              </button>
              <button className="option-btn" onClick={() => setReviewStep('answer')}>
                Skip — give me the full walkthrough
              </button>
            </div>
          </div>
        ) : (
          <div>
            {dp ? (
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  <span className="good-badge">Required equity: {(dp.required_equity! * 100).toFixed(1)}%</span>
                  <span className="good-badge">Your equity: {dp.computed_equity != null ? `${(dp.computed_equity * 100).toFixed(1)}%` : 'unknown'}</span>
                  {dp.leak_tag ? (
                    <span className="leak-badge">{dp.leak_tag.replace(/_/g, ' ')}</span>
                  ) : (
                    <span className="good-badge">decision within range</span>
                  )}
                </div>
                <div className={`reasoning-block ${dp.leak_tag ? 'bad' : ''}`}>
                  {dp.leak_tag
                    ? `The gap: you needed ${(dp.required_equity! * 100).toFixed(1)}% equity to call and ${dp.computed_equity != null ? `only had ${(dp.computed_equity * 100).toFixed(1)}%` : 'the engine could not confirm you had it'}. That's a ${dp.leak_tag.replace(/_/g, ' ')} leak — over time the price bleeds chips.`
                    : dp.computed_equity != null
                      ? `Your equity ${(dp.computed_equity * 100).toFixed(1)}% exceeded the required ${(dp.required_equity! * 100).toFixed(1)}%, so this call was profitable long-term.`
                      : `The required equity was ${(dp.required_equity! * 100).toFixed(1)}%. Tell can't compute your actual equity without knowing what the other player held.`}
                </div>
                <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                  Formula lock-in: <strong>required equity = call ÷ (pot before call + call)</strong> =
                  {' '}${dp.call_amount.toFixed(2)} ÷ (${dp.pot_before.toFixed(2)} + ${dp.call_amount.toFixed(2)})
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13.5, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                No call decision was found on the {streetLabel(focusStreet).toLowerCase()} of this hand.
                Ask me in chat about the board texture or what each player could have had.
              </div>
            )}
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="gold-btn" style={{ padding: '10px 18px', fontSize: 14 }} onClick={backToSource}>
                Analyze another hand
              </button>
            </div>
          </div>
        )}
      </div>
    )

    return (
      <section className="fade-in">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button className="btn-ghost" type="button" onClick={backToSource}>
            ← Analyze another hand
          </button>
          <span className="eyebrow">
            Hand review · {streetLabel(focusStreet)} · {roster.length} players
          </span>
        </div>
        <PokerTable
          heroCards={hand.hero_cards}
          board={boardNow}
          showdownHands={seatHands}
          decisionPoints={hand.decision_points}
          numOpponents={Math.max(1, roster.length - 1)}
          playerNames={roster.map((n) => (n.toLowerCase() === 'hero' ? 'You' : n))}
          pot={dp?.pot_before ?? 0}
          street={focusStreet}
          focusStreet={focusStreet}
          winner={null}
          chatPanel={ChatPanel}
          actionPanel={ActionPanel}
        />
      </section>
    )
  }

  return null
}
