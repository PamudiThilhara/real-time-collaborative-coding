import { lazy, Suspense, useState } from 'react'
import HomePage from './components/HomePage'
import './App.css'

const RoomPage = lazy(() => import('./components/RoomPage'))

export default function App() {
  const [session, setSession] = useState(null)
  const [username, setUsername] = useState('')

  function enterRoom(name, roomId) {
    setUsername(name)
    setSession({ username: name, roomId })
    window.scrollTo(0, 0)
  }

  return session ? (
    <Suspense
      fallback={
        <div className="workspace-loading">
          <span className="loading-dot" /> Opening your workspace…
        </div>
      }
    >
      <RoomPage session={session} onLeave={() => setSession(null)} />
    </Suspense>
  ) : (
    <HomePage
      username={username}
      onUsernameChange={setUsername}
      onEnter={enterRoom}
    />
  )
}
