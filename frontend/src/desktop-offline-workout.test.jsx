// @vitest-environment happy-dom
import { act } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { beginWorkout, finishWorkout } from './sheets.jsx'
import { allExercises, EXDB } from './lib/exercises.js'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'

const clone = v => JSON.parse(JSON.stringify(v))
const ids = EXDB.filter(e => e.bp !== 'cardio').slice(0, 3).map(e => e.id)

describe('Desktop offline workout smoke test', () => {
  beforeEach(() => {
    localStorage.clear()
    useUI.setState({ sheets: [] })

    // Simulate completely offline environment
    vi.stubGlobal('navigator', { onLine: false })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Offline: Network unavailable')))

    const S = clone(DEF)
    S.routines = [
      {
        id: 'offline-routine-1',
        name: 'Offline Push Day',
        emoji: '💪',
        ex: [
          { id: ids[0], sets: 2, reps: 10, rest: 90 },
        ],
      },
    ]
    S.active = null
    S.workouts = []
    S.weighIn = false
    useStore.setState({ S, user: null })
  })

  it('starts a workout offline from a routine with all exercises intact', () => {
    expect(useStore.getState().S.active).toBeNull()

    // Start workout with routine
    act(() => beginWorkout(['offline-routine-1'], null))

    const active = useStore.getState().S.active
    expect(active).not.toBeNull()
    expect(active.name).toBe('Offline Push Day')
    expect(active.entries.length).toBe(1)
    expect(active.entries[0].id).toBe(ids[0])
    expect(active.entries[0].sets.length).toBe(2)

    // Complete all sets offline
    const nextS = clone(useStore.getState().S)
    nextS.active.entries[0].sets.forEach(s => {
      s.done = true
      s.w = 80
      s.r = 10
    })
    useStore.setState({ S: nextS })

    // Finish workout offline
    act(() => finishWorkout())

    const afterFinish = useStore.getState().S
    expect(afterFinish.active).toBeNull()
    expect(afterFinish.workouts.length).toBe(1)
    expect(afterFinish.workouts[0].name).toBe('Offline Push Day')
    expect(afterFinish.workouts[0].entries[0].sets[0].done).toBe(true)
    expect(afterFinish.workouts[0].entries[0].sets[0].w).toBe(80)
  })

  it('starts a freestyle workout offline and logs exercises without internet', () => {
    expect(useStore.getState().S.active).toBeNull()

    // Freestyle start
    act(() => beginWorkout([], null))

    expect(useStore.getState().S.active).not.toBeNull()
    expect(useStore.getState().S.active.entries.length).toBe(0)

    // Add an exercise offline
    const exercises = allExercises(useStore.getState().S)
    expect(exercises.length).toBeGreaterThan(0)

    const nextS = clone(useStore.getState().S)
    nextS.active.entries.push({
      id: ids[0],
      sets: [{ w: 60, r: 12, done: true }],
    })
    useStore.setState({ S: nextS })

    expect(useStore.getState().S.active.entries.length).toBe(1)

    act(() => finishWorkout())
    expect(useStore.getState().S.active).toBeNull()
    expect(useStore.getState().S.workouts.length).toBe(1)
  })
})
