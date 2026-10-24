import { describe, it, expect } from 'vitest'
import {
  cardioDistance,
  cardioPace,
  fmtPace,
  ruckingMetrics,
  intervalPlanTotalSec,
  c25kWorkout,
} from './cardio.js'

describe('Cardio, intervals, C25k and rucking (#132, #169, #177)', () => {
  it('calculates distance from minutes and speed', () => {
    expect(cardioDistance(30, 10)).toBe(5)
    expect(cardioDistance(45, 12)).toBe(9)
    expect(cardioDistance(0, 10)).toBe(0)
    expect(cardioDistance(30, 0)).toBe(0)
  })

  it('calculates pace and formats it', () => {
    expect(cardioPace(30, 5)).toBe(6) // 6 min/km
    expect(fmtPace(6, 'km')).toBe('6:00 /km')
    expect(fmtPace(5.5, 'km')).toBe('5:30 /km')
    expect(fmtPace(4.75, 'mi')).toBe('4:45 /mi')
    expect(fmtPace(0)).toBe('')
  })

  it('computes rucking metrics including pack weight and work product', () => {
    const res = ruckingMetrics({ dist: 5, min: 45, packWeight: 15, bodyWeight: 75 })
    expect(res.dist).toBe(5)
    expect(res.packWeight).toBe(15)
    expect(res.bodyWeight).toBe(75)
    expect(res.loadRatio).toBe(0.2) // 15 / 75
    expect(res.workProduct).toBe(450) // 5 * (75 + 15) = 450
    expect(res.pace).toBe(9) // 45 / 5 = 9 min/km
  })

  it('calculates interval plan total duration including warm-up and cool-down', () => {
    // 8 rounds of 30s work, 30s rest (7 rests between 8 rounds) = 240 + 210 = 450s.
    // + 300s warmup + 300s cooldown = 1050s.
    const total = intervalPlanTotalSec({
      rounds: 8,
      workSec: 30,
      restSec: 30,
      warmupSec: 300,
      cooldownSec: 300,
    })
    expect(total).toBe(1050)
  })

  it('provides C25K schedule prescriptions for all 9 weeks', () => {
    const w1d1 = c25kWorkout(1, 1)
    expect(w1d1.week).toBe(1)
    expect(w1d1.warmupMin).toBe(5)
    expect(w1d1.cooldownMin).toBe(5)
    expect(w1d1.intervals[0]).toEqual({ runSec: 60, walkSec: 90, reps: 8 })

    const w5d3 = c25kWorkout(5, 3)
    expect(w5d3.week).toBe(5)
    expect(w5d3.day).toBe(3)
    expect(w5d3.intervals[0].runSec).toBe(1200) // 20 min continuous

    const w9d3 = c25kWorkout(9, 3)
    expect(w9d3.intervals[0].runSec).toBe(1800) // 30 min (5K)
  })
})
