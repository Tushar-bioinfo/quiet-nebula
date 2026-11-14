// Glyph sky: a halftone field of tiny crosses on a 14-unit grid, shaped into wave bands that
// travel across the whole window, with sparse glyph marks, a misregistered offset plate, halo
// stars, glinting hand-cut asterisk stars and bright patches that ride on the bands. Re-made from the person's canvas
// reference (ref-glyph-constellation.html) for a script-less SVG backdrop.
//
// How the bands travel without script:
// - The field is three layers, one wave band each. Each layer is periodic along x with a period
//   of 115 cells (1,610 units, a little wider than the 1,600-unit window). One period is drawn
//   once (a <g> in <defs>) and placed twice side by side with <use>.
// - The pair slides by exactly one period with a linear, infinite CSS transform, so the loop
//   point is invisible. The layers move at different speeds, two leftward and one rightward, so
//   the pattern keeps changing shape instead of sliding like wallpaper.
// - Movement uses steps() timing: every layer steps at one shared rate, each step under one
//   unit (looks smooth), or exactly one cell with `gridLock` (marks stay on a fixed lattice).
// - The quiet middle is a static, paper-colored gradient laid over the moving layers. No mask
//   or clip sits on moving content, so the moving layers are drawn once and only moved.
//
// How it stays small:
// - Marks of one tone share one <pattern> tile. A tone's cells are written as horizontal runs
//   (one stroked line per run, the stroke painted with the pattern).
// - The offset plate is a <use> of the same run path, shifted, painted with a darker pattern.
// - Only a few large groups animate, and only `opacity` and `transform`.
//
// Pure module: no file writes, no Node imports. Same options → same string.

export type Hue = 'blue' | 'ember'
export type Motion = 0 | 1 | 2 | 3

export type GlyphSkyOptions = {
  /** Color family. One family per picture. */
  hue?: Hue
  /** Travel speed: 0 a still picture (no travel, drift, twinkle or glint); 1 a band crosses in ~4 min; 2 in ~2 min, plus a glare sweep; 3 in ~1 min. */
  motion?: Motion
  /** 0–1: how many marks, glyphs and dust stars (0.6 = like the reference). */
  density?: number
  /** 0–1: strength of the static veil that dims the field behind the chat column and typing box (0 = none; the app's glass blur softens it anyway). */
  quietCenter?: number
  /** Draw the small glyph marks (. : + * ~ o · x) among the crosses. */
  glyphs?: boolean
  /** Changes the band shapes, patch places and star positions. */
  seed?: number
  /** Star twinkle updates per second via CSS steps(); 0 = smooth. */
  fps?: number
  /** Bands advance one whole cell per step, so marks stay on one fixed lattice (reference-like, visibly stepped). */
  gridLock?: boolean
  /** Preview only: six custom colors in place of the hue's family (paper darkest … pale lightest). */
  colors?: Family
  /** Test (Spider-Verse round 2): other colors for parts of the picture, used together with the hue. Unset parts keep the hue. */
  accents?: Accents
}

export type Accents = {
  /** The misregistered offset plate (+4, +3) under the crosses, glyphs and halo stars. */
  offset?: string
  /** The brightest band crests (top tone bucket). */
  crest?: string
  /** Glyph marks, cycled by glyph type (. : + * ~ o · x). */
  glyphs?: string[]
  /** The bright patches that ride the bands, and their soft bloom. */
  patch?: string
  /** Bright asterisk star fills, cycled per star. */
  stars?: string[]
  /** The soft glow around halo stars. */
  halo?: string
}


// ---------- constants ----------
const W = 1600
const H = 1000
const CELL = 14
/** Period of the travelling layers, in cells and units. Integer cells keep the copies on one lattice. */
const PCOLS = 115
const P = PCOLS * CELL
/** Rows: one extra above and below the window. */
const ROW0 = -1
const ROWS = Math.ceil(H / CELL) + 2
/** Offset fill: one direction everywhere (same as the earlier looks), in view units. */
const SHIFT_X = 4
const SHIFT_Y = 3

export type Family = { paper: string; plate: string; dark: string; main: string; light: string; pale: string }
/** Five sister colors per hue (from previews/frame/src/shared.ts) plus a near-black paper tinted toward the hue. */
const FAMILIES: Record<Hue, Family> = {
  blue: { paper: '#05070d', plate: '#0f2142', dark: '#1c4482', main: '#4b94f2', light: '#9dccff', pale: '#e4edff' },
  ember: { paper: '#0a0605', plate: '#3d1512', dark: '#7a2a20', main: '#ff5a4a', light: '#ffa386', pale: '#fff0e9' },
}

// ---------- numbers ----------
const TAU = Math.PI * 2
/** Short number: up to `d` decimals, no leading zero, no "-0". */
function f(v: number, d = 2): string {
  const s = String(Math.round(v * 10 ** d) / 10 ** d || 0)
  return s.replace(/^(-?)0\./, '$1.')
}
/** Hash of a cell (same as the reference), 0..1. */
function hashOf(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 23, 374761393) ^ Math.imul(y + 19, 668265263) ^ Math.imul(salt + 7, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}
/** mulberry32: a small seeded generator. */
function makeRng(seed: number) {
  let state = seed >>> 0
  const r = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { r, between: (a: number, b: number) => a + (b - a) * r() }
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** 0 (free) .. 1 (inside the chat column or behind the typing box). Used for star placement. */
function quietness(x: number, y: number): number {
  const dx = Math.abs(x - W / 2)
  const column = 1 - smooth(300, 450, dx)
  const typing = (1 - smooth(390, 470, dx)) * smooth(790, 870, y)
  return Math.max(column, typing)
}

// ---------- the travelling bands ----------
/**
 * One band: crest height and width as functions of u = x / P (0..1, periodic), built from whole
 * sine cycles only, so the band joins itself at the period seam. Values are 0..1 of the window.
 */
type Band = { crest: (u: number) => number; width: (u: number) => number; weight: number }
function makeBands(rng: ReturnType<typeof makeRng>): Band[] {
  const ph = () => rng.between(0, TAU)
  const a1 = ph(), a2 = ph(), a3 = ph(), b1 = ph(), b2 = ph(), b3 = ph(), c1 = ph(), c2 = ph()
  return [
    // primary S-wave (top), after the reference's band 1
    {
      crest: u => 0.25 + 0.13 * Math.sin(TAU * u + a1) + 0.06 * Math.cos(2 * TAU * u + a2),
      width: u => 0.13 + 0.045 * Math.sin(2 * TAU * u + a3),
      weight: 1,
    },
    // counter-swell (bottom), after the reference's band 2
    {
      crest: u => 0.76 - (0.14 * Math.sin(TAU * u + b1) + 0.055 * Math.cos(2 * TAU * u + b2)),
      width: u => 0.135 + 0.045 * Math.cos(TAU * u + b3),
      weight: 1,
    },
    // middle ribbon: two cycles per period, so it runs on steeper diagonals
    {
      crest: u => 0.5 + 0.19 * Math.sin(2 * TAU * u + c1) + 0.05 * Math.sin(3 * TAU * u + c2),
      width: () => 0.12,
      weight: 0.85,
    },
  ]
}
/** Tone 0..1 of a cell for one band (the reference's shaping: grain, harmonics, contrast 1.9). */
function bandTone(band: Band, u: number, ny: number, grain: number): number {
  const b = Math.exp(-(((ny - band.crest(u)) / band.width(u)) ** 2)) * band.weight
  const harmonic = 0.45 * (0.11 * Math.sin(3 * TAU * u + ny * 13) + 0.07 * Math.cos(5 * TAU * u - ny * 19))
  const raw = b * 1.12 + harmonic * Math.max(b, 0.22) + grain * 0.09
  return clamp01(raw) ** 1.9
}

// ---------- marks ----------
/** Cross radius per tone bucket (the reference's radii at a 14-unit cell). */
const RADII = [1.0, 1.85, 2.85, 3.95, 5.15, 6.4].map(r => r * 0.7)
/** A plus sign centered in a 1×1 tile, `r` in view units. */
function crossD(r: number): string {
  const d = (r * 1.3) / CELL
  const w = Math.max(0.8, r * 0.36) / CELL
  const a = 0.5 - d
  const b = 0.5 - w / 2
  return `M${f(a, 3)} ${f(b, 3)}h${f(2 * d, 3)}v${f(w, 3)}h${f(-2 * d, 3)}zM${f(b, 3)} ${f(a, 3)}h${f(w, 3)}v${f(2 * d, 3)}h${f(-w, 3)}z`
}
const tile = (id: string, inner: string) => `<pattern id="${id}" width="1" height="1" patternUnits="userSpaceOnUse">${inner}</pattern>`
const crossTile = (id: string, r: number, color: string, alpha: number) =>
  tile(id, `<path d="${crossD(r)}" fill="${color}"${alpha < 1 ? ` fill-opacity="${f(alpha)}"` : ''}/>`)
const discTile = (id: string, r: number, color: string, alpha: number) =>
  tile(id, `<circle cx=".5" cy=".5" r="${f(r / CELL, 3)}" fill="${color}" fill-opacity="${f(alpha)}"/>`)

/**
 * Cells as horizontal runs, one stroked line per run (stroke width 1 cell, cell units).
 * Grid: `cols` × ROWS cells, column 0 at x = col0. Returns '' when no cell is on.
 */
function runsD(cols: number, col0: number, on: (k: number) => boolean): string {
  let d = ''
  let px = 0
  let py = 0
  let first = true
  for (let j = 0; j < ROWS; j += 1) {
    let i = 0
    while (i < cols) {
      if (!on(j * cols + i)) {
        i += 1
        continue
      }
      const a = i
      while (i < cols && on(j * cols + i)) i += 1
      const x = a + col0
      const y = j + ROW0 + 0.5
      d += (first ? `M${x} ${f(y, 1)}` : `m${x - px} ${y - py}`).replace(/ -/g, '-')
      d += `h${i - a}`
      first = false
      px = i + col0
      py = y
    }
  }
  return d
}

/** Glyph shapes in cell units, centered at (x, y). `dot` shapes are drawn with a thicker round-capped stroke. */
const GLYPHS = '.:+*~o·x'
function glyphD(ch: string, x: number, y: number): { dot: boolean; d: string } {
  const p = (a: number, b: number) => `M${f(a)} ${f(b)}`.replace(/ -/g, '-')
  switch (ch) {
    case '.': return { dot: true, d: p(x, y + 0.16) + 'h0' }
    case ':': return { dot: true, d: p(x, y - 0.13) + 'h0m0 .26h0' }
    case '·': return { dot: true, d: p(x, y) + 'h0' }
    case '+': return { dot: false, d: p(x - 0.22, y) + 'h.44m-.22-.22v.44' }
    case 'x': return { dot: false, d: p(x - 0.17, y - 0.17) + 'l.34.34m0-.34l-.34.34' }
    case '*': return { dot: false, d: p(x, y - 0.22) + 'v.44m-.19-.33l.38.22m0-.22l-.38.22' }
    case '~': return { dot: false, d: p(x - 0.22, y + 0.04) + 'q.11-.15.22 0t.22 0' }
    default: return { dot: false, d: p(x - 0.15, y) + 'a.15.15 0 1 0 .3 0a.15.15 0 1 0-.3 0' } // o
  }
}

// ---------- the scene ----------
/** Safe size, under the app's hard limit of 131,072 characters. */
const BUDGET = 120000
/** Builds the scene; if it is too long (very high density), lowers density until it fits. */
export function glyphSkySvg(opts: GlyphSkyOptions = {}): string {
  let density = clamp01(opts.density ?? 0.6)
  let svg = build({ ...opts, density })
  while (svg.length >= BUDGET && density > 0) {
    density = Math.max(0, density - 0.1)
    svg = build({ ...opts, density })
  }
  return svg
}

function build(opts: GlyphSkyOptions): string {
  const hue = opts.hue ?? 'blue'
  const motion = opts.motion ?? 1
  const density = clamp01(opts.density ?? 0.6)
  const qc = clamp01(opts.quietCenter ?? 0.25)
  /** Stars keep out of the chat column whatever the veil strength: a glinting star behind text distracts. */
  const STAR_QUIET = 0.85
  const drawGlyphs = opts.glyphs ?? true
  const seed = Math.floor(opts.seed ?? 1)
  const fps = opts.fps ?? 4
  const gridLock = opts.gridLock ?? false
  const fam = opts.colors ?? FAMILIES[hue]
  const acc = opts.accents ?? {}
  const rng = makeRng(seed * 7919 + 13)
  const salt = seed * 101
  const bands = makeBands(rng)

  const css: string[] = []
  const defs: string[] = []

  // ----- shared tiles -----
  // Low tones in the dark sister, mid tones in the main ink, crests in the light sister.
  const BASE: [string, number][] = [
    [fam.dark, 0.3], [fam.dark, 0.62], [fam.main, 0.32], [fam.main, 0.42], [fam.main, 0.56], [acc.crest ?? fam.light, 0.48],
  ]
  const OFFSET_ALPHA = [0, 0.32, 0.42, 0.52, 0.62, 0.72]
  for (let b = 0; b < 6; b += 1) {
    defs.push(crossTile(`p${b}`, RADII[b]!, BASE[b]![0], BASE[b]![1]))
    if (b > 0) defs.push(crossTile(`o${b}`, RADII[b]! * 0.85, acc.offset ?? fam.dark, OFFSET_ALPHA[b]!))
  }
  // patch glare: three sizes × soft / hot, plus a faint round bloom behind hot marks
  const GLARE_R = [2.2, 3.4, 4.7]
  for (let s = 0; s < 3; s += 1) {
    defs.push(crossTile(`s${s}`, GLARE_R[s]!, acc.patch ?? fam.light, 0.62))
    defs.push(crossTile(`h${s}`, GLARE_R[s]!, fam.pale, 0.9))
  }
  defs.push(discTile('bl', 5.6, acc.patch ?? fam.main, 0.13))
  // glyph tiles: normal, offset plate, lit (inside a patch)
  const glyphTile = (id: string, ch: string, color: string, alpha: number, bold = 1) => {
    const g = glyphD(ch, 0.5, 0.5)
    const w = (g.dot ? 0.15 : 0.085) * bold
    return tile(id, `<path d="${g.d}" fill="none" stroke="${color}" stroke-width="${f(w, 3)}" stroke-linecap="round"${alpha < 1 ? ` stroke-opacity="${f(alpha)}"` : ''}/>`)
  }
  if (drawGlyphs) {
    for (let t = 0; t < GLYPHS.length; t += 1) {
      const ch = GLYPHS[t]!
      const gc = acc.glyphs?.length ? acc.glyphs[t % acc.glyphs.length]! : fam.pale
      defs.push(glyphTile(`ga${t}`, ch, gc, acc.glyphs?.length ? 0.62 : 0.42), glyphTile(`gd${t}`, ch, acc.offset ?? fam.dark, 0.6), glyphTile(`gl${t}`, ch, gc, 1, 1.15))
    }
  }

  // ----- one travelling layer per band -----
  const N = PCOLS * ROWS
  const threshold = 0.03 + (1 - density) * 0.075
  const glyphDensity = 0.75 * density
  const aspect = W / H
  const patchLife = [0.95, 0.62, 0.5]
  const layerTiles: string[] = []
  defs.push(`<clipPath id="tc" clipPathUnits="userSpaceOnUse"><rect x="0" y="-10" width="${PCOLS}" height="${ROWS + 20}"/></clipPath>`)
  bands.forEach((band, li) => {
    const val = new Float32Array(N)
    const bucket = new Int8Array(N).fill(-1)
    const glyph = new Int8Array(N).fill(-1)
    const ls = salt + li * 977
    for (let j = 0; j < ROWS; j += 1) {
      for (let i = 0; i < PCOLS; i += 1) {
        const k = j * PCOLS + i
        const gy = j + ROW0
        const u = (i + 0.5) / PCOLS
        const ny = ((gy + 0.5) * CELL) / H
        const v = bandTone(band, u, ny, hashOf(i, gy, 12 + ls) - 0.5)
        val[k] = v
        if (v < threshold) continue
        bucket[k] = Math.min(Math.floor(v * 6), 5)
        if (drawGlyphs && hashOf(i, gy, 31 + ls) < glyphDensity * (0.22 + v * 0.6)) {
          glyph[k] = Math.floor(hashOf(i, gy, 37 + ls) * GLYPHS.length)
        }
      }
    }
    const id = `L${li}`
    const offset: string[] = []
    const base: string[] = []
    for (let b = 0; b < 6; b += 1) {
      const d = runsD(PCOLS, 0, k => bucket[k] === b && glyph[k]! < 0)
      if (!d) continue
      if (b > 0) {
        defs.push(`<path id="${id}r${b}" d="${d}"/>`)
        offset.push(`<use href="#${id}r${b}" stroke="url(#o${b})"/>`)
        base.push(`<use href="#${id}r${b}" stroke="url(#p${b})"/>`)
      } else base.push(`<path d="${d}" stroke="url(#p0)"/>`)
    }
    const glyphRuns = (sel: (k: number) => boolean): [number, string][] => {
      const out: [number, string][] = []
      for (let t = 0; t < GLYPHS.length; t += 1) {
        const d = runsD(PCOLS, 0, k => glyph[k] === t && sel(k))
        if (d) out.push([t, d])
      }
      return out
    }
    if (drawGlyphs) {
      for (const [t, d] of glyphRuns(() => true)) {
        defs.push(`<path id="${id}y${t}" d="${d}"/>`)
        offset.push(`<use href="#${id}y${t}" stroke="url(#gd${t})"/>`)
        base.push(`<use href="#${id}y${t}" stroke="url(#ga${t})"/>`)
      }
    }

    // a bright patch that rides on this band's crest (periodic distance, so it wraps the seam)
    const pu = rng.between(0, 1)
    const pr = rng.between(0.12, 0.16)
    const px = pu * P
    const py = band.crest(pu) * H
    const life = patchLife[li]!
    const glare = (k: number) => {
      const i = k % PCOLS
      const j = (k - i) / PCOLS
      let dx = Math.abs((i + 0.5) * CELL - px)
      dx = Math.min(dx, P - dx)
      const dy = ((j + ROW0 + 0.5) * CELL - py) / H
      const d2 = (dx / W) ** 2 * aspect ** 2 + dy * dy
      const r2 = pr * pr
      return d2 < r2 * 1.8 ? Math.exp(-d2 / (r2 * 0.55)) * life : 0
    }
    const size = new Int8Array(N).fill(-1)
    const hot = new Uint8Array(N)
    const lit = new Uint8Array(N)
    for (let k = 0; k < N; k += 1) {
      const g = glare(k)
      if (g < 0.24) continue
      const v = val[k]!
      const e = Math.min(1, v + g * (0.38 + v * 0.55))
      lit[k] = 1
      if (glyph[k]! >= 0) continue
      size[k] = e < 0.42 ? 0 : e < 0.72 ? 1 : 2
      hot[k] = g > 0.62 ? 1 : 0
    }
    const patch: string[] = []
    const hotAll = runsD(PCOLS, 0, k => size[k]! >= 0 && hot[k] === 1)
    if (hotAll) patch.push(`<path d="${hotAll}" stroke="url(#bl)"/>`)
    for (let s = 0; s < 3; s += 1) {
      const soft = runsD(PCOLS, 0, k => size[k] === s && hot[k] === 0)
      if (soft) patch.push(`<path d="${soft}" stroke="url(#s${s})"/>`)
      const h = runsD(PCOLS, 0, k => size[k] === s && hot[k] === 1)
      if (h) patch.push(`<path d="${h}" stroke="url(#h${s})"/>`)
    }
    if (drawGlyphs) for (const [t, d] of glyphRuns(k => lit[k] === 1)) patch.push(`<path d="${d}" stroke="url(#gl${t})"/>`)

    defs.push(
      // The offset plate is shifted right, so it would overhang the tile's right edge and leave the
      // tile's left edge bare. Wrap it instead: a second copy one period to the left, and both clipped
      // to the tile, so every tile is exactly periodic and side-by-side tiles join without a seam.
      `<g id="${id}"><g clip-path="url(#tc)"><g id="${id}o" transform="translate(${f(SHIFT_X / CELL, 3)} ${f(SHIFT_Y / CELL, 3)})">${offset.join('')}</g><use href="#${id}o" x="${-PCOLS}"/></g>${base.join('')}${patch.join('')}</g>`,
    )
    layerTiles.push(id)
  })

  // ----- motion plan -----
  /** Shared step rate (steps per second) for everything that travels: frames line up. */
  const RATE = [0, 8, 16, 32][motion]!
  /** Seconds for the fastest band to cross one period (about one window width). */
  const CROSS = [0, 240, 120, 60][motion]!
  // layer 0 leftward, layer 1 rightward (counter-swell), layer 2 leftward and slower
  const LAYER = [
    { dir: -1, speed: 1 },
    { dir: 1, speed: 0.75 },
    { dir: -1, speed: 0.55 },
  ]
  const travel: string[] = []
  layerTiles.forEach((id, li) => {
    const cls = `L${li}m`
    travel.push(`<g class="${cls}"><g transform="scale(${CELL})"><use href="#${id}"/><use href="#${id}" x="${PCOLS}"/></g></g>`)
    if (motion === 0) return
    const dur = Math.round(CROSS / LAYER[li]!.speed)
    const steps = gridLock ? PCOLS : dur * RATE
    const [from, to] = LAYER[li]!.dir < 0 ? [0, -P] : [-P, 0]
    css.push(`.${cls}{transform:translateX(${from}px);animation:${cls} ${dur}s steps(${steps}) infinite}`)
    css.push(`@keyframes ${cls}{from{transform:translateX(${from}px)}to{transform:translateX(${to}px)}}`)
  })

  // glare sweep (motion 2 and 3): a soft diagonal beam of halftone glow that crosses the window
  let sweep = ''
  if (motion >= 2) {
    const SC = 70 // beam grid width in cells, centered on x = 0
    const S0 = -SC / 2
    const lean = Math.tan((24 * Math.PI) / 180)
    const bw = 150
    const tone = new Int8Array(SC * ROWS).fill(-1)
    for (let j = 0; j < ROWS; j += 1) {
      for (let i = 0; i < SC; i += 1) {
        const x = (i + S0 + 0.5) * CELL
        const y = (j + ROW0 + 0.5) * CELL
        const s = x - (y - H / 2) * lean
        const g = Math.exp(-((s / bw) ** 2) * 2.2) * (0.9 + 0.1 * hashOf(i, j, 71 + salt))
        if (g > 0.18) tone[j * SC + i] = g > 0.7 ? 2 : g > 0.42 ? 1 : 0
      }
    }
    const SWEEP_ALPHA = [0.07, 0.12, 0.18]
    const parts: string[] = []
    for (let t = 0; t < 3; t += 1) {
      defs.push(discTile(`w${t}`, 4.2 + t * 0.6, t === 2 ? fam.light : fam.main, SWEEP_ALPHA[t]!))
      const d = runsD(SC, S0, k => tone[k] === t)
      if (d) parts.push(`<path d="${d}" stroke="url(#w${t})"/>`)
    }
    sweep = `<g class="sw"><g transform="scale(${CELL})">${parts.join('')}</g></g>`
    const period = motion === 3 ? 40 : 64
    const span = 0.45 // share of the period the beam is on screen
    const moveSteps = Math.round(period * span * RATE)
    css.push(`.sw{transform:translateX(-800px);animation:sw ${period}s steps(${moveSteps}) infinite}`)
    css.push(`@keyframes sw{0%{transform:translateX(-800px)}${f(span * 100, 1)}%{transform:translateX(2400px)}100%{transform:translateX(2400px)}}`)
  }

  // ----- the quiet veil (static, on top of the moving field) -----
  let veil = ''
  if (qc > 0) {
    const a = 0.82 * qc
    const b = 0.9 * qc
    defs.push(
      `<linearGradient id="vc" x1="0" x2="${W}" gradientUnits="userSpaceOnUse">` +
        [[0, 0], [220, 0], [400, a * 0.6], [520, a], [1080, a], [1200, a * 0.6], [1380, 0], [W, 0]]
          .map(([x, o]) => `<stop offset="${f(x! / W, 3)}" stop-color="${fam.paper}" stop-opacity="${f(o!)}"/>`)
          .join('') +
        `</linearGradient>`,
      `<radialGradient id="vt" cx=".5" cy=".85" r=".5">` +
        `<stop offset="0" stop-color="${fam.paper}" stop-opacity="${f(b)}"/><stop offset=".62" stop-color="${fam.paper}" stop-opacity="${f(b)}"/><stop offset="1" stop-color="${fam.paper}" stop-opacity="0"/></radialGradient>`,
    )
    veil = `<rect x="-20" y="-20" width="${W + 40}" height="${H + 40}" fill="url(#vc)"/><rect x="300" y="740" width="1000" height="300" fill="url(#vt)"/>`
  }

  // ----- stars (fixed in the sky) -----
  const TW = 6
  type Group = { dustS: string; dustL: string; haloO: string; haloM: string; haloC: string; flares: string[] }
  const groups: Group[] = Array.from({ length: TW }, () => ({ dustS: '', dustL: '', haloO: '', haloM: '', haloC: '', flares: [] }))
  const dot = (x: number, y: number) => `M${f(x, 1)} ${f(y, 1)}h0`.replace(/ -/g, '-')
  const sx = SHIFT_X
  const sy = SHIFT_Y
  // dust: tiny dots, fewer in the quiet column
  const dustCount = Math.round(170 * (0.4 + density))
  for (let n = 0; n < dustCount; n += 1) {
    const x = rng.between(6, W - 6)
    const y = rng.between(6, H - 6)
    const big = rng.r() < 0.3
    const g = groups[n % TW]!
    if (rng.r() < quietness(x, y) * STAR_QUIET * 0.8) continue
    if (big) g.dustL += dot(x, y)
    else g.dustS += dot(x, y)
  }
  const taken: [number, number][] = []
  const freeSpot = (x: number, y: number, gap: number) => taken.every(([a, b]) => Math.hypot(a - x, b - y) >= gap)
  const edgeSpot = (maxQ: number, gap: number): [number, number] | null => {
    for (let tries = 0; tries < 400; tries += 1) {
      const x = rng.between(30, W - 30)
      const y = rng.between(30, H - 30)
      if (quietness(x, y) * STAR_QUIET > maxQ || !freeSpot(x, y, gap)) continue
      taken.push([x, y])
      return [x, y]
    }
    return null
  }
  // halo stars: offset disc, soft halo, white core
  const haloCount = Math.round(16 * (0.5 + density * 0.85))
  for (let n = 0; n < haloCount; n += 1) {
    const s = edgeSpot(n < 2 ? 1 : 0.25, 70)
    if (!s) continue
    const g = groups[(n * 5 + 1) % TW]!
    const r = rng.between(1.8, 3.4)
    const [x, y] = s
    if (quietness(x, y) * STAR_QUIET > 0.25) {
      // a faint small star in the quiet middle, no halo
      g.flares.push(`<circle cx="${f(x, 1)}" cy="${f(y, 1)}" r="${f(r * 0.45)}" fill="${fam.pale}" opacity=".35"/>`)
      continue
    }
    g.haloO += dot(x + sx * 0.6, y + sy * 0.6)
    g.haloM += dot(x, y)
    g.haloC += dot(x, y)
  }
  // bright stars: hand-cut six-point asterisks (the M1 star), a pale outline over an offset fill
  // in the hue. Each is its own element so it can glint on its own clock (see "glint" below).
  const astPts: string[] = []
  for (let k = 0; k < 12; k += 1) {
    const th = -Math.PI / 2 + (TAU * k) / 12
    const r = (k % 2 === 0 ? 1 : 0.3) * (1 + rng.between(-0.07, 0.07))
    astPts.push(`${f(Math.cos(th) * r)} ${f(Math.sin(th) * r)}`.replace(/ -/g, '-'))
  }
  const bright: string[] = []
  const brightCount = Math.round(8 * (0.6 + density * 0.7)) + 2
  for (let n = 0; n < brightCount; n += 1) {
    const s = edgeSpot(0.15, 130)
    if (!s) continue
    const [x, y] = s
    const R = rng.between(7, 13)
    const rot = rng.between(0, 60)
    const shape = (dx: number, dy: number) => `translate(${f(dx, 1)} ${f(dy, 1)}) rotate(${f(rot, 0)}) scale(${f(R, 1)})`
    bright.push(
      `<g transform="translate(${f(x, 1)} ${f(y, 1)})"><g class="gl${bright.length}">` +
        `<use href="#ast" transform="${shape(sx, sy)}" fill="${acc.stars?.length ? acc.stars[bright.length % acc.stars.length] : fam.main}" fill-opacity=".85"/>` +
        `<use href="#ast" transform="${shape(0, 0)}" fill="none" stroke="${fam.pale}" stroke-width="${f(1 / R, 3)}" stroke-opacity=".9" stroke-linejoin="round"/>` +
        `</g></g>`,
    )
  }
  // glint: each bright star rests a little dim, and once per cycle it brightens, swells to 1.3×
  // and turns 10° over about a second, then settles back. All stars share one cycle split into
  // slots, one star per slot in a shuffled order, so only one star glints at a time and the
  // sparkle wanders around the sky. Stepped at GLINT_RATE per second, held with steps(1) between.
  const GLINT_RATE = 12
  const SLOT = 1.6 // seconds per star; the glint itself takes GLINT of it
  const GLINT = 1.2
  const CYCLE = Math.max(11, SLOT * bright.length)
  const seg = (sec: number) => (fps > 0 ? `steps(${Math.max(2, Math.round(sec * GLINT_RATE))})` : 'ease-in-out')
  if (bright.length > 0) {
    const pc = (sec: number) => f((sec / CYCLE) * 100, 2)
    const t0 = CYCLE - GLINT // the glint sits at the end of each star's cycle
    if (motion > 0) css.push(
      `@keyframes gk{0%{opacity:.72;transform:none;animation-timing-function:steps(1)}` +
        `${pc(t0)}%{opacity:.72;transform:none;animation-timing-function:${seg(0.42)}}` +
        `${pc(t0 + 0.42)}%{opacity:1;transform:scale(1.3) rotate(10deg);animation-timing-function:${seg(0.36)}}` +
        `${pc(t0 + 0.78)}%{opacity:.9;transform:scale(1.08) rotate(4deg);animation-timing-function:${seg(0.42)}}` +
        `100%{opacity:.72;transform:none}}`,
    )
    // shuffled slot order (seeded), so neighbours in the list are not neighbours in time
    const order = bright.map((_, n) => n)
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng.r() * (i + 1))
      ;[order[i], order[j]] = [order[j]!, order[i]!]
    }
    order.forEach((n, slot) => {
      // star n glints during [slot·SLOT, slot·SLOT + GLINT) of every cycle
      const delay = slot * SLOT - t0
      css.push(motion > 0 ? `.gl${n}{opacity:.72;animation:gk ${f(CYCLE, 1)}s ${f(delay, 2)}s infinite}` : `.gl${n}{opacity:.72}`)
    })
  }
  defs.push(`<path id="ast" d="M${astPts.join('L')}Z"/>`)

  const starGroups = groups
    .map((g, i) => {
      const p = (d: string, color: string, w: number, a: number) =>
        d ? `<path d="${d}" stroke="${color}" stroke-width="${w}"${a < 1 ? ` stroke-opacity="${a}"` : ''}/>` : ''
      const inner =
        p(g.dustS, fam.pale, 1.5, 0.5) +
        p(g.dustL, fam.light, 2.4, 0.75) +
        p(g.haloO, acc.offset ?? fam.dark, 7.5, 0.7) +
        p(g.haloM, acc.halo ?? fam.main, 6.5, 0.6) +
        p(g.haloC, fam.pale, 3.2, 1) +
        g.flares.join('')
      return inner ? `<g class="t${i}">${inner}</g>` : ''
    })
  // twinkle: opacity only, 4–10 s, staggered, small amplitude. Durations and delays are whole
  // multiples of a step, so twinkle steps land on the same frames as the travel steps.
  const twLow = motion === 3 ? 0.45 : 0.6
  const TWD = motion === 3 ? [4, 4.5, 5.5, 6, 7, 8] : [4.5, 5.5, 6.5, 7.5, 8.5, 9.5]
  // Motion 0 is a still picture: no twinkle and no glint (the stars hold their resting look).
  for (let i = 0; i < (motion > 0 ? TW : 0); i += 1) {
    const dur = TWD[i]!
    const tf = fps > 0 ? `steps(${Math.max(2, Math.round((dur / 2) * fps))})` : 'ease-in-out'
    css.push(`.t${i}{animation:tw ${dur}s ${tf} ${f(-((i * 2.75) % dur), 2)}s infinite}`)
  }
  if (motion > 0) css.push(`@keyframes tw{0%,100%{opacity:1}50%{opacity:${twLow}}}`)

  // drift (motion 1–3): the stars wander very slowly in three loose groups, each on its own
  // closed path of a few units, so the sky never sits perfectly still. Stepped at DRIFT_RATE
  // per second; at under 0.3 units a step the stepping is invisible.
  const DRIFT_RATE = 4
  const DA = [0, 6, 8, 10][motion]! // how far a group wanders, in units
  const DD = [0, 150, 120, 95][motion]! // seconds for one loop
  const LOOPS: [number, number][][] = [
    [[0, 0], [1, -0.5], [0.4, 1], [-0.7, 0.3]],
    [[0, 0], [-0.8, -0.6], [-0.2, 0.9], [0.9, 0.4]],
    [[0, 0], [0.5, 0.9], [-0.9, 0.2], [-0.1, -0.8]],
  ]
  const drifting = [0, 1, 2]
    .map(k => {
      const dust = starGroups.filter((_, i) => i % 3 === k).join('')
      const stars = bright.filter((_, n) => n % 3 === k).join('')
      if (motion > 0) {
        const dur = Math.round(DD * (1 + k * 0.17))
        const pts = LOOPS[k]!
        const segSteps = Math.max(2, Math.round((dur / pts.length) * DRIFT_RATE))
        const frames = pts
          .map(([x, y], j) => `${(j * 100) / pts.length}%{transform:translate(${f(x * DA, 1)}px,${f(y * DA, 1)}px)}`)
          .join('')
        css.push(`.d${k}{animation:dk${k} ${dur}s steps(${segSteps}) ${f(-k * 23, 0)}s infinite}`)
        css.push(`@keyframes dk${k}{${frames}100%{transform:translate(0px,0px)}}`)
      }
      return `<g class="d${k}"><g fill="none" stroke-linecap="round">${dust}</g>${stars}</g>`
    })
    .join('\n')

  css.push(`@media (prefers-reduced-motion:reduce){*{animation:none!important}}`)

  // ----- assemble -----
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">`,
    `<style>${css.join('\n')}</style>`,
    `<defs>${defs.join('\n')}</defs>`,
    `<rect x="-50" y="-50" width="${W + 100}" height="${H + 100}" fill="${fam.paper}"/>`,
    `<g fill="none">${travel.join('\n')}\n${sweep}</g>`,
    veil,
    drifting,
    `</svg>`,
  ].join('\n')
}
