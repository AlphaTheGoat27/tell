import './App.css'

function App() {
  return (
    <main className="dashboard">
      <p className="eyebrow">POKER STUDY COMPANION</p>
      <h1>Tell</h1>
      <p className="intro">Understand the decision, not just the result.</p>
      <section className="cards" aria-label="Tell features">
        <article><strong>Dashboard</strong><span>Track your recurring leaks</span></article>
        <article><strong>Hand Autopsy</strong><span>Paste a hand history to begin</span></article>
        <article><strong>History</strong><span>Review your progress over time</span></article>
      </section>
      <button type="button">Submit a hand</button>
    </main>
  )
}

export default App
