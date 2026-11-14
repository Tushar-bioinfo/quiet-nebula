// Palettes: the approved "c deep" panels for each scene hue (Blue, Ember), and the helper that turns
// any panel spec into a full app palette through the app's own builder (make-colors.js, never edited).

import type { ThemeColors } from 'claude-code'

import { makeColors } from './make-colors.js'

export type PaletteHue = 'blue' | 'ember'

export type Spec = { surfaces: [string, string, string, string]; text: [string, string, string]; accent: string; danger: string }

/**
 * The approved palette ("c deep", polish round 1): surfaces soaked in the hue and a softer,
 * lighter-sister accent. Borders, hover and selection come from the brightest gray at 5–20 %.
 * The other round-1 variants (a first pass, b ink, d hue-lit) live in previews/palette/.
 */
const HUES_SET: Record<PaletteHue, Spec> = {
  blue: { surfaces: ['#060a17', '#0c1324', '#111a30', '#15203a'], text: ['#eef3ff', '#b9c7e6', '#8495bd'], accent: '#7ab4ff', danger: '#ff6b7a' },
  ember: { surfaces: ['#110807', '#1b0f0d', '#241613', '#2a1a15'], text: ['#fdf0eb', '#e0c3b8', '#ae8d82'], accent: '#ff8466', danger: '#ff5c8a' },
}

/** The hue's colors, for previews. */
export function paletteSpec(hue: PaletteHue): Spec {
  return HUES_SET[hue]
}

/** The color behind the glass for a hue: its darkest surface. */
export function glassTint(hue: PaletteHue): string {
  return HUES_SET[hue].surfaces[0]
}

export type Roles = { accent: string; danger: string; success: string; warning: string; pro: string }

/** The accent and status colors a spec gets when a look sets none. */
export function defaultRoles(h: Spec): Roles {
  return { accent: h.accent, danger: h.danger, success: '#59d499', warning: '#e8b04a', pro: '#cf2f98' }
}

/** Any panel spec as an app palette; `roles` replaces the accent and status colors. */
export function paletteFromSpec(h: Spec, roles: Roles | undefined, label: string): { theme: ThemeColors; problems: string[] } {
  return makeColors({
    label,
    only: 'dark',
    roles: roles ?? defaultRoles(h),
    dark: {
      gray: {
        anchors: {
          'surface-0': h.surfaces[0],
          'surface-1': h.surfaces[1],
          'surface-2': h.surfaces[2],
          'surface-3': h.surfaces[3],
          'text-primary': h.text[0],
          'text-secondary': h.text[1],
          'text-muted': h.text[2],
        },
      },
    },
  })
}

/** The hue's approved palette; `roles` replaces the accent and status colors. */
export function basePalette(hue: PaletteHue = 'blue', roles?: Roles, label = `Quiet Nebula (${hue})`): { theme: ThemeColors; problems: string[] } {
  return paletteFromSpec(HUES_SET[hue], roles, label)
}
