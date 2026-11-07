import { useCallback, useEffect, useRef, useState } from 'react'
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
import { initialCode, languageDetails } from '../data/editor'

const welcomeMessage = {
  type: 'welcome',
  text: 'Your workspace is ready. Let’s build something.',
  detail:
    'Write some code, pick your language, and hit Run code to try the preview.',
}

export default function RoomPage({ session, onLeave }) {
  const [language, setLanguage] = useState('python')
  const [drafts, setDrafts] = useState({ ...initialCode })
  const [messages, setMessages] = useState([welcomeMessage])
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [terminalCollapsed, setTerminalCollapsed] = useState(false)
  const [cursor, setCursor] = useState({ lineNumber: 1, column: 1 })
  const languageRef = useRef(language)
  const copyTimer = useRef(null)
  const roomIdRef = useRef(null)
  languageRef.current = language

  useEffect(() => () => clearTimeout(copyTimer.current), [])
  useEffect(() => {
    if (!sidebarOpen) return
    function closeOnEscape(e) {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [sidebarOpen])

  const runCode = useCallback(() => {
    const currentLanguage = languageDetails[languageRef.current].label
    setMessages((previous) => [
      ...previous,
      {
        type: 'info',
        text: `${currentLanguage} execution is not connected yet.`,
        detail:
          'This is a frontend preview. Your code has not been executed. Connect an execution backend to see results here.',
        time: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    ])
    setTerminalCollapsed(false)
  }, [])

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
          <span className="room-local-status">
            <span className="status-dot" /> Local session
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
          username={session.username}
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
              <Radio size={13} /> FRONTEND PREVIEW
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
                title="Run code preview (Ctrl+Enter or ⌘+Enter)"
              >
                <Play size={14} fill="currentColor" />
                <span>Run code</span>
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
              onChange={(value) =>
                setDrafts((previous) => ({ ...previous, [language]: value }))
              }
              onCursorChange={setCursor}
              onRun={runCode}
            />
          </div>
          <TerminalPanel
            messages={messages}
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
            <Info size={12} /> Demo workspace
          </span>
        </div>
        <div>
          <span className="cursor-position">
            Ln {cursor.lineNumber}, Col {cursor.column}
          </span>
          <span className="encoding">UTF-8</span>
          <span>{file.version}</span>
          <span className="status-users">
            <Users size={12} /> 3
          </span>
          <span className="status-local">
            <span className="status-dot" /> Local
          </span>
        </div>
      </footer>
    </div>
  )
}
