import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Lobby } from '@/components/landing/Lobby'
import { Onboarding } from '@/components/landing/Onboarding'
import { useOverlapHome } from '@/lib/overlap/backend'

export const Route = createFileRoute('/')({
  component: Landing,
})

function Landing() {
  const { connected, myProfile } = useOverlapHome()
  const [editing, setEditing] = useState(false)

  if (!connected) {
    return (
      <div className="relative z-10 grid min-h-screen place-items-center p-4">
        <div className="wood-panel rise px-8 py-6">
          <span className="font-pixel text-lg text-wood">
            Entering the world…
          </span>
        </div>
      </div>
    )
  }

  return !myProfile || editing ? (
    <Onboarding existing={myProfile} onDone={() => setEditing(false)} />
  ) : (
    <Lobby onEdit={() => setEditing(true)} />
  )
}
