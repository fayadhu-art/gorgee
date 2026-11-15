import { Capacitor } from '@capacitor/core'
import { useRef, useState } from 'react'
import { demoData, emptyState, removeDemo, uid } from '../domain/store'
import { CATEGORIES, Profile, State } from '../domain/types'
import { Bar, hasFake, Icon, Ribbon, useApp } from './parts'

export const rangeOf = (age: number): Profile['ageRange'] => (age < 18 ? 'moins_18' : age < 65 ? '18_64' : '65_plus')
export const profileComplete = (p: Profile) => !!(p.age && p.sex && p.weightKg)

function ProfileFields({ p, onChange }: { p: Profile; onChange: (p: Profile) => void }) {
  const set = (x: Partial<Profile>) => onChange({ ...p, ...x })
  const num = (v: string) => { const n = Number(v.replace(',', '.')); return v.trim() && Number.isFinite(n) ? n : undefined }
  const ageErr = p.age !== undefined && (p.age < 1 || p.age > 120)
  const wErr = p.weightKg !== undefined && (p.weightKg < 20 || p.weightKg > 300)
  return (
    <>
      <div className="grid2">
        <div className="field"><label htmlFor="age">Âge <span className="help">obligatoire</span></label>
          <input id="age" className="inp num" inputMode="numeric" value={p.age ?? ''} onChange={(e) => { const a = num(e.target.value); set({ age: a, ageRange: a ? rangeOf(a) : undefined }) }} placeholder="ans" />
          {ageErr && <span className="err">Entre 1 et 120 ans.</span>}</div>
        <div className="field"><label htmlFor="w">Poids <span className="help">obligatoire</span></label>
          <input id="w" className="inp num" inputMode="decimal" value={p.weightKg ?? ''} onChange={(e) => set({ weightKg: num(e.target.value) })} placeholder="kg" />
          {wErr && <span className="err">Entre 20 et 300 kg.</span>}</div>
      </div>
      <div className="field"><span className="fl" id="sx">Sexe <span className="help">obligatoire</span></span>
        <div className="chips" role="radiogroup" aria-labelledby="sx">
          {([['femme', 'Femme'], ['homme', 'Homme']] as const).map(([k, l]) => <button key={k} role="radio" className="chip" aria-checked={p.sex === k} aria-pressed={p.sex === k} onClick={() => set({ sex: k, ...(k === 'homme' ? { pregnancy: undefined, breastfeeding: undefined } : {}) })}>{l}</button>)}
        </div></div>
      {p.sex === 'femme' && (
        <div className="field"><span className="fl">Grossesse ou allaitement <span className="help">facultatif</span></span>
          <div className="chips">
            <button className="chip" aria-pressed={p.pregnancy === 'oui'} onClick={() => set({ pregnancy: p.pregnancy === 'oui' ? undefined : 'oui' })}>Enceinte</button>
            <button className="chip" aria-pressed={p.breastfeeding === 'oui'} onClick={() => set({ breastfeeding: p.breastfeeding === 'oui' ? undefined : 'oui' })}>J’allaite</button>
          </div><span className="help">Sert seulement aux repères caféine adaptés.</span></div>
      )}
    </>
  )
}

const valid = (p: Profile) => profileComplete(p) && p.age! >= 1 && p.age! <= 120 && p.weightKg! >= 20 && p.weightKg! <= 300

export function Welcome() {
  const { st, set } = useApp()
  const [step, setStep] = useState(0)
  const [p, setP] = useState<Profile>(st.profile)
  if (step === 0) return (
    <>
      <main className="main">
        <div className="hero">
          <div className="logo"><Icon n="glass" /></div>
          <h2>Gorgée</h2>
          <p>Note ce que tu bois, vois ce que ça t’apporte, et sache où tu en es dans la journée.</p>
        </div>
        <ul className="pts">
          <li><Icon n="check" />Quantité réellement bue, composition et cumuls du jour.</li>
          <li><Icon n="check" />Un avis après chaque boisson, appuyé sur des repères officiels (EFSA, ANSES).</li>
          <li><Icon n="check" />Tes thés, infusions et recettes maison sans sucre ajouté.</li>
          <li><Icon n="check" />Tes séances de sport et ce qu’il faut boire après.</li>
          <li><Icon n="check" />Tes données restent sur ton téléphone. Rien n’est envoyé.</li>
        </ul>
        <p className="note"><Icon n="info" />Gorgée informe, elle ne pose pas de diagnostic et ne garantit pas qu’une consommation est sans risque.</p>
      </main>
      <div className="fab"><button className="btn" onClick={() => setStep(1)}>Commencer</button></div>
    </>
  )
  return (
    <>
      <Bar title="Ton profil" onBack={() => setStep(0)} />
      <main className="main">
        <p className="help" style={{ padding: '0 4px' }}>Âge, sexe et poids choisissent les repères qui s’appliquent à toi (eau, caféine, sucres, sport). Ils restent sur ton appareil.</p>
        <ProfileFields p={p} onChange={setP} />
      </main>
      <div className="fab" style={{ flexDirection: 'column' }}>
        <button className="btn" disabled={!valid(p)} onClick={() => set((s) => ({ ...s, profile: p, onboarded: true }))}>Continuer</button>
        <button className="btn sec" disabled={!valid(p)} onClick={() => set((s) => ({ ...demoData({ ...s, profile: p }), onboarded: true }))}>Continuer avec des données fictives</button>
      </div>
    </>
  )
}

const download = async (name: string, text: string, type: string) => {
  // Appli iPhone : le téléchargement n'existe pas, on passe par la feuille de partage (Fichiers, AirDrop, mail…).
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
    const { Share } = await import('@capacitor/share')
    const f = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: name, url: f.uri })
    return
  }
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
export function toCsv(s: State) {
  const byId = new Map(s.drinks.map((d) => [d.id, d]))
  const rows = [['date_heure', 'boisson', 'categorie', 'quantite_bue_ml', 'ajouts', 'note', 'fictif']]
  for (const i of [...s.intakes].sort((a, b) => a.at.localeCompare(b.at))) {
    const d = byId.get(i.drinkId)
    rows.push([i.at, d?.name ?? '', d ? CATEGORIES[d.category] : '', String(i.ml), i.additions.join(' + '), i.note ?? '', i.fake ? 'oui' : ''])
  }
  return rows.map((r) => r.map(csvCell).join(';')).join('\n')
}

export function Settings() {
  const { st, set, toast } = useApp()
  const [p, setP] = useState<Profile>(st.profile)
  const [ask, setAsk] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(p) !== JSON.stringify(st.profile)
  const stamp = new Date().toISOString().slice(0, 10)
  const toggleNotif = async () => {
    const on = !st.profile.notifications
    if (on && 'Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission() } catch { /* refus */ } }
    set((s) => ({ ...s, profile: { ...s.profile, notifications: on } })); setP((x) => ({ ...x, notifications: on }))
  }
  const importFile = async (f?: File) => {
    if (!f) return
    try {
      const data = JSON.parse(await f.text()) as State
      if (data.version !== 1 || !Array.isArray(data.intakes) || !Array.isArray(data.drinks)) throw new Error()
      set(() => ({ ...data, onboarded: true })); toast('Sauvegarde restaurée')
    } catch { toast('Fichier non reconnu : choisis une sauvegarde Gorgée (.json)') }
  }
  return (
    <>
      <Ribbon show={hasFake(st)} />
      <header className="bar large"><h1>Profil</h1></header>
      <main className="main">
        <div className="sect">Mes informations</div>
        <section className="card">
          <ProfileFields p={p} onChange={setP} />
          {dirty && <button className="btn sm" disabled={!valid(p)} onClick={() => { set((s) => ({ ...s, profile: { ...p, notifications: s.profile.notifications } })); toast('Profil enregistré, avis recalculés') }}>Enregistrer le profil</button>}
        </section>
        <div className="field"><label htmlFor="pro">Consignes d’un professionnel de santé <span className="help">facultatif</span></label>
          <textarea id="pro" className="inp" value={st.profile.proInstructions ?? ''} onChange={(e) => set((s) => ({ ...s, profile: { ...s.profile, proInstructions: e.target.value || undefined } }))} placeholder="Ex. limiter le café à 2 tasses (consigne de mon médecin)" />
          <span className="help">Affichées à part, elles ne modifient pas les repères généraux.</span></div>

        <div className="sect">Notifications</div>
        <section className="list">
          <div className="row" style={{ cursor: 'default' }}>
            <span className="m"><b>Alertes de dépassement</b><small>Une seule fois par dépassement, pas de répétition.</small></span>
            <button className="sw" role="switch" aria-checked={st.profile.notifications} aria-label="Alertes de dépassement" onClick={toggleNotif}><i /></button>
          </div>
        </section>

        <div className="sect">Mes contenants</div>
        <section className="list">
          {st.containers.map((c) => (
            <div className="row" key={c.id} style={{ cursor: 'default' }}>
              <input className="inp" aria-label="Nom du contenant" value={c.name} style={{ flex: 1, background: 'var(--sunk)', boxShadow: 'none' }} onChange={(e) => set((s) => ({ ...s, containers: s.containers.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) }))} />
              <input className="inp num" aria-label={`Volume de ${c.name} en ml`} inputMode="numeric" value={c.ml} style={{ width: 84, background: 'var(--sunk)', boxShadow: 'none' }} onChange={(e) => { const n = Number(e.target.value); if (n >= 0 && n <= 5000) set((s) => ({ ...s, containers: s.containers.map((x) => (x.id === c.id ? { ...x, ml: n } : x)) })) }} />
              <span className="help">ml</span>
              <button className="ib" aria-label={`Supprimer ${c.name}`} onClick={() => set((s) => ({ ...s, containers: s.containers.filter((x) => x.id !== c.id) }))} style={{ color: 'var(--over)' }}><Icon n="trash" /></button>
            </div>
          ))}
          <button className="link" onClick={() => set((s) => ({ ...s, containers: [...s.containers, { id: uid(), name: 'Nouveau contenant', ml: 300 }] }))}><Icon n="plus" />Ajouter un contenant</button>
        </section>

        <div className="sect">Mes données</div>
        <section className="list">
          <button className="link" onClick={() => { download(`gorgee-sauvegarde-${stamp}.json`, JSON.stringify(st, null, 2), 'application/json'); toast('Sauvegarde téléchargée') }}><Icon n="download" />Sauvegarder toutes mes données (.json)</button>
          <button className="link" onClick={() => file.current?.click()}><Icon n="doc" />Restaurer une sauvegarde</button>
          <button className="link" onClick={() => { download(`gorgee-journal-${stamp}.csv`, toCsv(st), 'text/csv'); toast('Journal exporté') }}><Icon n="list" />Exporter le journal (.csv)</button>
          {hasFake(st)
            ? <button className="link" onClick={() => { set(removeDemo); toast('Données fictives retirées') }}><Icon n="close" />Retirer les données fictives</button>
            : <button className="link" onClick={() => { set((s) => demoData(s)); toast('Données fictives ajoutées') }}><Icon n="plus" />Ajouter des données fictives</button>}
          <button className="link" style={{ color: 'var(--over)' }} onClick={() => setAsk(true)}><Icon n="trash" />Supprimer toutes mes données</button>
        </section>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
        <p className="note"><Icon n="info" />Tes données sont stockées sur cet appareil et conservées lors des mises à jour de l’appli. Fais une sauvegarde avant de changer de téléphone ou de supprimer l’appli.</p>
        <p className="note"><Icon n="info" />Gorgée ne transmet rien à un service tiers. Elle ne gère pas les maladies ni les interactions médicamenteuses. Aucune conformité juridique n’est revendiquée.</p>
      </main>
      {ask && (
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="da"><div>
          <h3 id="da">Supprimer toutes tes données ?</h3>
          <p className="help">Journal, fiches, recettes, séances et profil seront effacés de cet appareil. Pense à faire une sauvegarde avant.</p>
          <button className="btn danger" onClick={() => { set(() => emptyState()); setAsk(false) }}>Tout supprimer</button>
          <button className="btn sec" onClick={() => setAsk(false)}>Annuler</button>
        </div></div>
      )}
    </>
  )
}
