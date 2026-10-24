import { useEffect, useState } from 'react'

// A session's running time, "12:34" since `start`. Its own little component so the only thing
// that re-renders every second is this text: the workout header and the tab bar's Resume button
// both show it. Paused time is frozen at pausedAt.
export default function Elapsed({ start, pausedAt }) {
  const [t, setT] = useState('0:00')
  useEffect(() => {
    const tick = () => {
      const now = pausedAt || Date.now()
      const s = Math.max(0, Math.floor((now - start) / 1000))
      setT(Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'))
    }
    tick()
    if (pausedAt) return
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [start, pausedAt])
  return <span>{t}</span>
}
