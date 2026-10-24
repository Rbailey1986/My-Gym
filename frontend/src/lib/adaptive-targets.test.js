import { describe, it, expect } from 'vitest'
import { adaptiveAdjustment } from './adaptive-targets.js'
import { targetsForDay } from './nutrition-targets.js'

function makeState({ bwSeries = [], kcalPerDay = 2000, loggedCount = 10, targetW = 75, sex = 'male', activity = 'moderate' } = {}) {
  const foodLog = {}
  // Populate last `loggedCount` days ending on 2026-04-20
  for (let i = 0; i < loggedCount; i++) {
    const d = new Date(Date.UTC(2026, 3, 20 - i)).toISOString().slice(0, 10)
    foodLog[d] = {
      breakfast: [{ id: `item-${i}`, name: 'Test meal', kcal: kcalPerDay, protein: 160, carbs: 200, fat: 60 }],
      lunch: [],
      dinner: [],
      snacks: [],
    }
  }
  return {
    unit: 'kg',
    nutrition: { sex, birthYear: 1995, heightCm: 180, activity },
    bodyweight: bwSeries,
    targetW,
    targetDate: '',
    workouts: [],
    routines: [],
    week: {},
    dayPlan: {},
    foodLog,
  }
}

describe('adaptiveAdjustment', () => {
  const today = '2026-04-20'

  it('returns insufficient when fewer than 3 weigh-ins or fewer than 5 logged food days exist', () => {
    const sFewBw = makeState({
      bwSeries: [{ d: '2026-04-19', w: 80 }, { d: '2026-04-20', w: 80 }],
      loggedCount: 10,
    })
    expect(adaptiveAdjustment(sFewBw, today).status).toBe('insufficient')

    const sFewFood = makeState({
      bwSeries: [
        { d: '2026-04-08', w: 80.4 },
        { d: '2026-04-14', w: 80.2 },
        { d: '2026-04-20', w: 80.0 },
      ],
      loggedCount: 3,
    })
    expect(adaptiveAdjustment(sFewFood, today).status).toBe('insufficient')
  })

  it('returns on-track when weight trend matches planned rate and intake matches target', () => {
    const baseS = makeState({
      bwSeries: [
        { d: '2026-04-08', w: 80.68 },
        { d: '2026-04-14', w: 80.34 },
        { d: '2026-04-20', w: 80.0 },
      ],
    })
    const baseTg = targetsForDay(baseS, today)
    const s = makeState({
      bwSeries: baseS.bodyweight,
      kcalPerDay: baseTg.rest.kcal,
    })
    const adj = adaptiveAdjustment(s, today)
    expect(adj.status).toBe('on-track')
    expect(adj.nudgeKcal).toBe(0)
    expect(adj.day.kcal).toBe(baseTg.day.kcal)
  })

  it('returns adherence without nudging target when weight stall is explained by eating over target', () => {
    const probe = makeState({
      bwSeries: [
        { d: '2026-04-08', w: 80.0 },
        { d: '2026-04-14', w: 80.0 },
        { d: '2026-04-20', w: 80.0 },
      ],
    })
    const baseTg = targetsForDay(probe, today)
    // Planned is -0.4 kg/wk (~ -440 kcal/day), eaten is +440 kcal over target -> net stall explained by intake
    const s = makeState({
      bwSeries: probe.bodyweight,
      kcalPerDay: baseTg.rest.kcal + 440,
    })
    const adj = adaptiveAdjustment(s, today)
    expect(adj.status).toBe('adherence')
    expect(adj.nudgeKcal).toBe(0)
  })

  it('nudges calories down when hitting target intake but weight is not dropping as planned', () => {
    const probe = makeState({
      bwSeries: [
        { d: '2026-04-08', w: 80.0 },
        { d: '2026-04-14', w: 80.0 },
        { d: '2026-04-20', w: 80.0 },
      ],
    })
    const baseTg = targetsForDay(probe, today)
    const s = makeState({
      bwSeries: probe.bodyweight,
      kcalPerDay: baseTg.rest.kcal,
    })
    const adj = adaptiveAdjustment(s, today)
    expect(adj.status).toBe('nudge-down')
    expect(adj.nudgeKcal).toBeLessThan(0)
    expect(adj.nudgeKcal).toBeGreaterThanOrEqual(-250)
    expect(adj.day.kcal).toBe(baseTg.day.kcal + adj.nudgeKcal)
  })

  it('nudges calories up when losing much faster than planned while eating on target', () => {
    const probe = makeState({
      bwSeries: [
        { d: '2026-04-08', w: 81.6 },
        { d: '2026-04-14', w: 80.8 },
        { d: '2026-04-20', w: 80.0 },
      ],
    })
    const baseTg = targetsForDay(probe, today)
    const s = makeState({
      bwSeries: probe.bodyweight,
      kcalPerDay: baseTg.rest.kcal,
    })
    const adj = adaptiveAdjustment(s, today)
    expect(adj.status).toBe('nudge-up')
    expect(adj.nudgeKcal).toBeGreaterThan(0)
    expect(adj.nudgeKcal).toBeLessThanOrEqual(250)
    expect(adj.day.kcal).toBe(baseTg.day.kcal + adj.nudgeKcal)
  })
})
