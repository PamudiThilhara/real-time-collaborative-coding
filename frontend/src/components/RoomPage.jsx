import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Code2,
  FileCode2,
  GitBranch,
  Info,
  LogOut,
  PanelLeft,
  Play,
  Radio,
  Users,
  X,
} from 'lucide-react'
import Brand from './Brand'
import CodeEditor from './CodeEditor'
import TerminalPanel from './TerminalPanel'
import UserSidebar from './UserSidebar'
import { languageDetails } from '../data/editor'
import { executeCode, EXECUTION_URL } from '../network/execution'

const welcomeMessage = {
  type: 'welcome',
  text: 'Your workspace is ready. Let’s build something.',
  detail:
    'Code and room membership synchronize live. Run Python or JavaScript in the local Docker execution service.',
}

export default function RoomPage({ session, onLeave }) {
  const [language, setLanguage] = useState('python')
  const { client } = session
  const { drafts, participants, clientId, status, error, recovery } = useSyncExternalStore(client.subscribe, client.getSnapshot)
  const [messages, setMessages] = useState([welcomeMessage])
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [terminalCollapsed, setTerminalCollapsed] = useState(false)
  const [cursor, setCursor] = useState({ lineNumber: 1, column: 1 })
  const [running, setRunning] = useState(false)
  const executionRef = useRef(null)
  const languageRef = useRef(language)
  const copyTimer = useRef(null)
  const roomIdRef = useRef(null)
  useEffect(() => { languageRef.current = language }, [language])

  useEffect(() => () => clearTimeout(copyTimer.current), [])
  useEffect(() => () => {
    const pending = executionRef.current
    executionRef.current = null
    pending?.abort()
  }, [])
  useEffect(() => {
    if (!sidebarOpen) return
    function closeOnEscape(e) {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [sidebarOpen])

  const runCode = useCallback(async () => {
    // The ref guards both rapid clicks and Monaco's cached keyboard action.
    if (executionRef.current) return
    const selectedLanguage = languageRef.current
    const code = client.getSnapshot().drafts[selectedLanguage]
    const label = languageDetails[selectedLanguage].label
    const controller = new AbortController()
    executionRef.current = controller
    setRunning(true)
    setTerminalCollapsed(false)
    const id = crypto.randomUUID()
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    setMessages((previous) => [...previous, { id, type: 'info', text: `Running ${label}…`, time }])
    let requestTimedOut = false
    // Allow time for the server's 12-second Docker limit and container cleanup.
    const deadline = setTimeout(() => {
      requestTimedOut = true
      controller.abort()
    }, 25000)
    function finish(message) {
      if (executionRef.current !== controller) return
      const completed = { id, time, ...message }
      setMessages((previous) => previous.some((item) => item.id === id)
        ? previous.map((item) => item.id === id ? completed : item)
        : [...previous, completed])
    }
    try {
      const result = await executeCode({ language: selectedLanguage, code, signal: controller.signal })
      finish({
        type: result.timedOut || result.exitCode !== 0 ? 'error' : 'success',
        text: `${label} execution ${result.timedOut ? 'timed out' : result.exitCode === 0 ? 'finished' : 'failed'}.`,
        detail: `Exit code: ${result.exitCode}${result.timedOut ? ' · Execution exceeded the 12-second limit.' : ''}`,
        output: result.stdout || '(no output)',
      })
    } catch (error) {
      finish({
        type: 'error',
        text: requestTimedOut ? 'Execution request timed out.' : 'Execution failed.',
        detail: requestTimedOut
          ? 'No result arrived within 25 seconds. The service may still be cleaning up the Docker container; check it before retrying.'
          : error instanceof TypeError
            ? `Cannot reach ${EXECUTION_URL}. Start the Java execution service and Docker. Open http://localhost:5173, or start the service with EXECUTION_ORIGIN matching ${window.location.origin}.`
            : error.message,
      })
    } finally {
      clearTimeout(deadline)
      if (executionRef.current === controller) {
        executionRef.current = null
        setRunning(false)
      }
    }
  }, [client])

  async function copyRoomId() {
    clearTimeout(copyTimer.current)
    try {
      await navigator.clipboard.writeText(session.roomId)
      setCopied(true)
      setCopyError(false)
      copyTimer.current = setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopyError(true)
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(roomIdRef.current)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }

  const file = languageDetails[language]
  return (
    <div className="room-page">
      <header className="room-header">
        <button
          className="brand-link home-brand-button"
          onClick={onLeave}
          aria-label="Back to CodeCrew home"
        >
          <Brand compact />
        </button>
        <div className="header-separator" />
        <div className="room-identity">
          <span className="room-label">ROOM</span>
          <span className="room-id" ref={roomIdRef} title={session.roomId}>
            {session.roomId}
          </span>
          <button
            className={`copy-button${copied ? ' copied' : ''}`}
            onClick={copyRoomId}
            title="Copy room ID"
            aria-label={copied ? 'Room ID copied' : 'Copy room ID'}
          >
            {copied ? <Check size={13} /> : <Clipboard size={13} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
        <div className="room-header-right">
          <span className="room-local-status" data-status={status} role="status">
            <span className="status-dot" /> {status === 'connected' ? 'Connected' : status}
          </span>
          <button
            className="button leave-button"
            onClick={onLeave}
            aria-label="Leave room"
          >
            <LogOut size={15} />
            <span>Leave room</span>
          </button>
        </div>
      </header>
      {error && (
        <div className="copy-notice connection-notice" role="alert">
          <span>{error}</span>
          {status === 'disconnected' && <button className="button button-small button-ghost" onClick={client.retry}>Retry connection</button>}
        </div>
      )}
      {Object.entries(recovery).map(([key, code]) => (
        <details className="draft-recovery" key={key}>
          <summary>Saved {languageDetails[key].label} draft — review before restoring</summary>
          <textarea aria-label={`Saved ${languageDetails[key].label} draft`} value={code} readOnly />
          <button className="button button-small button-ghost" disabled={status !== 'connected'} onClick={() => client.recover(key)}>Restore {languageDetails[key].label} draft</button>
          <button className="button button-small button-ghost" onClick={() => client.dismissRecovery(key)}>Discard {languageDetails[key].label} draft</button>
        </details>
      ))}
      {copyError && (
        <div className="copy-notice" role="status">
          Room ID selected. Press Ctrl+C or copy the selected text to share it.
          <button
            className="icon-button"
            onClick={() => setCopyError(false)}
            aria-label="Dismiss copy notice"
          >
            <X size={15} />
          </button>
        </div>
      )}
      <div className="room-body">
        <UserSidebar
          participants={participants}
          clientId={clientId}
          status={status}
          language={language}
          onLanguageChange={setLanguage}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="workspace" aria-label="Code editor workspace">
          <div className="workspace-toolbar">
            <div className="workspace-path">
              <button
                className="icon-button sidebar-toggle"
                aria-label="Toggle workspace sidebar"
                aria-expanded={sidebarOpen}
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <PanelLeft size={18} />
              </button>
              <Code2 size={16} />
              <span>Workspace</span>
              <ChevronRight size={13} />
              <span className="workspace-filename">{file.filename}</span>
            </div>
            <span className="workspace-demo-badge">
              <Radio size={13} /> LIVE COLLABORATION
            </span>
          </div>
          <div className="editor-actionbar">
            <div className="editor-file-tab">
              <FileCode2 size={16} className={language} />
              <span>{file.filename}</span>
              <span className="tab-dot" />
            </div>
            <div className="editor-actions">
              <div className="language-select">
                <span className={`language-symbol ${language}`}>
                  {file.symbol}
                </span>
                <select
                  aria-label="Editor language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                </select>
                <ChevronDown size={13} />
              </div>
              <button
                className="button run-button"
                onClick={runCode}
                disabled={running}
                aria-busy={running}
                title="Run code (Ctrl+Enter or ⌘+Enter)"
              >
                <Play size={14} fill="currentColor" />
                <span>{running ? 'Running…' : 'Run code'}</span>
              </button>
            </div>
          </div>
          <div className="editor-breadcrumb">
            <FileCode2 size={12} className={language} />
            <span>{file.filename}</span>
            <ChevronRight size={11} />
            <span className="breadcrumb-language">{file.label}</span>
            <span className="editor-shortcut">Ctrl / ⌘ + Enter to run</span>
          </div>
          <div className="editor-container">
            <CodeEditor
              language={language}
              value={drafts[language]}
              onChange={(value) => client.edit(language, value)}
              readOnly={status !== 'connected'}
              onCursorChange={setCursor}
              onRun={runCode}
            />
          </div>
          <TerminalPanel
            messages={messages}
            running={running}
            onClear={() => setMessages([])}
            collapsed={terminalCollapsed}
            onToggle={() => setTerminalCollapsed(!terminalCollapsed)}
          />
        </main>
      </div>
      <footer className="room-statusbar">
        <div>
          <span>
            <GitBranch size={12} /> main
          </span>
          <span className="status-demo">
            <Info size={12} /> Shared workspace
          </span>
        </div>
        <div>
          <span className="cursor-position">
            Ln {cursor.lineNumber}, Col {cursor.column}
          </span>
          <span className="encoding">UTF-8</span>
          <span>{file.version}</span>
          <span className="status-users">
            <Users size={12} /> {participants.length}
          </span>
          <span className="status-local">
            <span className="status-dot" /> {status === 'connected' ? 'Live' : 'Offline'}
          </span>
        </div>
      </footer>
    </div>
  )
}
