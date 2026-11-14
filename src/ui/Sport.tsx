import { useState } from 'react'
import { dayKey, fmt } from '../domain/calc'
import { sessionNeed, waterReference, AFTER_WINDOW_H } from '../domain/hydration'
import { uid } from '../domain/store'
import { Session } from '../domain/types'
import { Bar, Icon, StateBox, useApp } from './parts'

const SPORTS = ['Course à pied', 'Vélo', 'Musculation', 'Natation', 'Football', 'Marche', 'Fitness', 'Autre']
const pad = (n: number) => String(n).padStart(2, '0')
const hm = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const L = (ml: number) => `${fmt(ml / 1000, 2)} L`

export function WaterCard({ volume }: { volume: number }) {
  const { st, go } = useApp()
  const ref = waterReference(st.profile)
  return (
    <section className="card">
      <span className="lbl">Repère eau du jour</span>
      {ref.ok ? <>
        <div><span className="big num" style={{ fontSize: 34 }}>{fmt(ref.litres, 1)} L</span><span className="unit">d’eau totale</span></div>
        <p className="help">Pour {st.profile.sex === 'femme' ? 'une femme' : 'un homme'} adulte, boissons et aliments compris, en climat et activité modérés. Tes boissons enregistrées : <b className="num" style={{ color: 'var(--ink)' }}>{L(volume)}</b>. L’eau des aliments n’est pas comptée ; la chaleur et le sport augmentent les besoins.</p>
      </> : <p className="help">{ref.reason} <button className="a" onClick={() => go({ s: 'settings' })}>Ouvrir le profil</button></p>}
    </section>
  )
}

export function SessionsCard({ day }: { day: string }) {
  const { st, go } = useApp()
  const list = (st.sessions ?? []).filter((s) => dayKey(s.start) === day).sort((a, b) => a.start.localeCompare(b.start))
  return (
    <section className="card">
      <span className="lbl">Sport</span>
      {list.map((s) => {
        const n = sessionNeed(s, st.intakes)
        return (
          <button key={s.id} className="row" onClick={() => go({ s: 'sport', id: s.id })} style={{ alignItems: 'flex-start' }}>
            <span className="ic" style={{ background: 'var(--c6)' }}><Icon n="bolt" /></span>
            <span className="m"><b>{s.sport} · {s.durationMin} min</b>
              <small>{n.ok ? `À boire après : ${L(n.targetMl)} · bu depuis la fin : ${L(n.drankMl)}` : `${n.reason} Bu depuis la fin : ${L(n.drankMl)}`}</small></span>
            <span className="q num">{hm(s.start)}</span>
          </button>
        )
      })}
      <button className="link" onClick={() => go({ s: 'sport' })}><Icon n="plus" />Ajouter une séance</button>
    </section>
  )
}

export function SportForm({ id }: { id?: string }) {
  const { st, set, back, toast } = useApp()
  const ex = (st.sessions ?? []).find((s) => s.id === id)
  const now = new Date(Date.now() - 60 * 60000)
  const d0 = ex ? new Date(ex.start) : now
  const [s, setS] = useState<Session>(ex ?? { id: uid(), sport: 'Course à pied', start: now.toISOString(), durationMin: 45, intensity: 'moderee', weightBeforeKg: st.profile.weightKg })
  const [date, setDate] = useState(`${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`)
  const [time, setTime] = useState(`${pad(d0.getHours())}:${pad(d0.getMinutes())}`)
  const [ask, setAsk] = useState(false)
  const up = (p: Partial<Session>) => setS((x) => ({ ...x, ...p }))
  const num = (v: string) => { const n = Number(v.replace(',', '.')); return v.trim() && Number.isFinite(n) ? n : undefined }
  const cur: Session = { ...s, start: date && time ? new Date(`${date}T${time}:00`).toISOString() : s.start }
  const need = sessionNeed(cur, st.intakes)
  const ok = s.durationMin > 0 && s.durationMin <= 900 && !!date && !!time
  const save = () => {
    set((x) => ({ ...x, sessions: [...(x.sessions ?? []).filter((y) => y.id !== cur.id), cur] }))
    toast('Séance enregistrée'); back()
  }
  return (
    <>
      <Bar title={ex ? 'Séance de sport' : 'Nouvelle séance'} onBack={back} />
      <main className="main">
        <div className="field"><span className="fl">Sport</span>
          <div className="chips">{SPORTS.map((k) => <button key={k} className="chip" aria-pressed={s.sport === k} onClick={() => up({ sport: k })}>{k}</button>)}</div></div>
        <div className="grid2">
          <div className="field"><label htmlFor="sd">Date</label><input id="sd" className="inp num" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="st">Début</label><input id="st" className="inp num" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="du">Durée (minutes)</label><input id="du" className="inp num" inputMode="numeric" value={s.durationMin || ''} onChange={(e) => up({ durationMin: num(e.target.value) ?? 0 })} /></div>
        <div className="field"><span className="fl">Intensité ressentie</span>
          <div className="chips">{([['legere', 'Légère'], ['moderee', 'Modérée'], ['intense', 'Intense']] as const).map(([k, l]) => <button key={k} className="chip" aria-pressed={s.intensity === k} onClick={() => up({ intensity: k })}>{l}</button>)}</div></div>
        <div className="list"><div className="row" style={{ cursor: 'default' }}><span className="m"><b>Forte chaleur</b><small>Pour mémoire : augmente la transpiration.</small></span><button className="sw" role="switch" aria-checked={!!s.hot} aria-label="Forte chaleur" onClick={() => up({ hot: !s.hot })}><i /></button></div></div>
        <div className="sect">Pesée</div>
        <div className="grid2">
          <div className="field"><label htmlFor="wb">Avant (kg)</label><input id="wb" className="inp num" inputMode="decimal" value={s.weightBeforeKg ?? ''} onChange={(e) => up({ weightBeforeKg: num(e.target.value) })} /></div>
          <div className="field"><label htmlFor="wa">Après (kg)</label><input id="wa" className="inp num" inputMode="decimal" value={s.weightAfterKg ?? ''} onChange={(e) => up({ weightAfterKg: num(e.target.value) })} /></div>
        </div>
        <p className="help" style={{ paddingLeft: 4, marginTop: -8 }}>Pèse-toi dans les mêmes conditions, en tenue légère et sèche. Le poids perdu correspond surtout à l’eau perdue en transpirant.</p>
        {need.ok ? (
          <StateBox k="information" title={`À boire après la séance : environ ${L(need.targetMl)}`}>
            <p>Tu as perdu {fmt(need.lossKg, 1)} kg. Le repère est d’environ 1,5 L de boisson par kilo perdu, à boire dans les heures qui suivent, pas d’un coup.</p>
            <p style={{ marginTop: 6 }}>Déjà bu depuis la fin : <b className="num">{L(need.drankMl)}</b>{need.drankMl < need.targetMl ? `, reste ${L(need.targetMl - need.drankMl)}.` : '. Quantité atteinte.'}</p>
          </StateBox>
        ) : <StateBox k="incomplete" title="Pas de quantité calculée"><p>{need.reason}</p></StateBox>}
        <p className="note"><Icon n="info" />Boissons comptées : celles saisies dans les {AFTER_WINDOW_H} h après la fin de la séance. Aucune règle sur le type de boisson n’est encore intégrée : l’appli ne conseille pas de boisson précise.</p>
        <div className="field"><label htmlFor="sn">Note <span className="help">facultatif</span></label><input id="sn" className="inp" value={s.note ?? ''} onChange={(e) => up({ note: e.target.value || undefined })} /></div>
        {ex && <button className="btn danger" onClick={() => setAsk(true)}><Icon n="trash" />Supprimer la séance</button>}
      </main>
      <div className="fab"><button className="btn" disabled={!ok} onClick={save}>Enregistrer la séance</button></div>
      {ask && (
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="ds"><div>
          <h3 id="ds">Supprimer cette séance ?</h3>
          <button className="btn danger" onClick={() => { set((x) => ({ ...x, sessions: (x.sessions ?? []).filter((y) => y.id !== s.id) })); back() }}>Supprimer</button>
          <button className="btn sec" onClick={() => setAsk(false)}>Annuler</button>
        </div></div>
      )}
    </>
  )
}
