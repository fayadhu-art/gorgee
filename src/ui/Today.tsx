import { dayKey, fmt, fmtVal, intakeValue, lastDays, per100, SHOWN, Total } from '../domain/calc'
import { dayWater } from '../domain/hydration'
import { applies, evaluate, isActive, RULES } from '../domain/rules'
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
const dayLimit = (n: Nutrient, st: State) => RULES.find((r) => isActive(r) && r.period === 'jour' && r.substance === n && r.level !== 'vigilance' && applies(r, st.profile))?.trigger.value

function Ring({ pct }: { pct: number }) {
  const R = 52, C = 2 * Math.PI * R
  return (
    <svg className="ring" viewBox="0 0 120 120" aria-hidden="true">
      <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0A84FF" /><stop offset="1" stopColor="#5E5CE6" /></linearGradient></defs>
      <circle cx="60" cy="60" r={R} className="rt" />
      <circle cx="60" cy="60" r={R} className="rv" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, pct))} transform="rotate(-90 60 60)" />
    </svg>
  )
}

function Gauge({ n, t, limit }: { n: Nutrient; t: Total; limit?: number }) {
  const { go } = useApp()
  const u = NUTRIENTS[n].unit
  const pct = limit ? Math.min(1, t.v / limit) : 0
  const over = !!limit && t.v > limit
  return (
    <div className={'tile' + (over ? ' over' : '')}>
      <span className="tl">{nlabel(n)}</span>
      <span className="tv num">{t.unknown ? '≥ ' : t.upper ? '≤ ' : ''}{fmt(t.v, dig(n))}<small> {u}</small></span>
      {limit ? <><div className="meter sm"><i style={{ width: `${pct * 100}%` }} /></div><span className="ts">repère {fmt(limit, 0)} {u}</span></>
        : <span className="ts">{t.unknown ? '' : 'sur la journée'}</span>}
      {t.unknown > 0 && <button className="ts warn" onClick={() => go({ s: 'library' })}>{t.unknown} boisson{t.unknown > 1 ? 's' : ''} sans valeur</button>}
    </div>
  )
}

export function Today({ day: d0 }: { day?: string }) {
  const { st, go, addIntake, toast } = useApp()
  const t = today()
  const day = d0 ?? t
  const a = evaluate(st, day)
  const { stats } = a
  const byId = new Map(st.drinks.map((d) => [d.id, d]))
  const prev = lastDays(day, 2)[0]
  const next = lastDays(day, 1)[0] === t ? null : new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + 1)).toISOString().slice(0, 10)
  const cats = Object.entries(stats.byCategory) as [Category, number][]
  const sessions = (st.sessions ?? []).filter((s) => dayKey(s.start) === day)
  const w = dayWater(st.profile, stats.volume, sessions, st.intakes)
  const target = w.ok ? w.drinksTargetMl + w.sportMl : 0
  // Raccourcis : favoris puis boissons les plus saisies, avec la dernière quantité.
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
  // Fiches bues ce jour-là dont il manque des valeurs : c'est ce qui rend les apports partiels.
  const incomplete = [...new Set(stats.intakes.map((i) => byId.get(i.drinkId)))].filter((d): d is Drink => !!d && SHOWN.some((n) => { const x = per100(d, n); return !isKnown(x) && x.missing !== 'non_applicable' }))
  const editDrink = (d: Drink) => go(d.kind === 'the' ? { s: 'tea', drinkId: d.id } : d.kind === 'recette' ? { s: 'recipe', drinkId: d.id } : { s: 'product', drinkId: d.id, step: 1 })
  const partial = SHOWN.some((n) => stats.totals[n].unknown > 0)
  return (
    <>
      <Ribbon show={hasFake(st)} />
      <Bar large title={day === t ? 'Aujourd’hui' : 'Journée'} sub={dayLabel(day)} right={<div style={{ display: 'flex', gap: 8 }}>
        <button className="ib" aria-label="Jour précédent" onClick={() => go({ s: 'today', day: prev })}><Icon n="back" /></button>
        <button className="ib" aria-label="Jour suivant" disabled={!next} onClick={() => next && go({ s: 'today', day: next === t ? undefined : next })}><Icon n="next" /></button>
      </div>} />
      <main className="main">
        <section className="card hero-card" aria-labelledby="eau">
          <div className="hydro">
            <div className="ringbox"><Ring pct={target ? stats.volume / target : 0} /><span className="rc"><b className="num">{fmt(stats.volume / 1000, 2)}</b><small>litre{stats.volume >= 2000 ? 's' : ''} bu{stats.volume >= 2000 ? 's' : ''}</small></span></div>
            <div className="hx">
              <span className="lbl" id="eau">Hydratation</span>
              {w.ok ? (w.remainingMl > 0
                ? <><span className="hs">Il te reste à boire</span><span className="big num">{fmt(w.remainingMl / 1000, 2)} L</span></>
                : <><span className="hs">Repère du jour</span><span className="big num ok">Atteint</span></>)
                : <><span className="hs">Boissons enregistrées</span><span className="big num">{fmt(stats.volume, 0)} ml</span></>}
              {w.ok ? <span className="hs">sur {fmt(target / 1000, 1)} L{w.sportMl ? `, dont ${fmt(w.sportMl / 1000, 1)} L pour le sport` : ''}</span>
                : <button className="a" onClick={() => go({ s: 'settings' })}>{w.reason}</button>}
            </div>
          </div>
          {stats.volume > 0 && <>
            <div className="stack" role="img" aria-label={'Répartition : ' + cats.map(([c, v]) => `${CATEGORIES[c]} ${v} ml`).join(', ')}>
              {cats.map(([c, v]) => <i key={c} style={{ width: `${(v / stats.volume) * 100}%`, background: CAT_COLOR[c] }} />)}
            </div>
            <div className="legend">{cats.map(([c, v]) => <span key={c}><i style={{ background: CAT_COLOR[c] }} />{catLabel(c)} <span className="num">{fmt(v, 0)}</span></span>)}</div>
          </>}
        </section>

        {quick.length > 0 && <div className="field"><span className="sect" style={{ marginBottom: 0 }}>Ajouter en un geste</span>
          <div className="quick">{quick.map((q) => (
            <button key={q.d.id} className="qa" onClick={() => add(q)} aria-label={`Ajouter ${q.d.name}, ${q.ml} ml`}>
              <span className="ic" style={{ background: CAT_COLOR[q.d.category] }}><Icon n={CAT_ICON[q.d.category]} /></span>
              <span className="m"><b>{q.d.name}</b><small className="num">{q.ml} ml</small></span><Icon n="plus" />
            </button>
          ))}</div></div>}

        <section className="tiles" aria-label="Repères du jour">
          <Gauge n="sucres" t={stats.totals.sucres} limit={dayLimit('sucres', st)} />
          <Gauge n="cafeine" t={stats.totals.cafeine} limit={dayLimit('cafeine', st)} />
          <Gauge n="energie_kcal" t={stats.totals.energie_kcal} />
          <div className={'tile' + (a.findings.length ? ' over' : '')}>
            <span className="tl">Avis du jour</span>
            <span className="tv" style={{ fontSize: 17, lineHeight: 1.2 }}>{a.findings.length ? `${a.findings.length} signalement${a.findings.length > 1 ? 's' : ''}` : 'Aucun dépassement'}</span>
            <span className="ts">{a.findings.length ? 'détail ci-dessous' : stats.count ? 'parmi les repères évaluables' : 'aucune boisson saisie'}</span>
          </div>
        </section>

        {incomplete.length > 0 && <>
          <div className="sect">Fiches à compléter</div>
          <section className="list">
            {incomplete.map((d) => { const miss = SHOWN.filter((n) => { const x = per100(d, n); return !isKnown(x) && x.missing !== 'non_applicable' }); return (
              <button className="row" key={d.id} onClick={() => editDrink(d)}>
                <span className="ic" style={{ background: 'var(--warn, #FF9F0A)' }}><Icon n="edit" /></span>
                <span className="m"><b>{d.name}</b><small>Manque : {miss.map((n) => nlabel(n).toLowerCase()).join(', ')}</small></span>
                <span className="chev"><Icon n="next" /></span>
              </button>
            ) })}
          </section>
          <p className="note"><Icon n="info" />Complète ces fiches depuis l’étiquette pour que les apports du jour soient complets.</p>
        </>}

        {a.findings.map((f) => (
          <button key={f.key} className="a" style={{ textDecoration: 'none' }} onClick={() => go({ s: 'rule', ruleId: f.rule.id })}>
            <StateBox k={f.rule.level} title={f.rule.title}><p>{f.text}</p><p className="help" style={{ marginTop: 4 }}>Voir le détail du repère</p></StateBox>
          </button>
        ))}

        <div className="sect">Journal{stats.count ? ` · ${stats.count} boisson${stats.count > 1 ? 's' : ''}` : ''}</div>
        <section className="list">
          {stats.count === 0 ? (
            <div className="empty"><Icon n="glass" /><p>Aucune boisson enregistrée {day === t ? 'aujourd’hui' : 'ce jour-là'}.</p><button className="btn sm" onClick={() => go({ s: 'choose' })}><Icon n="plus" />Ajouter une boisson</button></div>
          ) : stats.intakes.map((i) => {
            const d = byId.get(i.drinkId)
            const su = d ? intakeValue(d, 'sucres', i.ml) : undefined
            const ca = d ? intakeValue(d, 'cafeine', i.ml) : undefined
            const bits = [isKnown(su) && su.v > 0 ? `${fmt(su.v, 1)} g de sucres` : '', isKnown(ca) && ca.v > 0 ? `${fmt(ca.v, 0)} mg de caféine` : '', d && incomplete.includes(d) ? 'fiche à compléter' : ''].filter(Boolean)
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

        {stats.count > 0 && <>
          <div className="sect">Apports du jour</div>
          <section className="list" aria-label="Apports du jour">
            {SHOWN.map((n) => { const tt = stats.totals[n]; return (
              <div className="row" key={n} style={{ cursor: 'default' }}>
                <span className="m"><b>{nlabel(n)}</b>{!tt.unknown && tt.upper && <small>l’étiquette indique « moins de » : total maximum</small>}</span>
                <span className="q num" style={{ color: 'var(--ink)' }}><b>{totalTxt(tt, n)}</b></span>
              </div>
            ) })}
          </section>
          {partial && <p className="note"><Icon n="info" />Le signe ≥ indique un total minimum : il manque des valeurs dans les fiches à compléter.</p>}
          {!partial && <p className="note"><Icon n="check" />Toutes les boissons du jour ont leurs valeurs : les apports sont complets.</p>}
        </>}

        <SessionsCard day={day} />
        <p className="note"><Icon n="info" />Les totaux ne comptent que les boissons saisies, pas l’alimentation. Repères officiels, pas un avis médical.</p>
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
