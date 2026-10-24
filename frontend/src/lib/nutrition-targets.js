// Daily calorie and macro targets from a body profile and a weight goal. Pure, so every number the
// Food tab and the meal planner show is pinned by a test, never left to a model.
//
//   resting energy   Mifflin-St Jeor (10·kg + 6.25·cm − 5·age, +5 male / −161 female)
//   everyday life    resting × an activity factor for the day without the workout
//   a workout        (MET 5 − 1) × kg × hours: what a session adds on top of resting
//   the goal         a weekly rate turned into a daily gap at 7,700 kcal per kg
//
// The rate comes from the goal: what reaching the target weight by its date needs, or without a
// date a steady default (lose 0.5 %, gain 0.25 % of body weight a week). It is capped at 1 % a
// week down and 0.5 % up, and the calories never go below a floor (1,500 male, 1,200 female) or
// below resting energy; when either limit bites the result says so instead of hiding it.

import { workoutDuration, effectiveRoutineIds } from './history.js'

const DAY = 86400000
export const KCAL_PER_KG = 7700
export const LB_PER_KG = 2.20462

// Everyday activity outside the workouts.
export const ACTIVITY = {
  sedentary: 1.2,   // desk job, little walking
  light: 1.375,     // on your feet some of the day
  moderate: 1.55,   // on your feet most of the day
  very: 1.725,      // physical job
}
const MET_STRENGTH = 5
const MAX_LOSS = 0.01     // of body weight per week
const MAX_GAIN = 0.005
const DEFAULT_LOSS = 0.005
const DEFAULT_GAIN = 0.0025
export const FLOOR = { male: 1500, female: 1200 }

const dayNum = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY)
export const toKg = (w, unit) => (unit === 'lb' ? w / LB_PER_KG : w)

export function bmr({ sex, age, heightCm, weightKg }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'female' ? -161 : 5)
}

export const sessionKcal = (weightKg, minutes) => Math.round((MET_STRENGTH - 1) * weightKg * (minutes / 60))

/**
 * The weekly rate in kg (negative to lose) and why: 'date' when a target date set it, 'default'
 * without one, 'capped' when the date asked for more than is safe, 'hold' at the goal or without
 * one. `weeks` is how long the date gives.
 */
export function weeklyRate({ weightKg, targetKg, targetDate, today }) {
  if (targetKg == null || Math.abs(targetKg - weightKg) < 0.25) return { kgPerWeek: 0, reason: 'hold' }
  const losing = targetKg < weightKg
  const cap = weightKg * (losing ? MAX_LOSS : MAX_GAIN)
  if (targetDate && targetDate > today) {
    const weeks = (dayNum(targetDate) - dayNum(today)) / 7
    const need = (targetKg - weightKg) / weeks
    if (Math.abs(need) > cap) return { kgPerWeek: losing ? -cap : cap, reason: 'capped', weeks, needed: need }
    return { kgPerWeek: need, reason: 'date', weeks }
  }
  return { kgPerWeek: weightKg * (losing ? -DEFAULT_LOSS : DEFAULT_GAIN), reason: 'default' }
}

/**
 * Targets for a rest day and a training day, or null when the profile is incomplete.
 * profile: { sex, birthYear, heightCm, activity }; goal: { weight, unit, targetW, targetDate };
 * training: { sessionMin } (the usual session length).
 */
export function nutritionTargets(profile, goal, training = {}, today) {
  const p = profile || {}
  if (!['male', 'female'].includes(p.sex) || !(p.birthYear > 1900) || !(p.heightCm > 100) || !ACTIVITY[p.activity]) return null
  if (!(goal?.weight > 0)) return null
  const weightKg = toKg(goal.weight, goal.unit)
  const targetKg = goal.targetW > 0 ? toKg(goal.targetW, goal.unit) : null
  const age = +today.slice(0, 4) - p.birthYear
  const rest0 = bmr({ sex: p.sex, age, heightCm: p.heightCm, weightKg })
  const daily = rest0 * ACTIVITY[p.activity]
  const rate = weeklyRate({ weightKg, targetKg, targetDate: goal.targetDate, today })
  const gap = rate.kgPerWeek * KCAL_PER_KG / 7
  const floor = Math.max(FLOOR[p.sex], Math.round(rest0))
  const workout = sessionKcal(weightKg, training.sessionMin > 0 ? training.sessionMin : 60)
  const losing = rate.kgPerWeek < 0
  // Protein: more while losing, to keep the muscle; read off the lower of now and the goal, so a
  // large body is not handed a number sized for its fat.
  const proteinKg = targetKg != null ? Math.min(weightKg, targetKg) : weightKg
  const protein = Math.round(proteinKg * (losing ? 2.2 : 1.8))
  const fat = Math.round(weightKg * 0.8)
  const day = extra => {
    const raw = daily + gap + extra
    const kcal = Math.round(Math.max(floor, raw) / 10) * 10
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
    return { kcal, protein, fat, carbs, floored: raw < floor }
  }
  return {
    maintenance: Math.round(daily / 10) * 10,
    workoutKcal: workout,
    rate,
    rest: day(0),
    training: day(workout),
  }
}

/**
 * Today's targets for a saved profile (lib/../store S): the profile on S.nutrition, the latest
 * weigh-in, the goal, and whether today has a planned session (effectiveRoutineIds, as Today
 * reads it) or a logged one. The session length is the
 * typical one of the last ten logged with a time, 60 minutes without any. Null until the profile
 * and a weigh-in exist.
 */
export function targetsForDay(S, today) {
  const bw = (S.bodyweight || []).at(-1)
  const recent = (S.workouts || []).map(w => workoutDuration(w) / 60000).filter(m => m >= 10 && m <= 240).slice(-10).sort((a, b) => a - b)
  const sessionMin = recent.length ? Math.round(recent[Math.floor(recent.length / 2)]) : 60
  const all = nutritionTargets(S.nutrition, { weight: bw?.w, unit: S.unit, targetW: S.targetW, targetDate: S.targetDate }, { sessionMin }, today)
  if (!all) return null
  // What Today shows as the day's session: the week, a day moved here, a rotation or coach week.
  const planned = effectiveRoutineIds(S, today, today).length > 0
  const trainingDay = planned || (S.workouts || []).some(w => w.d === today)
  return { ...all, sessionMin, trainingDay, day: trainingDay ? all.training : all.rest }
}
