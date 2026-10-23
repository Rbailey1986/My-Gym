/* The first details load and a language switch can overlap: setLang reloads the descriptions
   only once a load has finished, so one that started under Italian and finished under English
   used to put Italian descriptions under English. They are kept only for the language they were
   loaded for; the loader then loads the current language's own. */
import { describe, expect, it } from 'vitest'
import * as core from './i18n-core.js'

const ex = { id: '9999', st: [] }

describe('a language switch while the details load', () => {
  it('keeps the descriptions of one language from landing under another', () => {
    core._setLangState('it', {}, null, null, true, false)
    expect(core._setDetails({ 9999: ['Lift.'] }, { 9999: 'A lift.' }, { 9999: 'Un sollevamento.' }, 'it')).toBe(true)
    expect(core.descFor(ex)).toBe('Un sollevamento.')
    core._setLangState('en', {}, null, null, true, false)
    // Italian descriptions that finished loading after the switch to English
    expect(core._setDetails({ 9999: ['Lift.'] }, { 9999: 'A lift.' }, { 9999: 'Un sollevamento.' }, 'it')).toBe(false)
    expect(core.descFor(ex)).not.toBe('Un sollevamento.')
    expect(core.instrFor(ex)).toEqual(['Lift.'])   // the English steps are every language's
    expect(core._setDetails(null, { 9999: 'A lift.' }, null, 'en')).toBe(true)
    expect(core.descFor(ex)).toBe('A lift.')
  })
})
