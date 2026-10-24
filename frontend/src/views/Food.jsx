import { useState, useEffect } from 'react'
import Icon from '../components/Icon.jsx'
import Ring from '../components/Ring.jsx'
import { Button, NumberField, Segmented, TextArea, TextField } from '../components/ui.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, getLang } from '../lib/i18n.js'
import { fmtNum, todayISO, DAYS } from '../lib/format.js'
import { targetsForDay, ACTIVITY } from '../lib/nutrition-targets.js'
import { adaptiveAdjustment } from '../lib/adaptive-targets.js'
import { searchFoods, macrosFor, pieceGrams, foodById } from '../lib/foods.js'
import {
  dayLog,
  dayTotals,
  makeLogItem,
  addFoodToMeal,
  removeFoodFromMeal,
  plannedMealFor,
  eatPlannedMeal,
  isFavFood,
  toggleFavFood,
  favouriteFoods,
  recentFoods,
} from '../lib/food-log.js'
import {
  activeMealKeys,
  generateWeeklyMealPlan,
  swapPlannedMeal,
  regeneratePlannedDay,
  aiDaysFromRecipes,
  aiDayFromRecipes,
} from '../lib/meal-plan.js'
import {
  buildShoppingList,
  toggleItemChecked,
  toggleItemInCupboard,
  clearCheckedState,
  formatQuantity,
  AISLE_KEYS,
  AISLE_LABELS,
} from '../lib/shopping-list.js'
import { requestMealRecipes } from '../lib/coach-api.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { goalSheet } from '../sheets.jsx'

// The Food tab: today's targets (lib/nutrition-targets.js + lib/adaptive-targets.js), per-meal food
// logging (lib/food-log.js), the AI/smart weekly meal planner with recipe macro recalculation
// (lib/meal-plan.js), food table search and portion calculator (lib/foods.js), cook mode, and the shopping list.
const MEALS = [
  { key: 'breakfast', label: 'Breakfast', icon: 'sunrise' },
  { key: 'lunch', label: 'Lunch', icon: 'sun' },
  { key: 'dinner', label: 'Dinner', icon: 'moon' },
  { key: 'snacks', label: 'Snacks', icon: 'plusCircle' },
]
const ACTIVITY_LABEL = {
  sedentary: ['Mostly sitting', 'A desk job, little walking'],
  light: ['Lightly active', 'On your feet some of the day'],
  moderate: ['Active', 'On your feet most of the day'],
  very: ['Very active', 'A physical job'],
}
const FOOD_UNITS = [
  ['g', 'g'],
  ['ml', 'ml'],
  ['pieces', 'pieces'],
  ['cup', 'cup'],
  ['tbsp', 'tbsp'],
  ['tsp', 'tsp'],
]

export default function Food() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [q, setQ] = useState('')
  const [selectedPlanIso, setSelectedPlanIso] = useState(null)
  const [coachBusy, setCoachBusy] = useState(false)
  const today = todayISO()
  const baseTg = targetsForDay(S, today)
  const adj = adaptiveAdjustment(S, today, baseTg)
  const tg = adj ? { ...baseTg, rest: adj.rest, training: adj.training, day: adj.day, adaptive: adj } : baseTg
  const day = tg?.day
  const eaten = dayTotals(S, today)
  const log = dayLog(S, today)
  const macros = [
    ['Protein', 'var(--blue)', eaten.protein, day?.protein],
    ['Carbs', 'var(--yellow)', eaten.carbs, day?.carbs],
    ['Fat', 'var(--pink)', eaten.fat, day?.fat],
  ]
  const hasWeight = S.bodyweight.length > 0
  const hits = q.trim() ? searchFoods(q, 25) : []

  const planDates = S.mealPlan?.days ? Object.keys(S.mealPlan.days).sort() : []
  const activePlanIso = (selectedPlanIso && S.mealPlan?.days?.[selectedPlanIso])
    ? selectedPlanIso
    : S.mealPlan?.days?.[today]
      ? today
      : planDates[0] || today
  const plannedDay = S.mealPlan?.days?.[activePlanIso] || null
  const planMealKeys = activeMealKeys(S.foodPrefs)

  const shopList = buildShoppingList(S.mealPlan, {
    existingState: S.shoppingListState || {},
    customItems: S.shoppingListCustom || [],
    lang: getLang(),
  })

  const handleGenerateWeek = async (useCoach = false) => {
    const lang = getLang()
    // Immediately populate a responsive 7-day plan so the UI never blocks
    update(s => {
      s.mealPlan = generateWeeklyMealPlan(s, today, { source: 'smart', lang })
    })
    setSelectedPlanIso(today)
    if (!useCoach) return
    setCoachBusy(true)
    try {
      const res = await requestMealRecipes({
        mode: 'week',
        prefs: S.foodPrefs || {},
        targets: {
          restKcal: tg?.rest?.kcal || 2000,
          trainingKcal: tg?.training?.kcal || 2300,
          protein: tg?.day?.protein || 150,
        },
      })
      if (res?.ok && res.recipes?.length) {
        const aiDays = aiDaysFromRecipes(res.recipes, today)
        update(s => {
          s.mealPlan = generateWeeklyMealPlan(s, today, { aiDays, source: res.provider || 'coach', lang })
        })
      }
    } finally {
      setCoachBusy(false)
    }
  }

  const handleRegenerateDay = async iso => {
    const lang = getLang()
    update(s => { regeneratePlannedDay(s, iso, { lang }) })
    if (S.coach?.consent?.agreedAt) {
      setCoachBusy(true)
      try {
        const res = await requestMealRecipes({
          mode: 'day',
          prefs: S.foodPrefs || {},
          targets: {
            restKcal: tg?.rest?.kcal || 2000,
            trainingKcal: tg?.training?.kcal || 2300,
            protein: tg?.day?.protein || 150,
          },
        })
        if (res?.ok && res.recipes?.length) {
          const aiMeals = aiDayFromRecipes(res.recipes, 0)
          update(s => { regeneratePlannedDay(s, iso, { aiMeals, lang }) })
        }
      } finally {
        setCoachBusy(false)
      }
    }
  }

  return <div className="view food-view">
    <div className="view-h">
      <div className="title-row">
        <div>
          <h1 className="title">{t('Food')}</h1>
          <p className="sub">{day ? `${fmtNum(day.kcal)} kcal · ${day.protein} g ${t('Protein')}` : t('Calories and macros')}</p>
        </div>
        <button className="iconbtn" onClick={profileSheet} aria-label={t('Your body profile')} title={t('Your body profile')}><Icon name="personCircle" /></button>
      </div>
    </div>

    {!day && <div className="card food-soon">
      <div className="ttl">{t('Daily calorie target')}</div>
      <div className="muted small" style={{ marginTop: 4 }}>
        {t('Set your birth year, height, sex and daily activity to calculate how many calories keep you where you are, and what deficit hits your goal.')}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <Button variant="primary" onClick={profileSheet}>{t('Set body profile')}</Button>
        {!hasWeight && <Button onClick={goalSheet}>{t('Set a weight goal')}</Button>}
      </div>
    </div>}

    {day && <div className="card food-card" style={{ marginBottom: 14 }}>
      <div className="row between" style={{ gap: 12 }}>
        <div className="grow">
          <div className="food-badge">{tg?.trainingDay ? t('Training day') : t('Rest day')}</div>
          <div className="food-knum">{fmtNum(eaten.kcal)}</div>
          <div className="food-ktot">{t('{0} kcal left of {1}', fmtNum(Math.max(0, day.kcal - eaten.kcal)), fmtNum(day.kcal))}</div>
          <div className="food-why small dim">{adj ? adaptiveLine(adj) : whyLine(tg, S)}</div>
        </div>
        <div style={{ width: 88, height: 88, flexShrink: 0, position: 'relative' }}>
          <Ring
            size={88}
            stroke={8}
            rings={[{ value: eaten.kcal, max: day.kcal, color: eaten.kcal > day.kcal ? 'var(--pink)' : 'var(--orange)' }]}
          />
          <div className="ring-icon-center" style={{ color: 'var(--orange)' }}><Icon name="flame" /></div>
        </div>
      </div>
      <div className="food-macros">
        {macros.map(([label, color, v, max]) => {
          const pct = max ? Math.min(100, Math.round((v / max) * 100)) : 0
          return <div key={label} className="food-m">
            <div className="row between small">
              <span className="food-mlbl">{t(label)}</span>
              <span className="food-mval">{`${fmtNum(v)} / ${fmtNum(max || 0)} g`}</span>
            </div>
            <div className="food-mbar"><div className="food-mfill" style={{ width: `${pct}%`, background: color }} /></div>
          </div>
        })}
      </div>
    </div>}

    <div className="row between" style={{ marginTop: 14, marginBottom: 8 }}>
      <h2 className="sec-title" style={{ margin: 0 }}>{t('Log food')}</h2>
      <span className="dim small">{t('Today')}</span>
    </div>

    <div className="list" style={{ marginBottom: 14 }}>
      {MEALS.map(m => {
        const items = log[m.key] || []
        const mt = eaten.byMeal[m.key]
        const sub = items.length
          ? `${items.length} ${items.length === 1 ? t('item') : t('items')} · ${fmtNum(mt.kcal)} kcal`
          : t('Nothing logged yet')
        const planned = plannedMealFor(S, today, m.key)
        return <div key={m.key} className="item" {...tappable(() => mealSheet(today, m.key))}>
          <span className="lrow-i" style={{ background: 'color-mix(in srgb,var(--orange) 22%,transparent)', color: 'var(--orange)' }}><Icon name={m.icon} /></span>
          <div className="grow"><div className="tt">{t(m.label)}</div><div className="ss">{sub}</div></div>
          {!items.length && planned && <Button size="sm" variant="tinted" icon="check" onClick={e => {
            e.stopPropagation()
            update(s => { eatPlannedMeal(s, today, m.key) })
          }}>{t('Ate this')}</Button>}
          <Icon name="plus" className="chev" />
        </div>
      })}
    </div>

    <div className="row between" style={{ marginTop: 18, marginBottom: 8 }}>
      <h2 className="sec-title" style={{ margin: 0 }}>{t('Meal planner')}</h2>
      <div className="row" style={{ gap: 6 }}>
        <Button size="sm" icon="heart" onClick={prefsSheet}>{S.foodPrefs ? t('Edit food preferences') : t('Set food preferences')}</Button>
        <Button size="sm" variant="primary" icon="sparkles" disabled={coachBusy} onClick={() => handleGenerateWeek(true)}>
          {coachBusy ? t('Planning…') : S.mealPlan ? t('New week') : t('Plan my week')}
        </Button>
      </div>
    </div>

    {plannedDay ? <div className="card" style={{ marginBottom: 14 }}>
      <div className="wstrip" style={{ marginBottom: 10 }}>
        {planDates.map(iso => {
          const dObj = new Date(iso + 'T12:00:00')
          const pDay = S.mealPlan.days[iso]
          const isSel = iso === activePlanIso
          return <div key={iso} className={'wday' + (isSel ? ' today' : '')} {...tappable(() => setSelectedPlanIso(iso))}>
            <div className="lbl">{t(DAYS[dObj.getDay()])}</div>
            <div className="num">{dObj.getDate()}</div>
            <div className={'dot' + (pDay?.trainingDay ? ' plan' : '')} />
          </div>
        })}
      </div>

      <div className="row between small" style={{ marginBottom: 10, gap: 8 }}>
        <div>
          <span className="chip-day">{plannedDay.trainingDay ? t('Training day') : t('Rest day')}</span>
          <span className="dim">
            {`${fmtNum(plannedDay.kcal)} / ${fmtNum(plannedDay.targetKcal)} kcal · P ${fmtNum(plannedDay.protein)} g · C ${fmtNum(plannedDay.carbs)} g · F ${fmtNum(plannedDay.fat)} g`}
          </span>
          {S.foodPrefs?.partner?.enabled && plannedDay.partnerTargetKcal && <div className="dim" style={{ marginTop: 2 }}>
            {t('Shared meals · {0}: ~{1} kcal/day', S.foodPrefs.partner.name || t('Partner'), fmtNum(plannedDay.partnerTargetKcal))}
          </div>}
        </div>
        <Button size="sm" icon="reset" disabled={coachBusy} onClick={() => handleRegenerateDay(activePlanIso)}>{t('Regenerate day')}</Button>
      </div>

      <div className="list">
        {planMealKeys.map(mealKey => {
          const mDef = MEALS.find(m => m.key === mealKey) || MEALS[0]
          const rec = plannedDay[mealKey]
          if (!rec) return null
          const partnerBit = rec.partner
            ? ` · ${rec.partner.name}: ${fmtNum(rec.partner.kcal)} kcal`
            : ''
          return <div key={mealKey} className="item" {...tappable(() => recipeSheet(activePlanIso, mealKey))}>
            <span className="lrow-i" style={{ background: 'color-mix(in srgb,var(--orange) 22%,transparent)', color: 'var(--orange)' }}><Icon name={mDef.icon} /></span>
            <div className="grow">
              <div className="tt">{t(mDef.label)}: {rec.title}</div>
              <div className="ss">{`${fmtNum(rec.kcal)} kcal · P ${fmtNum(rec.protein)} g · C ${fmtNum(rec.carbs)} g · F ${fmtNum(rec.fat)} g · ${t('{0} min', rec.cookMin)}${partnerBit}`}</div>
            </div>
            <button className="iconbtn" onClick={e => {
              e.stopPropagation()
              cookModeSheet(rec)
            }} aria-label={t('Cook mode')} title={t('Cook mode')}><Icon name="flame" /></button>
            <button className="iconbtn" onClick={e => {
              e.stopPropagation()
              update(s => { swapPlannedMeal(s, activePlanIso, mealKey, { lang: getLang() }) })
            }} aria-label={t('Swap meal')} title={t('Swap meal')}><Icon name="swap" /></button>
            <Icon name="chevronRight" className="chev" />
          </div>
        })}
      </div>
    </div> : <div className="card food-soon">
      <div className="ttl">{t('Your meal planner')}</div>
      <div className="muted small" style={{ marginTop: 4 }}>{t('Tell it your diet, allergies and the foods you like, and it plans a week of meals with recipes that hit your targets, then writes the shopping list.')}</div>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <Button variant="primary" icon="sparkles" disabled={coachBusy} onClick={() => handleGenerateWeek(false)}>{t('Plan my week')}</Button>
        <Button icon="heart" onClick={prefsSheet}>{S.foodPrefs ? t('Edit food preferences') : t('Set food preferences')}</Button>
      </div>
    </div>}

    <div className="card" {...tappable(shoppingListSheet)} style={{ cursor: 'pointer', marginBottom: 14 }}>
      <div className="row between">
        <div className="row" style={{ gap: 10 }}>
          <span className="lrow-i" style={{ background: 'var(--orange)' }}><Icon name="cart" /></span>
          <div>
            <div className="ttl" style={{ fontWeight: 600 }}>{t('Shopping list')}</div>
            <div className="ss">{shopList.stats.totalItems > 0
              ? (shopList.stats.toBuyCount === 0
                ? t('All items in cupboard')
                : t('{0} of {1} items bought', fmtNum(shopList.stats.checkedCount), fmtNum(shopList.stats.toBuyCount)))
              : t('Built from your meal plan, grouped by aisle.')}
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {shopList.stats.toBuyCount > 0 && <span className="chip-day">{`${shopList.stats.progressPct}%`}</span>}
          <Icon name="chevronRight" className="chev" />
        </div>
      </div>
      {shopList.stats.toBuyCount > 0 && (
        <div style={{ marginTop: 10, height: 4, background: 'var(--card-sub)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${shopList.stats.progressPct}%`, height: '100%', background: 'var(--orange)', transition: 'width 0.2s' }} />
        </div>
      )}
    </div>

    <h2 className="sec-title">{t('Food table')}</h2>
    <div className="search-row" style={{ marginBottom: 10 }}>
      <div className={'search' + (q.trim() ? ' has-count' : '') + (q ? ' has-clear' : '')}>
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input className="input" placeholder={t('Search foods…')} value={q} onChange={e => setQ(e.target.value)} />
        {q.trim() && <span className="search-count" role="status">{fmtNum(hits.length)}</span>}
        {q && <button className="clear" onClick={() => setQ('')} aria-label={t('Clear')}><Icon name="xmark" /></button>}
      </div>
    </div>
    {q.trim() && <div className="list" style={{ marginBottom: 12 }}>
      {hits.map(f => <div key={f.id} className="item" {...tappable(() => foodSheet(f))}>
        <div className="grow">
          <div className="tt">{isFavFood(S, f.id) && <Icon name="starFill" className="fav-star" />}{f.n}</div>
          <div className="ss">{t('{0} kcal · {1} g protein · {2} g carbs · {3} g fat · per 100 g', fmtNum(Math.round(f.k)), fmtNum(f.p), fmtNum(f.c), fmtNum(f.f))}</div>
        </div>
        <Icon name="chevronRight" className="chev" />
      </div>)}
      {hits.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
    </div>}
  </div>
}

// How the number came about, in one line: maintenance and the goal's daily gap.
function adaptiveLine(adj) {
  if (adj.status === 'nudge-down') return t('Weekly check: nudged {0} kcal a day from your last 2 weeks of weigh-ins and food logs.', fmtNum(adj.nudgeKcal))
  if (adj.status === 'nudge-up') return t('Weekly check: nudged +{0} kcal a day from your last 2 weeks of weigh-ins and food logs.', fmtNum(adj.nudgeKcal))
  if (adj.status === 'adherence') return t('Weekly check: targets stay as planned — recent weight changes match what was logged.')
  return t('Weekly check: right on pace over the last 2 weeks.')
}

function whyLine(tg, S) {
  const gap = tg.rest.kcal - tg.maintenance
  const kgWeek = Math.abs(tg.rate.kgPerWeek) * (S.unit === 'lb' ? 2.20462 : 1)
  const pace = fmtNum(Math.round(kgWeek * 100) / 100) + ' ' + S.unit
  if (tg.rate.reason === 'hold' || Math.abs(gap) < 20) return t('About {0} kcal keeps your weight where it is.', fmtNum(tg.maintenance))
  return gap < 0
    ? t('About {0} kcal keeps your weight steady; {1} less a day loses {2} a week.', fmtNum(tg.maintenance), fmtNum(-gap), pace)
    : t('About {0} kcal keeps your weight steady; {1} more a day gains {2} a week.', fmtNum(tg.maintenance), fmtNum(gap), pace)
}

function RecipeSheet({ iso, mealKey, close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [swappingCoach, setSwappingCoach] = useState(false)
  const planned = plannedMealFor(S, iso, mealKey)
  const mealDef = MEALS.find(m => m.key === mealKey) || MEALS[0]
  if (!planned) {
    return <>
      <h3>{t(mealDef.label)}</h3>
      <div className="muted small" style={{ marginBottom: 12 }}>{t('No recipe planned for this meal yet.')}</div>
      <Button variant="primary" onClick={close}>{t('Done')}</Button>
    </>
  }

  const handleCoachSwap = async () => {
    setSwappingCoach(true)
    try {
      const res = await requestMealRecipes({
        mode: 'swap',
        mealKey,
        currentTitle: planned.title,
        prefs: S.foodPrefs || {},
      })
      const aiRecipe = res?.ok && res.recipes?.length ? res.recipes[0] : null
      update(s => { swapPlannedMeal(s, iso, mealKey, { aiRecipe, lang: getLang() }) })
    } finally {
      setSwappingCoach(false)
    }
  }

  return <>
    <div className="row between" style={{ gap: 8, marginBottom: 4 }}>
      <h3 style={{ margin: 0 }}>{planned.title}</h3>
      <span className="chip-day">{t('{0} min', planned.cookMin || 20)}</span>
    </div>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Macros recalculated from the built-in ingredient nutrition table.')}</div>

    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row between small">
        <strong>{planned.partner ? t('Your portion') : t('Per serving')}</strong>
        <strong>{`${fmtNum(planned.kcal)} kcal · P ${fmtNum(planned.protein)} g · C ${fmtNum(planned.carbs)} g · F ${fmtNum(planned.fat)} g`}</strong>
      </div>
      {planned.partner && <div className="row between small dim" style={{ marginTop: 6 }}>
        <span>{planned.partner.name}</span>
        <span>{`${fmtNum(planned.partner.kcal)} kcal · P ${fmtNum(planned.partner.protein)} g · C ${fmtNum(planned.partner.carbs)} g · F ${fmtNum(planned.partner.fat)} g`}</span>
      </div>}
    </div>

    <div className="sect-t">{t('Ingredients')}</div>
    <div className="list" style={{ marginBottom: 12 }}>
      {(planned.ingredients || []).map((ing, idx) => {
        const food = ing.foodId ? foodById(ing.foodId) : null
        const portionLine = planned.partner && ing.partnerAmount > 0
          ? t('You: {0} {1} · {2}: {3} {1} · Cook total: {4} {1}', fmtNum(ing.amount), t(ing.unit), planned.partner.name, fmtNum(ing.partnerAmount), fmtNum(ing.totalAmount))
          : `${fmtNum(ing.amount)} ${t(ing.unit)} · ${fmtNum(ing.kcal)} kcal · P ${fmtNum(ing.protein)} g · C ${fmtNum(ing.carbs)} g · F ${fmtNum(ing.fat)} g`
        return <div key={idx} className="item" {...(food ? tappable(() => foodSheet(food, { iso, mealKey, amount: ing.amount, unit: ing.unit })) : {})}>
          <div className="grow">
            <div className="tt">{ing.name}</div>
            <div className="ss">{portionLine}</div>
          </div>
          {food && <Icon name="chevronRight" className="chev" />}
        </div>
      })}
    </div>

    {Array.isArray(planned.steps) && planned.steps.length > 0 && <>
      <div className="sect-t">{t('Steps')}</div>
      <div className="list" style={{ marginBottom: 14 }}>
        {planned.steps.map((step, i) => <div key={i} className="item">
          <span className="lrow-i" style={{ background: 'color-mix(in srgb,var(--orange) 18%,transparent)', color: 'var(--orange)', fontWeight: 700 }}>{i + 1}</span>
          <div className="grow"><div className="ss" style={{ color: 'var(--fg)' }}>{step}</div></div>
        </div>)}
      </div>
    </>}

    <div className="row" style={{ gap: 8, marginBottom: 8 }}>
      <Button variant="primary" icon="flame" onClick={() => cookModeSheet(planned)}>{t('Cook mode')}</Button>
      <Button icon="check" onClick={() => {
        update(s => { eatPlannedMeal(s, iso, mealKey) })
        close()
      }}>{t('Ate this')}</Button>
      <Button icon="swap" onClick={() => update(s => { swapPlannedMeal(s, iso, mealKey, { lang: getLang() }) })}>{t('Swap meal')}</Button>
      {S.coach?.consent?.agreedAt && <Button icon="sparkles" disabled={swappingCoach} onClick={handleCoachSwap}>{t('Ask Coach')}</Button>}
    </div>
  </>
}
export const recipeSheet = (iso, mealKey) => useUI.getState().openSheet(close => <RecipeSheet iso={iso} mealKey={mealKey} close={close} />)

function CookModeSheet({ planned, close }) {
  const [checkedIngs, setCheckedIngs] = useState({})
  const [checkedSteps, setCheckedSteps] = useState({})
  const [timerSec, setTimerSec] = useState((planned.cookMin || 20) * 60)
  const [timerRunning, setTimerRunning] = useState(false)

  useEffect(() => {
    let interval = null
    if (timerRunning && timerSec > 0) {
      interval = setInterval(() => {
        setTimerSec(s => Math.max(0, s - 1))
      }, 1000)
    } else if (timerSec === 0) {
      setTimerRunning(false)
    }
    return () => clearInterval(interval)
  }, [timerRunning, timerSec])

  const toggleIng = idx => setCheckedIngs(p => ({ ...p, [idx]: !p[idx] }))
  const toggleStep = idx => setCheckedSteps(p => ({ ...p, [idx]: !p[idx] }))

  const fmtTimer = s => {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  const ings = planned.ingredients || []
  const steps = planned.steps || []
  const ingsDone = ings.filter((_, i) => checkedIngs[i]).length
  const stepsDone = steps.filter((_, i) => checkedSteps[i]).length

  return <>
    <div className="row between" style={{ marginBottom: 8 }}>
      <div>
        <h3 style={{ margin: 0 }}>{planned.title}</h3>
        <div className="dim small" style={{ marginTop: 2 }}>{t('Cook mode')} · {t('{0} min', planned.cookMin || 20)}</div>
      </div>
      <Button size="sm" variant="tinted" onClick={close}>{t('Done cooking')}</Button>
    </div>

    {/* Built-in cooking timer card */}
    <div className="card" style={{ marginBottom: 12, textAlign: 'center', padding: '14px 10px' }}>
      <div className="muted small" style={{ marginBottom: 4 }}>{t('Cooking timer')}</div>
      <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1, color: timerSec === 0 ? 'var(--orange)' : 'var(--fg)' }}>
        {timerSec === 0 ? t('Timer finished!') : fmtTimer(timerSec)}
      </div>
      <div className="row center" style={{ gap: 8, marginTop: 8 }}>
        <Button size="sm" variant={timerRunning ? 'tinted' : 'primary'} icon={timerRunning ? 'pause' : 'play'} onClick={() => setTimerRunning(!timerRunning)}>
          {timerRunning ? t('Pause') : t('Start')}
        </Button>
        <Button size="sm" icon="reset" onClick={() => { setTimerRunning(false); setTimerSec((planned.cookMin || 20) * 60) }}>
          {t('Reset')}
        </Button>
      </div>
    </div>

    {/* Ingredients Prep Checklist */}
    {ings.length > 0 && <>
      <div className="row between" style={{ marginBottom: 6 }}>
        <div className="sect-t" style={{ margin: 0 }}>{t('Prep checklist')}</div>
        <span className="dim small">{`${ingsDone}/${ings.length}`}</span>
      </div>
      <div className="list" style={{ marginBottom: 14 }}>
        {ings.map((ing, i) => {
          const isDone = !!checkedIngs[i]
          const portionText = planned.partner && ing.partnerAmount > 0
            ? t('You: {0} {1} · {2}: {3} {1} · Cook total: {4} {1}', fmtNum(ing.amount), t(ing.unit), planned.partner.name, fmtNum(ing.partnerAmount), fmtNum(ing.totalAmount))
            : `${fmtNum(ing.amount)} ${t(ing.unit)}`
          return <div key={i} className="item" {...tappable(() => toggleIng(i))}>
            <span className="lrow-i" style={{ background: isDone ? 'var(--green)' : 'var(--card-sub)', color: isDone ? '#fff' : 'var(--fg-dim)' }}>
              <Icon name={isDone ? 'check' : 'circle'} />
            </span>
            <div className="grow" style={{ textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.6 : 1 }}>
              <div className="tt">{ing.name}</div>
              <div className="ss">{portionText}</div>
            </div>
          </div>
        })}
      </div>
    </>}

    {/* Cooking steps checklist */}
    {steps.length > 0 && <>
      <div className="row between" style={{ marginBottom: 6 }}>
        <div className="sect-t" style={{ margin: 0 }}>{t('Cooking steps')}</div>
        <span className="dim small">{`${stepsDone}/${steps.length}`}</span>
      </div>
      <div className="list" style={{ marginBottom: 14 }}>
        {steps.map((st, i) => {
          const isDone = !!checkedSteps[i]
          return <div key={i} className="item" {...tappable(() => toggleStep(i))}>
            <span className="lrow-i" style={{ background: isDone ? 'var(--green)' : 'color-mix(in srgb,var(--orange) 20%,transparent)', color: isDone ? '#fff' : 'var(--orange)', fontWeight: 700 }}>
              {isDone ? <Icon name="check" /> : (i + 1)}
            </span>
            <div className="grow" style={{ textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.6 : 1 }}>
              <div className="ss" style={{ color: 'var(--fg)' }}>{st}</div>
            </div>
          </div>
        })}
      </div>
    </>}
  </>
}
export const cookModeSheet = planned => useUI.getState().openSheet(close => <CookModeSheet planned={planned} close={close} />)

function ShoppingListSheet({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [newItemName, setNewItemName] = useState('')
  const [newItemAisle, setNewItemAisle] = useState('produce')
  const lang = getLang()

  const list = buildShoppingList(S.mealPlan, {
    existingState: S.shoppingListState || {},
    customItems: S.shoppingListCustom || [],
    lang,
  })

  const handleToggleCheck = itemId => {
    update(s => {
      s.shoppingListState = toggleItemChecked(s.shoppingListState || {}, itemId)
    })
  }

  const handleToggleCupboard = (e, itemId) => {
    e.stopPropagation()
    update(s => {
      s.shoppingListState = toggleItemInCupboard(s.shoppingListState || {}, itemId)
    })
  }

  const handleClearChecked = () => {
    update(s => {
      s.shoppingListState = clearCheckedState(s.shoppingListState || {})
    })
  }

  const handleAddCustom = () => {
    const name = newItemName.trim()
    if (!name) return
    const custom = {
      id: 'custom-' + Date.now().toString(36),
      name,
      aisle: newItemAisle,
      amount: 1,
      unit: '',
    }
    update(s => {
      s.shoppingListCustom = [...(s.shoppingListCustom || []), custom]
    })
    setNewItemName('')
  }

  return <>
    <div className="row between" style={{ marginBottom: 6 }}>
      <h3 style={{ margin: 0 }}>{t('Shopping list')}</h3>
      <Button size="sm" onClick={close}>{t('Done')}</Button>
    </div>

    {/* Progress Bar & Stats */}
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row between small" style={{ marginBottom: 6 }}>
        <span>{list.stats.toBuyCount === 0 && list.stats.totalItems > 0
          ? t('All items in cupboard')
          : t('{0} of {1} items bought', fmtNum(list.stats.checkedCount), fmtNum(list.stats.toBuyCount))}
        </span>
        <strong>{`${list.stats.progressPct}%`}</strong>
      </div>
      <div style={{ height: 6, background: 'var(--card-sub)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${list.stats.progressPct}%`, height: '100%', background: 'var(--orange)', transition: 'width 0.2s' }} />
      </div>
    </div>

    {/* Empty state */}
    {list.items.length === 0 && <div className="empty" style={{ margin: '20px 0' }}>
      <div className="ico"><Icon name="cart" /></div>
      <div>{t('No shopping items yet. Plan your week to generate a shopping list.')}</div>
    </div>}

    {/* Aisle Groups */}
    {AISLE_KEYS.map(aisleKey => {
      const aisleItems = list.byAisle[aisleKey] || []
      if (!aisleItems.length) return null
      const aisleLabel = (AISLE_LABELS[lang] && AISLE_LABELS[lang][aisleKey]) || AISLE_LABELS.en[aisleKey]
      return <div key={aisleKey} style={{ marginBottom: 14 }}>
        <div className="row between" style={{ marginBottom: 6 }}>
          <div className="sect-t" style={{ margin: 0 }}>{t(aisleLabel)}</div>
          <span className="dim small">{aisleItems.length}</span>
        </div>
        <div className="list">
          {aisleItems.map(item => {
            const isChecked = item.checked
            const inCupboard = item.inCupboard
            const qtyStr = formatQuantity(item.amount, item.unit)
            return <div key={item.id} className="item" {...tappable(() => handleToggleCheck(item.id))} style={{ opacity: inCupboard ? 0.45 : isChecked ? 0.65 : 1 }}>
              <span className="lrow-i" style={{ background: isChecked ? 'var(--orange)' : 'var(--card-sub)', color: isChecked ? '#fff' : 'var(--fg-dim)' }}>
                <Icon name={isChecked ? 'check' : 'circle'} />
              </span>
              <div className="grow" style={{ textDecoration: isChecked ? 'line-through' : 'none' }}>
                <div className="tt">{item.displayName}</div>
                <div className="ss">
                  {qtyStr ? `${qtyStr} · ` : ''}
                  {inCupboard ? t('In cupboard') : item.sources.join(', ')}
                </div>
              </div>
              <button className={'iconbtn' + (inCupboard ? ' active' : '')} onClick={e => handleToggleCupboard(e, item.id)} aria-label={t('In cupboard')} title={t('In cupboard')}>
                <Icon name="folder" />
              </button>
            </div>
          })}
        </div>
      </div>
    })}

    {/* Add Custom Item */}
    <div className="card" style={{ marginTop: 14, marginBottom: 12 }}>
      <div className="muted small" style={{ marginBottom: 6 }}>{t('Add custom item')}</div>
      <div className="row" style={{ gap: 6 }}>
        <input className="input grow" placeholder={t('Item name…')} value={newItemName} onChange={e => setNewItemName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCustom()} />
        <select className="input" value={newItemAisle} onChange={e => setNewItemAisle(e.target.value)} style={{ maxWidth: 130 }}>
          {AISLE_KEYS.map(k => <option key={k} value={k}>{(AISLE_LABELS[lang] && AISLE_LABELS[lang][k]) || AISLE_LABELS.en[k]}</option>)}
        </select>
        <Button size="sm" variant="tinted" icon="plus" onClick={handleAddCustom}>{t('Add')}</Button>
      </div>
    </div>

    {list.stats.checkedCount > 0 && <div className="row center" style={{ marginBottom: 10 }}>
      <Button size="sm" icon="trash" onClick={handleClearChecked}>{t('Clear checked')}</Button>
    </div>}
  </>
}
export const shoppingListSheet = () => useUI.getState().openSheet(close => <ShoppingListSheet close={close} />)

function MealSheet({ iso, mealKey, close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [mq, setMq] = useState('')
  const mealDef = MEALS.find(m => m.key === mealKey) || MEALS[0]
  const items = dayLog(S, iso)[mealKey]
  const mt = dayTotals(S, iso).byMeal[mealKey]
  const planned = plannedMealFor(S, iso, mealKey)
  const favs = favouriteFoods(S)
  const favSet = new Set(favs.map(x => x.food.id))
  const recents = recentFoods(S, 10).filter(x => !favSet.has(x.food.id))
  const hits = mq.trim() ? searchFoods(mq, 20) : []

  const quickRow = ({ food, amount, unit }) => {
    const m = macrosFor(food, amount, unit)
    return <div key={food.id} className="item" {...tappable(() => foodSheet(food, { iso, mealKey, amount, unit }))}>
      <div className="grow">
        <div className="tt">{isFavFood(S, food.id) && <Icon name="starFill" className="fav-star" />}{food.n}</div>
        <div className="ss">{`${fmtNum(amount)} ${t(unit)} · ${fmtNum(Math.round(m?.kcal || 0))} kcal`}</div>
      </div>
      <Button size="sm" variant="tinted" icon="plus" onClick={e => {
        e.stopPropagation()
        const entry = makeLogItem(food, amount, unit)
        if (entry) update(s => { addFoodToMeal(s, iso, mealKey, entry) })
      }}>{t('Add')}</Button>
    </div>
  }

  return <>
    <div className="row between" style={{ marginBottom: 8 }}>
      <h3 style={{ margin: 0 }}>{t(mealDef.label)}</h3>
      {items.length > 0 && <span className="dim small">{fmtNum(mt.kcal)} kcal</span>}
    </div>

    {!items.length && planned && <div className="card" style={{ marginBottom: 12 }}>
      <div className="row between" style={{ gap: 8 }}>
        <div>
          <div className="tt">{planned.title || planned.name}</div>
          <div className="muted small">{t('Planned meal · search below to log a swap instead.')}</div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Button size="sm" icon="utensils" onClick={() => recipeSheet(iso, mealKey)}>{t('Recipe')}</Button>
          <Button size="sm" variant="primary" icon="check" onClick={() => update(s => { eatPlannedMeal(s, iso, mealKey) })}>{t('Ate this')}</Button>
        </div>
      </div>
    </div>}

    {items.length > 0 && <div className="list" style={{ marginBottom: 12 }}>
      {items.map(it => <div key={it.id} className="item">
        <div className="grow">
          <div className="tt">{it.name}</div>
          <div className="ss">{`${fmtNum(it.amount)} ${t(it.unit)} · ${fmtNum(it.kcal)} kcal · P ${fmtNum(it.protein)} g · C ${fmtNum(it.carbs)} g · F ${fmtNum(it.fat)} g`}</div>
        </div>
        <button className="iconbtn" onClick={() => update(s => { removeFoodFromMeal(s, iso, mealKey, it.id) })} aria-label={t('Remove')}><Icon name="trash" /></button>
      </div>)}
    </div>}

    <div className="search-row" style={{ marginBottom: 10 }}>
      <div className={'search' + (mq.trim() ? ' has-count' : '') + (mq ? ' has-clear' : '')}>
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input className="input" placeholder={t('Search foods…')} value={mq} onChange={e => setMq(e.target.value)} />
        {mq.trim() && <span className="search-count" role="status">{fmtNum(hits.length)}</span>}
        {mq && <button className="clear" onClick={() => setMq('')} aria-label={t('Clear')}><Icon name="xmark" /></button>}
      </div>
    </div>

    {mq.trim() ? <div className="list" style={{ marginBottom: 12 }}>
      {hits.map(f => <div key={f.id} className="item" {...tappable(() => foodSheet(f, { iso, mealKey }))}>
        <div className="grow">
          <div className="tt">{isFavFood(S, f.id) && <Icon name="starFill" className="fav-star" />}{f.n}</div>
          <div className="ss">{t('{0} kcal · {1} g protein · {2} g carbs · {3} g fat · per 100 g', fmtNum(Math.round(f.k)), fmtNum(f.p), fmtNum(f.c), fmtNum(f.f))}</div>
        </div>
        <Icon name="plus" className="chev" />
      </div>)}
      {hits.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
    </div> : <>
      {favs.length > 0 && <>
        <div className="sect-t">{t('Favourites')}</div>
        <div className="list" style={{ marginBottom: 12 }}>{favs.map(quickRow)}</div>
      </>}
      {recents.length > 0 && <>
        <div className="sect-t">{t('Recent')}</div>
        <div className="list" style={{ marginBottom: 12 }}>{recents.map(quickRow)}</div>
      </>}
    </>}

    <Button variant="primary" onClick={close}>{t('Done')}</Button>
  </>
}
export const mealSheet = (iso, mealKey) => useUI.getState().openSheet(close => <MealSheet iso={iso} mealKey={mealKey} close={close} />)

function FoodSheet({ food, opts = {}, close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const [amount, setAmount] = useState(opts.amount ?? (food.pt || 100))
  const [unit, setUnit] = useState(opts.unit || 'g')
  const [mealKey, setMealKey] = useState(opts.mealKey || 'breakfast')
  const iso = opts.iso || todayISO()
  const fav = isFavFood(S, food.id)
  const changeUnit = next => {
    if ((next === 'pieces' || next === 'cup' || next === 'tbsp' || next === 'tsp') && (unit === 'g' || unit === 'ml')) setAmount(1)
    else if ((next === 'g' || next === 'ml') && unit !== 'g' && unit !== 'ml') setAmount(food.pt || 100)
    setUnit(next)
  }
  const m = macrosFor(food, amount ?? 0, unit) || { kcal: 0, protein: 0, carbs: 0, fat: 0, grams: 0 }
  return <>
    <div className="row between" style={{ gap: 8 }}>
      <h3 style={{ margin: 0 }}>{food.n}</h3>
      <button className="iconbtn" onClick={() => update(s => { toggleFavFood(s, food.id) })} aria-label={fav ? t('Remove from favourites') : t('Add to favourites')}>
        <Icon name={fav ? 'starFill' : 'star'} />
      </button>
    </div>
    {food.en && food.en !== food.n && <div className="muted small" style={{ marginBottom: 10 }}>{food.en}</div>}
    <div className="sect-t">{t('Amount')}</div>
    <NumberField className="input" value={amount ?? ''} onChange={setAmount} placeholder="100" />
    <div style={{ marginTop: 10 }}>
      <Segmented value={unit} onChange={changeUnit} options={FOOD_UNITS.map(([value, label]) => ({ value, label: t(label) }))} />
    </div>
    {unit !== 'g' && <div className="muted small" style={{ marginTop: 6 }}>
      {unit === 'pieces'
        ? t('1 piece ≈ {0} g · {1} g total', fmtNum(pieceGrams(food)), fmtNum(m.grams))
        : t('{0} g', fmtNum(m.grams))}
    </div>}
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <span>{t('Calories')}</span>
        <strong>{fmtNum(Math.round(m.kcal))} kcal</strong>
      </div>
      <div className="row between small"><span>{t('Protein')}</span><span>{fmtNum(m.protein)} g</span></div>
      <div className="row between small" style={{ marginTop: 4 }}><span>{t('Carbs')}</span><span>{fmtNum(m.carbs)} g</span></div>
      <div className="row between small" style={{ marginTop: 4 }}><span>{t('Fat')}</span><span>{fmtNum(m.fat)} g</span></div>
      {m.fibre != null && <div className="row between small dim" style={{ marginTop: 4 }}><span>{t('Fibre')}</span><span>{fmtNum(m.fibre)} g</span></div>}
      {m.sugars != null && <div className="row between small dim" style={{ marginTop: 4 }}><span>{t('Sugars')}</span><span>{fmtNum(m.sugars)} g</span></div>}
    </div>
    <div className="sect-t" style={{ marginTop: 14 }}>{t('Meal')}</div>
    <Segmented value={mealKey} onChange={setMealKey} options={MEALS.map(m => ({ value: m.key, label: t(m.label) }))} />
    <div style={{ height: 14 }} />
    <Button variant="primary" icon="plus" disabled={!(amount > 0)} onClick={() => {
      const entry = makeLogItem(food, amount, unit)
      if (entry) update(s => { addFoodToMeal(s, iso, mealKey, entry) })
      close()
    }}>{t('Log food')}</Button>
  </>
}
export const foodSheet = (food, opts) => useUI.getState().openSheet(close => <FoodSheet food={food} opts={opts} close={close} />)

function ProfileSheet({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const p = S.nutrition || {}
  const [sex, setSex] = useState(p.sex || 'male')
  const [year, setYear] = useState(p.birthYear || null)
  const [height, setHeight] = useState(p.heightCm || null)
  const [activity, setActivity] = useState(p.activity || 'light')
  const thisYear = +todayISO().slice(0, 4)
  const ok = year >= thisYear - 100 && year <= thisYear - 14 && height >= 120 && height <= 230
  return <>
    <h3>{t('Your body profile')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('Used only to work out your daily calories and protein. It stays with your profile on your own server.')}</div>
    <div className="sect-t">{t('Sex')}</div>
    <Segmented value={sex} onChange={setSex} options={[{ value: 'male', label: t('Male') }, { value: 'female', label: t('Female') }]} />
    <div className="row" style={{ gap: 10, marginTop: 14 }}>
      <label className="grow"><div className="sect-t">{t('Year of birth')}</div>
        <NumberField className="input" decimal={false} nullable value={year ?? ''} onChange={setYear} placeholder="1986" /></label>
      <label className="grow"><div className="sect-t">{t('Height (cm)')}</div>
        <NumberField className="input" decimal={false} nullable value={height ?? ''} onChange={setHeight} placeholder="178" /></label>
    </div>
    <div className="sect-t" style={{ marginTop: 14 }}>{t('Outside your workouts, you are…')}</div>
    <div className="list menu-list">
      {Object.keys(ACTIVITY).map(k => <div key={k} className={'item menu-item' + (activity === k ? ' accent' : '')} role="radio" aria-checked={activity === k}
        tabIndex={0} onClick={() => setActivity(k)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setActivity(k) }}>
        <div className="grow"><div className="tt">{t(ACTIVITY_LABEL[k][0])}</div><div className="ss">{t(ACTIVITY_LABEL[k][1])}</div></div>
        {activity === k && <Icon name="check" className="menu-chev" />}
      </div>)}
    </div>
    <div style={{ height: 14 }} />
    <Button variant="primary" disabled={!ok} onClick={() => {
      update(s => { s.nutrition = { ...(s.nutrition || {}), sex, birthYear: year, heightCm: height, activity } })
      close()
    }}>{t('Save')}</Button>
  </>
}
const profileSheet = () => useUI.getState().openSheet(close => <ProfileSheet close={close} />)

const DIETS = [['any', 'Anything'], ['vegetarian', 'Vegetarian'], ['vegan', 'Vegan'], ['pescatarian', 'Pescatarian']]

function PrefsSheet({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const p = S.foodPrefs || {}
  const [diet, setDiet] = useState(p.diet || 'any')
  const [allergies, setAllergies] = useState(p.allergies || '')
  const [dislikes, setDislikes] = useState(p.dislikes || '')
  const [likes, setLikes] = useState(p.likes || '')
  const [cookMin, setCookMin] = useState(p.cookMin || 30)
  const [budget, setBudget] = useState(p.budget || 'mid')
  const [meals, setMeals] = useState(p.meals || 3)
  const [twoPeople, setTwoPeople] = useState(!!p.partner?.enabled)
  const [partnerName, setPartnerName] = useState(p.partner?.name || '')
  const [partnerKcal, setPartnerKcal] = useState(p.partner?.kcal || 1750)
  return <>
    <h3>{t('Food preferences')}</h3>
    <div className="muted small" style={{ marginBottom: 12 }}>{t('The meal planner only uses these. Separate items with commas.')}</div>
    <div className="sect-t">{t('Diet')}</div>
    <Segmented value={diet} onChange={setDiet} options={DIETS.map(([value, label]) => ({ value, label: t(label) }))} />
    <label><div className="sect-t" style={{ marginTop: 14 }}>{t('Allergies and intolerances')}</div>
      <TextField value={allergies} onChange={e => setAllergies(e.target.value)} placeholder={t('peanuts, shellfish')} /></label>
    <label><div className="sect-t" style={{ marginTop: 14 }}>{t('Foods you avoid')}</div>
      <TextField value={dislikes} onChange={e => setDislikes(e.target.value)} placeholder={t('mushrooms, olives')} /></label>
    <label><div className="sect-t" style={{ marginTop: 14 }}>{t('Foods you like')}</div>
      <TextArea rows={2} value={likes} onChange={e => setLikes(e.target.value)} placeholder={t('chicken, rice, eggs, pasta')} /></label>
    <div className="sect-t" style={{ marginTop: 14 }}>{t('Time to cook a meal')}</div>
    <Segmented value={cookMin} onChange={setCookMin} options={[15, 30, 60].map(m => ({ value: m, label: t('{0} min', m) }))} />
    <div className="sect-t" style={{ marginTop: 14 }}>{t('Budget')}</div>
    <Segmented value={budget} onChange={setBudget} options={[{ value: 'low', label: t('Tight') }, { value: 'mid', label: t('Normal') }, { value: 'high', label: t('Relaxed') }]} />
    <div className="sect-t" style={{ marginTop: 14 }}>{t('Meals a day')}</div>
    <Segmented value={meals} onChange={setMeals} options={[3, 4, 5].map(n => ({ value: n, label: String(n) }))} />
    <div className="sect-t" style={{ marginTop: 14 }}>{t('Household portions')}</div>
    <Segmented value={twoPeople ? 'two' : 'one'} onChange={v => setTwoPeople(v === 'two')} options={[
      { value: 'one', label: t('Just me') },
      { value: 'two', label: t('Two people') },
    ]} />
    {twoPeople && <div className="row" style={{ gap: 10, marginTop: 10 }}>
      <label className="grow"><div className="sect-t">{t('Second person')}</div>
        <TextField value={partnerName} onChange={e => setPartnerName(e.target.value)} placeholder={t('Partner')} /></label>
      <label className="grow"><div className="sect-t">{t('Daily target (kcal)')}</div>
        <NumberField className="input" decimal={false} value={partnerKcal ?? ''} onChange={setPartnerKcal} placeholder="1750" /></label>
    </div>}
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => {
      update(s => {
        s.foodPrefs = {
          diet,
          allergies: allergies.trim(),
          dislikes: dislikes.trim(),
          likes: likes.trim(),
          cookMin,
          budget,
          meals,
          partner: {
            enabled: twoPeople,
            name: partnerName.trim() || t('Partner'),
            kcal: +(partnerKcal || 1750) || 1750,
          },
        }
        if (s.mealPlan) {
          s.mealPlan = generateWeeklyMealPlan(s, s.mealPlan.startIso || todayISO(), { lang: getLang() })
        }
      })
      close()
    }}>{t('Save')}</Button>
  </>
}
const prefsSheet = () => useUI.getState().openSheet(close => <PrefsSheet close={close} />)
export { prefsSheet }
