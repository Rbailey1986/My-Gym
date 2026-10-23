import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutineIds, effectiveRoutines } from '../lib/history.js'
import { todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'
import Elapsed from './Elapsed.jsx'
import { useConnectionTrouble } from './SyncBanner.jsx'
import { menuSheet, bwSheet } from '../sheets.jsx'
import { areaOf, AREA_TINT } from '../lib/areas.js'

// Module scope, not TabBar's render body. Declared inside it, `Tab` was a new function on every
// render, so React saw a different component type each time and threw the button away and built a
// fresh one — on a bar that is fixed on screen, and once a second for the whole of a rest. The
// state it took with it is the DOM node itself: focus, the :active tint, any in-flight transition.
function Tab({ active, icon, label, onClick, dot, tint }) {
  return (
    <button className={active ? 'on' : ''} onClick={onClick} aria-label={dot ? label + ', ' + t('Connection problem') : undefined}
      style={tint ? { '--tab-c': tint } : undefined}>
      <span className="tab-ic"><Icon name={icon} />{dot && <span className="tab-dot" aria-hidden="true" />}</span><span>{label}</span>
    </button>
  )
}

export default function TabBar({ onStart }) {
  const nav = useNavigate()
  const loc = useLocation()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  const isGuest = useStore(s => s.isGuest())
  const trouble = useConnectionTrouble()
  if (!user && !isGuest) return null
  const cur = loc.pathname.split('/')[1] || 'home'
  // Five areas (lib/areas.js): Today, Train (plan, routines and the exercise library), Food,
  // Progress (stats and everything recorded over time).
  const area = areaOf(loc.pathname)
  const on = k => area === k

  const running = !!S.active && cur !== 'workout' && !S.active.editingWorkoutId && !S.active.backfill && S.active.start > 0
  const startWorkout = () => {
    if (!S.active) {
      if (effectiveRoutines(S, todayISO()).some(r => r.ex.length)) { onStart(effectiveRoutineIds(S, todayISO())); return }
    }
    nav('/workout')
  }
  // With a session open the centre button goes straight back to it, as it always has; otherwise it
  // is the quick-add menu, today's workout first so starting one is still the top line.
  const today = effectiveRoutines(S, todayISO()).filter(r => r.ex.length)
  const quickAdd = () => {
    if (S.active) { nav('/workout'); return }
    menuSheet({
      title: t('Add'),
      items: [
        { icon: 'play', accent: true, label: today.length ? t('Start {0}', today.map(r => r.name).join(' + ')) : t('Start a workout'), onClick: startWorkout },
        today.length && { icon: 'swap', label: t('Choose a different workout'), onClick: () => nav('/workout') },
        { icon: 'scale', label: t('Log body weight'), onClick: () => bwSheet() },
        { icon: 'utensils', label: t('Log a meal'), sub: t('Arrives with the meal planner'), disabled: true },
        S.checkIn !== false && { icon: 'qr', label: t('Check in at the gym'), onClick: () => nav('/checkin') },
      ],
    })
  }

  return (
    <nav id="tabbar">
      <Tab active={on('home')} icon="house" label={t('Today')} dot={trouble} onClick={() => nav('/home')} />
      <Tab active={on('train')} icon="dumbbell" label={t('Train')} onClick={() => nav('/plan')} />
      {/* On the workout screen itself there is nothing to resume, so the button reads as the
          tab it is and stays lit (#29); anywhere else it brings you back to the exercise you
          were on — the marker is kept in S.active.cur and never moves on its own (#21).
          A live session you stepped away from shows its running time instead of a word, the
          button still named Resume; a past workout being edited or logged after the fact has no
          clock to run. With nothing open it is the quick-add button. */}
      <button className={'start' + (S.active ? ' rec' : '') + (S.active && cur === 'workout' ? ' on' : '')} onClick={quickAdd}
        aria-label={running ? t('Resume') : undefined}>
        <span className="cir"><Icon name={S.active ? 'play' : 'plus'} /></span>
        {running ? <span className="tab-time"><Elapsed start={S.active.start} /></span>
          : <span>{S.active ? (cur === 'workout' ? t('Workout') : S.active.editingWorkoutId ? t('Edit workout') : t('Resume')) : t('Add')}</span>}
      </button>
      <Tab active={on('food')} icon="utensils" label={t('Food')} tint={AREA_TINT.food} onClick={() => nav('/food')} />
      <Tab active={on('progress')} icon="chart" label={t('Progress')} tint={AREA_TINT.progress} onClick={() => nav('/stats')} />
    </nav>
  )
}
