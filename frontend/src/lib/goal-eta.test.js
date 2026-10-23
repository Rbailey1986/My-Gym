import { describe, expect, it } from 'vitest'
import { goalProgress, trendPerDay } from './goal-eta.js'

// A weigh-in every `step` days ending on `today`, losing `perDay` a day from `from`.
const series = (today, n, step, from, perDay) => {
  const end = Date.parse(today + 'T00:00:00Z')
  return Array.from({ length: n }, (_, i) => {
    const back = (n - 1 - i) * step
    return { d: new Date(end - back * 86400000).toISOString().slice(0, 10), w: +(from + perDay * i * step).toFixed(2) }
  })
}

describe('trendPerDay', () => {
  it('fits the slope of a steady loss', () => {
    expect(trendPerDay(series('2026-10-24', 8, 3, 80, -0.1), '2026-10-24')).toBeCloseTo(-0.1, 5)
  })

  it('needs three weigh-ins spread over at least a week', () => {
    expect(trendPerDay(series('2026-10-24', 2, 5, 80, -0.1), '2026-10-24')).toBe(null)
    expect(trendPerDay(series('2026-10-24', 5, 1, 80, -0.1), '2026-10-24')).toBe(null)
  })

  it('ignores weigh-ins older than the window and after today', () => {
    const bw = [{ d: '2026-01-01', w: 120 }, ...series('2026-10-24', 8, 3, 80, -0.1), { d: '2026-10-30', w: 50 }]
    expect(trendPerDay(bw, '2026-10-24')).toBeCloseTo(-0.1, 5)
  })
})

describe('goalProgress', () => {
  it('is null without a goal or a weigh-in', () => {
    expect(goalProgress({ bodyweight: series('2026-10-24', 8, 3, 80, -0.1) }, '2026-10-24')).toBe(null)
    expect(goalProgress({ bodyweight: [], targetW: 70 }, '2026-10-24')).toBe(null)
  })

  it('projects the date the current pace reaches the goal', () => {
    // 80 → 77.9 over 21 days at -0.1/day; 2.9 kg left to 75 is 29 days out.
    const g = goalProgress({ bodyweight: series('2026-10-24', 8, 3, 80, -0.1), targetW: 75 }, '2026-10-24')
    expect(g.status).toBe('on-track')
    expect(g.current).toBe(77.9)
    expect(g.ratePerWeek).toBeCloseTo(-0.7, 5)
    expect(g.eta).toBe('2026-11-22')
    expect(g.pct).toBeCloseTo(2.1 / 5, 5)
  })

  it('works the same way for a gaining goal', () => {
    const g = goalProgress({ bodyweight: series('2026-10-24', 8, 3, 70, 0.05), targetW: 72 }, '2026-10-24')
    expect(g.status).toBe('on-track')
    expect(g.eta > '2026-10-24').toBe(true)
  })

  it('says when the trend runs away from the goal, and gives no date', () => {
    const g = goalProgress({ bodyweight: series('2026-10-24', 8, 3, 80, 0.1), targetW: 75 }, '2026-10-24')
    expect(g.status).toBe('away')
    expect(g.eta).toBe(null)
    expect(g.pct).toBe(0)
  })

  it('calls a still scale flat', () => {
    expect(goalProgress({ bodyweight: series('2026-10-24', 8, 3, 80, 0), targetW: 75 }, '2026-10-24').status).toBe('flat')
  })

  it('is unknown with too few recent weigh-ins', () => {
    expect(goalProgress({ bodyweight: [{ d: '2026-10-20', w: 80 }], targetW: 75 }, '2026-10-24').status).toBe('unknown')
  })

  it('counts a goal within 50 g as reached', () => {
    const g = goalProgress({ bodyweight: [{ d: '2026-09-01', w: 80 }, { d: '2026-10-24', w: 75.03 }], targetW: 75 }, '2026-10-24')
    expect(g.status).toBe('reached')
    expect(g.pct).toBe(1)
  })

  it('leaves out a date beyond three years', () => {
    const g = goalProgress({ bodyweight: series('2026-10-24', 8, 3, 80, -0.01), targetW: 60 }, '2026-10-24')
    expect(g.status).toBe('on-track')
    expect(g.eta).toBe(null)
  })

  it('gives the pace a target date needs, and none for a date gone by', () => {
    const bw = series('2026-10-24', 8, 3, 80, -0.1)
    const g = goalProgress({ bodyweight: bw, targetW: 75, targetDate: '2026-12-05' }, '2026-10-24')
    expect(g.by).toBe('2026-12-05')
    expect(g.neededPerWeek).toBeCloseTo(-2.9 / 6, 5)
    const past = goalProgress({ bodyweight: bw, targetW: 75, targetDate: '2026-10-01' }, '2026-10-24')
    expect(past.by).toBe(null)
    expect(past.neededPerWeek).toBe(null)
  })
})
