// Audible beacon for the in-person "ring" feature. When a ring is accepted both
// attendees' phones play a repeating warble (and vibrate, on mobile) so they can
// hear/feel their way to each other across a crowded room. Pure Web Audio — no
// asset files. The AudioContext is created lazily and resumed; on the sender's
// side the earlier "RING" tap counts as the user gesture browsers require, and
// on the recipient's side the "ACCEPT" tap does.

import { useEffect, useRef } from 'react'

export function useRingSound(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    if (!active || typeof window === 'undefined') return
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return

    const ctx: AudioContext = ctxRef.current ?? new AC()
    ctxRef.current = ctx
    void ctx.resume?.()

    // One "brring": warble between two tones for ~1.2s with a soft envelope.
    const playBurst = () => {
      const now = ctx.currentTime
      const gain = ctx.createGain()
      gain.connect(ctx.destination)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.03)
      gain.gain.setValueAtTime(0.16, now + 1.0)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)

      const osc = ctx.createOscillator()
      osc.type = 'sine'
      for (let t = 0; t < 1.2; t += 0.05) {
        osc.frequency.setValueAtTime(Math.floor(t / 0.05) % 2 ? 480 : 440, now + t)
      }
      osc.connect(gain)
      osc.start(now)
      osc.stop(now + 1.25)

      navigator.vibrate?.([400, 150, 400])
    }

    playBurst()
    const id = window.setInterval(playBurst, 2000)
    return () => {
      window.clearInterval(id)
      navigator.vibrate?.(0)
    }
  }, [active])

  // Tear down the context entirely on unmount.
  useEffect(
    () => () => {
      void ctxRef.current?.close?.()
      ctxRef.current = null
    },
    []
  )
}
