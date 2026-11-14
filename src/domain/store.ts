import { Drink, Intake, State } from './types'

const DB = 'gorgee', STORE = 'kv', KEY = 'state'

const open = () => new Promise<IDBDatabase>((res, rej) => {
  const r = indexedDB.open(DB, 1)
  r.onupgradeneeded = () => r.result.createObjectStore(STORE)
  r.onsuccess = () => res(r.result)
  r.onerror = () => rej(r.error)
})

export async function load(): Promise<State | null> {
  try {
    const db = await open()
    return await new Promise((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).get(KEY)
      q.onsuccess = () => res((q.result as State) ?? null)
      q.onerror = () => rej(q.error)
    })
  } catch { return null }
}

export async function save(s: State) {
  try {
    const db = await open()
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(s, KEY)
  } catch { /* stockage indisponible : l'appli continue en mémoire */ }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

const NA = { missing: 'non_applicable' } as const
const UNK = { missing: 'inconnu' } as const

// Boissons génériques : seules les valeurs non applicables sont posées, le reste est inconnu.
const generic = (id: string, name: string, category: Drink['category'], traits: Drink['traits'] = [], values: Drink['values'] = {}): Drink =>
  ({ id, kind: 'generique', name, category, traits, basis: { kind: '100ml' }, values })

export const CATALOGUE: Drink[] = [
  generic('g-eau', 'Eau plate', 'eau_plate', [], { sucres: NA, energie_kcal: NA, cafeine: NA }),
  generic('g-eau-gaz', 'Eau gazeuse', 'eau_gazeuse', ['gazeuse'], { cafeine: NA }),
  generic('g-cafe', 'Café', 'cafe', ['cafeinee'], { cafeine: UNK }),
  generic('g-the', 'Thé', 'the', ['cafeinee'], { cafeine: UNK }),
  generic('g-infusion', 'Infusion', 'infusion'),
]

export const emptyState = (): State => ({
  version: 1, onboarded: false, drinks: [...CATALOGUE],
  containers: [
    { id: 'c-verre', name: 'Verre', ml: 250 },
    { id: 'c-tasse', name: 'Tasse', ml: 200 },
    { id: 'c-gourde', name: 'Gourde', ml: 500 },
    { id: 'c-bouteille', name: 'Bouteille', ml: 330 },
  ],
  intakes: [], profile: { notifications: false }, notified: [],
})

/** Jeu de données fictives, chaque élément marqué fake. */
export function demoData(s: State, now = new Date()): State {
  const soda: Drink = {
    id: 'demo-soda', kind: 'commerce', name: 'Soda cola (fictif)', brand: 'Marque Exemple', category: 'soda', traits: ['gazeuse', 'cafeinee'],
    capacityMl: 330, basis: { kind: '100ml' }, fake: true, favorite: true,
    ingredients: 'Eau gazéifiée, sucre, colorant, acidifiant, arôme, caféine (liste fictive)', allergens: 'Aucun mentionné', sweeteners: 'Aucun mentionné',
    warnings: 'Non indiqué sur l’étiquette',
    values: { energie_kcal: { v: 42, src: 'etiquette' }, energie_kj: { v: 180, src: 'etiquette' }, matieres_grasses: { v: 0, src: 'etiquette' }, ags: { v: 0, src: 'etiquette' },
      glucides: { v: 10.6, src: 'etiquette' }, sucres: { v: 10.6, src: 'etiquette' }, proteines: { v: 0, src: 'etiquette' }, sel: { v: 0, src: 'etiquette' }, cafeine: { v: 10, src: 'etiquette' } },
    alcoholPct: { missing: 'non_applicable' },
  }
  const zero: Drink = { ...soda, id: 'demo-zero', name: 'Soda zéro (fictif)', traits: ['gazeuse', 'cafeinee', 'edulcoree'], sweeteners: 'Aspartame, acésulfame K (fictif)',
    values: { ...soda.values, energie_kcal: { v: 0.3, src: 'etiquette' }, energie_kj: { v: 1.3, src: 'etiquette' }, glucides: { v: 0, src: 'etiquette' }, sucres: { v: 0, src: 'etiquette' } }, favorite: false }
  const the: Drink = {
    id: 'demo-the', kind: 'the', name: 'Thé vert menthe (fictif)', category: 'the', traits: ['maison', 'cafeinee'], basis: { kind: '100ml' }, fake: true, favorite: true,
    values: { sucres: UNK, cafeine: UNK, energie_kcal: UNK }, status: 'valide',
    recipe: { teaType: 'Thé vert', prep: 'infusion', waterMl: 350, finalMl: 340, steepMin: 3, tempC: 80, confirmedNoAddedSugar: true,
      ingredients: [
        { id: 'i1', name: 'Thé vert', qty: 1, unit: 'sachet', sweetener: 'non', addedSugar: 'non', infused: true },
        { id: 'i2', name: 'Menthe fraîche', qty: 5, unit: 'g', sweetener: 'non', addedSugar: 'non', infused: true },
      ] },
  }
  const day = (h: number, m: number, back = 0) => { const d = new Date(now); d.setDate(d.getDate() - back); d.setHours(h, m, 0, 0); return d.toISOString() }
  const I = (drinkId: string, ml: number, at: string, containerId?: string): Intake => ({ id: uid(), drinkId, ml, at, containerId, additions: [], fake: true })
  const intakes: Intake[] = [
    I('g-eau', 250, day(7, 30), 'c-verre'), I('g-cafe', 240, day(8, 15), 'c-tasse'), I('g-eau', 500, day(11, 0), 'c-gourde'), I('demo-the', 340, day(13, 10)),
  ]
  for (let b = 1; b <= 6; b++) {
    intakes.push(I('g-eau', 250 + 250 * (b % 3), day(9, 0, b), 'c-verre'), I('g-cafe', 120 * (1 + (b % 2)), day(8, 0, b), 'c-tasse'))
    if (b % 2) intakes.push(I('demo-soda', 330, day(16, 0, b), 'c-bouteille'))
    if (b % 3 === 0) intakes.push(I('demo-the', 340, day(15, 0, b)))
  }
  const session = { id: 'demo-sport', sport: 'Course à pied (fictif)', start: day(17, 0), durationMin: 50, intensity: 'moderee' as const, weightBeforeKg: 72.4, weightAfterKg: 71.6 }
  intakes.push(I('g-eau', 500, day(18, 5), 'c-gourde'))
  return { ...s, drinks: [...s.drinks.filter((d) => !d.fake), soda, zero, the], intakes: [...s.intakes.filter((i) => !i.fake), ...intakes], sessions: [...(s.sessions ?? []).filter((x) => x.id !== 'demo-sport'), session] }
}

export const removeDemo = (s: State): State => ({ ...s, drinks: s.drinks.filter((d) => !d.fake), intakes: s.intakes.filter((i) => !i.fake), sessions: (s.sessions ?? []).filter((x) => x.id !== 'demo-sport') })
