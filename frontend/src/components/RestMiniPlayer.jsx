import { useLocation, useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

const fmtRest = sec => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')

export default function RestMiniPlayer() {
  const loc = useLocation()
  const nav = useNavigate()
  const timer = useUI(s => s.timer)
  const S = useStore(s => s.S)
  const isWorkout = loc.pathname.startsWith('/workout')

  if (!timer || isWorkout || timer.left <= 0) return null

  const active = S?.active
  const entry = timer.forIdx != null && active?.entries?.[timer.forIdx]
  const exerciseName = entry?.name || (timer.kind === 'switch' ? t('Switch sides') : t('Rest'))
  const progress = timer.total > 0 ? Math.min(1, timer.left / timer.total) : 0
  const strokeDash = 2 * Math.PI * 14
  const strokeOffset = strokeDash * (1 - progress)

  const onAdd = e => {
    e.stopPropagation()
    useUI.getState().addRest(30)
  }

  const onSkip = e => {
    e.stopPropagation()
    useUI.getState().stopRest()
  }

  const onTogglePause = e => {
    e.stopPropagation()
    if (timer.paused) useUI.getState().resumeRest()
    else useUI.getState().pauseRest()
  }

  return (
    <div
      className="rest-mini-player"
      onClick={() => nav('/workout')}
      role="status"
      aria-live="polite"
      aria-label={t('Rest timer active')}
    >
      <div className="rest-mini-left">
        <div className="rest-mini-ring">
          <svg width="34" height="34" viewBox="0 0 34 34">
            <circle cx="17" cy="17" r="14" fill="none" stroke="var(--sep)" strokeWidth="3" opacity="0.3" />
            <circle
              cx="17"
              cy="17"
              r="14"
              fill="none"
              stroke="var(--blue)"
              strokeWidth="3"
              strokeDasharray={strokeDash}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
              transform="rotate(-90 17 17)"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <span className="rest-mini-time">{fmtRest(timer.left)}</span>
        </div>
        <div className="rest-mini-meta">
          <span className="rest-mini-kicker">{timer.paused ? t('Rest paused') : t('Resting')}</span>
          <span className="rest-mini-title">{exerciseName}</span>
        </div>
      </div>

      <div className="rest-mini-actions">
        <button
          type="button"
          className="rest-mini-btn"
          onClick={onTogglePause}
          aria-label={timer.paused ? t('Resume') : t('Pause')}
        >
          <Icon name={timer.paused ? 'play' : 'pause'} />
        </button>
        <button
          type="button"
          className="rest-mini-btn"
          onClick={onAdd}
          aria-label="+30s"
        >
          +30s
        </button>
        <button
          type="button"
          className="rest-mini-btn skip"
          onClick={onSkip}
          aria-label={t('Skip')}
        >
          <Icon name="forward" />
        </button>
      </div>
    </div>
  )
}
