import { useCallback, useEffect, useRef, useState } from 'react'
import { transcribeAudio } from './api'

export type SpeechStatus = 'idle' | 'recording' | 'transcribing'

/** Push-to-talk microphone: records the mic, sends the audio to the backend's
 * Google Cloud Speech-to-Text endpoint, and hands the transcript back. */
export function useSpeechToText(onTranscript: (text: string) => void) {
  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const callbackRef = useRef(onTranscript)
  useEffect(() => {
    callbackRef.current = onTranscript
  })

  const supported =
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  async function startRecording() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(
        (t) => MediaRecorder.isTypeSupported(t),
      )
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stopTracks()
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        chunksRef.current = []
        if (!blob.size) {
          setStatus('idle')
          return
        }
        setStatus('transcribing')
        try {
          const text = await transcribeAudio(blob)
          if (text.trim()) {
            callbackRef.current(text.trim())
          } else {
            setError('No speech detected. Try speaking a little louder.')
          }
        } catch {
          setError('Transcription is unavailable right now. You can still type.')
        } finally {
          setStatus('idle')
        }
      }
      recorder.start()
      recorderRef.current = recorder
      setStatus('recording')
    } catch {
      stopTracks()
      setError('Microphone unavailable. Check browser permissions.')
      setStatus('idle')
    }
  }

  const toggle = useCallback(() => {
    const recorder = recorderRef.current
    if (recorder && recorder.state === 'recording') {
      recorder.stop()
    } else if (status === 'idle') {
      void startRecording()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  useEffect(
    () => () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
    },
    [],
  )

  return { status, error, toggle, supported, clearError: () => setError('') }
}
