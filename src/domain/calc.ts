import { Drink, Intake, isKnown, Known, Nutrient, Val, Category } from './types'

const KJ_PER_KCAL = 4.184

/**
 * Composition de base des boissons simples non sucrées, pour 100 ml, quand aucune valeur n'a été saisie.
 * Macronutriments : table Ciqual 2020 (Anses) — « Eau », « Café, non instantané, non sucré, prêt à boire »,
 * « Thé infusé, non sucré », « Tisane infusée, non sucrée » (vérifié le 15/11/2026, statut à valider).
 * Caféine : repères EFSA 2015 (café filtre 90 mg pour 200 ml ; thé noir 50 mg pour 220 ml), valeurs typiques.
 * Les ajouts (lait, sucre…) ne sont pas couverts.
 */
const B = (v: number): Known => ({ v, src: 'base' })
const ZERO = { energie_kcal: B(0), matieres_grasses: B(0), ags: B(0), glucides: B(0), sucres: B(0), proteines: B(0), sel: B(0) }
export const BASE: Partial<Record<Category, Partial<Record<Nutrient, Known>>>> = {
  eau_plate: { ...ZERO, cafeine: B(0) },
  eau_gazeuse: { ...ZERO, sel: undefined as unknown as Known, cafeine: B(0) },
  cafe: { ...ZERO, energie_kcal: B(7), glucides: B(1.4), sel: B(0.01), cafeine: B(45) },
  the: { ...ZERO, cafeine: B(22.7) },
  infusion: { ...ZERO, energie_kcal: B(1), glucides: B(0.2) },
}
/** La base ne s'applique ni aux produits du commerce (étiquette) ni aux recettes à plusieurs ingrédients nutritifs. */
export const usesBase = (d: Drink) => d.kind !== 'commerce' && d.kind !== 'recette' && !!BASE[d.category]

/** Valeur pour 100 ml, quelle que soit la base de l'étiquette. */
export function per100(d: Drink, n: Nutrient): Val {
  let x = d.values[n]
  if (!isKnown(x) && usesBase(d)) {
    const b = BASE[d.category]![n]
    if (b) return b
    // Infusion ou thé déclaré sans caféine : rien à compter.
    if (n === 'cafeine' && d.category === 'infusion' && !d.traits.includes('cafeinee')) return B(0)
  }
  // Énergie : si seule la valeur en kJ est connue, conversion signalée comme estimation.
  if (n === 'energie_kcal' && !isKnown(x) && isKnown(d.values.energie_kj)) {
    x = { v: d.values.energie_kj.v / KJ_PER_KCAL, src: 'estimation' }
  }
  if (!x) return { missing: 'inconnu' }
  if (!isKnown(x)) return x
  if (d.basis.kind === 'portion') {
    if (!(d.basis.portionMl > 0)) return { missing: 'inconnu' }
    return { ...x, v: (x.v * 100) / d.basis.portionMl }
  }
  return x
}

/** apport consommé = valeur pour 100 ml × volume consommé / 100 */
export function intakeValue(d: Drink, n: Nutrient, ml: number): Val {
  const x = per100(d, n)
  return isKnown(x) ? { ...x, v: (x.v * ml) / 100 } : x
}

export interface Total {
  v: number // somme des valeurs connues
  known: number // nombre de prises avec valeur connue
  unknown: number // prises dont la valeur est inconnue ou non indiquée
  estimated: boolean // au moins une valeur estimée
  upper?: boolean // au moins une valeur « < x » : le total est un maximum pour ces prises
}

export const TRACKED: Nutrient[] = ['sucres', 'energie_kcal', 'cafeine']
/** Valeurs calculées et affichées (kJ exclu : doublon de kcal). */
export const SHOWN: Nutrient[] = ['energie_kcal', 'matieres_grasses', 'ags', 'glucides', 'sucres', 'proteines', 'sel', 'cafeine']

/** Clé de jour civil (AAAA-MM-JJ) dans un fuseau donné. */
export function dayKey(iso: string, tz?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}

export interface DayStats {
  day: string
  volume: number
  count: number
  byCategory: Partial<Record<Category, number>>
  totals: Record<Nutrient, Total>
  intakes: Intake[]
}

export function dayStats(intakes: Intake[], drinks: Drink[], day: string, tz?: string): DayStats {
  const byId = new Map(drinks.map((d) => [d.id, d]))
  const list = intakes.filter((i) => dayKey(i.at, tz) === day).sort((a, b) => b.at.localeCompare(a.at))
  const totals = {} as Record<Nutrient, Total>
  for (const n of SHOWN) totals[n] = { v: 0, known: 0, unknown: 0, estimated: false }
  const byCategory: Partial<Record<Category, number>> = {}
  let volume = 0
  for (const i of list) {
    volume += i.ml
    const d = byId.get(i.drinkId)
    if (d) byCategory[d.category] = (byCategory[d.category] ?? 0) + i.ml
    for (const n of SHOWN) {
      const t = totals[n]
      const x = d ? intakeValue(d, n, i.ml) : ({ missing: 'inconnu' } as Val)
      if (isKnown(x)) { t.v += x.v; t.known++; if (x.src === 'estimation') t.estimated = true; if (x.lt) t.upper = true }
      else if (x.missing !== 'non_applicable') t.unknown++
    }
  }
  return { day, volume, count: list.length, byCategory, totals, intakes: list }
}

/** Arrondi pour l'affichage seulement. */
export function fmt(v: number, digits = 1): string {
  const r = Number(v.toFixed(digits))
  return r.toLocaleString('fr-FR', { maximumFractionDigits: digits })
}

export function fmtVal(x: Val | undefined, unit: string, digits = 1): string {
  if (!x) return 'Inconnu'
  if (isKnown(x)) return `${x.lt ? '< ' : ''}${fmt(x.v, digits)} ${unit}`
  return MISSING_LABEL[x.missing]
}

export const MISSING_LABEL = {
  non_indique: 'Non indiqué sur l’étiquette',
  inconnu: 'Inconnu',
  non_applicable: 'Non applicable',
} as const

export const SOURCE_LABEL: Record<Known['src'], string> = {
  etiquette: 'Étiquette',
  base: 'Base documentée',
  utilisateur: 'Saisie personnelle',
  estimation: 'Estimation',
}

export function lastDays(today: string, n: number): string[] {
  const [y, m, d] = today.split('-').map(Number)
  const out: string[] = []
  for (let k = n - 1; k >= 0; k--) {
    const dt = new Date(Date.UTC(y, m - 1, d - k))
    out.push(dt.toISOString().slice(0, 10))
  }
  return out
}
