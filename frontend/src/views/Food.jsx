import Icon from '../components/Icon.jsx'
import Ring from '../components/Ring.jsx'
import { t } from '../lib/i18n.js'

// The Food tab: today's intake against target, the day's meals, and the shopping list. The
// layout is in place ahead of the meal planner itself (nutrition profile, food log, AI meal plan,
// shopping list), so each section says plainly what will fill it rather than showing made-up data.
const MEALS = [
  { key: 'breakfast', label: 'Breakfast', icon: 'sunrise' },
  { key: 'lunch', label: 'Lunch', icon: 'sun' },
  { key: 'dinner', label: 'Dinner', icon: 'moon' },
  { key: 'snacks', label: 'Snacks', icon: 'plusCircle' },
]

export default function Food() {
  return <div className="narrow food">
    <div className="hdr">
      <div><h1>{t('Food')}</h1><div className="sub">{t('Meals, macros and shopping')}</div></div>
    </div>

    <div className="card food-today">
      <div className="food-rings">
        <Ring value={null} color="var(--orange)" size={92} stroke={10} label={t('Calories')}>
          <div className="ring-num">–</div><div className="ring-unit">kcal</div>
        </Ring>
        <div className="food-macros">
          {[['Protein', 'var(--blue)'], ['Carbs', 'var(--yellow)'], ['Fat', 'var(--pink)']].map(([m, c]) =>
            <div key={m} className="macro">
              <div className="row between small"><span>{t(m)}</span><span className="dim">– g</span></div>
              <div className="macro-bar" style={{ '--c': c }}><span style={{ width: 0 }} /></div>
            </div>)}
        </div>
      </div>
      <div className="dim small food-note">{t('Your daily targets appear here once your nutrition profile is set up.')}</div>
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
    </div>
  </div>
}
