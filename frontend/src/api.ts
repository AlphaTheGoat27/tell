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
}

export type AnalyzeResponse =
  | { status: 'needs_clarification'; message: string }
  | { status: 'parsed'; hand: Hand; showdown: Record<string, string[]> }

export type MasteryMap = { scores: Record<string, number> }

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!response.ok) {
    throw new Error(`Request to ${path} failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function analyzeHand(rawText: string, userId: string): Promise<AnalyzeResponse> {
  return apiFetch<AnalyzeResponse>('/hands/analyze', {
    method: 'POST',
    body: JSON.stringify({ raw_text: rawText, user_id: userId }),
  })
}

export function listHands(userId: string): Promise<{ hands: Hand[] }> {
  return apiFetch<{ hands: Hand[] }>(`/hands?user_id=${encodeURIComponent(userId)}`)
}

export function getMastery(userId: string): Promise<MasteryMap> {
  return apiFetch<MasteryMap>(`/mastery/${encodeURIComponent(userId)}`)
}