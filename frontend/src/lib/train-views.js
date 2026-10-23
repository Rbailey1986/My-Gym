import { t } from './i18n.js'

// The three views of the Train tab: two of Plan's own, and the exercise Library. Plan and Library
// both show this control, so moving between them reads as one place (views/Plan.jsx, Library.jsx).
export const PLAN_VIEW_KEY = 'gym_plan_view'
export const TRAIN_VIEWS = () => [
  { value: 'schedule', label: t('Schedule') },
  { value: 'routines', label: t('Routines') },
  { value: 'exercises', label: t('Exercises') },
]
