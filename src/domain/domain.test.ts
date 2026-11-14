import { dayKey, dayStats, intakeValue, per100, fmt, lastDays } from './calc'
import { checkIngredient, checkRecipe, recipeNutrient } from './recipe'
import { applies, evaluate, DEMO_RULES as RULES, RULES as REAL, syncNotifications, dayScope, Rule } from './rules'
import { waterReference, sessionNeed } from './hydration'
import { Drink, Ingredient, Intake, isKnown, Recipe, State } from './types'

const soda: Drink = {
  id: 'soda', kind: 'commerce', name: 'Soda', category: 'soda', traits: ['gazeuse'], basis: { kind: '100ml' },
  values: { sucres: { v: 10.6, src: 'etiquette' }, energie_kcal: { v: 42, src: 'etiquette' }, cafeine: { missing: 'non_indique' } },
}
const portion: Drink = {
  id: 'p', kind: 'commerce', name: 'Boisson portion', category: 'energisante', traits: [], basis: { kind: 'portion', portionMl: 250 },
  values: { cafeine: { v: 80, src: 'etiquette' }, sucres: { missing: 'inconnu' } },
}
const eau: Drink = {
  id: 'eau', kind: 'generique', name: 'Eau plate', category: 'eau_plate', traits: [], basis: { kind: '100ml' },
  values: { sucres: { missing: 'non_applicable' }, cafeine: { missing: 'non_applicable' }, energie_kcal: { missing: 'non_applicable' } },
}
const the: Drink = { id: 'the', kind: 'the', name: 'Thé maison', category: 'the', traits: ['maison'], basis: { kind: '100ml' }, values: {} }

const it_ = (id: string, drinkId: string, ml: number, at: string, extra: Partial<Intake> = {}): Intake => ({ id, drinkId, ml, at, additions: [], ...extra })

const state = (intakes: Intake[], profile: State['profile'] = { notifications: true, ageRange: '18_64' }): State => ({
  version: 1, onboarded: true, drinks: [soda, portion, eau, the], containers: [], intakes, profile, notified: [],
})

const v = (x: ReturnType<typeof per100>) => (isKnown(x) ? x.v : NaN)

describe('valeurs pour 100 ml et par portion', () => {
  test('pour 100 ml : inchangé', () => expect(v(per100(soda, 'sucres'))).toBe(10.6))
  test('par portion : ramené à 100 ml', () => expect(v(per100(portion, 'cafeine'))).toBeCloseTo(32))
  test('portion de volume nul : inconnu, jamais zéro', () => {
    const d = { ...portion, basis: { kind: 'portion' as const, portionMl: 0 } }
    expect(per100(d, 'cafeine')).toEqual({ missing: 'inconnu' })
  })
  test('énergie en kJ seulement : conversion marquée estimation', () => {
    const d: Drink = { ...soda, values: { energie_kj: { v: 418.4, src: 'etiquette' } } }
    const x = per100(d, 'energie_kcal')
    expect(isKnown(x) && x.src).toBe('estimation')
    expect(v(x)).toBeCloseTo(100)
  })
})

describe('consommation partielle', () => {
  test('250 ml bus sur 330 ml', () => expect(v(intakeValue(soda, 'sucres', 250))).toBeCloseTo(26.5))
  test('une portion entière de 250 ml rend la valeur par portion', () => expect(v(intakeValue(portion, 'cafeine', 250))).toBeCloseTo(80))
  test('valeur absente : reste absente', () => expect(intakeValue(soda, 'cafeine', 250)).toEqual({ missing: 'non_indique' }))
  test('précision interne conservée, arrondi à l’affichage', () => {
    const x = v(intakeValue(soda, 'sucres', 333))
    expect(x).toBeCloseTo(35.298, 6)
    expect(fmt(x)).toBe('35,3')
  })
})

describe('cumuls quotidiens et données manquantes', () => {
  const s = state([
    it_('a', 'soda', 250, '2026-11-14T14:30:00Z'),
    it_('b', 'eau', 500, '2026-11-14T10:00:00Z'),
    it_('c', 'the', 340, '2026-11-14T12:10:00Z'),
    it_('d', 'soda', 330, '2026-11-13T12:00:00Z'),
  ])
  const st = dayStats(s.intakes, s.drinks, '2026-11-14', 'UTC')
  test('volume et répartition', () => {
    expect(st.volume).toBe(1090)
    expect(st.byCategory).toEqual({ soda: 250, eau_plate: 500, the: 340 })
  })
  test('sucres : somme connue + nombre d’inconnues (non applicable ignoré)', () => {
    expect(st.totals.sucres.v).toBeCloseTo(26.5)
    expect(st.totals.sucres.unknown).toBe(1)
  })
  test('caféine : aucune connue, deux inconnues', () => {
    expect(st.totals.cafeine).toMatchObject({ v: 0, known: 0, unknown: 2 })
  })
})

describe('modification et suppression', () => {
  test('modifier la quantité recalcule les totaux', () => {
    const a = it_('a', 'soda', 250, '2026-11-14T14:30:00Z')
    const s1 = state([a])
    const s2 = state([{ ...a, ml: 100 }])
    expect(dayStats(s1.intakes, s1.drinks, '2026-11-14', 'UTC').totals.sucres.v).toBeCloseTo(26.5)
    expect(dayStats(s2.intakes, s2.drinks, '2026-11-14', 'UTC').totals.sucres.v).toBeCloseTo(10.6)
  })
  test('supprimer retire la prise et l’avis associé', () => {
    const s = state([it_('x', 'soda', 300, '2026-11-14T08:00:00Z')])
    expect(evaluate(s, '2026-11-14', undefined, RULES, 'UTC').findings).toHaveLength(1)
    expect(evaluate({ ...s, intakes: [] }, '2026-11-14', undefined, RULES, 'UTC').findings).toHaveLength(0)
  })
})

describe('fuseaux horaires et limites de période', () => {
  test('23 h 30 à Paris le 14 = 22 h 30 UTC', () => expect(dayKey('2026-11-14T22:30:00Z', 'Europe/Paris')).toBe('2026-11-14'))
  test('00 h 30 à Paris le 15 = 23 h 30 UTC le 14', () => expect(dayKey('2026-11-14T23:30:00Z', 'Europe/Paris')).toBe('2026-11-15'))
  test('Mayotte (UTC+3) bascule plus tôt', () => expect(dayKey('2026-11-14T21:30:00Z', 'Indian/Mayotte')).toBe('2026-11-15'))
  test('lastDays traverse un changement de mois', () => expect(lastDays('2026-12-02', 3)).toEqual(['2026-11-30', '2026-12-01', '2026-12-02']))
})

describe('moteur de règles', () => {
  test('aucune règle déclenchée : état information', () => {
    const s = state([it_('b', 'eau', 500, '2026-11-14T10:00:00Z')])
    expect(evaluate(s, '2026-11-14', s.intakes[0], RULES, 'UTC').states).toEqual(['information'])
  })
  test('cumul de sucres >= seuil de démo : vigilance', () => {
    const s = state([it_('a', 'soda', 250, '2026-11-14T14:30:00Z')])
    const a = evaluate(s, '2026-11-14', s.intakes[0], RULES, 'UTC')
    expect(a.findings.map((f) => f.rule.id)).toEqual(['DEMO-SUCRES-01'])
    expect(a.states).toContain('vigilance')
    expect(a.states).toContain('incomplete') // caféine non indiquée
  })
  test('règle désactivée : ignorée', () => {
    const rules: Rule[] = RULES.map((r) => ({ ...r, status: 'desactivee' }))
    const s = state([it_('a', 'soda', 500, '2026-11-14T14:30:00Z')])
    expect(evaluate(s, '2026-11-14', undefined, rules, 'UTC').findings).toEqual([])
  })
  test('règle « par prise » sur une valeur inconnue : pas de déclenchement', () => {
    const s = state([it_('c', 'the', 1000, '2026-11-14T12:00:00Z')])
    expect(evaluate(s, '2026-11-14', s.intakes[0], RULES, 'UTC').findings).toEqual([])
  })
  test('applicabilité au profil : grossesse', () => {
    const r = RULES.find((x) => x.id === 'DEMO-CAFEINE-GROSSESSE-01')!
    expect(applies(r, { notifications: true })).toBe(false)
    expect(applies(r, { notifications: true, pregnancy: 'oui' })).toBe(true)
    expect(applies(r, { notifications: true, breastfeeding: 'oui' })).toBe(true)
    const s = state([it_('p', 'p', 250, '2026-11-14T09:00:00Z')], { notifications: true, pregnancy: 'oui' })
    expect(evaluate(s, '2026-11-14', s.intakes[0], RULES, 'UTC').states).toContain('profil')
  })
})

describe('notifications sans doublon', () => {
  const day = '2026-11-14'
  const s1 = state([it_('a', 'soda', 250, '2026-11-14T08:00:00Z')])
  const f1 = evaluate(s1, day, undefined, RULES, 'UTC').findings
  test('premier dépassement : une notification', () => {
    const r = syncNotifications([], f1, dayScope(day, ['a']))
    expect(r.toNotify).toHaveLength(1)
  })
  test('même dépassement inchangé après un ajout : aucune nouvelle notification', () => {
    const r1 = syncNotifications([], f1, dayScope(day, ['a']))
    const s2 = state([...s1.intakes, it_('b', 'soda', 100, '2026-11-14T09:00:00Z')])
    const r2 = syncNotifications(r1.keys, evaluate(s2, day, undefined, RULES, 'UTC').findings, dayScope(day, ['a', 'b']))
    expect(r2.toNotify).toHaveLength(0)
  })
  test('repasse sous le seuil puis le redépasse : nouvelle notification', () => {
    const r1 = syncNotifications([], f1, dayScope(day, ['a']))
    const r2 = syncNotifications(r1.keys, [], dayScope(day, []))
    expect(r2.keys).toEqual([])
    expect(syncNotifications(r2.keys, f1, dayScope(day, ['a'])).toNotify).toHaveLength(1)
  })
})

const ing = (name: string, extra: Partial<Ingredient> = {}): Ingredient => ({ id: name, name, unit: 'g', sweetener: 'non', addedSugar: 'non', ...extra })
const recipe = (ingredients: Ingredient[], extra: Partial<Recipe> = {}): Recipe => ({ ingredients, finalMl: 500, prep: 'melange', confirmedNoAddedSugar: true, ...extra })

describe('recettes : blocage du sucre ajouté', () => {
  test('miel : refusé même si déclaré « non »', () => expect(checkIngredient(ing('miel')).status).toBe('refuse'))
  test('sirop d’érable : refusé', () => expect(checkIngredient(ing('Sirop d’érable')).status).toBe('refuse'))
  test('ingrédient déclaré utilisé pour sucrer : refusé', () => expect(checkIngredient(ing('Poudre X', { sweetener: 'oui' })).status).toBe('refuse'))
  test('ingrédient composé avec sucre ajouté : refusé et signalé', () => {
    const c = checkIngredient(ing('Lait d’avoine', { addedSugar: 'oui' }))
    expect(c).toMatchObject({ status: 'refuse' })
  })
  test('recette avec sucre : statut refusée', () => expect(checkRecipe(recipe([ing('citron'), ing('sucre')])).status).toBe('refusee'))
  test('sans confirmation : brouillon', () => expect(checkRecipe(recipe([ing('citron')], { confirmedNoAddedSugar: false })).status).toBe('brouillon'))
  test('recette complète et déclarée : conforme', () => expect(checkRecipe(recipe([ing('Eau'), ing('citron'), ing('menthe')])).status).toBe('conforme'))
})

describe('recettes : ingrédients ambigus ou inconnus', () => {
  test('« lait d’amande » non précisé : à préciser, jamais conforme automatiquement', () => {
    const c = checkIngredient(ing('Lait d’amande', { sweetener: 'inconnu', addedSugar: 'inconnu' }))
    expect(c.status).toBe('a_preciser')
    expect(checkRecipe(recipe([ing('Lait d’amande', { addedSugar: 'inconnu' })])).status).toBe('brouillon')
  })
  test('« boisson sans sucre » : la mention ne suffit pas sans déclaration', () => {
    expect(checkIngredient(ing('Boisson végétale sans sucres ajoutés', { addedSugar: 'inconnu' })).status).toBe('a_preciser')
  })
  test('ingrédient ambigu déclaré sans sucre ajouté : accepté avec note', () => {
    const c = checkIngredient(ing('Dattes', { sweetener: 'non', addedSugar: 'non' }))
    expect(c.status).toBe('ok')
  })
})

describe('recettes : apports et portions', () => {
  const lait = ing('Lait demi-écrémé', { unit: 'ml', qty: 200, per100: { sucres: { v: 4.8, src: 'etiquette' } } })
  test('mélange : somme rapportée au volume final', () => {
    const r = recipeNutrient(recipe([ing('Eau', { unit: 'ml', qty: 300 }), lait]), 'sucres')
    expect(r.complete).toBe(true)
    expect(isKnown(r.per100) && r.per100.v).toBeCloseTo(1.92) // 9,6 g / 500 ml
    expect(isKnown(r.per100) && r.per100.src).toBe('estimation')
  })
  test('infusion : la part des feuilles est inconnue, pas de valeur précise', () => {
    const feuilles = ing('Menthe', { qty: 5, infused: true, per100: { sucres: { v: 5, src: 'base' } } })
    const r = recipeNutrient(recipe([feuilles, lait], { prep: 'infusion' }), 'sucres')
    expect(r.complete).toBe(false)
    expect(r.per100).toEqual({ missing: 'inconnu' })
    expect(r.knownSum).toBeCloseTo(9.6) // minimum connu
  })
  test('unité « sachet » non convertible : inconnu', () => {
    const r = recipeNutrient(recipe([ing('Thé noir', { unit: 'sachet', qty: 1 })]), 'cafeine')
    expect(r.per100).toEqual({ missing: 'inconnu' })
  })
  test('sans sucre ajouté ≠ zéro sucre : composition inconnue reste inconnue', () => {
    const r = recipeNutrient(recipe([ing('Citron', { qty: 30 })]), 'sucres')
    expect(r.per100).toEqual({ missing: 'inconnu' })
  })
})

describe('repères sourcés', () => {
  const cafe: Drink = { id: 'k', kind: 'commerce', name: 'Boisson caféinée', category: 'energisante', traits: [], basis: { kind: '100ml' }, values: { cafeine: { v: 32, src: 'etiquette' } } }
  const lait: Drink = { id: 'l', kind: 'commerce', name: 'Lait', category: 'lait_vegetale', traits: [], basis: { kind: '100ml' }, values: { sucres: { v: 4.8, src: 'etiquette' } } }
  const S = (intakes: Intake[], profile: State['profile']): State => ({ version: 1, onboarded: true, drinks: [cafe, soda, lait], containers: [], intakes, profile, notified: [] })
  const ids = (s: State, i?: Intake) => evaluate(s, '2026-11-14', i, REAL, 'UTC').findings.map((f) => f.rule.id)
  test('toutes les règles actives ont une source, une URL et une date de vérification', () => {
    for (const r of REAL.filter((x) => x.status !== 'desactivee')) { expect(r.source.url).toMatch(/^https:/); expect(r.verifiedAt).toBeTruthy() }
  })
  test('EFSA : 200 mg en une prise ne déclenche pas, au-delà oui', () => {
    const a = it_('a', 'k', 625, '2026-11-14T08:00:00Z') // 200 mg
    expect(ids(S([a], { notifications: true, ageRange: '18_64' }), a)).toEqual([])
    const b = it_('b', 'k', 700, '2026-11-14T08:00:00Z') // 224 mg
    expect(ids(S([b], { notifications: true, ageRange: '18_64' }), b)).toContain('EFSA-CAFEINE-PRISE')
  })
  test('EFSA : plus de 400 mg sur la journée', () => {
    const l = [0, 1, 2].map((k) => it_('x' + k, 'k', 500, `2026-11-14T0${k + 7}:00:00Z`)) // 3 × 160 mg
    expect(ids(S(l, { notifications: true, ageRange: '18_64' }))).toContain('EFSA-CAFEINE-JOUR')
  })
  test('grossesse : repère 200 mg/jour au lieu de 400', () => {
    const l = [it_('a', 'k', 400, '2026-11-14T08:00:00Z'), it_('b', 'k', 300, '2026-11-14T12:00:00Z')] // 224 mg
    const r = ids(S(l, { notifications: true, ageRange: '18_64', pregnancy: 'oui' }))
    expect(r).toContain('EFSA-CAFEINE-GROSSESSE')
    expect(r).not.toContain('EFSA-CAFEINE-JOUR')
  })
  test('profil sans âge : repères adultes non évalués et signalé', () => {
    const b = it_('b', 'k', 700, '2026-11-14T08:00:00Z')
    const a = evaluate(S([b], { notifications: true }), '2026-11-14', b, REAL, 'UTC')
    expect(a.findings).toEqual([])
    expect(a.missing.join(' ')).toMatch(/tranche d’âge/)
  })
  test('ANSES : sucres > 100 g, lait exclu', () => {
    const l = [it_('a', 'soda', 990, '2026-11-14T08:00:00Z')] // 104,9 g
    expect(ids(S(l, { notifications: true, ageRange: '18_64' }))).toContain('ANSES-SUCRES-JOUR')
    const m = [it_('a', 'soda', 900, '2026-11-14T08:00:00Z'), it_('b', 'l', 500, '2026-11-14T09:00:00Z')] // 95,4 g + lait
    expect(ids(S(m, { notifications: true, ageRange: '18_64' }))).not.toContain('ANSES-SUCRES-JOUR')
  })
  test('règle « un verre de boisson sucrée » désactivée', () => {
    expect(REAL.find((r) => r.id === 'ANSES-BOISSON-SUCREE')!.status).toBe('desactivee')
  })
})

describe('eau et sport', () => {
  test('repère EFSA : 2,0 L femme, 2,5 L homme, adultes seulement', () => {
    expect(waterReference({ notifications: false, ageRange: '18_64', sex: 'femme', weightKg: 60 })).toEqual({ ok: true, litres: 2 })
    expect(waterReference({ notifications: false, ageRange: '65_plus', sex: 'homme', weightKg: 80 })).toEqual({ ok: true, litres: 2.5 })
    expect(waterReference({ notifications: false, ageRange: 'moins_18', sex: 'homme' }).ok).toBe(false)
    expect(waterReference({ notifications: false, ageRange: '18_64', sex: 'femme', pregnancy: 'oui' }).ok).toBe(false)
  })
  test('le poids ne change pas le repère quotidien (aucune formule ml/kg inventée)', () => {
    const a = waterReference({ notifications: false, ageRange: '18_64', sex: 'homme', weightKg: 60 })
    const b = waterReference({ notifications: false, ageRange: '18_64', sex: 'homme', weightKg: 110 })
    expect(a).toEqual(b)
  })
  const s = { id: 's', sport: 'Course', start: '2026-11-14T15:00:00Z', durationMin: 60, intensity: 'moderee' as const }
  test('sans pesée : aucune quantité', () => expect(sessionNeed(s, []).ok).toBe(false))
  test('0,8 kg perdus : 1,2 L ; boissons comptées après la fin seulement', () => {
    const n = sessionNeed({ ...s, weightBeforeKg: 72.4, weightAfterKg: 71.6 }, [
      it_('pendant', 'eau', 300, '2026-11-14T15:30:00Z'), it_('apres', 'eau', 500, '2026-11-14T16:10:00Z'), it_('tard', 'eau', 500, '2026-11-14T23:00:00Z'),
    ])
    expect(n.ok && n.targetMl).toBeCloseTo(1200)
    expect(n.drankMl).toBe(500)
  })
  test('prise de poids ou écart aberrant : pas de quantité', () => {
    expect(sessionNeed({ ...s, weightBeforeKg: 70, weightAfterKg: 70.2 }, []).ok).toBe(false)
    expect(sessionNeed({ ...s, weightBeforeKg: 80, weightAfterKg: 70 }, []).ok).toBe(false)
  })
})
