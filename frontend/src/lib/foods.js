import { FOODS } from './foods-data.js'

// The built-in food table (CREA for Italy, CoFID for the UK): search, and macros for an amount.
// Values in foods-data.js are per 100 g; a food without a figure for sugars/fibre/sodium simply
// has no such key, so the totals leave it out rather than count it as zero.

// Grams per unit. ml, tsp, tbsp and cup assume water's 1 g/ml, close enough for a food log.
export const UNITS = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592, ml: 1, tsp: 5, tbsp: 15, cup: 240 }

const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
let index
const idx = () => index ||= FOODS.map(f => ({ f, text: norm(f.n + ' ' + (f.en || '')), name: norm(f.n) }))

// Every word typed has to start a word in the name; ranked by where the first word sits, then by
// shorter names (plain "Pasta" before "Pasta alla norma") with the Italian table ahead on ties.
export function searchFoods(query, limit = 30) {
  const words = norm(query).split(/[^a-z0-9]+/).filter(Boolean)
  if (!words.length) return []
  const hits = []
  for (const { f, text, name } of idx()) {
    if (!words.every(w => text.startsWith(w) || text.includes(' ' + w))) continue
    hits.push({ f, score: (name.startsWith(words[0]) ? 0 : 100) + name.length + (f.src === 'it' ? 0 : 5) })
  }
  return hits.sort((a, b) => a.score - b.score).slice(0, limit).map(h => h.f)
}

export const foodById = id => FOODS.find(f => f.id === id)

// Macros for `amount` of `unit` of a food. Missing optional figures stay undefined.
export function macrosFor(food, amount, unit = 'g') {
  const grams = amount * (UNITS[unit] ?? NaN)
  if (!food || !(grams >= 0)) return null
  const r = grams / 100
  const out = {}
  for (const [key, field] of [['kcal', 'k'], ['protein', 'p'], ['fat', 'f'], ['carbs', 'c'], ['sugars', 's'], ['fibre', 'fi'], ['sodium', 'na']]) {
    if (food[field] != null) out[key] = Math.round(food[field] * r * 10) / 10
  }
  out.grams = Math.round(grams * 10) / 10
  return out
}
