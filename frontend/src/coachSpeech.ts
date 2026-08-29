import { toSpeakableText } from './cards'

type SpeakingListener = (speaking: boolean) => void

const listeners = new Set<SpeakingListener>()
let cachedVoice: SpeechSynthesisVoice | undefined

function notifySpeaking(speaking: boolean) {
  listeners.forEach((cb) => cb(speaking))
}

export function onCoachSpeaking(cb: SpeakingListener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? []
  return (
    voices.find((v) => v.lang.startsWith('en') && v.localService) ??
    voices.find((v) => v.lang.startsWith('en-US')) ??
    voices.find((v) => v.lang.startsWith('en'))
  )
}

function ensureVoice(): SpeechSynthesisVoice | undefined {
  if (!cachedVoice) cachedVoice = pickVoice()
  return cachedVoice
}

/** Instant browser TTS — cancels any in-progress coach line. */
export function speakCoach(text: string): void {
  const trimmed = toSpeakableText(text.replace(/\*\*/g, '').replace(/\n+/g, '. ').trim())
  if (!trimmed || typeof window === 'undefined' || !window.speechSynthesis) return

  const synth = window.speechSynthesis
  synth.cancel()
  synth.resume()

  const utterance = new SpeechSynthesisUtterance(trimmed)
  utterance.rate = 1.28
  utterance.pitch = 1
  const voice = ensureVoice()
  if (voice) utterance.voice = voice
  utterance.onstart = () => notifySpeaking(true)
  utterance.onend = () => notifySpeaking(false)
  utterance.onerror = () => notifySpeaking(false)
  synth.speak(utterance)
  synth.resume()
}

export function stopCoach(): void {
  window.speechSynthesis?.cancel()
  notifySpeaking(false)
}

/** Warm up voices on first load (Chrome loads voices async). */
export function warmCoachSpeech(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const synth = window.speechSynthesis
  ensureVoice()
  synth.getVoices()
  synth.addEventListener('voiceschanged', () => {
    cachedVoice = pickVoice()
  })
  const prime = new SpeechSynthesisUtterance(' ')
  prime.volume = 0
  prime.rate = 2
  synth.speak(prime)
  synth.cancel()
  synth.resume()
}
