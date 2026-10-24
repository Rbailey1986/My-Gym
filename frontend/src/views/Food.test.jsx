// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Food from './Food.jsx'
import { useUI } from '../store/useUI.js'

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
  mocks.S = { unit: 'kg', lang: 'en', bodyweight: [{ d: '2026-10-24', w: 80 }], routines: [], workouts: [], week: {}, dayPlan: {}, nutrition: null, foodPrefs: null, targetW: null, targetDate: null }
  useUI.setState({ sheets: [] })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('Food table search and portion sheet', () => {
  it('searches foods on screen and calculates macros across units including pieces', () => {
    const host = render(<Food />)
    const input = host.querySelector('.search input')
    expect(input).not.toBeNull()

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    act(() => {
      setter.call(input, 'uova')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const items = [...host.querySelectorAll('.list .item:not(.disabled)')]
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].textContent).toContain('Uova di gallina, intero')

    act(() => { items[0].click() })
    const sheetFn = useUI.getState().sheets[0]?.render
    expect(typeof sheetFn).toBe('function')

    const sheetHost = render(sheetFn(() => {}))
    expect(sheetHost.textContent).toContain('64 kcal')

    const cupBtn = [...sheetHost.querySelectorAll('button')].find(b => b.textContent === 'cup')
    act(() => { cupBtn.click() })
    expect(sheetHost.textContent).toContain('240 g')

    const pcsBtn = [...sheetHost.querySelectorAll('button')].find(b => b.textContent === 'pieces')
    act(() => { pcsBtn.click() })
    expect(sheetHost.textContent).toContain('1 piece ≈ 50 g')
    expect(sheetHost.textContent).toContain('64 kcal')
  })
})
