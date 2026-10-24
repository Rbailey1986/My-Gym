import { describe, it, expect } from 'vitest'
import {
  slotAlternatives,
  setSlotAlternatives,
  addSlotAlternative,
  removeSlotAlternative,
  swapSlotWithAlternative,
} from './slot-alternatives.js'

describe('Exercise alternatives per routine slot', () => {
  it('reads alternatives from a slot', () => {
    expect(slotAlternatives(null)).toEqual([])
    expect(slotAlternatives({ id: '0025' })).toEqual([])
    expect(slotAlternatives({ id: '0025', alts: ['0289', '0314'] })).toEqual(['0289', '0314'])
    expect(slotAlternatives({ id: '0025', alternatives: ['0289'] })).toEqual(['0289'])
  })

  it('sets and removes alternatives cleanly without duplicates or self-references', () => {
    const slot = { id: '0025', sets: 3, reps: 10 }
    const withAlts = setSlotAlternatives(slot, ['0289', '0025', '0314', '0289'])
    expect(withAlts.alts).toEqual(['0289', '0314'])

    const cleared = setSlotAlternatives(withAlts, [])
    expect(cleared.alts).toBeUndefined()
  })

  it('adds and removes single alternatives', () => {
    let slot = { id: '0025' }
    slot = addSlotAlternative(slot, '0289')
    expect(slotAlternatives(slot)).toEqual(['0289'])

    slot = addSlotAlternative(slot, '0314')
    expect(slotAlternatives(slot)).toEqual(['0289', '0314'])

    // Duplicate add does not repeat
    slot = addSlotAlternative(slot, '0289')
    expect(slotAlternatives(slot)).toEqual(['0289', '0314'])

    slot = removeSlotAlternative(slot, '0289')
    expect(slotAlternatives(slot)).toEqual(['0314'])
  })

  it('swaps a slot with an alternative and puts the previous exercise in the alternatives list', () => {
    const slot = { id: '0025', sets: 3, reps: 10, weight: 80, alts: ['0289', '0314'] }
    const swapped = swapSlotWithAlternative(slot, '0289', { routines: [] }, 'r1')

    expect(swapped.id).toBe('0289')
    expect(swapped.sets).toBe(3)
    expect(swapped.reps).toBe(10)
    // The previous exercise '0025' is now in the alternatives list
    expect(slotAlternatives(swapped)).toEqual(['0025', '0314'])
  })
})
