// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import Elapsed from './Elapsed.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('Elapsed workout clock', () => {
  let host, root
  beforeEach(() => {
    vi.useFakeTimers()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.render(null))
    host.remove()
    vi.useRealTimers()
  })

  it('ticks running seconds since start', () => {
    const start = Date.now()
    act(() => root.render(<Elapsed start={start} />))
    expect(host.textContent).toBe('0:00')

    act(() => vi.advanceTimersByTime(65000))
    expect(host.textContent).toBe('1:05')
  })

  it('freezes at pausedAt when paused and does not tick further', () => {
    const start = Date.now()
    const pausedAt = start + 45000
    act(() => root.render(<Elapsed start={start} pausedAt={pausedAt} />))
    expect(host.textContent).toBe('0:45')

    act(() => vi.advanceTimersByTime(30000))
    // Still frozen at 45 seconds
    expect(host.textContent).toBe('0:45')
  })
})
