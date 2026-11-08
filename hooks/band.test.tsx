import { expect, test } from 'claude-code/testing'

const OUT = JSON.stringify({
  jours: { '2026-11-07': 206, '2026-11-08': 105 },
  tokens: { '2026-11-07': 457_000_000, '2026-11-08': 367_000_000 },
  auj: '2026-11-08',
  tz: 60,
})

const BAND = {
  plugin: 'usage-grid',
  component: 'AbovePrompt',
  props: { hasSurvey: false, bodyColumns: 100 },
} as const

test('la bande montre les tokens et la semaine sur desktop', async ($, on) => {
  on('command.register', () => ({ value: { command: 'mon-claude' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: OUT, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: {} as never, rateLimits: [{ kind: 'seven_day', percentUsed: 17, resetsAt: '2026-11-11T04:00:00Z' }] },
  }))
  on('fs.write', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.parse('2026-11-08T19:00:00Z') }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'mon-claude' } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  const svg = await ui.find({ type: 'Svg' } as never)
  expect(svg).toBeDefined()
  expect(String((svg as any)?.props?.alt ?? (svg as any)?.alt)).toContain('367 M')
  expect(await ui.find({ key: 'details' } as never)).toBeDefined()
  await ui.unmount()
})
