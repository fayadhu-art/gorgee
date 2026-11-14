import { Scan } from './Scan'
import { useEffect, useRef, useState } from 'react'
import { dayKey } from '../domain/calc'
import { evaluate, syncNotifications, dayScope } from '../domain/rules'
import { emptyState, load, save } from '../domain/store'
import { Intake, State } from '../domain/types'
import { AppCtx, Ctx, Icon, Screen } from './parts'
import { Today, Advice } from './Today'
import { Choose, IntakeForm } from './Intake'
import { ProductForm, DrinkDetail, Library } from './Product'
import { RecipeForm } from './Recipe'
import { History, RuleDetail } from './History'
import { Settings, Welcome, profileComplete } from './Settings'
import { SportForm } from './Sport'

/** Recalcule les clés de notification du jour concerné et renvoie celles à signaler. */
export function withNotifications(s: State, day: string, tz?: string) {
  const a = evaluate(s, day, undefined, undefined, tz)
  // Les règles « par prise » sont évaluées prise par prise.
  const perIntake = a.stats.intakes.flatMap((i) => evaluate(s, day, i, undefined, tz).findings.filter((f) => f.rule.period === 'prise'))
  const firing = [...a.findings, ...perIntake]
  const r = syncNotifications(s.notified, firing, dayScope(day, a.stats.intakes.map((i) => i.id)))
  return { s: { ...s, notified: r.keys }, toNotify: r.toNotify }
}

export default function App() {
  const [st, setSt] = useState<State | null>(null)
  const [stack, setStack] = useState<Screen[]>([{ s: 'today' }])
  const [msg, setMsg] = useState('')
  const timer = useRef<number>()

  useEffect(() => { load().then((s) => setSt(s ?? emptyState())) }, [])
  useEffect(() => { if (st) save(st) }, [st])
  useEffect(() => { window.scrollTo(0, 0) }, [stack])

  if (!st) return <div className="app"><p className="empty">Chargement…</p></div>

  const toast = (t: string) => { setMsg(t); clearTimeout(timer.current); timer.current = window.setTimeout(() => setMsg(''), 3500) }
  const notify = (titles: string[]) => {
    if (!titles.length || !st.profile.notifications) return
    try {
      if ('Notification' in window && Notification.permission === 'granted') titles.forEach((t) => new Notification('Gorgée', { body: t }))
      else toast(titles[0])
    } catch { toast(titles[0]) }
  }
  const set: Ctx['set'] = (f) => setSt((s) => (s ? f(s) : s))
  const ctx: Ctx = {
    st, set, toast,
    go: (x) => setStack((k) => (x.s === 'today' || x.s === 'library' || x.s === 'history' || x.s === 'settings' ? [x] : [...k, x])),
    back: () => setStack((k) => (k.length > 1 ? k.slice(0, -1) : k)),
    addIntake: (i: Intake) => {
      const day = dayKey(i.at)
      const others = st.intakes.filter((x) => x.id !== i.id)
      const prevDay = st.intakes.find((x) => x.id === i.id)
      let next: State = { ...st, intakes: [...others, i] }
      if (prevDay && dayKey(prevDay.at) !== day) next = withNotifications(next, dayKey(prevDay.at)).s
      const r = withNotifications(next, day)
      setSt(r.s)
      notify(r.toNotify.map((f) => f.rule.title))
    },
  }
  const cur = stack[stack.length - 1]
  const view = !st.onboarded || !profileComplete(st.profile) ? <Welcome /> : (() => {
    switch (cur.s) {
      case 'today': return <Today day={cur.day} />
      case 'choose': return <Choose cat={cur.cat} />
      case 'intake': return <IntakeForm drinkId={cur.drinkId} intakeId={cur.intakeId} />
      case 'advice': return <Advice intakeId={cur.intakeId} />
      case 'product': return <ProductForm drinkId={cur.drinkId} cat={cur.cat} name={cur.name} draft={cur.draft} scanned={cur.scanned} scanErr={cur.scanErr} />
      case 'scan': return <Scan name={cur.name} cat={cur.cat} />
      case 'tea': return <RecipeForm drinkId={cur.drinkId} tea teaKind={cur.kind} initialName={cur.name} />
      case 'recipe': return <RecipeForm drinkId={cur.drinkId} />
      case 'library': return <Library />
      case 'drink': return <DrinkDetail drinkId={cur.drinkId} />
      case 'history': return <History />
      case 'rule': return <RuleDetail ruleId={cur.ruleId} />
      case 'settings': return <Settings />
      case 'welcome': return <Welcome />
      case 'sport': return <SportForm id={cur.id} />
    }
  })()
  const tabs: [Screen['s'], string, string][] = [['today', 'Aujourd’hui', 'home'], ['history', 'Historique', 'chart'], ['library', 'Mes boissons', 'list'], ['settings', 'Profil', 'user']]
  const showNav = st.onboarded && profileComplete(st.profile) && stack.length === 1
  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        {view}
        {showNav && (
          <div className="navwrap">
            <nav className="nav" aria-label="Navigation principale">
              {tabs.map(([k, l, i]) => (
                <button key={k} aria-current={cur.s === k ? 'page' : undefined} onClick={() => ctx.go({ s: k } as Screen)}><Icon n={i} />{l}</button>
              ))}
            </nav>
            <button className="addbtn" aria-label="Ajouter une boisson" onClick={() => ctx.go({ s: 'choose' })}><Icon n="plus" /></button>
          </div>
        )}
        {msg && <div className="toast" role="status" aria-live="polite">{msg}</div>}
      </div>
    </AppCtx.Provider>
  )
}
