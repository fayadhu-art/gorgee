import { useState } from 'react'
import { OcrLine, parseNutrition, pickName } from '../domain/ocr'
import { uid } from '../domain/store'
import { Category, Drink, Nutrient } from '../domain/types'
import { Bar, Icon, StateBox, useApp } from './parts'

// Fichiers de lecture servis avec l'appli (hors ligne) ; la démo peut pointer vers un CDN au build.
const LOCAL = new URL('./ocr/', location.href).href
const OCR = (import.meta as any).env?.VITE_OCR_CDN
  ? { workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js', corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/', langPath: 'https://tessdata.projectnaptha.com/4.0.0_best_int/' }
  : { workerPath: LOCAL + 'worker.min.js', corePath: LOCAL, langPath: LOCAL }

/** Met la photo à environ 3000 px, en niveaux de gris, contraste étiré : testé sur une vraie étiquette, c'est ce qui lit le mieux les petits chiffres. */
async function prep(f: File, max = 3000): Promise<Blob> {
  const bmp = await createImageBitmap(f)
  const k = Math.min(2, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  const g = c.getContext('2d')!
  g.drawImage(bmp, 0, 0, c.width, c.height)
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) { const y = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = y; hist[y]++ }
  const n = d.length / 4; let lo = 0, hi = 255, acc = 0
  while (lo < 255 && (acc += hist[lo]) < n * 0.02) lo++
  acc = 0; while (hi > 0 && (acc += hist[hi]) < n * 0.02) hi--
  const span = Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)); d[i] = d[i + 1] = d[i + 2] = v }
  g.putImageData(im, 0, 0)
  return new Promise((r, x) => c.toBlob((b) => (b ? r(b) : x(new Error('image illisible'))), 'image/jpeg', 0.92))
}

async function read(front: File | undefined, label: File | undefined, onStep: (s: string) => void) {
  const { createWorker } = await import('tesseract.js')
  onStep('Préparation de la lecture…')
  const w = await createWorker('fra+eng', 1, { ...OCR, gzip: true, workerBlobURL: false })
  try {
    let name: string | undefined, text = '', frontText = ''
    if (front) {
      onStep('Lecture du nom…')
      const r = await w.recognize(await prep(front, 2000), {}, { blocks: true, text: true })
      const lines: OcrLine[] = []
      r.data.blocks?.forEach((b) => b.paragraphs.forEach((p) => p.lines.forEach((l) => lines.push({ text: l.text, height: l.bbox.y1 - l.bbox.y0, confidence: l.confidence }))))
      name = pickName(lines)
      frontText = r.data.text.toLowerCase()
      text += r.data.text + '\n'
    }
    if (label) {
      onStep('Lecture des valeurs nutritionnelles…')
      const r = await w.recognize(await prep(label, 4000), {}, { text: true })
      text += r.data.text
    }
    return { name, energy: /energ/.test(frontText), fizzy: /carbonat|gazeu|petillan/.test(frontText), ...parseNutrition(text) }
  } finally { await w.terminate() }
}

function Shot({ n, title, help, file, onFile }: { n: number; title: string; help: string; file?: File; onFile: (f?: File) => void }) {
  const url = file ? URL.createObjectURL(file) : undefined
  return (
    <label className="shot">
      <input type="file" accept="image/*" capture="environment" onChange={(e) => onFile(e.target.files?.[0])} />
      {url ? <img src={url} alt="" onLoad={() => URL.revokeObjectURL(url)} /> : <span className="ic"><Icon n="camera" /></span>}
      <span className="m"><b>{n}. {title}</b><small>{file ? 'Touche pour reprendre la photo' : help}</small></span>
    </label>
  )
}

export function Scan({ name, cat }: { name?: string; cat?: Category }) {
  const { back, go } = useApp()
  const [front, setFront] = useState<File>()
  const [label, setLabel] = useState<File>()
  const [step, setStep] = useState<string>()
  const run = async () => {
    let r: Awaited<ReturnType<typeof read>> | undefined
    let scanErr: string | undefined
    try { r = await read(front, label, setStep) } catch (e) { scanErr = String((e as Error)?.message ?? e) /* la fiche s'ouvre vide, à remplir depuis l'étiquette */ }
    setStep(undefined)
    const values: Drink['values'] = {}
    for (const [k, v] of Object.entries(r?.values ?? {}) as [Nutrient, number][]) values[k] = { v, src: 'etiquette', ...(r?.lt[k] ? { lt: true as const } : {}) }
    const draft: Drink = {
      id: uid(), kind: 'commerce', name: r?.name || name || '', category: cat && cat !== 'maison' ? cat : r?.energy ? 'energisante' : 'soda', traits: r?.fizzy ? ['gazeuse'] : [], capacityMl: r?.capacityMl,
      basis: r?.basis ?? { kind: '100ml' }, values, alcoholPct: { missing: 'non_applicable' },
    }
    back()
    if (cat === 'the') go({ s: 'tea', kind: 'the', name: draft.name || undefined })
    else go({ s: 'product', draft, scanned: Object.keys(values).length, scanErr })
  }
  return (
    <>
      <Bar title={cat === 'the' ? 'Photographier le thé' : 'Photographier la boisson'} onBack={back} />
      <main className="main">
        <p className="help" style={{ padding: '0 4px' }}>{cat === 'the' ? 'Les deux photos sont demandées pour chaque nouveau thé. L’appli lit le nom, puis tu indiques la composition une fois pour toutes.' : 'Les deux photos sont demandées pour chaque nouvelle boisson du commerce. L’appli lit le nom et le tableau nutritionnel, puis préremplit la fiche.'} Tu vérifies tout avant d’enregistrer.</p>
        <Shot n={1} title="De face" help="Le nom de la boisson bien visible" file={front} onFile={setFront} />
        <Shot n={2} title={cat === 'the' ? 'Composition du paquet' : 'Tableau nutritionnel'} help="À plat, net, sans reflet" file={label} onFile={setLabel} />
        {step && <StateBox k="information" title="Lecture en cours"><p>{step} Cela peut prendre une vingtaine de secondes la première fois.</p></StateBox>}
        <p className="note"><Icon n="info" />La lecture se fait sur ton téléphone. Les photos ne sont ni envoyées ni gardées.</p>
      </main>
      <div className="fab"><button className="btn" disabled={!front || !label || !!step} onClick={run}><Icon n="check" />{step ? 'Lecture…' : 'Lire les photos'}</button></div>
    </>
  )
}
