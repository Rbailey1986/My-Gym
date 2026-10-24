import { describe, it, expect } from 'vitest'
import {
  GROUP_KINDS,
  normalizeGroupKind,
  groupMeta,
  setGroupMeta,
  syncGroupMeta,
} from './group-kinds.js'

describe('Complexes and interval groups beside supersets', () => {
  it('supports superset, complex, and interval group kinds', () => {
    expect(GROUP_KINDS).toEqual(['superset', 'complex', 'interval'])
    expect(normalizeGroupKind('complex')).toBe('complex')
    expect(normalizeGroupKind('interval')).toBe('interval')
    expect(normalizeGroupKind('unknown')).toBe('superset')
  })

  it('reads group meta with kind, name, and rest', () => {
    const list = [
      { id: '1', sg: 'g1', sgKind: 'complex', sgName: 'Barbell Complex', sgRest: 120 },
      { id: '2', sg: 'g1', sgKind: 'complex', sgName: 'Barbell Complex', sgRest: 120 },
    ]
    const meta = groupMeta(list, [0, 1])
    expect(meta).toEqual({
      kind: 'complex',
      name: 'Barbell Complex',
      rest: 120,
    })
  })

  it('sets group meta on all members of a group', () => {
    const ex = [
      { id: '1', sg: 'g1' },
      { id: '2', sg: 'g1' },
      { id: '3', sg: 'other' },
    ]
    setGroupMeta(ex, 'g1', { kind: 'interval', name: 'Tabata', rest: 60 })

    expect(ex[0]).toMatchObject({ sgKind: 'interval', sgName: 'Tabata', sgRest: 60 })
    expect(ex[1]).toMatchObject({ sgKind: 'interval', sgName: 'Tabata', sgRest: 60 })
    expect(ex[2].sgKind).toBeUndefined()
  })

  it('syncs group meta when members join or leave', () => {
    const ex = [
      { id: '1', sg: 'g1', sgKind: 'complex', sgName: 'Bear Complex', sgRest: 90 },
      { id: '2', sg: 'g1' }, // joined without meta
      { id: '3', sg: null, sgKind: 'complex', sgName: 'Bear Complex' }, // left group
    ]
    syncGroupMeta(ex)

    expect(ex[1].sgKind).toBe('complex')
    expect(ex[1].sgName).toBe('Bear Complex')
    expect(ex[1].sgRest).toBe(90)

    expect(ex[2].sgKind).toBeUndefined()
    expect(ex[2].sgName).toBeUndefined()
  })
})
