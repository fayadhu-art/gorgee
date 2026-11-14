// Origine d'une valeur connue.
export type Source = 'etiquette' | 'base' | 'utilisateur' | 'estimation'
// Raison pour laquelle une valeur n'est pas connue. Jamais remplacée par zéro.
export type Missing = 'non_indique' | 'inconnu' | 'non_applicable'

/** lt : valeur affichée « < v » sur l'étiquette (maximum, pas valeur exacte). */
export type Known = { v: number; src: Source; lt?: true }
export type Val = Known | { missing: Missing }

export const isKnown = (x: Val | undefined): x is Known => !!x && 'v' in x

export const NUTRIENTS = {
  energie_kcal: { label: 'Énergie', unit: 'kcal' },
  energie_kj: { label: 'Énergie', unit: 'kJ' },
  matieres_grasses: { label: 'Matières grasses', unit: 'g' },
  ags: { label: 'dont acides gras saturés', unit: 'g' },
  glucides: { label: 'Glucides', unit: 'g' },
  sucres: { label: 'dont sucres', unit: 'g' },
  proteines: { label: 'Protéines', unit: 'g' },
  sel: { label: 'Sel', unit: 'g' },
  cafeine: { label: 'Caféine', unit: 'mg' },
} as const
export type Nutrient = keyof typeof NUTRIENTS
/** Libellé autonome (hors tableau d'étiquette). */
export const nlabel = (n: Nutrient) => (n === 'sucres' ? 'Sucres' : n === 'ags' ? 'Acides gras saturés' : NUTRIENTS[n].label)
export const NUTRIENT_KEYS = Object.keys(NUTRIENTS) as Nutrient[]

export const CATEGORIES = {
  eau_plate: 'Eau plate',
  eau_gazeuse: 'Eau gazeuse',
  jus: 'Jus',
  soda: 'Sodas',
  cafe: 'Café',
  the: 'Thé',
  infusion: 'Infusions',
  energisante: 'Boissons énergisantes',
  lait_vegetale: 'Lait et boissons végétales',
  maison: 'Boissons maison',
} as const
export type Category = keyof typeof CATEGORIES

export const TRAITS = {
  gazeuse: 'Gazeuse',
  cafeinee: 'Caféinée',
  maison: 'Maison',
  edulcoree: 'Édulcorée',
  alcoolisee: 'Alcoolisée',
} as const
export type Trait = keyof typeof TRAITS

export type Basis = { kind: '100ml' } | { kind: 'portion'; portionMl: number }

export type Unit = 'g' | 'ml' | 'sachet' | 'cuillere' | 'piece'
export interface Ingredient {
  id: string
  name: string
  qty?: number
  unit: Unit
  unitNote?: string // ex. « cuillère à café rase, environ 2 g »
  sweetener: 'oui' | 'non' | 'inconnu' // utilisé pour sucrer ?
  addedSugar: 'oui' | 'non' | 'inconnu' // ingrédient composé contenant du sucre ajouté ?
  per100?: Partial<Record<Nutrient, Val>> // composition pour 100 g ou 100 ml
  infused?: boolean // infusé puis retiré (feuilles, épices…)
}

export type Prep = 'melange' | 'infusion' | 'filtration'

export interface Recipe {
  ingredients: Ingredient[]
  waterMl?: number
  finalMl?: number
  portions?: number
  prep: Prep
  steepMin?: number
  tempC?: number
  instructions?: string
  confirmedNoAddedSugar: boolean
  teaType?: string
}

export interface Drink {
  id: string
  kind: 'commerce' | 'generique' | 'the' | 'recette'
  name: string
  brand?: string
  category: Category
  traits: Trait[]
  capacityMl?: number
  barcode?: string
  ingredients?: string
  allergens?: string
  sweeteners?: string
  warnings?: string
  alcoholPct?: Val
  minerals?: string
  basis: Basis
  values: Partial<Record<Nutrient, Val>>
  valuesSourceNote?: string
  recipe?: Recipe
  status?: 'valide' | 'brouillon'
  favorite?: boolean
  fake?: boolean
}

export interface Container { id: string; name: string; ml: number }

export interface Intake {
  id: string
  drinkId: string
  ml: number
  at: string // ISO 8601
  containerId?: string
  additions: string[]
  note?: string
  fake?: boolean
}

export interface Session {
  id: string
  sport: string
  start: string // ISO 8601
  durationMin: number
  intensity: 'legere' | 'moderee' | 'intense'
  hot?: boolean
  weightBeforeKg?: number
  weightAfterKg?: number
  note?: string
}

export interface Profile {
  age?: number
  ageRange?: 'moins_18' | '18_64' | '65_plus'
  sex?: 'femme' | 'homme'
  weightKg?: number
  pregnancy?: 'oui' | 'non'
  breastfeeding?: 'oui' | 'non'
  notifications: boolean
  proInstructions?: string
}

export interface State {
  version: 1
  onboarded: boolean
  drinks: Drink[]
  containers: Container[]
  intakes: Intake[]
  profile: Profile
  notified: string[]
  sessions?: Session[]
}
