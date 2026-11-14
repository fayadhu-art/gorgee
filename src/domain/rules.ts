import { dayKey, dayStats, intakeValue, SHOWN, TRACKED } from './calc'
import { Category, Drink, Intake, isKnown, Nutrient, Profile, State, NUTRIENTS, nlabel } from './types'

export type RuleStatus = 'demonstration' | 'a_valider' | 'validee' | 'desactivee'
export type Level = 'vigilance' | 'depassement' | 'profil'

export interface Rule {
  id: string
  version: string
  title: string
  substance: Nutrient
  population: {
    label: string
    pregnantOrBreastfeeding?: boolean // seulement si grossesse ou allaitement
    excludePregnantOrBreastfeeding?: boolean
    ageRanges?: Profile['ageRange'][]
  }
  period: 'prise' | 'jour'
  trigger: { op: '>=' | '>'; value: number }
  level: Level
  thresholdKind: 'objectif' | 'limitation' | 'niveau_sans_probleme_de_securite'
  excludeCategories?: Category[]
  message: string
  limits: string
  source: { name: string; url: string }
  verifiedAt?: string
  status: RuleStatus
}

const ADULTS: Profile['ageRange'][] = ['18_64', '65_plus']
const EFSA_CAF = { name: 'EFSA, Scientific Opinion on the safety of caffeine (2015)', url: 'https://www.efsa.europa.eu/en/topics/topic/caffeine' }

/**
 * Repères issus de sources vérifiées le 14/11/2026 (extraits officiels relus).
 * Statut « a_valider » : source contrôlée, validation par un professionnel de santé non faite.
 */
export const RULES: Rule[] = [
  {
    id: 'EFSA-CAFEINE-PRISE', version: '2015.1', title: 'Caféine en une prise',
    substance: 'cafeine', population: { label: 'Adultes en bonne santé, hors grossesse et allaitement', ageRanges: ADULTS, excludePregnantOrBreastfeeding: true },
    period: 'prise', trigger: { op: '>', value: 200 }, level: 'depassement', thresholdKind: 'niveau_sans_probleme_de_securite',
    message: 'Cette boisson apporte {v} mg de caféine connue. L’EFSA considère que des prises uniques jusqu’à {s} mg ne posent pas de problème de sécurité chez l’adulte en bonne santé.',
    limits: 'Un dépassement ne signifie pas un danger certain : au-delà, l’EFSA ne garantit plus l’absence de problème. Seule la caféine connue est comptée.',
    source: EFSA_CAF, verifiedAt: '2026-11-14', status: 'a_valider',
  },
  {
    id: 'EFSA-CAFEINE-JOUR', version: '2015.1', title: 'Caféine sur la journée',
    substance: 'cafeine', population: { label: 'Adultes en bonne santé, hors grossesse et allaitement', ageRanges: ADULTS, excludePregnantOrBreastfeeding: true },
    period: 'jour', trigger: { op: '>', value: 400 }, level: 'depassement', thresholdKind: 'niveau_sans_probleme_de_securite',
    message: 'Ta journée compte {v} mg de caféine connue. L’EFSA considère qu’un apport réparti dans la journée jusqu’à {s} mg ne pose pas de problème de sécurité chez l’adulte en bonne santé.',
    limits: 'Journée civile, de minuit à minuit. Les aliments, compléments et médicaments contenant de la caféine ne sont pas suivis.',
    source: EFSA_CAF, verifiedAt: '2026-11-14', status: 'a_valider',
  },
  {
    id: 'EFSA-CAFEINE-GROSSESSE', version: '2015.1', title: 'Caféine pendant la grossesse ou l’allaitement',
    substance: 'cafeine', population: { label: 'Grossesse ou allaitement', pregnantOrBreastfeeding: true },
    period: 'jour', trigger: { op: '>', value: 200 }, level: 'profil', thresholdKind: 'niveau_sans_probleme_de_securite',
    message: 'Ton profil indique une grossesse ou un allaitement et ta journée compte {v} mg de caféine connue. L’EFSA considère qu’une consommation habituelle jusqu’à {s} mg par jour ne pose pas de problème de sécurité pour l’enfant.',
    limits: 'Les consignes de ton médecin ou de ta sage-femme priment sur ce repère général.',
    source: { name: 'EFSA, Scientific Opinion on the safety of caffeine (2015)', url: 'https://efsa.onlinelibrary.wiley.com/doi/pdf/10.2903/j.efsa.2015.4102' }, verifiedAt: '2026-11-14', status: 'a_valider',
  },
  {
    id: 'ANSES-SUCRES-JOUR', version: '2016.1', title: 'Sucres sur la journée (hors lactose)',
    substance: 'sucres', population: { label: 'Adultes', ageRanges: ADULTS },
    period: 'jour', trigger: { op: '>', value: 100 }, level: 'depassement', thresholdKind: 'limitation', excludeCategories: ['lait_vegetale'],
    message: 'Tes boissons de la journée apportent {v} g de sucres connus, hors lait et boissons végétales. L’ANSES recommande de ne pas dépasser {s} g de sucres par jour, hors lactose et galactose, toute alimentation comprise.',
    limits: 'Le repère couvre toute l’alimentation : l’appli ne voit que les boissons, le total réel est donc plus élevé. Les laits et boissons végétales sont exclus faute de pouvoir séparer le lactose.',
    source: { name: 'ANSES, Sucres dans l’alimentation', url: 'https://www.anses.fr/fr/article/sucres-lalimentation' }, verifiedAt: '2026-11-14', status: 'a_valider',
  },
  {
    id: 'ANSES-BOISSON-SUCREE', version: '2016.1', title: 'Pas plus d’un verre de boisson sucrée par jour',
    substance: 'sucres', population: { label: 'Adultes', ageRanges: ADULTS },
    period: 'jour', trigger: { op: '>', value: 0 }, level: 'vigilance', thresholdKind: 'limitation',
    message: '',
    limits: 'Désactivée : l’ANSES ne chiffre ni le volume d’un verre ni la teneur en sucres qui définit une boisson sucrée. L’appli ne peut pas l’évaluer sans inventer ces valeurs.',
    source: { name: 'ANSES, Sucres dans l’alimentation', url: 'https://www.anses.fr/fr/article/sucres-lalimentation' }, verifiedAt: '2026-11-14', status: 'desactivee',
  },
]

/** Règles fictives, réservées aux tests du moteur. Jamais affichées dans l'appli. */
export const DEMO_RULES: Rule[] = [
  {
    id: 'DEMO-SUCRES-01', version: '0.1', title: 'Sucres (démonstration)', substance: 'sucres', population: { label: 'Tous' }, period: 'jour',
    trigger: { op: '>=', value: 25 }, level: 'vigilance', thresholdKind: 'limitation', message: 'Cumul {v} g, seuil {s} g.', limits: 'Fictif.',
    source: { name: 'Démonstration', url: '' }, status: 'demonstration',
  },
  {
    id: 'DEMO-CAFEINE-01', version: '0.1', title: 'Caféine (démonstration)', substance: 'cafeine', population: { label: 'Tous' }, period: 'prise',
    trigger: { op: '>=', value: 150 }, level: 'depassement', thresholdKind: 'limitation', message: 'Prise {v} mg, seuil {s} mg.', limits: 'Fictif.',
    source: { name: 'Démonstration', url: '' }, status: 'demonstration',
  },
  {
    id: 'DEMO-CAFEINE-GROSSESSE-01', version: '0.1', title: 'Grossesse (démonstration)', substance: 'cafeine', population: { label: 'Grossesse', pregnantOrBreastfeeding: true },
    period: 'jour', trigger: { op: '>', value: 0 }, level: 'profil', thresholdKind: 'limitation', message: 'Jour {v} mg.', limits: 'Fictif.',
    source: { name: 'Démonstration', url: '' }, status: 'demonstration',
  },
]

export const isActive = (r: Rule) => r.status !== 'desactivee'

export function applies(r: Rule, p: Profile): boolean {
  const pb = p.pregnancy === 'oui' || p.breastfeeding === 'oui'
  if (r.population.pregnantOrBreastfeeding && !pb) return false
  if (r.population.excludePregnantOrBreastfeeding && pb) return false
  if (r.population.ageRanges && (!p.ageRange || !r.population.ageRanges.includes(p.ageRange))) return false
  return true
}

const cmp = (op: '>=' | '>', a: number, b: number) => (op === '>=' ? a >= b : a > b)

export interface Finding { rule: Rule; value: number; partial: boolean; text: string; key: string }

export type AdviceState = 'information' | 'incomplete' | Level

export interface Advice {
  intake?: Intake
  drink?: Drink
  values: Partial<Record<Nutrient, ReturnType<typeof intakeValue>>>
  stats: ReturnType<typeof dayStats>
  findings: Finding[]
  missing: string[]
  states: AdviceState[]
}

/** Évaluation déterministe des règles pour un jour (et une prise si fournie). */
export function evaluate(s: State, day: string, intake?: Intake, rules = RULES, tz?: string): Advice {
  const stats = dayStats(s.intakes, s.drinks, day, tz)
  const drink = intake && s.drinks.find((d) => d.id === intake.drinkId)
  const values: Advice['values'] = {}
  if (drink && intake) for (const n of SHOWN) values[n] = intakeValue(drink, n, intake.ml)
  const findings: Finding[] = []
  for (const r of rules) {
    if (!isActive(r) || !applies(r, s.profile)) continue
    let v: number, partial: boolean, key: string
    if (r.period === 'jour') {
      const t = r.excludeCategories
        ? dayStats(s.intakes.filter((i) => !r.excludeCategories!.includes(s.drinks.find((d) => d.id === i.drinkId)?.category as Category)), s.drinks, day, tz).totals[r.substance]
        : stats.totals[r.substance]
      if (!t) continue
      v = t.v; partial = t.unknown > 0; key = `${r.id}@${r.version}|${day}`
    } else {
      if (!intake) continue
      const x = values[r.substance]
      if (!isKnown(x)) continue
      v = x.v; partial = false; key = `${r.id}@${r.version}|${intake.id}`
    }
    if (!cmp(r.trigger.op, v, r.trigger.value)) continue
    const u = NUTRIENTS[r.substance].unit
    const text = r.message.replace('{v}', fmt1(v)).replace('{s}', fmt1(r.trigger.value)) + (partial ? ` Le cumul est un minimum : certaines valeurs en ${u} sont inconnues.` : '')
    findings.push({ rule: r, value: v, partial, text, key })
  }
  const missing: string[] = []
  if (drink && intake) {
    for (const n of TRACKED) {
      const x = values[n]
      if (x && !isKnown(x) && x.missing !== 'non_applicable') missing.push(`${nlabel(n)} de « ${drink.name} » : ${x.missing === 'non_indique' ? 'non indiqué sur l’étiquette' : 'inconnu'}`)
    }
    if (intake.additions.length) missing.push(`Ajouts (${intake.additions.join(', ')}) : composition non comptée`)
  }
  for (const n of TRACKED) {
    const t = stats.totals[n]
    if (t.unknown > 0) missing.push(`${nlabel(n)} du jour : ${t.unknown} boisson${t.unknown > 1 ? 's' : ''} sans valeur connue`)
  }
  if (!s.profile.ageRange && rules.some((r) => isActive(r) && r.population.ageRanges)) missing.push('Profil : indique ta tranche d’âge pour que les repères caféine et sucres soient évalués')
  const states: AdviceState[] = []
  for (const l of ['depassement', 'vigilance', 'profil'] as Level[]) if (findings.some((f) => f.rule.level === l)) states.push(l)
  if (missing.length) states.push('incomplete')
  if (!states.length) states.push('information')
  return { intake, drink, values, stats, findings, missing: [...new Set(missing)], states }
}

const fmt1 = (v: number) => Number(v.toFixed(1)).toLocaleString('fr-FR')

/**
 * Notifications sans doublon : une clé par règle et par période.
 * Une clé dont la règle ne se déclenche plus est retirée, pour qu'un nouveau dépassement soit signalé.
 */
export function syncNotifications(prev: string[], firing: Finding[], scopePrefix: (k: string) => boolean) {
  const now = new Set(firing.map((f) => f.key))
  const kept = prev.filter((k) => !scopePrefix(k) || now.has(k))
  const toNotify = firing.filter((f) => !prev.includes(f.key))
  return { keys: [...new Set([...kept, ...toNotify.map((f) => f.key)])], toNotify }
}

export const dayScope = (day: string, intakeIds: string[]) => (k: string) => k.endsWith(`|${day}`) || intakeIds.some((id) => k.endsWith(`|${id}`))

export { dayKey }
