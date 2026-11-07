import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FolderOpen,
  Info,
  Users,
  X,
} from 'lucide-react'
import { languageDetails } from '../data/editor'

export default function UserSidebar({
  username,
  language,
  onLanguageChange,
  open,
  onClose,
}) {
  const users = [
    {
      name: username,
      initials: username.slice(0, 2).toUpperCase(),
      color: 'mint',
      detail: 'That’s you',
      you: true,
    },
    {
      name: 'Alex Morgan',
      initials: 'AM',
      color: 'purple',
      detail: 'Demo collaborator',
    },
    {
      name: 'Jamie Chen',
      initials: 'JC',
      color: 'peach',
      detail: 'Demo collaborator',
    },
  ]
  return (
    <>
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Close sidebar"
          onClick={onClose}
        />
      )}
      <aside
        className={`room-sidebar${open ? ' is-open' : ''}`}
        aria-label="Workspace sidebar"
      >
        <div className="sidebar-heading">
          <span>WORKSPACE</span>
          <button
            className="icon-button mobile-close"
            aria-label="Close sidebar"
            onClick={onClose}
          >
            <X size={16} />
          </button>
          <span className="workspace-label">LOCAL</span>
        </div>
        <div className="sidebar-section-title">
          <Users size={15} />
          <h2>Your crew</h2>
          <span className="count-badge">3</span>
        </div>
        <div className="users-list">
          {users.map((user, i) => (
            <div className="user-item" key={i}>
              <span className={`user-avatar ${user.color}`}>
                {user.initials}
                <i />
              </span>
              <div>
                <span className="user-name">
                  {user.name}
                  {user.you && <small>you</small>}
                </span>
                <span className="user-detail">{user.detail}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="sidebar-divider" />
        <div className="sidebar-section-title">
          <FolderOpen size={15} />
          <h2>Explorer</h2>
          <ChevronDown size={13} />
        </div>
        <div className="folder-row">
          <ChevronDown size={13} />
          <span>YOUR WORKSPACE</span>
        </div>
        <div className="file-list">
          {Object.entries(languageDetails).map(([key, file]) => (
            <button
              className={`file-item${language === key ? ' selected' : ''}`}
              key={key}
              onClick={() => {
                onLanguageChange(key)
                onClose()
              }}
            >
              <FileCode2 size={15} className={key} />
              {file.filename}
              {language === key && <span className="file-active-dot" />}
            </button>
          ))}
        </div>
        <div className="sidebar-tip">
          <div>
            <Info size={15} />
            <strong>A space to experiment.</strong>
          </div>
          <p>
            Switch languages, try an idea, and make it your own. Your drafts
            stay here while you work.
          </p>
          <span>
            Every great project starts somewhere. <ChevronRight size={12} />
          </span>
        </div>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Local preview <span>v1.0</span>
        </div>
      </aside>
    </>
  )
}
