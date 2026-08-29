import { useState } from 'react'
import { Dashboard, History, SessionView } from './components'

type Tab = 'session' | 'dashboard' | 'history'

const DEFAULT_USER = 'local-user'

export default function App() {
  const [signedIn, setSignedIn] = useState<null | { name: string; email: string }>(null)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [tab, setTab] = useState<Tab>('session')
  const [refreshKey, setRefreshKey] = useState(0)

  const userId = signedIn ? email.replace(/[^a-zA-Z0-9]/g, '_') : DEFAULT_USER

  function handleHandSaved() {
    setRefreshKey((k) => k + 1)
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

          <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
            <button
              type="button"
              onClick={() => setAuthMode('signin')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                border: authMode === 'signin' ? '1px solid #d4af37' : '1px solid rgba(255,255,255,0.1)',
                background: authMode === 'signin' ? 'rgba(212,175,55,0.1)' : 'transparent',
                color: authMode === 'signin' ? '#d4af37' : 'rgba(255,255,255,0.55)',
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('signup')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                border: authMode === 'signup' ? '1px solid #d4af37' : '1px solid rgba(255,255,255,0.1)',
                background: authMode === 'signup' ? 'rgba(212,175,55,0.1)' : 'transparent',
                color: authMode === 'signup' ? '#d4af37' : 'rgba(255,255,255,0.55)',
              }}
            >
              Create account
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              setSignedIn({
                name: name || email.split('@')[0] || 'Player',
                email: email || 'demo@tell.poker',
              })
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            {authMode === 'signup' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>
                  DISPLAY NAME
                </label>
                <input
                  className="auth-input"
                  placeholder="e.g. Alex"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>
                EMAIL
              </label>
              <input
                className="auth-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {authMode === 'signin' && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 4 }}>
                  PASSWORD
                </label>
                <input className="auth-input" type="password" placeholder="••••••••" />
              </div>
            )}
            <button type="submit" className="gold-btn" style={{ padding: '12px', borderRadius: 10, fontSize: 14, marginTop: 6 }}>
              {authMode === 'signin' ? 'Sign in to Tell →' : 'Create my account →'}
            </button>
          </form>

          <div style={{ marginTop: 20 }}>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '14px 0' }}>
              — OR —
            </div>
            <button
              type="button"
              onClick={() => setSignedIn({ name: 'Demo Player', email: 'demo@tell.poker' })}
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
              Your leaks, explanations that landed, and hand history persist across sessions via Firestore with native vector search for pattern matching.
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
              <div style={{ fontSize: 12, fontWeight: 700, color: '#e5e7eb' }}>{signedIn.name}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{signedIn.email}</div>
            </div>
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
            <button
              type="button"
              onClick={() => setSignedIn(null)}
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
