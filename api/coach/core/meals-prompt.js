// Prompt builder and response normaliser for AI meal planning (Claude / local Ollama / HTTP providers).
// The model writes recipes (title, cookMin, ingredients with simple names + gram/piece amounts, steps);
// the client recalculates all calories and macros from lib/foods.js and scales portions to targets.

export function buildMealsPrompt({ prefs = {}, targets = {}, mode = 'week', mealKey = 'lunch', currentTitle = '', lang = 'en' } = {}) {
  const isIt = String(lang || '').toLowerCase().startsWith('it')
  const diet = prefs.diet || 'any'
  const allergies = prefs.allergies || 'none'
  const dislikes = prefs.dislikes || 'none'
  const likes = prefs.likes || 'Mediterranean whole foods'
  const cookMin = prefs.cookMin || 30
  const budget = prefs.budget || 'mid'
  const mealsCount = prefs.meals || 3
  const slots = mealsCount >= 4 ? ['breakfast', 'lunch', 'dinner', 'snacks'] : ['breakfast', 'lunch', 'dinner']

  const taskDesc = mode === 'swap'
    ? `Write 1 replacement "${mealKey}" recipe (different from "${currentTitle || 'current meal'}").`
    : mode === 'day'
      ? `Write 1 recipe for each meal slot (${slots.join(', ')}) for one day.`
      : `Write 2 distinct recipes for each meal slot (${slots.join(', ')}) to rotate across a 7-day training week.`

  const system = [
    'You are openGym’s nutrition chef.',
    'Return ONLY a valid JSON object matching the schema below — no markdown fences, no commentary.',
    'Use simple, standard single-ingredient names (e.g. "chicken breast", "rolled oats", "extra virgin olive oil", "wholewheat pasta", "Greek yogurt", "whole eggs", "spinach", "sweet potatoes", "tuna in brine") so the app can match each ingredient to its nutrition database and recalculate exact macros.',
    'Use only "g", "ml", or "pieces" for ingredient units.',
    isIt ? 'Write recipe titles, ingredient names, and cooking steps in Italian.' : 'Write recipe titles, ingredient names, and cooking steps in English.',
  ].join(' ')

  const user = JSON.stringify({
    task: taskDesc,
    language: isIt ? 'it' : 'en',
    preferences: {
      diet,
      allergies,
      dislikes,
      likes,
      maxCookMinutes: cookMin,
      budget,
      mealsPerDay: mealsCount,
    },
    dailyTargetHint: {
      restKcal: targets.restKcal || 2000,
      trainingKcal: targets.trainingKcal || 2300,
      proteinGrams: targets.protein || 150,
    },
    outputSchema: {
      recipes: [
        {
          meal: slots[0],
          title: 'string',
          cookMin: 20,
          ingredients: [
            { name: 'string', amount: 150, unit: 'g' },
          ],
          steps: ['step 1', 'step 2'],
        },
      ],
    },
  }, null, 2)

  return { system, user }
}

export function extractAIRecipes(parsedValue) {
  if (!parsedValue || typeof parsedValue !== 'object') return []
  const list = Array.isArray(parsedValue.recipes)
    ? parsedValue.recipes
    : Array.isArray(parsedValue)
      ? parsedValue
      : []
  return list
    .filter(r => r && typeof r === 'object' && Array.isArray(r.ingredients) && r.ingredients.length > 0)
    .map((r, i) => ({
      id: r.id || `ai-${Date.now().toString(36)}-${i}`,
      meal: ['breakfast', 'lunch', 'dinner', 'snacks'].includes(r.meal) ? r.meal : 'lunch',
      title: String(r.title || r.name || 'Coach recipe').slice(0, 120),
      cookMin: Math.max(5, Math.min(120, +(r.cookMin || 20) || 20)),
      ingredients: r.ingredients.slice(0, 12).map(ing => ({
        name: String(ing.name || ing.item || '').slice(0, 80),
        amount: Math.max(1, +(ing.amount ?? 100) || 100),
        unit: ['g', 'ml', 'pieces', 'cup', 'tbsp', 'tsp'].includes(ing.unit) ? ing.unit : 'g',
      })),
      steps: Array.isArray(r.steps) ? r.steps.slice(0, 8).map(s => String(s).slice(0, 280)) : [],
    }))
}
