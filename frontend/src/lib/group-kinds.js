/**
 * Complexes and interval groups beside supersets.
 * Extends routine and session exercise groupings with distinct execution modes:
 * - 'superset': alternate between exercises across rounds
 * - 'complex': back-to-back sequence with the same load before resting
 * - 'interval': timed interval circuit / work-rest rounds
 */
import { SG_NAME_MAX } from './superset-meta.js'

export const GROUP_KINDS = Object.freeze(['superset', 'complex', 'interval'])

const fieldsOf = (item, onTarget) => (onTarget ? item?.target : item) || {}

export function normalizeGroupKind(kind) {
  if (kind === 'complex' || kind === 'interval') return kind
  return 'superset'
}

/**
 * Returns { kind, name, rest } for the group of `unit` (indices into `list`).
 */
export function groupMeta(list, unit, { onTarget = false } = {}) {
  let name = '', rest = 0, kind = 'superset'
  for (const idx of unit || []) {
    const f = fieldsOf(list?.[idx], onTarget)
    if (!name && typeof f.sgName === 'string' && f.sgName.trim()) name = f.sgName.trim().slice(0, SG_NAME_MAX)
    if (!rest && Number(f.sgRest) > 0) rest = Math.round(Number(f.sgRest))
    if (f.sgKind && GROUP_KINDS.includes(f.sgKind)) kind = f.sgKind
  }
  return { kind, name, rest }
}

/**
 * Writes kind, name and rest onto every member of group `sg` in a routine's `ex`.
 */
export function setGroupMeta(ex, sg, { kind = 'superset', name = '', rest = 0 } = {}) {
  const cleanKind = normalizeGroupKind(kind)
  const cleanName = String(name || '').trim().slice(0, SG_NAME_MAX)
  const sec = Number(rest) > 0 ? Math.round(Number(rest)) : 0
  for (const e of ex || []) {
    if (!e || !sg || e.sg !== sg) continue
    if (cleanKind !== 'superset') e.sgKind = cleanKind; else delete e.sgKind
    if (cleanName) e.sgName = cleanName; else delete e.sgName
    if (sec) e.sgRest = sec; else delete e.sgRest
  }
  return ex
}

/**
 * Syncs kind, name, and rest across all members of each group.
 */
export function syncGroupMeta(ex) {
  const groups = new Map()
  for (const e of ex || []) {
    if (!e?.sg) {
      if (e) { delete e.sgKind; delete e.sgName; delete e.sgRest }
      continue
    }
    const g = groups.get(e.sg) || { kind: 'superset', name: '', rest: 0 }
    if (g.kind === 'superset' && e.sgKind) g.kind = e.sgKind
    if (!g.name && e.sgName) g.name = e.sgName
    if (!g.rest && Number(e.sgRest) > 0) g.rest = Number(e.sgRest)
    groups.set(e.sg, g)
  }
  for (const [sg, g] of groups) setGroupMeta(ex, sg, g)
  return ex
}
