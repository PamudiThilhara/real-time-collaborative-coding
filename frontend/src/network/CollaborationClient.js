const languages = ['python', 'javascript']
const MAX_CODE_LENGTH = 64 * 1024

// Owns the socket and acknowledged versions independently of React/Monaco renders.
export class CollaborationClient {
  constructor({ url, roomId, username, mode = 'join' }) {
    this.url = url
    this.roomId = roomId
    this.username = username
    this.mode = mode
    this.listeners = new Set()
    this.documents = {}
    this.inFlight = {}
    this.timers = {}
    this.attempts = 0
    this.hasJoined = false
    this.stopped = false
    this.state = {
      status: 'connecting', participants: [], clientId: null,
      drafts: { python: '', javascript: '' }, recovery: {}, error: '',
    }
  }

  subscribe = (listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.state

  publish(update) {
    this.state = { ...this.state, ...update }
    this.listeners.forEach((listener) => listener())
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.resolveInitial = resolve
      this.rejectInitial = reject
      this.open()
    })
  }

  open() {
    if (this.stopped) return
    this.publish({ status: this.hasJoined ? 'reconnecting' : 'connecting' })
    let socket
    try {
      const url = new URL(this.url)
      if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('Invalid WebSocket URL.')
      socket = new WebSocket(url)
    } catch {
      this.fail('Invalid collaboration URL. Configure VITE_COLLABORATION_URL with a ws:// or wss:// address.')
      return
    }
    this.socket = socket
    const current = () => !this.stopped && this.socket === socket
    // Covers TCP/handshake failures, a missing joined response, and stalled reconnects.
    this.connectionTimer = setTimeout(() => {
      if (current()) socket.close(4000, 'Connection timed out')
    }, 8000)
    socket.onopen = () => {
      if (!current()) return
      socket.send(JSON.stringify({
        type: this.hasJoined ? 'join' : this.mode,
        roomId: this.roomId, username: this.username,
      }))
    }
    socket.onmessage = ({ data }) => {
      if (!current()) return
      try {
        this.receive(JSON.parse(data))
      } catch {
        this.fail('The collaboration server sent an invalid response.')
      }
    }
    // Browsers hide network error details. onclose drives a single retry path.
    socket.onerror = () => {
      if (current()) this.publish({ error: 'Cannot reach the collaboration server.' })
    }
    socket.onclose = ({ code, reason }) => {
      if (!current()) return
      clearTimeout(this.connectionTimer)
      this.preservePending()
      this.publish({ participants: [] })
      if (code === 1008 || code === 1003) {
        this.fail(reason || 'The server rejected the connection.')
      } else if (!this.hasJoined) {
        this.fail('Cannot connect to the collaboration server. Check that Java is running and the WebSocket URL is correct.')
      } else if (this.attempts >= 5) {
        this.publish({ status: 'disconnected', error: 'Connection lost. Automatic retries finished. Retry or leave the room.' })
      } else {
        const delay = Math.min(500 * 2 ** this.attempts++, 8000)
        this.publish({ status: 'reconnecting', error: 'Connection lost. Reconnecting; editing is paused.' })
        this.retryTimer = setTimeout(() => this.open(), delay)
      }
    }
  }

  receive(event) {
    switch (event.type) {
      case 'joined': {
        if (event.roomId !== this.roomId || typeof event.clientId !== 'string') throw new Error('Invalid room')
        for (const language of languages) this.validateDocument(event.documents?.[language])
        this.documents = event.documents
        this.hasJoined = true
        this.attempts = 0
        clearTimeout(this.connectionTimer)
        this.publish({
          status: 'connected', error: '', clientId: event.clientId,
          participants: event.participants,
          drafts: Object.fromEntries(languages.map((key) => [key, event.documents[key].code])),
        })
        this.resolveInitial?.(this)
        this.resolveInitial = this.rejectInitial = null
        break
      }
      case 'presence':
        this.publish({ participants: event.participants })
        break
      case 'edited':
      case 'conflict': {
        const { language, document } = event
        if (!languages.includes(language)) throw new Error('Invalid language')
        this.validateDocument(document)
        const pending = this.inFlight[language]
        const ownAck = event.type === 'edited' && event.authorId === this.state.clientId && pending
        this.documents = { ...this.documents, [language]: document }
        if (ownAck) {
          clearTimeout(pending.timeout)
          delete this.inFlight[language]
          // Keep typing done since this edit was sent, then send it at the ACKed version.
          this.flush(language)
        } else if (event.type === 'conflict' || !pending) {
          if (this.state.drafts[language] !== document.code && (pending || this.timers[language])) {
            this.saveDraft(language)
            this.publish({ error: 'Another edit arrived first. Your local draft is saved below for recovery.' })
          }
          clearTimeout(pending?.timeout)
          clearTimeout(this.timers[language])
          delete this.inFlight[language]
          delete this.timers[language]
          this.publish({ drafts: { ...this.state.drafts, [language]: document.code } })
        }
        // A remote edit with our edit in flight is followed by a conflict response.
        break
      }
      case 'error':
        if (this.state.status !== 'connected' || event.code === 'join_required') {
          this.fail(event.message)
        } else {
          this.preservePending()
          this.publish({
            error: event.message,
            drafts: Object.fromEntries(languages.map((key) => [key, this.documents[key].code])),
          })
        }
        break
      default:
        throw new Error('Unknown server event')
    }
  }

  validateDocument(document) {
    if (typeof document?.code !== 'string' || !Number.isSafeInteger(document.version) || document.version < 0) {
      throw new Error('Invalid document')
    }
  }

  edit(language, code) {
    if (this.state.status !== 'connected' || !languages.includes(language)
        || code === this.state.drafts[language]) return
    this.publish({ drafts: { ...this.state.drafts, [language]: code } })
    if (code.length > MAX_CODE_LENGTH) {
      clearTimeout(this.timers[language])
      delete this.timers[language]
      this.saveDraft(language)
      this.publish({ error: 'The document exceeds the 65,536 character limit. Shorten it to synchronize.' })
      return
    }
    clearTimeout(this.timers[language])
    this.timers[language] = setTimeout(() => {
      delete this.timers[language]
      this.flush(language)
    }, 120)
  }

  flush(language) {
    if (this.state.status !== 'connected' || this.inFlight[language]) return
    const code = this.state.drafts[language]
    const document = this.documents[language]
    if (code === document.code || code.length > MAX_CODE_LENGTH) return
    if (this.socket.readyState !== WebSocket.OPEN) return
    clearTimeout(this.timers[language])
    delete this.timers[language]
    // A missing ACK is handled like a dropped connection; never blindly resend.
    this.inFlight[language] = {
      code,
      timeout: setTimeout(() => this.socket.close(4000, 'Edit acknowledgement timed out'), 8000),
    }
    try {
      this.socket.send(JSON.stringify({ type: 'edit', language, code, baseVersion: document.version }))
    } catch {
      this.socket.close(4000, 'Send failed')
    }
  }

  saveDraft(language) {
    this.publish({ recovery: { ...this.state.recovery, [language]: this.state.drafts[language] } })
  }

  preservePending() {
    for (const language of languages) {
      if (this.documents[language] && this.state.drafts[language] !== this.documents[language].code) this.saveDraft(language)
      clearTimeout(this.timers[language])
      clearTimeout(this.inFlight[language]?.timeout)
    }
    this.timers = {}
    this.inFlight = {}
  }

  recover(language) {
    if (this.state.status !== 'connected') return
    const code = this.state.recovery[language]
    if (code === undefined) return
    this.dismissRecovery(language)
    this.edit(language, code)
  }

  dismissRecovery(language) {
    const recovery = { ...this.state.recovery }
    delete recovery[language]
    this.publish({ recovery })
  }

  retry = () => {
    if (this.stopped || this.state.status !== 'disconnected') return
    this.attempts = 0
    this.open()
  }

  fail(message) {
    this.preservePending()
    this.publish({ status: 'error', error: message, participants: [] })
    this.rejectInitial?.(new Error(message))
    this.resolveInitial = this.rejectInitial = null
    this.close()
  }

  close() {
    this.stopped = true
    clearTimeout(this.connectionTimer)
    clearTimeout(this.retryTimer)
    this.preservePending()
    this.socket?.close()
  }
}
