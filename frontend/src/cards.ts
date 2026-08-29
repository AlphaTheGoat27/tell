const SUIT_SYMBOLS: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' }

const RANK_SPOKEN: Record<string, string> = {
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
  T: 'ten',
  J: 'jack',
  Q: 'queen',
  K: 'king',
  A: 'ace',
}

const SUIT_SPOKEN: Record<string, string> = {
  s: 'spades',
  h: 'hearts',
  d: 'diamonds',
  c: 'clubs',
}

const SYMBOL_TO_SUIT: Record<string, string> = {
  '♠': 's',
  '♥': 'h',
  '♦': 'd',
  '♣': 'c',
}

/** Internal rank char → readable rank (T → 10). */
export function formatRank(rank: string): string {
  const r = rank.toUpperCase()
  return r === 'T' ? '10' : r
}

/** One card for on-screen text: 7s → 7♠, 9h → 9♥, Tc → 10♣ */
export function formatCardDisplay(card: string): string {
  if (!card || card.length < 2) return card
  const suitKey = card.slice(-1).toLowerCase()
  const rank = formatRank(card.slice(0, -1))
  const symbol = SUIT_SYMBOLS[suitKey] ?? suitKey
  return `${rank}${symbol}`
}

export function formatCardsDisplay(cards: string[]): string {
  return cards.map(formatCardDisplay).join(' ')
}

export function formatBoardDisplay(board: string[]): string {
  if (!board.length) return 'no board yet'
  return formatCardsDisplay(board)
}

/** One card for TTS: 7s → "seven of spades" */
export function formatCardVoice(card: string): string {
  if (!card || card.length < 2) return card
  const suitKey = card.slice(-1).toLowerCase()
  const rankKey = card.slice(0, -1).toUpperCase()
  const rank = RANK_SPOKEN[rankKey] ?? rankKey.toLowerCase()
  const suit = SUIT_SPOKEN[suitKey] ?? suitKey
  return `${rank} of ${suit}`
}

/** Multiple cards for TTS with natural connectors. */
export function formatCardsVoice(cards: string[]): string {
  if (cards.length === 0) return ''
  if (cards.length === 1) return formatCardVoice(cards[0])
  if (cards.length === 2) {
    return `${formatCardVoice(cards[0])} and ${formatCardVoice(cards[1])}`
  }
  const spoken = cards.map(formatCardVoice)
  return `${spoken.slice(0, -1).join(', ')}, and ${spoken[spoken.length - 1]}`
}

/** Convert any card notation in free text to spoken form for TTS. */
export function toSpeakableText(text: string): string {
  let out = text
  // Display form: 7♠, 10♥
  out = out.replace(/([2-9JQKA]|10)([♠♥♦♣])/g, (_, rank, symbol) => {
    const suit = SYMBOL_TO_SUIT[symbol] ?? 's'
    return formatCardVoice(`${rank === '10' ? 'T' : rank}${suit}`)
  })
  // Compact form: 7s, Th, Ac
  out = out.replace(/\b([2-9TJQKA])([shdc])\b/gi, (match) => formatCardVoice(match))
  return out
}

export function isSuited(a: string, b: string): boolean {
  return a.slice(-1).toLowerCase() === b.slice(-1).toLowerCase()
}

export function suitedLabel(a: string, b: string): string {
  return isSuited(a, b) ? 'suited' : 'offsuit'
}
