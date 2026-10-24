/**
 * Exercise alternatives per routine slot.
 * Allows a routine slot to have preconfigured alternative exercises (e.g. dumbbell bench
 * or machine press for barbell bench press) for busy gyms or variations.
 */
import { replaceSlotExercise } from './routines.js'

/**
 * Returns the list of alternative exercise IDs configured on a routine slot.
 */
export function slotAlternatives(slot) {
  if (!slot) return []
  const alts = Array.isArray(slot.alts) ? slot.alts : (Array.isArray(slot.alternatives) ? slot.alternatives : [])
  return alts.filter(id => typeof id === 'string' && id.trim().length > 0 && id !== slot.id)
}

/**
 * Sets the alternatives on a slot. Clears the field if empty.
 */
export function setSlotAlternatives(slot, altIds) {
  const currentId = slot?.id
  const clean = [...new Set((altIds || []).filter(id => id && id !== currentId))]
  const next = { ...slot }
  if (clean.length > 0) {
    next.alts = clean
  } else {
    delete next.alts
    delete next.alternatives
  }
  return next
}

/**
 * Adds an alternative exercise ID to a slot.
 */
export function addSlotAlternative(slot, altId) {
  if (!altId || altId === slot?.id) return { ...slot }
  const current = slotAlternatives(slot)
  if (current.includes(altId)) return { ...slot }
  return setSlotAlternatives(slot, [...current, altId])
}

/**
 * Removes an alternative exercise ID from a slot.
 */
export function removeSlotAlternative(slot, altId) {
  const current = slotAlternatives(slot)
  return setSlotAlternatives(slot, current.filter(id => id !== altId))
}

/**
 * Swaps a routine slot to one of its alternatives while preserving the alternatives list
 * (with the previous exercise swapped into the alternatives list).
 */
export function swapSlotWithAlternative(slot, altId, S, rid) {
  if (!slot || !altId || slot.id === altId) return { ...slot }
  const oldId = slot.id
  const oldAlts = slotAlternatives(slot)

  // Replace using routines engine
  const replaced = replaceSlotExercise(slot, altId, S, rid)

  // Keep alternatives, swapping oldId into the list in place of altId
  const nextAlts = oldAlts.map(id => id === altId ? oldId : id)
  if (!nextAlts.includes(oldId)) nextAlts.push(oldId)

  return setSlotAlternatives(replaced, nextAlts)
}
