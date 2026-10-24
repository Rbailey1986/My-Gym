/**
 * Cardio intervals, C25k, rucking, and distance calculations (#132, #169, #177).
 */

/**
 * Calculates distance from duration (in minutes) and speed (in km/h or mph).
 */
export function cardioDistance(min, speed) {
  const m = Number(min) || 0
  const s = Number(speed) || 0
  if (m <= 0 || s <= 0) return 0
  return Number(((m / 60) * s).toFixed(2))
}

/**
 * Calculates pace in minutes per distance unit (min/km or min/mi).
 * E.g. speed = 10 km/h -> pace = 6.0 min/km (6:00 min/km).
 */
export function cardioPace(min, dist) {
  const m = Number(min) || 0
  const d = Number(dist) || 0
  if (m <= 0 || d <= 0) return 0
  return Number((m / d).toFixed(2))
}

/**
 * Formats a decimal pace into "M:SS /km" or "M:SS /mi".
 */
export function fmtPace(minPerDist, unit = 'km') {
  if (!minPerDist || minPerDist <= 0 || !Number.isFinite(minPerDist)) return ''
  const wholeMin = Math.floor(minPerDist)
  const sec = Math.round((minPerDist - wholeMin) * 60)
  return `${wholeMin}:${String(sec).padStart(2, '0')} /${unit}`
}

/**
 * Rucking load and power metrics (#169):
 * Distance traveled + load carried (pack weight).
 * Calculates total work or load-distance product (kg·km or lb·mi).
 */
export function ruckingMetrics({ dist = 0, min = 0, packWeight = 0, bodyWeight = 75 }) {
  const d = Math.max(0, Number(dist) || 0)
  const m = Math.max(0, Number(min) || 0)
  const pack = Math.max(0, Number(packWeight) || 0)
  const bw = Math.max(1, Number(bodyWeight) || 75)

  const loadRatio = Number((pack / bw).toFixed(2))
  const workProduct = Number((d * (bw + pack)).toFixed(1))
  const pace = cardioPace(m, d)

  return {
    dist: d,
    min: m,
    packWeight: pack,
    bodyWeight: bw,
    loadRatio,
    workProduct,
    pace,
  }
}

/**
 * Interval plan calculation (#132):
 * rounds × (workSec + restSec) + warmupSec + cooldownSec.
 */
export function intervalPlanTotalSec({ rounds = 1, workSec = 30, restSec = 30, warmupSec = 0, cooldownSec = 0 }) {
  const r = Math.max(1, Math.round(Number(rounds) || 1))
  const w = Math.max(0, Math.round(Number(workSec) || 0))
  const rest = Math.max(0, Math.round(Number(restSec) || 0))
  const warm = Math.max(0, Math.round(Number(warmupSec) || 0))
  const cool = Math.max(0, Math.round(Number(cooldownSec) || 0))

  const activeRoundsSec = r * w + Math.max(0, r - 1) * rest
  return warm + activeRoundsSec + cool
}

/**
 * Couch to 5K (C25k) standard program structure (#177):
 * 9 weeks, 3 days per week.
 * Returns the workout prescription for a given week (1-9) and day (1-3).
 */
export const C25K_SCHEDULE = {
  1: { warmupMin: 5, intervals: [{ runSec: 60, walkSec: 90, reps: 8 }], cooldownMin: 5, note: 'Alternate 60s jog and 90s walk for 20 minutes' },
  2: { warmupMin: 5, intervals: [{ runSec: 90, walkSec: 120, reps: 6 }], cooldownMin: 5, note: 'Alternate 90s jog and 2 mins walk' },
  3: { warmupMin: 5, intervals: [{ runSec: 90, walkSec: 90, reps: 2 }, { runSec: 180, walkSec: 180, reps: 2 }], cooldownMin: 5, note: 'Two reps of 90s jog / 90s walk, then two reps of 3 mins jog / 3 mins walk' },
  4: { warmupMin: 5, intervals: [{ runSec: 180, walkSec: 90, reps: 1 }, { runSec: 300, walkSec: 150, reps: 1 }, { runSec: 180, walkSec: 90, reps: 1 }, { runSec: 300, walkSec: 0, reps: 1 }], cooldownMin: 5, note: '3 min jog, 90s walk, 5 min jog, 2.5 min walk, 3 min jog, 90s walk, 5 min jog' },
  5: {
    1: { warmupMin: 5, intervals: [{ runSec: 300, walkSec: 180, reps: 3 }], cooldownMin: 5, note: 'Three 5-minute jogs with 3-minute walks between' },
    2: { warmupMin: 5, intervals: [{ runSec: 480, walkSec: 300, reps: 2 }], cooldownMin: 5, note: 'Two 8-minute jogs with 5-minute walk between' },
    3: { warmupMin: 5, intervals: [{ runSec: 1200, walkSec: 0, reps: 1 }], cooldownMin: 5, note: 'Continuous 20-minute jog' },
  },
  6: {
    1: { warmupMin: 5, intervals: [{ runSec: 300, walkSec: 180, reps: 1 }, { runSec: 480, walkSec: 180, reps: 1 }, { runSec: 300, walkSec: 0, reps: 1 }], cooldownMin: 5, note: '5 min jog, 3 min walk, 8 min jog, 3 min walk, 5 min jog' },
    2: { warmupMin: 5, intervals: [{ runSec: 600, walkSec: 180, reps: 2 }], cooldownMin: 5, note: 'Two 10-minute jogs with 3-minute walk between' },
    3: { warmupMin: 5, intervals: [{ runSec: 1320, walkSec: 0, reps: 1 }], cooldownMin: 5, note: 'Continuous 22-minute jog' },
  },
  7: { warmupMin: 5, intervals: [{ runSec: 1500, walkSec: 0, reps: 1 }], cooldownMin: 5, note: 'Continuous 25-minute jog' },
  8: { warmupMin: 5, intervals: [{ runSec: 1680, walkSec: 0, reps: 1 }], cooldownMin: 5, note: 'Continuous 28-minute jog' },
  9: { warmupMin: 5, intervals: [{ runSec: 1800, walkSec: 0, reps: 1 }], cooldownMin: 5, note: 'Continuous 30-minute jog (5K target)' },
}

export function c25kWorkout(week = 1, day = 1) {
  const w = Math.max(1, Math.min(9, Math.round(Number(week) || 1)))
  const d = Math.max(1, Math.min(3, Math.round(Number(day) || 1)))
  const weekData = C25K_SCHEDULE[w]
  if (!weekData) return null
  const workout = weekData[d] || weekData
  return { week: w, day: d, ...workout }
}
