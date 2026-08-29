import type { PracticeGame } from './api'
import {
  formatBoardDisplay,
  formatCardsDisplay,
  formatCardsVoice,
  suitedLabel,
} from './cards'

const RANKS = '23456789TJQKA'
const BOT_NAMES = ['Alex', 'Sam', 'Jordan', 'Casey', 'Riley', 'Drew', 'Taylor']

export type HandTier = 'premium' | 'playable' | 'weak'

export type HandRead = {
  tier: HandTier
  voice: string
  chat: string
}

function rankOf(card: string): number {
  return RANKS.indexOf(card[0].toUpperCase())
}

export function streetLabel(street: string): string {
  const labels: Record<string, string> = {
    preflop: 'Preflop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River',
    showdown: 'Showdown',
  }
  return labels[street] ?? street
}

/** Strip personality tags like (TAG) from backend result strings. */
export function formatResult(result: string | null | undefined): string {
  if (!result) return 'Hand over.'
  return result.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

function spotContext(g: PracticeGame): string {
  const hand = formatCardsDisplay(g.hero_cards)
  const board = formatBoardDisplay(g.board)
  const pot = g.pot.toFixed(2)
  if (g.street === 'preflop' || !g.board.length) {
    return `Your hand: ${hand}. Pot: $${pot}.`
  }
  return `Board: ${board}. Your hand: ${hand}. Pot: $${pot}.`
}

function actionWord(action: string): string {
  return { fold: 'fold', check: 'check', call: 'call', raise: 'raise' }[action] ?? action
}

export function classifyStartingHand(cards: string[]): HandRead {
  if (cards.length < 2) {
    return { tier: 'weak', voice: 'Weak.', chat: 'Weak preflop.' }
  }
  const [a, b] = cards
  const r1 = rankOf(a)
  const r2 = rankOf(b)
  const high = Math.max(r1, r2)
  const low = Math.min(r1, r2)
  const suited = a.slice(-1).toLowerCase() === b.slice(-1).toLowerCase()
  const paired = r1 === r2
  const handDisplay = formatCardsDisplay(cards)
  const suitedTag = suitedLabel(a, b)

  if (paired && high >= 10) {
    return { tier: 'premium', voice: 'Premium pair.', chat: `${handDisplay} is premium.` }
  }
  if (paired && high >= 7) {
    return { tier: 'playable', voice: 'Medium pair.', chat: `${handDisplay} is playable.` }
  }
  if (paired) {
    return { tier: 'weak', voice: 'Small pair.', chat: `${handDisplay} is weak unless cheap.` }
  }
  if (high >= 12 && low >= 10) {
    return { tier: 'premium', voice: 'Broadway hand.', chat: `${handDisplay} ${suitedTag} is premium.` }
  }
  if (high >= 12 && low >= 8 && suited) {
    return { tier: 'premium', voice: 'Strong ace suited.', chat: `${handDisplay} is premium.` }
  }
  if ((high >= 11 && low >= 9) || (suited && high - low <= 2 && low >= 4)) {
    return { tier: 'playable', voice: 'Playable hand.', chat: `${handDisplay} ${suitedTag} is playable.` }
  }
  if (high >= 11) {
    return { tier: 'playable', voice: 'One broadway.', chat: `${handDisplay} is playable late position.` }
  }
  if (high - low >= 4 || low <= 4) {
    return { tier: 'weak', voice: 'Weak and disconnected.', chat: `${handDisplay} ${suitedTag} is weak.` }
  }
  return { tier: 'weak', voice: 'Low cards.', chat: `${handDisplay} is weak.` }
}

// --- Questions ---

export function voiceQuestionNewHand(g: PracticeGame): string {
  const hand = formatCardsVoice(g.hero_cards)
  return `Preflop. You have ${hand}. How strong is this hand?`
}

export function chatQuestionNewHand(g: PracticeGame): string {
  return `Preflop. ${spotContext(g)}\nHow strong is this hand? Premium, playable, or weak?`
}

export function handStrengthQuizText(cards: string[]): string {
  return `Preflop: ${formatCardsDisplay(cards)}. Premium, playable, or weak?`
}

export function voiceQuestionStreet(g: PracticeGame): string {
  const hand = formatCardsVoice(g.hero_cards)
  const board = g.board.length ? formatCardsVoice(g.board) : ''

  if (g.street === 'preflop') return voiceQuestionNewHand(g)
  if (g.street === 'flop') {
    return `Flop. ${board}. You hold ${hand}. What is your best hand?`
  }
  if (g.street === 'turn') {
    return `Turn. ${board}. Did your hand improve?`
  }
  if (g.street === 'river') {
    return `River. ${board}. Bet for value or check?`
  }
  return `${streetLabel(g.street)}. What is your move?`
}

export function chatQuestionStreet(g: PracticeGame): string {
  const label = streetLabel(g.street)
  if (g.street === 'preflop') return chatQuestionNewHand(g)
  const q: Record<string, string> = {
    flop: 'What is your best five-card hand?',
    turn: 'Did the turn help you?',
    river: 'Value bet or check?',
  }
  return `${label}. ${spotContext(g)}\n${q[g.street] ?? 'What is your move?'}`
}

export function voiceQuestionAfterFold(g: PracticeGame, foldedOn: string): string {
  const board = g.board.length ? formatCardsVoice(g.board) : 'no board yet'
  return `You folded on ${streetLabel(foldedOn)}. ${board}. Who wins?`
}

export function voiceQuestionPotOdds(pot: number, call: number): string {
  return `Pot is $${pot.toFixed(0)}, call is $${call.toFixed(0)}. What equity do you need?`
}

export function chatQuestionPotOdds(pot: number, call: number, includeFormulaHint: boolean): string {
  const base = `Pot: $${pot.toFixed(2)}, call: $${call.toFixed(2)}.\nWhat equity do you need?`
  if (includeFormulaHint) {
    return `${base}\n(Hint: call ÷ pot after you call.)`
  }
  return base
}

// --- Narration (table events, short) ---

export function chatNarrateAction(g: PracticeGame, action: string, actedOnStreet?: string): string {
  const label = streetLabel(actedOnStreet ?? g.street)

  if (action === 'fold') {
    return `${label}. You fold. Board: ${formatBoardDisplay(g.board)}.`
  }
  if (g.complete) {
    return `Showdown. ${formatResult(g.result)} ${spotContext(g)}`
  }
  return `${label}. You ${actionWord(action)}. ${spotContext(g)}`
}

export function voiceNarrateAction(g: PracticeGame, action: string, actedOnStreet?: string): string {
  if (g.complete && g.result) {
    return formatResult(g.result)
  }
  const label = streetLabel(actedOnStreet ?? g.street)
  if (action === 'fold') {
    return `You fold on ${label}.`
  }
  return `${label}. You ${actionWord(action)}.`
}

export function chatRevealHandStrength(cards: string[], userPick: string): string {
  const read = classifyStartingHand(cards)
  const correct = userPick === read.tier
  const hand = formatCardsDisplay(cards)
  if (correct) {
    return `Correct. ${hand} is ${read.tier}.`
  }
  return `Not quite. ${hand} is ${read.tier}, not ${userPick}.`
}

export function voiceRevealHandStrength(cards: string[], userPick: string): string {
  const read = classifyStartingHand(cards)
  const correct = userPick === read.tier
  if (correct) return `Correct. ${read.tier}.`
  return `Not quite. ${read.tier}.`
}

export function chatRevealPrediction(g: PracticeGame, pickedSeat: number, correct: boolean): string {
  const board = formatBoardDisplay(g.board)
  const picked = botLabel(pickedSeat)
  const winner = (g.winner ?? 0) === 0 ? 'You' : botLabel(g.winner ?? 1)
  const hands = g.showdown_hands ?? []
  let line = `${formatResult(g.result)} Board: ${board}.`
  if (hands.length > (g.winner ?? 0) && hands[g.winner ?? 0]?.length === 2) {
    line += ` ${winner} had ${formatCardsDisplay(hands[g.winner ?? 0])}.`
  }
  if (!correct && hands.length > pickedSeat) {
    line += ` You picked ${picked}.`
  } else if (correct) {
    line += ` Good read.`
  }
  return line
}

export function voiceRevealPrediction(g: PracticeGame, pickedSeat: number, correct: boolean): string {
  const result = formatResult(g.result?.split('.')[0] ?? `${botLabel(g.winner ?? 0)} wins`)
  if (correct) return `${result}. Good read.`
  return `${result}. You picked ${botLabel(pickedSeat)}.`
}

export function voiceRevealPotOdds(
  correct: boolean,
  potData: { pot: number; call: number; answerPct: number },
  includeFormula: boolean,
): string {
  const pct = potData.answerPct.toFixed(1)
  if (correct) {
    return includeFormula
      ? `Correct. About ${pct} percent. Call divided by pot plus call.`
      : `Correct. About ${pct} percent.`
  }
  return includeFormula
    ? `About ${pct} percent. Call divided by pot plus call.`
    : `About ${pct} percent.`
}

export function chatRevealPotOdds(
  correct: boolean,
  potData: { pot: number; call: number; answerPct: number },
  includeFormula: boolean,
): string {
  const pct = potData.answerPct.toFixed(1)
  if (includeFormula) {
    const formula = `$${potData.call.toFixed(2)} ÷ ($${potData.pot.toFixed(2)} + $${potData.call.toFixed(2)}) = ${pct}%`
    return correct
      ? `Correct. ${formula}. Remember: call ÷ (pot + call).`
      : `Not quite. ${formula}.`
  }
  return correct ? `Correct. About ${pct}% equity needed.` : `About ${pct}% equity needed.`
}

export function botLabel(seat: number): string {
  return BOT_NAMES[seat - 1] ?? `Bot ${seat}`
}

// Legacy aliases
export const voiceForNewHand = voiceQuestionNewHand
export const chatForNewHand = chatQuestionNewHand
export const voiceForStreet = voiceQuestionStreet
export const chatForStreet = chatQuestionStreet
export const voiceAfterFold = voiceQuestionAfterFold
export const chatAfterFold = (g: PracticeGame, foldedOn: string) =>
  `${streetLabel(foldedOn)}. You fold. Board: ${formatBoardDisplay(g.board)}. Who wins?`
export const voiceForHandStrengthAnswer = voiceRevealHandStrength
export const chatForHandStrengthAnswer = chatRevealHandStrength
export const voiceForShowdown = (g: PracticeGame) => formatResult(g.result)
export const chatForAction = chatNarrateAction
export const voiceForPrediction = voiceRevealPrediction
export const chatForPrediction = chatRevealPrediction
export const voiceRevealAction = voiceNarrateAction
export const chatRevealAction = chatNarrateAction
