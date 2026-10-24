import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import Ring from '../components/Ring.jsx'
import { Button, NumberField, Segmented, TextArea, TextField } from '../components/ui.jsx'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { targetsForDay, ACTIVITY } from '../lib/nutrition-targets.js'
import { goalSheet } from '../sheets.jsx'

// The Food tab: today's targets (lib/nutrition-targets.js), the day's meals, and the shopping
// list. Targets need a short body profile, set up here once; the meals and the list arrive with
// the meal planner, and until then their sections say so rather than showing made-up data.
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

export default function Food() {
  const S = useStore(s => s.S)
  const today = todayISO()
  const tg = targetsForDay(S, today)
  const day = tg?.day
  const macros = [['Protein', 'var(--blue)', day?.protein], ['Carbs', 'var(--yellow)', day?.carbs], ['Fat', 'var(--pink)', day?.fat]]
  const hasWeight = S.bodyweight.length > 0
  return <div className="narrow food">
    <div className="hdr">
      <div><h1>{t('Food')}</h1><div className="sub">{t('Meals, macros and shopping')}</div></div>
      {S.nutrition && <button className="iconbtn" onClick={profileSheet} aria-label={t('Your body profile')} title={t('Your body profile')}><Icon name="person" /></button>}
    </div>

    <div className="card food-today">
      <div className="food-rings">
        <Ring value={null} color="var(--orange)" size={92} stroke={10} label={t('Calories')}>
          <div className="ring-num">{day ? fmtNum(day.kcal) : '–'}</div><div className="ring-unit">kcal</div>
        </Ring>
        <div className="food-macros">
          {macros.map(([m, c, g]) =>
            <div key={m} className="macro">
              <div className="row between small"><span>{t(m)}</span><span className="dim">{g != null ? fmtNum(g) : '–'} g</span></div>
              <div className="macro-bar" style={{ '--c': c }}><span style={{ width: 0 }} /></div>
            </div>)}
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
      {MEALS.map(m => <div key={m.key} className="item disabled" aria-disabled="true">
        <span className="lrow-i" style={{ background: 'color-mix(in srgb,var(--orange) 22%,transparent)', color: 'var(--orange)' }}><Icon name={m.icon} /></span>
        <div className="grow"><div className="tt">{t(m.label)}</div><div className="ss">{t('Nothing planned yet')}</div></div>
        <Icon name="plus" className="chev" />
      </div>)}
    </div>

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
