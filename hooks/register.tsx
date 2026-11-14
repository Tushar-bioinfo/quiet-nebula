// Quiet Nebula: a calm dark theme for the Claude desktop app. A glyph-sky backdrop (tiny halftone
// crosses in slow travelling wave bands, drifting and glinting stars) plus a matching app palette.
//
// /qn                             show the current settings and help
// /qn deep|misprint|miles|noir    switch the whole look (sky colors, panels, accent); see looks.ts
// /qn hue blue|ember              color family for deep, misprint and miles (noir has its own)
// /qn motion 0|1|2|3              travel speed: still, ~4 min, ~2 min, ~1 min per crossing
// /qn quiet <0–1>                 dim the sky behind the chat column (0 = not at all)
// /qn glass <opacity> [tint] [blur]   the veil over the chat area; tint: hue | none | #rrggbb
// /qn reset                       back to the defaults below
//
// Settings live in module variables, so every new session (and every reload) starts at DEFAULTS.

import type { EngineInterface, Register, ThemeBackdropGlass, ThemeSetArgs } from 'claude-code'

import { glyphSkySvg, type Hue, type Motion } from './glyph-sky'
import { LOOK_NAMES, LOOKS, lookGlassTint, lookPalette, lookScene, type LookName } from './looks'

type Settings = { look: LookName; hue: Hue; motion: Motion; quiet: number; opacity: number; tint: string; blur: number }

/** The locked defaults (2026-11-14): Noir Ink, motion 1, glass opacity .65 tinted to the look, blur .3. Hue stays Blue for the other looks. */
const DEFAULTS: Readonly<Settings> = Object.freeze({ look: 'noir', hue: 'blue', motion: 1, quiet: 0, opacity: 0.65, tint: 'hue', blur: 0.3 })

const settings: Settings = { ...DEFAULTS }

const HEX = /^#[0-9a-f]{6}$/i

// Scenes are built on first use (~60 k characters, a few ms each). The cache keeps the 8 most
// recently used: a Map iterates in insertion order, so re-inserting on a hit keeps it fresh and the
// first key is always the oldest. The id carries every input, so a cached scene is never stale.
const SCENE_ID = /^qn-glyph-(blue|ember)-m([0-3])-q(\d{1,3})(?:-l(deep|misprint|miles|noir))?$/
const CACHE_MAX = 8
const sceneCache = new Map<string, string>()
function sceneFor(id: string): string | undefined {
  const m = SCENE_ID.exec(id)
  if (m === null) return undefined
  let svg = sceneCache.get(id)
  if (svg === undefined) {
    svg = glyphSkySvg({ hue: m[1] as Hue, motion: Number(m[2]) as Motion, quietCenter: Math.min(Number(m[3]), 100) / 100, ...lookScene((m[4] ?? 'deep') as LookName) })
  } else {
    sceneCache.delete(id)
  }
  sceneCache.set(id, svg)
  while (sceneCache.size > CACHE_MAX) sceneCache.delete(sceneCache.keys().next().value!)
  return svg
}

// A look with its own sky or panels ignores the hue for that part, so the hue is left out of that
// part's key: switching hue on noir reuses the same scene and palette instead of building twins.
const skyHue = (s: Settings): Hue => (LOOKS[s.look].sky ? 'blue' : s.hue)
const panelHue = (s: Settings): Hue => (LOOKS[s.look].panels ? 'blue' : s.hue)

// Palettes are built on first use (~2–4 ms each) and kept; there are at most 8.
const palettes = new Map<string, ReturnType<typeof lookPalette>>()
function paletteFor(s: Settings): ReturnType<typeof lookPalette> {
  const key = `${s.look}-${panelHue(s)}`
  let p = palettes.get(key)
  if (p === undefined) palettes.set(key, (p = lookPalette(s.look, panelHue(s))))
  return p
}

function sceneId(s: Settings): string {
  return `qn-glyph-${skyHue(s)}-m${s.motion}-q${Math.round(s.quiet * 100)}${s.look === 'deep' ? '' : `-l${s.look}`}`
}

function theme(s: Settings): ThemeSetArgs {
  const tint = s.tint === 'hue' ? lookGlassTint(s.look, s.hue) : s.tint === 'none' ? undefined : s.tint
  const glass: ThemeBackdropGlass = { blur: s.blur, opacity: s.opacity, ...(tint !== undefined && { tint }) }
  return { colors: paletteFor(s).theme, backdrop: { scene: sceneId(s), glass } }
}

function describe(s: Settings): string {
  const l = LOOKS[s.look]
  return [
    `look: ${l.name} (/qn ${s.look}) · hue: ${s.hue}${l.sky && l.panels ? ' (not used by this look)' : l.sky || l.panels ? ' (partly used by this look)' : ''}`,
    `motion: ${s.motion}${s.motion === 0 ? ' (still)' : ''} · quiet: ${s.quiet} · glass: opacity ${s.opacity}, tint ${s.tint}, blur ${s.blur}`,
  ].join('\n')
}

const HELP = [
  '/qn deep|misprint|miles|noir   whole look',
  '/qn hue blue|ember',
  '/qn motion 0|1|2|3   (0 = a still picture, the cheapest)',
  '/qn quiet <0–1>   dim the sky behind the chat',
  '/qn glass <opacity 0–1> [hue|none|#rrggbb] [blur 0–64]',
  '/qn reset   back to the defaults',
].join('\n')

/** One `/qn` request: check every argument, send the new theme, and keep it only if the app took it. */
async function qn($: EngineInterface, args: string): Promise<{ text: string }> {
  const [what, ...rest] = args.trim().split(/\s+/).filter(Boolean)
  // Work on a copy; it becomes the settings only after the app accepted it.
  const draft: Settings = { ...settings }
  if (what === undefined) {
    return { text: `${describe(settings)}\n\n${HELP}` }
  } else if ((LOOK_NAMES as readonly string[]).includes(what)) {
    if (rest.length > 0) return { text: `"/qn ${what}" takes no arguments.\n${HELP}` }
    draft.look = what as LookName
  } else if (what === 'hue') {
    if (rest.length !== 1 || (rest[0] !== 'blue' && rest[0] !== 'ember')) return { text: `Hue must be blue or ember.\n${HELP}` }
    draft.hue = rest[0]
  } else if (what === 'motion') {
    if (rest.length !== 1 || !/^[0-3]$/.test(rest[0]!)) return { text: `Motion must be 0, 1, 2 or 3.\n${HELP}` }
    draft.motion = Number(rest[0]) as Motion
  } else if (what === 'quiet') {
    const quiet = rest.length === 1 ? Number(rest[0]) : NaN
    if (!Number.isFinite(quiet) || quiet < 0 || quiet > 1) return { text: `Quiet must be a number from 0 to 1.\n${HELP}` }
    draft.quiet = Math.round(quiet * 100) / 100 || 0 // `|| 0` turns -0 into 0
  } else if (what === 'glass') {
    if (rest.length < 1 || rest.length > 3) return { text: HELP }
    const opacity = Number(rest[0])
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) return { text: `Opacity must be 0–1.\n${HELP}` }
    const tint = rest[1] ?? draft.tint
    if (tint !== 'hue' && tint !== 'none' && !HEX.test(tint)) return { text: `Tint must be hue, none or #rrggbb.\n${HELP}` }
    const blur = rest[2] === undefined ? draft.blur : Number(rest[2])
    if (!Number.isFinite(blur) || blur < 0 || blur > 64) return { text: `Blur must be 0–64.\n${HELP}` }
    draft.opacity = opacity
    draft.tint = tint.startsWith('#') ? tint.toLowerCase() : tint
    draft.blur = blur
  } else if (what === 'reset') {
    if (rest.length > 0) return { text: HELP }
    Object.assign(draft, DEFAULTS)
  } else {
    return { text: `Unknown setting "${what}".\n${HELP}` }
  }
  let set: Awaited<ReturnType<typeof $.theme.set>>
  try {
    set = await $.theme.set(theme(draft))
  } catch (err) {
    return { text: `Not changed: the app refused the theme (${String(err).slice(0, 200)}).\n${describe(settings)}` }
  }
  Object.assign(settings, draft)
  if (statusShown) {
    $.ui.status(undefined) // the theme works now, so the startup notice is stale
    statusShown = false
  }
  return { text: set.isDrawn ? describe(settings) : `Saved, but not drawn here: ${set.reason}\n${describe(settings)}` }
}

// One /qn at a time: each waits for the one before it, so an older request that fails can never
// undo a newer one that the app already accepted.
let queue: Promise<unknown> = Promise.resolve()
/** True while a startup problem is shown in the status line. */
let statusShown = false

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Neither step may stop a session from starting. `isDrawn: false` is normal (a terminal session,
    // or the app not attached yet: the theme then waits for it), so it is not shown.
    try {
      await $.command.register({ name: 'qn', description: 'Quiet Nebula: look (deep, misprint, miles, noir), hue, motion, quiet, glass.', argumentHint: 'deep|misprint|miles|noir|hue|motion|quiet|glass|reset' })
    } catch (err) {
      $.ui.status(`quiet-nebula: /qn not registered (${String(err).slice(0, 200)})`)
      statusShown = true
    }
    try {
      await $.theme.set(theme(settings))
    } catch (err) {
      $.ui.status(`quiet-nebula: theme not set (${String(err).slice(0, 200)})`)
      statusShown = true
    }
    return next(e)
  })

  on('command.run', { command: 'qn' }, ($, e) => {
    const run = queue.then(() => qn($, e.args))
    queue = run.catch(() => undefined)
    return run
  })


  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    // Draw only backdrops this mod set; another mod's scene ids pass through untouched.
    if (e.props.plugin !== $.plugin.name) return next(e)
    const svg = sceneFor(e.props.scene)
    if (svg === undefined) return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg source={svg} alt="A dark sky of tiny halftone crosses in slow travelling wave bands, with drifting, glinting stars" isInteractive />
  })
}
