import { useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronRight,
  Code2,
  Command,
  Hash,
  Layers3,
  Plus,
  Radio,
  Terminal,
  UserRound,
  Users,
  Zap,
} from 'lucide-react'
import Brand from './Brand'

function CodePreview() {
  const lines = [
    <span className="syntax-comment">// Great things are built together.</span>,
    <>
      <span className="syntax-purple">const</span>{' '}
      <span className="syntax-blue">crew</span> = [
      <span className="syntax-green">'you'</span>,{' '}
      <span className="syntax-green">'your team'</span>];
    </>,
    <>&nbsp;</>,
    <>
      <span className="syntax-purple">function</span>{' '}
      <span className="syntax-yellow">buildSomethingGreat</span>() {'{'}
    </>,
    <>
      &nbsp;&nbsp;<span className="syntax-purple">return</span> crew.
      <span className="syntax-yellow">collaborate</span>({'{'}
    </>,
    <>
      &nbsp;&nbsp;&nbsp;&nbsp;ideas:{' '}
      <span className="syntax-green">'limitless'</span>,
    </>,
    <>
      &nbsp;&nbsp;&nbsp;&nbsp;possibilities:{' '}
      <span className="syntax-blue">Infinity</span>,
    </>,
    <>&nbsp;&nbsp;{'}'});</>,
    <>
      {'}'}
      <span className="preview-cursor" />
    </>,
  ]
  return (
    <div
      className="code-preview"
      aria-label="An example of a shared coding workspace"
    >
      <div className="preview-titlebar">
        <div className="window-dots">
          <i />
          <i />
          <i />
        </div>
        <span>
          <span className="file-js">JS</span> something-great.js
        </span>
        <span className="preview-live">
          <span className="status-dot" /> Let's build
        </span>
      </div>
      <div className="preview-code" aria-hidden="true">
        {lines.map((line, i) => (
          <div className="preview-line" key={i}>
            <span className="line-number">{i + 1}</span>
            <code>{line}</code>
          </div>
        ))}
      </div>
      <div className="preview-footer">
        <div className="avatar-stack">
          <span>A</span>
          <span>J</span>
          <span>Y</span>
        </div>
        <span>A little teamwork. A lot of possibility.</span>
        <span className="preview-online">
          <span className="status-dot" /> 3 online
        </span>
      </div>
    </div>
  )
}

export default function HomePage({ username, onUsernameChange, onEnter }) {
  const [roomId, setRoomId] = useState('')
  const [error, setError] = useState('')
  const usernameRef = useRef(null)
  const roomIdRef = useRef(null)

  function startSession(event) {
    event.preventDefault()
    const name = username.trim()
    if (!name) {
      setError('Enter your name so your crew knows it’s you.')
      usernameRef.current.focus()
      return
    }
    const joining = event.nativeEvent.submitter?.value === 'join'
    if (joining && !roomId.trim()) {
      setError('Enter a room ID to join your crew.')
      roomIdRef.current.focus()
      return
    }
    const id = joining
      ? roomId.trim()
      : `crew-${crypto.randomUUID().slice(0, 8)}`
    onEnter(name, id)
  }

  return (
    <div className="home-page">
      <header className="home-header page-width">
        <a href="#" className="brand-link" aria-label="CodeCrew home">
          <Brand />
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <span className="nav-divider" />
          <span className="local-badge">
            <span className="status-dot" /> Your space to build
          </span>
        </nav>
        <button
          className="button button-small button-ghost"
          onClick={() => onEnter(username.trim() || 'Alex', 'crew-demo')}
        >
          <Code2 size={15} /> Explore the editor <ArrowRight size={14} />
        </button>
      </header>

      <main className="page-width">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-content">
            <div className="eyebrow">
              <span className="status-dot" /> DIFFERENT PLACES. SAME WORKSPACE.
            </div>
            <h1 id="hero-title">
              Code Without Boundaries.
              <br />
              <span>Build Without Limits.</span>
            </h1>
            <p className="hero-description">
              Write, collaborate, and execute code together in real time. One
              shared workspace, endless possibilities.
            </p>
            <div className="hero-perks">
              <span>
                <Users size={15} /> Built for collaboration
              </span>
              <span>
                <Zap size={15} /> Zero setup
              </span>
              <span>
                <Code2 size={15} /> Just code
              </span>
            </div>
            <CodePreview />
          </div>

          <div className="session-card" id="start">
            <div className="session-card-icon">
              <Command size={24} />
            </div>
            <h2>Pull up a chair.</h2>
            <p>Your next coding session starts here.</p>
            <form onSubmit={startSession} noValidate>
              <label htmlFor="username">What should we call you?</label>
              <div className="input-wrap">
                <UserRound size={17} />
                <input
                  ref={usernameRef}
                  id="username"
                  autoComplete="nickname"
                  placeholder="Enter your name"
                  value={username}
                  maxLength={30}
                  aria-invalid={!!error && !username.trim()}
                  onChange={(e) => {
                    onUsernameChange(e.target.value)
                    setError('')
                  }}
                />
              </div>
              <button
                className="button button-primary create-button"
                type="submit"
                value="create"
              >
                <Plus size={18} /> Create a room <ArrowRight size={17} />
              </button>
              <div className="form-divider">
                <span />
                or join your crew
                <span />
              </div>
              <label htmlFor="room-id">Already have a room?</label>
              <div className="input-wrap">
                <Hash size={17} />
                <input
                  ref={roomIdRef}
                  id="room-id"
                  placeholder="Paste your room ID"
                  autoComplete="off"
                  spellCheck={false}
                  value={roomId}
                  maxLength={80}
                  aria-invalid={!!error && !!username.trim() && !roomId.trim()}
                  onChange={(e) => {
                    setRoomId(e.target.value)
                    setError('')
                  }}
                />
              </div>
              <button
                className="button button-secondary join-button"
                type="submit"
                value="join"
              >
                Join room <ArrowRight size={17} />
              </button>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </form>
            <div className="session-card-note">
              <Check size={14} /> No sign-up. No downloads. Just you and your
              ideas.
            </div>
          </div>
        </section>

        <section
          className="how-section"
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div className="how-heading">
            <span className="section-kicker">LESS FRICTION. MORE FLOW.</span>
            <h2 id="how-title">From “what if” to “look at this.”</h2>
            <a href="#start">
              Let's get started <ArrowDown size={14} />
            </a>
          </div>
          <div className="steps">
            <article className="step">
              <span className="step-icon">
                <Plus size={20} />
              </span>
              <div>
                <span className="step-number">01 / MAKE SPACE</span>
                <h3>One room. Endless ideas.</h3>
                <p>
                  Create a room in a click. Your workspace is ready when you
                  are.
                </p>
              </div>
            </article>
            <article className="step">
              <span className="step-icon">
                <Users size={20} />
              </span>
              <div>
                <span className="step-number">02 / BRING YOUR PEOPLE</span>
                <h3>Better with your crew.</h3>
                <p>
                  Share your room ID and bring everyone into the same space.
                </p>
              </div>
            </article>
            <article className="step">
              <span className="step-icon">
                <Terminal size={20} />
              </span>
              <div>
                <span className="step-number">03 / FIND YOUR FLOW</span>
                <h3>Less setup. More building.</h3>
                <p>
                  A familiar editor, your favorite language, and room to
                  experiment.
                </p>
              </div>
            </article>
          </div>
        </section>
        <div className="demo-notice">
          <Radio size={14} />
          <span>
            You're exploring a frontend preview. Rooms and collaborators are
            simulated.
          </span>
          <span className="demo-notice-tag">LOCAL DEMO</span>
        </div>
      </main>

      <footer className="home-footer page-width">
        <span>Made for minds that build together.</span>
        <span>
          <Layers3 size={13} /> Python & JavaScript{' '}
          <span className="footer-dot">·</span> Built with possibility{' '}
          <ChevronRight size={13} />
        </span>
      </footer>
    </div>
  )
}
