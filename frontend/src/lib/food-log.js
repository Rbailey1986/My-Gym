import { foodById, macrosFor, matchIngredient } from './foods.js'
import { uid } from './format.js'

// Logging what you actually eat per meal, summing the day against the targets, one-tap logging
// a planned meal, and keeping favourites and recent foods with the amount last used.

export const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snacks']

const round1 = n => Math.round((Number(n) || 0) * 10) / 10

export function makeLogItem(foodOrId, amount = 100, unit = 'g', id = uid()) {
  const food = typeof foodOrId === 'string' ? foodById(foodOrId) : foodOrId
  const m = macrosFor(food, amount, unit)
  if (!food || !m) return null
  return {
    id,
    foodId: food.id,
    name: food.n,
    amount: round1(amount),
    unit,
    grams: m.grams,
    kcal: Math.round(m.kcal),
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
  }
}

export function dayLog(S, iso) {
  const raw = S?.foodLog?.[iso] || {}
  const out = {}
  for (const k of MEAL_KEYS) out[k] = Array.isArray(raw[k]) ? raw[k] : []
  return out
}

export function mealTotals(items = []) {
  let kcal = 0, protein = 0, carbs = 0, fat = 0
  for (const it of items) {
    if (!it) continue
    kcal += Number(it.kcal) || 0
    protein += Number(it.protein) || 0
    carbs += Number(it.carbs) || 0
    fat += Number(it.fat) || 0
  }
  return { kcal: Math.round(kcal), protein: round1(protein), carbs: round1(carbs), fat: round1(fat), count: items.length }
}

export function dayTotals(S, iso) {
  const log = dayLog(S, iso)
  const byMeal = {}
  let kcal = 0, protein = 0, carbs = 0, fat = 0, count = 0
  for (const k of MEAL_KEYS) {
    const m = mealTotals(log[k])
    byMeal[k] = m
    kcal += m.kcal
    protein += m.protein
    carbs += m.carbs
    fat += m.fat
    count += m.count
  }
  return { kcal: Math.round(kcal), protein: round1(protein), carbs: round1(carbs), fat: round1(fat), count, byMeal }
}

function ensureMealList(s, iso, meal) {
  if (!MEAL_KEYS.includes(meal) || !iso) return null
  s.foodLog ||= {}
  s.foodLog[iso] ||= {}
  if (!Array.isArray(s.foodLog[iso][meal])) s.foodLog[iso][meal] = []
  return s.foodLog[iso][meal]
}

export function addFoodToMeal(s, iso, meal, item) {
  const list = ensureMealList(s, iso, meal)
  if (!list || !item) return false
  list.push({ ...item, id: item.id || uid(), at: item.at || Date.now() })
  return true
}

export function removeFoodFromMeal(s, iso, meal, itemId) {
  const list = s?.foodLog?.[iso]?.[meal]
  if (!Array.isArray(list)) return false
  s.foodLog[iso][meal] = list.filter(x => x && x.id !== itemId)
  return true
}

// A planned meal for (iso, meal) from S.mealPlan, whether keyed directly by date or under .days.
export function plannedMealFor(S, iso, meal) {
  const day = S?.mealPlan?.days?.[iso] || S?.mealPlan?.[iso]
  const m = day?.[meal]
  return m && typeof m === 'object' ? m : null
}

// One tap: log the planned meal as eaten. Resolves recipe ingredients through the food table when
// present so macros are recalculated from the table; otherwise logs the planned meal summary.
export function eatPlannedMeal(s, iso, meal) {
  const planned = plannedMealFor(s, iso, meal)
  const list = ensureMealList(s, iso, meal)
  if (!planned || !list) return false
  const items = Array.isArray(planned.items) ? planned.items : Array.isArray(planned.ingredients) ? planned.ingredients : []
  const resolved = []
  for (const ing of items) {
    const food = (ing.foodId && foodById(ing.foodId)) || matchIngredient(ing.name || ing.item)
    const entry = food ? makeLogItem(food, ing.amount ?? 100, ing.unit || 'g') : null
    if (entry) resolved.push({ ...entry, planned: true })
  }
  if (resolved.length) {
    list.push(...resolved)
    return true
  }
  const m = mealTotals(items)
  list.push({
    id: uid(),
    name: planned.title || planned.name || meal,
    amount: 1,
    unit: 'pieces',
    grams: 0,
    kcal: Math.round(planned.kcal ?? m.kcal),
    protein: round1(planned.protein ?? m.protein),
    carbs: round1(planned.carbs ?? m.carbs),
    fat: round1(planned.fat ?? m.fat),
    planned: true,
  })
  return true
}

export const isFavFood = (S, foodId) => Array.isArray(S?.favFoods) && S.favFoods.includes(foodId)

export function toggleFavFood(s, foodId) {
  if (!foodId) return
  const cur = Array.isArray(s.favFoods) ? s.favFoods : []
  s.favFoods = cur.includes(foodId) ? cur.filter(id => id !== foodId) : [foodId, ...cur]
}

// Last-used { amount, unit } per foodId across the log, newest day and entry first.
function lastUsedMap(S) {
  const map = new Map()
  const log = S?.foodLog
  if (!log || typeof log !== 'object') return map
  const days = Object.keys(log).sort().reverse()
  for (const d of days) {
    const day = log[d]
    if (!day || typeof day !== 'object') continue
    for (const k of [...MEAL_KEYS].reverse()) {
      const arr = Array.isArray(day[k]) ? day[k] : []
      for (let i = arr.length - 1; i >= 0; i--) {
        const it = arr[i]
        if (it?.foodId && !map.has(it.foodId)) {
          map.set(it.foodId, { amount: it.amount || 100, unit: it.unit || 'g' })
        }
      }
    }
  }
  return map
}

export function favouriteFoods(S) {
  const ids = Array.isArray(S?.favFoods) ? S.favFoods : []
  const last = lastUsedMap(S)
  const out = []
  for (const id of ids) {
    const food = foodById(id)
    if (!food) continue
    const prev = last.get(id)
    out.push({ food, amount: prev?.amount ?? (food.pt || 100), unit: prev?.unit ?? 'g' })
  }
  return out
}

export function recentFoods(S, limit = 15) {
  const last = lastUsedMap(S)
  const out = []
  for (const [id, { amount, unit }] of last.entries()) {
    const food = foodById(id)
    if (!food) continue
    out.push({ food, amount, unit })
    if (out.length >= limit) break
  }
  return out
}
