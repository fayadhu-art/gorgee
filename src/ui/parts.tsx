import { createContext, ReactNode, useContext } from 'react'
import { Drink, Intake, Missing, Source, State, Val, CATEGORIES, Category } from '../domain/types'
import type { AdviceState } from '../domain/rules'

const P: Record<string, string> = {
  plus: 'M12 5v14M5 12h14', close: 'M18 6 6 18M6 6l12 12', back: 'm15 18-6-6 6-6', next: 'm9 18 6-6-6-6',
  home: 'M3 12 12 4l9 8M5 10v10h14V10', chart: 'M4 19V9M10 19V5M16 19v-7M22 19H2', list: 'M4 5h16v14H4zM8 9h8M8 13h5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 8h.01M11 12h1v4h1', part: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v6M12 16.5h.01',
  warn: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01',
  stop: 'M8 3h8l5 5v8l-5 5H8l-5-5V8zM12 8v5M12 16.5h.01', check: 'M20 6 9 17l-5-5', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Z', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z',
  doc: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h3', box: 'M4 4h16v16H4zM12 8v8M8 12h8', camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  glass: 'M7 3h10l-1 18H8L7 3Z', bubbles: 'M7 3h10l-1 18H8L7 3ZM11 12h.01M13 15h.01M12 9h.01', fruit: 'M12 20a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM12 6V3',
  can: 'M9 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 8h10', cup: 'M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8ZM17 10h1.5a2.5 2.5 0 0 1 0 5H17',
  tea: 'M5 10h12v4a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5v-4ZM10 10V5l3 2', leaf: 'M12 20c-5-2-7-6-6-12 4 0 7 3 6 12ZM12 20c5-2 7-6 6-12-4 0-7 3-6 12Z',
  bolt: 'M13 2 5 14h6l-1 8 8-12h-6l1-8Z', milk: 'M8 3h8v4l2 3v11H6V10l2-3V3Z', pot: 'M4 10h16l-2 10H6L4 10ZM9 10V6h6v4', download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
}
export const Icon = ({ n, label }: { n: string; label?: string }) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden={label ? undefined : true} aria-label={label} role={label ? 'img' : undefined}><path d={P[n]} /></svg>
)

export const CAT_ICON: Record<Category, string> = {
  eau_plate: 'glass', eau_gazeuse: 'bubbles', jus: 'fruit', soda: 'can', cafe: 'cup', the: 'tea', infusion: 'leaf', energisante: 'bolt', lait_vegetale: 'milk', maison: 'pot',
}
export const CAT_COLOR: Record<Category, string> = {
  eau_plate: 'var(--c1)', eau_gazeuse: 'var(--c2)', jus: 'var(--c3)', soda: 'var(--c4)', cafe: 'var(--c5)', the: 'var(--c6)', infusion: 'var(--c7)', energisante: 'var(--c8)', lait_vegetale: 'var(--c9)', maison: 'var(--c10)',
}
export const catLabel = (c: Category) => CATEGORIES[c]

export type Screen =
  | { s: 'today'; day?: string } | { s: 'choose'; cat?: Category } | { s: 'intake'; drinkId: string; intakeId?: string }
  | { s: 'advice'; intakeId: string } | { s: 'product'; drinkId?: string; cat?: Category; name?: string; draft?: Drink; scanned?: number } | { s: 'scan'; name?: string; cat?: Category } | { s: 'tea'; drinkId?: string }
  | { s: 'recipe'; drinkId?: string } | { s: 'library' } | { s: 'drink'; drinkId: string } | { s: 'history' }
  | { s: 'rule'; ruleId: string } | { s: 'settings' } | { s: 'welcome' } | { s: 'sport'; id?: string }

export interface Ctx {
  st: State
  set: (f: (s: State) => State) => void
  go: (x: Screen) => void
  back: () => void
  toast: (t: string) => void
  addIntake: (i: Intake) => void
  tz?: string
}
export const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = () => useContext(AppCtx)

export const STATE_META: Record<AdviceState, { icon: string; title: string }> = {
  information: { icon: 'info', title: 'Information' },
  incomplete: { icon: 'part', title: 'Analyse incomplète' },
  vigilance: { icon: 'warn', title: 'Vigilance' },
  depassement: { icon: 'stop', title: 'Dépassement d’un repère' },
  profil: { icon: 'user', title: 'Précaution liée au profil' },
}

export function StateBox({ k, title, children }: { k: AdviceState; title?: string; children: ReactNode }) {
  const m = STATE_META[k]
  return (
    <div className={`state s-${k}`} role="status">
      <Icon n={m.icon} />
      <div><h4>{title ?? m.title}</h4>{children}</div>
    </div>
  )
}

export function Bar({ title, sub, onBack, close, right, large }: { title: string; sub?: string; onBack?: () => void; close?: boolean; right?: ReactNode; large?: boolean }) {
  return (
    <header className={large ? 'bar large' : 'bar'}>
      {onBack ? <button className="ib" onClick={onBack} aria-label={close ? 'Fermer' : 'Retour'}><Icon n={close ? 'close' : 'back'} /></button> : !large && <span style={{ width: 44, flex: 'none' }} />}
      <h1>{title}{sub && <small>{sub}</small>}</h1>
      {right ?? (!large && <span style={{ width: 44, flex: 'none' }} />)}
    </header>
  )
}

export const hasFake = (s: State) => s.intakes.some((i) => i.fake) || s.drinks.some((d) => d.fake) || !!s.sessions?.some((x) => x.id === 'demo-sport')
export const Ribbon = ({ show, extra }: { show: boolean; extra?: string }) => show ? <div className="ribbon">Données fictives présentes{extra ? ` · ${extra}` : ''}</div> : null

export const MISSING_OPTS: { k: Missing; label: string }[] = [
  { k: 'non_indique', label: 'Non indiqué sur l’étiquette' },
  { k: 'inconnu', label: 'Inconnu' },
  { k: 'non_applicable', label: 'Non applicable' },
]

/** Saisie d'une valeur : un nombre, ou un statut explicite. Jamais de zéro implicite. */
export function ValInput({ id, label, unit, value, onChange, src }: { id: string; label: string; unit: string; value?: Val; onChange: (v?: Val) => void; src: Source }) {
  const known = value && 'v' in value
  const mode = !value ? '' : known ? 'v' : value.missing
  return (
    <div className="valrow">
      <label className="nm" htmlFor={id}>{label} <span className="help">({unit})</span></label>
      <div className="ctl">
        <input id={id} className="inp num" inputMode="decimal" aria-label={`${label} en ${unit}`} placeholder="Valeur"
          value={known ? String(value.v).replace('.', ',') : ''}
          onChange={(e) => {
            const t = e.target.value.replace(',', '.').trim()
            if (t === '') return onChange(undefined)
            const n = Number(t)
            if (Number.isFinite(n) && n >= 0) onChange({ v: n, src: known ? (value as { src: Source }).src : src })
          }} />
        <select className="inp" aria-label={`Statut de ${label}`} value={mode}
          onChange={(e) => { const m = e.target.value; if (m === '') onChange(undefined); else if (m !== 'v') onChange({ missing: m as Missing }) }}>
          {known ? <option value="v">Valeur saisie</option> : <option value="">À renseigner</option>}
          {MISSING_OPTS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
        </select>
      </div>
    </div>
  )
}

export const drinkSub = (d: Drink) => [d.brand, catLabel(d.category), d.capacityMl ? `${d.capacityMl} ml` : ''].filter(Boolean).join(' · ')
