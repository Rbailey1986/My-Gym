// Programmes & phases (upstream v1.4.2 roadmap, #159, #57, #140).
//
// 1. Programmes:
//    - Routines grouped into named multi-week training blocks.
//    - Week types: normal, deload (reduced volume/intensity), rest (recovery).
//    - Multiple programmes per profile, with active programme pointer and week advancement.
//    - Deload modifier: scales work volume/sets according to programme deload settings.
//
// 2. Session phases:
//    - Four standard session phases: mobility, warmup, work, accessory, cooldown.
//    - Exercises tagged with a phase or completion_only flag.
//    - Completion-only exercises (e.g. static stretching, mobility drills) count towards
//      session completion and compliance, but are strictly excluded from workout volume
//      and personal records (PRs).

export const PHASE_KINDS = ['mobility', 'warmup', 'work', 'accessory', 'cooldown']

export const PHASE_LABELS = {
  en: {
    mobility: 'Mobility & Prep',
    warmup: 'Warm-up',
    work: 'Main Work',
    accessory: 'Accessories',
    cooldown: 'Cool-down & Stretch',
  },
  it: {
    mobility: 'Mobilità e preparazione',
    warmup: 'Riscaldamento',
    work: 'Lavoro principale',
    accessory: 'Accessori',
    cooldown: 'Defaticamento e stretching',
  },
}

export const DEFAULT_DELOAD_FACTOR = 0.65

/**
 * Determine if an exercise entry or set is completion-only.
 * Completion-only exercises (stretching, cool-down, mobility drills) can be
 * completed/checked off, but are strictly excluded from tonnage/volume and PRs.
 */
export function isCompletionOnly(entryOrSet) {
  if (!entryOrSet || typeof entryOrSet !== 'object') return false
  if (entryOrSet.completion_only === true || entryOrSet.completionOnly === true) return true
  const type = String(entryOrSet.type || '').toLowerCase()
  if (type === 'stretch' || type === 'stretching' || type === 'mobility') return true
  const phase = String(entryOrSet.phase || '').toLowerCase()
  if (phase === 'cooldown' || phase === 'stretch') return true
  return false
}

/**
 * Calculate the effective tonnage/volume of a set, respecting completion-only rules.
 * If a set is completion-only or warmup, volume is strictly 0.
 */
export function effectiveTonnage(set, entry = null) {
  if (!set || isCompletionOnly(set) || (entry && isCompletionOnly(entry))) {
    return 0
  }
  const phase = String(set.phase || '').toLowerCase()
  if (phase === 'warmup' || phase === 'cooldown' || phase === 'stretch' || phase === 'mobility') {
    return 0
  }
  const w = Number(set.w) || 0
  const r = Number(set.r) || 0
  return Math.max(0, w * r)
}

/**
 * Determine if an entry qualifies for Personal Record (PR) evaluation.
 * Warmups, cooldowns, mobility, and completion-only exercises never produce PRs.
 */
export function isEligibleForPR(entry) {
  if (!entry || typeof entry !== 'object') return false
  if (isCompletionOnly(entry)) return false
  const phase = String(entry.phase || '').toLowerCase()
  if (phase === 'warmup' || phase === 'cooldown' || phase === 'mobility' || phase === 'stretch') {
    return false
  }
  return true
}

/**
 * Group routine exercise entries into structured session phases.
 * Exercises without an explicit phase default to 'work'.
 */
export function groupRoutineByPhases(entries = []) {
  const groups = {
    mobility: [],
    warmup: [],
    work: [],
    accessory: [],
    cooldown: [],
  }

  for (const entry of entries) {
    if (!entry) continue
    let phase = String(entry.phase || '').toLowerCase()
    if (!groups[phase]) {
      // Automatic phase inference
      if (isCompletionOnly(entry)) {
        phase = 'cooldown'
      } else if (entry.warmup) {
        phase = 'warmup'
      } else {
        phase = 'work'
      }
    }
    groups[phase].push(entry)
  }

  return groups
}

/**
 * Create a new Programme structure.
 *
 * @param {Object} params
 * @param {string} params.name Programme title.
 * @param {number} [params.weeksCount=4] Number of weeks.
 * @param {number[]} [params.deloadWeeks=[]] 1-based week indices designated as deload weeks.
 * @param {number[]} [params.restWeeks=[]] 1-based week indices designated as rest weeks.
 * @param {Array} [params.schedule=[]] Array of week routines [{ week: 1, days: [{ day: 1, routineId: 'r1' }] }].
 */
export function createProgramme({
  id = null,
  name = 'New Programme',
  description = '',
  weeksCount = 4,
  deloadWeeks = [],
  restWeeks = [],
  schedule = [],
  deloadFactor = DEFAULT_DELOAD_FACTOR,
} = {}) {
  const weeks = []
  const count = Math.max(1, Math.min(52, Number(weeksCount) || 4))
  const deloadSet = new Set(deloadWeeks)
  const restSet = new Set(restWeeks)

  for (let w = 1; w <= count; w++) {
    const isRest = restSet.has(w)
    const isDeload = !isRest && deloadSet.has(w)
    const weekSched = schedule.find(s => s.week === w)
    weeks.push({
      weekNumber: w,
      title: `Week ${w}` + (isDeload ? ' (Deload)' : isRest ? ' (Rest)' : ''),
      isDeload,
      isRest,
      days: Array.isArray(weekSched?.days) ? weekSched.days : [],
    })
  }

  return {
    id: id || ('prog-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    name: name.trim() || 'Untitled Programme',
    description: description.trim(),
    createdAt: Date.now(),
    weeksCount: count,
    deloadFactor,
    weeks,
  }
}

/**
 * Get the current week object from an active programme state.
 */
export function currentProgrammeWeek(programme, currentWeekNumber = 1) {
  if (!programme || !Array.isArray(programme.weeks) || !programme.weeks.length) {
    return null
  }
  const clamped = Math.max(1, Math.min(programme.weeks.length, currentWeekNumber))
  return programme.weeks.find(w => w.weekNumber === clamped) || programme.weeks[0]
}

/**
 * Advance programme to the next scheduled day or week.
 * Returns the updated state { currentWeek, currentDayIndex, completedWeeks, isFinished }.
 */
export function advanceProgramme(programme, { currentWeek = 1, currentDayIndex = 0 } = {}) {
  if (!programme || !Array.isArray(programme.weeks) || !programme.weeks.length) {
    return { currentWeek: 1, currentDayIndex: 0, isFinished: false }
  }

  const week = currentProgrammeWeek(programme, currentWeek)
  const daysInWeek = Array.isArray(week?.days) && week.days.length ? week.days.length : 1

  if (currentDayIndex + 1 < daysInWeek) {
    return {
      currentWeek,
      currentDayIndex: currentDayIndex + 1,
      isFinished: false,
    }
  }

  // Advance week
  const nextWeek = currentWeek + 1
  if (nextWeek <= programme.weeks.length) {
    return {
      currentWeek: nextWeek,
      currentDayIndex: 0,
      isFinished: false,
    }
  }

  // Completed all weeks in programme
  return {
    currentWeek: programme.weeks.length,
    currentDayIndex: daysInWeek - 1,
    isFinished: true,
  }
}

/**
 * Apply deload factor to suggested workout sets/weights if the active week is a deload week.
 */
export function adjustForDeload(weight, reps, { isDeload = false, factor = DEFAULT_DELOAD_FACTOR } = {}) {
  const w = Number(weight) || 0
  const r = Number(reps) || 0
  if (!isDeload) {
    return { weight: w, reps: r }
  }
  // Standard deload: reduce intensity (~80-90% weight) and volume (~60-70% total work)
  const adjWeight = Math.round((w * 0.85) * 2) / 2
  const adjReps = Math.max(1, Math.round(r * factor))
  return {
    weight: adjWeight,
    reps: adjReps,
    isDeloaded: true,
  }
}
