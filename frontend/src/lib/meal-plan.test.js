import { describe, it, expect } from 'vitest'
import {
  recalcRecipe,
  generateWeeklyMealPlan,
  swapPlannedMeal,
  regeneratePlannedDay,
  partnerTargetForDay,
  candidateRecipesForSlot,
} from './meal-plan.js'
import { plannedMealFor, eatPlannedMeal, dayTotals } from './food-log.js'

function makeTestState(overrides = {}) {
  return {
    unit: 'kg',
    nutrition: { sex: 'male', birthYear: 1990, heightCm: 180, activity: 'moderate' },
    bodyweight: [{ d: '2026-04-20', w: 82 }],
    targetW: 76,
    targetDate: '2026-08-01',
    workouts: [],
    routines: [{ id: 'r1', name: 'Push', ex: [{ id: 'e1' }] }],
    week: { 1: ['r1'], 3: ['r1'], 5: ['r1'] }, // Mon, Wed, Fri training days
    dayPlan: {},
    foodPrefs: {
      diet: 'any',
      allergies: '',
      dislikes: '',
      likes: 'chicken, pasta',
      cookMin: 30,
      budget: 'mid',
      meals: 3,
      partner: { enabled: false, name: 'Wife', kcal: 1650 },
    },
    foodLog: {},
    mealPlan: null,
    ...overrides,
  }
}

describe('recalcRecipe', () => {
  it('recalculates ingredient and recipe macros from lib/foods.js instead of trusting AI numbers', () => {
    const aiRaw = {
      title: 'AI Chicken & Rice',
      meal: 'lunch',
      cookMin: 20,
      kcal: 9999, // bogus AI macro number that must be ignored
      protein: 999,
      ingredients: [
        { name: 'boneless skinless chicken breast', amount: 200, unit: 'g' },
        { name: 'extra virgin olive oil', amount: 10, unit: 'g' },
      ],
      steps: ['Cook chicken in olive oil.'],
    }
    const rec = recalcRecipe(aiRaw)
    expect(rec.ingredients[0].foodId).toBe('it-106500')
    expect(rec.ingredients[1].foodId).toBe('it-009210')
    // 200g chicken breast (~200 kcal, 46.6g P) + 10g olive oil (~90 kcal, 10g F)
    expect(rec.kcal).toBeGreaterThan(250)
    expect(rec.kcal).toBeLessThan(350)
    expect(rec.protein).toBeGreaterThan(40)
    expect(rec.fat).toBeGreaterThan(9)
  })

  it('scales portions to hit the slot calorie target and calculates partner shared portions', () => {
    const aiRaw = {
      title: 'Chicken & Rice',
      meal: 'lunch',
      ingredients: [
        { name: 'petto di pollo', foodId: 'it-106500', amount: 150, unit: 'g' },
        { name: 'riso brillato', amount: 80, unit: 'g' },
        { name: 'olio extravergine di oliva', foodId: 'it-009210', amount: 10, unit: 'g' },
      ],
      steps: ['Boil rice, sear chicken.'],
    }
    const rec = recalcRecipe(aiRaw, {
      slotTargetKcal: 750,
      partner: { name: 'Elena', ratio: 0.75 },
    })
    expect(rec.kcal).toBeGreaterThan(650)
    expect(rec.kcal).toBeLessThan(850)
    expect(rec.partner).not.toBeNull()
    expect(rec.partner.name).toBe('Elena')
    expect(rec.partner.kcal).toBeGreaterThan(480)
    expect(rec.partner.kcal).toBeLessThan(650)
    for (const ing of rec.ingredients) {
      expect(ing.partnerAmount).toBeGreaterThan(0)
      expect(ing.totalAmount).toBeCloseTo(ing.amount + ing.partnerAmount, 1)
    }
  })
})

describe('generateWeeklyMealPlan, swap, regenerate, and two-people scaling', () => {
  it('builds a 7-day plan distinguishing training days and rest days', () => {
    const S = makeTestState()
    const plan = generateWeeklyMealPlan(S, '2026-04-20') // 2026-04-20 is Monday (training day)
    expect(Object.keys(plan.days)).toHaveLength(7)
    const mon = plan.days['2026-04-20']
    const tue = plan.days['2026-04-21']
    expect(mon.trainingDay).toBe(true)
    expect(tue.trainingDay).toBe(false)
    expect(mon.targetKcal).toBeGreaterThan(tue.targetKcal)
    expect(mon.kcal).toBeGreaterThan(tue.kcal)
  })

  it('honours diet and allergy filters when selecting recipes', () => {
    const veganCands = candidateRecipesForSlot('lunch', { diet: 'vegan', allergies: 'spinach' })
    expect(veganCands.length).toBeGreaterThan(0)
    for (const r of veganCands) {
      expect(r.diet).toBe('vegan')
    }
  })

  it('swaps a single meal and regenerates a full day, and integrates with eatPlannedMeal', () => {
    const S = makeTestState({
      foodPrefs: {
        diet: 'any',
        allergies: '',
        dislikes: '',
        likes: '',
        cookMin: 30,
        budget: 'mid',
        meals: 4,
        partner: { enabled: true, name: 'Elena', kcal: 1650 },
      },
    })
    S.mealPlan = generateWeeklyMealPlan(S, '2026-04-20')
    expect(S.mealPlan.partner).toEqual({ name: 'Elena', kcal: 1650 })

    const beforeLunch = plannedMealFor(S, '2026-04-20', 'lunch')
    expect(beforeLunch).not.toBeNull()
    expect(beforeLunch.partner?.name).toBe('Elena')

    const swapped = swapPlannedMeal(S, '2026-04-20', 'lunch')
    expect(swapped.id).not.toBe(beforeLunch.id)
    expect(plannedMealFor(S, '2026-04-20', 'lunch').id).toBe(swapped.id)

    const prevBreakfastId = plannedMealFor(S, '2026-04-21', 'breakfast').id
    const regenDay = regeneratePlannedDay(S, '2026-04-21')
    expect(regenDay.breakfast.id).not.toBe(prevBreakfastId)

    // Log planned meal into foodLog via eatPlannedMeal
    expect(eatPlannedMeal(S, '2026-04-20', 'lunch')).toBe(true)
    expect(dayTotals(S, '2026-04-20').kcal).toBe(swapped.kcal)
  })

  it('computes partner targets from either direct kcal or body profile', () => {
    const S = makeTestState({
      foodPrefs: {
        diet: 'any',
        meals: 3,
        partner: {
          enabled: true,
          name: 'Sara',
          kcal: 0,
          sex: 'female',
          birthYear: 1992,
          heightCm: 165,
          weightKg: 60,
          activity: 'light',
          targetKg: 57,
        },
      },
    })
    const pt = partnerTargetForDay(S, '2026-04-20')
    expect(pt).not.toBeNull()
    expect(pt.name).toBe('Sara')
    expect(pt.kcal).toBeGreaterThan(1200)
    expect(pt.ratio).toBeGreaterThan(0.4)
  })
})
