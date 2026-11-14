import { lazy, Suspense, useState } from 'react'
import HomePage from './components/HomePage'
import { CollaborationClient } from './network/CollaborationClient'
import './App.css'

const RoomPage = lazy(() => import('./components/RoomPage'))

export default function App() {
  const [session, setSession] = useState(null)
  const [username, setUsername] = useState('')

  async function enterRoom(name, roomId, mode) {
    const client = new CollaborationClient({
      url: import.meta.env.VITE_COLLABORATION_URL || 'ws://127.0.0.1:8080/collaboration',
      username: name,
      roomId,
      mode,
    })
    await client.connect()
    setUsername(name)
    setSession({ username: name, roomId, client })
    window.scrollTo(0, 0)
  }

  function leaveRoom() {
    session.client.close()
    setSession(null)
  }

  return session ? (
    <Suspense
      fallback={
        <div className="workspace-loading">
          <span className="loading-dot" /> Opening your workspace…
        </div>
      }
    >
      <RoomPage session={session} onLeave={leaveRoom} />
    </Suspense>
  ) : (
    <HomePage
      username={username}
      onUsernameChange={setUsername}
      onEnter={enterRoom}
    />
  )
}
