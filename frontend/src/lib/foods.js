import { FOODS } from './foods-data.js'

// The built-in food table (CREA for Italy, CoFID for the UK): search, AI ingredient matching,
// and macros for an amount. Values in foods-data.js are per 100 g; a food without a figure for
// sugars/fibre/sodium simply has no such key, so the totals leave it out rather than count it as 0.

// Grams per fixed unit. ml, tsp, tbsp and cup assume water's 1 g/ml; piece/pieces use pieceGrams(food).
export const UNITS = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592, ml: 1, tsp: 5, tbsp: 15, cup: 240, piece: 100, pieces: 100 }

// Everyday ingredient terms mapped to the wording CREA / CoFID use.
const ALIAS = [
  [/\bextravergine\b/g, 'extra vergine'],
  [/\bolio\s+evo\b/g, 'olio extra vergine oliva'],
  [/\byoghurt\b/g, 'yogurt'],
  [/\b(whole\s*wheat|whole\s*grain)\b/g, 'wholemeal'],
  [/\bgarbanzo(\s+beans?)?\b/g, 'chickpeas'],
  [/\bcourgettes?\b/g, 'zucchine'],
  [/\baubergines?\b/g, 'eggplants'],
  [/\bcilantro\b/g, 'coriander'],
  [/\barugula\b/g, 'rucola'],
  [/\b(scallions?|green\s+onions?)\b/g, 'spring onions'],
  [/\bshrimps?\b/g, 'prawns'],
  [/\bbell\s+peppers?\b/g, 'peperoni'],
  [/\bpetto\s+di\s+tacchino\b/g, 'tacchino fesa'],
  [/\btonno\s+al\s+naturale\b/g, 'tonno salamoia'],
  [/\bfiocchi\s+di\s+latte\b/g, 'cheese cottage plain'],
  [/\bpatat[ae]\s+dolc[ei]\b/g, 'sweet potato'],
  [/\b(rolled\s+oats|porridge\s+oats|oatmeal|oats)\b/g, 'fiocchi avena'],
  [/\bwhite\s+rice\b/g, 'riso brillato'],
  [/\bbrown\s+rice\b/g, 'riso integrale'],
  [/\b(spaghetti|penne|rigatoni|fusilli|farfalle|linguine|maccheroni)\b/g, 'pasta semola'],
  [/\bground\s+(beef|turkey|pork|chicken|lamb)\b/g, '$1 mince'],
  [/\bmacinato\s+di\s+(manzo|bovino)\b/g, 'beef mince'],
  [/\bmanzo\b/g, 'beef'],
]

const STOP = new Set([
  'di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'da', 'dal', 'dalla', 'in', 'al', 'allo',
  'alla', 'ai', 'agli', 'alle', 'con', 'su', 'per', 'tra', 'fra', 'il', 'lo', 'la', 'i', 'gli', 'le',
  'un', 'uno', 'una', 'ed', 'o', 'of', 'the', 'a', 'an', 'on', 'with', 'and', 'or', 'for', 'to', 'by', 'into', 'from',
])

// Culinary prep, cut and size words stripped when matching a noisy recipe ingredient line.
const PREP = new Set([
  'chopped', 'diced', 'minced', 'sliced', 'grated', 'shredded', 'crushed', 'mashed', 'peeled', 'pitted',
  'seeded', 'washed', 'trimmed', 'halved', 'quartered', 'cubed', 'beaten', 'whisked', 'melted', 'softened',
  'toasted', 'drained', 'rinsed', 'boneless', 'skinless', 'lean', 'fine', 'finely', 'roughly', 'thinly',
  'freshly', 'optional', 'taste', 'large', 'medium', 'small', 'clove', 'cloves', 'fillet', 'fillets',
  'piece', 'pieces', 'pinch', 'handful', 'bunch', 'sprig', 'sprigs', 'leaf', 'leaves', 'stalk', 'stalks',
  'head', 'floret', 'florets', 'can', 'canned', 'tin', 'tinned', 'jar', 'packet', 'plain', 'unflavoured',
  'unsweetened', 'unsalted', 'fresh', 'raw', 'tritato', 'tritata', 'tritati', 'tritate', 'affettato',
  'affettata', 'tagliato', 'tagliata', 'dadini', 'cubetti', 'fette', 'fetta', 'spicchio', 'spicchi',
  'grattugiato', 'grattugiata', 'sbucciato', 'sbucciata', 'lavato', 'lavata', 'lavati', 'lavate', 'pulito',
  'pulita', 'sgocciolato', 'sgocciolata', 'scolato', 'scolata', 'sbattuto', 'sbattute', 'fresco', 'fresca',
  'freschi', 'fresche', 'crudo', 'cruda', 'crudi', 'crude', 'filetto', 'filetti', 'ciuffo', 'rametto',
  'foglia', 'foglie', 'pizzico', 'qb', 'grande', 'grandi', 'medio', 'media', 'medi', 'medie', 'piccolo',
  'piccola', 'scatola', 'intero', 'intera', 'interi', 'intere', 'fettine', 'fettina', 'spicchio',
])

// Adjectives that cannot stand alone as a 1-word fallback when progressively relaxing an ingredient name.
const BARE_ADJ = new Set([
  'red', 'yellow', 'white', 'black', 'green', 'brown', 'sweet', 'hot', 'cold', 'dry', 'dried', 'cooked',
  'boiled', 'baked', 'roasted', 'grilled', 'steamed', 'fried', 'smoked', 'salted', 'whole', 'wholemeal',
  'rosso', 'rossa', 'rossi', 'rosse', 'bianco', 'bianca', 'bianchi', 'bianche', 'nero', 'nera', 'neri',
  'nere', 'verde', 'verdi', 'giallo', 'gialla', 'dolce', 'dolci', 'secco', 'secca', 'secchi', 'secche',
  'cotto', 'cotta', 'cotti', 'cotte', 'bollito', 'bollita', 'bolliti', 'bollite', 'integrale', 'integrali',
])

const norm = s => {
  let t = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  for (const [re, rep] of ALIAS) t = t.replace(re, rep)
  return t
}

// Italian (-a/-e/-o/-i, -chi/-che, -ghi/-ghe) and English (-s/-es/-ies) singular/plural stem.
const stem = w => {
  if (w.length <= 3) return w
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y'
  if (w.endsWith('oes') || w.endsWith('ches') || w.endsWith('shes')) w = w.slice(0, -2)
  else if (w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  if (w.length <= 3) return w
  return w.replace(/(?:ch|gh)?[aeoi]$|i[ae]$/, m => m.startsWith('c') ? 'c' : m.startsWith('g') ? 'g' : '')
}

const wordsOf = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean)

const ODD_RE = /\b(polvere|powder|dried|dehydrated|disidratat|candit|sciroppat|sciroppo|baby|infant|takeaway|fast food|congelat|surgelat|frozen|fried|fritt|crackers?|biscuits?|cake|pie|pudding|casserole|sandwich|soup|minestr|pate|marsala|alcol|bolognese)\b/
const NON_WHOLE_EGG_RE = /\b(anatra|duck|oca|goose|tacchin[ao]|turkey|quaglia|quail|tuorlo|yolk|albume|white)\b/

let index
const idx = () => index ||= FOODS.map(f => {
  const n = norm(f.n), en = norm(f.en || ''), both = n + ' ' + en
  const nHead = n.split(',')[0], enHead = en.split(',')[0]
  const words = wordsOf(both)
  const stems = new Set(words.map(stem))
  const headWords = wordsOf(nHead + ' ' + enHead)
  const headStems = new Set(headWords.map(stem))
  const firstStems = new Set([wordsOf(nHead)[0], wordsOf(enHead)[0]].filter(Boolean).map(stem))
  const odd = (ODD_RE.test(both) ? 35 : 0) + (/\b(uov|egg)/.test(both) && NON_WHOLE_EGG_RE.test(both) ? 25 : 0)
  return { f, n, en, nHead, enHead, words, stems, headWords, headStems, firstStems, odd }
})

// Every word typed has to match a word stem or prefix in the name; ranked by headword match
// (before the first comma), shorter headwords first, with the Italian table ahead on ties.
export function searchFoods(query, limit = 30) {
  const raw = wordsOf(query)
  const qWords = raw.filter(w => !STOP.has(w))
  const words = qWords.length ? qWords : raw
  if (!words.length) return []
  const qStems = words.map(stem)
  const hits = []
  for (const row of idx()) {
    let score = row.odd + (row.f.src === 'it' ? 0 : 5)
    let ok = true
    for (let i = 0; i < words.length; i++) {
      const w = words[i], st = qStems[i]
      if (row.stems.has(st) || row.words.includes(w)) {
        if (!row.headStems.has(st) && !row.headWords.includes(w)) score += i === 0 ? 45 : 12
      } else if (row.words.some(tw => tw.startsWith(w))) {
        score += 75
        if (!row.headWords.some(hw => hw.startsWith(w))) score += 45
      } else {
        ok = false; break
      }
    }
    if (!ok) continue
    if (!qStems.some(st => row.firstStems.has(st)) && !words.some(w => row.headWords[0]?.startsWith(w))) score += 30
    const headLen = Math.min(row.nHead.length, row.enHead ? row.enHead.length : 999)
    score += headLen * 1.5 + Math.min(row.n.length, row.en ? row.en.length : 999) * 0.25
    hits.push({ f: row.f, score })
  }
  return hits.sort((a, b) => a.score - b.score).slice(0, limit).map(h => h.f)
}

export const foodById = id => FOODS.find(f => f.id === id)

// Match an AI or recipe ingredient string (e.g. "boneless skinless chicken breast, diced",
// "2 spicchi d'aglio tritati", "olio evo") to the closest entry in the nutrition table.
export function matchIngredient(name) {
  if (!name || typeof name !== 'string') return null
  const noParens = name.replace(/\([^)]*\)/g, ' ')
  const direct = searchFoods(noParens, 1)[0]
  if (direct) return direct
  const cleaned = wordsOf(noParens).filter(w => !STOP.has(w) && !PREP.has(w) && !/^\d+$/.test(w) && !(w in UNITS))
  if (!cleaned.length) return null
  const hit = searchFoods(cleaned.join(' '), 1)[0]
  if (hit) return hit
  for (let len = cleaned.length - 1; len >= 1; len--) {
    const tail = cleaned.slice(-len)
    if (len > 1 || !BARE_ADJ.has(tail[0])) {
      const h = searchFoods(tail.join(' '), 1)[0]
      if (h) return h
    }
    const head = cleaned.slice(0, len)
    if (len > 1 || !BARE_ADJ.has(head[0])) {
      const h = searchFoods(head.join(' '), 1)[0]
      if (h) return h
    }
  }
  return null
}

// Typical weight of 1 piece when a food is logged or planned in pieces.
const PIECE_G = [
  [/^(garlic|aglio)\b/, 5],
  [/^(biscuits?|cookies?|crackers?|biscott)\b/, 15],
  [/^(bread|pane|toast|tortillas?|wraps?)\b/, 40],
  [/^(eggs?|uov[ao])\b/, 50],
  [/^(lemons?|limes?|limon[ei]|kiwi|apricots?|albicocc|plums?|prugn|clementines?|tangerines?|mandarin)\b/, 65],
  [/^(carrots?|carot[ae]|courgettes?|zucchin[aei])\b/, 100],
  [/^(bananas?|banan[ae]|onions?|cipoll[ae]|tomatoes|tomato|pomodor[oi])\b/, 120],
  [/^(apples?|mel[ae]|oranges?|aranc[eia]|pears?|per[ae]|peaches|peach|pesc[ahe]|avocados?|peppers?|peperon[ei]|potatoes|potato|patat[ae])\b/, 150],
]

export function pieceGrams(food) {
  if (!food) return 100
  const head = norm((food.n || '').split(',')[0] + ' ' + (food.en || '').split(',')[0]).trim()
  for (const [re, g] of PIECE_G) if (re.test(head)) return g
  return food.pt || 100
}

// Macros for `amount` of `unit` of a food. Missing optional figures stay undefined.
export function macrosFor(food, amount, unit = 'g') {
  if (!food) return null
  const isPiece = unit === 'piece' || unit === 'pieces' || unit === 'pcs'
  const unitG = isPiece ? pieceGrams(food) : UNITS[unit]
  const grams = amount * (unitG ?? NaN)
  if (!(grams >= 0)) return null
  const r = grams / 100
  const out = {}
  for (const [key, field] of [['kcal', 'k'], ['protein', 'p'], ['fat', 'f'], ['carbs', 'c'], ['sugars', 's'], ['fibre', 'fi'], ['sodium', 'na']]) {
    if (food[field] != null) out[key] = Math.round(food[field] * r * 10) / 10
  }
  out.grams = Math.round(grams * 10) / 10
  return out
}
