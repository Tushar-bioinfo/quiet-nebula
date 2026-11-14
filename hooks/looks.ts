// Looks: complete, named color setups, switched with /qn <name>. They share one shape, so a change
// to the scene, the palette builder or the glass reaches every look, and one check covers them all:
// `bun scripts/check-looks.ts` (palettes, scene size, forbidden elements, previews of all looks).
//
// Each look may set:
//   sky      the scene's six-color family; unset = the Hue's family (Blue or Ember)
//   accents  colors for parts of the scene (offset plate, crests, glyphs, patches, stars, halos)
//   panels   the app's surfaces and text; unset = the Hue's approved deep palette
//   roles    the app's accent and status colors; unset = the panels' own
// A look with its own `sky` and `panels` (noir) ignores the Hue setting.
import type { Accents, Family, GlyphSkyOptions, Hue } from './glyph-sky'
import { basePalette, glassTint, paletteFromSpec, type Roles, type Spec } from './palette'

export type LookName = 'deep' | 'misprint' | 'miles' | 'noir'
export type Look = { name: string; sky?: Family; accents?: Accents; panels?: Spec; roles?: Roles }

export const LOOKS: Record<LookName, Look> = {
  // The approved look: one hue family, deep panels (palette polish round 1, "c deep").
  deep: { name: 'Deep (approved)' },
  // Spider-Verse round 2: red-magenta offset fringe, yellow stars, pale-cyan crests, red buttons.
  misprint: {
    name: 'Misprint',
    accents: { offset: '#c2304f', crest: '#8fe8ff', glyphs: ['#e4edff', '#f5d547', '#e4edff', '#ff7aa2'], stars: ['#f5d547'] },
    roles: { accent: '#ff4d6d', danger: '#ff3b3b', success: '#4fe0b0', warning: '#f5d547', pro: '#c86bff' },
  },
  // Spider-Verse round 2: Prowler-purple offset and patches, a few red marks, red and white stars.
  miles: {
    name: 'Miles',
    accents: { offset: '#6b3fd1', glyphs: ['#ff4a4a', '#e4edff', '#e4edff', '#e4edff'], patch: '#9b6bff', stars: ['#ff4a4a', '#e4edff'], halo: '#9b6bff' },
    roles: { accent: '#ff4a4a', danger: '#ff2d6f', success: '#59d499', warning: '#ffb84a', pro: '#9b6bff' },
  },
  // Spider-Verse round 1 (research, docs/research/spiderverse-palette.md): near-black and slate blue.
  // Surface-1 lifted slightly so makeColors reports 0 problems.
  noir: {
    name: 'Noir Ink',
    sky: { paper: '#030407', plate: '#0c1220', dark: '#1d2a44', main: '#4d6592', light: '#95a9cf', pale: '#e9eef8' },
    panels: { surfaces: ['#040508', '#0e121b', '#12161f', '#191e2a'], text: ['#e9edf5', '#aeb6c6', '#7d8799'], accent: '#8fa9e0', danger: '#ff6b7a' },
  },
}

export const LOOK_NAMES = Object.keys(LOOKS) as LookName[]

/** The scene options a look sets (merge into glyphSkySvg's options). */
export function lookScene(look: LookName): Pick<GlyphSkyOptions, 'colors' | 'accents'> {
  const l = LOOKS[look]
  return { ...(l.sky && { colors: l.sky }), ...(l.accents && { accents: l.accents }) }
}

/** A look's app palette: its own panels, or the hue's approved ones, with the look's roles. */
export function lookPalette(look: LookName, hue: Hue): ReturnType<typeof basePalette> {
  const l = LOOKS[look]
  if (l.panels !== undefined) return paletteFromSpec(l.panels, l.roles, `Quiet Nebula (${look})`)
  return basePalette(hue, l.roles, look === 'deep' ? `Quiet Nebula (${hue})` : `Quiet Nebula (${hue}, ${look})`)
}

/** The glass tint for a look: its own darkest panel, or the hue's. */
export function lookGlassTint(look: LookName, hue: Hue): string {
  return LOOKS[look].panels?.surfaces[0] ?? glassTint(hue)
}
