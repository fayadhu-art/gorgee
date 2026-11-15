import { useState } from 'react'
import { mergeParsed, nameFrom, OcrLine, OcrWord, Parsed, parseNutrition, pickName } from '../domain/ocr'
import { uid } from '../domain/store'
import { Category, Drink, Nutrient } from '../domain/types'
import { Bar, Icon, StateBox, useApp } from './parts'

// Fichiers de lecture servis avec l'appli (hors ligne) ; la démo peut pointer vers un CDN au build.
const LOCAL = new URL('./ocr/', location.href).href
const OCR = (import.meta as any).env?.VITE_OCR_CDN
  ? { workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js', corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/', langPath: 'https://tessdata.projectnaptha.com/4.0.0_best_int/' }
  : { workerPath: LOCAL + 'worker.min.js', corePath: LOCAL, langPath: LOCAL }

type Cv = HTMLCanvasElement
/** Dessine une zone de la source dans un canevas, à l'échelle k. */
function draw(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, k: number): Cv {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k))
  const g = c.getContext('2d')!
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'
  g.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height)
  return c
}
/** Niveaux de gris, puis division par le fond local (le point le plus clair de chaque pavé, lissé) : papier blanc, texte noir, reflets et ombres d'une bouteille effacés. Testé sur une vraie étiquette. */
function normalize(c: Cv, block: number, invert = false): Cv {
  const W = c.width, H = c.height, g = c.getContext('2d')!, im = g.getImageData(0, 0, W, H), d = im.data
  const bs = Math.max(8, Math.round(block)), bw = Math.ceil(W / bs), bh = Math.ceil(H / bs)
  const small = document.createElement('canvas'); small.width = bw; small.height = bh
  const sg = small.getContext('2d')!, sim = sg.createImageData(bw, bh), mx = new Uint8Array(bw * bh)
  for (let y = 0, i = 0; y < H; y++) { const by = (y / bs | 0) * bw; for (let x = 0; x < W; x++, i += 4) { let v = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; if (invert) v = 255 - v; d[i] = v; const k = by + (x / bs | 0); if (v > mx[k]) mx[k] = v } }
  for (let k = 0; k < mx.length; k++) { const v = Math.max(90, mx[k]); sim.data[4 * k] = sim.data[4 * k + 1] = sim.data[4 * k + 2] = v; sim.data[4 * k + 3] = 255 }
  sg.putImageData(sim, 0, 0)
  const b = draw(small, 0, 0, bw, bh, bs).getContext('2d')!.getImageData(0, 0, W, H).data
  for (let i = 0; i < d.length; i += 4) { const v = Math.min(255, (d[i] / b[i]) * 255); d[i] = d[i + 1] = d[i + 2] = v }
  g.putImageData(im, 0, 0)
  return c
}
/** Garde en noir sur blanc les seuls pixels d'une couleur vive (lettrage de marque rouge, jaune, vert ou bleu). Renvoie rien si la couleur est absente ou couvre trop. */
const HUES: ((r: number, g: number, b: number) => boolean)[] = [
  (r, g, b) => r - Math.max(g, b) > 90,
  (r, g, b) => Math.min(r, g) - b > 90 && Math.abs(r - g) < 60,
  (r, g, b) => g - Math.max(r, b) > 70,
  (r, g, b) => b - Math.max(r, g) > 70,
]
function isolate(src: Cv, test: (r: number, g: number, b: number) => boolean): Cv | undefined {
  const c = draw(src, 0, 0, src.width, src.height, 1)
  const g = c.getContext('2d')!, im = g.getImageData(0, 0, c.width, c.height), d = im.data
  let n = 0
  for (let i = 0; i < d.length; i += 4) { const on = test(d[i], d[i + 1], d[i + 2]); if (on) n++; d[i] = d[i + 1] = d[i + 2] = on ? 0 : 255 }
  const share = n / (d.length / 4)
  if (share < 0.002 || share > 0.15) return undefined
  g.putImageData(im, 0, 0)
  return c
}

const KEY = /energ|prot|sugar|sucre|glucid|carbohyd|\bfat\b|grasses|lipid|satur|\bsalt\b|\bsel\b|sodium|fibre/
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

async function read(front: File | undefined, label: File | undefined, onStep: (s: string) => void) {
  const { createWorker } = await import('tesseract.js')
  onStep('Préparation de la lecture…')
  const w = await createWorker('fra+eng', 1, { ...OCR, gzip: true, workerBlobURL: false })
  const ocr = async (c: Cv) => {
    const r = await w.recognize(c, {}, { blocks: true, text: true })
    const lines = (r.data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    ;(globalThis as any).__ocr?.(c.toDataURL('image/png'), r.data.text)
    return { text: r.data.text, lines }
  }
  try {
    let name: string | undefined, frontText = ''
    const parsed: Parsed[] = []
    if (front) {
      onStep('Lecture du nom…')
      const bmp = await createImageBitmap(front)
      const side = Math.max(bmp.width, bmp.height)
      // Un gros titre se lit mieux en petit, une petite mention en grand : deux tailles, en clair et en négatif.
      const brand: OcrWord[] = [], lines: OcrWord[][] = [], old: OcrLine[] = []
      const full = draw(bmp, 0, 0, bmp.width, bmp.height, Math.min(1, 2000 / side))
      for (const t of HUES) { const m = isolate(full, t), c = m && draw(m, 0, 0, m.width, m.height, 720 / Math.max(m.width, m.height)); if (c) (await ocr(c)).lines.forEach((l) => brand.push(...l.words.map((x) => ({ text: x.text, confidence: x.confidence })))) }
      for (const [size, inv] of [[1600, false], [720, false], [720, true]] as const) {
        const r = await ocr(normalize(draw(bmp, 0, 0, bmp.width, bmp.height, Math.min(2, size / side)), size / 16, inv))
        r.lines.forEach((l) => { lines.push(l.words.map((x) => ({ text: x.text, confidence: x.confidence }))); old.push({ text: l.text, height: l.bbox.y1 - l.bbox.y0, confidence: l.confidence }) })
        frontText += fold(r.text) + '\n'
      }
      name = nameFrom(brand, lines) ?? pickName(old)
      parsed.push({ ...parseNutrition(''), capacityMl: parseNutrition(frontText).capacityMl })
    }
    if (label) {
      onStep('Lecture des valeurs nutritionnelles…')
      const bmp = await createImageBitmap(label)
      const k0 = Math.min(1.5, 2000 / Math.max(bmp.width, bmp.height))
      const first = await ocr(normalize(draw(bmp, 0, 0, bmp.width, bmp.height, k0), 48))
      parsed.push(parseNutrition(first.text))
      // Le tableau repéré par ses lignes (énergie, sucres, sel…) est recadré puis relu à trois tailles : chaque lecture a ses erreurs, on garde la valeur la plus fréquente.
      const rows = first.lines.filter((l) => KEY.test(fold(l.text)))
      if (rows.length >= 3) {
        const med = (xs: number[]) => xs.sort((a, b) => a - b)[xs.length >> 1]
        const h = med(rows.map((l) => l.bbox.y1 - l.bbox.y0))
        // Bords du tableau : à gauche le mot-clé de chaque ligne, à droite le dernier nombre qui le suit (les valeurs sont alignées à droite).
        const span = rows.map((l) => { const i = l.words.findIndex((x) => KEY.test(fold(x.text))); const after = l.words.slice(Math.max(0, i)); const nums = after.filter((x) => /\d/.test(x.text)); return { x0: after[0]?.bbox.x0 ?? l.bbox.x0, x1: nums.length ? nums[0].bbox.x1 : undefined } })
        const rights = span.map((x) => x.x1).filter((x): x is number => x !== undefined)
        const x0 = Math.max(0, med(span.map((x) => x.x0)) - h), x1 = Math.min(bmp.width * k0, (rights.length ? Math.max(...rights.filter((x) => x <= med([...rights]) + 3 * h)) : Math.max(...rows.map((l) => l.bbox.x1))) + 0.7 * h)
        const y0 = Math.max(0, Math.min(...rows.map((l) => l.bbox.y0)) - 2 * h), y1 = Math.min(bmp.height * k0, Math.max(...rows.map((l) => l.bbox.y1)) + h)
        const crops: Parsed[] = [], cols: Parsed[] = []
        for (const target of [100, 75, 50]) {
          const k = Math.min(3, (target * k0) / h)
          const crop = normalize(draw(bmp, x0 / k0, y0 / k0, (x1 - x0) / k0, (y1 - y0) / k0, k), target)
          const r = await ocr(crop)
          crops.push(parseNutrition(r.text))
          // Colonne des valeurs relue seule (sans le texte ni le code-barres voisins), puis chaque valeur est rattachée au libellé de sa ligne par sa hauteur.
          const labels = r.lines.filter((l) => KEY.test(fold(l.text))).map((l) => { const kw = l.words.find((x) => KEY.test(fold(x.text))) ?? l.words[0]; return { y: (kw.bbox.y0 + kw.bbox.y1) / 2, text: fold(l.text).replace(/[<\d][\s\S]*$/, '').trim() } }).sort((a, b) => a.y - b.y)
          if (labels.length < 3) continue
          const pitch = med(labels.slice(1).map((l, i) => l.y - labels[i].y))
          const cw = Math.min(crop.width, Math.round(5.5 * target)), cx = crop.width - cw
          await w.setParameters({ tessedit_pageseg_mode: '11' as never })
          const col = await ocr(draw(crop, cx, 0, cw, crop.height, 1))
          await w.setParameters({ tessedit_pageseg_mode: '3' as never })
          // Photo penchée : les valeurs sont décalées en hauteur par rapport aux libellés. Le décalage se cale sur la ligne énergie (kJ, kcal), sinon sur celui qui apparie le plus de lignes.
          const vals = col.lines.filter((l) => /\d|[oO]\s*g/.test(l.text)).map((l) => ({ y: (l.bbox.y0 + l.bbox.y1) / 2, text: l.text.trim() }))
          const near = (y: number) => vals.reduce<{ y: number; text: string } | undefined>((m, v) => (!m || Math.abs(v.y - y) < Math.abs(m.y - y) ? v : m), undefined)
          const score = (dy: number) => labels.filter((l) => { const v = near(l.y + dy); return v && Math.abs(v.y - l.y - dy) < 0.3 * pitch }).length
          const e = labels.find((l) => /energ/.test(l.text)), ev = vals.find((v) => /k[jc]|\dk/i.test(v.text))
          let dy = 0
          if (e && ev && Math.abs(ev.y - e.y) < pitch) dy = ev.y - e.y
          else for (const l of labels) for (const v of vals) { const d = v.y - l.y; if (Math.abs(d) < 0.8 * pitch && (score(d) > score(dy) || (score(d) === score(dy) && Math.abs(d) < Math.abs(dy)))) dy = d }
          const got = labels.map((l) => { const v = near(l.y + dy); return v && Math.abs(v.y - l.y - dy) < 0.45 * pitch ? v.text : '' })
          cols.push(parseNutrition(labels.map((l, i) => l.text + ' ' + got[i]).join('\n')))
        }
        parsed.unshift(...cols, ...cols, ...crops)
      }
    }
    return { name, energy: /energ/.test(frontText), fizzy: /carbonat|gazeu|petillan/.test(frontText), ...mergeParsed(parsed) }
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
    for (const [k, v] of Object.entries(r?.values ?? {}) as [Nutrient, number][]) values[k] = { v, src: r?.derived?.[k] ? 'estimation' : 'etiquette', ...(r?.lt[k] ? { lt: true as const } : {}) }
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
