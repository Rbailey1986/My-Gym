import { describe, it, expect } from 'vitest'
import {
  aisleForIngredient,
  buildShoppingList,
  toggleItemChecked,
  toggleItemInCupboard,
  clearCheckedState,
  formatQuantity,
  AISLE_KEYS,
  AISLE_LABELS,
} from './shopping-list.js'

describe('shopping-list: aisle categorization', () => {
  it('maps known CREA foods by cat', () => {
    // it-005000 is Garlic ('Verdure e ortaggi') -> produce
    expect(aisleForIngredient({ foodId: 'it-005000', name: 'Garlic' })).toBe('produce')
    // it-181100 is Eggs ('Uova') -> dairy_eggs
    expect(aisleForIngredient({ foodId: 'it-181100', name: 'Eggs' })).toBe('dairy_eggs')
    // it-001120 is Bread ('Cereali e derivati') -> bakery_grains
    expect(aisleForIngredient({ foodId: 'it-001120', name: 'Bread' })).toBe('bakery_grains')
    // it-009210 is Extra virgin olive oil ('Oli e grassi') -> pantry_oils
    expect(aisleForIngredient({ foodId: 'it-009210', name: 'Olive oil' })).toBe('pantry_oils')
  })

  it('infers aisle by name keywords when foodId is missing', () => {
    expect(aisleForIngredient({ name: 'Fresh chicken breast' })).toBe('meat_seafood')
    expect(aisleForIngredient({ name: 'Petto di pollo' })).toBe('meat_seafood')
    expect(aisleForIngredient({ name: 'Greek yogurt' })).toBe('dairy_eggs')
    expect(aisleForIngredient({ name: 'Rolled oats' })).toBe('bakery_grains')
    expect(aisleForIngredient({ name: 'Avocado' })).toBe('produce')
    expect(aisleForIngredient({ name: 'Spinaci' })).toBe('produce')
    expect(aisleForIngredient({ name: 'Balsamic vinegar' })).toBe('pantry_oils')
    expect(aisleForIngredient({ name: 'Toothpaste' })).toBe('other')
  })
})

describe('shopping-list: buildShoppingList aggregation', () => {
  const dummyMealPlan = {
    days: {
      '2026-10-25': {
        meals: {
          breakfast: {
            title: 'Yogurt Bowl',
            ingredients: [
              { foodId: 'it-150030', name: 'Greek yogurt', amount: 200, unit: 'g', grams: 200 },
              { foodId: 'it-007510', name: 'Banana', amount: 1, unit: 'pieces', grams: 100 },
            ],
          },
          lunch: {
            title: 'Chicken Salad',
            ingredients: [
              { name: 'Chicken breast', amount: 200, unit: 'g', grams: 200 },
              { name: 'Olive oil', amount: 10, unit: 'g', grams: 10 },
            ],
          },
        },
      },
      '2026-10-26': {
        meals: {
          breakfast: {
            title: 'Oatmeal & Yogurt',
            ingredients: [
              { foodId: 'it-150030', name: 'Greek yogurt', amount: 150, unit: 'g', grams: 150 },
              { foodId: 'it-003030', name: 'Rolled oats', amount: 60, unit: 'g', grams: 60 },
            ],
          },
          dinner: {
            title: 'Chicken Rice',
            ingredients: [
              { name: 'Chicken breast', amount: 250, unit: 'g', grams: 250, totalAmount: 450 },
              { name: 'Olive oil', amount: 15, unit: 'g', grams: 15 },
            ],
          },
        },
      },
    },
  }

  it('merges identical ingredients across days and meals', () => {
    const list = buildShoppingList(dummyMealPlan)
    expect(list.items.length).toBe(5)

    // Greek yogurt merged (200 + 150 = 350 g)
    const yogurt = list.items.find(i => i.name === 'Greek yogurt')
    expect(yogurt).toBeDefined()
    expect(yogurt.amount).toBe(350)
    expect(yogurt.sources).toEqual(['Yogurt Bowl', 'Oatmeal & Yogurt'])

    // Olive oil merged (10 + 15 = 25 g)
    const oil = list.items.find(i => i.name === 'Olive oil')
    expect(oil).toBeDefined()
    expect(oil.amount).toBe(25)

    // Chicken breast: uses totalAmount for partner scaling when present (200 + 450 = 650)
    const chicken = list.items.find(i => i.name === 'Chicken breast')
    expect(chicken).toBeDefined()
    expect(chicken.amount).toBe(650)
  })

  it('groups items into standard aisles', () => {
    const list = buildShoppingList(dummyMealPlan)
    expect(Object.keys(list.byAisle)).toEqual(AISLE_KEYS)

    // Dairy & eggs should have yogurt
    expect(list.byAisle.dairy_eggs.some(i => i.name === 'Greek yogurt')).toBe(true)
    // Produce should have banana
    expect(list.byAisle.produce.some(i => i.name === 'Banana')).toBe(true)
    // Meat & seafood should have chicken
    expect(list.byAisle.meat_seafood.some(i => i.name === 'Chicken breast')).toBe(true)
    // Bakery & grains should have oats
    expect(list.byAisle.bakery_grains.some(i => i.name === 'Rolled oats')).toBe(true)
    // Pantry & oils should have olive oil
    expect(list.byAisle.pantry_oils.some(i => i.name === 'Olive oil')).toBe(true)
  })

  it('supports custom items and existing checklist state', () => {
    const customItems = [
      { id: 'c1', name: 'Sparkling water', amount: 6, unit: 'bottles', aisle: 'other' },
    ]
    const yogurtId = 'item-food_it-150030_g'
    const existingState = {
      [yogurtId]: { checked: true },
      c1: { inCupboard: true },
    }

    const list = buildShoppingList(dummyMealPlan, { existingState, customItems })
    const yogurt = list.items.find(i => i.name === 'Greek yogurt')
    expect(yogurt.checked).toBe(true)

    const water = list.items.find(i => i.id === 'c1')
    expect(water.inCupboard).toBe(true)
    expect(water.isCustom).toBe(true)

    // Stats: total 6 items (5 meal plan + 1 custom)
    // In cupboard: 1 (water)
    // To buy: 5
    // Checked: 1 (yogurt)
    // Progress: 20%
    expect(list.stats.totalItems).toBe(6)
    expect(list.stats.inCupboardCount).toBe(1)
    expect(list.stats.toBuyCount).toBe(5)
    expect(list.stats.checkedCount).toBe(1)
    expect(list.stats.progressPct).toBe(20)
  })

  it('handles empty or missing meal plans gracefully', () => {
    const list = buildShoppingList(null)
    expect(list.items).toEqual([])
    expect(list.stats.totalItems).toBe(0)
    expect(list.stats.progressPct).toBe(100)
  })
})

describe('shopping-list: state mutations and formatting', () => {
  it('toggles checked and inCupboard states', () => {
    let state = {}
    state = toggleItemChecked(state, 'item-1')
    expect(state['item-1'].checked).toBe(true)

    state = toggleItemChecked(state, 'item-1')
    expect(state['item-1'].checked).toBe(false)

    // Marking as in cupboard unchecks it
    state = toggleItemChecked(state, 'item-1')
    expect(state['item-1'].checked).toBe(true)
    state = toggleItemInCupboard(state, 'item-1')
    expect(state['item-1'].inCupboard).toBe(true)
    expect(state['item-1'].checked).toBe(false)

    state = toggleItemInCupboard(state, 'item-1')
    expect(state['item-1'].inCupboard).toBe(false)
  })

  it('clearCheckedState removes checked flags while preserving cupboard', () => {
    const state = {
      'item-1': { checked: true },
      'item-2': { checked: true, inCupboard: true },
      'item-3': { inCupboard: true },
    }
    const cleared = clearCheckedState(state)
    expect(cleared['item-1']).toBeUndefined()
    expect(cleared['item-2']).toEqual({ checked: false, inCupboard: true })
    expect(cleared['item-3']).toEqual({ checked: false, inCupboard: true })
  })

  it('formats quantities nicely', () => {
    expect(formatQuantity(250, 'g')).toBe('250 g')
    expect(formatQuantity(1500, 'g')).toBe('1.5 kg')
    expect(formatQuantity(1, 'pieces')).toBe('1 pc')
    expect(formatQuantity(3, 'pieces')).toBe('3 pcs')
    expect(formatQuantity(2, 'tbsp')).toBe('2 tbsp')
  })

  it('provides aisle translations for English and Italian', () => {
    expect(AISLE_LABELS.en.produce).toBe('Produce')
    expect(AISLE_LABELS.it.produce).toBe('Ortofrutta')
    expect(AISLE_LABELS.it.meat_seafood).toBe('Carne e pesce')
    expect(AISLE_LABELS.it.dairy_eggs).toBe('Latticini e uova')
  })
})
