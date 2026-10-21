// Desktop build: routines saved before the catalogue was cut down to home exercises can still
// name a barbell or machine lift it no longer has. Each one with a stand-in in lib/home-subs.js
// (every starter-plan exercise has one) is swapped for it, sets and reps unchanged. Logged
// workouts are left alone: the log is what happened. A no-op wherever HOME_SUBS is empty.
import { HOME_SUBS } from './home-subs.js'
import { EXIDX } from './exercises.js'

const swapFor = id => {
  const to = HOME_SUBS[id]
  return to && !EXIDX[id] && EXIDX[to] ? to : null
}

export const needsHomeSwap = S => (S.routines || []).some(r => (r.ex || []).some(x => swapFor(x.id)))

/** Rewrites S.routines in place; returns how many exercises were swapped. */
export function swapToHomeExercises(S) {
  let n = 0
  for (const r of S.routines || []) {
    const ids = new Set((r.ex || []).map(x => x.id))
    for (const x of r.ex || []) {
      const to = swapFor(x.id)
      if (!to || ids.has(to)) continue
      ids.add(to)
      x.id = to
      n++
    }
  }
  return n
}
