// @vitest-environment happy-dom
// The sign-in question about entries logged while signed out: a count of one reads in the
// singular ("1 workout and 1 weigh-in"), per noun, in English and in the packs.
import { afterEach, describe, expect, it } from 'vitest'
import { _setLangState } from './lib/i18n-core.js'
import { addDeviceDataMessage, addDeviceSetupMessage } from './sheets.jsx'
import itPack from './locales/it.js'

afterEach(() => _setLangState('en', null, null, null))

describe('addDeviceDataMessage', () => {
  it('says "1 workout and 1 weigh-in", not "1 workouts and 1 weigh-ins"', () => {
    _setLangState('en', null, null, null)
    expect(addDeviceDataMessage(1, 1)).toMatch(/^1 workout and 1 weigh-in were logged/)
    expect(addDeviceDataMessage(1, 3)).toMatch(/^1 workout and 3 weigh-ins were logged/)
    expect(addDeviceDataMessage(4, 1)).toMatch(/^4 workouts and 1 weigh-in were logged/)
    expect(addDeviceDataMessage(2, 5)).toMatch(/^2 workouts and 5 weigh-ins were logged/)
    expect(addDeviceDataMessage(0, 2)).toMatch(/^0 workouts and 2 weigh-ins were logged/)
  })

  it('uses the singular sentences of the language packs', () => {
    _setLangState('it', itPack, null, null)
    expect(addDeviceDataMessage(1, 1)).toMatch(/^1 allenamento e 1 pesata sono stati/)
    expect(addDeviceDataMessage(1, 2)).toMatch(/^1 allenamento e 2 pesate/)
    expect(addDeviceDataMessage(3, 1)).toMatch(/^3 allenamenti e 1 pesata/)
  })

  it('a plan made while signed out has words of its own', () => {
    _setLangState('en', null, null, null)
    expect(addDeviceSetupMessage(1)).toMatch(/^1 routine was made on this device/)
    expect(addDeviceSetupMessage(3)).toMatch(/^3 routines were made on this device/)
    expect(addDeviceSetupMessage(0)).toMatch(/^Your plan, notes or gym cards/)
    _setLangState('it', itPack, null, null)
    expect(addDeviceSetupMessage(2)).toMatch(/^2 routine sono state create/)
  })
})
