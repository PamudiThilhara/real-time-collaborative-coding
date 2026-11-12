import { useEffect, useRef } from 'react'
import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Terminal,
  Trash2,
} from 'lucide-react'

export default function TerminalPanel({
  messages,
  onClear,
  collapsed,
  onToggle,
}) {
  const outputRef = useRef(null)
  useEffect(() => {
    if (outputRef.current)
      outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [messages, collapsed])

  return (
    <section
      className={`terminal-panel${collapsed ? ' collapsed' : ''}`}
      aria-label="Terminal output"
    >
      <div className="terminal-toolbar">
        <div className="terminal-tab">
          <Terminal size={15} /> TERMINAL <span className="terminal-tab-dot" />
        </div>
        <span className="terminal-environment">Output</span>
        <div className="terminal-actions">
          <button
            className="icon-button"
            onClick={onClear}
            title="Clear terminal"
            aria-label="Clear terminal"
          >
            <Trash2 size={15} />
          </button>
          <button
            className="icon-button"
            onClick={onToggle}
            title={collapsed ? 'Expand terminal' : 'Collapse terminal'}
            aria-label={collapsed ? 'Expand terminal' : 'Collapse terminal'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div
          ref={outputRef}
          className="terminal-content"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {messages.length === 0 ? (
            <p className="terminal-muted">
              Terminal cleared. Ready for your next idea.
            </p>
          ) : (
            messages.map((message, index) => (
              <div className={`terminal-message ${message.type}`} key={index}>
                {message.type === 'welcome' ? (
                  <CircleCheck size={14} />
                ) : (
                  <span className="terminal-prompt">❯</span>
                )}
                <div>
                  <p>{message.text}</p>
                  {message.detail && (
                    <p className="terminal-muted">{message.detail}</p>
                  )}
                </div>
                {message.time && <time>{message.time}</time>}
              </div>
            ))
          )}
          <div className="terminal-ready">
            <span>❯</span>
            <span className="terminal-cursor" />
          </div>
        </div>
      )}
    </section>
  )
}
