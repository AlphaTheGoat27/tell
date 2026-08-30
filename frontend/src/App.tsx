import { useEffect, useRef, useState } from 'react'
import { Dashboard, History, SessionView } from './components'
import { setAuthTokenProvider } from './api'
import {
  currentIdToken,
  isFirebaseConfigured,
  signInWithGoogle,
  signOutUser,
  watchAuth,
} from './firebase'

const backgroundMusic = new URL('../music/music.mp3', import.meta.url).href

type Tab = 'play' | 'analyze' | 'dashboard' | 'history'

type SignedInUser = {
  name: string
  email: string
  uid: string
  photoUrl: string | null
  via: 'google' | 'demo'
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'play', label: 'Play' },
  { key: 'analyze', label: 'Analyze' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'history', label: 'History' },
]

export default function App() {
  const [signedIn, setSignedIn] = useState<SignedInUser | null>(null)
  const [googleError, setGoogleError] = useState('')
  const [googleBusy, setGoogleBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('play')
  const [refreshKey, setRefreshKey] = useState(0)
  const [reviewHandId, setReviewHandId] = useState<string | null>(null)
  const [musicEnabled, setMusicEnabled] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)

useEffect(() => {
  const audio = new Audio(backgroundMusic)

  audioRef.current = audio
  audio.loop = true
  audio.volume = 0.28
  audio.preload = 'auto'

  const startMusic = async () => {
    try {
      await audio.play()

      window.removeEventListener('pointerdown', startMusic)
      window.removeEventListener('keydown', startMusic)
      window.removeEventListener('touchstart', startMusic)
    } catch {
      // Browser blocked autoplay.
      // It will retry after user interaction.
    }
  }

  // Try to start immediately.
  void startMusic()

  // Fallback for browsers that block autoplay.
  window.addEventListener('pointerdown', startMusic)
  window.addEventListener('keydown', startMusic)
  window.addEventListener('touchstart', startMusic)

  return () => {
    window.removeEventListener('pointerdown', startMusic)
    window.removeEventListener('keydown', startMusic)
    window.removeEventListener('touchstart', startMusic)

    audio.pause()
    audio.currentTime = 0
    audioRef.current = null
  }
}, [])

useEffect(() => {
  const audio = audioRef.current
  if (!audio) return

  if (musicEnabled) {
    void audio.play().catch(() => {
      // Autoplay/user-gesture restriction.
    })
  } else {
    audio.pause()
  }
}, [musicEnabled])


  useEffect(() => {
    return watchAuth((fbUser) => {
      if (fbUser) {
        setAuthTokenProvider(currentIdToken)
        setSignedIn({
          name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Player',
          email: fbUser.email || '',
          uid: fbUser.uid,
          photoUrl: fbUser.photoURL,
          via: 'google',
        })
      } else {
        setAuthTokenProvider(null)
        setSignedIn((prev) => (prev?.via === 'google' ? null : prev))
      }
    })
  }, [])

  const userId = signedIn?.uid ?? 'local-user'
  // Memory (hands, mastery, history) belongs to a real signed-in account.
  // Demo mode shares one identity, so it must not read or write saved memory.
  const isSignedIn = signedIn?.via === 'google'

  function handleHandSaved() {
    setRefreshKey((k) => k + 1)
  }

  function handleReviewHand(handId: string) {
    setReviewHandId(handId)
    setTab('analyze')
  }

  async function handleGoogleSignIn() {
    setGoogleError('')
    setGoogleBusy(true)
    try {
      await signInWithGoogle()
    } catch (error) {
      setGoogleError(
        error instanceof Error && error.message
          ? error.message
          : 'Google sign-in failed. Check the Firebase config and authorized domains.',
      )
    } finally {
      setGoogleBusy(false)
    }
  }

  function handleSignOut() {
    if (signedIn?.via === 'google') void signOutUser()
    setAuthTokenProvider(null)
    setSignedIn(null)
  }

  if (!signedIn) {
    return (
      <div className="auth-screen app-bg">
        <div className="auth-card fade-in">
          <div style={{ textAlign: 'center', marginBottom: 26 }}>
            <img
              src="/icon.png"
              alt="Tell"
              style={{ width: 180, margin: '0 auto 10px', display: 'block', borderRadius: 12, border: '1px solid #1a1a1a', background: '#fff', boxShadow: '4px 4px 0 #1a1a1a' }}
            />
            <h1 style={{ position: 'absolute', width: 1, height: 1, margin: 0, overflow: 'hidden' }}>Tell</h1>
            <p style={{ fontSize: 14, color: 'var(--text-dim)', marginTop: 6 }}>
              Your Socratic poker study companion
            </p>
          </div>

          {isFirebaseConfigured ? (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleBusy}
              className="gold-btn"
              style={{
                width: '100%',
                padding: 12,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <span aria-hidden="true">
                <svg width="17" height="17" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
                </svg>
              </span>
              {googleBusy ? 'Signing in…' : 'Sign in with Google'}
            </button>
          ) : (
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                background: 'rgba(30,27,18,0.04)',
                border: '1px solid var(--border)',
                fontSize: 13,
                color: 'var(--text-dim)',
                lineHeight: 1.6,
              }}
            >
              Cloud sign-in is off in this build. Add the <code>VITE_FIREBASE_*</code> values
              from <code>frontend/.env.example</code> to enable Sign in with Google +
              Firestore memory.
            </div>
          )}

          {googleError && (
            <div style={{ marginTop: 10, fontSize: 13, color: 'var(--red-ink)' }}>{googleError}</div>
          )}

          <div style={{ marginTop: 18 }}>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-faint)', margin: '14px 0' }}>
              OR
            </div>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setAuthTokenProvider(null)
                setSignedIn({
                  name: 'Demo Player',
                  email: 'demo@tell.poker',
                  uid: 'local-user',
                  photoUrl: null,
                  via: 'demo',
                })
              }}
              style={{ width: '100%', padding: 12, fontSize: 14 }}
            >
              Continue as demo (no account)
            </button>
          </div>

          <div style={{ marginTop: 22, padding: 14, borderRadius: 2, background: 'var(--gold-soft)', border: '1px solid rgba(26,26,26,0.4)' }}>
            <div className="eyebrow">Firestore memory</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.6 }}>
              Sign in with Google and every hand you play or analyze, your leak tags, and your
              mastery map persist to Cloud Firestore — the coach remembers what keeps tripping
              you up across sessions and devices.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen app-bg">
      <header className="app-header">
        <div className="brand">
          <img src="/favicon.ico" alt="" style={{ width: 30, height: 30, borderRadius: 6 }} />
          <div>
            <div className="brand-name"><span className="gold-text">Tell</span></div>
            <div className="brand-tag">Poker study companion</div>
          </div>
        </div>

        <nav className="nav-tabs" aria-label="Sections">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              className={`nav-tab ${tab === key ? 'active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="user-chip">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setMusicEnabled((enabled) => !enabled)}
            aria-label={musicEnabled ? 'Pause background music' : 'Play background music'}
            title={musicEnabled ? 'Pause music' : 'Play music'}
            style={{ marginRight: 4 }}
          >
            {musicEnabled ? 'Pause music' : 'Play music'}
          </button>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              {signedIn.name}
              {signedIn.via === 'google' && <span className="synced-badge">SYNCED</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{signedIn.email}</div>
          </div>
          {signedIn.photoUrl ? (
            <img
              src={signedIn.photoUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="avatar"
              style={{ border: '1px solid #1a1a1a' }}
            />
          ) : (
            <div className="avatar">{signedIn.name.charAt(0).toUpperCase()}</div>
          )}
          <button type="button" className="btn-ghost" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {!isSignedIn && (
        <div
          style={{
            borderBottom: '1px solid var(--border)',
            background: '#fff6d6',
            padding: '9px 28px',
            fontSize: 13.5,
            color: 'var(--text-dim)',
            textAlign: 'center',
          }}
        >
          You’re in <strong style={{ color: 'var(--text)' }}>demo mode</strong> — hands and progress
          aren’t saved and no one else’s are shown. Sign in with Google to keep your private history
          and mastery.
        </div>
      )}

      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 28px 64px' }}>
        {tab === 'play' && (
          <SessionView key="play" mode="play" userId={userId} isSignedIn={isSignedIn} onHandSaved={handleHandSaved} />
        )}
        {tab === 'analyze' && (
          <SessionView
            key="analyze"
            mode="analyze"
            userId={userId}
            isSignedIn={isSignedIn}
            onHandSaved={handleHandSaved}
            initialHandId={reviewHandId}
            onConsumeInitialHand={() => setReviewHandId(null)}
          />
        )}
        {tab === 'dashboard' && <Dashboard userId={userId} isSignedIn={isSignedIn} refreshKey={refreshKey} />}
        {tab === 'history' && (
          <History userId={userId} isSignedIn={isSignedIn} refreshKey={refreshKey} onReviewHand={handleReviewHand} />
        )}
      </div>
    </main>
  )
}
