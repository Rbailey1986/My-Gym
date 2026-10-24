// AI + smart meal planner with recipe macro recalculation from the ingredient table (lib/foods.js).
//
// Core invariant: whether a recipe comes from the AI Coach (Claude / local Ollama) or the built-in
// Mediterranean catalogue, every ingredient is matched to lib/foods.js and its calories, protein,
// carbs and fat are recalculated from the food table — never taken on trust from model text.
// Portions are scaled to hit the person's rest-day or training-day calorie target, and when two
// people share meals (S.foodPrefs.partner), each ingredient carries both portions and the total
// weight to cook.

import { foodById, matchIngredient, macrosFor } from './foods.js'
import { targetsForDay, nutritionTargets } from './nutrition-targets.js'
import { adaptiveAdjustment } from './adaptive-targets.js'

const DAY = 86400000
const round1 = x => Math.round(x * 10) / 10
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

export const MEAL_SHARES_3 = { breakfast: 0.25, lunch: 0.40, dinner: 0.35 }
export const MEAL_SHARES_4 = { breakfast: 0.24, lunch: 0.36, dinner: 0.30, snacks: 0.10 }

export function activeMealKeys(prefs) {
  return (prefs?.meals || 3) >= 4
    ? ['breakfast', 'lunch', 'dinner', 'snacks']
    : ['breakfast', 'lunch', 'dinner']
}

export function slotTargetsForDay(dayTarget, prefs) {
  if (!dayTarget) return null
  const shares = (prefs?.meals || 3) >= 4 ? MEAL_SHARES_4 : MEAL_SHARES_3
  const out = {}
  for (const [k, s] of Object.entries(shares)) {
    out[k] = {
      kcal: Math.round((dayTarget.kcal * s) / 10) * 10,
      protein: Math.round(dayTarget.protein * s),
      carbs: Math.round(dayTarget.carbs * s),
      fat: Math.round(dayTarget.fat * s),
    }
  }
  return out
}

export function weekDates(startIso, count = 7) {
  const base = Date.UTC(+startIso.slice(0, 4), +startIso.slice(5, 7) - 1, +startIso.slice(8, 10))
  const out = []
  for (let i = 0; i < count; i++) {
    out.push(new Date(base + i * DAY).toISOString().slice(0, 10))
  }
  return out
}

export function effectiveDayTargets(S, iso) {
  const base = targetsForDay(S, iso)
  if (!base) return null
  const adj = adaptiveAdjustment(S, iso, base)
  return adj ? { ...base, rest: adj.rest, training: adj.training, day: adj.day, adaptive: adj } : base
}

/**
 * Second person ("Cook for two") daily target and portion ratio against Person 1.
 * Supports either a direct daily calorie number (`partner.kcal`) or a full mini-profile
 * (`sex, birthYear, heightCm, weightKg, activity, targetKg`).
 */
export function partnerTargetForDay(S, iso, person1Tg = effectiveDayTargets(S, iso)) {
  const p = S?.foodPrefs?.partner
  if (!p?.enabled) return null
  const p1Kcal = person1Tg?.day?.kcal || 2000
  let kcal = null
  let protein = null
  let carbs = null
  let fat = null
  if (p.kcal > 0) {
    const bump = person1Tg?.trainingDay && p.trainingExtraKcal > 0 ? p.trainingExtraKcal : 0
    kcal = Math.round((+p.kcal + bump) / 10) * 10
  } else if (p.sex && p.birthYear && p.heightCm && p.weightKg && p.activity) {
    const calc = nutritionTargets(
      { sex: p.sex, birthYear: +p.birthYear, heightCm: +p.heightCm, activity: p.activity },
      { weight: +p.weightKg, unit: 'kg', targetW: p.targetKg > 0 ? +p.targetKg : null },
      { sessionMin: 60 },
      iso
    )
    if (calc) {
      const d = person1Tg?.trainingDay ? calc.training : calc.rest
      kcal = d.kcal
      protein = d.protein
      carbs = d.carbs
      fat = d.fat
    }
  }
  if (!(kcal > 0)) return null
  const ratio = round1(clamp(kcal / p1Kcal, 0.35, 2.5))
  return {
    name: (p.name || '').trim() || 'Partner',
    kcal,
    protein: protein ?? Math.round((person1Tg?.day?.protein || 140) * ratio),
    carbs: carbs ?? Math.round((person1Tg?.day?.carbs || 200) * ratio),
    fat: fat ?? Math.round((person1Tg?.day?.fat || 65) * ratio),
    ratio,
  }
}

export function roundPortionAmount(amount, unit = 'g') {
  if (!(amount > 0)) return 0
  if (unit === 'g' || unit === 'ml') {
    if (amount < 15) return Math.max(1, Math.round(amount))
    return Math.max(5, Math.round(amount / 5) * 5)
  }
  if (unit === 'pieces' || unit === 'piece') {
    return Math.max(0.5, Math.round(amount * 2) / 2)
  }
  return Math.max(0.5, Math.round(amount * 2) / 2)
}

/**
 * Resolves every ingredient against the built-in food table (lib/foods.js), scales quantities to
 * hit `slotTargetKcal` when provided, and computes Person 2's shared meal portions when `partner`
 * is active.
 */
export function recalcRecipe(raw, { slotTargetKcal = null, partner = null, lang = 'en' } = {}) {
  if (!raw || typeof raw !== 'object') return null
  const rawIngs = Array.isArray(raw.ingredients) ? raw.ingredients : []
  const firstPass = rawIngs.map(ing => {
    const name = (lang === 'it' && ing.nameIt) ? ing.nameIt : (ing.name || ing.item || '')
    const lookupName = ing.lookup || ing.name || ing.nameIt || ''
    const food = (ing.foodId && foodById(ing.foodId)) || matchIngredient(lookupName) || matchIngredient(name)
    const unit = ing.unit || 'g'
    const baseAmount = +(ing.amount ?? 100) || 100
    const m = food ? macrosFor(food, baseAmount, unit) : null
    return { ing, name, food, unit, baseAmount, baseMacros: m }
  })

  const rawKcal = firstPass.reduce((s, x) => s + (x.baseMacros?.kcal || 0), 0)
  const scale = slotTargetKcal > 0 && rawKcal > 0
    ? clamp(slotTargetKcal / rawKcal, 0.45, 2.4)
    : 1

  let kcal = 0, protein = 0, carbs = 0, fat = 0
  let pKcal = 0, pProtein = 0, pCarbs = 0, pFat = 0
  const partnerRatio = partner?.ratio > 0 ? partner.ratio : null

  const ingredients = firstPass.map(({ ing, name, food, unit, baseAmount }) => {
    const amount = scale === 1 ? baseAmount : roundPortionAmount(baseAmount * scale, unit)
    const m = (food && macrosFor(food, amount, unit)) || {
      kcal: Math.round((ing.kcal || 0) * scale),
      protein: round1((ing.protein || 0) * scale),
      carbs: round1((ing.carbs || 0) * scale),
      fat: round1((ing.fat || 0) * scale),
      grams: unit === 'g' || unit === 'ml' ? amount : 0,
    }
    const ingKcal = Math.round(m.kcal)
    const ingProtein = round1(m.protein)
    const ingCarbs = round1(m.carbs)
    const ingFat = round1(m.fat)
    kcal += ingKcal
    protein += ingProtein
    carbs += ingCarbs
    fat += ingFat

    let partnerPart = {}
    if (partnerRatio) {
      const partnerAmount = roundPortionAmount(amount * partnerRatio, unit)
      const pm = (food && macrosFor(food, partnerAmount, unit)) || {
        kcal: Math.round(m.kcal * partnerRatio),
        protein: round1(m.protein * partnerRatio),
        carbs: round1(m.carbs * partnerRatio),
        fat: round1(m.fat * partnerRatio),
        grams: Math.round((m.grams || 0) * partnerRatio),
      }
      const pIngKcal = Math.round(pm.kcal)
      pKcal += pIngKcal
      pProtein += round1(pm.protein)
      pCarbs += round1(pm.carbs)
      pFat += round1(pm.fat)
      partnerPart = {
        partnerAmount,
        partnerGrams: round1(pm.grams || 0),
        partnerKcal: pIngKcal,
        totalAmount: round1(amount + partnerAmount),
      }
    }

    return {
      name: name || food?.n || 'Ingredient',
      foodId: food?.id || null,
      foodName: food?.n || null,
      amount,
      unit,
      grams: round1(m.grams || 0),
      kcal: ingKcal,
      protein: ingProtein,
      carbs: ingCarbs,
      fat: ingFat,
      ...partnerPart,
    }
  })

  const title = (lang === 'it' && raw.titleIt) ? raw.titleIt : (raw.title || raw.name || 'Meal')
  const steps = (lang === 'it' && Array.isArray(raw.stepsIt) && raw.stepsIt.length)
    ? raw.stepsIt
    : (Array.isArray(raw.steps) ? raw.steps : [])

  return {
    id: raw.id || ('meal-' + Math.random().toString(36).slice(2, 9)),
    meal: raw.meal || 'lunch',
    title,
    cookMin: raw.cookMin || 20,
    diet: raw.diet || 'any',
    budget: raw.budget || 'mid',
    kcal: Math.round(kcal),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
    ingredients,
    steps,
    partner: partnerRatio ? {
      name: partner.name || 'Partner',
      ratio: partnerRatio,
      kcal: Math.round(pKcal),
      protein: round1(pProtein),
      carbs: round1(pCarbs),
      fat: round1(pFat),
    } : null,
  }
}

// Curated Italian & Mediterranean recipes backed by verified CREA/CoFID food IDs.
export const RECIPE_CATALOGUE = [
  // --- BREAKFAST ---
  {
    id: 'bf-greek-oats-berries',
    meal: 'breakfast',
    diet: 'vegetarian',
    cookMin: 10,
    budget: 'low',
    title: 'Greek yogurt bowl with oats, banana and almonds',
    titleIt: 'Yogurt greco con fiocchi d’avena, banana e mandorle',
    tags: ['yogurt', 'oats', 'banana', 'almonds', 'avena', 'mandorle'],
    ingredients: [
      { name: 'Greek yogurt', nameIt: 'Yogurt greco', foodId: 'it-150030', amount: 200, unit: 'g' },
      { name: 'Rolled oats', nameIt: 'Fiocchi d’avena', foodId: 'it-003030', amount: 55, unit: 'g' },
      { name: 'Banana', nameIt: 'Banana', foodId: 'it-007510', amount: 1, unit: 'pieces' },
      { name: 'Sweet almonds', nameIt: 'Mandorle dolci', foodId: 'it-008510', amount: 15, unit: 'g' },
    ],
    steps: [
      'Spoon the Greek yogurt into a wide bowl and stir in the rolled oats.',
      'Slice the banana over the top and scatter with chopped almonds.',
    ],
    stepsIt: [
      'Versa lo yogurt greco in una ciotola capiente e mescola i fiocchi d’avena.',
      'Affetta la banana sopra e completa con le mandorle tritate.',
    ],
  },
  {
    id: 'bf-eggs-toast-oil',
    meal: 'breakfast',
    diet: 'vegetarian',
    cookMin: 15,
    budget: 'low',
    title: 'Scrambled eggs and egg whites on wholemeal toast',
    titleIt: 'Uova strapazzate e albumi su pane integrale tostato',
    tags: ['eggs', 'uova', 'bread', 'pane', 'toast'],
    ingredients: [
      { name: 'Whole eggs', nameIt: 'Uova di gallina', foodId: 'it-181100', amount: 2, unit: 'pieces' },
      { name: 'Egg whites', nameIt: 'Albume d’uovo', foodId: 'it-182010', amount: 120, unit: 'g' },
      { name: 'Wholemeal bread', nameIt: 'Pane integrale', foodId: 'it-001120', amount: 80, unit: 'g' },
      { name: 'Extra virgin olive oil', nameIt: 'Olio extravergine di oliva', foodId: 'it-009210', amount: 10, unit: 'g' },
    ],
    steps: [
      'Whisk the whole eggs and egg whites with a pinch of salt and black pepper.',
      'Warm the olive oil in a non-stick pan over low heat and cook the eggs gently until soft-set.',
      'Serve immediately over toasted wholemeal bread.',
    ],
    stepsIt: [
      'Sbatti le uova intere e gli albumi con un pizzico di sale e pepe nero.',
      'Scalda l’olio extravergine in padella antiaderente a fuoco dolce e cuoci le uova mescolando.',
      'Servi subito sulle fette di pane integrale tostato.',
    ],
  },
  {
    id: 'bf-vegan-oat-porridge',
    meal: 'breakfast',
    diet: 'vegan',
    cookMin: 10,
    budget: 'low',
    title: 'Warm oat porridge with apple and walnuts',
    titleIt: 'Porridge di avena caldo con mela e noci',
    tags: ['oats', 'avena', 'apple', 'mela', 'walnuts', 'noci', 'vegan'],
    ingredients: [
      { name: 'Rolled oats', nameIt: 'Fiocchi d’avena', foodId: 'it-003030', amount: 75, unit: 'g' },
      { name: 'Apple', nameIt: 'Mela', foodId: 'it-007000', amount: 1, unit: 'pieces' },
      { name: 'Walnuts', nameIt: 'Noci', foodId: 'it-008650', amount: 25, unit: 'g' },
    ],
    steps: [
      'Simmer the oats with 220 ml of water and a pinch of cinnamon for 5 minutes until creamy.',
      'Dice the apple and fold it into the warm porridge with toasted walnuts on top.',
    ],
    stepsIt: [
      'Cuoci i fiocchi d’avena con 220 ml di acqua e un pizzico di cannella per 5 minuti.',
      'Taglia la mela a cubetti e uniscila al porridge caldo completando con le noci.',
    ],
  },
  {
    id: 'bf-ricotta-honey-toast',
    meal: 'breakfast',
    diet: 'vegetarian',
    cookMin: 10,
    budget: 'mid',
    title: 'Whipped ricotta and banana on wholemeal toast',
    titleIt: 'Pane integrale con ricotta, banana e mandorle',
    tags: ['ricotta', 'bread', 'pane', 'banana'],
    ingredients: [
      { name: 'Cow ricotta', nameIt: 'Ricotta di vacca', foodId: 'it-162300', amount: 150, unit: 'g' },
      { name: 'Wholemeal bread', nameIt: 'Pane integrale', foodId: 'it-001120', amount: 75, unit: 'g' },
      { name: 'Banana', nameIt: 'Banana', foodId: 'it-007510', amount: 1, unit: 'pieces' },
      { name: 'Sweet almonds', nameIt: 'Mandorle dolci', foodId: 'it-008510', amount: 15, unit: 'g' },
    ],
    steps: [
      'Toast the wholemeal bread until crisp and spread generously with ricotta.',
      'Top with sliced banana and crushed almonds.',
    ],
    stepsIt: [
      'Tosta il pane integrale e spalmalo con la ricotta lavorata a crema.',
      'Completa con la banana a rondelle e le mandorle spezzettate.',
    ],
  },

  // --- LUNCH ---
  {
    id: 'lu-chicken-rice-zucchini',
    meal: 'lunch',
    diet: 'any',
    cookMin: 25,
    budget: 'low',
    title: 'Lemon herb chicken breast with rice and courgettes',
    titleIt: 'Petto di pollo al limone con riso e zucchine',
    tags: ['chicken', 'pollo', 'rice', 'riso', 'zucchini', 'zucchine'],
    ingredients: [
      { name: 'Chicken breast', nameIt: 'Petto di pollo', foodId: 'it-106500', amount: 180, unit: 'g' },
      { name: 'Rice', nameIt: 'Riso', lookup: 'riso brillato', amount: 90, unit: 'g' },
      { name: 'Courgettes', nameIt: 'Zucchine', lookup: 'zucchine', amount: 180, unit: 'g' },
      { name: 'Extra virgin olive oil', nameIt: 'Olio extravergine di oliva', foodId: 'it-009210', amount: 12, unit: 'g' },
    ],
    steps: [
      'Boil the rice in salted water until tender, then drain.',
      'Sear the sliced chicken breast and diced courgettes in olive oil for 7–8 minutes with lemon juice and oregano.',
      'Plate the rice alongside the chicken and pan juices.',
    ],
    stepsIt: [
      'Cuoci il riso in acqua bollente salata e scolalo al dente.',
      'Rosola il petto di pollo a striscioline e le zucchine a rondelle con l’olio, succo di limone e origano per 7–8 minuti.',
      'Servi il riso con il pollo e le zucchine.',
    ],
  },
  {
    id: 'lu-pasta-tuna-tomato',
    meal: 'lunch',
    diet: 'pescatarian',
    cookMin: 15,
    budget: 'low',
    title: 'Wholewheat pasta with tuna and tomato passata',
    titleIt: 'Pasta integrale con tonno al naturale e pomodoro',
    tags: ['pasta', 'tuna', 'tonno', 'tomato', 'pomodoro', 'fish'],
    ingredients: [
      { name: 'Wholewheat pasta', nameIt: 'Pasta integrale', foodId: 'it-000850', amount: 95, unit: 'g' },
      { name: 'Drained tuna in brine', nameIt: 'Tonno al naturale sgocciolato', foodId: 'it-123550', amount: 150, unit: 'g' },
      { name: 'Tomato passata', nameIt: 'Passata di pomodoro', foodId: 'it-006670', amount: 160, unit: 'g' },
      { name: 'Extra virgin olive oil', nameIt: 'Olio extravergine di oliva', foodId: 'it-009210', amount: 12, unit: 'g' },
    ],
    steps: [
      'Cook the wholewheat pasta in salted boiling water until al dente.',
      'Simmer the tomato passata with olive oil for 6 minutes, then flake in the drained tuna.',
      'Toss the pasta through the sauce and serve warm.',
    ],
    stepsIt: [
      'Lessare la pasta integrale in abbondante acqua salata e scolarla al dente.',
      'Scalda la passata di pomodoro con un filo d’olio per 6 minuti, poi unisci il tonno sgocciolato.',
      'Salta la pasta nel sugo e servi ben calda.',
    ],
  },
  {
    id: 'lu-farro-chickpea-mozzarella',
    meal: 'lunch',
    diet: 'vegetarian',
    cookMin: 25,
    budget: 'low',
    title: 'Mediterranean farro bowl with chickpeas and mozzarella',
    titleIt: 'Insalata di farro con ceci, pomodorini e mozzarella',
    tags: ['farro', 'chickpeas', 'ceci', 'mozzarella', 'tomato'],
    ingredients: [
      { name: 'Farro', nameIt: 'Farro', lookup: 'farro', amount: 85, unit: 'g' },
      { name: 'Cooked chickpeas', nameIt: 'Ceci cotti', lookup: 'ceci', amount: 140, unit: 'g' },
      { name: 'Mozzarella', nameIt: 'Mozzarella di vacca', lookup: 'mozzarella', amount: 100, unit: 'g' },
      { name: 'Extra virgin olive oil', nameIt: 'Olio extravergine di oliva', foodId: 'it-009210', amount: 10, unit: 'g' },
    ],
    steps: [
      'Boil the farro in salted water for 20 minutes, drain and cool slightly.',
      'Toss with rinsed chickpeas, diced mozzarella, basil and extra virgin olive oil.',
    ],
    stepsIt: [
      'Cuoci il farro in acqua salata per 20 minuti, scolalo e lascialo intiepidire.',
      'Condisci con i ceci risciacquati, la mozzarella a cubetti, basilico fresco e olio extravergine.',
    ],
  },
  {
    id: 'lu-lentil-rice-spinach',
    meal: 'lunch',
    diet: 'vegan',
    cookMin: 25,
    budget: 'low',
    title: 'Spiced lentils with rice and wilted spinach',
    titleIt: 'Lenticchie stufate con riso e spinaci',
    tags: ['lentils', 'lenticchie', 'rice', 'riso', 'spinach', 'spinaci', 'vegan'],
    ingredients: [
      { name: 'Dry lentils', nameIt: 'Lenticchie secche', lookup: 'lenticchie', amount: 85, unit: 'g' },
      { name: 'Rice', nameIt: 'Riso', lookup: 'riso brillato', amount: 75, unit: 'g' },
      { name: 'Spinach', nameIt: 'Spinaci', lookup: 'spinaci', amount: 150, unit: 'g' },
      { name: 'Extra virgin olive oil', nameIt: 'Olio extravergine di oliva', foodId: 'it-009210', amount: 12, unit: 'g' },
    ],
    steps: [
      'Simmer the lentils and rice in salted water until tender.',
      'Fold in the fresh spinach during the last 2 minutes until wilted, then drizzle with olive oil.',
    ],
    stepsIt: [
      'Cuoci le lenticchie e il riso finché risultano teneri.',
      'Unisci gli spinaci freschi negli ultimi 2 minuti per farli appassire e completa con olio a crudo.',
    ],
  },
  {
    id: 'lu-turkey-pasta-parmigiano',
    meal: 'lunch',
    diet: 'any',
    cookMin: 15,
    budget: 'mid',
    title: 'Wholewheat pasta with turkey ragù and Parmigiano',
    titleIt: 'Pasta integrale con ragù rapido di tacchino e Parmigiano',
    tags: ['pasta', 'turkey', 'tacchino', 'parmigiano', 'tomato'],
    ingredients: [
      { name: 'Wholewheat pasta', nameIt: 'Pasta integrale', foodId: 'it-000850', amount: 90, unit: 'g' },
      { name: 'Turkey breast', nameIt: 'Petto di tacchino', foodId: 'it-106850', amount: 160, unit: 'g' },
      { name: 'Tomato passata', nameIt: 'Passata di pomodoro', foodId: 'it-006670', amount: 150, unit: 'g' },
      { name: 'Parmigiano Reggiano', nameIt: 'Parmigiano Reggiano', foodId: 'it-166000', amount: 20, unit: 'g' },
      { name: 'Extra virgin olive oil', nameIt: 'Olio extravergine di oliva', foodId: 'it-009210', amount: 10, unit: 'g' },
    ],
    steps: [
      'Finely dice the turkey breast and brown it in olive oil for 5 minutes.',
      'Add the tomato passata and simmer while the wholewheat pasta cooks.',
      'Toss the drained pasta with the sauce and grated Parmigiano Reggiano.',
    ],
    stepsIt: [
      'Taglia il petto di tacchino a cubetti piccoli e rosolalo nell’olio per 5 minuti.',
      'Aggiungi la passata di pomodoro e lascia sobbollire mentre cuoce la pasta integrale.',
      'Manteca la pasta scolata con il sugo e il Parmigiano Reggiano grattugiato.',
    ],
  },

  // --- DINNER ---
  {
    id: 'di-beef-sweet-potato',
    meal: 'dinner',
    diet: 'any',
    cookMin: 30,
    budget: 'mid',
    title: 'Seared lean beef with roasted sweet potatoes and spinach',
    titleIt: 'Manzo magro in padella con patate dolci al forno e spinaci',
    tags: ['beef', 'manzo', 'sweet potato', 'patate dolci', 'spinach', 'spinaci'],
    ingredients: [
      { name: 'Lean ground beef', nameIt: 'Macinato magro di manzo', foodId: 'uk-18-469', amount: 180, unit: 'g' },
      { name: 'Sweet potatoes', nameIt: 'Patate dolci', lookup: 'patate dolci', amount: 240, unit: 'g' },
      { name: 'Spinach', nameIt: 'Spinaci', lookup: 'spinaci', amount: 150, unit: 'g' },
      { name: 'Extra virgin olive oil', nameIt: 'Olio extravergine di oliva', foodId: 'it-009210', amount: 12, unit: 'g' },
    ],
    steps: [
      'Cube the sweet potatoes and roast or pan-steam until golden and tender.',
      'Brown the lean beef in a hot skillet with rosemary, salt and pepper.',
      'Wilt the spinach alongside and drizzle with olive oil before serving.',
    ],
    stepsIt: [
      'Taglia le patate dolci a cubetti e cuocile in forno o in padella coperta finché sono tenere.',
      'Rosola il manzo magro a fuoco vivo con rosmarino, sale e pepe.',
      'Fai appassire gli spinaci a lato e condisci con olio extravergine prima di servire.',
    ],
  },
  {
    id: 'di-salmon-potatoes-courgette',
    meal: 'dinner',
    diet: 'pescatarian',
    cookMin: 25,
    budget: 'high',
    title: 'Baked salmon fillet with potatoes and courgettes',
    titleIt: 'Filetto di salmone al forno con patate e zucchine',
    tags: ['salmon', 'salmone', 'fish', 'pesce', 'potatoes', 'patate', 'zucchine'],
    ingredients: [
      { name: 'Fresh salmon', nameIt: 'Salmone fresco', lookup: 'salmone fresco', amount: 170, unit: 'g' },
      { name: 'Potatoes', nameIt: 'Patate', lookup: 'patate', amount: 220, unit: 'g' },
      { name: 'Courgettes', nameIt: 'Zucchine', lookup: 'zucchine', amount: 180, unit: 'g' },
      { name: 'Extra virgin olive oil', nameIt: 'Olio extravergine di oliva', foodId: 'it-009210', amount: 10, unit: 'g' },
    ],
    steps: [
      'Parboil or roast the diced potatoes for 12 minutes, then add sliced courgettes and the salmon fillet.',
      'Bake at 200 °C for 12 minutes with olive oil, lemon and black pepper.',
    ],
    stepsIt: [
      'Sbollenta o inforna le patate a cubetti per 12 minuti, poi aggiungi le zucchine e il filetto di salmone.',
      'Cuoci a 200 °C per altri 12 minuti con olio extravergine, limone e pepe nero.',
    ],
  },
  {
    id: 'di-turkey-sweetpotato-zucchini',
    meal: 'dinner',
    diet: 'any',
    cookMin: 25,
    budget: 'low',
    title: 'Pan-roasted turkey breast with sweet potatoes and courgettes',
    titleIt: 'Tagliata di tacchino con patate dolci e zucchine',
    tags: ['turkey', 'tacchino', 'sweet potato', 'patate dolci', 'zucchini', 'zucchine'],
    ingredients: [
      { name: 'Turkey breast', nameIt: 'Petto di tacchino', foodId: 'it-106850', amount: 190, unit: 'g' },
      { name: 'Sweet potatoes', nameIt: 'Patate dolci', lookup: 'patate dolci', amount: 230, unit: 'g' },
      { name: 'Courgettes', nameIt: 'Zucchine', lookup: 'zucchine', amount: 180, unit: 'g' },
      { name: 'Extra virgin olive oil', nameIt: 'Olio extravergine di oliva', foodId: 'it-009210', amount: 12, unit: 'g' },
    ],
    steps: [
      'Cook diced sweet potatoes and courgettes in a covered skillet with a splash of water and olive oil for 12 minutes.',
      'Sear the seasoned turkey breast slices for 3–4 minutes per side and slice over the vegetables.',
    ],
    stepsIt: [
      'Cuoci le patate dolci a cubetti e le zucchine in padella coperta con poca acqua e olio per 12 minuti.',
      'Scottare le fette di petto di tacchino 3–4 minuti per lato e servile sopra le verdure.',
    ],
  },
  {
    id: 'di-frittata-potato-spinach',
    meal: 'dinner',
    diet: 'vegetarian',
    cookMin: 20,
    budget: 'low',
    title: 'Italian oven frittata with spinach, Parmigiano and wholemeal bread',
    titleIt: 'Frittata agli spinaci e Parmigiano con pane integrale',
    tags: ['eggs', 'uova', 'spinach', 'spinaci', 'parmigiano', 'bread', 'pane'],
    ingredients: [
      { name: 'Whole eggs', nameIt: 'Uova di gallina', foodId: 'it-181100', amount: 3, unit: 'pieces' },
      { name: 'Parmigiano Reggiano', nameIt: 'Parmigiano Reggiano', foodId: 'it-166000', amount: 25, unit: 'g' },
      { name: 'Spinach', nameIt: 'Spinaci', lookup: 'spinaci', amount: 180, unit: 'g' },
      { name: 'Wholemeal bread', nameIt: 'Pane integrale', foodId: 'it-001120', amount: 75, unit: 'g' },
      { name: 'Extra virgin olive oil', nameIt: 'Olio extravergine di oliva', foodId: 'it-009210', amount: 10, unit: 'g' },
    ],
    steps: [
      'Wilt the spinach in a skillet with olive oil, then pour in the beaten eggs and grated Parmigiano.',
      'Cook covered on low heat for 8 minutes until set, and serve with toasted wholemeal bread.',
    ],
    stepsIt: [
      'Fai appassire gli spinaci in padella con l’olio, poi versa le uova sbattute con il Parmigiano.',
      'Cuoci coperto a fuoco dolce per 8 minuti e servi con il pane integrale tostato.',
    ],
  },
  {
    id: 'di-vegan-chickpea-tomato-stew',
    meal: 'dinner',
    diet: 'vegan',
    cookMin: 20,
    budget: 'low',
    title: 'Tuscan chickpea and tomato stew with toasted wholemeal bread',
    titleIt: 'Zuppa toscana di ceci al pomodoro con pane integrale tostato',
    tags: ['chickpeas', 'ceci', 'tomato', 'pomodoro', 'bread', 'pane', 'vegan'],
    ingredients: [
      { name: 'Cooked chickpeas', nameIt: 'Ceci cotti', lookup: 'ceci', amount: 200, unit: 'g' },
      { name: 'Tomato passata', nameIt: 'Passata di pomodoro', foodId: 'it-006670', amount: 180, unit: 'g' },
      { name: 'Wholemeal bread', nameIt: 'Pane integrale', foodId: 'it-001120', amount: 85, unit: 'g' },
      { name: 'Extra virgin olive oil', nameIt: 'Olio extravergine di oliva', foodId: 'it-009210', amount: 14, unit: 'g' },
    ],
    steps: [
      'Simmer the chickpeas with tomato passata, rosemary and garlic for 12 minutes.',
      'Spoon over toasted wholemeal bread and finish with raw extra virgin olive oil.',
    ],
    stepsIt: [
      'Fai sobbollire i ceci con la passata di pomodoro, rosmarino e uno spicchio d’aglio per 12 minuti.',
      'Servi sulle fette di pane integrale tostato con un filo d’olio a crudo.',
    ],
  },

  // --- SNACKS ---
  {
    id: 'sn-cottage-apple-almonds',
    meal: 'snacks',
    diet: 'vegetarian',
    cookMin: 5,
    budget: 'low',
    title: 'Cottage cheese with sliced apple and almonds',
    titleIt: 'Fiocchi di latte con mela a fette e mandorle',
    tags: ['cottage cheese', 'fiocchi di latte', 'apple', 'mela', 'almonds', 'mandorle'],
    ingredients: [
      { name: 'Cottage cheese', nameIt: 'Fiocchi di latte', foodId: 'uk-12-539', amount: 150, unit: 'g' },
      { name: 'Apple', nameIt: 'Mela', foodId: 'it-007000', amount: 1, unit: 'pieces' },
      { name: 'Sweet almonds', nameIt: 'Mandorle dolci', foodId: 'it-008510', amount: 15, unit: 'g' },
    ],
    steps: [
      'Portion the cottage cheese into a bowl and serve with crisp apple slices and almonds.',
    ],
    stepsIt: [
      'Versa i fiocchi di latte in una ciotola e accompagna con la mela a fettine e le mandorle.',
    ],
  },
  {
    id: 'sn-banana-walnuts',
    meal: 'snacks',
    diet: 'vegan',
    cookMin: 5,
    budget: 'low',
    title: 'Banana and a handful of walnuts',
    titleIt: 'Banana e una manciata di noci',
    tags: ['banana', 'walnuts', 'noci', 'vegan'],
    ingredients: [
      { name: 'Banana', nameIt: 'Banana', foodId: 'it-007510', amount: 1, unit: 'pieces' },
      { name: 'Walnuts', nameIt: 'Noci', foodId: 'it-008650', amount: 25, unit: 'g' },
    ],
    steps: [
      'Peel the banana and enjoy alongside the walnuts as a pre- or post-workout snack.',
    ],
    stepsIt: [
      'Sbuccia la banana e gustala insieme alle noci come spuntino pre o post allenamento.',
    ],
  },
]

const DIET_ALLOWS = {
  any: new Set(['any', 'pescatarian', 'vegetarian', 'vegan']),
  pescatarian: new Set(['pescatarian', 'vegetarian', 'vegan']),
  vegetarian: new Set(['vegetarian', 'vegan']),
  vegan: new Set(['vegan']),
}

function splitTerms(csv) {
  return String(csv || '')
    .toLowerCase()
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function recipeHaystack(r) {
  const ingText = (r.ingredients || []).map(i => `${i.name || ''} ${i.nameIt || ''} ${i.lookup || ''}`).join(' ')
  return `${r.title || ''} ${r.titleIt || ''} ${(r.tags || []).join(' ')} ${ingText}`.toLowerCase()
}

export function candidateRecipesForSlot(mealKey, prefs = {}) {
  const allowedDiets = DIET_ALLOWS[prefs?.diet] || DIET_ALLOWS.any
  const avoid = [...splitTerms(prefs?.allergies), ...splitTerms(prefs?.dislikes)]
  const likes = splitTerms(prefs?.likes)
  const maxCook = prefs?.cookMin > 0 ? +prefs.cookMin : 60

  let pool = RECIPE_CATALOGUE.filter(r => r.meal === mealKey && allowedDiets.has(r.diet))
  const safePool = pool.filter(r => {
    const hay = recipeHaystack(r)
    return !avoid.some(term => hay.includes(term))
  })
  if (safePool.length) pool = safePool

  const fastPool = pool.filter(r => (r.cookMin || 20) <= maxCook)
  if (fastPool.length) pool = fastPool

  return pool
    .map(r => {
      const hay = recipeHaystack(r)
      const likeScore = likes.reduce((acc, term) => acc + (hay.includes(term) ? 1 : 0), 0)
      return { r, likeScore }
    })
    .sort((a, b) => b.likeScore - a.likeScore)
    .map(x => x.r)
}

export function buildPlannedDay(S, iso, { dayIndex = 0, excludeIds = new Set(), aiMeals = null, lang = 'en' } = {}) {
  const tg = effectiveDayTargets(S, iso)
  const dayTarget = tg?.day || { kcal: 2100, protein: 150, carbs: 220, fat: 65, floored: false }
  const slots = slotTargetsForDay(dayTarget, S?.foodPrefs)
  const partner = partnerTargetForDay(S, iso, tg)
  const keys = activeMealKeys(S?.foodPrefs)
  const meals = {}

  for (const mealKey of keys) {
    const slotTarget = slots[mealKey]
    const aiRaw = aiMeals?.[mealKey]
    let chosenRaw = null
    if (aiRaw && Array.isArray(aiRaw.ingredients) && aiRaw.ingredients.length) {
      chosenRaw = { ...aiRaw, meal: mealKey }
    } else {
      const cands = candidateRecipesForSlot(mealKey, S?.foodPrefs)
      const nonExcluded = cands.filter(c => !excludeIds.has(c.id))
      const pickPool = nonExcluded.length ? nonExcluded : cands
      chosenRaw = pickPool[dayIndex % Math.max(1, pickPool.length)] || RECIPE_CATALOGUE[0]
    }
    meals[mealKey] = recalcRecipe(chosenRaw, {
      slotTargetKcal: slotTarget?.kcal,
      partner,
      lang,
    })
  }

  const totalKcal = Object.values(meals).reduce((s, m) => s + (m?.kcal || 0), 0)
  const totalProtein = round1(Object.values(meals).reduce((s, m) => s + (m?.protein || 0), 0))
  const totalCarbs = round1(Object.values(meals).reduce((s, m) => s + (m?.carbs || 0), 0))
  const totalFat = round1(Object.values(meals).reduce((s, m) => s + (m?.fat || 0), 0))

  return {
    iso,
    trainingDay: !!tg?.trainingDay,
    targetKcal: dayTarget.kcal,
    partnerTargetKcal: partner?.kcal || null,
    kcal: totalKcal,
    protein: totalProtein,
    carbs: totalCarbs,
    fat: totalFat,
    meals,
    // Direct meal properties so lib/food-log.js plannedMealFor(S, iso, mealKey) reads them directly.
    ...meals,
  }
}

export function generateWeeklyMealPlan(S, startIso, { aiDays = null, source = 'smart', lang = 'en' } = {}) {
  const dates = weekDates(startIso, 7)
  const days = {}
  dates.forEach((iso, idx) => {
    const prevIso = idx > 0 ? dates[idx - 1] : null
    const prevDay = prevIso ? days[prevIso] : null
    const excludeIds = new Set(
      prevDay ? Object.values(prevDay.meals || {}).map(m => m?.id).filter(Boolean) : []
    )
    days[iso] = buildPlannedDay(S, iso, {
      dayIndex: idx,
      excludeIds,
      aiMeals: aiDays?.[iso] || aiDays?.[idx] || null,
      lang,
    })
  })
  const firstPartner = partnerTargetForDay(S, dates[0])
  return {
    id: 'mp-' + Date.now().toString(36),
    createdAt: Date.now(),
    startIso,
    source,
    partner: firstPartner ? { name: firstPartner.name, kcal: firstPartner.kcal } : null,
    days,
  }
}

export function swapPlannedMeal(s, iso, mealKey, { aiRecipe = null, lang = 'en' } = {}) {
  if (!s?.mealPlan?.days?.[iso]) return null
  const day = s.mealPlan.days[iso]
  const currentId = day[mealKey]?.id
  const tg = effectiveDayTargets(s, iso)
  const dayTarget = tg?.day || { kcal: day.targetKcal || 2100, protein: 150, carbs: 220, fat: 65 }
  const slots = slotTargetsForDay(dayTarget, s.foodPrefs)
  const partner = partnerTargetForDay(s, iso, tg)

  let chosenRaw = aiRecipe
  if (!chosenRaw || !Array.isArray(chosenRaw.ingredients) || !chosenRaw.ingredients.length) {
    const cands = candidateRecipesForSlot(mealKey, s.foodPrefs)
    const idx = cands.findIndex(c => c.id === currentId)
    chosenRaw = cands.length > 1
      ? cands[(idx + 1) % cands.length]
      : cands[0] || RECIPE_CATALOGUE.find(r => r.meal === mealKey)
  }

  const nextMeal = recalcRecipe({ ...chosenRaw, meal: mealKey }, {
    slotTargetKcal: slots[mealKey]?.kcal,
    partner,
    lang,
  })
  day.meals = { ...(day.meals || {}), [mealKey]: nextMeal }
  day[mealKey] = nextMeal
  const allMeals = Object.values(day.meals).filter(Boolean)
  day.kcal = allMeals.reduce((acc, m) => acc + (m.kcal || 0), 0)
  day.protein = round1(allMeals.reduce((acc, m) => acc + (m.protein || 0), 0))
  day.carbs = round1(allMeals.reduce((acc, m) => acc + (m.carbs || 0), 0))
  day.fat = round1(allMeals.reduce((acc, m) => acc + (m.fat || 0), 0))
  return nextMeal
}

export function regeneratePlannedDay(s, iso, { aiMeals = null, lang = 'en' } = {}) {
  if (!s?.mealPlan?.days) return null
  const prev = s.mealPlan.days[iso]
  const excludeIds = new Set(
    prev ? Object.values(prev.meals || {}).map(m => m?.id).filter(Boolean) : []
  )
  const dates = Object.keys(s.mealPlan.days).sort()
  const idx = Math.max(0, dates.indexOf(iso)) + 1
  const nextDay = buildPlannedDay(s, iso, {
    dayIndex: idx,
    excludeIds,
    aiMeals,
    lang,
  })
  s.mealPlan.days[iso] = nextDay
  return nextDay
}

export function aiDayFromRecipes(recipes = [], dayIndex = 0) {
  if (!Array.isArray(recipes) || !recipes.length) return null
  const bySlot = {}
  for (const r of recipes) {
    if (!r || !r.meal) continue
    bySlot[r.meal] ||= []
    bySlot[r.meal].push(r)
  }
  const out = {}
  for (const [slot, list] of Object.entries(bySlot)) {
    out[slot] = list[dayIndex % list.length]
  }
  return Object.keys(out).length ? out : null
}

export function aiDaysFromRecipes(recipes = [], startIso) {
  if (!Array.isArray(recipes) || !recipes.length) return null
  const dates = weekDates(startIso, 7)
  const out = {}
  dates.forEach((iso, idx) => {
    out[iso] = aiDayFromRecipes(recipes, idx)
  })
  return out
}
