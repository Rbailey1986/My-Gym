import { describe, expect, it } from 'vitest'
import { upNext } from './up-next.js'

const sets = (...done) => done.map(d => ({ w: 60, r: 8, done: d }))

describe('upNext', () => {
  it('is the first unchecked set of the current exercise', () => {
    const A = { cur: 0, entries: [{ id: 'a', sets: sets(true, false, false) }, { id: 'b', sets: sets(false) }] }
    expect(upNext(A)).toMatchObject({ idx: 0, id: 'a', setNo: 2, of: 3 })
  })

  it('moves on to the next exercise once the current one is done', () => {
    const A = { cur: 0, entries: [{ id: 'a', sets: sets(true, true) }, { id: 'b', sets: sets(false, false) }] }
    expect(upNext(A)).toMatchObject({ idx: 1, id: 'b', setNo: 1, of: 2 })
  })

  it('wraps round to an earlier exercise left unfinished', () => {
    const A = { cur: 2, entries: [{ id: 'a', sets: sets(true, false) }, { id: 'b', sets: sets(true) }, { id: 'c', sets: sets(true) }] }
    expect(upNext(A)).toMatchObject({ idx: 0, setNo: 2 })
  })

  it('alternates inside a superset: A1 B1 A2 B2', () => {
    const e = (id, ...d) => ({ id, sg: 'g', sets: sets(...d) })
    expect(upNext({ cur: 0, entries: [e('a', true, false), e('b', false, false)] })).toMatchObject({ id: 'b', setNo: 1 })
    expect(upNext({ cur: 1, entries: [e('a', true, false), e('b', true, false)] })).toMatchObject({ id: 'a', setNo: 2 })
  })

  it('counts a per-side set as done only when both sides are', () => {
    const side = (L, R) => ({ sides: { L: { w: 10, r: 8, done: L }, R: { w: 10, r: 8, done: R } } })
    const A = { cur: 0, entries: [{ id: 'a', sets: [side(true, true), side(true, false)] }] }
    expect(upNext(A)).toMatchObject({ setNo: 2 })
  })

  it('flags a warm-up row', () => {
    const A = { cur: 0, entries: [{ id: 'a', sets: [{ w: 20, r: 10, done: false, warmup: true }, { w: 60, r: 8, done: false }] }] }
    expect(upNext(A).warmup).toBe(true)
  })

  it('is null when every set is done, or there is no session', () => {
    expect(upNext({ cur: 0, entries: [{ id: 'a', sets: sets(true) }] })).toBe(null)
    expect(upNext(null)).toBe(null)
    expect(upNext({ entries: [] })).toBe(null)
  })
})
