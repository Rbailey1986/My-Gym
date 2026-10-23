import { describe, expect, it } from 'vitest'
import { finishRecap, previousSameRoutine } from './finish-recap.js'

// A session of one exercise: `sets` done sets of w × r, timed from `start` for `min` minutes.
const wk = (d, ids, { w = 60, r = 8, sets = 3, start = 0, min = 45 } = {}) => ({
  d, routineIds: ids, start: Date.parse(d + 'T18:00:00Z') + start, end: Date.parse(d + 'T18:00:00Z') + start + min * 60000,
  entries: [{ id: 'bench', sets: Array.from({ length: sets }, () => ({ w, r, done: true })) }],
})

describe('previousSameRoutine', () => {
  it('finds the latest earlier session of the same routine', () => {
    const a = wk('2026-10-01', ['push']), b = wk('2026-10-08', ['push']), c = wk('2026-10-10', ['pull'])
    const now = wk('2026-10-15', ['push'])
    expect(previousSameRoutine([a, b, c, now], now)).toBe(b)
  })

  it('matches a combined day only against the same combination, in any order', () => {
    const solo = wk('2026-10-08', ['push']), combo = wk('2026-10-01', ['pull', 'push'])
    const now = wk('2026-10-15', ['push', 'pull'])
    expect(previousSameRoutine([combo, solo, now], now)).toBe(combo)
  })

  it('reads the legacy single routineId too', () => {
    const old = { ...wk('2026-10-01', undefined), routineId: 'push' }
    const now = wk('2026-10-15', ['push'])
    expect(previousSameRoutine([old, now], now)).toBe(old)
  })

  it('never compares with itself or a later session, nor a freestyle one', () => {
    const now = wk('2026-10-15', ['push']), later = wk('2026-10-20', ['push'])
    expect(previousSameRoutine([now, later], now)).toBe(null)
    const free = wk('2026-10-15', [])
    expect(previousSameRoutine([wk('2026-10-01', []), free], free)).toBe(null)
  })

  it('orders two sessions on one day by start time', () => {
    const am = wk('2026-10-15', ['push'], { start: 0 }), pm = wk('2026-10-15', ['push'], { start: 6 * 3600000 })
    expect(previousSameRoutine([am, pm], pm)).toBe(am)
    expect(previousSameRoutine([am, pm], am)).toBe(null)
  })
})

describe('finishRecap', () => {
  it('gives the volume change and its share, and the time change', () => {
    const prev = wk('2026-10-08', ['push'], { w: 60, min: 50 })
    const now = wk('2026-10-15', ['push'], { w: 66, min: 45 })
    const r = finishRecap([prev, now], now)
    expect(r.prev).toBe(prev)
    expect(r.volDelta).toBe(3 * 8 * 6)
    expect(r.volPct).toBeCloseTo(0.1, 5)
    expect(r.durDelta).toBe(-5 * 60000)
  })

  it('has no share when the earlier session moved no load', () => {
    const prev = wk('2026-10-08', ['push'], { w: 0 }), now = wk('2026-10-15', ['push'], { w: 0 })
    expect(finishRecap([prev, now], now).volPct).toBe(null)
  })

  it('is null with nothing to compare', () => {
    const now = wk('2026-10-15', ['push'])
    expect(finishRecap([now], now)).toBe(null)
  })
})
