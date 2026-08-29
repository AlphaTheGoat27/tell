import { useEffect, useState } from 'react'
import { Dashboard, History, SessionView } from './components'
import { setAuthTokenProvider } from './api'
import {
  currentIdToken,
  isFirebaseConfigured,
  signInWithGoogle,
  signOutUser,
  watchAuth,
} from './firebase'

type Tab = 'session' | 'dashboard' | 'history'

type SignedInUser = {
  name: string
  email: string
  uid: string
  photoUrl: string | null
  via: 'google' | 'demo'
}

export default function App() {
  const [signedIn, setSignedIn] = useState<SignedInUser | null>(null)
  const [googleError, setGoogleError] = useState('')
  const [googleBusy, setGoogleBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('session')
  const [refreshKey, setRefreshKey] = useState(0)

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

  function handleHandSaved() {
    setRefreshKey((k) => k + 1)
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
      <div className="auth-screen vegas-bg">
        <div className="auth-card">
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                margin: '0 auto 14px',
                background: 'linear-gradient(135deg, #d4af37 0%, #92400e 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
                fontWeight: 900,
                color: '#1f2937',
                boxShadow: '0 8px 24px rgba(212,175,55,0.25)',
              }}
            >
              ♠
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 4 }}>
              <span className="gold-text">Tell</span>
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
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
                padding: '12px',
                borderRadius: 10,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                opacity: googleBusy ? 0.7 : 1,
              }}
            >
              <span aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 48 48">
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
                padding: 12,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 12,
                color: 'rgba(255,255,255,0.55)',
                lineHeight: 1.6,
              }}
            >
              Cloud sign-in is off in this build. Add the <code>VITE_FIREBASE_*</code> values
              from <code>frontend/.env.example</code> to enable Sign in with Google +
              Firestore memory.
            </div>
          )}

          {googleError && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#f87171' }}>{googleError}</div>
          )}

          <div style={{ marginTop: 20 }}>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '14px 0' }}>
              — OR —
            </div>
            <button
              type="button"
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
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(212,175,55,0.25)',
                color: '#d4af37',
              }}
            >
              Continue as demo (no account)
            </button>
          </div>

          <div style={{ marginTop: 22, padding: 12, borderRadius: 10, background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.15)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: '#d4af37' }}>FIRESTORE MEMORY</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4, lineHeight: 1.6 }}>
              Sign in with Google and your analyzed hands, leak tags, and mastery map persist
              to Cloud Firestore under your account — the coach remembers what keeps tripping
              you up across sessions and devices.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen vegas-bg">
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '28px 24px 60px' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 4, color: '#d4af37' }}>
              POKER STUDY COMPANION · COLLABORATIVE TRACK
            </p>
            <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.5, marginTop: 2 }}>
              <span className="gold-text">Tell</span>
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              Hi {signedIn.name} — understand the decision, not just the result.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e5e7eb' }}>
                {signedIn.name}
                {signedIn.via === 'google' && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: 1,
                      color: '#4ade80',
                      border: '1px solid rgba(74,222,128,0.35)',
                      borderRadius: 6,
                      padding: '2px 6px',
                      verticalAlign: 'middle',
                    }}
                  >
                    SYNCED
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{signedIn.email}</div>
            </div>
            {signedIn.photoUrl ? (
              <img
                src={signedIn.photoUrl}
                alt=""
                referrerPolicy="no-referrer"
                style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid #78350f' }}
              />
            ) : (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #d4af37 0%, #92400e 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 900,
                  fontSize: 15,
                  color: '#1f2937',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  border: '1px solid #78350f',
                }}
              >
                {signedIn.name.charAt(0).toUpperCase()}
              </div>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.5)',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>
        </header>

        <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(212,175,55,0.1)', marginBottom: 22 }} aria-label="Sections">
          {([
            ['session', '🎴 Table', 'Hand Autopsy / Live Bots'],
            ['dashboard', '📊 Dashboard', 'Mastery Map'],
            ['history', '🗂️ History', 'Past Hands'],
          ] as const).map(([key, label, hint]) => (
            <div key={key}>
              <button
                className={`nav-tab ${tab === key ? 'active' : ''}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
              {tab === key && (
                <div style={{ fontSize: 10, color: 'rgba(212,175,55,0.6)', padding: '0 18px 6px', letterSpacing: 0.5 }}>
                  {hint}
                </div>
              )}
            </div>
          ))}
        </nav>

        {tab === 'session' && <SessionView userId={userId} onHandSaved={handleHandSaved} />}
        {tab === 'dashboard' && <Dashboard userId={userId} refreshKey={refreshKey} />}
        {tab === 'history' && <History userId={userId} refreshKey={refreshKey} />}
      </div>
    </main>
  )
}
