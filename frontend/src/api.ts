const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'post'
export type Street = 'preflop' | 'flop' | 'turn' | 'river'
export type LeakTag =
  | 'bad_river_call'
  | 'overwide_preflop_open'
  | 'missed_value_bet'
  | 'chasing_below_odds'
  | 'misread_position'

export type DecisionPoint = {
  street: Street
  pot_before: number
  call_amount: number
  required_equity: number | null
  computed_equity: number | null
  action_taken: ActionType
  leak_tag: LeakTag | null
}

export type HandAction = {
  street: Street
  actor: string
  action_type: ActionType
  amount: number | null
}

export type Hand = {
  id: string
  user_id: string
  raw_text: string
  hero_cards: string[]
  board: string[]
  actions: HandAction[]
  decision_points: DecisionPoint[]
  leak_tags: LeakTag[]
  num_opponents: number
}

export type RecurringLeak = {
  leak_tag: LeakTag
  previous_count: number
  similar_hands: Array<{ hand_id: string; similarity: number }>
  message: string
}

export type AnalyzeResponse =
  | { status: 'needs_clarification'; message: string }
  | {
      status: 'parsed'
      hand: Hand
      showdown: Record<string, string[]>
      recurring_leak: RecurringLeak | null
    }

export type MasteryMap = { scores: Record<string, number> }
export type BotReasoning = {
  bot_name: string
  seat: number
  personality: string
  action: string
  reasoning: string
  hand_strength: string
}

export type PracticeGame = {
  id: string
  hero_cards: string[]
  board: string[]
  showdown_hands: string[][]
  bot_reasoning?: BotReasoning[]
  bot_stacks?: number[]
  players: number
  street: string
  pot: number
  hero_stack: number
  complete: boolean
  winner: number | null
  needs_prediction: boolean
  result: string | null
  available_actions: string[]
  coach_prompt: string
  last_hero_action?: string
  hero_folded?: boolean
  hero_fold_street?: string | null
}

// Registered by App.tsx once Sign in with Google completes; the provider is
// called per request so Firebase can refresh expired ID tokens transparently.
let authTokenProvider: (() => Promise<string | null>) | null = null

export function setAuthTokenProvider(provider: (() => Promise<string | null>) | null) {
  authTokenProvider = provider
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authTokenProvider) {
    try {
      const token = await authTokenProvider()
      if (token) headers.Authorization = `Bearer ${token}`
    } catch {
      // fall through unauthenticated; backend serves local-mode identity
    }
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...init,
  })
  if (!response.ok) {
    throw new Error(`Request to ${path} failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function analyzeHand(rawText: string, userId: string, numOpponents: number): Promise<AnalyzeResponse> {
  return apiFetch<AnalyzeResponse>('/hands/analyze', {
    method: 'POST',
    body: JSON.stringify({ raw_text: rawText, user_id: userId, num_opponents: numOpponents }),
  })
}

export function listHands(userId: string): Promise<{ hands: Hand[] }> {
  return apiFetch<{ hands: Hand[] }>(`/hands?user_id=${encodeURIComponent(userId)}`)
}

export function getMastery(userId: string): Promise<MasteryMap> {
  return apiFetch<MasteryMap>(`/mastery/${encodeURIComponent(userId)}`)
}

export function startPractice(players: number): Promise<PracticeGame> {
  return apiFetch<PracticeGame>('/practice', { method: 'POST', body: JSON.stringify({ players }) })
}

export function playPracticeAction(gameId: string, action: string): Promise<PracticeGame> {
  return apiFetch<PracticeGame>(`/practice/${gameId}/action`, { method: 'POST', body: JSON.stringify({ action }) })
}

export function advanceBots(gameId: string, predictedWinner?: number): Promise<PracticeGame> {
  return apiFetch<PracticeGame>(`/practice/${gameId}/bots`, {
    method: 'POST',
    body: JSON.stringify({ predicted_winner: predictedWinner }),
  })
}

export type PracticeChatResponse = {
  reply?: string
  topic?: string
  correct?: boolean | null
  street?: string
  error?: string
}

export function practiceChat(gameId: string, message: string, userId = 'local-user'): Promise<PracticeChatResponse> {
  return apiFetch<PracticeChatResponse>(`/practice/${gameId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message, user_id: userId }),
  })
}

export async function narrate(text: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/narrate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
  if (!response.ok) throw new Error('Narration unavailable')
  return response.blob()
}

export type RecentActionsResponse = {
  actions: Array<Record<string, unknown>>
  leak_hint: string | null
  preferred_style_pot_odds: string
  math_wins: number
  intuition_wins: number
}

export function logAction(payload: {
  user_id: string
  action_type: string
  context_street?: string
  context_hand?: string
  detail?: string
  option_label?: string
  session_id?: string
  understood?: boolean
}): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>('/actions/log', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getRecentActions(userId: string, limit = 20): Promise<RecentActionsResponse> {
  return apiFetch<RecentActionsResponse>(`/actions/recent?user_id=${encodeURIComponent(userId)}&limit=${limit}`)
}
