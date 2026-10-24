// Shopping list generation from weekly meal plans (lib/meal-plan.js),
// ingredient aggregation, aisle grouping, and mobile shopping checklist state.
//
// Features:
// - Aggregates ingredients across 7 planned days (or custom day ranges).
// - Merges identical ingredients (by foodId or normalized name) summing amounts.
// - Supports partner scaling (totalAmount when cooking for two).
// - Groups items into standard supermarket aisles in shopping walk order.
// - Tracks mobile checklist state: checked (bought in shop) and inCupboard (already owned).
// - Allows adding custom items, deleting items, and clearing checked items.

import { foodById } from './foods.js'

export const AISLE_KEYS = [
  'produce',
  'meat_seafood',
  'dairy_eggs',
  'bakery_grains',
  'pantry_oils',
  'other',
]

export const AISLE_LABELS = {
  en: {
    produce: 'Produce',
    meat_seafood: 'Meat & Seafood',
    dairy_eggs: 'Dairy & Eggs',
    bakery_grains: 'Bakery & Grains',
    pantry_oils: 'Pantry & Condiments',
    other: 'Other',
  },
  it: {
    produce: 'Ortofrutta',
    meat_seafood: 'Carne e pesce',
    dairy_eggs: 'Latticini e uova',
    bakery_grains: 'Pane, cereali e legumi',
    pantry_oils: 'Dispensa e condimenti',
    other: 'Altro',
  },
}

// Map CREA/CoFID category strings to aisle keys.
const CAT_TO_AISLE = {
  'Verdure e ortaggi': 'produce',
  'Frutta': 'produce',
  'Carni fresche': 'meat_seafood',
  'Carni trasformate e conservate': 'meat_seafood',
  'Frattaglie': 'meat_seafood',
  'Fast-food a base di carne': 'meat_seafood',
  'Prodotti della pesca': 'meat_seafood',
  'Latte e yogurt': 'dairy_eggs',
  'Formaggi e latticini': 'dairy_eggs',
  'Uova': 'dairy_eggs',
  'Cereali e derivati': 'bakery_grains',
  'Legumi': 'bakery_grains',
  'Oli e grassi': 'pantry_oils',
  'Frutta secca a guscio e semi oleaginosi': 'pantry_oils',
  'Dolci': 'pantry_oils',
  'Prodotti vari': 'pantry_oils',
  'Bevande alcoliche': 'pantry_oils',
}

const PRODUCE_RE = /\b(apple|banana|orange|berry|berries|spinach|tomato|potato|salad|lettuce|onion|garlic|carrot|broccoli|courgette|zucchini|pepper|cucumber|avocado|lemon|lime|mela|banan[ae]|aranci[ae]|spinac[ih]|pomodor[io]|patat[ae]|lattuga|cipoll[ae]|agli[o]|carot[ae]|broccol[io]|zucchina|peperon[ei]|cetriol[io]|limon[ei])\b/i
const MEAT_RE = /\b(chicken|beef|turkey|pork|lamb|salmon|tuna|fish|prawn|shrimp|cod|bacon|ham|polletto|pollo|manzo|tacchino|maiale|salmone|tonno|pesce|gamber[io]|merluzzo|prosciutto)\b/i
const DAIRY_RE = /\b(milk|yogurt|cheese|ricotta|egg|eggs|parmigiano|mozzarella|cottage|whey|latte|uov[ao]|formaggi[o]|albume)\b/i
const GRAINS_RE = /\b(bread|rice|oat|oats|pasta|spaghetti|penne|quinoa|couscous|flour|bean|beans|chickpea|chickpeas|lentil|lentils|pane|riso|avena|farina|fagiol[io]|cec[ih]|lenticchi[ae])\b/i
const PANTRY_RE = /\b(oil|olive oil|vinegar|salt|pepper|honey|sugar|walnut|almond|nut|nuts|mustard|sauce|olio|aceto|sale|pepe|miele|zucchero|noc[ie]|mandorl[ae])\b/i

/**
 * Determine the supermarket aisle for an ingredient item.
 */
export function aisleForIngredient(item) {
  if (item?.foodId) {
    const food = foodById(item.foodId)
    if (food?.cat && CAT_TO_AISLE[food.cat]) {
      return CAT_TO_AISLE[food.cat]
    }
  }

  const name = String(item?.name || item?.item || '').toLowerCase()
  if (PRODUCE_RE.test(name)) return 'produce'
  if (MEAT_RE.test(name)) return 'meat_seafood'
  if (DAIRY_RE.test(name)) return 'dairy_eggs'
  if (GRAINS_RE.test(name)) return 'bakery_grains'
  if (PANTRY_RE.test(name)) return 'pantry_oils'
  return 'other'
}

const round1 = x => Math.round(x * 10) / 10

/**
 * Normalize an ingredient name for grouping key.
 */
function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

/**
 * Build a merged shopping list from a meal plan object.
 *
 * @param {Object} mealPlan The S.mealPlan object with a `days` map.
 * @param {Object} [options]
 * @param {string[]} [options.days] Explicit ISO dates to include (defaults to all days in plan).
 * @param {string} [options.lang='en'] Display language ('en' | 'it').
 * @param {Object} [options.existingState] State map { [itemId]: { checked, inCupboard } } to preserve user ticks.
 * @param {Array} [options.customItems] User-added custom items [{ id, name, amount, unit, aisle, checked, inCupboard }].
 * @returns {Object} Structured shopping list with aisles, items, and statistics.
 */
export function buildShoppingList(mealPlan, {
  days = null,
  lang = 'en',
  existingState = {},
  customItems = [],
} = {}) {
  const planDays = mealPlan?.days || {}
  const activeDates = Array.isArray(days) && days.length > 0
    ? days
    : Object.keys(planDays).sort()

  const aggregated = new Map()

  for (const iso of activeDates) {
    const day = planDays[iso]
    if (!day || !day.meals) continue

    for (const [mealKey, meal] of Object.entries(day.meals)) {
      if (!meal || !Array.isArray(meal.ingredients)) continue
      const mealTitle = meal.title || mealKey

      for (const ing of meal.ingredients) {
        if (!ing || (!ing.name && !ing.foodName)) continue
        const rawName = ing.name || ing.foodName
        const normKey = ing.foodId ? `food:${ing.foodId}` : `name:${normalizeName(rawName)}`
        const unit = (ing.unit || 'g').trim().toLowerCase()
        const key = `${normKey}:${unit}`

        // Total amount accounting for two-person portioning when present
        const effectiveAmount = ing.totalAmount != null ? ing.totalAmount : (ing.amount || 0)
        const effectiveGrams = ing.grams || 0

        if (aggregated.has(key)) {
          const entry = aggregated.get(key)
          entry.amount = round1(entry.amount + effectiveAmount)
          entry.grams = round1(entry.grams + effectiveGrams)
          if (!entry.sources.includes(mealTitle)) {
            entry.sources.push(mealTitle)
          }
        } else {
          aggregated.set(key, {
            id: 'item-' + key.replace(/[^a-zA-Z0-9_-]/g, '_'),
            foodId: ing.foodId || null,
            name: rawName,
            nameIt: ing.nameIt || null,
            amount: round1(effectiveAmount),
            unit: ing.unit || 'g',
            grams: round1(effectiveGrams),
            aisle: aisleForIngredient(ing),
            sources: [mealTitle],
          })
        }
      }
    }
  }

  // Combine items into array and attach state
  const items = Array.from(aggregated.values()).map(item => {
    const state = existingState[item.id] || {}
    const displayName = (lang === 'it' && item.nameIt) ? item.nameIt : item.name
    return {
      ...item,
      displayName,
      checked: !!state.checked,
      inCupboard: !!state.inCupboard,
    }
  })

  // Append custom items
  if (Array.isArray(customItems)) {
    for (const c of customItems) {
      if (!c || !c.name) continue
      const state = existingState[c.id] || {}
      items.push({
        id: c.id || ('custom-' + Math.random().toString(36).slice(2, 9)),
        name: c.name,
        displayName: c.name,
        amount: c.amount || 1,
        unit: c.unit || '',
        aisle: c.aisle && AISLE_KEYS.includes(c.aisle) ? c.aisle : 'other',
        isCustom: true,
        sources: ['Custom'],
        checked: c.checked != null ? !!c.checked : !!state.checked,
        inCupboard: c.inCupboard != null ? !!c.inCupboard : !!state.inCupboard,
      })
    }
  }

  // Group items by aisle
  const byAisle = {}
  for (const a of AISLE_KEYS) {
    byAisle[a] = []
  }

  for (const item of items) {
    const a = item.aisle && byAisle[item.aisle] ? item.aisle : 'other'
    byAisle[a].push(item)
  }

  // Sort items within each aisle: unchecked first, then alphabetically
  for (const a of AISLE_KEYS) {
    byAisle[a].sort((x, y) => {
      if (x.checked !== y.checked) return x.checked ? 1 : -1
      return x.displayName.localeCompare(y.displayName)
    })
  }

  // Calculate statistics
  const totalItems = items.length
  const inCupboardCount = items.filter(i => i.inCupboard).length
  const toBuyItems = items.filter(i => !i.inCupboard)
  const toBuyCount = toBuyItems.length
  const checkedCount = toBuyItems.filter(i => i.checked).length
  const progressPct = toBuyCount > 0 ? Math.round((checkedCount / toBuyCount) * 100) : 100

  return {
    items,
    byAisle,
    stats: {
      totalItems,
      inCupboardCount,
      toBuyCount,
      checkedCount,
      progressPct,
    },
  }
}

/**
 * Toggle the checked status (bought in shop) of an item.
 */
export function toggleItemChecked(existingState = {}, itemId) {
  const current = existingState[itemId] || {}
  return {
    ...existingState,
    [itemId]: {
      ...current,
      checked: !current.checked,
    },
  }
}

/**
 * Toggle the inCupboard status (already owned at home) of an item.
 */
export function toggleItemInCupboard(existingState = {}, itemId) {
  const current = existingState[itemId] || {}
  const nextCupboard = !current.inCupboard
  return {
    ...existingState,
    [itemId]: {
      ...current,
      inCupboard: nextCupboard,
      // If marking as already in cupboard, uncheck it from the shopping basket
      checked: nextCupboard ? false : current.checked,
    },
  }
}

/**
 * Clear all checked items (resets checked state for items that were ticked).
 */
export function clearCheckedState(existingState = {}) {
  const next = {}
  for (const [k, v] of Object.entries(existingState)) {
    if (v.inCupboard) {
      next[k] = { ...v, checked: false }
    }
  }
  return next
}

/**
 * Format an item's quantity for display (e.g. "250 g", "3 pcs", "1 kg").
 */
export function formatQuantity(amount, unit) {
  if (amount == null) return ''
  const u = (unit || '').trim().toLowerCase()
  if (u === 'g' && amount >= 1000) {
    return `${round1(amount / 1000)} kg`
  }
  if (u === 'pieces' || u === 'piece') {
    return `${amount} ${amount === 1 ? 'pc' : 'pcs'}`
  }
  return u ? `${amount} ${unit}` : `${amount}`
}
