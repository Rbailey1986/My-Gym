import { describe, it, expect } from 'vitest'
import {
  makeLogItem,
  dayLog,
  mealTotals,
  dayTotals,
  addFoodToMeal,
  removeFoodFromMeal,
  plannedMealFor,
  eatPlannedMeal,
  isFavFood,
  toggleFavFood,
  favouriteFoods,
  recentFoods,
} from './food-log.js'

describe('food-log helpers', () => {
  it('logs items per meal and sums daily totals across meals', () => {
    const s = { foodLog: {}, favFoods: [] }
    const egg = makeLogItem('it-181100', 2, 'pieces', 'e1')
    const rice = makeLogItem('it-000100', 100, 'g', 'r1')
    expect(egg.grams).toBe(100)
    expect(egg.kcal).toBe(128)

    addFoodToMeal(s, '2026-10-24', 'breakfast', egg)
    addFoodToMeal(s, '2026-10-24', 'lunch', rice)

    const log = dayLog(s, '2026-10-24')
    expect(log.breakfast).toHaveLength(1)
    expect(log.lunch).toHaveLength(1)

    const totals = dayTotals(s, '2026-10-24')
    expect(totals.count).toBe(2)
    expect(totals.kcal).toBe(egg.kcal + rice.kcal)
    expect(totals.byMeal.breakfast.kcal).toBe(egg.kcal)
    expect(totals.byMeal.lunch.kcal).toBe(rice.kcal)

    removeFoodFromMeal(s, '2026-10-24', 'breakfast', 'e1')
    expect(dayTotals(s, '2026-10-24').count).toBe(1)
  })

  it('logs a planned meal in one tap, resolving ingredients through the table', () => {
    const s = {
      foodLog: {},
      mealPlan: {
        '2026-10-24': {
          dinner: {
            title: 'Pollo e riso',
            items: [
              { name: 'petto di pollo', amount: 150, unit: 'g' },
              { name: 'riso basmati', amount: 80, unit: 'g' },
            ],
          },
        },
      },
    }
    expect(plannedMealFor(s, '2026-10-24', 'dinner')?.title).toBe('Pollo e riso')
    expect(eatPlannedMeal(s, '2026-10-24', 'dinner')).toBe(true)

    const dinner = dayLog(s, '2026-10-24').dinner
    expect(dinner).toHaveLength(2)
    expect(dinner[0].foodId).toBe('it-106500')
    expect(dinner[1].foodId).toBe('it-000130')
    expect(mealTotals(dinner).kcal).toBeGreaterThan(350)
  })

  it('tracks favourite foods and recent foods with last-used portions', () => {
    const s = { foodLog: {}, favFoods: [] }
    toggleFavFood(s, 'it-181100')
    expect(isFavFood(s, 'it-181100')).toBe(true)

    addFoodToMeal(s, '2026-10-23', 'breakfast', makeLogItem('it-003030', 60, 'g'))
    addFoodToMeal(s, '2026-10-24', 'breakfast', makeLogItem('it-181100', 3, 'pieces'))

    const rec = recentFoods(s)
    expect(rec.map(r => r.food.id)).toEqual(['it-181100', 'it-003030'])
    expect(rec[0]).toMatchObject({ amount: 3, unit: 'pieces' })
    expect(rec[1]).toMatchObject({ amount: 60, unit: 'g' })

    const favs = favouriteFoods(s)
    expect(favs).toHaveLength(1)
    expect(favs[0]).toMatchObject({ amount: 3, unit: 'pieces' })

    toggleFavFood(s, 'it-181100')
    expect(isFavFood(s, 'it-181100')).toBe(false)
  })
})
