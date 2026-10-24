// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Food from './Food.jsx'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null }
  state.snapshot = () => ({ S: state.S, user: null, update: mut => { const next = structuredClone(state.S); mut(next); state.S = next } })
  return state
})
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore }
})
vi.mock('../sheets.jsx', () => ({ goalSheet: vi.fn() }))
vi.mock('../lib/coach-api.js', () => ({ requestMealRecipes: vi.fn(async () => ({ ok: false, recipes: [] })) }))

const mounted = []
function render(el) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(el))
  return host
}

beforeEach(() => {
  mocks.S = {
    unit: 'kg',
    lang: 'en',
    bodyweight: [{ d: '2026-10-24', w: 80 }],
    routines: [],
    workouts: [],
    week: {},
    dayPlan: {},
    nutrition: { sex: 'male', birthYear: 1986, heightCm: 178, activity: 'light' },
    foodPrefs: null,
    foodLog: {},
    favFoods: [],
    mealPlan: null,
    targetW: null,
    targetDate: null,
  }
  useUI.setState({ sheets: [] })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('Food table search, meal logging, planned meals, and favourites/recents', () => {
  it('searches foods on screen, calculates macros across units including pieces, and logs to a meal', () => {
    const host = render(<Food />)
    const input = host.querySelector('.search input')
    expect(input).not.toBeNull()

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      setter.call(input, 'uova')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const items = [...host.querySelectorAll('.list .item')]
    const eggRow = items.find(el => el.textContent.includes('Uova di gallina, intero'))
    expect(eggRow).toBeDefined()

    act(() => { eggRow.click() })
    const sheetFn = useUI.getState().sheets[0]?.render
    expect(typeof sheetFn).toBe('function')

    const sheetHost = render(sheetFn(() => {}))
    expect(sheetHost.textContent).toContain('64 kcal')

    const pcsBtn = [...sheetHost.querySelectorAll('button')].find(b => b.textContent === 'pieces')
    act(() => { pcsBtn.click() })
    expect(sheetHost.textContent).toContain('1 piece ≈ 50 g')

    const favBtn = sheetHost.querySelector('button[aria-label="Add to favourites"]')
    act(() => { favBtn.click() })
    expect(mocks.S.favFoods).toContain('it-181100')

    const logBtn = [...sheetHost.querySelectorAll('button')].find(b => b.textContent.includes('Log food'))
    act(() => { logBtn.click() })
    expect(mocks.S.foodLog[todayISO()]?.breakfast).toHaveLength(1)
  })

  it('logs a planned meal in one tap from the Food tab', () => {
    const today = todayISO()
    mocks.S.mealPlan = {
      [today]: {
        lunch: {
          title: 'Pollo e riso',
          items: [
            { name: 'petto di pollo', amount: 150, unit: 'g' },
            { name: 'riso basmati', amount: 80, unit: 'g' },
          ],
        },
      },
    }
    const host = render(<Food />)
    expect(host.textContent).toContain('Planned: Pollo e riso')

    const ateBtn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Ate this'))
    expect(ateBtn).toBeDefined()
    act(() => { ateBtn.click() })

    expect(mocks.S.foodLog[today]?.lunch).toHaveLength(2)
  })

  it('generates a weekly meal plan, opens recipes with partner portions, and swaps a meal', async () => {
    const today = todayISO()
    mocks.S.foodPrefs = {
      diet: 'any',
      allergies: '',
      dislikes: '',
      likes: 'chicken',
      cookMin: 30,
      budget: 'mid',
      meals: 3,
      partner: { enabled: true, name: 'Elena', kcal: 1650 },
    }
    const host = render(<Food />)
    const planBtn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Plan my week'))
    expect(planBtn).toBeDefined()
    await act(async () => { planBtn.click() })

    expect(mocks.S.mealPlan?.days?.[today]).toBeDefined()
    const firstLunchTitle = mocks.S.mealPlan.days[today].lunch.title

    // Re-render with updated mealPlan
    const host2 = render(<Food />)
    expect(host2.textContent).toContain(firstLunchTitle)
    expect(host2.textContent).toContain('Elena')

    // Open recipe sheet by clicking the lunch row in the meal planner
    const lunchRow = [...host2.querySelectorAll('.list .item')].find(el => el.textContent.includes(`Lunch: ${firstLunchTitle}`))
    expect(lunchRow).toBeDefined()
    act(() => { lunchRow.click() })

    const recipeRender = useUI.getState().sheets.at(-1)?.render
    expect(typeof recipeRender).toBe('function')
    const recipeHost = render(recipeRender(() => {}))
    expect(recipeHost.textContent).toContain('Ingredients')
    expect(recipeHost.textContent).toContain('Steps')
    expect(recipeHost.textContent).toContain('Cook total:')

    // Swap the meal
    const swapBtn = [...recipeHost.querySelectorAll('button')].find(b => b.textContent.includes('Swap meal'))
    expect(swapBtn).toBeDefined()
    act(() => { swapBtn.click() })
    expect(mocks.S.mealPlan.days[today].lunch.title).not.toBe(firstLunchTitle)
  })
})
