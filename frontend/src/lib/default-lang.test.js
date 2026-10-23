// #303: an instance-wide default language, and the browser's, apply only to a copy nobody has
// picked a language for — never to an existing profile, whose `lang: 'en'` may be a choice.
import { describe, expect, it } from 'vitest'
import { matchLocale, autoLang } from './default-lang.js'

describe('matchLocale', () => {
  it('matches the full tag first, in any case or separator', () => {
    expect(matchLocale('it')).toBe('it')
    expect(matchLocale(' IT ')).toBe('it')
    expect(matchLocale('en')).toBe('en')
  })
  it('falls back to the base language, and to nothing for one the app does not have', () => {
    expect(matchLocale('it-CH')).toBe('it')
    expect(matchLocale('it_it')).toBe('it')
    expect(matchLocale('en-US')).toBe('en')
    expect(matchLocale('de-DE')).toBe(null)
    expect(matchLocale('pt-BR')).toBe(null)
    expect(matchLocale('')).toBe(null)
    expect(matchLocale(undefined)).toBe(null)
  })
})

describe('autoLang', () => {
  const fresh = { lang: 'en', langAuto: true }
  it('leaves a copy alone that chose, or that predates the mark', () => {
    expect(autoLang({ lang: 'en' }, { default_lang: 'it' }, ['it-IT'])).toBe(null)
    expect(autoLang({ lang: 'en', langAuto: false }, { default_lang: 'it' }, ['it-IT'])).toBe(null)
  })
  it('puts DEFAULT_LANG before the browser, the browser before English', () => {
    expect(autoLang(fresh, { default_lang: 'it' }, ['en-GB'])).toBe('it')
    expect(autoLang(fresh, {}, ['nl-NL', 'it-IT'])).toBe('it')
    expect(autoLang(fresh, {}, ['nl-NL'])).toBe('en')
    expect(autoLang(fresh, { default_lang: 'xx' }, ['it-CH'])).toBe('it')
    // A removed language falls through to the next one on offer.
    expect(autoLang(fresh, { default_lang: 'pt-BR' }, ['de-DE'])).toBe('en')
  })
})
