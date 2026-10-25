import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutines, effectiveRoutineIds, nextTrainingDay, streakWeeks, lastBW, setsDoneActive } from '../lib/history.js'
import { fmtNum, fmtDate, todayISO, isoOf, weekStartOf, weekDayOffset, DAYS, DAYN } from '../lib/format.js'
import { t, tn, dateLocale } from '../lib/i18n.js'
import { bwSheet, goalSheet, dayOverrideSheet, calendarSheet, startFlow, starterPlanSheet, bwDeltaColor, weighInsSheet } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Icon from '../components/Icon.jsx'
import QueueRow from '../components/QueueRow.jsx'
import Ring from '../components/Ring.jsx'
import { queueOf, queueView, weekTally, pinState } from '../lib/queue.js'
import { fatigueOf } from '../lib/recovery.js'
import { fatigueStateOf } from '../lib/recovery-view.js'
import { MUSCLES, MUSCLE_NAME } from '../lib/muscles.js'
import { progressPhotosOf } from './ProgressPhotos.jsx'
import { scheduleModeOf } from '../lib/rotation.js'
import { goalProgress } from '../lib/goal-eta.js'
import { targetsForDay } from '../lib/nutrition-targets.js'
import { adaptiveAdjustment } from '../lib/adaptive-targets.js'
import { dayTotals } from '../lib/food-log.js'
import { useConnectionTrouble } from '../components/SyncBanner.jsx'
import { Button } from '../components/ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { glyphOf } from '../lib/glyphs.js'
import { dayNoteOf } from '../lib/day-notes.js'

// Today = what to do now and how the goal is going, at a glance: three rings (this week's
// workouts, the way to the goal weight, today's calories), the goal with its projected date,
// then the day itself. Deep charts and history live in Progress.
export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  // The banner switched off and the sync stuck: a dot on the gear (Settings → Show connection status).
  const trouble = useConnectionTrouble()
  const [weekOffset, setWeekOffset] = useState(0)

  const today = new Date()
  // A weekday can hold several routines. `todayRoutines` is the whole day; `routine` is the
  // first, kept for the one-routine glyph. The derived session name joins them (§9).
  const todayRoutines = effectiveRoutines(S, todayISO())
  const routine = todayRoutines[0] || null
  const todayName = todayRoutines.map(r => r.name).join(' + ')
  // A fulfilled pin (a coach session pinned to today and since done) reads as no override.
  const todayOvr = S.dayPlan[todayISO()] !== undefined && pinState(S, S.dayPlan[todayISO()]) !== 'done'
  // An open editor on a saved workout (lib/session-edit.js) holds S.active too, but it is not a
  // session in progress: the row takes you back to it as an edit, the way the tab bar does.
  const editingSaved = !!S.active?.editingWorkoutId
  const bw = lastBW(S)
  const prevBW = S.bodyweight.length > 1 ? S.bodyweight[S.bodyweight.length - 2] : null
  const delta = bw && prevBW ? bw.w - prevBW.w : null

  const ws = weekStartOf(S)
  // The first day of the shown week. Named for the role, not for Monday — which day that is
  // is the setting.
  const wkStart = new Date(today)
  wkStart.setDate(today.getDate() - weekDayOffset(today.getDay(), ws) + weekOffset * 7)
  const doneDays = new Set(S.workouts.map(w => w.d))
  // The last session logged for today, if any — what the row below reports instead of asking
  // you to start the one you already did. Last wins, so a second session names itself. Only once
  // today's plan is covered, though: a freestyle session on a planned day, or the rotation's
  // first session done when its next one is today's too, leaves the row offering what is still
  // to do, as Start and the progress row already do. A queue session is never "covered" by an
  // earlier workout: the queue only names one it does not count as done yet.
  const loggedToday = S.workouts.filter(w => w.d === todayISO())
  const queueIds = queueOf(S)?.ids || []
  const coveredToday = id => !queueIds.includes(id) && loggedToday.some(w => (Array.isArray(w.routineIds) ? w.routineIds : [w.routineId]).includes(id))
  const doneToday = (todayRoutines.every(r => coveredToday(r.id)) && loggedToday.at(-1)) || null
  const strip = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(wkStart); d.setDate(wkStart.getDate() + i)
    const iso = isoOf(d)
    const eff = effectiveRoutineIds(S, iso).length > 0, ovr = S.dayPlan[iso] !== undefined, done = doneDays.has(iso)
    // A day off with a note (#261) reads as excused, not as a plan that went by.
    const dot = done ? ' done' : dayNoteOf(S, iso) ? ' noted' : ovr && eff ? ' ovr' : eff ? ' plan' : ''
    strip.push(<div key={i} className={'wday' + (iso === todayISO() ? ' today' : '')} {...tappable(() => dayOverrideSheet(iso))}>
      <div className="lbl">{t(DAYS[d.getDay()])}</div><div className="num">{d.getDate()}</div><div className={'dot' + dot} /></div>)
  }
  const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 6)
  const wkLabel = weekOffset === 0 ? t('This week') : `${wkStart.getDate()} ${wkStart.toLocaleDateString(dateLocale(), { month: 'short' })} – ${wkEnd.getDate()} ${wkEnd.toLocaleDateString(dateLocale(), { month: 'short' })}`

  // A coach week (S.queue) read through the same tolerant reader QueueRow uses, so a malformed
  // queue from another client shows the weekday dots, never an empty card.
  const queue = queueView(S, todayISO())
  // This card shows one thing or the other — QueueRow for a live queue, or Rotation chosen with
  // nothing built yet (S.scheduleMode), in which case there is no queue for QueueRow to render and
  // an empty-state card takes its place. Plan does the same in rotation mode: no weekday grid, only
  // the days that add a routine the loop does not have (Plan.jsx, "Also on fixed days").
  const rotating = scheduleModeOf(S) === 'rotation'
  // A planner-written queue (no rotationId) still names its weekday when it hasn't started yet —
  // that copy predates rotation and stays as it is. Our own rotation has no weekday of its own
  // (lib/rotation.js): naming one here — including on the pass's own one-day empty gap (THE
  // ONE-DAY BOUNDARY, rotation.js) or before a first routine is even added — would be the
  // fixed-week model leaking into a schedule that was never weekday-based.
  const liveQ = queueOf(S)
  const plannerQueue = !!queue && !liveQ?.rotationId
  // Ownership, not mere presence of a rotationId: a stale id left over from a rebuilt rotation
  // would otherwise still read as "this app manages it" (lib/rotation.js).
  const managedQueue = !!liveQ && !!S.rotation && liveQ.rotationId === S.rotation.id
  // On a rest day, saying when you train next beats leaving the row as a full stop.
  const next = !S.active && !todayRoutines.length && !(rotating && !plannerQueue) ? nextTrainingDay(S, todayISO()) : null
  // The streak card's fraction: this calendar week's workouts over the weekdays with a plan, or,
  // in a coach week, the queue's sessions and your own days together (lib/queue.js weekTally).
  const { done: doneThisWeek, planned: plannedPerWeek } = weekTally(S, todayISO())
  const bwPoints = S.bodyweight.slice(-30).map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))

  // today's session shown right under the week strip
  const onToday = () => { if (S.active) nav('/workout'); else if (todayRoutines.length) startFlow(effectiveRoutineIds(S, todayISO())); else dayOverrideSheet(todayISO()) }
  // A chip on the coach week's progress row starts that one routine, in any order. A session
  // already in progress wins, as on the today row — starting another would overwrite it.
  const onQueueStart = id => { if (S.active) nav('/workout'); else startFlow([id]) }

  // The goal as lib/goal-eta.js reads it: share of the way there, and when the recent trend
  // would arrive. Null without a goal or a weigh-in.
  const goal = goalProgress(S, todayISO())
  const unit = S.unit
  const amount = v => fmtNum(Math.abs(v)) + ' ' + unit
  const goalLine = !goal ? null
    : goal.status === 'reached' ? t('Goal reached!')
    : goal.status === 'on-track' ? (goal.eta ? t('On track for {0}', fmtDate(goal.eta)) : t('On track, slowly'))
    : goal.status === 'away' ? t('The trend is heading away from your goal')
    : goal.status === 'flat' ? t('Holding steady')
    : t('A few more weigh-ins and a date appears here')
  const weekShare = plannedPerWeek ? doneThisWeek / plannedPerWeek : null
  const baseFood = targetsForDay(S, todayISO())
  const adjFood = adaptiveAdjustment(S, todayISO(), baseFood)
  const food = adjFood ? { ...baseFood, rest: adjFood.rest, training: adjFood.training, day: adjFood.day } : baseFood
  const eaten = dayTotals(S, todayISO())

  // Weekly volume bars & 7-day status from preview
  const weekVolumeData = []
  let totalWeekMinutes = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(wkStart); d.setDate(wkStart.getDate() + i)
    const iso = isoOf(d)
    const dayWorkouts = S.workouts.filter(w => w.d === iso)
    let minutes = 0
    let kgVol = 0
    for (const w of dayWorkouts) {
      if (w.start && w.end && w.end > w.start) {
        minutes += Math.round((w.end - w.start) / 60000)
      } else {
        minutes += 45
      }
      for (const entry of (w.entries || [])) {
        for (const set of (entry.sets || [])) {
          if (set.done && set.w && set.r) kgVol += set.w * set.r
        }
      }
    }
    totalWeekMinutes += minutes
    const isToday = iso === todayISO()
    const isDone = doneDays.has(iso)
    const hasPlan = effectiveRoutineIds(S, iso).length > 0
    weekVolumeData.push({
      dayLetter: DAYS[d.getDay()],
      dateNum: d.getDate(),
      iso,
      minutes,
      kgVol,
      isToday,
      isDone,
      hasPlan,
    })
  }
  const maxMin = Math.max(...weekVolumeData.map(v => v.minutes), 60)
  const calTarget = food?.day?.kcal || 2200
  const calEaten = eaten.kcal || 0
  const calRemaining = Math.max(0, calTarget - calEaten)
  const calPercent = calTarget > 0 ? Math.min(100, Math.round((calEaten / calTarget) * 100)) : 0

  const nowMs = Date.now()
  const fatigueMap = fatigueOf(S.workouts, nowMs)
  const keyMuscles = ['chest', 'upper-back', 'deltoids', 'biceps', 'triceps', 'quadriceps', 'hamstring', 'gluteal', 'abs', 'calves']
  let readyCount = 0
  for (const m of keyMuscles) {
    const fVal = fatigueMap[m] || 0
    if (fatigueStateOf(fVal) === 'ready') readyCount++
  }

  const photos = progressPhotosOf(S)

  return <div className="narrow home">
    {/* 1. Header with kicker & inspiring greeting */}
    <div className="hdr" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
      <div>
        <div className="dash-kicker">
          <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--acc)', display: 'inline-block' }} />
          {today.toLocaleDateString(dateLocale(), { weekday: 'long', month: 'short', day: 'numeric' })}
        </div>
        <h1 style={{ margin: '3px 0 0', fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--label)' }}>
          {user ? t('Keep Moving, {0} ✨', user.name) : t('Keep Moving ✨')}
        </h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="iconbtn" onClick={() => nav('/settings')} aria-label={trouble ? t('Settings') + ', ' + t('Connection problem') : t('Settings')}>
          <Icon name="gear" />{trouble && <span className="tab-dot" aria-hidden="true" />}
        </button>
        <div style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--acc)', color: 'var(--on-acc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, boxShadow: '0 4px 12px rgba(255,111,89,0.25)' }}>
          {user?.name?.[0]?.toUpperCase() || 'R'}
        </div>
      </div>
    </div>

    {/* Two columns on a wide screen (index.css .home-cols): how it is going on the left, the day
        on the right. One column, in this order, everywhere else. */}
    <div className="home-cols">
    <div className="home-col">

    {/* 2. Compact Weekly Activity Summary Card (Top) */}
    <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
      <div className="row between" style={{ alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--label-3)' }}>
          {t('Weekly Target')}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'color-mix(in srgb, var(--blue) 12%, transparent)', color: 'var(--blue)' }}>
          {doneThisWeek} / {plannedPerWeek || 4} {t('days done!')} 🎉
        </span>
      </div>
      <div className="dash-activity-strip">
        {weekVolumeData.map((d, i) => {
          const pillClass = d.isToday ? 'today' : d.isDone ? 'done' : (!d.hasPlan ? 'rest' : 'planned')
          return (
            <button key={i} className="dash-activity-day" onClick={() => dayOverrideSheet(d.iso)} aria-label={t(d.dayLetter)}>
              <span style={{ fontSize: 11, fontWeight: d.isToday ? 700 : 500, color: d.isToday ? 'var(--acc)' : 'var(--label-3)' }}>
                {t(d.dayLetter)}
              </span>
              <div className={'dash-day-pill ' + pillClass}>
                {d.isDone ? '✓' : d.isToday ? '•' : (!d.hasPlan ? t('Rest') : d.dateNum)}
              </div>
            </button>
          )
        })}
      </div>
    </div>

    {/* 3. Calories Burned & Nutrition Ring (Dual-Column Preview layout) */}
    <div className="card calorie-preview-card" onClick={() => nav('/food')} style={{ cursor: 'pointer' }}>
      <div className="cal-preview-left">
        <div className="cal-preview-hdr">
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--label-3)' }}>
            {t('Daily Nutrition')}
          </span>
          <span className="cal-badge">{calPercent}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span className="cal-big-num">{fmtNum(calEaten)}</span>
          <span className="cal-target-num">/ {fmtNum(calTarget)} kcal</span>
        </div>
        <div className="cal-subtext">
          {calRemaining > 0
            ? t('Only {0} kcal to hit your daily deficit target!', fmtNum(calRemaining))
            : t('Daily nutrition target achieved! 🎉')}
        </div>
        <div className="cal-breakdown-row">
          <div className="cal-breakdown-item">
            <span>{t('Protein')}</span>
            <span>{eaten.p ? Math.round(eaten.p) + 'g' : '–'}</span>
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--sep)' }} />
          <div className="cal-breakdown-item">
            <span>{t('Carbs')}</span>
            <span>{eaten.c ? Math.round(eaten.c) + 'g' : '–'}</span>
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--sep)' }} />
          <div className="cal-breakdown-item">
            <span>{t('Fat')}</span>
            <span>{eaten.f ? Math.round(eaten.f) + 'g' : '–'}</span>
          </div>
        </div>
      </div>
      <div style={{ flexShrink: 0, position: 'relative', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Ring value={calTarget > 0 ? calEaten / calTarget : null} color="var(--blue)" label={t('Calories')}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>🔥</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--label)', marginTop: 2 }}>{calPercent}%</span>
          </div>
        </Ring>
      </div>
    </div>

    {/* 4. Workout Streak Counter (Compact Motivational Banner) */}
    <div className="motivational-streak-card" onClick={() => calendarSheet()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#fff' }} className="coral-gradient coral-glow">
          🔥
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--label)' }}>
              {t('{0} week streak', streakWeeks(S))}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'var(--acc)', color: 'var(--on-acc)' }}>
              {streakWeeks(S) >= 4 ? t('Personal Best!') : t('Active')}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--label-2)', marginTop: 2, fontWeight: 500 }}>
            {t('Consistency is your superpower. {0} / {1} this week!', doneThisWeek, plannedPerWeek || 4)}
          </div>
        </div>
      </div>
      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--acc)' }}>→</span>
    </div>

    {/* 5. Existing Three Rings for calendar, weight goal & food quick access */}
    <div className="card dash-rings">
      <button className="dash-ring" onClick={() => calendarSheet()}>
        <Ring value={weekShare} color="var(--acc)" label={t('Workouts this week')}>
          <div className="ring-num">{doneThisWeek}{plannedPerWeek ? <span className="ring-of">/{plannedPerWeek}</span> : null}</div>
        </Ring>
        <span className="dash-ring-l">{t('This week')}</span>
      </button>
      <button className="dash-ring" onClick={() => goal ? weighInsSheet() : goalSheet()}>
        <Ring value={goal ? goal.pct : null} color="var(--blue)" label={t('Progress to goal')}>
          {goal ? <div className="ring-num">{Math.round(goal.pct * 100)}<span className="ring-of">%</span></div>
            : <Icon name="target" style={{ fontSize: 22, color: 'var(--blue)' }} />}
        </Ring>
        <span className="dash-ring-l">{goal ? t('To goal') : t('Set a goal')}</span>
      </button>
      <button className="dash-ring" onClick={() => nav('/food')}>
        <Ring value={food && eaten.count ? eaten.kcal / food.day.kcal : null} color="var(--blue)" label={t('Calories')}>
          <div className={'ring-num' + (food || eaten.count ? ' ring-num-sm' : '')}>{eaten.count ? fmtNum(eaten.kcal) : food ? fmtNum(food.day.kcal) : '–'}</div>
          {(food || eaten.count > 0) && <div className="ring-unit">{eaten.count && food ? '/ ' + fmtNum(food.day.kcal) : 'kcal'}</div>}
        </Ring>
        <span className="dash-ring-l">{eaten.count ? t('Calories eaten') : food ? t('Calorie target') : t('Calories')}</span>
      </button>
    </div>

    {S.showWeightCard !== false && <div className="card dash-goal">
      <div className="row between bw-head" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{t('Body weight')}</h2>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" icon="target" style={S.targetW ? { color: 'var(--blue)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
          <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
        </div>
      </div>
      {bw ? <>
        <div className="goal-line">
          <div className="goal-now">
            <span className="goal-num">{fmtNum(bw.w)}</span><span className="goal-unit">{unit}</span>
            {/* only when it actually moved — an unchanged weight used to read as "− 0" */}
            {!!delta && <span className="small row goal-delta" style={{ color: bwDeltaColor(delta, bw.w) }}>
              <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} style={{ fontSize: 12 }} />{fmtNum(Math.abs(delta))}
            </span>}
          </div>
          {S.targetW != null && <>
            <Icon name="chevronRight" className="goal-arrow" />
            <div className="goal-target"><span className="goal-num">{fmtNum(S.targetW)}</span><span className="goal-unit">{unit}</span></div>
          </>}
        </div>
        {goal ? <div className="goal-meta small">
          <span className="goal-status" data-status={goal.status}>{goalLine}</span>
          {goal.status !== 'reached' && <span className="dim">
            {goal.remaining < 0 ? t('{0} to lose', amount(goal.remaining)) : t('{0} to gain', amount(goal.remaining))}
            {goal.ratePerWeek != null && ' · ' + t('{0} a week', (goal.ratePerWeek > 0 ? '+' : '−') + amount(goal.ratePerWeek))}
          </span>}
        </div> : <div className="dim small">{t('Last weigh-in {0}', fmtDate(bw.d, true))}</div>}
        {/* A target date: the pace it takes, beside the pace the scale shows. */}
        {goal?.by && goal.status !== 'reached' && <div className="goal-meta small">
          <span className={'goal-status' + (goal.ratePerWeek != null && Math.sign(goal.ratePerWeek) === Math.sign(goal.neededPerWeek) && Math.abs(goal.ratePerWeek) >= Math.abs(goal.neededPerWeek) ? ' on-pace' : '')}>
            {t('Target {0}', fmtDate(goal.by))}</span>
          <span className="dim">{t('needs {0} a week', (goal.neededPerWeek > 0 ? '+' : '−') + amount(goal.neededPerWeek))}</span>
        </div>}
        <div className="chart" style={{ marginTop: 8 }}><LineChart points={bwPoints} h={120} unit={unit} goal={S.targetW} color="var(--blue)" /></div>
        {/* every weigh-in, week by week with its average (Discord 'Weight') */}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
          <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={weighInsSheet}>{t('All weigh-ins')}</Button>
        </div>
      </> : <div className="muted small">{S.weighIn === false
        ? t('No weigh-ins yet. Log your weight to start the curve.')
        : t("No weigh-ins yet. Log your weight to start the curve (we also ask before every workout).")}</div>}
    </div>}

    </div>

    <div className="home-col">
    {/* 6. Quick Action / Start Workout CTA Button */}
    <button className="cta-workout-btn" onClick={onToday}>
      <Icon name={S.active ? (editingSaved ? 'pencil' : 'play') : 'play'} style={{ fontSize: 18 }} />
      {S.active ? (editingSaved ? t('Edit In-Progress Workout') : t('Resume {0}', S.active.name))
        : routine ? t("Start Today's {0}", todayName)
        : t("Start a Workout")}
    </button>

    <h2 className="sec-title">{t('Today')}</h2>
    <div className="card">
      {/* A coach week runs by order, not by weekday, so its progress row stands in for the
          seven dots (components/QueueRow.jsx). The today row below stays as it is: the queue's
          next session reaches it through effectiveRoutineIds like any planned routine. */}
      {rotating ? (queue ? <QueueRow S={S} today={todayISO()} onStart={onQueueStart} managed={managedQueue} /> : <div className="empty">
        {t('No rotation yet. Add routines to it in Plan.')}
        <div style={{ marginTop: 10 }}><Button size="sm" variant="tinted" onClick={() => nav('/plan')}>{t('Set up in Plan')}</Button></div>
      </div>) : <>
        <div className="row between" style={{ marginBottom: 8 }}>
          <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setWeekOffset(w => w - 1)} aria-label={t('Previous week')}><Icon name="chevronLeft" /></button>
          <div className="small muted" style={{ fontWeight: 500 }}>{wkLabel}</div>
          <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setWeekOffset(w => w + 1)} aria-label={t('Next week')}><Icon name="chevronRight" /></button>
        </div>
        <div className="week">{strip}</div>
      </>}
      {/* Once today's session is logged the row stops asking for it. The week strip already
          knew (its dot goes 'done'); this row did not, so a finished day kept showing the
          routine name behind a green Start tag and read as still outstanding (issue #4).
          An in-progress session still wins — that one is happening right now. Tapping the
          row keeps working, so a second session in one day is a tap away, just not urged. */}
      <div className="today-row" {...tappable(onToday)}>
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
          <span className="lrow-i" style={{ background: S.active ? 'var(--orange)' : doneToday ? 'var(--surface-3)' : routine ? 'var(--acc)' : 'var(--surface-3)' }}>
            <Icon name={S.active ? (editingSaved ? 'pencil' : 'play') : doneToday ? 'checkCircle' : routine ? glyphOf(routine.emoji) : 'moon'}
              style={doneToday && !S.active ? { color: 'var(--green)' } : undefined} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="lbl2">{t('Workout')}</div>
            <div className="ttl">{S.active ? (editingSaved ? S.active.name : t('{0} (in progress)', S.active.name))
              : doneToday ? (doneToday.name ? t('{0} (done)', doneToday.name) : t('Workout done'))
              : routine ? todayName : t('Rest day')}{todayOvr && routine && !doneToday ? ' · ' + t('rescheduled') : ''}</div>
            {next && !doneToday && <div className="ss">{t('Next session: {0}, {1}', t(DAYN[next.weekday]), next.routine.name)}</div>}
          </div>
        </div>
        {S.active ? <span className="tag" style={{ color: 'var(--orange)', background: 'color-mix(in srgb,var(--orange) 16%,transparent)' }}>{editingSaved ? t('Edit') : t('Resume')}</span>
          : doneToday ? <span className="tag" style={{ color: 'var(--green)', background: 'color-mix(in srgb,var(--green) 16%,transparent)' }}>{t('Done')}</span>
          : routine ? <span className="tag acc">{t('Start')}</span>
          : <Icon name="plus" className="chev" />}
      </div>
      {/* The day's meals, from the meal planner once it exists; until then a way to Food. */}
      <div className="meals-row" {...tappable(() => nav('/food'))}>
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
          <span className="lrow-i" style={{ background: 'color-mix(in srgb,var(--orange) 22%,transparent)', color: 'var(--orange)' }}><Icon name="utensils" /></span>
          <div style={{ minWidth: 0 }}>
            <div className="lbl2">{t('Meals')}</div>
            <div className="ttl">{t('No meal plan yet')}</div>
          </div>
        </div>
        <Icon name="chevronRight" className="chev" />
      </div>
      {/* The row above starts today's plan in one tap, and so does the Start button in the tab
          bar — which is the whole problem when you want something else. Both jump straight into
          the planned session whenever there is one, so the Start screen (a freestyle session,
          and your other routines) is only reachable on a day with nothing planned. The one other
          way in, "Choose a different workout" on the weigh-in sheet, does not exist when the
          weigh-in is switched off. This is that door, and it starts nothing on its own. */}
      {!S.active && <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
        <Button size="sm" variant="ghost" className="dim" icon="swap" onClick={() => nav('/workout')}>
          {t('Choose a different workout')}
        </Button>
      </div>}
    </div>

    {/* Muscle Recovery Mini-Map */}
    <div className="card muscle-recovery-card">
      <div className="row between" style={{ alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--label-3)' }}>
            {t('Muscle Recovery')}
          </span>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--label)', marginTop: 2 }}>
            {t('{0} of {1} muscles ready', readyCount, keyMuscles.length)}
          </div>
        </div>
        <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/stats')}>
          {t('Details')}
        </Button>
      </div>
      <div className="muscle-recovery-pills">
        {keyMuscles.map(slug => {
          const state = fatigueStateOf(fatigueMap[slug] || 0)
          return (
            <button
              key={slug}
              type="button"
              className={'muscle-pill ' + state}
              onClick={() => nav('/stats')}
              title={t(MUSCLE_NAME[slug])}
            >
              <span style={{ fontSize: 8 }}>●</span>
              <span>{t(MUSCLE_NAME[slug])}</span>
            </button>
          )
        })}
      </div>
    </div>

    {/* Progress Photos Quick Card */}
    <div className="card tappable" style={{ padding: '12px 16px', marginBottom: 14, cursor: 'pointer' }} onClick={() => nav('/progress-photos')}>
      <div className="row between" style={{ alignItems: 'center' }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="lrow-i" style={{ background: 'color-mix(in srgb, var(--acc) 18%, transparent)', color: 'var(--acc)' }}>
            <Icon name="image" />
          </span>
          <div>
            <div className="ttl" style={{ fontSize: 15, fontWeight: 700 }}>{t('Progress Photos')}</div>
            <div className="muted small">
              {photos.length ? tn('{0} photo logged', '{0} photos logged', photos.length) + ' · ' + t('Compare side-by-side') : t('Capture photos to track visual changes over time')}
            </div>
          </div>
        </div>
        <Icon name="chevronRight" className="chev" />
      </div>
    </div>

    {/* 7. Weekly Workout Bar Chart (Bottom Section) */}
    <div className="card weekly-volume-card">
      <div className="row between" style={{ alignItems: 'center', marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--label-3)' }}>
            {t('Weekly Training Volume')}
          </span>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--label)', marginTop: 1 }}>
            {totalWeekMinutes > 0 ? t('{0} min total', totalWeekMinutes) : t('Active Week')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--label-2)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)' }} />
          {t('Active Minutes')}
        </div>
      </div>

      <div className="bar-chart-container">
        {weekVolumeData.map((d, i) => {
          const pct = Math.max(d.isDone ? 20 : 6, Math.min(100, Math.round((d.minutes / (maxMin || 60)) * 100)))
          return (
            <div key={i} className="bar-chart-col" onClick={() => dayOverrideSheet(d.iso)}>
              <span className="bar-val-label">{d.minutes > 0 ? `${d.minutes}m` : (d.isDone ? '✓' : '0m')}</span>
              <div
                className={'bar-fill' + (d.isToday ? ' today-bar' : !d.isDone && !d.hasPlan ? ' rest' : '')}
                style={{ height: `${pct}%` }}
              >
                {d.isToday && <div className="bar-today-dot" />}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center', paddingTop: 8, fontSize: 11, fontWeight: 600, color: 'var(--label-3)' }}>
        {weekVolumeData.map((d, i) => (
          <span key={i} style={{ flex: 1, color: d.isToday ? 'var(--acc)' : undefined, fontWeight: d.isToday ? 800 : undefined }}>
            {t(d.dayLetter)}
          </span>
        ))}
      </div>
    </div>

    {!S.routines.length && !S.active && (
      <div className="card">
        <div className="row" style={{ gap: 10, marginBottom: 6 }}>
          <span className="lrow-i"><Icon name="calendar" /></span>
          <div className="big" style={{ fontSize: 22 }}>{t('Welcome!')}</div>
        </div>
        <div className="muted small" style={{ marginBottom: 12 }}>{t('Set up your weekly routine to get going, or grab a ready-made starter plan.')}</div>
        <Button variant="primary" icon="clipboard" onClick={starterPlanSheet}>{t('Load starter plan')}</Button>
        <div style={{ height: 8 }} /><Button onClick={() => nav('/plan')}>{t('Build my own plan')}</Button>
      </div>
    )}

    <div className="dash-pair">
      <div className="card tappable" style={{ cursor: 'pointer' }} {...tappable(() => calendarSheet())}>
        <div className="row" style={{ gap: 7, fontSize: 22, fontWeight: 600, letterSpacing: '-.021em' }}>
          <Icon name="flame" style={{ color: 'var(--orange)' }} />
          {t('{0} week streak', streakWeeks(S))}
        </div>
        <div className="muted small" style={{ marginTop: 2 }}>{doneThisWeek}{plannedPerWeek ? ' / ' + plannedPerWeek : ''} {t('this week')} · {tn('{0} workout total', '{0} workouts total', S.workouts.length)}</div>
      </div>
      {/* Jump to the gym check-in cards (QR membership codes). Shown here as a quick tap on
          arrival at the gym; folds away per user via the "Gym check-in" switch in Settings. */}
      {S.checkIn !== false && (
        <div className="card tappable" style={{ cursor: 'pointer' }} {...tappable(() => nav('/checkin'))}>
          <div className="row" style={{ gap: 9 }}>
            <span className="lrow-i" style={{ background: 'var(--blue)' }}><Icon name="qr" /></span>
            <div>
              <div className="lbl2">{t('At the gym')}</div>
              <div className="ttl">{t('Check in')}</div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
    </div>
  </div>
}
