import { toSpeakableText } from './cards'

type SpeakingListener = (speaking: boolean) => void

const listeners = new Set<SpeakingListener>()
let cachedVoice: SpeechSynthesisVoice | undefined

// Generation token so an interrupted queue never flips the speaking flag for
// the line that replaced it.
let generation = 0
let keepAlive: number | undefined

const MAX_CHUNK = 160

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

/** Break text into sentence-sized chunks so the browser TTS engine keeps
 * talking through a long explanation instead of stopping after one breath. */
function splitIntoChunks(text: string): string[] {
  const sentences: string[] = []
  let buffer = ''
  for (const ch of text) {
    buffer += ch
    if (ch === '.' || ch === '!' || ch === '?') {
      const trimmed = buffer.trim()
      if (trimmed) sentences.push(trimmed)
      buffer = ''
    }
  }
  if (buffer.trim()) sentences.push(buffer.trim())

  const chunks: string[] = []
  for (const sentence of sentences) {
    if (sentence.length <= MAX_CHUNK) {
      chunks.push(sentence)
      continue
    }
    let current = ''
    for (const word of sentence.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length > MAX_CHUNK && current) {
        chunks.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) chunks.push(current)
  }
  return chunks.filter(Boolean)
}

function clearKeepAlive() {
  if (keepAlive !== undefined) {
    window.clearInterval(keepAlive)
    keepAlive = undefined
  }
}

/** Speak a coach line. Short narration/questions become one chunk; a deep
 * explanation is queued chunk-by-chunk so Tell keeps talking to the end. */
export function speakCoach(text: string): void {
  const trimmed = toSpeakableText(text.replace(/\*\*/g, '').replace(/\n+/g, '. ').trim())
  if (!trimmed || typeof window === 'undefined' || !window.speechSynthesis) return

  const synth = window.speechSynthesis
  const chunks = splitIntoChunks(trimmed)
  if (!chunks.length) return

  synth.cancel()
  clearKeepAlive()
  generation += 1
  const gen = generation

  let remaining = chunks.length
  notifySpeaking(true)

  // Chrome silently stalls long queues; a periodic resume keeps it talking.
  keepAlive = window.setInterval(() => {
    if (gen !== generation) return
    synth.resume()
  }, 8000)

  for (const chunk of chunks) {
    const utterance = new SpeechSynthesisUtterance(chunk)
    utterance.rate = 1.28
    utterance.pitch = 1
    const voice = ensureVoice()
    if (voice) utterance.voice = voice
    const finish = () => {
      if (gen !== generation) return
      remaining -= 1
      if (remaining <= 0) {
        clearKeepAlive()
        notifySpeaking(false)
      }
    }
    utterance.onend = finish
    utterance.onerror = finish
    synth.speak(utterance)
  }
  synth.resume()
}

export function stopCoach(): void {
  generation += 1
  clearKeepAlive()
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
