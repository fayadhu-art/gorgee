import { useState } from 'react'
import { fmt, fmtVal } from '../domain/calc'
import { checkIngredient, checkRecipe, isWater, recipeNutrient } from '../domain/recipe'
import { uid } from '../domain/store'
import { Drink, Ingredient, isKnown, nlabel, Nutrient, NUTRIENTS, Prep, Recipe, Source, Unit, Val } from '../domain/types'
import { Bar, Icon, useApp, ValInput, StateBox } from './parts'

const UNITS: [Unit, string][] = [['g', 'g'], ['ml', 'ml'], ['sachet', 'sachet'], ['cuillere', 'cuillère'], ['piece', 'pièce']]
const SHOWN: Nutrient[] = ['sucres', 'energie_kcal', 'cafeine']
const YN = [['non', 'Non'], ['oui', 'Oui'], ['inconnu', 'Je ne sais pas']] as const

const newIng = (name = ''): Ingredient => ({ id: uid(), name, unit: 'g', sweetener: 'inconnu', addedSugar: 'inconnu' })

function IngredientEditor({ i, onChange, onRemove, prep, checkSugar }: { i: Ingredient; onChange: (i: Ingredient) => void; onRemove: () => void; prep: Prep; checkSugar: boolean }) {
  const [open, setOpen] = useState(!!i.per100)
  const up = (p: Partial<Ingredient>) => onChange({ ...i, ...p })
  const c = checkIngredient(i)
  const water = isWater(i.name)
  return (
    <div className="ingr">
      <div className="top">
        <input className="inp" aria-label="Nom de l’ingrédient" value={i.name} onChange={(e) => up({ name: e.target.value })} placeholder="Ex. menthe fraîche" />
        <button className="ib" aria-label={`Retirer ${i.name || 'l’ingrédient'}`} onClick={onRemove} style={{ color: 'var(--over)' }}><Icon n="trash" /></button>
      </div>
      <div className="qty">
        <input className="inp num" style={{ width: 96, fontSize: 17, fontWeight: 500 }} inputMode="decimal" aria-label="Quantité" placeholder="Qté" value={i.qty ?? ''} onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); up({ qty: e.target.value && Number.isFinite(n) ? n : undefined }) }} />
        <select className="inp" aria-label="Unité" style={{ flex: 1, fontSize: 17, fontWeight: 500, textAlign: 'left' }} value={i.unit} onChange={(e) => up({ unit: e.target.value as Unit })}>{UNITS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      {(i.unit === 'cuillere' || i.unit === 'sachet' || i.unit === 'piece') && <input className="inp" aria-label="Précision sur l’unité" value={i.unitNote ?? ''} onChange={(e) => up({ unitNote: e.target.value || undefined })} placeholder="Précision si connue, ex. cuillère à café rase ≈ 2 g" />}
      {prep !== 'melange' && !water && (
        <label className="check" style={{ padding: 0, background: 'none', fontWeight: 500 }}><input type="checkbox" checked={!!i.infused} onChange={(e) => up({ infused: e.target.checked })} />Infusé puis retiré (feuilles, épices…)</label>
      )}
      {checkSugar && !water && <>
        <div className="field"><span className="fl" style={{ fontSize: 14 }}>Sert-il à sucrer ?</span>
          <div className="chips">{YN.map(([k, l]) => <button key={k} className="chip" aria-pressed={i.sweetener === k} onClick={() => up({ sweetener: k })}>{l}</button>)}</div></div>
        <div className="field"><span className="fl" style={{ fontSize: 14 }}>Contient-il du sucre ajouté ? <span className="help">(produit transformé : lait végétal, jus…)</span></span>
          <div className="chips">{YN.map(([k, l]) => <button key={k} className="chip" aria-pressed={i.addedSugar === k} onClick={() => up({ addedSugar: k })}>{l}</button>)}</div></div>
        {c.status === 'refuse' && <p className="err">{c.reason}</p>}
        {c.status === 'a_preciser' && <p className="help" style={{ color: 'var(--part)' }}>{c.reason}</p>}
        {c.status === 'ok' && c.note && <p className="help">{c.note}</p>}
      </>}
      {!water && <button className="a" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Masquer la composition' : 'Composition connue (pour 100 g ou 100 ml)'}</button>}
      {open && !water && SHOWN.map((n) => (
        <ValInput key={n} id={`${i.id}-${n}`} label={nlabel(n)} unit={NUTRIENTS[n].unit} value={i.per100?.[n]} src="utilisateur"
          onChange={(v) => { const per100 = { ...(i.per100 ?? {}) }; if (v) per100[n] = v; else delete per100[n]; up({ per100 }) }} />
      ))}
    </div>
  )
}

export function RecipeForm({ drinkId, tea, teaKind, initialName }: { drinkId?: string; tea?: boolean; teaKind?: 'the' | 'infusion'; initialName?: string }) {
  const { st, set, back, go, toast } = useApp()
  const ex = st.drinks.find((d) => d.id === drinkId)
  const [name, setName] = useState(ex?.name ?? initialName ?? '')
  const [cat] = useState<'the' | 'infusion' | 'maison'>(ex ? (ex.category as 'the') : tea ? teaKind ?? 'the' : 'maison')
  const [homemade, setHomemade] = useState(ex ? ex.traits.includes('maison') : !tea)
  const [more, setMore] = useState(!tea)
  const [caff, setCaff] = useState(ex ? ex.traits.includes('cafeinee') : !!tea && teaKind !== 'infusion')
  const [r0, setR] = useState<Recipe>(ex?.recipe ?? { ingredients: tea ? [] : [newIng()], prep: tea ? 'infusion' : 'melange', confirmedNoAddedSugar: false, finalMl: tea ? 250 : undefined })
  // Thé et infusion en saisie rapide : la composition minimale est la boisson elle-même.
  const r: Recipe = tea && !r0.ingredients.some((i) => i.name.trim()) && name.trim() ? { ...r0, ingredients: [{ ...newIng(name.trim()), id: 'auto' }] } : r0
  const [manual, setManual] = useState<Partial<Record<Nutrient, Val>>>(ex && ex.valuesSourceNote ? ex.values : {})
  const [manualSrc, setManualSrc] = useState<Source>('utilisateur')
  const [srcNote, setSrcNote] = useState(ex?.valuesSourceNote ?? '')
  const up = (p: Partial<Recipe>) => setR((x) => ({ ...x, ...p }))
  const ingText = r0.ingredients.map((i) => i.name).join(', ')
  const setIngText = (t: string) => setR((x) => ({ ...x, ingredients: t.split(',').map((n) => n.trim()).filter(Boolean).map((n) => x.ingredients.find((i) => i.name === n) ?? newIng(n)) }))
  const checkSugar = !tea || homemade
  const chk = checkRecipe(r)
  const status = checkSugar ? chk.status : (!r.ingredients.length || !(r.finalMl && r.finalMl > 0) ? 'brouillon' : 'conforme')
  const computed = Object.fromEntries(SHOWN.map((n) => [n, recipeNutrient(r, n)])) as Record<Nutrient, ReturnType<typeof recipeNutrient>>
  const hasManual = Object.keys(manual).length > 0
  const num = (v: string) => { const n = Number(v.replace(',', '.')); return v.trim() && Number.isFinite(n) && n > 0 ? n : undefined }
  const save = (asDraft: boolean) => {
    const values: Drink['values'] = {}
    for (const n of SHOWN) values[n] = manual[n] ?? computed[n].per100
    const d: Drink = {
      id: ex?.id ?? uid(), kind: tea ? 'the' : 'recette', name: name.trim(), category: tea ? cat : 'maison',
      traits: [...(homemade || !tea ? ['maison' as const] : []), ...(caff ? ['cafeinee' as const] : [])],
      basis: { kind: '100ml' }, values, recipe: r, status: asDraft ? 'brouillon' : 'valide', favorite: ex?.favorite ?? true,
      valuesSourceNote: hasManual ? `${srcNote || 'saisie manuelle'} (${manualSrc === 'estimation' ? 'estimation' : manualSrc === 'etiquette' ? 'étiquette' : manualSrc === 'base' ? 'base documentée' : 'saisie personnelle'})` : undefined,
    }
    set((s) => ({ ...s, drinks: ex ? s.drinks.map((x) => (x.id === d.id ? d : x)) : [...s.drinks, d] }))
    toast(asDraft ? 'Brouillon enregistré, non utilisable pour l’instant' : 'Enregistré dans tes favoris')
    back()
    if (!asDraft && !ex) go({ s: 'intake', drinkId: d.id })
  }
  const named = !!name.trim()
  return (
    <>
      <Bar title={ex ? 'Modifier' : tea ? (cat === 'infusion' ? 'Nouvelle infusion' : 'Nouveau thé') : 'Recette maison'} onBack={back} />
      <main className="main">
        {!tea && <StateBox k="information" title="Sans sucre ajouté uniquement"><p>Cette fonction est réservée aux préparations sans sucre, miel, sirop ni autre ingrédient sucrant. C’est une règle de l’appli, pas une certification.</p></StateBox>}
        <div className="field"><label htmlFor="rn">Nom</label><input id="rn" className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder={tea ? 'Ex. Thé vert menthe' : 'Ex. Eau citron gingembre'} /></div>
        {tea && <div className="field"><label htmlFor="ig">Composition <span className="help">séparée par des virgules</span></label><input id="ig" className="inp" value={ingText} onChange={(e) => setIngText(e.target.value)} placeholder={cat === 'infusion' ? 'Ex. verveine, menthe' : 'Ex. thé vert, menthe'} />
          <span className="help">Enregistrée une fois : ensuite tu choisis la quantité et tu valides.</span></div>}
        {tea && <button className="link" onClick={() => setMore(!more)}><Icon n={more ? 'back' : 'next'} />{more ? 'Masquer les détails' : 'Plus de détails (facultatif)'}</button>}
        {more && <>
        {tea && <>
          <div className="field"><label htmlFor="tt">Variété <span className="help">facultatif</span></label><input id="tt" className="inp" value={r.teaType ?? ''} onChange={(e) => up({ teaType: e.target.value || undefined })} placeholder="Ex. thé vert sencha, verveine…" /></div>
          <div className="list">
            <div className="row" style={{ cursor: 'default' }}><span className="m"><b>Préparation maison</b><small>Applique la règle « sans sucre ajouté ».</small></span><button className="sw" role="switch" aria-checked={homemade} aria-label="Préparation maison" onClick={() => setHomemade(!homemade)}><i /></button></div>
            <div className="row" style={{ cursor: 'default' }}><span className="m"><b>Contient de la caféine</b><small>Caractéristique seulement : aucune teneur n’est déduite.</small></span><button className="sw" role="switch" aria-checked={caff} aria-label="Contient de la caféine" onClick={() => setCaff(!caff)}><i /></button></div>
          </div>
        </>}
        <div className="field"><span className="fl">Mode de préparation</span>
          <div className="chips">{([['melange', 'Mélange'], ['infusion', 'Infusion'], ['filtration', 'Filtration']] as const).map(([k, l]) => <button key={k} className="chip" aria-pressed={r.prep === k} onClick={() => up({ prep: k })}>{l}</button>)}</div></div>
        <div className="sect">Ingrédients</div>
        {r.ingredients.map((i, k) => (
          <IngredientEditor key={i.id} i={i} prep={r.prep} checkSugar={checkSugar}
            onChange={(n) => up({ ingredients: r.ingredients.map((x, j) => (j === k ? n : x)) })}
            onRemove={() => up({ ingredients: r.ingredients.filter((_, j) => j !== k) })} />
        ))}
        <div className="chips">
          <button className="chip" onClick={() => up({ ingredients: [...r.ingredients, newIng()] })}><Icon n="plus" />Ingrédient</button>
          {['Citron', 'Menthe', 'Gingembre', 'Cannelle', 'Lait'].map((n) => <button key={n} className="chip" onClick={() => up({ ingredients: [...r.ingredients, newIng(n)] })}>+ {n}</button>)}
        </div>
        <div className="grid2">
          <div className="field"><label htmlFor="wv">Eau (ml)</label><input id="wv" className="inp num" inputMode="numeric" value={r.waterMl ?? ''} onChange={(e) => up({ waterMl: num(e.target.value) })} /></div>
          <div className="field"><label htmlFor="fv">Volume final (ml)</label><input id="fv" className="inp num" inputMode="numeric" value={r.finalMl ?? ''} onChange={(e) => up({ finalMl: num(e.target.value) })} /></div>
        </div>
        <span className="help" style={{ marginTop: -8, paddingLeft: 4 }}>Le volume final, mesuré ou estimé, sert à calculer les apports pour 100 ml.</span>
        {tea ? (
          <div className="grid2">
            <div className="field"><label htmlFor="sm">Infusion (min)</label><input id="sm" className="inp num" inputMode="decimal" value={r.steepMin ?? ''} onChange={(e) => up({ steepMin: num(e.target.value) })} placeholder="facultatif" /></div>
            <div className="field"><label htmlFor="tc">Température (°C)</label><input id="tc" className="inp num" inputMode="numeric" value={r.tempC ?? ''} onChange={(e) => up({ tempC: num(e.target.value) })} placeholder="facultatif" /></div>
          </div>
        ) : (
          <>
            <div className="field"><label htmlFor="pt">Nombre de portions <span className="help">facultatif</span></label><input id="pt" className="inp num" inputMode="numeric" value={r.portions ?? ''} onChange={(e) => up({ portions: num(e.target.value) })} /></div>
            <div className="field"><label htmlFor="ins">Instructions <span className="help">facultatif</span></label><textarea id="ins" className="inp" value={r.instructions ?? ''} onChange={(e) => up({ instructions: e.target.value || undefined })} /></div>
          </>
        )}

        <div className="sect">Apports estimés</div>
        <section className="card">
          <table className="tbl"><tbody>
            {SHOWN.map((n) => {
              const c = computed[n]; const m = manual[n]; const per = (r.finalMl && r.portions) ? r.finalMl / r.portions : undefined
              const shown = m ?? c.per100
              return <tr key={n}><td>{nlabel(n)}<br /><span className="help">{m ? 'saisie manuelle' : c.complete ? 'calculé (estimation)' : c.knownSum > 0 ? `au moins ${fmt(c.knownSum)} ${NUTRIENTS[n].unit} connus` : 'données insuffisantes'}</span></td>
                <td>{fmtVal(shown, NUTRIENTS[n].unit)}<span className="help"> /100 ml</span>{per && isKnown(shown) && <><br /><span className="help">{fmt((shown.v * per) / 100)} {NUTRIENTS[n].unit} par portion</span></>}</td></tr>
            })}
          </tbody></table>
          {!checkSugar ? null : <p className="help">Sans sucre ajouté ne veut pas dire sans sucres : les sucres naturellement présents (fruits, lait) restent comptés quand ils sont connus.</p>}
          {r.prep !== 'melange' && <p className="help">Pour une infusion, la part des ingrédients qui passe dans l’eau n’est pas connue : l’appli n’affiche pas de chiffre inventé.</p>}
        </section>
        <details className="card">
          <summary style={{ fontWeight: 600, cursor: 'pointer' }}>Saisir la composition de la boisson à la main</summary>
          <div className="field"><label htmlFor="ms">Origine des valeurs</label>
            <select id="ms" className="inp" value={manualSrc} onChange={(e) => setManualSrc(e.target.value as Source)}>
              <option value="etiquette">Étiquette</option><option value="base">Base documentée</option><option value="utilisateur">Saisie personnelle</option><option value="estimation">Estimation</option>
            </select></div>
          <div className="field"><label htmlFor="sn">Source <span className="help">facultatif</span></label><input id="sn" className="inp" value={srcNote} onChange={(e) => setSrcNote(e.target.value)} placeholder="Ex. boîte du thé, table Ciqual…" /></div>
          {SHOWN.map((n) => <ValInput key={n} id={`m-${n}`} label={nlabel(n)} unit={`${NUTRIENTS[n].unit}/100 ml`} value={manual[n]} src={manualSrc} onChange={(v) => setManual((x) => { const y = { ...x }; if (v) y[n] = v; else delete y[n]; return y })} />)}
        </details>

        </>}
        {checkSugar && <label className="check"><input type="checkbox" checked={r.confirmedNoAddedSugar} onChange={(e) => up({ confirmedNoAddedSugar: e.target.checked })} />Je confirme que cette recette ne contient aucun sucre ajouté</label>}
        {status === 'refusee' && <StateBox k="depassement" title="Recette refusée"><ul>{chk.refused.map((x) => <li key={x.i.id}>{(x.c as { reason: string }).reason}</li>)}</ul><p style={{ marginTop: 4 }}>Retire cet ingrédient pour l’enregistrer. Une boisson sucrée achetée s’enregistre comme fiche produit.</p></StateBox>}
        {status === 'brouillon' && <StateBox k="incomplete" title="Pas encore validable"><ul>{[...(checkSugar ? chk.pending.map((x) => (x.c as { reason: string }).reason) : []), ...(checkSugar ? chk.problems : !(r.finalMl && r.finalMl > 0) ? ['Indique le volume final préparé.'] : [])].map((t) => <li key={t}>{t}</li>)}</ul></StateBox>}
        {status === 'conforme' && checkSugar && <StateBox k="information" title="Sans sucre ajouté"><p>Tous les ingrédients sont déclarés sans sucre ajouté.</p></StateBox>}
      </main>
      <div className="fab" style={{ flexDirection: 'column' }}>
        <button className="btn" disabled={!named || status !== 'conforme'} onClick={() => save(false)}><Icon n="check" />Enregistrer</button>
        {status === 'brouillon' && <button className="btn sec" disabled={!named} onClick={() => save(true)}>Garder en brouillon</button>}
      </div>
    </>
  )
}
