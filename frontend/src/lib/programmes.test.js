import { describe, it, expect } from 'vitest'
import {
  PHASE_KINDS,
  PHASE_LABELS,
  isCompletionOnly,
  effectiveTonnage,
  isEligibleForPR,
  groupRoutineByPhases,
  createProgramme,
  currentProgrammeWeek,
  advanceProgramme,
  adjustForDeload,
} from './programmes.js'

describe('programmes & phases: completion-only stretching semantics (#57, #140)', () => {
  it('identifies completion-only exercises by flag, type, or phase', () => {
    expect(isCompletionOnly({ completion_only: true })).toBe(true)
    expect(isCompletionOnly({ completionOnly: true })).toBe(true)
    expect(isCompletionOnly({ type: 'stretching' })).toBe(true)
    expect(isCompletionOnly({ type: 'stretch' })).toBe(true)
    expect(isCompletionOnly({ phase: 'cooldown' })).toBe(true)
    expect(isCompletionOnly({ phase: 'work' })).toBe(false)
    expect(isCompletionOnly({ w: 100, r: 5 })).toBe(false)
  })

  it('keeps completion-only exercises strictly out of volume/tonnage', () => {
    // Normal work set: 100 kg * 5 reps = 500 kg
    expect(effectiveTonnage({ w: 100, r: 5 })).toBe(500)

    // Warmup: 0 volume
    expect(effectiveTonnage({ w: 50, r: 10, phase: 'warmup' })).toBe(0)

    // Stretching / completion-only: 0 volume regardless of weight/time
    expect(effectiveTonnage({ w: 20, r: 10, completion_only: true })).toBe(0)
    expect(effectiveTonnage({ w: 0, r: 30, phase: 'cooldown' })).toBe(0)

    // With completion-only parent entry
    expect(effectiveTonnage({ w: 20, r: 10 }, { completion_only: true })).toBe(0)
  })

  it('excludes completion-only and cooldown sets from PR eligibility', () => {
    expect(isEligibleForPR({ id: 'bench', phase: 'work' })).toBe(true)
    expect(isEligibleForPR({ id: 'bench', completion_only: true })).toBe(false)
    expect(isEligibleForPR({ id: 'hamstring-stretch', phase: 'cooldown' })).toBe(false)
    expect(isEligibleForPR({ id: 'hip-flow', phase: 'mobility' })).toBe(false)
    expect(isEligibleForPR({ id: 'row', phase: 'warmup' })).toBe(false)
  })

  it('groups routine exercises into session phases', () => {
    const routine = [
      { id: 'cat-cow', name: 'Cat Cow', phase: 'mobility' },
      { id: 'band-pull', name: 'Band Pull Apart', warmup: true },
      { id: 'bench', name: 'Barbell Bench Press', phase: 'work' },
      { id: 'incline-db', name: 'Incline DB Press', phase: 'accessory' },
      { id: 'pec-stretch', name: 'Chest Stretch', completion_only: true },
    ]

    const phases = groupRoutineByPhases(routine)
    expect(phases.mobility.map(x => x.id)).toEqual(['cat-cow'])
    expect(phases.warmup.map(x => x.id)).toEqual(['band-pull'])
    expect(phases.work.map(x => x.id)).toEqual(['bench'])
    expect(phases.accessory.map(x => x.id)).toEqual(['incline-db'])
    expect(phases.cooldown.map(x => x.id)).toEqual(['pec-stretch'])
  })

  it('provides bilingual labels for all 5 phases', () => {
    for (const p of PHASE_KINDS) {
      expect(PHASE_LABELS.en[p]).toBeDefined()
      expect(PHASE_LABELS.it[p]).toBeDefined()
    }
  })
})

describe('programmes & phases: multi-week blocks & deloads (#159)', () => {
  it('creates multi-week programmes with deload and rest weeks', () => {
    const prog = createProgramme({
      name: '8-Week Hypertrophy Block',
      weeksCount: 8,
      deloadWeeks: [4, 8],
      restWeeks: [5],
    })

    expect(prog.weeksCount).toBe(8)
    expect(prog.weeks.length).toBe(8)
    expect(prog.weeks[0].isDeload).toBe(false)
    expect(prog.weeks[0].isRest).toBe(false)

    // Week 4: Deload
    expect(prog.weeks[3].weekNumber).toBe(4)
    expect(prog.weeks[3].isDeload).toBe(true)

    // Week 5: Rest
    expect(prog.weeks[4].weekNumber).toBe(5)
    expect(prog.weeks[4].isRest).toBe(true)

    // Week 8: Deload
    expect(prog.weeks[7].weekNumber).toBe(8)
    expect(prog.weeks[7].isDeload).toBe(true)
  })

  it('advances days and weeks properly', () => {
    const prog = createProgramme({
      weeksCount: 2,
      schedule: [
        { week: 1, days: [{ day: 1, routineId: 'r1' }, { day: 2, routineId: 'r2' }] },
        { week: 2, days: [{ day: 1, routineId: 'r3' }] },
      ],
    })

    // Advance day within week 1
    const step1 = advanceProgramme(prog, { currentWeek: 1, currentDayIndex: 0 })
    expect(step1).toEqual({ currentWeek: 1, currentDayIndex: 1, isFinished: false })

    // Advance from week 1 day 2 -> week 2 day 1
    const step2 = advanceProgramme(prog, { currentWeek: 1, currentDayIndex: 1 })
    expect(step2).toEqual({ currentWeek: 2, currentDayIndex: 0, isFinished: false })

    // Advance from week 2 day 1 -> finished
    const step3 = advanceProgramme(prog, { currentWeek: 2, currentDayIndex: 0 })
    expect(step3.isFinished).toBe(true)
  })

  it('adjusts weight and reps during deload weeks', () => {
    // Normal week: unadjusted
    const normal = adjustForDeload(100, 10, { isDeload: false })
    expect(normal).toEqual({ weight: 100, reps: 10 })

    // Deload week: reduced weight (85%) and volume (65%)
    const deload = adjustForDeload(100, 10, { isDeload: true, factor: 0.65 })
    expect(deload.weight).toBe(85)
    expect(deload.reps).toBe(7)
    expect(deload.isDeloaded).toBe(true)
  })
})
