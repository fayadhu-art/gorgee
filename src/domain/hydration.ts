import { Intake, Profile, Session } from './types'

export interface Reference {
  id: string
  version: string
  title: string
  status: 'demonstration' | 'a_valider' | 'validee' | 'desactivee'
  source: { name: string; url: string }
  verifiedAt: string
  scope: string
  limits: string
}

/** Apports adéquats en eau totale (boissons + aliments), adultes. Vérifié sur l'extrait EFSA le 14/11/2026. */
export const EFSA_WATER: Reference = {
  id: 'EFSA-EAU-ADULTE', version: '2010', title: 'Apport adéquat en eau totale, adultes',
  status: 'a_valider',
  source: { name: 'EFSA, Scientific Opinion on Dietary Reference Values for water (2010)', url: 'https://efsa.onlinelibrary.wiley.com/doi/10.2903/j.efsa.2010.1459' },
  verifiedAt: '2026-11-14',
  scope: 'Adultes, en conditions de température et d’activité modérées. Femmes : 2,0 L par jour. Hommes : 2,5 L par jour.',
  limits: 'Eau totale : boissons et eau des aliments. Le journal ne suit que les boissons, la comparaison est donc partielle. Le poids n’entre pas dans ce repère. Grossesse, allaitement, enfants et adolescents : non couverts par l’appli pour l’instant.',
}

/** Réhydratation après l'effort selon la perte de poids. Vérifié sur l'extrait DGE le 14/11/2026. */
export const DGE_REHYDRATION: Reference = {
  id: 'DGE-REHYDRATATION', version: '2020', title: 'Boire après l’effort selon le poids perdu',
  status: 'a_valider',
  source: { name: 'Société allemande de nutrition (DGE), groupe Nutrition du sport : Fluid Replacement in Sports (2020)', url: 'https://www.germanjournalsportsmedicine.com/fileadmin/content/archiv2020/Heft_7-8-9/DtschZSportmed_Position_Stand_Mosler_Fluid_Replacement_in_Sports_2020-7-8-9.pdf' },
  verifiedAt: '2026-11-14',
  scope: 'Environ 1,5 L de boisson par kg de poids perdu pendant la séance, à boire après l’effort.',
  limits: 'Nécessite une pesée avant et après la séance, dans les mêmes conditions. Sans pesée, aucune quantité n’est calculée. Boire nettement plus que ce qui a été perdu n’est pas recommandé.',
}

export type WaterRef = { ok: true; litres: number } | { ok: false; reason: string }

export function waterReference(p: Profile): WaterRef {
  if (!p.ageRange) return { ok: false, reason: 'Indique ta tranche d’âge dans le profil.' }
  if (p.ageRange === 'moins_18') return { ok: false, reason: 'Repère non intégré pour les moins de 18 ans.' }
  if (p.pregnancy === 'oui' || p.breastfeeding === 'oui') return { ok: false, reason: 'Repère non intégré pour la grossesse et l’allaitement.' }
  if (!p.sex) return { ok: false, reason: 'Le repère EFSA diffère entre femmes et hommes : indique-le dans le profil.' }
  return { ok: true, litres: p.sex === 'femme' ? 2.0 : 2.5 }
}

/** Fenêtre de comparaison après la séance, choisie par l'appli (pas issue de la source). */
export const AFTER_WINDOW_H = 6

export type SessionNeed =
  | { ok: true; lossKg: number; targetMl: number; drankMl: number; windowEnd: string }
  | { ok: false; reason: string; drankMl: number; windowEnd: string }

export function sessionNeed(s: Session, intakes: Intake[]): SessionNeed {
  const end = new Date(new Date(s.start).getTime() + s.durationMin * 60000)
  const windowEnd = new Date(end.getTime() + AFTER_WINDOW_H * 3600000)
  const drankMl = intakes.filter((i) => { const t = new Date(i.at).getTime(); return t >= end.getTime() && t <= windowEnd.getTime() }).reduce((a, i) => a + i.ml, 0)
  const we = windowEnd.toISOString()
  if (s.weightBeforeKg === undefined || s.weightAfterKg === undefined) return { ok: false, reason: 'Pèse-toi avant et après la séance pour obtenir une quantité.', drankMl, windowEnd: we }
  const lossKg = s.weightBeforeKg - s.weightAfterKg
  if (lossKg <= 0) return { ok: false, reason: 'Aucune perte de poids mesurée : pas de quantité à compenser selon ce repère.', drankMl, windowEnd: we }
  if (lossKg > 5) return { ok: false, reason: 'Écart de plus de 5 kg : vérifie les pesées.', drankMl, windowEnd: we }
  return { ok: true, lossKg, targetMl: lossKg * 1500, drankMl, windowEnd: we }
}

/** Part de l'eau totale apportée par les boissons dans une alimentation moyenne : 80 % (Commission européenne, portail Knowledge4Policy, d'après l'EFSA). */
export const DRINK_SHARE = 0.8

export type DayWater =
  | { ok: true; drinksTargetMl: number; sportMl: number; drankMl: number; remainingMl: number }
  | { ok: false; reason: string }

/** Ce qu'il reste à boire dans la journée : repère boissons (eau totale × 80 %) + compensation des séances pesées, moins les boissons enregistrées. */
export function dayWater(p: Profile, drankMl: number, sessionsOfDay: Session[], intakes: Intake[]): DayWater {
  const ref = waterReference(p)
  if (!ref.ok) return ref
  const drinksTargetMl = Math.round(ref.litres * 1000 * DRINK_SHARE)
  const sportMl = sessionsOfDay.reduce((a, s) => { const n = sessionNeed(s, intakes); return a + (n.ok ? Math.round(n.targetMl) : 0) }, 0)
  return { ok: true, drinksTargetMl, sportMl, drankMl, remainingMl: Math.max(0, drinksTargetMl + sportMl - drankMl) }
}
