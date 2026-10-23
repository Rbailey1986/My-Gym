import { describe, it, expect } from 'vitest'
import {
  LANGS, INSTR_LANGS, EXERCISE_NAME_LANGS, DATE_LOCALES, DERIVED_LOCALES,
  baseLang, derivePack, dateLocale, getLang, t, _setLangState, exerciseNameClass, exerciseNameFor, CASED_NAME_LANGS
} from './i18n-core.js'
import { EXDB } from './exercises-data.js'

// English and Italian only since 2026-10-24: no locale is derived from another any more, so the
// derivation helpers are the identity. They stay for a derived locale that might come back.
describe('baseLang and derivePack with no derived locales', () => {
  it('maps every language to itself', () => {
    expect(Object.keys(DERIVED_LOCALES)).toEqual([])
    for (const l of Object.keys(LANGS)) expect(baseLang(l)).toBe(l)
    expect(baseLang('nonsense')).toBe('nonsense')
  })

  it('returns a pack untouched, and passes a null one through', () => {
    const pack = { a: 'Glutei' }
    expect(derivePack('it', pack)).toBe(pack)
    expect(derivePack('en', pack)).toBe(pack)
    expect(derivePack('it', null)).toBe(null)
  })
})

describe('the languages on offer', () => {
  it('are English and Italian, each with its date locale', () => {
    expect(Object.keys(LANGS).sort()).toEqual(['en', 'it'])
    for (const l of Object.keys(LANGS)) expect(DATE_LOCALES[l], l).toBeTruthy()
  })

  it('formats dates and numbers the Italian way in Italian', () => {
    _setLangState('it', {}, null, null)
    expect(getLang()).toBe('it')
    expect(dateLocale()).toBe('it-IT')
    expect(new Intl.NumberFormat(dateLocale()).format(1234.5)).toBe('1234,5')
    _setLangState('en', {}, null, null)
  })

  it('has Italian instructions and exercise names', () => {
    expect(INSTR_LANGS).toContain('it')
    expect(EXERCISE_NAME_LANGS).toEqual(['it'])
  })
})

// EXDB stores English names lower-case and the UI title-cases them with CSS. The Italian pack is
// stored lower-case the same way, so a translated name keeps the casing class too; only a pack in
// CASED_NAME_LANGS (none now) would drop it.
describe('exerciseNameClass', () => {
  const bench = { id: '0025', n: 'barbell bench press' }
  const custom = { id: 'custom-1', n: 'my own press' }

  it('title-cases English and lower-case Italian names alike', () => {
    _setLangState('en', {}, null, null)
    expect(exerciseNameClass(bench)).toBe('capitalize')
    _setLangState('it', {}, null, { '0025': 'panca piana con bilanciere' })
    expect(exerciseNameClass(bench)).toBe('capitalize')
    expect(exerciseNameClass(custom)).toBe('capitalize')
    expect(exerciseNameClass(undefined)).toBe('capitalize')
    _setLangState('en', {}, null, null)
  })
})

// #290 took the title-casing off every translated name so German would keep its own, and the
// packs stored lower-case (pt-BR, hu, es, ru, it, fr) went lower-case everywhere with it. Which
// packs carry real casing is a list, so it is checked against what the packs actually hold: a
// new pack that is lower-case gets the casing without anyone remembering to add it, and one with
// real casing fails here until it is listed.
describe('title-casing per exercise-name pack', () => {
  const packs = import.meta.glob('../exercise-names/*.js', { eager: true, import: 'default' })
  const packFor = lang => packs[`../exercise-names/${lang}.js`]
  // Share of names that start with a lower-case letter. A lower-case pack still has a few that
  // start upper-case for a reason of their own (EZ-rudas, L-sit, SkiErg), German has none.
  // Share of names that do not start with a capital. A script without case (Arabic, Devanagari,
  // Thai, Han...) has nothing to title-case, so such a name counts as lower-case: the capitalize
  // class stays on and does nothing to it.
  const lowerShare = names => {
    const firsts = Object.values(names).map(n => [...n][0]).filter(Boolean)
    return firsts.filter(c => c === c.toLocaleLowerCase()).length / firsts.length
  }

  it('lists exactly the packs written in their own casing', () => {
    for (const lang of EXERCISE_NAME_LANGS) {
      expect(CASED_NAME_LANGS.includes(lang), `${lang}: ${Math.round(lowerShare(packFor(lang)) * 100)}% lower-case`)
        .toBe(lowerShare(packFor(lang)) < 0.5)
    }
    for (const lang of CASED_NAME_LANGS) expect(EXERCISE_NAME_LANGS, lang).toContain(lang)
  })

  for (const lang of EXERCISE_NAME_LANGS) {
    const cased = CASED_NAME_LANGS.includes(baseLang(lang))
    it(`${lang}: a translated name is ${cased ? 'left in its own casing' : 'title-cased like English'}`, () => {
      const names = packFor(baseLang(lang))
      const translated = EXDB.filter(e => names[e.id])
      _setLangState(lang, {}, null, names)
      for (const ex of translated) expect(exerciseNameClass(ex), `${lang} ${ex.id}`).toBe(cased ? '' : 'capitalize')
      // An exercise the pack does not cover shows the lower-case English title either way.
      const untranslated = EXDB.find(e => !names[e.id])
      if (untranslated) expect(exerciseNameClass(untranslated)).toBe('capitalize')
      _setLangState('en', {}, null, null)
    })
  }
})

// The two per-language switches in Settings (the English name in parentheses, English names
// only) have to hold for every pack the app ships.
describe('English-name switches with every exercise-name pack', () => {
  const packs = import.meta.glob('../exercise-names/*.js', { eager: true, import: 'default' })
  const packFor = lang => packs[`../exercise-names/${lang}.js`]

  it('ships a pack for every language listed as having one', () => {
    for (const lang of EXERCISE_NAME_LANGS) expect(packFor(lang), lang).toBeTruthy()
  })

  for (const lang of EXERCISE_NAME_LANGS) {
    it(`${lang}: parentheses off shows the translation alone, English only shows the English title`, () => {
      const names = packFor(lang)
      const ex = EXDB.find(e => names[e.id] && names[e.id].toLocaleLowerCase(lang) !== e.n.toLocaleLowerCase('en'))
      expect(ex, lang).toBeTruthy()
      _setLangState(lang, {}, null, names)
      // German keeps its own casing; a lower-case pack is title-cased like English.
      const translatedClass = CASED_NAME_LANGS.includes(lang) ? '' : 'capitalize'
      expect(exerciseNameFor(ex)).toBe(`${names[ex.id]} (${ex.n})`)
      expect(exerciseNameClass(ex)).toBe(translatedClass)
      _setLangState(lang, {}, null, names, false)
      expect(exerciseNameFor(ex)).toBe(names[ex.id])
      expect(exerciseNameClass(ex)).toBe(translatedClass)
      _setLangState(lang, {}, null, names, true, true)
      expect(exerciseNameFor(ex)).toBe(ex.n)
      // The English title is stored lower-case, so it gets the title-casing back with it.
      expect(exerciseNameClass(ex)).toBe('capitalize')
      _setLangState('en', {}, null, null)
    })
  }

  it('it: a custom exercise, which no pack covers, is unaffected by either switch', () => {
    const names = packFor('it')
    const ex = { id: 'custom-1', n: 'my own press' }
    for (const [showEn, enOnly] of [[true, false], [false, false], [true, true]]) {
      _setLangState('it', {}, null, names, showEn, enOnly)
      expect(exerciseNameFor(ex)).toBe(ex.n)
      expect(exerciseNameClass(ex)).toBe('capitalize')
    }
    _setLangState('en', {}, null, null)
  })

})
