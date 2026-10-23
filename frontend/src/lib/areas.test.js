import { describe, expect, it } from 'vitest'
import { areaOf } from './areas.js'

describe('areaOf', () => {
  it('puts every screen in its tab', () => {
    expect(areaOf('/home')).toBe('home')
    expect(areaOf('/settings/account')).toBe('home')
    expect(areaOf('/plan/r/abc')).toBe('train')
    expect(areaOf('/library')).toBe('train')
    expect(areaOf('/food')).toBe('food')
    expect(areaOf('/history')).toBe('progress')
    expect(areaOf('/measurements')).toBe('progress')
  })

  it('falls back to Today for the root and anything unknown', () => {
    expect(areaOf('/')).toBe('home')
    expect(areaOf('')).toBe('home')
    expect(areaOf('/nowhere')).toBe('home')
  })
})
