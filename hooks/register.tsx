import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface } from 'claude-code'

import type { Jours, Limite, Limites } from '../types'

const PANE = 'usage-grid'
const TITLE = 'Mon Claude'
const WEEKS = 18
const DAY = 86_400_000

const jours = atom({ plugin: 'usage-grid', key: 'jours' } as const, { days: {}, tokens: {}, today: '', tz: 0 } as Jours, {
  shape: 'jours-2',
})
const limites = atom({ plugin: 'usage-grid', key: 'limites' } as const, { at: 0, list: [] } as Limites, {
  shape: 'limites-1',
})

// ---------- dates (UTC arithmetic on "YYYY-MM-DD" keys, no time-zone surprises) ----------
const toMs = (key: string) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10))
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const frDate = (key: string) => {
  const d = new Date(toMs(key))
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`
}

const fmtTok = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(n >= 1e10 ? 1 : 2).replace('.', ',')} Md`
  : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace('.', ',')} M`
  : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n)

const widthOf = (text: string, px: number) => Math.ceil(text.length * px * 0.6)
const maxTok = (j: Jours) => Math.max(1, ...Object.values(j.tokens))
const shortTok = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace('.', ',')} Md` : n >= 1e6 ? `${Math.round(n / 1e6)} M` : `${Math.round(n / 1e3)} k`)

// ---------- data ----------
// Python : /usr/bin/python3 sur Mac, python3, python ou py ailleurs (Windows) ; le premier qui marche est retenu
const PYTHONS = ['/usr/bin/python3', 'python3', 'python', 'py']
let python: string | undefined

async function refresh($: EngineInterface) {
  const script = `${$.plugin.root}/hooks/compter.py`
  for (const exe of python ? [python] : PYTHONS) {
    try {
      const r = await $.process.run([exe, script], { timeoutMs: 120_000 })
      if (r.exitCode !== 0) continue
      const d = JSON.parse(r.stdout)
      python = exe
      await update($, jours, () => ({ days: d.jours ?? {}, tokens: d.tokens ?? {}, today: d.auj ?? '', tz: d.tz ?? 0 }))
      return
    } catch {
      // essaie le suivant
    }
  }
}

async function keepLimits($: EngineInterface, list: readonly Limite[]) {
  if (!list.length) return
  const value: Limites = { at: await $.clock.now(), list: list.map(l => ({ ...l })) }
  await update($, limites, () => value)
  await $.store.set('limites', value)
  // un widget de bureau éventuel lit ce fichier
  try {
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    if (home) await $.fs.write(`${home}/.claude/usage-grid/limites.json`, JSON.stringify(value))
  } catch {}
}

// ---------- heatmap ----------
type Cell = { key: string; n: number; future: boolean }

function grid(j: Jours): Cell[][] {
  if (!j.today) return []
  const today = toMs(j.today)
  const dow = (new Date(today).getUTCDay() + 6) % 7 // 0 = lundi
  const start = today - dow * DAY - (WEEKS - 1) * 7 * DAY
  const cols: Cell[][] = []
  for (let w = 0; w < WEEKS; w++) {
    const col: Cell[] = []
    for (let d = 0; d < 7; d++) {
      const ms = start + (w * 7 + d) * DAY
      const key = toKey(ms)
      col.push({ key, n: j.days[key] ?? 0, future: ms > today })
    }
    cols.push(col)
  }
  return cols
}

function level(n: number, max: number) {
  if (n <= 0) return 0
  const r = n / Math.max(1, max)
  return r > 0.75 ? 4 : r > 0.5 ? 3 : r > 0.25 ? 2 : 1
}

function stats(j: Jours) {
  const keys = Object.keys(j.days).sort()
  const total = keys.reduce((s, k) => s + (j.days[k] ?? 0), 0)
  let best = { key: '', n: 0 }
  for (const k of keys) {
    const n = j.days[k] ?? 0
    if (n > best.n) best = { key: k, n }
  }
  // série : jours d'affilée jusqu'à aujourd'hui (ou hier si rien encore aujourd'hui)
  let streak = 0
  let ms = toMs(j.today)
  if (!j.days[j.today]) ms -= DAY
  while (j.days[toKey(ms)]) {
    streak++
    ms -= DAY
  }
  let week = 0
  for (let i = 0; i < 7; i++) week += j.days[toKey(toMs(j.today) - i * DAY)] ?? 0
  const active = keys.filter(k => (j.days[k] ?? 0) > 0).length
  return { total, best, streak, week, active, today: j.days[j.today] ?? 0 }
}

const STYLE = `
  .l0{fill:#ebedf0}.l1{fill:#f9d3bd}.l2{fill:#f0a275}.l3{fill:#de7442}.l4{fill:#b4501f}
  .fut{fill:none;stroke:#ebedf0;stroke-dasharray:2 2}
  .t{fill:#6b6b6b;font:500 9px -apple-system,system-ui,sans-serif}
  .big{fill:#1f1f1f;font:700 22px -apple-system,system-ui,sans-serif}
  .mid{fill:#1f1f1f;font:600 12px -apple-system,system-ui,sans-serif}
  .track{fill:#ebedf0}.pace{stroke:#1f1f1f}.sep{stroke:#ebedf0}.acc{fill:#de7442}
  rect.c:hover{stroke:#1f1f1f;stroke-width:1.2}
  @media (prefers-color-scheme: dark){
    .l0{fill:#2b2b2b}.l1{fill:#5b2e18}.l2{fill:#93461f}.l3{fill:#d06430}.l4{fill:#ff9a5c}
    .fut{stroke:#2b2b2b}.t{fill:#9a9a9a}.big,.mid{fill:#f2f2f2}.track{fill:#2b2b2b}.pace{stroke:#f2f2f2}.sep{stroke:#2b2b2b}.acc{fill:#ff9a5c}
    rect.c:hover{stroke:#f2f2f2}
  }`

function heatmapSvg(j: Jours) {
  const cols = grid(j)
  const C = 13
  const G = 3
  const left = 22
  const top = 16
  const max = maxTok(j)
  const w = left + WEEKS * (C + G)
  const h = top + 7 * (C + G) + 24
  let out = ''
  let lastMonth = -1
  cols.forEach((col, x) => {
    const m = new Date(toMs(col[0]?.key ?? j.today)).getUTCMonth()
    if (m !== lastMonth) {
      out += `<text class="t" x="${left + x * (C + G)}" y="10">${MOIS[m]}</text>`
      lastMonth = m
    }
    col.forEach((c, y) => {
      const px = left + x * (C + G)
      const py = top + y * (C + G)
      if (c.future) {
        out += `<rect class="fut" x="${px + 0.5}" y="${py + 0.5}" width="${C - 1}" height="${C - 1}" rx="3"/>`
      } else {
        const tk = j.tokens[c.key]
        const tip = `${frDate(c.key)} : ${c.n} message${c.n > 1 ? 's' : ''}${tk ? ` · ${fmtTok(tk)} tokens` : ''}`
        out += `<rect class="c l${level(tk ?? 0, max)}" x="${px}" y="${py}" width="${C}" height="${C}" rx="3"><title>${tip}</title></rect>`
      }
    })
  })
  ;['lun', '', 'mer', '', 'ven', '', ''].forEach((d, y) => {
    if (d) out += `<text class="t" x="0" y="${top + y * (C + G) + 10}">${d}</text>`
  })
  // légende
  const ly = top + 7 * (C + G) + 10
  const labels = ['0', `< ${shortTok(max * 0.25)}`, `${shortTok(max * 0.25)}+`, `${shortTok(max * 0.5)}+`, `${shortTok(max * 0.75)}+`]
  let lx = 0
  out += `<text class="t" x="${lx}" y="${ly + 8}">tokens/jour</text>`
  lx += widthOf('tokens/jour', 9) + 8
  labels.forEach((lab, i) => {
    out += `<rect class="l${i}" x="${lx}" y="${ly}" width="9" height="9" rx="2"/><text class="t" x="${lx + 12}" y="${ly + 8}">${lab}</text>`
    lx += 12 + widthOf(lab, 9) + 8
  })
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><style>${STYLE}</style>${out}</svg>`, w, h }
}

function statsSvg(j: Jours, w: number) {
  const s = stats(j)
  const cells = [
    [String(s.today), "aujourd'hui"],
    [String(s.week), '7 derniers jours'],
    [`${s.streak} j`, 'série en cours'],
  ]
  const cw = w / 3
  let out = ''
  cells.forEach(([v, l], i) => {
    out += `<text class="big" x="${i * cw}" y="24">${v}</text><text class="t" x="${i * cw}" y="40">${l}</text>`
  })
  const rec = s.best.key ? `Record : ${s.best.n} le ${frDate(s.best.key)} · ${s.active} jours actifs · ${s.total} messages en tout` : ''
  out += `<text class="t" x="0" y="60">${rec}</text>`
  const tt = Object.values(j.tokens).reduce((a, b) => a + b, 0)
  const first = Object.keys(j.tokens).sort()[0]
  out += `<line class="sep" x1="0" x2="${w}" y1="74" y2="74"/>`
  out += `<text class="big acc" x="0" y="100">${fmtTok(j.tokens[j.today] ?? 0)}</text><text class="t" x="0" y="116">tokens aujourd'hui</text>`
  out += `<text class="big acc" x="${w}" y="100" text-anchor="end">${fmtTok(tt)}</text><text class="t" x="${w}" y="116" text-anchor="end">tokens depuis le ${first ? frDate(first).replace(/^\S+ /, '') : 'début'}</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 122" width="${w}" height="122"><style>${STYLE}</style>${out}</svg>`
}

const NOMS: Record<string, string> = { seven_day: 'Limite de la semaine', five_hour: 'Limite des 5 heures' }

function gaugeSvg(l: Limite, now: number, tz: number, w: number) {
  const pct = Math.max(0, Math.min(100, l.percentUsed))
  const span = l.kind === 'five_hour' ? 5 * 3_600_000 : 7 * DAY
  let pace = -1
  let reset = ''
  if (l.resetsAt) {
    const end = Date.parse(l.resetsAt)
    pace = Math.max(0, Math.min(100, (1 - (end - now) / span) * 100))
    const loc = new Date(end + tz * 60_000)
    const hh = String(loc.getUTCHours()).padStart(2, '0')
    const mm = String(loc.getUTCMinutes()).padStart(2, '0')
    reset = `remise à zéro ${frDate(loc.toISOString().slice(0, 10))} à ${hh}h${mm}`
  }
  const col = pct >= 90 ? '#e5484d' : pct > pace + 10 && pace >= 0 ? '#f5a524' : '#de7442'
  const barW = w
  let out = `<text class="mid" x="0" y="13">${NOMS[l.kind] ?? l.kind}</text>`
  out += `<text class="big" x="${w}" y="16" text-anchor="end">${Math.round(pct)} %</text>`
  out += `<rect class="track" x="0" y="26" width="${barW}" height="10" rx="5"/>`
  out += `<rect x="0" y="26" width="${(barW * pct) / 100}" height="10" rx="5" fill="${col}"/>`
  if (pace >= 0) {
    const px = (barW * pace) / 100
    out += `<line class="pace" x1="${px}" x2="${px}" y1="22" y2="40" stroke-width="2" stroke-linecap="round"><title>Rythme régulier : ${Math.round(pace)} % à ce stade</title></line>`
    const diff = Math.round(pct - pace)
    const verdict = diff > 10 ? `en avance de ${diff} pts sur le rythme, ralentis un peu` : diff < -10 ? `${-diff} pts de marge sur le rythme` : 'pile dans le rythme'
    out += `<text class="t" x="0" y="54">${reset} · ${verdict}</text>`
  } else if (reset) {
    out += `<text class="t" x="0" y="54">${reset}</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 60" width="${w}" height="60"><style>${STYLE}</style>${out}</svg>`
}

// ---------- bande au-dessus de la zone de saisie ----------
function bandSvg(j: Jours, l: Limite | undefined, now: number) {
  const C = 10
  const G = 3
  const N = 14
  const max = maxTok(j)
  let out = ''
  for (let i = 0; i < N; i++) {
    const key = toKey(toMs(j.today) - (N - 1 - i) * DAY)
    const n = j.days[key] ?? 0
    const tk = j.tokens[key]
    out += `<rect class="c l${level(tk ?? 0, max)}${key === j.today ? ' today' : ''}" x="${i * (C + G)}" y="3" width="${C}" height="${C}" rx="2.5"><title>${frDate(key)} : ${n} messages${tk ? ` · ${fmtTok(tk)} tokens` : ''}</title></rect>`
  }
  let x = N * (C + G) + 12
  const pair = (value: string, label: string, cls: string) => {
    out += `<text class="mid ${cls}" x="${x}" y="12">${value}</text>`
    x += widthOf(value, 12) + 5
    out += `<text class="t" x="${x}" y="12">${label}</text>`
    x += widthOf(label, 9) + 16
  }
  pair(fmtTok(j.tokens[j.today] ?? 0), "tokens aujourd'hui", 'acc')
  pair(fmtTok(Object.values(j.tokens).reduce((a, b) => a + b, 0)), 'au total', '')
  if (l) {
    const pct = Math.max(0, Math.min(100, l.percentUsed))
    let pace = -1
    if (l.resetsAt) pace = Math.max(0, Math.min(100, (1 - (Date.parse(l.resetsAt) - now) / (7 * DAY)) * 100))
    const col = pct >= 90 ? '#e5484d' : pace >= 0 && pct > pace + 10 ? '#f5a524' : '#de7442'
    const bw = 70
    out += `<text class="t" x="${x}" y="12">semaine</text>`
    x += widthOf('semaine', 9) + 6
    out += `<rect class="track" x="${x}" y="5" width="${bw}" height="6" rx="3"/><rect x="${x}" y="5" width="${(bw * pct) / 100}" height="6" rx="3" fill="${col}"/>`
    if (pace >= 0) out += `<line class="pace" x1="${x + (bw * pace) / 100}" x2="${x + (bw * pace) / 100}" y1="2" y2="14" stroke-width="1.5" stroke-linecap="round"><title>Rythme régulier : ${Math.round(pace)} %</title></line>`
    x += bw + 6
    const t = `${Math.round(pct)} %`
    out += `<text class="mid" x="${x}" y="12">${t}</text>`
    x += widthOf(t, 12) + 4
  }
  const w = x
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 16" width="${w}" height="16"><style>${STYLE} .today{stroke:#de7442;stroke-width:1.2}</style>${out}</svg>`, w }
}

// ---------- terminal fallback ----------
const TERM = ['#3a3a3a', '#5b2e18', '#93461f', '#d06430', '#ff9a5c']

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'mon-claude', description: "Ouvre le panneau d'utilisation (grille + limite)" })
    const saved = (await $.store.get('limites')) as Limites | undefined
    if (saved?.list?.length) await update($, limites, () => saved)
    try {
      const u = await $.session.usage()
      await keepLimits($, u.rateLimits)
    } catch {}
    // le panneau s'ouvre sur le côté dans chaque conversation de l'app (pas dans un terminal)
    if (e.surface !== 'terminal') void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    $.clock.every(3 * 60_000, () => void refresh($))
    return started
  })

  on('command.run', { command: 'mon-claude' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    return { text: 'Panneau « Mon Claude » ouvert.' }
  })

  on('session.measure', async ($, e, next) => {
    await keepLimits($, e.rateLimits)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    void refresh($)
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface === 'terminal' || e.props.hasSurvey) return next(e)
    const j = await read($, jours)
    if (!j.today) return next(e)
    const lim = await read($, limites)
    const week = lim.list.find(l => l.kind === 'seven_day')
    const { Box, Button, Svg } = $.ui.resolve(e) as ReturnType<typeof $.ui.resolve> & { Svg?: any }
    if (!Svg) return next(e)
    const b = bandSvg(j, week, await $.clock.now())
    return (
      <Box flexDirection="row" alignItems="center" gap="sm">
        <Svg source={b.svg} alt={`Claude : ${fmtTok(j.tokens[j.today] ?? 0)} tokens aujourd'hui${week ? `, semaine à ${Math.round(week.percentUsed)} %` : ''}`} width={b.w} height={16} isInteractive />
        <Button key="details" plain label="Détails" onPress={() => void $.ui.open({ id: PANE, title: TITLE })} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const j = await read($, jours)
    const lim = await read($, limites)
    const now = await $.clock.now()
    const order = ['seven_day', 'five_hour']
    const list = [...lim.list].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))

    if (e.surface === 'terminal') {
      const { Box, Text } = $.ui.resolve(e)
      const cols = grid(j)
      const max = Math.max(1, ...Object.values(j.days))
      const s = j.today ? stats(j) : undefined
      return (
        <Box flexDirection="column">
          {cols.length === 0 && <Text dimColor>Je compte ton activité…</Text>}
          {[0, 1, 2, 3, 4, 5, 6].map(y => (
            <Text>
              {cols.map(col => (
                <Text color={col[y]?.future ? '#1e1e1e' : TERM[level(col[y]?.n ?? 0, max)]}>■ </Text>
              ))}
            </Text>
          ))}
          {s && <Text>{"Aujourd'hui"} {s.today} · 7 j {s.week} · série {s.streak} j</Text>}
          {list.map(l => (
            <Text>
              {NOMS[l.kind] ?? l.kind} : {Math.round(l.percentUsed)} %
            </Text>
          ))}
        </Box>
      )
    }

    const { Box, Text, Svg } = $.ui.resolve(e) as ReturnType<typeof $.ui.resolve> & { Svg?: any }
    if (!j.today) {
      return (
        <Box flexDirection="column" padding="sm">
          <Text dimColor>Je compte ton activité…</Text>
        </Box>
      )
    }
    const hm = heatmapSvg(j)
    return (
      <Box flexDirection="column" gap="md" padding="sm">
        {Svg ? (
          <Svg source={hm.svg} alt="Grille d'activité Claude des 18 dernières semaines" width={hm.w} isInteractive />
        ) : null}
        {Svg ? <Svg source={statsSvg(j, hm.w)} alt="Statistiques d'activité et tokens" width={hm.w} /> : null}
        {list.length === 0 && <Text dimColor>La jauge de limite apparaît après ta prochaine réponse de Claude.</Text>}
        {Svg
          ? list.map(l => (
              <Svg source={gaugeSvg(l, now, j.tz, hm.w)} alt={`${NOMS[l.kind] ?? l.kind} : ${Math.round(l.percentUsed)} %`} width={hm.w} isInteractive />
            ))
          : null}
      </Box>
    )
  })
}
