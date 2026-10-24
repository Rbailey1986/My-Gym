import { describe, it, expect } from 'vitest'
import { searchFoods, macrosFor, foodById, UNITS } from './foods.js'

describe('searchFoods', () => {
  it('finds Italian foods by Italian name, ignoring accents and case', () => {
    expect(searchFoods('FARRO')[0].n.toLowerCase()).toContain('farro')
    expect(searchFoods('alta qualita').length).toBeGreaterThan(0)
  })
  it('finds foods by English name too', () => {
    expect(searchFoods('mozzarella').some(f => f.src === 'it')).toBe(true)
    expect(searchFoods('mozzarella').some(f => f.src === 'uk')).toBe(true)
  })
  it('needs every word to match', () => {
    const r = searchFoods('pollo petto')
    expect(r.length).toBeGreaterThan(0)
    for (const f of r) expect(f.n.toLowerCase()).toMatch(/pollo|petto/)
    expect(searchFoods('zzzzqq')).toEqual([])
    expect(searchFoods('   ')).toEqual([])
  })
  it('respects the limit', () => expect(searchFoods('cotto', 5).length).toBeLessThanOrEqual(5))
})

describe('macrosFor', () => {
  const rice = { id: 'x', n: 'Rice', k: 350, p: 7, f: 1, c: 78 }
  it('scales per 100 g', () => {
    expect(macrosFor(rice, 50)).toEqual({ kcal: 175, protein: 3.5, fat: 0.5, carbs: 39, grams: 50 })
  })
  it('converts units', () => {
    expect(macrosFor(rice, 1, 'kg').kcal).toBe(3500)
    expect(macrosFor(rice, 1, 'tbsp').grams).toBe(UNITS.tbsp)
  })
  it('leaves out figures the food does not have', () => {
    expect('fibre' in macrosFor(rice, 100)).toBe(false)
  })
  it('rejects a bad unit or amount', () => {
    expect(macrosFor(rice, 5, 'furlong')).toBeNull()
    expect(macrosFor(rice, -1)).toBeNull()
    expect(macrosFor(null, 5)).toBeNull()
  })
})

describe('foodById', () => {
  it('round-trips an id from the table', () => {
    const f = searchFoods('farro')[0]
    expect(foodById(f.id)).toBe(f)
  })
})
