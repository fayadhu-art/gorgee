import { useState } from 'react'
import { fmtVal, per100, SHOWN, SOURCE_LABEL, usesBase } from '../domain/calc'
import { uid } from '../domain/store'
import { CATEGORIES, Category, Drink, isKnown, Nutrient, NUTRIENT_KEYS, NUTRIENTS, nlabel, Trait, TRAITS, Val, Source } from '../domain/types'
import { Bar, CAT_COLOR, CAT_ICON, drinkSub, hasFake, Icon, Ribbon, useApp, ValInput, MISSING_OPTS, StateBox } from './parts'

const STEPS = ['Identification', 'Valeurs nutritionnelles', 'Ingrédients (facultatif)', 'Vérification']
type TextStatus = string // texte libre, ou un statut explicite

function TextOrStatus({ id, label, value, onChange, area }: { id: string; label: string; value?: TextStatus; onChange: (v: string) => void; area?: boolean }) {
  const isStatus = MISSING_OPTS.some((o) => o.label === value)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {area
        ? <textarea id={id} className="inp" value={isStatus ? '' : value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={isStatus} />
        : <input id={id} className="inp" value={isStatus ? '' : value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={isStatus} />}
      <div className="chips">
        {MISSING_OPTS.filter((o) => o.k !== 'non_applicable').map((o) => (
          <button key={o.k} className="chip" aria-pressed={value === o.label} onClick={() => onChange(value === o.label ? '' : o.label)} style={{ fontSize: 13.5 }}>{o.label}</button>
        ))}
      </div>
    </div>
  )
}

export function ProductForm({ drinkId, cat, name, draft, scanned, scanErr, step: step0 }: { drinkId?: string; cat?: Category; name?: string; draft?: Drink; scanned?: number; scanErr?: string; step?: number }) {
  const { st, set, back, go, toast } = useApp()
  const ex = st.drinks.find((d) => d.id === drinkId)
  const [step, setStep] = useState(step0 ?? 0)
  const [d, setD] = useState<Drink>(ex ?? draft ?? {
    id: uid(), kind: 'commerce', name: name ?? '', category: cat ?? 'soda', traits: [], basis: { kind: '100ml' }, values: {}, alcoholPct: { missing: 'non_applicable' },
  })
  const up = (p: Partial<Drink>) => setD((x) => ({ ...x, ...p }))
  const setVal = (n: Nutrient, v?: Val) => setD((x) => { const values = { ...x.values }; if (v) values[n] = v; else delete values[n]; return { ...x, values } })
  const toggleTrait = (t: Trait) => up({ traits: d.traits.includes(t) ? d.traits.filter((x) => x !== t) : [...d.traits, t] })
  const errs: string[][] = [
    [!d.name.trim() && 'Indique le nom du produit.', d.capacityMl !== undefined && !(d.capacityMl > 0) && 'La contenance doit être supérieure à zéro.'].filter(Boolean) as string[],
    [d.basis.kind === 'portion' && !(d.basis.portionMl > 0) && 'Indique la taille de la portion en ml.'].filter(Boolean) as string[],
    [],
    [],
  ]
  const ok = errs[step].length === 0
  const fillBlank = () => setD((x) => { const values = { ...x.values }; NUTRIENT_KEYS.forEach((n) => { if (!values[n]) values[n] = { missing: 'non_indique' } }); return { ...x, values } })
  const saveIt = () => {
    set((s) => ({ ...s, drinks: ex ? s.drinks.map((x) => (x.id === d.id ? d : x)) : [...s.drinks, d] }))
    toast(ex ? 'Fiche mise à jour, les avis se recalculent' : 'Fiche enregistrée, réutilisable')
    back()
    if (!ex) go({ s: 'intake', drinkId: d.id })
  }
  return (
    <>
      <Ribbon show={!!d.fake} />
      <Bar title={ex ? 'Modifier la fiche' : 'Nouvelle fiche produit'} sub={`Étape ${step + 1} sur 4 · ${STEPS[step]}`} onBack={() => (step ? setStep(step - 1) : back())} />
      <main className="main">
        <div className="steps" aria-hidden="true">{STEPS.map((s, i) => <i key={s} className={i <= step ? 'on' : ''} />)}</div>
        {scanned !== undefined && step < 2 && <StateBox k={scanned ? 'information' : 'incomplete'} title={scanned ? `${scanned} valeur${scanned > 1 ? 's' : ''} lue${scanned > 1 ? 's' : ''} sur tes photos` : 'Aucune valeur lue'}>
          <p>{scanned ? 'Compare chaque champ avec l’étiquette et corrige si besoin. Une case restée vide sera notée « Non indiqué sur l’étiquette », jamais zéro.' : 'Saisis les valeurs à la main, ou reprends une photo plus nette du tableau.'}</p>{scanErr && <p className="help">Détail technique : {scanErr}</p>}{Object.values(d.values).some((v) => v && 'lt' in v) && <p className="help">Les valeurs « &lt; » de l’étiquette sont gardées comme maximum (bouton « &lt; » allumé).</p>}</StateBox>}
        {step === 0 && <>
          <div className="field"><label htmlFor="nm">Nom</label><input id="nm" className="inp" value={d.name} onChange={(e) => up({ name: e.target.value })} placeholder="Ex. Limonade citron" /></div>
          <div className="field"><label htmlFor="br">Marque <span className="help">(facultatif)</span></label><input id="br" className="inp" value={d.brand ?? ''} onChange={(e) => up({ brand: e.target.value || undefined })} /></div>
          <div className="field"><label htmlFor="ct">Catégorie</label>
            <select id="ct" className="inp" value={d.category} onChange={(e) => up({ category: e.target.value as Category })}>
              {(Object.keys(CATEGORIES) as Category[]).filter((c) => c !== 'maison').map((c) => <option key={c} value={c}>{CATEGORIES[c]}</option>)}
            </select></div>
          <div className="field"><span className="fl" id="tr">Caractéristiques</span>
            <div className="chips" role="group" aria-labelledby="tr">{(Object.keys(TRAITS) as Trait[]).filter((t) => t !== 'maison').map((t) => <button key={t} className="chip" aria-pressed={d.traits.includes(t)} onClick={() => toggleTrait(t)}>{TRAITS[t]}</button>)}</div>
            <span className="help">Indépendantes de la catégorie : une boisson gazeuse n’est pas classée sucrée pour autant.</span></div>
          <div className="grid2">
            <div className="field"><label htmlFor="cap">Contenance (ml)</label><input id="cap" className="inp num" inputMode="numeric" value={d.capacityMl ?? ''} onChange={(e) => up({ capacityMl: e.target.value ? Number(e.target.value) : undefined })} /></div>
            <div className="field"><label htmlFor="bc">Code-barres <span className="help">(facult.)</span></label><input id="bc" className="inp num" inputMode="numeric" value={d.barcode ?? ''} onChange={(e) => up({ barcode: e.target.value || undefined })} /></div>
          </div>
        </>}
        {step === 2 && <>
          <TextOrStatus id="ing" area label="Liste des ingrédients" value={d.ingredients} onChange={(v) => up({ ingredients: v })} />
          <TextOrStatus id="al" label="Allergènes mentionnés" value={d.allergens} onChange={(v) => up({ allergens: v })} />
          <TextOrStatus id="ed" label="Édulcorants mentionnés" value={d.sweeteners} onChange={(v) => up({ sweeteners: v })} />
          <TextOrStatus id="wr" area label="Avertissements et précautions de l’emballage" value={d.warnings} onChange={(v) => up({ warnings: v })} />
        </>}
        {step === 1 && <>
          <p className="help" style={{ padding: '0 4px' }}>Recopie le tableau nutritionnel de l’étiquette. Une case laissée vide sera notée « Non indiqué sur l’étiquette », jamais zéro.</p>
          <div className="field"><span className="fl" id="bs">Les valeurs de l’étiquette sont données</span>
            <div className="chips" role="group" aria-labelledby="bs">
              <button className="chip" aria-pressed={d.basis.kind === '100ml'} onClick={() => up({ basis: { kind: '100ml' } })}>Pour 100 ml</button>
              <button className="chip" aria-pressed={d.basis.kind === 'portion'} onClick={() => up({ basis: { kind: 'portion', portionMl: d.capacityMl ?? 250 } })}>Par portion</button>
            </div></div>
          {d.basis.kind === 'portion' && <div className="field"><label htmlFor="pm">Taille de la portion (ml)</label><input id="pm" className="inp num" inputMode="numeric" value={d.basis.portionMl || ''} onChange={(e) => up({ basis: { kind: 'portion', portionMl: Number(e.target.value) } })} /></div>}
          <section className="card" aria-label="Valeurs nutritionnelles">
            {NUTRIENT_KEYS.filter((n) => n !== 'energie_kj' || isKnown(d.values[n])).map((n) => <ValInput key={n} id={'v-' + n} label={NUTRIENTS[n].label} unit={NUTRIENTS[n].unit} value={d.values[n]} onChange={(v) => setVal(n, v)} src="etiquette" />)}
            <ValInput id="v-alc" label="Degré d’alcool" unit="% vol" value={d.alcoholPct} onChange={(v) => up({ alcoholPct: v })} src="etiquette" />
          </section>
                    <div className="field"><label htmlFor="mn">Autres éléments (minéraux…) <span className="help">avec unités</span></label><input id="mn" className="inp" value={d.minerals ?? ''} onChange={(e) => up({ minerals: e.target.value || undefined })} placeholder="Ex. calcium 12 mg/100 ml" /></div>
          <p className="note"><Icon n="info" />Une case vide n’est jamais comptée comme zéro.</p>
        </>}
        {step === 3 && <DrinkCard d={d} />}
        {errs[step].map((e) => <p className="err" key={e} role="alert">{e}</p>)}
      </main>
      <div className="fab">
        {step < 3 ? <button className="btn" disabled={!ok} onClick={() => { if (step === 1) fillBlank(); setStep(step + 1) }}>Continuer</button>
          : <button className="btn" onClick={saveIt}><Icon n="check" />{ex ? 'Enregistrer' : 'Enregistrer et saisir une consommation'}</button>}
      </div>
    </>
  )
}

export function DrinkCard({ d }: { d: Drink }) {
  return (
    <section className="card">
      <div><b style={{ fontSize: 18 }}>{d.name || 'Sans nom'}</b><br /><span className="help">{drinkSub(d)}</span></div>
      {d.traits.length > 0 && <div className="chips">{d.traits.map((t) => <span key={t} className="tag t-est">{TRAITS[t]}</span>)}</div>}
      <table className="tbl"><tbody>
        {d.ingredients !== undefined && <tr><td className="dim">Ingrédients</td><td style={{ fontFamily: 'inherit' }}>{d.ingredients || '—'}</td></tr>}
        {d.allergens !== undefined && <tr><td className="dim">Allergènes</td><td style={{ fontFamily: 'inherit' }}>{d.allergens || '—'}</td></tr>}
        {d.sweeteners !== undefined && <tr><td className="dim">Édulcorants</td><td style={{ fontFamily: 'inherit' }}>{d.sweeteners || '—'}</td></tr>}
        {d.warnings !== undefined && <tr><td className="dim">Avertissements</td><td style={{ fontFamily: 'inherit' }}>{d.warnings || '—'}</td></tr>}
      </tbody></table>
      <span className="lbl">Pour 100 ml{d.basis.kind === 'portion' ? ` (calculé depuis une portion de ${d.basis.portionMl} ml)` : ''}</span>
      <table className="tbl"><tbody>
        {SHOWN.map((n) => { const x = per100(d, n); return (
          <tr key={n}><td>{nlabel(n)}{isKnown(x) && x.src !== 'base' && x.src !== 'etiquette' && <span className="help"> · {SOURCE_LABEL[x.src]}</span>}</td><td>{fmtVal(x, NUTRIENTS[n].unit, 2)}</td></tr>
        ) })}
        {d.alcoholPct && <tr><td>Degré d’alcool</td><td>{fmtVal(d.alcoholPct, '% vol')}</td></tr>}
        {d.minerals && <tr><td>Autres</td><td style={{ fontFamily: 'inherit' }}>{d.minerals}</td></tr>}
      </tbody></table>
    </section>
  )
}

export function DrinkDetail({ drinkId }: { drinkId: string }) {
  const { st, set, back, go, toast } = useApp()
  const d = st.drinks.find((x) => x.id === drinkId)
  const [ask, setAsk] = useState(false)
  if (!d) return <><Bar title="Fiche" onBack={back} /><main className="main"><p>Fiche supprimée.</p></main></>
  const used = st.intakes.filter((i) => i.drinkId === d.id).length
  const edit = () => go(d.kind === 'commerce' ? { s: 'product', drinkId: d.id } : d.kind === 'the' ? { s: 'tea', drinkId: d.id } : d.kind === 'recette' ? { s: 'recipe', drinkId: d.id } : { s: 'product', drinkId: d.id })
  return (
    <>
      <Ribbon show={!!d.fake} />
      <Bar title="Fiche" onBack={back} right={<button className="ib" aria-label={d.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={!!d.favorite} onClick={() => set((s) => ({ ...s, drinks: s.drinks.map((x) => (x.id === d.id ? { ...x, favorite: !x.favorite } : x)) }))} style={{ color: d.favorite ? 'var(--accent)' : undefined }}><Icon n="star" /></button>} />
      <main className="main">
        {d.status === 'brouillon' && <div className="state s-incomplete"><Icon n="part" /><div><h4>Brouillon non validé</h4><p>Cette recette ne peut pas être utilisée tant que tous ses ingrédients ne sont pas précisés.</p></div></div>}
        {d.kind === 'recette' && d.status !== 'brouillon' && <p className="tag t-ok">Sans sucre ajouté · règle de la fonctionnalité, pas une certification</p>}
        <DrinkCard d={d} />
        {d.recipe && (
          <section className="card"><span className="lbl">Préparation</span>
            <table className="tbl"><tbody>
              {d.recipe.ingredients.map((i) => <tr key={i.id}><td>{i.name}{i.infused ? ' (infusé)' : ''}</td><td>{i.qty ?? '?'} {i.unit === 'cuillere' ? 'cuillère' : i.unit}{i.unitNote ? ` · ${i.unitNote}` : ''}</td></tr>)}
              {d.recipe.waterMl && <tr><td>Eau</td><td>{d.recipe.waterMl} ml</td></tr>}
              <tr><td>Volume final</td><td>{d.recipe.finalMl ?? '?'} ml</td></tr>
              {d.recipe.steepMin && <tr><td>Infusion</td><td>{d.recipe.steepMin} min{d.recipe.tempC ? ` à ${d.recipe.tempC} °C` : ''}</td></tr>}
            </tbody></table>
            {d.valuesSourceNote && <p className="help">Source des valeurs : {d.valuesSourceNote}</p>}
          </section>
        )}
        {usesBase(d) && <p className="note"><Icon n="info" />Valeurs moyennes pour ce type de boisson. Pour un produit précis, ajoute sa fiche avec deux photos.</p>}
        {d.status !== 'brouillon' && <button className="btn" onClick={() => go({ s: 'intake', drinkId: d.id })}><Icon n="plus" />Saisir une consommation</button>}
        {d.kind !== 'generique' && <button className="btn sec" onClick={edit}><Icon n="edit" />Modifier la fiche</button>}
        {d.kind !== 'generique' && <button className="btn danger" onClick={() => setAsk(true)}><Icon n="trash" />Supprimer la fiche</button>}
      </main>
      {ask && (
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sd"><div>
          <h3 id="sd">Supprimer « {d.name} » ?</h3>
          <p className="help">{used ? `${used} consommation${used > 1 ? 's' : ''} l’utilise${used > 1 ? 'nt' : ''}. Elles resteront dans le journal avec un volume, mais sans composition.` : 'Aucune consommation ne l’utilise.'}</p>
          <button className="btn danger" onClick={() => { set((s) => ({ ...s, drinks: s.drinks.filter((x) => x.id !== d.id) })); toast('Fiche supprimée'); back() }}>Supprimer</button>
          <button className="btn sec" onClick={() => setAsk(false)}>Annuler</button>
        </div></div>
      )}
    </>
  )
}

export function Library() {
  const { st, go, back } = useApp()
  const [tab, setTab] = useState<'tout' | 'the' | 'recette' | 'commerce'>('tout')
  const [q, setQ] = useState('')
  const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const list = st.drinks.filter((d) => fold(q).split(/\s+/).every((w) => fold(`${d.name} ${d.brand ?? ''} ${CATEGORIES[d.category]}`).includes(w))).filter((d) => tab === 'tout' || d.kind === tab || (tab === 'the' && (d.category === 'the' || d.category === 'infusion') && d.kind !== 'generique'))
  return (
    <>
      <Ribbon show={hasFake(st)} />
      <Bar title="Mes boissons" onBack={back} />
      <main className="main">
        <label className="search"><Icon n="search" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher dans mes boissons" aria-label="Chercher dans mes boissons" /></label>
        <div className="chips" role="group" aria-label="Filtrer">
          {([['tout', 'Toutes'], ['the', 'Thés et infusions'], ['recette', 'Recettes'], ['commerce', 'Commerce']] as const).map(([k, l]) => <button key={k} className="chip" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <section className="list">
          {list.length === 0 && <div className="empty"><Icon n="tea" /><p>Rien ici pour l’instant.</p></div>}
          {list.map((d) => (
            <button className="row" key={d.id} onClick={() => go({ s: 'drink', drinkId: d.id })}>
              <span className="ic" style={{ background: CAT_COLOR[d.category] }}><Icon n={CAT_ICON[d.category]} /></span>
              <span className="m"><b>{d.name}{d.favorite ? ' ★' : ''}</b><small>{[drinkSub(d) === d.name ? 'Valeurs moyennes' : drinkSub(d), d.status === 'brouillon' ? 'brouillon' : '', d.fake ? 'fictif' : ''].filter(Boolean).join(' · ')}</small></span>
              <Icon n="next" />
            </button>
          ))}
        </section>
        <div className="list">
        <button className="link" onClick={() => go({ s: 'scan', cat: 'the' })}><Icon n="tea" />Ajouter un thé (2 photos)</button>
        <button className="link" onClick={() => go({ s: 'tea', kind: 'infusion' })}><Icon n="leaf" />Créer une infusion</button>
        <button className="link" onClick={() => go({ s: 'recipe' })}><Icon n="doc" />Créer une recette maison sans sucre ajouté</button>
        <button className="link" onClick={() => go({ s: 'scan' })}><Icon n="camera" />Ajouter une boisson du commerce (2 photos)</button>
        </div>
      </main>
    </>
  )
}

export type { Source }
