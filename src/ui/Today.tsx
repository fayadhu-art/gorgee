import { dayKey, fmt, fmtVal, lastDays, SHOWN, Total } from '../domain/calc'
import { evaluate } from '../domain/rules'
import { CATEGORIES, Category, nlabel, Nutrient, NUTRIENTS, Val } from '../domain/types'
import { WaterCard, SessionsCard } from './Sport'
import { Bar, CAT_COLOR, CAT_ICON, catLabel, hasFake, Icon, Ribbon, StateBox, useApp } from './parts'

const today = () => dayKey(new Date().toISOString())
const dayLabel = (d: string) => { const t = new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return t[0].toUpperCase() + t.slice(1) }
const time = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

const dig = (n: Nutrient) => (n === 'energie_kcal' || n === 'cafeine' ? 0 : 1)
const totalTxt = (t: Total, n: Nutrient) => (t.known ? `${t.unknown ? '≥ ' : t.upper ? '≤ ' : ''}${fmt(t.v, dig(n))} ${NUTRIENTS[n].unit}` : t.unknown ? 'Inconnu' : '—')

export function TotalTag({ unknown, estimated }: { unknown: number; estimated?: boolean }) {
  if (unknown) return <span className="tag t-part"><Icon n="part" />Partiel · {unknown} inconnue{unknown > 1 ? 's' : ''}</span>
  if (estimated) return <span className="tag t-est">Contient une estimation</span>
  return <span className="tag t-ok"><Icon n="check" />Complet</span>
}

export function Today({ day: d0 }: { day?: string }) {
  const { st, go } = useApp()
  const t = today()
  const day = d0 ?? t
  const a = evaluate(st, day)
  const { stats } = a
  const byId = new Map(st.drinks.map((d) => [d.id, d]))
  const prev = lastDays(day, 2)[0]
  const next = lastDays(day, 1)[0] === t ? null : new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + 1)).toISOString().slice(0, 10)
  const cats = Object.entries(stats.byCategory) as [Category, number][]
  const alerts = a.findings.length
  return (
    <>
      <Ribbon show={hasFake(st)} />
      <Bar large title={day === t ? 'Aujourd’hui' : 'Journée'} sub={dayLabel(day)} right={<div style={{ display: 'flex', gap: 8 }}>
        <button className="ib" aria-label="Jour précédent" onClick={() => go({ s: 'today', day: prev })}><Icon n="back" /></button>
        <button className="ib" aria-label="Jour suivant" disabled={!next} onClick={() => next && go({ s: 'today', day: next === t ? undefined : next })}><Icon n="next" /></button>
      </div>} />
      <main className="main">
        <section className="card hero-card" aria-labelledby="vol">
          <span className="lbl" id="vol">Volume de boissons enregistré</span>
          <div><span className="big num">{fmt(stats.volume, 0)}</span><span className="unit">ml</span></div>
          {stats.volume > 0 && <>
            <div className="stack" role="img" aria-label={'Répartition : ' + cats.map(([c, v]) => `${CATEGORIES[c]} ${v} ml`).join(', ')}>
              {cats.map(([c, v]) => <i key={c} style={{ width: `${(v / stats.volume) * 100}%`, background: CAT_COLOR[c] }} />)}
            </div>
            <div className="legend">{cats.map(([c, v]) => <span key={c}><i style={{ background: CAT_COLOR[c] }} />{catLabel(c)} <span className="num">{fmt(v, 0)}</span></span>)}</div>
          </>}
          <p className="note"><Icon n="info" />Ce volume ne mesure pas ton hydratation : l’eau des aliments et les boissons non saisies n’y sont pas.</p>
        </section>
        <WaterCard volume={stats.volume} day={day} />
        <div className="grid2">
          {(['sucres', 'cafeine', 'energie_kcal'] as const).map((n) => {
            const tt = stats.totals[n]
            return (
              <div className="kpi" key={n}>
                <span className="lbl">{n === 'sucres' ? 'Sucres totaux' : NUTRIENTS[n].label}</span>
                <span className="v num">{tt.known ? `${fmt(tt.v, n === 'sucres' ? 1 : 0)} ${NUTRIENTS[n].unit}` : tt.unknown ? 'Inconnu' : `0 ${NUTRIENTS[n].unit}`}</span>
                {stats.count ? <TotalTag unknown={tt.unknown} estimated={tt.estimated} /> : <span className="help">Aucune boisson</span>}
              </div>
            )
          })}
          <div className="kpi">
            <span className="lbl">Avis du jour</span>
            <span className="v" style={{ fontSize: 16 }}>{alerts ? `${alerts} signalement${alerts > 1 ? 's' : ''}` : 'Aucun dépassement'}</span>
            <span className="help">{alerts ? 'Touchez pour le détail' : 'parmi les repères évaluables'}</span>
          </div>
        </div>
        {stats.count > 0 && <section className="card" aria-labelledby="ap">
          <span className="lbl" id="ap">Apports du jour</span>
          <table className="tbl"><tbody>{SHOWN.map((n) => <tr key={n}><td>{nlabel(n)}</td><td>{totalTxt(stats.totals[n], n)}</td></tr>)}</tbody></table>
          <p className="help">« ≥ » : au moins une boisson n’a pas cette valeur, le total est un minimum. « ≤ » : l’étiquette indique « moins de », le total est un maximum.</p>
        </section>}
        {a.findings.map((f) => (
          <button key={f.key} className="a" style={{ textDecoration: 'none' }} onClick={() => go({ s: 'rule', ruleId: f.rule.id })}>
            <StateBox k={f.rule.level} title={f.rule.title}><p>{f.text}</p><p className="help" style={{ marginTop: 4 }}>Voir le détail du repère</p></StateBox>
          </button>
        ))}
        <SessionsCard day={day} />
        <section className="card" aria-labelledby="jr">
          <span className="lbl" id="jr">Journal</span>
          {stats.count === 0 ? (
            <div className="empty"><Icon n="glass" /><p>Aucune boisson enregistrée {day === t ? 'aujourd’hui' : 'ce jour-là'}.</p></div>
          ) : (
            <div className="list">
              {stats.intakes.map((i) => {
                const d = byId.get(i.drinkId)
                const c = st.containers.find((x) => x.id === i.containerId)
                const unkn = (x?: Val) => !x || ('missing' in x && x.missing !== 'non_applicable')
                const unk = d && unkn(d.values.sucres) && unkn(d.values.cafeine)
                return (
                  <button className="row" key={i.id} onClick={() => go({ s: 'intake', drinkId: i.drinkId, intakeId: i.id })} aria-label={`Modifier : ${d?.name ?? 'boisson supprimée'}, ${i.ml} ml à ${time(i.at)}`}>
                    <span className="ic" style={{ background: d ? CAT_COLOR[d.category] : 'var(--c9)' }}><Icon n={d ? CAT_ICON[d.category] : 'glass'} /></span>
                    <span className="m"><b>{d?.name ?? 'Boisson supprimée'}{i.fake && <span className="tag t-fake" style={{ marginLeft: 6 }}>fictif</span>}</b>
                      <small>{c ? `${c.name} ${c.ml} ml · ` : ''}bu <span className="num">{i.ml}</span> ml{unk ? ' · composition inconnue' : ''}</small></span>
                    <span className="q num">{time(i.at)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </section>
        <p className="note"><Icon n="info" />Les totaux ne comptent que les boissons saisies. L’alimentation solide et les autres sources ne sont pas suivies.</p>
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
