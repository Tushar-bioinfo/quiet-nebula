// Run: claude plugin test mod/
// The hooks here stand for the engine: they record every theme the mod sends.
import type { On, ThemeBackdrop, ThemeSetArgs } from 'claude-code'
import { expect, test, type Engine } from 'claude-code/testing'

import { glyphSkySvg } from '../hooks/glyph-sky'
import { lookScene } from '../hooks/looks'

const DRAWN = { value: { isDrawn: true as const, requestId: 'r1' } }

function engine(on: On): ThemeSetArgs[] {
  const sent: ThemeSetArgs[] = []
  on('command.register', () => ({ value: { command: 'qn' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('theme.set', (_, e) => {
    sent.push(e)
    return DRAWN
  })
  return sent
}

const backdrop = (t: ThemeSetArgs | undefined) => t?.backdrop as (ThemeBackdrop & { scene?: string; glass?: unknown }) | undefined
const glassOf = (t: ThemeSetArgs | undefined) => backdrop(t)?.glass
const sceneOf = (t: ThemeSetArgs | undefined) => backdrop(t)?.scene

/** `/qn <args>` as the person types it at the prompt. */
const qn = ($: Engine, args: string) =>
  $.command.run({ command: 'qn', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as Parameters<Engine['command']['run']>[0])

test('a new session sends the locked defaults at startup, before any command', async ($, on) => {
  const sent = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sent.length).toBe(1)
  expect(sceneOf(sent[0])).toBe('qn-glyph-blue-m1-q0-lnoir')
  expect(glassOf(sent[0])).toEqual({ blur: 0.3, opacity: 0.65, tint: '#040508' })
  expect(sent[0]?.colors?.label).toBe('Quiet Nebula (noir)')
})

test('startup goes on when /qn cannot be registered or the theme is not drawn', async ($, on) => {
  const sent: ThemeSetArgs[] = []
  const status: (string | undefined)[] = []
  on('command.register', () => {
    throw new Error('name taken')
  })
  on('ui.status', (_, e) => {
    status.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('theme.set', (_, e) => {
    sent.push(e)
    return { value: { isDrawn: false as const, reason: 'no app attached' } }
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(sent.length).toBe(1)
  // the failed registration is shown; "not drawn" (normal in a terminal) is not
  expect(status.length).toBe(1)
  expect(status[0]).toMatch(/not registered/)
})

test('a bad argument changes nothing and sends nothing', async ($, on) => {
  const sent = engine(on)
  await qn($, 'reset')
  const n = sent.length
  for (const args of ['glass .7 bogus', 'glass 2', 'glass .5 hue 99', 'glass .5 constructor', 'glass NaN', 'motion 4', 'motion 1.5', 'motion 01', 'motion', 'quiet -1', 'quiet abc', 'quiet Infinity', 'hue red', 'hue BLUE', 'hue blue extra', 'noir now', 'scene a', 'debug on', 'touches marks', 'color accent #ff0000', 'reset now']) {
    const r = await qn($, args)
    expect(r.text).not.toMatch(/^look:/)
  }
  expect(sent.length).toBe(n)
  expect((await qn($, '')).text).toMatch(/motion: 1 · quiet: 0 · glass: opacity 0.65, tint hue, blur 0.3/)
  await qn($, 'quiet -0')
  expect((await qn($, '')).text).toMatch(/quiet: 0 ·/)
})

test('each setting reaches the theme', async ($, on) => {
  const sent = engine(on)
  await qn($, 'reset')
  await qn($, 'deep')
  expect(sceneOf(sent.at(-1))).toBe('qn-glyph-blue-m1-q0')
  await qn($, 'hue ember')
  await qn($, 'motion 3')
  await qn($, 'quiet 0.25')
  expect(sceneOf(sent.at(-1))).toBe('qn-glyph-ember-m3-q25')
  await qn($, 'glass 0.4 #ABCDEF 12')
  expect(glassOf(sent.at(-1))).toEqual({ blur: 12, opacity: 0.4, tint: '#abcdef' })
  await qn($, 'glass 0.4 none')
  expect(glassOf(sent.at(-1))).toEqual({ blur: 12, opacity: 0.4 })
  await qn($, 'reset')
  expect(sceneOf(sent.at(-1))).toBe('qn-glyph-blue-m1-q0-lnoir')
})

test('noir ignores the hue, so switching hue reuses the same scene and palette', async ($, on) => {
  const sent = engine(on)
  await qn($, 'noir')
  const a = sent.at(-1)
  await qn($, 'hue ember')
  const b = sent.at(-1)
  expect(sceneOf(a)).toBe('qn-glyph-blue-m1-q0-lnoir')
  expect(sceneOf(b)).toBe(sceneOf(a))
  expect(b?.colors).toEqual(a?.colors)
})

test('an older /qn that fails never undoes a newer one', async ($, on) => {
  let calls = 0
  let rejectOlder: ((e: Error) => void) | undefined
  let olderEntered: (() => void) | undefined
  const entered = new Promise<void>(r => (olderEntered = r))
  on('theme.set', () => {
    calls += 1
    if (calls === 2) {
      olderEntered!()
      return new Promise((_, reject) => (rejectOlder = reject))
    }
    return DRAWN
  })
  await qn($, 'reset')
  const older = qn($, 'hue ember')
  await entered
  const newer = qn($, 'motion 3') // queued behind the older one
  expect(calls).toBe(2)
  rejectOlder!(new Error('theme request rejected'))
  expect((await older).text).toMatch(/^Not changed:/)
  expect((await newer).text).toMatch(/motion: 3/)
  const report = (await qn($, '')).text
  expect(report).toMatch(/hue: blue/)
  expect(report).toMatch(/motion: 3/)
})

test('motion 0 is a still picture: no animation at all', () => {
  const svg = glyphSkySvg({ hue: 'blue', motion: 0, quietCenter: 0, ...lookScene('misprint') })
  const css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1] ?? ''
  expect(css.match(/animation:(?!none)/g) ?? []).toEqual([])
})

test('the backdrop draws our scene, and passes other ids and other plugins on', async ($, on) => {
  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') return next(e)
    const { Svg } = $.ui.resolve(e)
    return <Svg source='<svg xmlns="http://www.w3.org/2000/svg"/>' alt="engine" />
  })
  const glass = { blur: 0.3, opacity: 0.65 }
  const base = { component: 'Backdrop', surface: 'desktop', requestId: 'r1' } as const
  const ours = await $.ui.mount({ ...base, plugin: 'quiet-nebula', props: { plugin: 'quiet-nebula', scene: 'qn-glyph-blue-m1-q0-lmisprint', glass } })
  const svg = await ours.find({ type: 'Svg' })
  expect(svg?.props.source).toBe(glyphSkySvg({ hue: 'blue', motion: 1, quietCenter: 0, ...lookScene('misprint') }))
  await ours.unmount()
  for (const props of [{ plugin: 'other-mod', scene: 'qn-glyph-blue-m1-q0', glass }, { plugin: 'quiet-nebula', scene: 'qn-glyph-blue-m9-q0', glass }, { plugin: 'quiet-nebula', scene: 'qn-mosaic-b', glass }]) {
    const ui = await $.ui.mount({ ...base, plugin: 'quiet-nebula', props })
    expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('engine')
    await ui.unmount()
  }
})
