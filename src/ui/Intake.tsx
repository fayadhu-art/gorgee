import { useMemo, useState } from 'react'
import { dayKey, fmtVal, intakeValue, SHOWN } from '../domain/calc'
import { isKnown } from '../domain/types'
import { uid } from '../domain/store'
import { CATEGORIES, Category, Drink, nlabel, NUTRIENTS, TRAITS } from '../domain/types'
import { withNotifications } from './App'
import { Bar, CAT_COLOR, CAT_ICON, drinkSub, hasFake, Icon, Ribbon, useApp } from './parts'

const lastUse = (drinkId: string, intakes: { drinkId: string; at: string; ml: number; containerId?: string }[]) =>
  intakes.filter((i) => i.drinkId === drinkId).sort((a, b) => b.at.localeCompare(a.at))[0]

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function Choose({ cat }: { cat?: Category }) {
  const { st, go, back, addIntake, toast } = useApp()
  const [q, setQ] = useState('')
  // Sans photo, seuls restent les génériques café, eau et infusion ; les anciens « Jus », « Lait », « Thé » génériques sont masqués.
  const usable = st.drinks.filter((d) => d.status !== 'brouillon' && !(d.kind === 'generique' && (d.category === 'jus' || d.category === 'lait_vegetale' || d.category === 'the')))
  // Habituelles : favoris + boissons les plus saisies.
  const freq = useMemo(() => {
    const c = new Map<string, number>()
    st.intakes.forEach((i) => c.set(i.drinkId, (c.get(i.drinkId) ?? 0) + 1))
    return [...usable].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || (c.get(b.id) ?? 0) - (c.get(a.id) ?? 0))
  }, [st])
  const all = freq
  const ql = norm(q.trim())
  const words = ql.split(/\s+/).filter(Boolean)
  const results = ql
    ? usable.filter((d) => { const h = norm(`${d.name} ${d.brand ?? ''} ${CATEGORIES[d.category]} ${d.traits.map((t) => TRAITS[t]).join(' ')}`); return words.every((w) => h.includes(w)) })
    : cat ? usable.filter((d) => d.category === cat) : []
  const quick = (d: Drink) => {
    const u = lastUse(d.id, st.intakes)
    const c = st.containers.find((x) => x.id === u?.containerId)
    const ml = u?.ml ?? c?.ml ?? d.capacityMl ?? 250
    const i = { id: uid(), drinkId: d.id, ml, at: new Date().toISOString(), containerId: u?.containerId, additions: [] }
    addIntake(i)
    toast(`${d.name} : ${ml} ml ajoutés`)
    go({ s: 'today' })
  }
  const Item = ({ d }: { d: Drink }) => {
    const u = lastUse(d.id, st.intakes)
    const c = st.containers.find((x) => x.id === u?.containerId)
    return (
      <div className="fav">
        <button className="m" onClick={() => go({ s: 'intake', drinkId: d.id })}>
          <b>{d.name}{d.fake && <span className="tag t-fake" style={{ marginLeft: 6 }}>fictif</span>}</b>
          <small>{u ? `${c ? c.name + ' ' : ''}${u.ml} ml` : drinkSub(d) === d.name ? `${d.capacityMl ?? 250} ml` : drinkSub(d)}</small>
        </button>
        <button className="plus" aria-label={`Ajouter ${d.name}${u ? `, ${u.ml} ml` : ''} maintenant`} onClick={() => quick(d)}><Icon n="plus" /></button>
      </div>
    )
  }
  return (
    <>
      <Ribbon show={hasFake(st)} />
      <Bar title={cat ? CATEGORIES[cat] : 'Ajouter une boisson'} onBack={back} close={!cat} />
      <main className="main">
        <label className="search"><Icon n="search" /><input id="q" type="search" enterKeyHint="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, marque ou type de boisson" aria-label="Rechercher une boisson" /></label>
        <button className="btn" onClick={() => go({ s: 'scan', cat, name: q.trim() || undefined })}><Icon n="camera" />{q.trim() ? `Nouvelle boisson « ${q.trim()} » : 2 photos` : 'Nouvelle boisson : 2 photos'}</button>
        {(ql || cat) ? (
          <div className="field">
            <span className="lbl">{results.length} résultat{results.length > 1 ? 's' : ''}</span>
            {results.length > 0 && <div className="list">{results.map((d) => <Item key={d.id} d={d} />)}</div>}
            {!results.length && <p className="help">Aucune boisson enregistrée ne correspond. Prends-la en photo avec le bouton ci-dessus.</p>}
          </div>
        ) : (
          <>
            <div className="field"><span className="sect" style={{ marginBottom: 0 }}>Mes boissons · + pour ajouter d’un geste</span><div className="list">{all.map((d) => <Item key={d.id} d={d} />)}</div></div>
          </>
        )}
        <div className="list">
        <button className="link" onClick={() => go({ s: 'scan', cat: 'the' })}><Icon n="tea" />Ajouter un thé (2 photos)</button>
        <button className="link" onClick={() => go({ s: 'tea', kind: 'infusion' })}><Icon n="leaf" />Créer une infusion</button>
        </div>
      </main>
    </>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const localParts = (iso: string) => { const d = new Date(iso); return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` } }

export function IntakeForm({ drinkId, intakeId }: { drinkId: string; intakeId?: string }) {
  const { st, set, back, go, addIntake, toast } = useApp()
  const d = st.drinks.find((x) => x.id === drinkId)
  const ex = st.intakes.find((x) => x.id === intakeId)
  const last = lastUse(drinkId, st.intakes)
  const initCont = ex?.containerId ?? last?.containerId ?? (d?.capacityMl ? undefined : st.containers[0]?.id)
  const [cont, setCont] = useState<string | undefined>(initCont)
  const capOf = (id?: string) => st.containers.find((c) => c.id === id)?.ml ?? d?.capacityMl ?? 250
  const [ml, setMl] = useState(String(ex?.ml ?? last?.ml ?? capOf(initCont)))
  const p = localParts(ex?.at ?? new Date().toISOString())
  const [date, setDate] = useState(p.date)
  const [time, setTime] = useState(p.time)
  const [adds, setAdds] = useState<string[]>(ex?.additions ?? [])
  const [other, setOther] = useState('')
  const [note, setNote] = useState(ex?.note ?? '')
  const [confirmDel, setConfirmDel] = useState(false)
  // Eau, thé, infusion : quantité puis Valider, sans avis ni options visibles.
  const simple = true
  const [more, setMore] = useState(false)
  if (!d) return <><Bar title="Boisson introuvable" onBack={back} /><main className="main"><p>Cette fiche n’existe plus.</p></main></>
  const cap = capOf(cont)
  const n = Math.round(Number(ml.replace(',', '.')))
  const valid = Number.isFinite(n) && n > 0 && n <= 5000 && !!date && !!time
  const presets = ['Glaçons', 'Citron', 'Menthe', 'Lait']
  const toggle = (a: string) => setAdds((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))
  const submit = () => {
    if (!valid) return
    const at = new Date(`${date}T${time}:00`).toISOString()
    const i = { id: ex?.id ?? uid(), drinkId, ml: n, at, containerId: cont, additions: adds, note: note.trim() || undefined, fake: ex?.fake }
    addIntake(i)
    toast(ex ? 'Consommation modifiée, totaux recalculés' : 'Consommation enregistrée')
    back(); if (!ex) back()
    if (!ex) toast(`${d.name} : ${n} ml ajoutés`)
    go({ s: 'today' })
  }
  const del = () => {
    if (!ex) return
    const day = dayKey(ex.at)
    set((s) => withNotifications({ ...s, intakes: s.intakes.filter((x) => x.id !== ex.id) }, day).s)
    toast('Consommation supprimée, totaux recalculés')
    go({ s: 'today' })
  }
  return (
    <>
      <Ribbon show={!!(d.fake || ex?.fake)} />
      <Bar title={ex ? 'Modifier la consommation' : 'Combien en as-tu bu ?'} onBack={back} />
      <main className="main">
        <div className="card" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}><b>{d.name}</b><br /><small className="help">{drinkSub(d)}</small></div>
          <button className="a" onClick={() => go({ s: 'drink', drinkId: d.id })}>Fiche</button>
        </div>
        {d.kind === 'commerce' && SHOWN.some((n) => { const x = intakeValue(d, n, 100); return !isKnown(x) && x.missing !== 'non_applicable' && x.missing !== 'non_indique' }) && (
          <button className="row solo" onClick={() => go({ s: 'product', drinkId: d.id, step: 1 })}>
            <span className="ic" style={{ background: '#FF9F0A' }}><Icon n="edit" /></span>
            <span className="m"><b>Compléter la fiche</b><small>Des valeurs manquent : l’avis sera partiel</small></span>
            <span className="chev"><Icon n="next" /></span>
          </button>
        )}
        <div className="field"><span className="fl" id="lc">Contenant</span>
          <div className="chips" role="group" aria-labelledby="lc">
            {d.capacityMl && <button className="chip" aria-pressed={!cont} onClick={() => { setCont(undefined); setMl(String(d.capacityMl)) }}>Emballage <small>{d.capacityMl}</small></button>}
            {st.containers.map((c) => <button key={c.id} className="chip" aria-pressed={cont === c.id} onClick={() => { setCont(c.id); setMl(String(c.ml)) }}>{c.name} <small>{c.ml}</small></button>)}
          </div>
</div>
        <div className="field"><span className="fl" id="lq">Quantité réellement bue</span>
          <div className="cup">
            <div className="vessel" aria-hidden="true"><i style={{ height: `${Math.min(100, (n / cap) * 100) || 0}%` }} /></div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <div className="chips" role="group" aria-labelledby="lq">
                {[['Tout', 1], ['¾', 0.75], ['½', 0.5], ['¼', 0.25]].map(([l, f]) => (
                  <button key={l} className="chip" aria-pressed={n === Math.round(cap * +f)} onClick={() => setMl(String(Math.round(cap * +f)))}>{l}</button>
                ))}
              </div>
              <div className="qty">
                <button className="ib" aria-label="Retirer 10 ml" onClick={() => setMl(String(Math.max(0, (n || 0) - 10)))}><Icon n="back" /></button>
                <input className="inp" id="ml" value={ml} inputMode="numeric" onChange={(e) => setMl(e.target.value)} aria-label="Quantité bue en millilitres" aria-describedby="mlh" />
                <button className="ib" aria-label="Ajouter 10 ml" onClick={() => setMl(String((n || 0) + 10))}><Icon n="next" /></button>
              </div>
            </div>
          </div>
          <span className={valid || !ml ? 'help' : 'err'} id="mlh">
            {!Number.isFinite(n) || n <= 0 ? 'Indique une quantité en millilitres, supérieure à zéro.' : n > 5000 ? 'Plus de 5 litres en une prise : vérifie la saisie.' : n > cap ? `${n} ml, plus que la contenance (${cap} ml). Vérifie si tu as resservi.` : `${n} ml bus sur un contenant de ${cap} ml`}
          </span></div>
        {simple && !more && <button className="link" onClick={() => setMore(true)}><Icon n="next" />Heure, ajouts, note</button>}
        {(!simple || more) && <>
        <div className="grid2">
          <div className="field"><label htmlFor="d">Date</label><input className="inp num" id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="h">Heure</label><input className="inp num" id="h" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
        <div className="field"><span className="fl" id="la">Ajouts</span>
          <div className="chips" role="group" aria-labelledby="la">
            {[...new Set([...presets, ...adds])].map((a) => <button key={a} className="chip" aria-pressed={adds.includes(a)} onClick={() => toggle(a)}>{a}</button>)}
          </div>
          <div className="qty"><input className="inp" style={{ fontFamily: 'inherit', fontSize: 16, textAlign: 'left', fontWeight: 400 }} id="oa" value={other} placeholder="Autre ajout" aria-label="Autre ajout" onChange={(e) => setOther(e.target.value)} />
            <button className="btn sec sm" disabled={!other.trim()} onClick={() => { toggle(other.trim()); setOther('') }}>Ajouter</button></div>
          <span className="help">La composition des ajouts n’est pas comptée : l’analyse sera marquée incomplète.</span></div>
        <div className="field"><label htmlFor="n">Note <span className="help">(facultatif)</span></label><input className="inp" id="n" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. au déjeuner" /></div>
        </>}
        {ex && <button className="btn danger" onClick={() => setConfirmDel(true)}><Icon n="trash" />Supprimer cette consommation</button>}
      </main>
      <div className="fab"><button className="btn" disabled={!valid} onClick={submit}>{ex ? 'Enregistrer les modifications' : <><Icon n="check" />Valider</>}</button></div>
      {confirmDel && (
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="cd"><div>
          <h3 id="cd">Supprimer cette consommation ?</h3>
          <p className="help">{d.name}, {ex?.ml} ml. Les totaux et les avis du jour seront recalculés.</p>
          <button className="btn danger" onClick={del}>Supprimer</button>
          <button className="btn sec" onClick={() => setConfirmDel(false)}>Annuler</button>
        </div></div>
      )}
    </>
  )
}
