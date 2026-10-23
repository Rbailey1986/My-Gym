// Where a body-weight goal stands: how far along it is, how fast the recent weigh-ins are moving,
// and when that pace would reach it. Read by the Today dashboard; pure, so the projection is
// tested rather than eyeballed.
//
// The rate is a least-squares line through the last TREND_DAYS of weigh-ins, not the gap between
// the last two: day-to-day water swings of a kilo would otherwise flip the forecast every morning.

const DAY = 86400000
export const TREND_DAYS = 28
const MIN_POINTS = 3
const MIN_SPAN_DAYS = 7
const MAX_ETA_DAYS = 3 * 365

const dayNum = iso => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY)
const isoOfDay = n => new Date(n * DAY).toISOString().slice(0, 10)

// Weight change per day over the window ending `today`, or null when there is too little to go on.
export function trendPerDay(bodyweight, today, days = TREND_DAYS) {
  const end = dayNum(today)
  const pts = (bodyweight || [])
    .filter(b => b && typeof b.w === 'number' && typeof b.d === 'string')
    .map(b => ({ x: dayNum(b.d), y: b.w }))
    .filter(p => p.x <= end && p.x > end - days)
  if (pts.length < MIN_POINTS) return null
  const xs = pts.map(p => p.x)
  if (Math.max(...xs) - Math.min(...xs) < MIN_SPAN_DAYS) return null
  const mx = xs.reduce((a, b) => a + b, 0) / pts.length
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length
  let num = 0, den = 0
  for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2 }
  return den ? num / den : null
}

// status: 'reached' | 'on-track' (the trend heads for the target) | 'away' (it heads the other
// way) | 'flat' (no measurable change) | 'unknown' (too few recent weigh-ins).
export function goalProgress(S, today) {
  const bw = (S.bodyweight || []).filter(b => b && typeof b.w === 'number')
  const target = typeof S.targetW === 'number' ? S.targetW : null
  if (target == null || !bw.length) return null
  const start = bw[0].w
  const current = bw[bw.length - 1].w
  const remaining = target - current
  const span = start - target
  const pct = Math.abs(span) < 1e-9 ? (Math.abs(remaining) < 0.05 ? 1 : 0)
    : Math.min(1, Math.max(0, (start - current) / span))
  const slope = trendPerDay(bw, today)
  const ratePerWeek = slope == null ? null : slope * 7
  const base = { start, current, target, remaining, pct, ratePerWeek, eta: null }
  if (Math.abs(remaining) < 0.05) return { ...base, pct: 1, status: 'reached' }
  if (slope == null) return { ...base, status: 'unknown' }
  if (Math.abs(ratePerWeek) < 0.05) return { ...base, status: 'flat' }
  if (Math.sign(slope) !== Math.sign(remaining)) return { ...base, status: 'away' }
  // The epsilon keeps a float like 29.000000000004 from rounding up to a day later.
  const days = Math.ceil(remaining / slope - 1e-9)
  return { ...base, status: 'on-track', eta: days <= MAX_ETA_DAYS ? isoOfDay(dayNum(today) + days) : null }
}
