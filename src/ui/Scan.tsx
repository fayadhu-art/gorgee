import { useState } from 'react'
import { OcrLine, parseNutrition, pickName } from '../domain/ocr'
import { uid } from '../domain/store'
import { Category, Drink, Nutrient } from '../domain/types'
import { Bar, Icon, StateBox, useApp } from './parts'

// Fichiers de lecture servis avec l'appli (hors ligne) ; la démo peut pointer vers un CDN au build.
const LOCAL = new URL('./ocr/', location.href).href
const OCR = (import.meta as any).env?.VITE_OCR_CDN
  ? { workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js', corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/', langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/fra@1.0.0/4.0.0_best_int/' }
  : { workerPath: LOCAL + 'worker.min.js', corePath: LOCAL, langPath: LOCAL }

/** Réduit la photo (les photos d'iPhone font 12 Mpx) pour une lecture plus rapide. */
async function shrink(f: File, max = 2000): Promise<Blob> {
  const bmp = await createImageBitmap(f)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.9))
}

async function read(front: File | undefined, label: File | undefined, onStep: (s: string) => void) {
  const { createWorker } = await import('tesseract.js')
  onStep('Préparation de la lecture…')
  const w = await createWorker('fra', 1, { ...OCR, gzip: true, workerBlobURL: false })
  try {
    let name: string | undefined, text = ''
    if (front) {
      onStep('Lecture du nom…')
      const r = await w.recognize(await shrink(front), {}, { blocks: true, text: true })
      const lines: OcrLine[] = []
      r.data.blocks?.forEach((b) => b.paragraphs.forEach((p) => p.lines.forEach((l) => lines.push({ text: l.text, height: l.bbox.y1 - l.bbox.y0, confidence: l.confidence }))))
      name = pickName(lines)
      text += r.data.text + '\n'
    }
    if (label) {
      onStep('Lecture des valeurs nutritionnelles…')
      const r = await w.recognize(await shrink(label), {}, { text: true })
      text += r.data.text
    }
    return { name, ...parseNutrition(text) }
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
    try { r = await read(front, label, setStep) } catch { /* lecture impossible : la fiche s'ouvre vide, à remplir depuis l'étiquette */ }
    setStep(undefined)
    const values: Drink['values'] = {}
    for (const [k, v] of Object.entries(r?.values ?? {}) as [Nutrient, number][]) values[k] = { v, src: 'etiquette' }
    const draft: Drink = {
      id: uid(), kind: 'commerce', name: r?.name || name || '', category: cat && cat !== 'maison' ? cat : 'soda', traits: [], capacityMl: r?.capacityMl,
      basis: r?.basis ?? { kind: '100ml' }, values, alcoholPct: { missing: 'non_applicable' },
    }
    back()
    if (cat === 'the') go({ s: 'tea', kind: 'the', name: draft.name || undefined })
    else go({ s: 'product', draft, scanned: Object.keys(values).length })
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
