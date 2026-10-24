import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import Ring from '../components/Ring.jsx'
import { Button, NumberField, Segmented, TextArea, TextField } from '../components/ui.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { targetsForDay, ACTIVITY } from '../lib/nutrition-targets.js'
import { searchFoods, macrosFor, pieceGrams } from '../lib/foods.js'
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
import { tappable } from '../lib/use-sheet-keyboard.js'
import { goalSheet } from '../sheets.jsx'

// The Food tab: today's targets (lib/nutrition-targets.js), per-meal food logging (lib/food-log.js),
// food table search and portion calculator (lib/foods.js), and the shopping list.
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
  const today = todayISO()
  const tg = targetsForDay(S, today)
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
  return <div className="narrow food">
    <div className="hdr">
      <div><h1>{t('Food')}</h1><div className="sub">{t('Meals, macros and shopping')}</div></div>
      {S.nutrition && <button className="iconbtn" onClick={profileSheet} aria-label={t('Your body profile')} title={t('Your body profile')}><Icon name="person" /></button>}
    </div>

    <div className="card food-today">
      <div className="food-rings">
        <Ring value={day && eaten.count ? eaten.kcal / day.kcal : null} color="var(--orange)" size={92} stroke={10} label={t('Calories')}>
          <div className="ring-num">{eaten.count ? fmtNum(eaten.kcal) : day ? fmtNum(day.kcal) : '–'}</div>
          <div className="ring-unit">{eaten.count && day ? `/ ${fmtNum(day.kcal)} kcal` : 'kcal'}</div>
        </Ring>
        <div className="food-macros">
          {macros.map(([m, c, got, target]) => {
            const pct = target && eaten.count ? Math.min(100, Math.round((got / target) * 100)) : 0
            return <div key={m} className="macro">
              <div className="row between small">
                <span>{t(m)}</span>
                <span className="dim">{eaten.count ? `${fmtNum(got)}${target != null ? ' / ' + fmtNum(target) : ''} g` : `${target != null ? fmtNum(target) : '–'} g`}</span>
              </div>
              <div className="macro-bar" style={{ '--c': c }}><span style={{ width: pct ? pct + '%' : 0 }} /></div>
            </div>
          })}
        </div>
      </div>
      {tg ? <div className="food-why small">
        <div><span className="chip-day">{tg.trainingDay ? t('Training day') : t('Rest day')}</span>
          <span className="dim">{t('Rest days {0} kcal · training days {1} kcal', fmtNum(tg.rest.kcal), fmtNum(tg.training.kcal))}</span></div>
        <div className="dim">{whyLine(tg, S)}</div>
        {tg.rate.reason === 'capped' && <div className="warn">{t('Your target date needs a faster loss than is safe, so this aims for the safe pace and the date will slip.')}</div>}
        {day.floored && <div className="warn">{t('This is the lowest the app will set. Eating less than this is not something it will plan for.')}</div>}
      </div> : <div className="food-setup">
        <div className="dim small">{!S.nutrition
          ? t('Four questions about you, and the app works out your daily calories and protein from your weight and goal.')
          : t('Log your weight once and your targets appear here.')}</div>
        {!S.nutrition && <Button variant="primary" icon="target" onClick={profileSheet}>{t('Set up your targets')}</Button>}
      </div>}
      {tg && S.targetW == null && hasWeight && <div className="dim small" style={{ marginTop: 8 }}>
        {t('No weight goal yet, so these keep your weight steady.')} <button className="linklike" onClick={goalSheet}>{t('Set a goal')}</button>
      </div>}
    </div>

    <h2 className="sec-title">{t('Today')}</h2>
    <div className="list">
      {MEALS.map(m => {
        const items = log[m.key]
        const mt = eaten.byMeal[m.key]
        const planned = plannedMealFor(S, today, m.key)
        const sub = items.length
          ? `${fmtNum(mt.kcal)} kcal · ${items.map(i => i.name).join(', ')}`
          : planned
            ? t('Planned: {0}', planned.title || planned.name)
            : t('Nothing logged yet')
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

    <div className="card food-soon">
      <div className="row" style={{ gap: 10 }}>
        <span className="lrow-i" style={{ background: 'var(--orange)' }}><Icon name="cart" /></span>
        <div className="grow">
          <div className="ttl">{t('Shopping list')}</div>
          <div className="ss">{t('Built from your meal plan, grouped by aisle.')}</div>
        </div>
      </div>
    </div>

    <div className="card food-soon">
      <div className="lbl2" style={{ color: 'var(--orange)' }}>{t('Coming next')}</div>
      <div className="ttl" style={{ marginTop: 2 }}>{t('Your meal planner')}</div>
      <div className="muted small" style={{ marginTop: 4 }}>{t('Tell it your diet, allergies and the foods you like, and it plans a week of meals with recipes that hit your targets, then writes the shopping list.')}</div>
      <Button icon="heart" onClick={prefsSheet} style={{ marginTop: 10 }}>{S.foodPrefs ? t('Edit food preferences') : t('Set food preferences')}</Button>
    </div>
  </div>
}

// How the number came about, in one line: maintenance and the goal's daily gap.
function whyLine(tg, S) {
  const gap = tg.rest.kcal - tg.maintenance
  const kgWeek = Math.abs(tg.rate.kgPerWeek) * (S.unit === 'lb' ? 2.20462 : 1)
  const pace = fmtNum(Math.round(kgWeek * 100) / 100) + ' ' + S.unit
  if (tg.rate.reason === 'hold' || Math.abs(gap) < 20) return t('About {0} kcal keeps your weight where it is.', fmtNum(tg.maintenance))
  return gap < 0
    ? t('About {0} kcal keeps your weight steady; {1} less a day loses {2} a week.', fmtNum(tg.maintenance), fmtNum(-gap), pace)
    : t('About {0} kcal keeps your weight steady; {1} more a day gains {2} a week.', fmtNum(tg.maintenance), fmtNum(gap), pace)
}

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
        <Button size="sm" variant="primary" icon="check" onClick={() => update(s => { eatPlannedMeal(s, iso, mealKey) })}>{t('Ate this')}</Button>
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
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => {
      update(s => { s.foodPrefs = { diet, allergies: allergies.trim(), dislikes: dislikes.trim(), likes: likes.trim(), cookMin, budget, meals } })
      close()
    }}>{t('Save')}</Button>
  </>
}
const prefsSheet = () => useUI.getState().openSheet(close => <PrefsSheet close={close} />)
