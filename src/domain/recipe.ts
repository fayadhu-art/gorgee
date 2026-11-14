import { Ingredient, isKnown, Nutrient, Recipe, Val } from './types'

// Noms qui désignent sans ambiguïté un ingrédient servant à sucrer.
const SWEET = /\b(sucres?|miel|sirops?|agave|cassonade|vergeoise|m[ée]lasse|rapadura|panela|sucrant|[ée]dulcorant|st[ée]via|sucralose|aspartame|acésulfame|xylitol|[ée]rythritol|saccharine|dextrose|glucose|fructose|maltodextrine)\b/i
// Noms ambigus : peuvent servir à sucrer ou contenir du sucre ajouté selon le produit.
const AMBIGUOUS = /\b(dattes?|raisins? secs?|figues? s[eè]ches?|jus|concentr[ée]|lait (concentr|d'amande|d’amande|d'avoine|d’avoine|de soja|de coco|de riz)|boisson v[ée]g[ée]tale|pur[ée]e|compote|confiture|chocolat|cacao|caramel|vanill[ée]|aromatis[ée]|cordial)\b/i
const NEGATED = /\bsans sucres?( ajout[ée]s?)?\b/i

export const isWater = (name: string) => /^\s*eau( du robinet| plate| min[ée]rale| filtr[ée]e)?\s*$/i.test(name)

export type IngredientCheck =
  | { status: 'ok'; note?: string }
  | { status: 'a_preciser'; reason: string }
  | { status: 'refuse'; reason: string }

export function checkIngredient(i: Ingredient): IngredientCheck {
  const name = i.name.trim()
  if (i.sweetener === 'oui') return { status: 'refuse', reason: 'Déclaré comme ingrédient utilisé pour sucrer.' }
  if (i.addedSugar === 'oui') return { status: 'refuse', reason: 'Ingrédient composé contenant du sucre ajouté.' }
  const cleaned = name.replace(NEGATED, '')
  if (SWEET.test(cleaned)) return { status: 'refuse', reason: `« ${name} » désigne un ingrédient qui sert à sucrer.` }
  if (isWater(name)) return { status: 'ok' }
  if (i.sweetener === 'inconnu' || i.addedSugar === 'inconnu') {
    const why = AMBIGUOUS.test(name) || NEGATED.test(name)
      ? `Le nom « ${name} » ne suffit pas à savoir s’il contient du sucre ajouté.`
      : `Précise si « ${name} » sert à sucrer et s’il contient du sucre ajouté.`
    return { status: 'a_preciser', reason: why }
  }
  return { status: 'ok', note: AMBIGUOUS.test(name) ? 'Ingrédient ambigu, déclaré sans sucre ajouté par toi.' : undefined }
}

export type RecipeStatus = 'conforme' | 'brouillon' | 'refusee'

export function checkRecipe(r: Recipe) {
  const checks = r.ingredients.map((i) => ({ i, c: checkIngredient(i) }))
  const refused = checks.filter((x) => x.c.status === 'refuse')
  const pending = checks.filter((x) => x.c.status === 'a_preciser')
  const problems: string[] = []
  if (!r.ingredients.length) problems.push('Ajoute au moins un ingrédient.')
  if (!r.confirmedNoAddedSugar) problems.push('Coche la confirmation « aucun sucre ajouté ».')
  if (!(r.finalMl && r.finalMl > 0)) problems.push('Indique le volume final préparé.')
  const status: RecipeStatus = refused.length ? 'refusee' : pending.length || problems.length ? 'brouillon' : 'conforme'
  return { status, checks, refused, pending, problems }
}

export interface NutrientResult { per100: Val; knownSum: number; complete: boolean; reasons: string[] }

/**
 * Apports d'une recette à partir des ingrédients.
 * - Unités sans masse ni volume (sachet, cuillère, pièce) : quantité non convertible, valeur inconnue.
 * - Ingrédient infusé ou filtré : la part qui passe dans la boisson n'est pas connue, valeur inconnue.
 * - Eau : ne contribue pas.
 */
export function recipeNutrient(r: Recipe, n: Nutrient): NutrientResult {
  const reasons: string[] = []
  let sum = 0
  let complete = true
  for (const i of r.ingredients) {
    if (isWater(i.name)) continue
    const x = i.per100?.[n]
    if (x && !isKnown(x) && x.missing === 'non_applicable') continue
    if (!(i.qty && i.qty > 0) || (i.unit !== 'g' && i.unit !== 'ml')) { complete = false; reasons.push(`${i.name} : quantité non convertible en g ou ml`); continue }
    if (!isKnown(x)) { complete = false; reasons.push(`${i.name} : composition inconnue`); continue }
    if (r.prep !== 'melange' && i.infused) { complete = false; reasons.push(`${i.name} : part passée dans la boisson inconnue (${r.prep})`); continue }
    sum += (x.v * i.qty) / 100
  }
  if (!(r.finalMl && r.finalMl > 0)) return { per100: { missing: 'inconnu' }, knownSum: sum, complete: false, reasons: [...reasons, 'volume final manquant'] }
  return complete
    ? { per100: { v: (sum * 100) / r.finalMl, src: 'estimation' }, knownSum: sum, complete, reasons }
    : { per100: { missing: 'inconnu' }, knownSum: sum, complete, reasons }
}
