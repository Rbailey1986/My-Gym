import { describe, it, expect } from 'vitest'
import { searchFoods, matchIngredient, macrosFor, pieceGrams, foodById, UNITS } from './foods.js'

describe('searchFoods', () => {
  it('finds Italian foods by Italian name, ignoring accents and case', () => {
    expect(searchFoods('FARRO')[0].n.toLowerCase()).toContain('farro')
    expect(searchFoods('alta qualita').length).toBeGreaterThan(0)
  })
  it('finds foods by English name too', () => {
    expect(searchFoods('mozzarella').some(f => f.src === 'it')).toBe(true)
    expect(searchFoods('mozzarella').some(f => f.src === 'uk')).toBe(true)
  })
  it('matches singular and plural forms in Italian and English', () => {
    expect(searchFoods('mela')[0].n).toMatch(/^Mele\b/)
    expect(searchFoods('cipolla')[0].n).toMatch(/^Cipolle\b/)
    expect(searchFoods('uovo')[0].id).toBe('it-181100')
    expect(searchFoods('banana')[0].n).toMatch(/^Banane\b/)
  })
  it('ignores prepositions like "di" in multi-word searches', () => {
    expect(searchFoods('petto di pollo')[0].id).toBe('it-106500')
    expect(searchFoods('olio extravergine di oliva')[0].id).toBe('it-009210')
  })
  it('needs every content word to match', () => {
    const r = searchFoods('pollo petto')
    expect(r.length).toBeGreaterThan(0)
    for (const f of r) expect(f.n.toLowerCase()).toMatch(/pollo|petto/)
    expect(searchFoods('zzzzqq')).toEqual([])
    expect(searchFoods('   ')).toEqual([])
  })
  it('respects the limit', () => expect(searchFoods('cotto', 5).length).toBeLessThanOrEqual(5))
})

describe('matchIngredient', () => {
  it('matches noisy English and Italian AI recipe ingredients to table entries', () => {
    expect(matchIngredient('boneless skinless chicken breast, diced')?.id).toBe('it-106500')
    expect(matchIngredient('petto di pollo a fette')?.id).toBe('it-106500')
    expect(matchIngredient('petto di tacchino')?.id).toBe('it-106850')
    expect(matchIngredient('extra virgin olive oil')?.id).toBe('it-009210')
    expect(matchIngredient('olio evo')?.id).toBe('it-009210')
    expect(matchIngredient('rolled oats')?.id).toBe('it-003030')
    expect(matchIngredient('greek yogurt')?.id).toBe('it-150030')
    expect(matchIngredient('uova')?.id).toBe('it-181100')
    expect(matchIngredient('whole eggs')?.id).toBe('uk-12-937')
    expect(matchIngredient("albume d'uovo")?.id).toBe('it-182010')
    expect(matchIngredient('tonno al naturale sgocciolato')?.id).toBe('it-123550')
    expect(matchIngredient('ground beef')?.id).toBe('uk-18-469')
    expect(matchIngredient('macinato di manzo')?.id).toBe('uk-18-469')
    expect(matchIngredient('fiocchi di latte')?.id).toBe('uk-12-539')
    expect(matchIngredient('patate dolci')?.n).toMatch(/^Sweet potato\b/)
    expect(matchIngredient('passata di pomodoro')?.id).toBe('it-006670')
    expect(matchIngredient('parmigiano reggiano grattugiato')?.id).toBe('it-166000')
    expect(matchIngredient('2 spicchi di aglio tritati')?.id).toBe('it-005000')
    expect(matchIngredient('red onion, finely chopped')?.id).toBe('it-005300')
    expect(matchIngredient('spaghetti integrali')?.id).toBe('it-000850')
  })
  it('returns null when nothing can match', () => {
    expect(matchIngredient('')).toBeNull()
    expect(matchIngredient(null)).toBeNull()
    expect(matchIngredient('zzzzqqq')).toBeNull()
  })
})

describe('macrosFor and pieceGrams', () => {
  const rice = { id: 'x', n: 'Rice', k: 350, p: 7, f: 1, c: 78 }
  it('scales per 100 g', () => {
    expect(macrosFor(rice, 50)).toEqual({ kcal: 175, protein: 3.5, fat: 0.5, carbs: 39, grams: 50 })
  })
  it('converts fixed units', () => {
    expect(macrosFor(rice, 1, 'kg').kcal).toBe(3500)
    expect(macrosFor(rice, 1, 'tbsp').grams).toBe(UNITS.tbsp)
    expect(macrosFor(rice, 1, 'cup').grams).toBe(UNITS.cup)
  })
  it('sizes pieces from the food or its standard portion', () => {
    const egg = foodById('it-181100')
    const garlic = foodById('it-005000')
    const banana = foodById('it-007510')
    expect(pieceGrams(egg)).toBe(50)
    expect(pieceGrams(garlic)).toBe(5)
    expect(pieceGrams(banana)).toBe(120)
    expect(macrosFor(egg, 2, 'pieces').grams).toBe(100)
    expect(macrosFor(egg, 2, 'piece').kcal).toBe(egg.k)
    expect(macrosFor(garlic, 2, 'pieces').grams).toBe(10)
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
