// The set you will do next in an open session, for the rest timer's "Up next" line. Pure, so the
// superset order is pinned down by a test instead of read off the screen.
//
// The current unit (A.cur's exercise, or its whole superset) goes first. Inside a superset the
// member with the fewest sets done is next, the earlier one on a tie, which is the A1 B1 A2 B2
// order the workout screen walks. A unit with nothing left hands over to the next unfinished one,
// wrapping round, the same rule the screen's own navigation uses (lib/supersetFlow.js).
import { supersetUnits } from './history.js'
import { isSideSet, isWarmupRow } from './workout-model.js'
import { nextUnfinishedUnit } from './supersetFlow.js'

const isOpen = s => isSideSet(s) ? !(s.sides.L.done && s.sides.R.done) : !s?.done
const doneCount = e => (e?.sets || []).filter(s => !isOpen(s)).length

// { idx, id, setNo, of, set, warmup } or null when every set is done.
export function upNext(A) {
  const entries = Array.isArray(A?.entries) ? A.entries : []
  if (!entries.length) return null
  const units = supersetUnits(entries)
  const cur = Number.isInteger(A.cur) && A.cur >= 0 && A.cur < entries.length ? A.cur : 0
  const open = idx => (entries[idx]?.sets || []).some(isOpen)
  let unit = units.find(u => u.includes(cur))
  if (!unit || !unit.some(open)) unit = nextUnfinishedUnit(entries, units, cur)
  if (!unit || !unit.some(open)) return null
  const idx = unit.filter(open).reduce((best, i) => doneCount(entries[i]) < doneCount(entries[best]) ? i : best, unit.filter(open)[0])
  const e = entries[idx]
  const at = e.sets.findIndex(isOpen)
  return { idx, id: e.id, setNo: at + 1, of: e.sets.length, set: e.sets[at], warmup: isWarmupRow(e.sets[at]) }
}
