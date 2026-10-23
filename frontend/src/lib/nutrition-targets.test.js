import { describe, expect, it } from 'vitest'
import { bmr, sessionKcal, weeklyRate, nutritionTargets, toKg, targetsForDay } from './nutrition-targets.js'

const man = { sex: 'male', birthYear: 1986, heightCm: 180, activity: 'light' }
const today = '2026-10-24'

describe('bmr', () => {
  it('is Mifflin-St Jeor', () => {
    expect(bmr({ sex: 'male', age: 40, heightCm: 180, weightKg: 80 })).toBe(800 + 1125 - 200 + 5)
    expect(bmr({ sex: 'female', age: 30, heightCm: 165, weightKg: 60 })).toBeCloseTo(600 + 1031.25 - 150 - 161, 5)
  })
})

describe('sessionKcal', () => {
  it('counts what an hour of lifting adds on top of resting', () => {
    expect(sessionKcal(80, 60)).toBe(320)
    expect(sessionKcal(80, 45)).toBe(240)
  })
})

describe('weeklyRate', () => {
  it('holds at the goal or without one', () => {
    expect(weeklyRate({ weightKg: 80, targetKg: null, today })).toEqual({ kgPerWeek: 0, reason: 'hold' })
    expect(weeklyRate({ weightKg: 80, targetKg: 80.1, today }).reason).toBe('hold')
  })

  it('takes the pace the date needs', () => {
    // 4 kg in 10 weeks
    const r = weeklyRate({ weightKg: 80, targetKg: 76, targetDate: '2027-01-02', today })
    expect(r.reason).toBe('date')
    expect(r.weeks).toBe(10)
    expect(r.kgPerWeek).toBeCloseTo(-0.4, 5)
  })

  it('caps a date that asks too much, and says what it asked', () => {
    // 10 kg in 4 weeks is 2.5 kg a week; 1 % of 80 kg is the most
    const r = weeklyRate({ weightKg: 80, targetKg: 70, targetDate: '2026-11-21', today })
    expect(r.reason).toBe('capped')
    expect(r.kgPerWeek).toBeCloseTo(-0.8, 5)
    expect(r.needed).toBeCloseTo(-2.5, 5)
    expect(weeklyRate({ weightKg: 60, targetKg: 70, targetDate: '2026-11-21', today }).kgPerWeek).toBeCloseTo(0.3, 5)
  })

  it('uses a steady default without a date, or with one already gone', () => {
    expect(weeklyRate({ weightKg: 80, targetKg: 75, today }).kgPerWeek).toBeCloseTo(-0.4, 5)
    expect(weeklyRate({ weightKg: 80, targetKg: 85, today }).kgPerWeek).toBeCloseTo(0.2, 5)
    expect(weeklyRate({ weightKg: 80, targetKg: 75, targetDate: '2026-01-01', today }).reason).toBe('default')
  })
})

describe('nutritionTargets', () => {
  it('needs a complete profile and a weight', () => {
    expect(nutritionTargets(null, { weight: 80 }, {}, today)).toBe(null)
    expect(nutritionTargets({ ...man, heightCm: 0 }, { weight: 80 }, {}, today)).toBe(null)
    expect(nutritionTargets(man, { weight: 0 }, {}, today)).toBe(null)
  })

  it('maintains without a goal, training days carrying the session', () => {
    const r = nutritionTargets(man, { weight: 80, unit: 'kg' }, { sessionMin: 60 }, today)
    // 40 years old: 1730 resting × 1.375
    expect(r.maintenance).toBe(2380)
    expect(r.rest.kcal).toBe(2380)
    expect(r.training.kcal).toBe(2700)
    expect(r.rest.protein).toBe(144)   // 1.8 g/kg
    expect(r.rest.fat).toBe(64)        // 0.8 g/kg
    expect(r.rest.carbs).toBe(Math.round((2380 - 144 * 4 - 64 * 9) / 4))
    expect(r.training.carbs - r.rest.carbs).toBe(80)   // the session's 320 kcal, all carbs
  })

  it('runs a deficit for a loss, with more protein sized to the goal weight', () => {
    const r = nutritionTargets(man, { weight: 80, unit: 'kg', targetW: 76, targetDate: '2027-01-02' }, {}, today)
    // 0.4 kg a week is 440 kcal a day under 2378.75
    expect(r.rest.kcal).toBe(1940)
    expect(r.rest.protein).toBe(Math.round(76 * 2.2))
    expect(r.rate.reason).toBe('date')
  })

  it('never goes below the floor, and says when it stopped there', () => {
    const small = { sex: 'female', birthYear: 1960, heightCm: 155, activity: 'sedentary' }
    const r = nutritionTargets(small, { weight: 55, unit: 'kg', targetW: 45, targetDate: '2026-12-01' }, {}, today)
    expect(r.rate.reason).toBe('capped')
    expect(r.rest.kcal).toBe(1200)
    expect(r.rest.floored).toBe(true)
  })

  it('reads a profile kept in pounds', () => {
    const kg = nutritionTargets(man, { weight: 80, unit: 'kg', targetW: 76 }, {}, today)
    const lb = nutritionTargets(man, { weight: 80 * 2.20462, unit: 'lb', targetW: 76 * 2.20462 }, {}, today)
    expect(lb.rest).toEqual(kg.rest)
    expect(toKg(220.462, 'lb')).toBeCloseTo(100, 5)
  })
})

describe('targetsForDay', () => {
  const base = { unit: 'kg', bodyweight: [{ d: '2026-10-20', w: 80 }], targetW: null, targetDate: null, nutrition: man, workouts: [], routines: [], week: {}, dayPlan: {} }

  it('is null until there is a profile and a weigh-in', () => {
    expect(targetsForDay({ ...base, nutrition: null }, today)).toBe(null)
    expect(targetsForDay({ ...base, bodyweight: [] }, today)).toBe(null)
  })

  it('uses the training-day numbers on a planned weekday or after a logged session', () => {
    // 2026-10-24 is a Saturday (day 6)
    expect(targetsForDay(base, today).trainingDay).toBe(false)
    const r1 = { id: 'r1', name: 'Push', ex: [{ id: '0025' }] }
    expect(targetsForDay({ ...base, routines: [r1], week: { 6: ['r1'] } }, today).trainingDay).toBe(true)
    // a session moved onto today counts too, as Today shows it
    expect(targetsForDay({ ...base, routines: [r1], dayPlan: { [today]: 'r1' } }, today).trainingDay).toBe(true)
    const logged = targetsForDay({ ...base, workouts: [{ d: today, start: 0, end: 45 * 60000 }] }, today)
    expect(logged.trainingDay).toBe(true)
    expect(logged.day).toEqual(logged.training)
  })

  it('sizes the session from the typical logged length', () => {
    const w = m => ({ d: '2026-10-01', start: 0, end: m * 60000 })
    expect(targetsForDay({ ...base, workouts: [w(40), w(50), w(90)] }, today).sessionMin).toBe(50)
    expect(targetsForDay(base, today).sessionMin).toBe(60)
  })
})
