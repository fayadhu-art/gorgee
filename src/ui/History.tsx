import { useState } from 'react'
import { dayKey, dayStats, fmt, lastDays } from '../domain/calc'
import { RULES } from '../domain/rules'
import { NUTRIENTS } from '../domain/types'
import { Bar, hasFake, Icon, Ribbon, StateBox, useApp } from './parts'

const short = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '')
const long = (d: string) => { const t = new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return t[0].toUpperCase() + t.slice(1) }

const METRICS = { volume: 'Volume', sucres: 'Sucres', cafeine: 'Caféine', energie_kcal: 'Énergie' } as const
type Metric = keyof typeof METRICS

export function History() {
  const { st, go } = useApp()
  const [span, setSpan] = useState<7 | 30>(7)
  const today = dayKey(new Date().toISOString())
  const days = lastDays(today, span)
  const stats = days.map((d) => dayStats(st.intakes, st.drinks, d))
  const [metric, setMetric] = useState<Metric>('volume')
  const val = (s: (typeof stats)[number]) => (metric === 'volume' ? s.volume : s.totals[metric].v)
  const unit = metric === 'volume' ? 'ml' : NUTRIENTS[metric].unit
  const max = Math.max(1, ...stats.map(val))
  const active = stats.filter((s) => s.count)
  const avg = active.length ? active.reduce((a, s) => a + val(s), 0) / active.length : 0
  const partialDays = metric === 'volume' ? 0 : active.filter((s) => s.totals[metric].unknown > 0).length
  const sum = (n: 'sucres' | 'cafeine' | 'energie_kcal') => stats.reduce((a, s) => ({ v: a.v + s.totals[n].v, u: a.u + s.totals[n].unknown }), { v: 0, u: 0 })
  return (
    <>
      <Ribbon show={hasFake(st)} />
      <header className="bar large"><h1>Historique</h1></header>
      <main className="main">
        <div className="chips" role="group" aria-label="Période">
          <button className="chip" aria-pressed={span === 7} onClick={() => setSpan(7)}>7 jours</button>
          <button className="chip" aria-pressed={span === 30} onClick={() => setSpan(30)}>30 jours</button>
        </div>
        <section className="card hero-card">
          <div className="seg" role="group" aria-label="Mesure affichée">
            {(Object.keys(METRICS) as Metric[]).map((m) => <button key={m} aria-pressed={metric === m} onClick={() => setMetric(m)}>{METRICS[m]}</button>)}
          </div>
          <span className="lbl">{METRICS[metric]} par jour</span>
          <div><span className="big num">{fmt(avg, 0)}</span><span className="unit">{unit} en moyenne</span></div>
          <span className="help">Moyenne sur {active.length} jour{active.length > 1 ? 's' : ''} avec au moins une boisson.{partialDays ? ` ${partialDays} jour${partialDays > 1 ? 's' : ''} avec des fiches incomplètes : valeur minimum.` : ''}</span>
          <div className="bars" role="img" aria-label={stats.map((s) => `${long(s.day)} : ${fmt(val(s), 0)} ${unit}`).join(', ')} style={span === 30 ? { gap: 2 } : undefined}>
            {stats.map((s) => (
              <button key={s.day} className="b" aria-current={s.day === today ? 'date' : undefined} onClick={() => go({ s: 'today', day: s.day === today ? undefined : s.day })} aria-label={`${long(s.day)}, ${fmt(val(s), 0)} ${unit}`}>
                <i style={{ height: `${(val(s) / max) * 100}%` }} />
                {span === 7 && <small>{short(s.day)}</small>}
              </button>
            ))}
          </div>
        </section>
        <div className="sect">Cumuls sur {span} jours</div>
        <section className="list">
          {(['sucres', 'cafeine', 'energie_kcal'] as const).map((n) => { const t = sum(n); return (
            <div className="row" key={n} style={{ cursor: 'default' }}>
              <span className="m"><b>{n === 'sucres' ? 'Sucres totaux connus' : `${NUTRIENTS[n].label} connue`}</b><small>{t.u ? `${t.u} boisson${t.u > 1 ? 's' : ''} sans valeur : total partiel` : 'Toutes les valeurs connues'}</small></span>
              <span className="q num" style={{ color: 'var(--ink)', fontWeight: 600 }}>{fmt(t.v, 0)} {NUTRIENTS[n].unit}</span>
            </div>
          ) })}
        </section>
        <div className="sect">Jours</div>
        <section className="list">
          {[...stats].reverse().filter((s) => s.count).map((s) => (
            <button key={s.day} className="row" onClick={() => go({ s: 'today', day: s.day === today ? undefined : s.day })}>
              <span className="m"><b>{long(s.day)}</b><small>{s.count} boisson{s.count > 1 ? 's' : ''}</small></span>
              <span className="q num">{fmt(s.volume, 0)} ml</span><span className="chev"><Icon n="next" /></span>
            </button>
          ))}
          {!active.length && <div className="empty"><Icon n="chart" /><p>Pas encore d’historique sur cette période.</p></div>}
        </section>
        <p className="note"><Icon n="info" />Volumes de boissons saisies. Ce n’est pas une mesure de l’hydratation.</p>
      </main>
    </>
  )
}

const KIND = { objectif: 'Objectif', limitation: 'Repère de limitation', niveau_sans_probleme_de_securite: 'Niveau jugé sans problème de sécurité' } as const

export function RuleDetail({ ruleId }: { ruleId: string }) {
  const { back } = useApp()
  const r = RULES.find((x) => x.id === ruleId)
  if (!r) return <><Bar title="Repère" onBack={back} /><main className="main"><p>Repère introuvable.</p></main></>
  const u = NUTRIENTS[r.substance].unit
  return (
    <>
      <Bar title="Détail du repère" onBack={back} />
      <main className="main">
        <h2 style={{ fontSize: 26, fontWeight: 700, padding: '0 4px' }}>{r.title}</h2>
        <section className="list">
          {[
            ['Type', KIND[r.thresholdKind]],
            ['Seuil', `${r.trigger.op === '>' ? 'au-delà de' : 'à partir de'} ${fmt(r.trigger.value)} ${u}`],
            ['Période', r.period === 'jour' ? 'Journée civile (minuit à minuit)' : 'Une seule prise'],
            ['Concerne', r.population.label],
          ].map(([k, v]) => <div className="row" key={k} style={{ cursor: 'default' }}><span className="m"><small>{k}</small><b>{v}</b></span></div>)}
        </section>
        <StateBox k="incomplete" title="Limites"><p>{r.limits}</p></StateBox>
        <p className="note"><Icon n="info" />Repère d’un organisme officiel, non validé par un professionnel de santé pour ton cas. Il informe et ne pose pas de diagnostic.</p>
      </main>
    </>
  )
}
