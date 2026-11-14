import type { Nutrient } from './types'

/** Lecture d'un tableau nutritionnel OCR. Fonctions pures : aucune valeur devinée, absent = non renvoyé. */

export interface Parsed {
  values: Partial<Record<Nutrient, number>>
  /** Valeurs écrites « < x » : x est un maximum. */
  lt: Partial<Record<Nutrient, true>>
  basis?: { kind: '100ml' } | { kind: 'portion'; portionMl: number }
  capacityMl?: number
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// Corrige les confusions OCR courantes dans les nombres (O→0, l/I→1) et la virgule décimale.
// « 007 » ou « 05 » (séparateur perdu) : un nombre qui commence par 0 est décimal.
const num = (s: string) => { const t = s.replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(',', '.'); return Number(/^0\d/.test(t) ? '0.' + t.slice(1) : t) }
const N = '(<\\s*)?([0-9oOlI|]+(?:[.,][0-9oO]+)?)'

const LINES: [Nutrient, RegExp, string][] = [
  ['ags', /satur/, 'g'],
  ['matieres_grasses', /mati.res? grasses|lipides|\bfats?\b/, 'g'],
  // Avant « glucides » : « Carbohydrates of which sugars 11 g » donne les sucres, pas les glucides.
  ['sucres', /sucres?|sugars?/, 'g'],
  ['glucides', /glucides|carbohydrates?/, 'g'],
  ['proteines', /prot.ines?|protein/, 'g'],
  ['sel', /\bsel\b|\bsalt\b|\bsait\b/, 'g'],
  ['cafeine', /caf+.ine/, 'mg'],
]

export function parseNutrition(text: string): Parsed {
  const values: Parsed['values'] = {}
  const lt: Parsed['lt'] = {}
  const lines = norm(text).split(/\n+/)
  for (const l of lines) {
    // Énergie : « 180 kJ / 42 kcal » dans n'importe quel ordre.
    if (/energ|kcal|kj/.test(l)) {
      const kcal = l.match(new RegExp(N + '\\s*kc'))
      const kj = l.match(new RegExp(N + '\\s*kj'))
      if (kcal && !kcal[1] && values.energie_kcal === undefined) values.energie_kcal = num(kcal[2])
      if (kj && !kj[1] && values.energie_kj === undefined) values.energie_kj = num(kj[2])
      continue
    }
    for (const [n, re, unit] of LINES) {
      if (values[n] !== undefined || !re.test(l)) continue
      // « dont sucres » ne doit pas être pris pour « glucides » et inversement : première règle qui correspond.
      let m = l.match(new RegExp(N + '\\s*' + unit + '\\b'))
      // L'OCR lit souvent le « g » final comme « 9 » ou « q » : « 0.179 » → 0,17 g (à vérifier par l'utilisateur).
      if (!m && unit === 'g') { const g = l.match(/(<\s*)?(\d+[.,]?\d*)[9q]\b/); if (g && g[2].length >= 2) m = g }
      if (m) { values[n] = num(m[2]); if (m[1]) lt[n] = true }
      break
    }
  }
  for (const k of Object.keys(values) as Nutrient[]) if (!Number.isFinite(values[k]!)) { delete values[k]; delete lt[k] }
  const t = norm(text)
  const portion = t.match(/(?:par|pour|per) (?:portion|verre|canette|bouteille)?\s*(?:de\s*)?\(?(\d{2,4})\s*ml/)
  const basis: Parsed['basis'] = /(pour|per|par|for) 100\s*m/.test(t) ? { kind: '100ml' } : portion ? { kind: 'portion', portionMl: Number(portion[1]) } : undefined
  const cap = t.match(/(\d{2,4}(?:[.,]\d+)?)\s*(ml|cl|l)\b(?! *\/)/g)
  let capacityMl: number | undefined
  for (const c of cap ?? []) {
    const m = c.match(/([\d.,]+)\s*(ml|cl|l)/)!
    const v = num(m[1]) * (m[2] === 'l' ? 1000 : m[2] === 'cl' ? 10 : 1)
    if (v !== 100 && v >= 100 && v <= 3000) { capacityMl = Math.round(v); break }
  }
  // Valeurs impossibles pour 100 ml (virgule perdue à la lecture : « 10,6 » lu « 106 ») : écartées, à saisir.
  if (!basis || basis.kind === '100ml') {
    const MAX: Partial<Record<Nutrient, number>> = { energie_kcal: 900, energie_kj: 3800, cafeine: 1000 }
    for (const k of Object.keys(values) as Nutrient[]) if (values[k]! > (MAX[k] ?? 100)) { delete values[k]; delete lt[k] }
    if (values.sucres !== undefined && values.glucides !== undefined && values.sucres > values.glucides) { delete values.sucres; delete values.glucides }
    if (values.ags !== undefined && values.matieres_grasses !== undefined && values.ags > values.matieres_grasses) { delete values.ags; delete values.matieres_grasses }
  }
  for (const k of Object.keys(lt) as Nutrient[]) if (values[k] === undefined) delete lt[k]
  return { values, lt, basis, capacityMl }
}

export interface OcrLine { text: string; height: number; confidence: number }

/** Nom probable : les lignes lisibles écrites le plus gros sur la photo de face (un nom tient souvent sur 2 lignes). */
export function pickName(lines: OcrLine[]): string | undefined {
  const ok = lines
    .map((l) => ({ ...l, text: l.text.replace(/[^\p{L}\p{N}'’&\- ]/gu, ' ').replace(/^[\s\-]+|[\s\-]+$/g, '').replace(/\s+/g, ' ') }))
    .filter((l) => l.confidence >= 30 && (l.text.match(/\p{L}/gu)?.length ?? 0) >= 3)
  if (!ok.length) return undefined
  const max = Math.max(...ok.map((l) => l.height))
  return ok.filter((l) => l.height >= max * 0.6).slice(0, 3).map((l) => l.text).join(' ')
}
