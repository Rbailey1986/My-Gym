// Weekly calorie adjustment: compares the recent weigh-in trend and food log with the planned
// rate from lib/nutrition-targets.js, and nudges daily calories (and carbs) when real-world
// expenditure differs from the Mifflin-St Jeor estimate. Pure and pinned by unit tests.

import { trendPerDay } from './goal-eta.js'
import { KCAL_PER_KG, FLOOR, bmr, toKg, targetsForDay } from './nutrition-targets.js'
import { dayTotals } from './food-log.js'

const DAY = 86400000
export const ADAPT_WINDOW_DAYS = 14
export const MIN_LOGGED_DAYS = 5
export const MIN_VALID_KCAL = 800
export const MAX_NUDGE_KCAL = 250
export const DEADBAND_KCAL = 50

const dayNum = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY)
const isoOfDay = n => new Date(n * DAY).toISOString().slice(0, 10)

function applyNudge(dayTarget, nudgeKcal, floor) {
  if (!dayTarget || !nudgeKcal) return dayTarget
  const raw = dayTarget.kcal + nudgeKcal
  const kcal = Math.round(Math.max(floor, raw) / 10) * 10
  const carbs = Math.max(0, Math.round((kcal - dayTarget.protein * 4 - dayTarget.fat * 9) / 4))
  return { ...dayTarget, kcal, carbs, floored: raw < floor }
}

/**
 * Evaluates the last 14 days of weigh-ins and food logs against `base` (targetsForDay(S, today)).
 * status:
 *   - 'insufficient': fewer than 3 weigh-ins over >=7 days, or fewer than 5 logged food days
 *   - 'on-track':     weight trend and intake agree with the planned rate within DEADBAND_KCAL
 *   - 'adherence':    weight missed the planned rate, but logged intake explains why (no target nudge)
 *   - 'nudge-down':   losing slower / gaining faster than logged intake predicts -> lower kcal target
 *   - 'nudge-up':     losing faster / gaining slower than logged intake predicts -> raise kcal target
 */
export function adaptiveAdjustment(S, today, base = targetsForDay(S, today)) {
  if (!base || !S) return null
  const slope = trendPerDay(S.bodyweight, today, ADAPT_WINDOW_DAYS)
  const actualKgPerWeek = slope == null ? null : toKg(slope * 7, S.unit)
  const plannedKgPerWeek = base.rate.kgPerWeek

  const end = dayNum(today)
  let loggedDays = 0, eatenSum = 0, targetSum = 0
  for (let d = end - ADAPT_WINDOW_DAYS + 1; d <= end; d++) {
    const iso = isoOfDay(d)
    const tot = dayTotals(S, iso)
    if (tot.count > 0 && tot.kcal >= MIN_VALID_KCAL) {
      loggedDays++
      eatenSum += tot.kcal
      const dayTg = targetsForDay(S, iso)
      targetSum += (dayTg ? dayTg.day.kcal : base.day.kcal)
    }
  }
  const avgEatenKcal = loggedDays ? Math.round(eatenSum / loggedDays) : null
  const avgTargetKcal = loggedDays ? Math.round(targetSum / loggedDays) : null

  if (actualKgPerWeek == null || loggedDays < MIN_LOGGED_DAYS) {
    return {
      status: 'insufficient',
      nudgeKcal: 0,
      actualKgPerWeek,
      plannedKgPerWeek,
      loggedDays,
      avgEatenKcal,
      avgTargetKcal,
      rest: base.rest,
      training: base.training,
      day: base.day,
    }
  }

  // Positive rateDiff = weight change is higher (less negative or more positive) than planned.
  const rateDiffKgPerWeek = actualKgPerWeek - plannedKgPerWeek
  const energyGapPerDay = (rateDiffKgPerWeek * KCAL_PER_KG) / 7
  const adherenceGapPerDay = avgEatenKcal - avgTargetKcal
  // Unexplained TDEE error: how much of the weight difference wasn't simply eating over/under target.
  const unexplainedPerDay = energyGapPerDay - adherenceGapPerDay
  // Damp by 50% so a single noisy fortnight nudges gently, capped at ±MAX_NUDGE_KCAL.
  const damped = -unexplainedPerDay * 0.5
  const rawNudge = Math.abs(damped) < DEADBAND_KCAL
    ? 0
    : Math.max(-MAX_NUDGE_KCAL, Math.min(MAX_NUDGE_KCAL, Math.round(damped / 10) * 10))

  const bw = (S.bodyweight || []).at(-1)
  const weightKg = toKg(bw?.w || 75, S.unit)
  const p = S.nutrition || {}
  const age = +today.slice(0, 4) - (p.birthYear || 1990)
  const floor = Math.max(FLOOR[p.sex] || 1500, Math.round(bmr({ sex: p.sex || 'male', age, heightCm: p.heightCm || 175, weightKg })))

  const rest = applyNudge(base.rest, rawNudge, floor)
  const training = applyNudge(base.training, rawNudge, floor)
  const day = base.trainingDay ? training : rest
  const appliedNudge = day.kcal - base.day.kcal

  const status = appliedNudge < 0
    ? 'nudge-down'
    : appliedNudge > 0
      ? 'nudge-up'
      : Math.abs(energyGapPerDay) >= DEADBAND_KCAL * 2 && Math.abs(adherenceGapPerDay) >= DEADBAND_KCAL
        ? 'adherence'
        : 'on-track'

  return {
    status,
    nudgeKcal: appliedNudge,
    actualKgPerWeek: Math.round(actualKgPerWeek * 100) / 100,
    plannedKgPerWeek: Math.round(plannedKgPerWeek * 100) / 100,
    loggedDays,
    avgEatenKcal,
    avgTargetKcal,
    rest,
    training,
    day,
  }
}
