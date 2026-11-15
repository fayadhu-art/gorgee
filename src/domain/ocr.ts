import type { Nutrient } from './types'

/** Lecture d'un tableau nutritionnel OCR. Fonctions pures : aucune valeur devinée, absent = non renvoyé. */

export interface Parsed {
  values: Partial<Record<Nutrient, number>>
  /** Valeurs écrites « < x » : x est un maximum. */
  lt: Partial<Record<Nutrient, true>>
  basis?: { kind: '100ml' } | { kind: 'portion'; portionMl: number }
  capacityMl?: number
  /** Sodium lu sur l'étiquette (g) : sert à contrôler ou à calculer le sel (sel = sodium × 2,5, règlement UE 1169/2011). */
  sodium?: number
  /** Valeurs calculées et non lues (sel depuis le sodium). */
  derived?: Partial<Record<Nutrient, true>>
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
// Corrige les confusions OCR courantes dans les nombres (O→0, l/I→1) et la virgule décimale.
// « 007 » ou « 05 » (séparateur perdu) : un nombre qui commence par 0 est décimal.
const num = (s: string) => { const t = s.replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(',', '.'); return Number(/^0\d/.test(t) ? '0.' + t.slice(1) : t) }
const N = '(<\\s*)?([0-9oOlI|]+(?:[.,][0-9oO]+)?)'
// Dernier nombre de la ligne quand l'unité est illisible. Avec 3 décimales ou plus, le dernier « chiffre » est presque toujours le « g » mal lu (« 0.174 » pour « 0.17g »).
const lastNum = (l: string) => {
  const m = l.match(/(<\s*)?(\d+(?:[.,]\d+)?)\s*[^\w\s]{0,2}\s*$/)
  if (m && /[.,]\d{3,}$/.test(m[2]) && Number(m[2].slice(0, -1).replace(',', '.')) > 0) m[2] = m[2].slice(0, -1)
  return m
}

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
  let sodium: number | undefined
  for (const l of lines) {
    // Énergie : « 180 kJ / 42 kcal » dans n'importe quel ordre.
    if (/energ|kcal|kj/.test(l)) {
      const kcal = l.match(new RegExp(N + '\\s*kc'))
      const kj = l.match(new RegExp(N + '\\s*k(?!c)'))
      if (kcal && !kcal[1] && values.energie_kcal === undefined) values.energie_kcal = num(kcal[2])
      if (kj && !kj[1] && values.energie_kj === undefined) values.energie_kj = num(kj[2])
      continue
    }
    if (/sodium/.test(l) && sodium === undefined) { const m = l.match(new RegExp(N + '\\s*g\\b')) ?? lastNum(l); if (m && !m[1]) sodium = num(m[2]) }
    for (const [n, re, unit] of LINES) {
      if (values[n] !== undefined || !re.test(l)) continue
      // « dont sucres » ne doit pas être pris pour « glucides » et inversement : première règle qui correspond.
      let m = l.match(new RegExp(N + '\\s*' + unit + '\\b'))
      // L'OCR lit souvent le « g » final comme « 9 » ou « q » : « 0.179 » → 0,17 g (à vérifier par l'utilisateur).
      if (!m && unit === 'g') { const g = l.match(/(<\s*)?(\d+[.,]?\d*)[9q]\b/); if (g && g[2].length >= 2) m = g }
      // Unité illisible (« 0.07¢ », « <0.5% ») : le dernier nombre de la ligne, s'il est en fin de ligne.
      if (!m && unit === 'g') m = lastNum(l)
      if (m) {
        values[n] = num(m[2]); if (m[1]) lt[n] = true
        // « Carbohydrates of which sugars 11 g » : une seule valeur pour la ligne, elle vaut pour les deux.
        if (n === 'sucres' && /glucides|carbohydrates?/.test(l) && values.glucides === undefined) { values.glucides = values.sucres; if (m[1]) lt.glucides = true }
      }
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
  return { values, lt, basis, capacityMl, sodium: Number.isFinite(sodium!) ? sodium : undefined }
}

/** Plusieurs lectures de la même étiquette : pour chaque valeur, la plus fréquente ; puis contrôles de cohérence (kJ/kcal, sel/sodium). */
export function mergeParsed(list: Parsed[]): Parsed {
  const pick = <T,>(xs: T[]) => {
    const c = new Map<string, { x: T; n: number }>()
    for (const x of xs) { const k = JSON.stringify(x); c.set(k, { x, n: (c.get(k)?.n ?? 0) + 1 }) }
    const all = [...c.values()]
    // « 0,17 g » lu « 0.174 » ou « 0.179 » : le « g » pris pour un chiffre. Ces lectures comptent pour la valeur plus courte si elle a aussi été lue.
    for (const a of all) for (const b of all) { const va = (a.x as { v?: number }).v, vb = (b.x as { v?: number }).v; if (va !== undefined && vb !== undefined && a !== b && String(vb).includes('.') && String(vb).length === String(va).length + 1 && String(vb).startsWith(String(va)) && (a.x as { lt?: boolean }).lt === (b.x as { lt?: boolean }).lt) { a.n += b.n; b.n = 0 } }
    let best: { x: T; n: number } | undefined
    for (const a of all) if (!best || a.n > best.n) best = a
    return best?.x
  }
  const cand = (n: Nutrient) => list.filter((p) => p.values[n] !== undefined).map((p) => ({ v: p.values[n]!, lt: !!p.lt[n] }))
  const values: Parsed['values'] = {}, lt: Parsed['lt'] = {}, derived: Parsed['derived'] = {}
  const put = (n: Nutrient, x?: { v: number; lt: boolean }) => { if (!x) return; values[n] = x.v; if (x.lt) lt[n] = true; else delete lt[n] }
  for (const n of ['energie_kcal', 'energie_kj', 'matieres_grasses', 'ags', 'glucides', 'sucres', 'proteines', 'sel', 'cafeine'] as Nutrient[]) put(n, pick(cand(n)))
  // 1 kcal = 4,184 kJ : si les deux lectures ne s'accordent pas, on cherche une autre lecture qui s'accorde.
  const okE = (kcal: number, kj: number) => Math.abs(kj / kcal - 4.184) < 0.4
  if (values.energie_kcal !== undefined && values.energie_kj !== undefined && !okE(values.energie_kcal, values.energie_kj)) {
    const a = cand('energie_kcal').find((x) => okE(x.v, values.energie_kj!)), b = cand('energie_kj').find((x) => okE(values.energie_kcal!, x.v))
    if (a) put('energie_kcal', a); else if (b) put('energie_kj', b)
  }
  const sodium = pick(list.filter((p) => p.sodium !== undefined).map((p) => p.sodium!))
  if (sodium !== undefined && sodium > 0) {
    const okS = (sel: number) => Math.abs(sel - sodium * 2.5) <= 0.15 * sodium * 2.5 + 0.005
    if (values.sel === undefined || !okS(values.sel)) {
      const a = cand('sel').find((x) => okS(x.v))
      if (a) put('sel', a)
      else if (values.sel === undefined) { values.sel = Math.round(sodium * 250) / 100; derived.sel = true }
    }
  }
  if (values.sucres !== undefined && values.glucides !== undefined && values.sucres > values.glucides) { const g = cand('glucides').find((x) => x.v >= values.sucres!); if (g) put('glucides', g); else { delete values.glucides; delete lt.glucides } }
  return { values, lt, derived, sodium, basis: list.find((p) => p.basis)?.basis, capacityMl: pick(list.filter((p) => p.capacityMl).map((p) => p.capacityMl!)) }
}

export interface OcrWord { text: string; confidence: number }
const clean = (t: string) => t.replace(/[^\p{L}'’\-]/gu, '')
const cap = (w: string) => (w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w)
/** Nom depuis la photo de face : mots de marque lus sur les passes par couleur, puis la ligne la mieux lue. Seuls les mots lus avec certitude sont gardés. */
export function nameFrom(brand: OcrWord[], lines: OcrWord[][]): string | undefined {
  const good = (ws: OcrWord[], min: number) => ws.filter((w) => w.confidence >= min).map((w) => clean(w.text)).filter((t) => t.length >= 3)
  const best = lines.map((l) => good(l, 75)).sort((a, b) => b.length - a.length || b.join('').length - a.join('').length)[0] ?? []
  const out: string[] = []
  for (const w of [...good(brand, 70), ...best]) if (!out.some((o) => o.toLowerCase() === w.toLowerCase())) out.push(cap(w))
  return out.length ? out.slice(0, 5).join(' ') : undefined
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
