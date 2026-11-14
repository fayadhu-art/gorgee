import { parseNutrition, pickName } from './ocr'

const LABEL = `Informations nutritionnelles
Pour 100 ml
Énergie 180 kJ / 42 kcal
Matières grasses 0 g
dont acides gras saturés 0 g
Glucides 10,6 g
dont sucres 10,5 g
Protéines <0,5 g
Sel 0,02 g
Bouteille 50 cl`

test('lit un tableau nutritionnel français', () => {
  const p = parseNutrition(LABEL)
  expect(p.values).toEqual({ energie_kj: 180, energie_kcal: 42, matieres_grasses: 0, ags: 0, glucides: 10.6, sucres: 10.5, sel: 0.02 })
  expect(p.values.proteines).toBeUndefined() // « < 0,5 g » laissé à saisir
  expect(p.basis).toEqual({ kind: '100ml' })
  expect(p.capacityMl).toBe(500)
})

test('une valeur illisible ou absente n’est jamais mise à zéro', () => {
  const p = parseNutrition('Pour 100 ml\nGlucides ?? g\nSucres 4,2 g')
  expect(p.values.glucides).toBeUndefined()
  expect(p.values.matieres_grasses).toBeUndefined()
  expect(p.values.sucres).toBe(4.2)
})

test('confusions OCR et caféine', () => {
  const p = parseNutrition('Energie 2O kcal\nCaféine 32 mg / 100 ml')
  expect(p.values.energie_kcal).toBe(20)
  expect(p.values.cafeine).toBe(32)
})

test('base par portion', () => {
  expect(parseNutrition('Par portion de 250 ml\nSucres 27 g').basis).toEqual({ kind: 'portion', portionMl: 250 })
})

test('nom : la ligne la plus grande et lisible', () => {
  expect(pickName([
    { text: 'Boisson gazeuse', height: 20, confidence: 90 },
    { text: 'ORANGINA', height: 80, confidence: 88 },
    { text: '@@##', height: 120, confidence: 30 },
  ])).toBe('ORANGINA')
  expect(pickName([{ text: 'Limonade', height: 88, confidence: 91 }, { text: '- Soleil', height: 125, confidence: 36 }, { text: '33 cl', height: 30, confidence: 90 }])).toBe('Limonade Soleil')
  expect(pickName([{ text: 'x', height: 50, confidence: 90 }])).toBeUndefined()
})

test('photo floue : valeur impossible écartée plutôt que fausse', () => {
  const p = parseNutrition('Pour 100 mi\nEnergie 180 kJ / 42 kcal\nGlucides 106g\ndoteues Déc\nSel 0,02g')
  expect(p.basis).toEqual({ kind: '100ml' })
  expect(p.values.glucides).toBeUndefined()
  expect(p.values.sucres).toBeUndefined()
  expect(p.values.sel).toBe(0.02)
})
