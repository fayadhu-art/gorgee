import { useState } from 'react'
import { dayKey, fmt, fmtVal, intakeValue, lastDays, per100, SHOWN, Total } from '../domain/calc'
import { dayWater } from '../domain/hydration'
import { applies, evaluate, Finding, isActive, RULES } from '../domain/rules'
import { uid } from '../domain/store'
import { CATEGORIES, Category, Drink, isKnown, nlabel, Nutrient, NUTRIENTS, State } from '../domain/types'
import { SessionsCard } from './Sport'
import { Bar, CAT_COLOR, CAT_ICON, catLabel, hasFake, Icon, Ribbon, StateBox, useApp } from './parts'

const today = () => dayKey(new Date().toISOString())
const dayLabel = (d: string) => { const t = new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return t[0].toUpperCase() + t.slice(1) }
const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

const dig = (n: Nutrient) => (n === 'energie_kcal' || n === 'cafeine' ? 0 : 1)
const totalTxt = (t: Total, n: Nutrient) => (t.known ? `${t.unknown ? '≥ ' : t.upper ? '≤ ' : ''}${fmt(t.v, dig(n))} ${NUTRIENTS[n].unit}` : t.unknown ? 'Inconnu' : '—')

/** Repère journalier applicable au profil pour une substance (seuil du moteur de règles), sinon rien. */
const dayLimit = (n: Nutrient, st: State) => { const v = RULES.filter((r) => isActive(r) && r.period === 'jour' && r.substance === n && r.level !== 'vigilance' && applies(r, st.profile)).map((r) => r.trigger.value); return v.length ? Math.min(...v) : undefined }

function Left({ label, t, limit, n, onOver }: { label: string; t: Total; limit: number; n: Nutrient; onOver: string }) {
  const u = NUTRIENTS[n].unit, over = t.v > limit
  return (
    <div className="left">
      <div className="lr"><b>{label}</b><span className={'lv num' + (over ? ' over' : '')}>{over ? onOver : `encore ${fmt(limit - t.v, 0)} ${u}`}</span></div>
      <div className={'meter sm' + (over ? ' over' : '')}><i style={{ width: `${Math.min(1, t.v / limit) * 100}%` }} /></div>
      <small className="num">{t.unknown ? 'au moins ' : ''}{fmt(t.v, 0)} {u} sur {fmt(limit, 0)} {u}</small>
    </div>
  )
}

export function Today({ day: d0 }: { day?: string }) {
  const { st, go, addIntake, toast } = useApp()
  const [detail, setDetail] = useState(false)
  const t = today()
  const day = d0 ?? t
  const a = evaluate(st, day)
  const { stats } = a
  const byId = new Map(st.drinks.map((d) => [d.id, d]))
  const prev = lastDays(day, 2)[0]
  const next = lastDays(day, 1)[0] === t ? null : new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + 1)).toISOString().slice(0, 10)
  const sessions = (st.sessions ?? []).filter((s) => dayKey(s.start) === day)
  const w = dayWater(st.profile, stats.volume, sessions, st.intakes)
  const target = w.ok ? w.drinksTargetMl + w.sportMl : 0
  // Raccourcis : eau, favoris, puis boissons les plus saisies, avec la dernière quantité.
  const counts = new Map<string, number>()
  st.intakes.forEach((i) => counts.set(i.drinkId, (counts.get(i.drinkId) ?? 0) + 1))
  const quick = st.drinks.filter((d) => d.status !== 'brouillon' && (d.favorite || counts.has(d.id) || d.id === 'g-eau'))
    .sort((x, y) => Number(y.id === 'g-eau') - Number(x.id === 'g-eau') || Number(!!y.favorite) - Number(!!x.favorite) || (counts.get(y.id) ?? 0) - (counts.get(x.id) ?? 0)).slice(0, 6)
    .map((d) => { const last = st.intakes.filter((i) => i.drinkId === d.id).sort((x, y) => y.at.localeCompare(x.at))[0]; return { d, ml: last?.ml ?? d.capacityMl ?? 250, containerId: last?.containerId } })
  const add = (q: (typeof quick)[number]) => {
    const at = day === t ? new Date() : new Date(day + 'T12:00:00')
    addIntake({ id: uid(), drinkId: q.d.id, ml: q.ml, at: at.toISOString(), containerId: q.containerId, additions: [] })
    toast(`${q.d.name} : ${q.ml} ml ajoutés`)
  }
  // Fiches bues ce jour-là dont il manque des valeurs : l'avis est alors partiel.
  const incomplete = [...new Set(stats.intakes.map((i) => byId.get(i.drinkId)))].filter((d): d is Drink => !!d && SHOWN.some((n) => { const x = per100(d, n); return !isKnown(x) && x.missing !== 'non_applicable' && x.missing !== 'non_indique' }))
  const editDrink = (d: Drink) => go(d.kind === 'the' ? { s: 'tea', drinkId: d.id } : d.kind === 'recette' ? { s: 'recipe', drinkId: d.id } : { s: 'product', drinkId: d.id, step: 1 })
  // Avis du jour : repères de la journée + repères par prise, puis approche d'un repère (75 % ou plus).
  const found = new Map<string, Finding>()
  ;[...a.findings, ...stats.intakes.flatMap((i) => evaluate(st, day, i).findings.filter((f) => f.rule.period === 'prise'))].forEach((f) => found.set(f.rule.id, f))
  const findings = [...found.values()]
  const limits = (['cafeine', 'sucres'] as const).map((n) => ({ n, limit: dayLimit(n, st), t: stats.totals[n] })).filter((x): x is { n: 'cafeine' | 'sucres'; limit: number; t: Total } => !!x.limit)
  const near = limits.filter((x) => x.t.v >= 0.75 * x.limit && x.t.v <= x.limit)
  const level = !stats.count ? 'none' : findings.some((f) => f.rule.level !== 'vigilance') ? 'over' : findings.length || near.length ? 'att' : 'ok'
  const V = { none: ['Rien de noté', 'glass'], ok: ['Ça va', 'check'], att: ['Attention', 'info'], over: ['Trop', 'info'] }[level]
  return (
    <>
      <Ribbon show={hasFake(st)} />
      <Bar large title={day === t ? 'Aujourd’hui' : 'Journée'} sub={dayLabel(day)} right={<div style={{ display: 'flex', gap: 8 }}>
        <button className="ib" aria-label="Jour précédent" onClick={() => go({ s: 'today', day: prev })}><Icon n="back" /></button>
        <button className="ib" aria-label="Jour suivant" disabled={!next} onClick={() => next && go({ s: 'today', day: next === t ? undefined : next })}><Icon n="next" /></button>
      </div>} />
      <main className="main">
        <section className={'verdict v-' + level} aria-live="polite" aria-label="Avis du jour">
          <div className="vh"><span className="vi"><Icon n={V[1]} /></span><h2>{V[0]}</h2></div>
          {level === 'none' && <p>Ajoute ce que tu bois pour avoir un avis.</p>}
          {level === 'ok' && <p>Aucun dépassement détecté parmi les règles évaluables avec les informations disponibles.</p>}
          {findings.map((f) => { const u = NUTRIENTS[f.rule.substance].unit; return (
            <button key={f.key} className="vf" onClick={() => go({ s: 'rule', ruleId: f.rule.id })}>
              <b>{f.rule.title}</b><span>{f.partial ? 'Au moins ' : ''}{fmt(f.value, 0)} {u} pour un repère de {fmt(f.rule.trigger.value, 0)} {u}{f.rule.period === 'prise' ? ' en une prise' : ' par jour'}.</span><Icon n="next" />
            </button>
          ) })}
          {level !== 'over' && near.map((x) => <p key={x.n}>Tu es à {fmt((x.t.v / x.limit) * 100, 0)} % du repère de {nlabel(x.n).toLowerCase()} du jour.</p>)}
          {incomplete.length > 0 && <p className="vp">Avis partiel : il manque des valeurs pour {incomplete.length} boisson{incomplete.length > 1 ? 's' : ''}.</p>}
        </section>

        {(stats.count > 0 || w.ok) && <section className="card" aria-labelledby="enc">
          <span className="lbl" id="enc">Ce que tu peux encore boire</span>
          {w.ok ? <div className="left">
            <div className="lr"><b>Eau et boissons</b><span className="lv num">{w.remainingMl > 0 ? `encore ${fmt(w.remainingMl / 1000, 2)} L à boire` : 'repère atteint'}</span></div>
            <div className="meter sm"><i style={{ width: `${Math.min(1, stats.volume / target) * 100}%` }} /></div>
            <small className="num">{fmt(stats.volume / 1000, 2)} L bus sur {fmt(target / 1000, 1)} L{w.sportMl ? `, dont ${fmt(w.sportMl / 1000, 1)} L pour le sport` : ''}</small>
          </div> : <button className="a" onClick={() => go({ s: 'settings' })}>{w.reason}</button>}
          {limits.map((x) => <Left key={x.n} n={x.n} t={x.t} limit={x.limit} label={x.n === 'cafeine' ? 'Caféine' : 'Sucres'} onOver="repère dépassé" />)}
        </section>}

        {incomplete.map((d) => (
          <button className="row solo" key={d.id} onClick={() => editDrink(d)}>
            <span className="ic" style={{ background: '#FF9F0A' }}><Icon n="edit" /></span>
            <span className="m"><b>Compléter {d.name}</b><small>Des valeurs manquent sur sa fiche</small></span>
            <span className="chev"><Icon n="next" /></span>
          </button>
        ))}

        {quick.length > 0 && <div className="field"><span className="sect" style={{ marginBottom: 0 }}>Ajouter en un geste</span>
          <div className="quick">{quick.map((q) => (
            <button key={q.d.id} className="qa" onClick={() => add(q)} aria-label={`Ajouter ${q.d.name}, ${q.ml} ml`}>
              <span className="ic" style={{ background: CAT_COLOR[q.d.category] }}><Icon n={CAT_ICON[q.d.category]} /></span>
              <span className="m"><b>{q.d.name}</b><small className="num">{q.ml} ml</small></span><Icon n="plus" />
            </button>
          ))}</div></div>}

        <div className="sect">Bu {day === t ? 'aujourd’hui' : 'ce jour-là'}{stats.count ? ` · ${fmt(stats.volume / 1000, 2)} L` : ''}</div>
        <section className="list">
          {stats.count === 0 ? (
            <div className="empty"><Icon n="glass" /><p>Aucune boisson enregistrée {day === t ? 'aujourd’hui' : 'ce jour-là'}.</p><button className="btn sm" onClick={() => go({ s: 'choose' })}><Icon n="plus" />Ajouter une boisson</button></div>
          ) : stats.intakes.map((i) => {
            const d = byId.get(i.drinkId)
            const su = d ? intakeValue(d, 'sucres', i.ml) : undefined
            const ca = d ? intakeValue(d, 'cafeine', i.ml) : undefined
            const bits = [isKnown(su) && su.v > 0 ? `${fmt(su.v, 1)} g de sucres` : '', isKnown(ca) && ca.v > 0 ? `${fmt(ca.v, 0)} mg de caféine` : ''].filter(Boolean)
            return (
              <button className="row" key={i.id} onClick={() => go({ s: 'intake', drinkId: i.drinkId, intakeId: i.id })} aria-label={`Modifier : ${d?.name ?? 'boisson supprimée'}, ${i.ml} ml à ${time(i.at)}`}>
                <span className="ic" style={{ background: d ? CAT_COLOR[d.category] : 'var(--c9)' }}><Icon n={d ? CAT_ICON[d.category] : 'glass'} /></span>
                <span className="m"><b>{d?.name ?? 'Boisson supprimée'}{i.fake && <span className="tag t-fake" style={{ marginLeft: 6 }}>fictif</span>}</b>
                  <small>{time(i.at)}{bits.length ? ' · ' + bits.join(' · ') : ''}</small></span>
                <span className="q num"><b>{i.ml}</b> ml</span>
              </button>
            )
          })}
        </section>

        {sessions.length > 0 && <SessionsCard day={day} />}
        <button className="link plain" aria-expanded={detail} onClick={() => setDetail(!detail)}><Icon n={detail ? 'back' : 'next'} />{detail ? 'Masquer le détail' : 'Voir le détail et le sport'}</button>
        {detail && <>
          {stats.count > 0 && <section className="list" aria-label="Apports du jour">
            {SHOWN.map((n) => { const tt = stats.totals[n]; return (
              <div className="row" key={n} style={{ cursor: 'default' }}>
                <span className="m"><b>{nlabel(n)}</b></span>
                <span className="q num" style={{ color: 'var(--ink)' }}><b>{totalTxt(tt, n)}</b></span>
              </div>
            ) })}
          </section>}
          {stats.count > 0 && SHOWN.some((n) => stats.totals[n].unknown > 0) && <p className="note"><Icon n="info" />Le signe ≥ indique un total minimum : des valeurs manquent sur une fiche.</p>}
          {sessions.length === 0 && <SessionsCard day={day} />}
        </>}
        <p className="note"><Icon n="info" />L’avis ne compte que les boissons saisies, pas l’alimentation. Repères officiels, pas un avis médical.</p>
      </main>
    </>
  )
}

export function Advice({ intakeId }: { intakeId: string }) {
  const { st, go, back } = useApp()
  const i = st.intakes.find((x) => x.id === intakeId)
  if (!i) return <><Bar title="Avis" onBack={() => go({ s: 'today' })} close /><main className="main"><p>Cette consommation a été supprimée.</p></main></>
  const day = dayKey(i.at)
  const a = evaluate(st, day, i)
  const d = a.drink
  const rows = SHOWN
  const fake = i.fake || d?.fake
  return (
    <>
      <Ribbon show={!!fake} />
      <Bar title="Avis" sub={d?.name} onBack={() => go({ s: 'today' })} close />
      <main className="main">
        {a.findings.map((f) => (
          <StateBox key={f.key} k={f.rule.level} title={`${STATE_TITLE[f.rule.level]} · ${f.rule.title.toLowerCase()}`}><p>{f.text}</p></StateBox>
        ))}
        {!a.findings.length && (
          <StateBox k="information"><p>Aucun dépassement détecté parmi les règles évaluables avec les informations disponibles.</p></StateBox>
        )}
        <section className="card">
          <span className="lbl">Cette consommation · <span className="num">{i.ml}</span> ml</span>
          <table className="tbl"><tbody>
            {rows.map((n) => <tr key={n}><td>{nlabel(n)}</td><td>{fmtVal(a.values[n], NUTRIENTS[n].unit, dig(n))}</td></tr>)}
            {i.additions.length > 0 && <tr><td className="dim">Ajouts : {i.additions.join(', ')}</td><td className="dim">non comptés</td></tr>}
          </tbody></table>
          <p className="note">Calcul : valeur pour 100 ml × {i.ml} ÷ 100.</p>
        </section>
        <section className="card">
          <span className="lbl">Nouveaux cumuls du jour</span>
          <table className="tbl"><tbody>
            <tr><td>Volume enregistré</td><td>{fmt(a.stats.volume, 0)} ml</td></tr>
            {rows.map((n) => <tr key={n}><td>{nlabel(n)}</td><td>{totalTxt(a.stats.totals[n], n)}</td></tr>)}
          </tbody></table>
        </section>
        {a.missing.length > 0 && (
          <StateBox k="incomplete"><ul>{a.missing.map((m) => <li key={m}>{m}</li>)}</ul><p style={{ marginTop: 4 }}>Les cumuls concernés sont des minimums.</p></StateBox>
        )}
        {a.states.includes('profil') && <p className="help">Une précaution liée à ton profil a été évaluée. Les consignes d’un professionnel de santé priment.</p>}
        {a.findings.map((f) => (
          <div className="src" key={'s' + f.key}>
            <b>{f.rule.title}</b>
            <span>Concerne : {f.rule.population.label} · Période : {f.rule.period === 'jour' ? 'journée civile' : 'une prise'}</span>
            <button className="a" onClick={() => go({ s: 'rule', ruleId: f.rule.id })}>Voir le détail du repère</button>
          </div>
        ))}
        {st.profile.proInstructions && <div className="src"><b>Consignes de ton professionnel de santé</b><span>{st.profile.proInstructions}</span></div>}
        <p className="help">Cet avis est une information. Il ne constitue ni un diagnostic ni une garantie.</p>
      </main>
      <div className="fab">
        <button className="btn sec" onClick={() => (back(), go({ s: 'intake', drinkId: i.drinkId, intakeId: i.id }))}>Modifier</button>
        <button className="btn" onClick={() => go({ s: 'today' })}>Terminé</button>
      </div>
    </>
  )
}

const STATE_TITLE = { vigilance: 'Vigilance', depassement: 'Dépassement', profil: 'Précaution' } as const
