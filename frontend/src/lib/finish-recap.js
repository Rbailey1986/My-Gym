// What the finish summary says about a session against the ones before it: the last time the same
// routine was trained and how the volume and time moved since. Pure, read-only.
//
// "Same routine" is the same set of routine ids, in any order: a combined Push + Pull day is held
// against the last Push + Pull, not against a lone Push. A freestyle session has no routine and
// so nothing to compare with. Earlier means an earlier day, or the same day and an earlier start.
import { workoutVolume, workoutDuration } from './history.js'

const idsOf = w => [...new Set([].concat(w?.routineIds ?? (w?.routineId ? [w.routineId] : [])).filter(id => id != null))].sort()
const sameIds = (a, b) => a.length === b.length && a.every((id, i) => id === b[i])
const before = (a, b) => (a.d || '') < (b.d || '') || ((a.d || '') === (b.d || '') && (a.start || 0) < (b.start || 0))

export function previousSameRoutine(workouts, w) {
  const ids = idsOf(w)
  if (!ids.length) return null
  let best = null
  for (const x of workouts || []) {
    if (x === w || (w.id != null && x.id === w.id)) continue
    if (!sameIds(idsOf(x), ids) || !before(x, w)) continue
    if (!best || before(best, x)) best = x
  }
  return best
}

// { prev, volDelta, volPct, durDelta } or null when there is nothing to compare with. volPct is
// null when the earlier session moved no load (bodyweight or cardio only), where a share of zero
// means nothing.
export function finishRecap(workouts, w) {
  const prev = previousSameRoutine(workouts, w)
  if (!prev) return null
  const vol = workoutVolume(w), pvol = workoutVolume(prev)
  const dur = workoutDuration(w), pdur = workoutDuration(prev)
  return {
    prev,
    volDelta: vol - pvol,
    volPct: pvol > 0 ? (vol - pvol) / pvol : null,
    // workoutDuration reads a missing start or end as 0; a session without times has no delta.
    durDelta: dur > 0 && pdur > 0 ? dur - pdur : null,
  }
}
