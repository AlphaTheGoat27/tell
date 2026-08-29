import { useState } from 'react'
import './App.css'
import { Dashboard, History, SessionView } from './components'

const USER_ID = 'local-user'

type Tab = 'session' | 'dashboard' | 'history'

export default function App() {
  const [tab, setTab] = useState<Tab>('session')
  const [refreshKey, setRefreshKey] = useState(0)

  function handleHandSaved() {
    // bump the key so Dashboard/History refetch next time they're shown
    setRefreshKey((k) => k + 1)
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">POKER STUDY COMPANION</p>
        <h1>Tell</h1>
        <p className="intro">Understand the decision, not just the result.</p>
      </header>

      <nav className="tab-bar" aria-label="Sections">
        <button className={tab === 'session' ? 'active' : ''} onClick={() => setTab('session')}>
          Hand Autopsy
        </button>
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
          Dashboard
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          History
        </button>
      </nav>

      {tab === 'session' && <SessionView userId={USER_ID} onHandSaved={handleHandSaved} />}
      {tab === 'dashboard' && <Dashboard userId={USER_ID} refreshKey={refreshKey} />}
      {tab === 'history' && <History userId={USER_ID} refreshKey={refreshKey} />}
    </main>
  )
}
