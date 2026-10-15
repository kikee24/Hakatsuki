import { loadMarket, type MarketConfig } from '../../config/market';
import type { CheckMatrix, MatrixCell } from '../check-matrix';
import { captionOf, CHECK_EXPLANATIONS, groupOf, PHASES, reasonOf, SCENARIO_GOALS, SCENARIO_TITLES, START_SIGNALS } from './explanations';
import { isUnit, type DashboardData, type Evidence, type TestEntry } from './model';

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const slug = (text: string) => text.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const LANGUAGES: Record<string, string> = { es: 'español', en: 'inglés' };
const PASSED = new Set(['passed']);
const FAILED = new Set(['failed', 'timedOut', 'interrupted']);

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes} min ${Math.round((ms % 60_000) / 1000)} s`;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(iso));
}

function marketOf(id: string): MarketConfig | undefined {
  try {
    return loadMarket(id);
  } catch {
    return undefined;
  }
}

function marketLabel(id: string): string {
  const m = marketOf(id);
  return m ? `${m.name} · ${LANGUAGES[m.language] ?? m.language} · ${m.currency}` : id;
}

function moneyFormatter(project: string): (cents: number | null | undefined) => string {
  const m = marketOf(project);
  const format = new Intl.NumberFormat(m?.locale ?? 'es-ES', { style: 'currency', currency: m?.currency ?? 'EUR' });
  return (cents) => (typeof cents === 'number' ? format.format(cents / 100) : '—');
}

/** Parsed JSON attachment, or undefined if missing or not JSON. */
function jsonOf<T>(test: TestEntry, name: RegExp): T | undefined {
  const a = test.attachments.find((x) => name.test(x.name) && x.text !== undefined);
  try {
    return a ? (JSON.parse(a.text!) as T) : undefined;
  } catch {
    return undefined;
  }
}

const scenarioTitle = (title: string) => SCENARIO_TITLES[title] ?? title;
const sectionId = (t: TestEntry) => `t-${slug(t.project)}-${slug(t.title)}`;
const isImage = (e: Evidence) => e.contentType.startsWith('image/') && !!e.href;
const isVideo = (e: Evidence) => e.contentType.startsWith('video/') && !!e.href;
const KEY_FRAME = /^(Spin|Attempt) (\d+)\. (\S+) \((\d+) ms\)$/;
const isKeyFrame = (e: Evidence) => isImage(e) && KEY_FRAME.test(e.name);
const stateOf = (status: string) => (PASSED.has(status) ? 'pass' : FAILED.has(status) ? 'fail' : 'idle');

const ICONS = {
  pass: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fail: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  idle: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 10h8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  play: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5l8 5-8 5z" fill="currentColor"/></svg>',
  clock: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6.5V10l2.5 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  globe: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 10h14M10 3c2.2 2.4 2.2 11.6 0 14M10 3c-2.2 2.4-2.2 11.6 0 14" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
};

function statusBadge(status: string): string {
  if (PASSED.has(status)) return `<span class="badge pass">${ICONS.pass}PASS</span>`;
  if (FAILED.has(status)) return `<span class="badge fail">${ICONS.fail}FAIL</span>`;
  if (status === 'skipped') return `<span class="badge idle">${ICONS.idle}OMITIDO</span>`;
  return `<span class="badge idle">${ICONS.idle}NO EJECUTADO</span>`;
}

function cellBadge(cell: MatrixCell | undefined): string {
  if (cell?.state === 'pass') return `<span class="badge pass">${ICONS.pass}PASS</span>`;
  if (cell?.state === 'fail') return `<span class="badge fail">${ICONS.fail}FAIL</span>`;
  return `<span class="badge idle">${ICONS.idle}NO EJECUTADO</span>`;
}

function shot(e: Evidence, group: string, extra = ''): string {
  return `<a class="shot" href="${esc(e.href!)}" data-group="${esc(group)}" data-caption="${esc(captionOf(e.name))}"${extra}><img src="${esc(e.href!)}" alt="${esc(captionOf(e.name))}" loading="lazy"></a>`;
}

/** Segmented bar: pass / fail / not run. */
function bar(pass: number, fail: number, idle: number): string {
  const total = pass + fail + idle || 1;
  const seg = (n: number, cls: string) => (n ? `<span class="${cls}" style="width:${((100 * n) / total).toFixed(2)}%"></span>` : '');
  return `<span class="bar" role="img" aria-label="${pass} pass, ${fail} fail, ${idle} sin ejecutar">${seg(pass, 'pass')}${seg(fail, 'fail')}${seg(idle, 'idle')}</span>`;
}

/** Ring with the share of passed checks. */
function ring(pass: number, fail: number, total: number): string {
  const c = 2 * Math.PI * 52;
  const p = total ? (pass / total) * c : 0;
  const f = total ? (fail / total) * c : 0;
  return `<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="60" r="52" class="ring-track"/>
  <circle cx="60" cy="60" r="52" class="ring-pass" stroke-dasharray="${p.toFixed(1)} ${c.toFixed(1)}"/>
  <circle cx="60" cy="60" r="52" class="ring-fail" stroke-dasharray="${f.toFixed(1)} ${c.toFixed(1)}" stroke-dashoffset="${(-p).toFixed(1)}"/>
</svg>`;
}

// ---------------------------------------------------------------------------------------------
// Scenario story: the balances the player saw, and the spin as it happened

interface Summary {
  hudBefore?: { credit: number | null; bet: number | null };
  hudAfter?: { credit: number | null; bet: number | null };
  betssonBeforeCents?: number | null;
  betssonAfterCents?: number | null;
  wagerCents?: number | null;
  payoutCents?: number | null;
  inGameAfterCents?: number | null;
  messageKeyword?: string | null;
}

interface Timeline {
  startSignals?: string[];
  payoutCents?: number | null;
  payoutFromCreditCents?: number | null;
  bonus?: boolean;
  timedOut?: boolean;
  keyFrames?: { phase: string; reason: string; atMs: number; hud: { credit: number | null; bet: number | null; win: number | null } | null }[];
}

function term(label: string, value: string, cls = ''): string {
  return `<div class="term ${cls}"><span class="term-label">${esc(label)}</span><span class="term-value">${esc(value)}</span></div>`;
}

function balanceStory(test: TestEntry): string {
  const s = jsonOf<Summary>(test, /^Summary$/);
  if (!s) return '';
  const money = moneyFormatter(test.project);
  const op = (sign: string) => `<span class="op" aria-hidden="true">${sign}</span>`;
  if (s.wagerCents !== undefined) {
    // Scenario 1: before − wager + payout = expected, against what Betsson and the game showed.
    const expected =
      typeof s.betssonBeforeCents === 'number' && typeof s.wagerCents === 'number' && typeof s.payoutCents === 'number'
        ? s.betssonBeforeCents - s.wagerCents + s.payoutCents
        : null;
    const ok = (seen: number | null | undefined) => (expected !== null && seen === expected ? 'ok' : 'ko');
    return `<div class="story">
  <p class="story-title">La regla del reto, con lo que vio el jugador</p>
  <div class="equation">
    ${term('Saldo Betsson antes', money(s.betssonBeforeCents))}${op('−')}${term('Apuesta', money(s.wagerCents))}${op('+')}${term('Premio', money(s.payoutCents))}${op('=')}${term('Esperado', money(expected), 'expected')}
  </div>
  <div class="seen-row">
    ${term('Visto en Betsson', money(s.betssonAfterCents), ok(s.betssonAfterCents))}
    ${term('Visto en el juego', money(s.inGameAfterCents), ok(s.inGameAfterCents))}
  </div>
</div>`;
  }
  // Scenario 2: nothing may change.
  const same = (a: number | null | undefined, b: number | null | undefined) => (typeof a === 'number' && a === b ? 'ok' : 'ko');
  return `<div class="story">
  <p class="story-title">Lo que vio el jugador</p>
  <div class="equation">
    ${term('Saldo Betsson antes', money(s.betssonBeforeCents))}${op('→')}${term('Intento con apuesta', money(s.hudBefore?.bet))}${op('→')}${term('Aviso', s.messageKeyword ? `«${s.messageKeyword}»` : 'no leído', s.messageKeyword ? 'ok' : 'ko')}
  </div>
  <div class="seen-row">
    ${term('Saldo Betsson después', money(s.betssonAfterCents), same(s.betssonBeforeCents, s.betssonAfterCents))}
    ${term('Crédito del juego', `${money(s.hudBefore?.credit)} → ${money(s.hudAfter?.credit)}`, same(s.hudBefore?.credit, s.hudAfter?.credit))}
  </div>
</div>`;
}

function timelineBlock(test: TestEntry, id: string): string {
  const frames = test.attachments.filter(isKeyFrame);
  if (frames.length === 0) return '';
  const timeline = jsonOf<Timeline>(test, /^(Spin|Attempt) — timeline$/);
  const money = moneyFormatter(test.project);
  const parsed = frames.map((f) => {
    const [, kind, n, phase, ms] = KEY_FRAME.exec(f.name)!;
    const key = timeline?.keyFrames?.[Number(n) - 1];
    return { f, kind: kind!, phase: phase!, at: Number(ms), key: key?.phase === phase ? key : undefined };
  });
  const end = Math.max(...parsed.map((p) => p.at), 1);
  const multi = parsed.length > 1;
  const signals = timeline?.startSignals?.length
    ? `<p class="signals"><span class="muted">Señales de inicio vistas:</span> ${timeline.startSignals.map((s) => `<span class="chip">${esc(START_SIGNALS[s] ?? s)}</span>`).join('')}</p>`
    : '';
  const track = multi
    ? `<div class="track" aria-hidden="true"><span class="track-line"></span>${parsed
        .map((p) => `<span class="node ${p.phase}" style="left:${((100 * p.at) / end).toFixed(2)}%"><b>${esc(PHASES[p.phase] ?? p.phase)}</b><i>${formatDuration(p.at)}</i></span>`)
        .join('')}</div>`
    : '';
  const cards = parsed
    .map((p) => {
      const hud = p.key?.hud;
      const facts = hud ? `<span class="facts">Crédito ${money(hud.credit)}${hud.win ? ` · premio ${money(hud.win)}` : ''}</span>` : '';
      return `<figure class="frame">${shot(p.f, `${id}-k`, ` data-at="${p.at}"`)}<figcaption><span class="phase ${p.phase}">${esc(PHASES[p.phase] ?? p.phase)}</span><span class="at">${formatDuration(p.at)}</span>${p.key ? `<span class="reason">${esc(reasonOf(p.key.reason))}</span>` : ''}${facts}</figcaption></figure>`;
    })
    .join('');
  const title = parsed[0]!.kind === 'Spin' ? 'El giro, fotograma a fotograma' : 'El intento de giro';
  return `<div class="block">
  <div class="block-head"><h3>${title}</h3><button type="button" class="play" data-play="${id}-k">${ICONS.play}Reproducir</button></div>
  ${signals}${track}
  <div class="frames${multi ? '' : ' single'}">${cards}</div>
</div>`;
}

function videoBlock(test: TestEntry): string {
  const videos = test.attachments.filter(isVideo);
  const failed = test.attachments.find((a) => a.name === 'video not recorded');
  if (videos.length) {
    const list = videos
      .map((v, i) => `<figure class="video"><video controls preload="metadata" src="${esc(v.href!)}"></video><figcaption>${videos.length > 1 ? `Parte ${i + 1} de ${videos.length}` : 'Grabación de la prueba'}</figcaption></figure>`)
      .join('');
    const note = videos.length > 1 ? '<p class="note">La grabación se pausa mientras está abierto el desplegable de saldo de Betsson, porque su primera fila muestra el nombre del jugador.</p>' : '';
    return `<div class="block"><div class="block-head"><h3>Vídeo</h3></div><div class="videos">${list}</div>${note}</div>`;
  }
  if (isUnit(test) || test.status === 'did not run') return '';
  const frames = test.attachments.some(isKeyFrame);
  return `<p class="note novideo">${ICONS.play}Sin vídeo en esta ejecución${failed?.text ? ` (${esc(failed.text)})` : ''}.${frames ? ' Los fotogramas clave se pueden reproducir con «Reproducir».' : ''}</p>`;
}

/** Thumbnails (and data links) of the attachments that back one check. */
function checkEvidence(checkId: string, test: TestEntry, group: string): string {
  const patterns = CHECK_EXPLANATIONS[checkId]?.evidence ?? [];
  const picked: Evidence[] = [];
  for (const pattern of patterns) {
    for (const a of test.attachments) if (a.href && pattern.test(a.name) && !picked.includes(a)) picked.push(a);
  }
  const images = picked.filter(isImage).slice(0, 4);
  const data = picked.filter((a) => !isImage(a));
  return [
    images.length ? `<div class="thumbs">${images.map((a) => shot(a, group)).join('')}</div>` : '',
    ...data.map((a) => `<a class="chip link" href="${esc(a.href!)}" target="_blank" rel="noopener">${esc(a.name)} · ${a.contentType === 'application/json' ? 'JSON' : 'texto'}</a>`),
  ].join('');
}

function checksBlock(test: TestEntry, matrix: CheckMatrix, id: string): string {
  const rows = matrix.rows.filter((r) => r.scenario === test.title);
  if (rows.length === 0) return '';
  const items = rows
    .map((row) => {
      const cell = row.cells[test.project];
      const state = cell?.state ?? 'not-run';
      const explanation = CHECK_EXPLANATIONS[row.id];
      const seen = cell?.detail ? esc(cell.detail) : state === 'not-run' ? 'La prueba no llegó a este check.' : '—';
      return `<div class="check ${state}">
  <span class="icon ${state === 'not-run' ? 'idle' : state}">${ICONS[state === 'not-run' ? 'idle' : state]}</span>
  <div class="check-what"><div class="check-title"><code>${esc(row.id)}</code> <strong>${esc(explanation?.title ?? row.title)}</strong></div>
    <p class="how">${esc(explanation?.how ?? row.title)}</p></div>
  <div class="check-state">${cellBadge(cell)}</div>
  <div class="check-seen"><span class="label">Qué se vio</span><span class="seen">${seen}</span></div>
  <div class="check-evidence">${checkEvidence(row.id, test, `${id}-c-${row.id}`)}</div>
</div>`;
    })
    .join('');
  const pass = rows.filter((r) => r.cells[test.project]?.state === 'pass').length;
  const fail = rows.filter((r) => r.cells[test.project]?.state === 'fail').length;
  return `<div class="block">
  <div class="block-head"><h3>Checks</h3><span class="block-meta">${pass}/${rows.length} PASS ${bar(pass, fail, rows.length - pass - fail)}</span></div>
  <div class="checks">${items}</div>
</div>`;
}

function galleryBlock(test: TestEntry, id: string): string {
  const images = test.attachments.filter((a) => isImage(a) && !isKeyFrame(a));
  const groups = [...new Set(images.map((a) => groupOf(a.name)))];
  const gallery = groups
    .map(
      (g) =>
        `<h4>${esc(g)}</h4><div class="gallery">${images
          .filter((a) => groupOf(a.name) === g)
          .map((a) => `<figure>${shot(a, `${id}-g`)}<figcaption>${esc(captionOf(a.name))}</figcaption></figure>`)
          .join('')}</div>`,
    )
    .join('');
  const data = test.attachments.filter((a) => !isImage(a) && !isVideo(a) && a.href && a.name !== 'video not recorded');
  const dataBlock = data.length
    ? `<details class="fold"><summary>Datos leídos: texto del OCR y JSON <span class="pill">${data.length}</span></summary><div class="fold-body">${data
        .map((a) => `<details class="datum"><summary>${esc(a.name)}</summary>${a.text !== undefined ? `<pre>${esc(a.text)}</pre>` : ''}<a href="${esc(a.href!)}" target="_blank" rel="noopener">Abrir fichero</a></details>`)
        .join('')}</div></details>`
    : '';
  const omitted = test.attachments.filter((a) => a.omitted);
  const omittedBlock = omitted.length
    ? `<p class="note">${omitted.map((a) => `No incluido: <strong>${esc(a.name)}</strong> — ${esc(a.omitted!)}`).join('<br>')}</p>`
    : '';
  if (!gallery && !dataBlock && !omittedBlock) return '';
  return `<div class="block"><div class="block-head"><h3>Capturas</h3><span class="block-meta">${images.length}</span></div>${gallery}${dataBlock}${omittedBlock}</div>`;
}

function stepsBlock(test: TestEntry): string {
  if (test.steps.length === 0) return '';
  const longest = Math.max(...test.steps.map((s) => s.durationMs), 1);
  const items = test.steps
    .map((s) => {
      const check = /^\[(S\d-\d\d)\] /.exec(s.title);
      const title = check ? `<code>${check[1]}</code> ${esc(CHECK_EXPLANATIONS[check[1]!]?.title ?? s.title.slice(check[0].length))}` : esc(s.title);
      const width = Math.max(1.5, (100 * s.durationMs) / longest).toFixed(1);
      return `<li class="${s.error ? 'ko' : check ? 'is-check' : ''}"><span class="step-title">${title}</span><span class="step-bar"><span style="width:${width}%"></span></span><span class="dur">${formatDuration(s.durationMs)}</span>${s.error ? `<pre>${esc(s.error)}</pre>` : ''}</li>`;
    })
    .join('');
  return `<details class="fold"><summary>Pasos que siguió la prueba <span class="pill">${test.steps.length}</span></summary><ol class="steps">${items}</ol></details>`;
}

const NOTE_LABELS: Record<string, string> = {
  bonus: 'Ronda de bonus',
  'rejected-by': 'Rechazo detectado por',
  dismiss: 'Aviso cerrado',
};

function testSection(test: TestEntry, matrix: CheckMatrix, number: string): string {
  const id = sectionId(test);
  const state = stateOf(test.status);
  const failure = test.attachments.find((a) => isImage(a) && /failure/.test(a.name));
  const notes = test.notes
    .map((n) => `<span class="chip">${esc(NOTE_LABELS[n.type] ?? n.type)}${n.description ? `: ${esc(n.description)}` : ''}</span>`)
    .join('');
  const errors = test.errors.length
    ? `<div class="error"><strong>Error de la prueba</strong><pre>${esc(test.errors.slice(0, 3).join('\n\n'))}</pre>${failure ? shot(failure, `${id}-g`) : ''}</div>`
    : '';
  return `<section class="test ${state}" id="${id}" data-market="${esc(test.project)}">
<header class="test-head">
  <span class="num">${esc(number)}</span>
  <div class="test-name"><h2>${esc(scenarioTitle(test.title))}</h2>
    <p class="meta"><span>${ICONS.globe}${esc(marketLabel(test.project))}</span><span>${ICONS.clock}${formatDuration(test.durationMs)}</span><span class="file">${esc(test.file)}</span></p></div>
  ${statusBadge(test.status)}
</header>
${SCENARIO_GOALS[test.title] ? `<p class="goal">${esc(SCENARIO_GOALS[test.title]!)}</p>` : ''}
${notes ? `<p class="notes">${notes}</p>` : ''}
${errors}
${balanceStory(test)}
${checksBlock(test, matrix, id)}
${timelineBlock(test, id)}
${videoBlock(test)}
${galleryBlock(test, id)}
${stepsBlock(test)}
</section>`;
}

function overview(tests: TestEntry[], matrix: CheckMatrix, numbers: Map<TestEntry, string>): string {
  return `<div class="cards">${tests
    .map((t) => {
      const rows = matrix.rows.filter((r) => r.scenario === t.title);
      const pass = rows.filter((r) => r.cells[t.project]?.state === 'pass').length;
      const dots = rows
        .map((r) => {
          const s = r.cells[t.project]?.state ?? 'not-run';
          return `<span class="dot ${s === 'not-run' ? 'idle' : s}" title="${esc(r.id)}: ${s === 'pass' ? 'PASS' : s === 'fail' ? 'FAIL' : 'no ejecutado'}"></span>`;
        })
        .join('');
      return `<a class="card ${stateOf(t.status)}" href="#${sectionId(t)}" data-market="${esc(t.project)}">
  <span class="card-top"><span class="num small">${esc(numbers.get(t) ?? '')}</span>${statusBadge(t.status)}</span>
  <strong>${esc(scenarioTitle(t.title))}</strong>
  <span class="card-market">${esc(marketLabel(t.project))}</span>
  ${rows.length ? `<span class="dots">${dots}</span><span class="card-foot">${pass}/${rows.length} checks PASS · ${formatDuration(t.durationMs)}</span>` : `<span class="card-foot">Sin checks numerados · ${formatDuration(t.durationMs)}</span>`}
</a>`;
    })
    .join('')}</div>`;
}

function unitSection(tests: TestEntry[], source: string | undefined): string {
  if (tests.length === 0) {
    return '<section class="unit" id="unit"><header class="unit-head"><h2>Tests unitarios</h2></header><p class="note">No hay resultados de tests unitarios en esta ejecución.</p></section>';
  }
  const files = [...new Set(tests.map((t) => t.file))];
  const failed = tests.filter((t) => FAILED.has(t.status)).length;
  const blocks = files
    .map((file) => {
      const inFile = tests.filter((t) => t.file === file);
      const bad = inFile.filter((t) => FAILED.has(t.status)).length;
      const items = inFile
        .map((t) => {
          const s = stateOf(t.status);
          return `<li class="${s}"><span class="icon ${s}">${ICONS[s]}</span><span>${t.describes.length ? `<span class="muted">${esc(t.describes.join(' › '))} › </span>` : ''}${esc(t.title)}</span><span class="dur">${formatDuration(t.durationMs)}</span>${t.errors[0] ? `<pre>${esc(t.errors[0])}</pre>` : ''}</li>`;
        })
        .join('');
      const name = file.replace(/^tests\/unit\//, '').replace(/\.spec\.ts$/, '');
      return `<details class="unit-file${bad ? ' ko' : ''}"${bad ? ' open' : ''}><summary><span class="icon ${bad ? 'fail' : 'pass'}">${bad ? ICONS.fail : ICONS.pass}</span><span class="unit-name">${esc(name)}</span><span class="pill">${inFile.length - bad}/${inFile.length}</span></summary><ul class="unit-list">${items}</ul></details>`;
    })
    .join('');
  return `<section class="unit" id="unit">
<header class="unit-head"><div><h2>Tests unitarios</h2>
<p class="meta-line">Lógica de dinero, OCR y visión sobre capturas reales del juego, sin navegador ni cuenta${source ? ` · ${esc(source)}` : ''}</p></div>
${failed ? statusBadge('failed') : statusBadge('passed')}</header>
<div class="unit-total"><strong>${tests.length - failed}<small>/${tests.length}</small></strong><span>en verde · ${formatDuration(tests.reduce((s, t) => s + t.durationMs, 0))}</span>${bar(tests.length - failed, failed, 0)}</div>
<div class="unit-files">${blocks}</div></section>`;
}

export function renderDashboard(data: DashboardData, matrix: CheckMatrix): string {
  const scenarios = data.tests.filter((t) => !isUnit(t));
  const units = data.tests.filter(isUnit);
  const markets = [...new Set(scenarios.map((t) => t.project))].sort();
  const unitFailed = units.filter((t) => FAILED.has(t.status)).length;
  const verdict = scenarios.length === 0 ? 'none' : matrix.verdict === 'pass' && unitFailed === 0 ? 'pass' : 'fail';
  const verdictText = { pass: 'PASS', fail: 'FAIL', none: 'SIN ESCENARIOS' }[verdict];
  const verdictLine = {
    pass: 'Todos los checks de todos los escenarios han pasado.',
    fail: 'Hay checks o pruebas que no han pasado: el detalle está más abajo.',
    none: 'Esta ejecución no incluye escenarios E2E.',
  }[verdict];
  const greenTests = scenarios.filter((t) => PASSED.has(t.status)).length;
  const { pass, fail } = matrix.totals;
  const notRun = matrix.totals['not-run'];
  const totalChecks = pass + fail + notRun;
  const singleEs = markets.length === 1 && markets[0] === 'betsson-es';

  // "1", "2" for the catalog scenarios (same number in every market), "S" for the smoke test.
  const numbers = new Map<TestEntry, string>(
    scenarios.map((t) => {
      const n = /^Scenario (\d+)/.exec(t.title)?.[1];
      return [t, n ?? 'S'];
    }),
  );
  const navLinks = [
    '<a href="#resumen">Resumen</a>',
    ...[...new Set(scenarios.map((t) => t.title))].map((title) => {
      const first = scenarios.find((t) => t.title === title)!;
      const n = numbers.get(first);
      return `<a href="#${sectionId(first)}">${n && n !== 'S' ? `Escenario ${n}` : 'Smoke'}</a>`;
    }),
    '<a href="#unit">Unitarios</a>',
  ].join('');
  const filter =
    markets.length > 1
      ? `<div class="filter" role="group" aria-label="Mercado"><button type="button" data-market="" aria-pressed="true">Todos</button>${markets
          .map((m) => `<button type="button" data-market="${esc(m)}" aria-pressed="false">${esc(m)}</button>`)
          .join('')}</div>`
      : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Panel de validación</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
<style>${CSS}</style>
</head>
<body>
<nav class="topbar">
  <div class="topbar-in">
    <a class="brand" href="#resumen"><span class="logo" aria-hidden="true">H</span><span>Hakatsuki</span></a>
    <div class="nav-links">${navLinks}</div>
    <span class="mini-verdict ${verdict}">${verdictText}</span>
  </div>
</nav>
<main>
<header class="hero" id="resumen">
  <div class="hero-text">
    <p class="eyebrow">Intelligent Game Validation · Malackathon 2026</p>
    <h1>Panel de resultados</h1>
    <p class="meta"><span>${ICONS.clock}${esc(formatDate(data.startedAt ?? data.generatedAt))}${data.durationMs ? ` · ${formatDuration(data.durationMs)}` : ''}</span>${markets.map((m) => `<span>${ICONS.globe}${esc(marketLabel(m))}</span>`).join('')}</p>
    ${singleEs ? '<p class="banner">Mercado único betsson.es por indicación del organizador (15/10)</p>' : ''}
  </div>
  <div class="verdict ${verdict}">
    <div class="ring-wrap">${ring(pass, fail, totalChecks)}<span class="ring-label"><strong>${pass}</strong><small>/${totalChecks}</small></span></div>
    <div class="verdict-text"><span class="verdict-kicker">Veredicto</span><strong>${verdictText}</strong><span class="verdict-line">${verdictLine}</span></div>
  </div>
</header>

<div class="tiles">
  <div class="tile"><span class="tile-label">Checks</span><strong>${pass}<small>/${totalChecks}</small></strong>${bar(pass, fail, notRun)}<span class="tile-foot">${fail} FAIL · ${notRun} sin ejecutar</span></div>
  <div class="tile"><span class="tile-label">Pruebas E2E</span><strong>${greenTests}<small>/${scenarios.length}</small></strong>${bar(greenTests, scenarios.length - greenTests, 0)}<span class="tile-foot">en verde</span></div>
  <div class="tile"><span class="tile-label">Tests unitarios</span><strong>${units.length - unitFailed}<small>/${units.length}</small></strong>${bar(units.length - unitFailed, unitFailed, 0)}<span class="tile-foot">en verde</span></div>
  <div class="tile"><span class="tile-label">Mercados</span><strong>${markets.length}</strong><span class="tile-foot">${esc(markets.join(', ') || '—')}</span></div>
</div>

${matrix.problems.length ? `<div class="error"><strong>Errores fuera de los escenarios</strong><ul>${matrix.problems.map((p) => `<li>${esc(p.where)}: ${esc(p.error)}</li>`).join('')}</ul></div>` : ''}

${scenarios.length ? `<div class="section-bar"><h2 class="section-title">Escenario × mercado</h2>${filter}</div>${overview(scenarios, matrix, numbers)}` : '<p class="note">Esta ejecución no incluye escenarios E2E.</p>'}

${scenarios.map((t) => testSection(t, matrix, numbers.get(t) ?? '·')).join('\n')}

${unitSection(units, data.unitSource)}

<footer>
  <span>Generado el ${esc(formatDate(data.generatedAt))}</span>
  <span><a href="dashboard.json">dashboard.json</a>${data.reportLink ? ` · <a href="${esc(data.reportLink)}">Informe completo de Playwright</a>` : ''}</span>
  <span>Sin credenciales ni trazas: las trazas graban la sesión real y solo se abren en local.</span>
</footer>
</main>

<dialog id="lightbox" aria-label="Captura ampliada">
  <form method="dialog" class="lb-bar"><span id="lb-count"></span><span id="lb-caption"></span><button value="close" aria-label="Cerrar">✕</button></form>
  <img id="lb-img" alt="">
  <div class="lb-nav"><button type="button" id="lb-prev" aria-label="Anterior">‹</button><button type="button" id="lb-next" aria-label="Siguiente">›</button></div>
</dialog>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

const CSS = `
:root { color-scheme: light dark;
  --bg:#f4f5f7; --bg-grad:#fff4ec; --surface:#ffffff; --surface-2:#f2f3f6; --surface-3:#e9ebf0;
  --text:#14151a; --muted:#5b5f6e; --faint:#8a8e9c; --line:#e3e5ea;
  --pass:#0e8a47; --pass-bg:#e2f5ea; --pass-line:#9fdcb8;
  --fail:#c4291c; --fail-bg:#fdebe9; --fail-line:#f3b2aa;
  --idle:#6b6f7d; --idle-bg:#eceef2;
  --accent:#ff6a13; --accent-2:#ff9a3d; --accent-bg:#fff1e6; --accent-ink:#b44700;
  --shadow:0 1px 2px rgba(16,18,27,.05), 0 6px 24px -12px rgba(16,18,27,.18);
  --radius:16px; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg:#0f1014; --bg-grad:#1d140e; --surface:#17181e; --surface-2:#1f2128; --surface-3:#292b34;
  --text:#eef0f5; --muted:#a3a7b6; --faint:#7d8191; --line:#2a2c35;
  --pass:#4cd38a; --pass-bg:#11291c; --pass-line:#1f5c3a;
  --fail:#ff7d6e; --fail-bg:#33150f; --fail-line:#6e2a20;
  --idle:#a3a7b6; --idle-bg:#24262e;
  --accent:#ff7a2a; --accent-2:#ffab5c; --accent-bg:#2c1a0d; --accent-ink:#ffb27a;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px -14px rgba(0,0,0,.7); } }
:root[data-theme="dark"] {
  --bg:#0f1014; --bg-grad:#1d140e; --surface:#17181e; --surface-2:#1f2128; --surface-3:#292b34;
  --text:#eef0f5; --muted:#a3a7b6; --faint:#7d8191; --line:#2a2c35;
  --pass:#4cd38a; --pass-bg:#11291c; --pass-line:#1f5c3a;
  --fail:#ff7d6e; --fail-bg:#33150f; --fail-line:#6e2a20;
  --idle:#a3a7b6; --idle-bg:#24262e;
  --accent:#ff7a2a; --accent-2:#ffab5c; --accent-bg:#2c1a0d; --accent-ink:#ffb27a;
  --shadow:0 1px 2px rgba(0,0,0,.4), 0 10px 30px -14px rgba(0,0,0,.7); }
* { box-sizing:border-box; }
html { scroll-behavior:smooth; scroll-padding-top:72px; }
body { margin:0; color:var(--text); font:15px/1.55 Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  background:radial-gradient(1200px 420px at 85% -120px, var(--bg-grad), transparent 70%), var(--bg); background-attachment:fixed; }
a { color:inherit; }
svg { width:1em; height:1em; flex:none; }
h1 { font-size:clamp(28px, 4vw, 40px); line-height:1.1; letter-spacing:-.02em; margin:6px 0 12px; font-weight:800; }
h2 { font-size:20px; line-height:1.25; letter-spacing:-.01em; margin:0; font-weight:700; }
h3 { font-size:15px; margin:0; font-weight:700; }
h4 { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--faint); margin:18px 0 8px; font-weight:600; }
code, pre, .seen { font-family:"JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace; }
code { font-size:11.5px; font-weight:500; color:var(--accent-ink); background:var(--accent-bg); padding:2px 7px; border-radius:6px; white-space:nowrap; }
pre { white-space:pre-wrap; overflow-wrap:anywhere; font-size:12px; line-height:1.5; background:var(--surface-2); border:1px solid var(--line); padding:12px; border-radius:10px; margin:8px 0; max-height:320px; overflow:auto; }
.muted { color:var(--muted); }
[hidden] { display:none !important; }

/* Top bar */
.topbar { position:sticky; top:0; z-index:10; backdrop-filter:saturate(1.4) blur(12px); -webkit-backdrop-filter:saturate(1.4) blur(12px);
  background:color-mix(in srgb, var(--bg) 78%, transparent); border-bottom:1px solid var(--line); }
.topbar-in { max-width:1200px; margin:0 auto; padding:10px 16px; display:flex; align-items:center; gap:16px; }
.brand { display:flex; align-items:center; gap:10px; font-weight:800; text-decoration:none; letter-spacing:-.01em; }
.logo { width:28px; height:28px; border-radius:8px; display:grid; place-items:center; color:#fff; font-size:15px; font-weight:800;
  background:linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow:0 4px 14px -4px var(--accent); }
.nav-links { display:flex; gap:2px; overflow-x:auto; scrollbar-width:none; flex:1; }
.nav-links a { text-decoration:none; color:var(--muted); font-size:13.5px; font-weight:500; padding:6px 10px; border-radius:8px; white-space:nowrap; }
.nav-links a:hover { color:var(--text); background:var(--surface-2); }
.mini-verdict { font-size:12px; font-weight:800; letter-spacing:.06em; padding:4px 10px; border-radius:999px; white-space:nowrap; }
.mini-verdict.pass { color:var(--pass); background:var(--pass-bg); } .mini-verdict.fail { color:var(--fail); background:var(--fail-bg); }
.mini-verdict.none { color:var(--idle); background:var(--idle-bg); }

main { max-width:1200px; margin:0 auto; padding:36px 16px 56px; }

/* Hero */
.hero { display:flex; gap:28px; justify-content:space-between; align-items:center; flex-wrap:wrap; }
.hero-text { flex:1 1 420px; min-width:0; }
.eyebrow { margin:0; font-size:12px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--accent); }
.meta { display:flex; flex-wrap:wrap; gap:6px 16px; margin:0; color:var(--muted); font-size:14px; }
.meta span { display:inline-flex; align-items:center; gap:6px; }
.banner { display:inline-flex; margin:16px 0 0; padding:8px 14px; border-radius:10px; font-size:14px; font-weight:500;
  background:var(--accent-bg); border:1px solid color-mix(in srgb, var(--accent) 45%, transparent); color:var(--text); }
.verdict { display:flex; align-items:center; gap:20px; padding:20px 24px; border-radius:20px; background:var(--surface); border:1px solid var(--line); box-shadow:var(--shadow); flex:0 1 420px; }
.verdict.pass { border-color:var(--pass-line); background:linear-gradient(135deg, var(--pass-bg), var(--surface) 70%); }
.verdict.fail { border-color:var(--fail-line); background:linear-gradient(135deg, var(--fail-bg), var(--surface) 70%); }
.ring-wrap { position:relative; width:104px; height:104px; flex:none; }
.ring { width:104px; height:104px; transform:rotate(-90deg); }
.ring circle { fill:none; stroke-width:11; }
.ring-track { stroke:var(--surface-3); } .ring-pass { stroke:var(--pass); stroke-linecap:round; } .ring-fail { stroke:var(--fail); }
.ring-label { position:absolute; inset:0; display:grid; place-content:center; text-align:center; font-variant-numeric:tabular-nums; }
.ring-label strong { font-size:28px; line-height:1; } .ring-label small { color:var(--muted); font-size:12px; }
.verdict-text { display:flex; flex-direction:column; min-width:0; }
.verdict-kicker { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:var(--muted); }
.verdict-text strong { font-size:38px; line-height:1.05; letter-spacing:-.02em; font-weight:800; }
.verdict.pass .verdict-text strong { color:var(--pass); } .verdict.fail .verdict-text strong { color:var(--fail); }
.verdict-line { color:var(--muted); font-size:13px; margin-top:4px; }

/* Tiles and bars */
.tiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:14px; margin:28px 0 8px; }
.tile { background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); padding:16px 18px; display:flex; flex-direction:column; gap:6px; box-shadow:var(--shadow); }
.tile-label { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
.tile strong { font-size:30px; line-height:1.1; font-variant-numeric:tabular-nums; letter-spacing:-.02em; }
.tile strong small { font-size:16px; color:var(--faint); font-weight:600; }
.tile-foot { color:var(--muted); font-size:13px; }
.bar { display:flex; height:6px; border-radius:999px; overflow:hidden; background:var(--surface-3); gap:2px; min-width:60px; }
.bar span { display:block; height:100%; } .bar .pass { background:var(--pass); } .bar .fail { background:var(--fail); } .bar .idle { background:var(--faint); opacity:.5; }

/* Badges, chips, icons */
.badge { display:inline-flex; align-items:center; gap:4px; padding:3px 10px 3px 8px; border-radius:999px; font-size:12px; font-weight:800; letter-spacing:.05em; white-space:nowrap; }
.badge.pass { color:var(--pass); background:var(--pass-bg); } .badge.fail { color:var(--fail); background:var(--fail-bg); } .badge.idle { color:var(--idle); background:var(--idle-bg); }
.icon { width:26px; height:26px; border-radius:50%; display:grid; place-items:center; flex:none; font-size:15px; }
.icon.pass { color:var(--pass); background:var(--pass-bg); } .icon.fail { color:var(--fail); background:var(--fail-bg); } .icon.idle { color:var(--idle); background:var(--idle-bg); }
.chip { display:inline-flex; align-items:center; font-size:12px; padding:3px 10px; border-radius:999px; background:var(--surface-2); border:1px solid var(--line); text-decoration:none; margin:2px 6px 2px 0; }
.chip.link:hover { border-color:var(--accent); }
.pill { font-size:12px; font-weight:600; color:var(--muted); background:var(--surface-2); border:1px solid var(--line); border-radius:999px; padding:1px 8px; }
.note { color:var(--muted); font-size:13px; margin:10px 0; }
.novideo { display:flex; gap:8px; align-items:center; padding:10px 14px; border:1px dashed var(--line); border-radius:12px; }
.error { margin:16px 0; padding:14px 16px; border-radius:12px; background:var(--fail-bg); border:1px solid var(--fail-line); }
.error .shot { display:inline-block; max-width:420px; }

/* Overview cards */
.section-bar { display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap; margin:40px 0 14px; }
.section-title { margin:0; }
.filter { display:flex; gap:4px; background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:4px; }
.filter button { border:0; background:none; color:var(--text); font:inherit; font-size:13px; padding:6px 12px; border-radius:7px; cursor:pointer; }
.filter button[aria-pressed="true"] { background:var(--surface-3); font-weight:600; }
.cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:14px; margin-bottom:36px; }
.card { position:relative; display:flex; flex-direction:column; gap:8px; padding:18px; border-radius:var(--radius); background:var(--surface); border:1px solid var(--line);
  text-decoration:none; box-shadow:var(--shadow); overflow:hidden; transition:transform .15s ease, border-color .15s ease; }
.card::before { content:""; position:absolute; inset:0 auto 0 0; width:4px; background:var(--idle); }
.card.pass::before { background:var(--pass); } .card.fail::before { background:var(--fail); }
.card:hover { transform:translateY(-2px); border-color:var(--accent); }
.card strong { font-size:16px; line-height:1.3; }
.card-top { display:flex; justify-content:space-between; align-items:center; }
.card-market, .card-foot { color:var(--muted); font-size:13px; }
.dots { display:flex; flex-wrap:wrap; gap:5px; margin-top:4px; }
.dot { width:12px; height:12px; border-radius:4px; background:var(--idle-bg); }
.dot.pass { background:var(--pass); } .dot.fail { background:var(--fail); } .dot.idle { background:var(--surface-3); }

/* Scenario sections */
.test, .unit { background:var(--surface); border:1px solid var(--line); border-radius:22px; padding:26px; margin:0 0 24px; box-shadow:var(--shadow); }
.test { border-top:4px solid var(--idle); } .test.pass { border-top-color:var(--pass); } .test.fail { border-top-color:var(--fail); }
.test-head { display:flex; gap:16px; align-items:flex-start; }
.test-name { flex:1; min-width:0; }
.test-head .meta { margin-top:6px; font-size:13px; }
.test-head .file { font-family:"JetBrains Mono", ui-monospace, monospace; font-size:12px; color:var(--faint); }
.test-head > .badge { font-size:13px; padding:5px 12px 5px 10px; }
.num { width:44px; height:44px; border-radius:12px; display:grid; place-items:center; flex:none; font-size:20px; font-weight:800; color:#fff;
  background:linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow:0 6px 16px -8px var(--accent); }
.num.small { width:30px; height:30px; border-radius:9px; font-size:14px; }
.goal { margin:16px 0 0; color:var(--muted); max-width:85ch; }
.notes { margin:10px 0 0; display:flex; gap:6px; flex-wrap:wrap; }
.block { margin-top:26px; }
.block-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; }
.block-meta { display:inline-flex; align-items:center; gap:10px; font-size:13px; font-weight:600; color:var(--muted); }
.block-meta .bar { width:90px; }

/* Balance story */
.story { margin-top:22px; padding:18px; border-radius:16px; background:linear-gradient(135deg, var(--accent-bg), var(--surface-2)); border:1px solid var(--line); }
.story-title { margin:0 0 12px; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--accent-ink); }
.equation, .seen-row { display:flex; align-items:stretch; gap:8px; flex-wrap:wrap; }
.seen-row { margin-top:10px; }
.term { display:flex; flex-direction:column; gap:2px; padding:10px 14px; background:var(--surface); border:1px solid var(--line); border-radius:12px; min-width:120px; flex:1 1 120px; }
.term-label { font-size:11.5px; color:var(--muted); font-weight:500; }
.term-value { font-size:20px; font-weight:700; font-variant-numeric:tabular-nums; letter-spacing:-.01em; overflow-wrap:anywhere; }
.term.expected { border-color:color-mix(in srgb, var(--accent) 55%, transparent); }
.term.ok { border-color:var(--pass-line); background:var(--pass-bg); } .term.ok .term-value { color:var(--pass); }
.term.ko { border-color:var(--fail-line); background:var(--fail-bg); } .term.ko .term-value { color:var(--fail); }
.op { align-self:center; font-size:22px; font-weight:700; color:var(--faint); padding:0 2px; }

/* Checks */
.checks { border:1px solid var(--line); border-radius:16px; overflow:hidden; }
.check { display:grid; grid-template-columns:26px minmax(0, 2.2fr) 112px minmax(0, 2fr) minmax(0, 1.4fr); gap:14px; padding:14px 16px; border-bottom:1px solid var(--line); align-items:start; }
.check:last-child { border-bottom:0; }
.check:nth-child(even) { background:color-mix(in srgb, var(--surface-2) 45%, transparent); }
.check.fail { background:var(--fail-bg); }
.check-title strong { font-weight:600; }
.check .how { margin:4px 0 0; color:var(--muted); font-size:13px; line-height:1.5; }
.check-seen { font-size:12.5px; overflow-wrap:anywhere; }
.check .label { display:block; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:var(--faint); margin-bottom:3px; }
.seen { font-size:12px; line-height:1.55; }
.thumbs { display:flex; gap:6px; flex-wrap:wrap; }
.thumbs .shot { width:78px; height:52px; }

/* Images */
.shot { display:block; border-radius:8px; overflow:hidden; border:1px solid var(--line); background:var(--surface-2); transition:transform .15s ease, border-color .15s ease; cursor:zoom-in; }
.shot:hover { transform:scale(1.03); border-color:var(--accent); }
.shot img { display:block; width:100%; height:100%; object-fit:contain; }
/* Long, thin crops (the Betsson balance row) at their own size, not shrunk into a 16:10 box. */
.shot.wide, .thumbs .shot.wide, .gallery .shot.wide, .frames .shot.wide { width:fit-content; max-width:100%; height:auto; aspect-ratio:auto; padding:8px; flex-basis:100%; background:#fff; }
.shot.wide img { width:auto; max-width:100%; height:auto; }
figure { margin:0; }
figcaption { font-size:12px; color:var(--muted); margin-top:6px; overflow-wrap:anywhere; }

/* Spin timeline */
.play { display:inline-flex; align-items:center; gap:6px; font:inherit; font-size:13px; font-weight:700; border:0; color:#fff; border-radius:10px; padding:8px 14px; cursor:pointer;
  background:linear-gradient(135deg, var(--accent), var(--accent-2)); box-shadow:0 6px 16px -8px var(--accent); }
.play:hover { filter:brightness(1.06); }
.signals { margin:0 0 14px; font-size:13px; display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.track { position:relative; height:58px; margin:4px 40px 12px; }
.track-line { position:absolute; left:0; right:0; top:10px; height:4px; border-radius:4px; background:linear-gradient(90deg, var(--faint), var(--accent), var(--pass)); opacity:.6; }
.node { position:absolute; top:3px; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; text-align:center; white-space:nowrap; }
.node::before { content:""; width:18px; height:18px; border-radius:50%; background:var(--surface); border:4px solid var(--faint); box-sizing:border-box; }
.node.spinning::before { border-color:var(--accent); } .node.stopped::before { border-color:var(--accent-2); } .node.settled::before { border-color:var(--pass); }
.node b { font-size:12px; margin-top:4px; } .node i { font-style:normal; font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums; }
.frames { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:14px; }
.frames.single { grid-template-columns:minmax(200px, 340px); }
.frame .shot { aspect-ratio:16/9; }
.frame figcaption { display:flex; flex-wrap:wrap; gap:4px 8px; align-items:baseline; }
.phase { font-weight:700; color:var(--text); display:inline-block; }
.phase::first-letter { text-transform:uppercase; }
.phase.spinning { color:var(--accent-ink); } .phase.settled { color:var(--pass); }
.at { font-variant-numeric:tabular-nums; }
.reason, .facts { flex-basis:100%; }
.facts { color:var(--text); font-weight:500; }

/* Video, gallery, folds */
.videos { display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:14px; }
video { width:100%; border-radius:14px; background:#000; display:block; box-shadow:var(--shadow); }
.gallery { display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:14px; }
.gallery .shot { aspect-ratio:16/10; }
.fold { margin-top:20px; border:1px solid var(--line); border-radius:14px; background:var(--surface); }
.fold > summary { cursor:pointer; font-weight:600; padding:12px 16px; display:flex; align-items:center; gap:8px; list-style:none; }
.fold > summary::-webkit-details-marker { display:none; }
.fold > summary::before { content:"›"; font-size:18px; line-height:1; color:var(--faint); transition:transform .15s ease; }
.fold[open] > summary::before { transform:rotate(90deg); }
.fold-body { padding:0 16px 12px; }
.datum { margin:6px 0; } .datum > summary { cursor:pointer; font-size:13px; font-weight:500; }
.datum a { font-size:12px; color:var(--accent-ink); }
.steps { margin:0; padding:0 16px 14px 40px; }
.steps li { display:grid; grid-template-columns:minmax(0, 1fr) minmax(60px, 160px) 64px; gap:12px; align-items:center; padding:6px 0; border-bottom:1px solid var(--line); font-size:13.5px; }
.steps li:last-child { border-bottom:0; }
.steps li > pre { grid-column:1 / -1; }
.steps li.is-check { color:var(--muted); }
.steps li.ko .step-title { color:var(--fail); font-weight:600; }
.step-bar { height:6px; background:var(--surface-3); border-radius:6px; overflow:hidden; }
.step-bar span { display:block; height:100%; background:var(--accent); border-radius:6px; opacity:.75; }
.steps li.is-check .step-bar span { background:var(--pass); }
.dur { color:var(--muted); font-size:12px; font-variant-numeric:tabular-nums; white-space:nowrap; text-align:right; }

/* Unit tests */
.unit-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.meta-line { margin:6px 0 0; color:var(--muted); font-size:13px; }
.unit-total { display:flex; align-items:center; gap:12px; margin:16px 0; flex-wrap:wrap; }
.unit-total strong { font-size:28px; font-variant-numeric:tabular-nums; } .unit-total strong small { font-size:15px; color:var(--faint); }
.unit-total > span { color:var(--muted); font-size:13px; }
.unit-total .bar { flex:1 1 200px; }
.unit-files { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:10px; align-items:start; }
.unit-file { border:1px solid var(--line); border-radius:12px; background:var(--surface); }
.unit-file.ko { border-color:var(--fail-line); }
.unit-file > summary { cursor:pointer; display:flex; align-items:center; gap:10px; padding:10px 12px; list-style:none; }
.unit-file > summary::-webkit-details-marker { display:none; }
.unit-file .icon { width:22px; height:22px; font-size:13px; }
.unit-name { flex:1; font-weight:600; font-family:"JetBrains Mono", ui-monospace, monospace; font-size:13px; }
.unit-list { list-style:none; margin:0; padding:0 12px 10px; }
.unit-list li { display:grid; grid-template-columns:22px minmax(0, 1fr) auto; gap:8px; align-items:start; padding:6px 0; border-top:1px solid var(--line); font-size:13px; }
.unit-list .icon { width:20px; height:20px; font-size:12px; }
.unit-list li > pre { grid-column:2 / -1; }

footer { margin-top:36px; color:var(--muted); font-size:13px; display:flex; flex-wrap:wrap; gap:6px 20px; }

/* Lightbox */
dialog { border:0; padding:0; background:#0b0b0e; color:#fff; width:min(96vw, 1280px); max-height:94vh; border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,.5); }
dialog::backdrop { background:rgba(8,8,12,.78); backdrop-filter:blur(4px); }
.lb-bar { display:flex; gap:12px; align-items:center; padding:12px 16px; font-size:14px; margin:0; }
.lb-bar #lb-caption { flex:1; } .lb-bar #lb-count { color:#aaa; font-variant-numeric:tabular-nums; }
.lb-bar button, .lb-nav button { font:inherit; color:#fff; background:rgba(255,255,255,.12); border:0; border-radius:10px; padding:6px 12px; cursor:pointer; }
.lb-bar button:hover, .lb-nav button:hover { background:rgba(255,255,255,.22); }
#lb-img { display:block; max-width:100%; max-height:76vh; margin:0 auto; object-fit:contain; }
.lb-nav { display:flex; justify-content:space-between; padding:12px 16px; }
.lb-nav button { font-size:22px; line-height:1; padding:6px 18px; }

@media (max-width: 820px) {
  .check { grid-template-columns:26px minmax(0, 1fr) auto; }
  .check-state { grid-column:3; grid-row:1; }
  .check-seen, .check-evidence { grid-column:2 / -1; }
  .test, .unit { padding:18px; border-radius:18px; }
  .test-head { flex-wrap:wrap; } .test-head > .badge { order:-1; margin-left:auto; }
  .test-name { flex-basis:100%; }
  .verdict { flex-basis:100%; }
  .track { margin:4px 28px 12px; }
  .steps { padding-left:28px; } .steps li { grid-template-columns:minmax(0, 1fr) 56px; } .step-bar { display:none; }
  .unit-files { grid-template-columns:1fr; }
}
@media (max-width: 520px) {
  .mini-verdict { display:none; }
  .term-value { font-size:17px; }
  .op { flex-basis:100%; text-align:center; margin:-4px 0; font-size:18px; }
  .track b { font-size:11px; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior:auto; } .card, .shot { transition:none; } }
`;

// Lightbox with previous/next per group, playback of the key frames at their real pace, market filter.
const SCRIPT = String.raw`
(function () {
  var dlg = document.getElementById('lightbox');
  var img = document.getElementById('lb-img');
  var cap = document.getElementById('lb-caption');
  var count = document.getElementById('lb-count');
  var list = [], idx = 0, timer = null;

  function itemsOf(group) {
    var seen = {}, out = [];
    document.querySelectorAll('a.shot[data-group="' + group + '"]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (seen[href]) return;
      seen[href] = true;
      out.push({ href: href, caption: a.dataset.caption || '', at: Number(a.dataset.at || 0) });
    });
    return out;
  }
  function show() {
    var item = list[idx];
    img.src = item.href; img.alt = item.caption;
    cap.textContent = item.caption;
    count.textContent = (idx + 1) + ' / ' + list.length;
  }
  function stop() { if (timer) { clearTimeout(timer); timer = null; } }
  function step(delta) { stop(); idx = (idx + delta + list.length) % list.length; show(); }
  function play() {
    if (idx >= list.length - 1) return;
    var wait = Math.min(2500, Math.max(700, list[idx + 1].at - list[idx].at));
    timer = setTimeout(function () { idx++; show(); play(); }, wait);
  }
  function open(group, href, autoplay) {
    list = itemsOf(group);
    idx = Math.max(0, list.findIndex(function (i) { return i.href === href; }));
    show();
    if (!dlg.open) dlg.showModal();
    stop();
    if (autoplay) play();
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a.shot');
    if (a) { e.preventDefault(); open(a.dataset.group, a.getAttribute('href'), false); return; }
    var p = e.target.closest('button[data-play]');
    if (p) { var items = itemsOf(p.dataset.play); if (items.length) open(p.dataset.play, items[0].href, true); return; }
    var f = e.target.closest('.filter button');
    if (f) {
      var market = f.dataset.market;
      document.querySelectorAll('.filter button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === f)); });
      document.querySelectorAll('section.test, a.card').forEach(function (s) { s.hidden = !!market && s.dataset.market !== market; });
    }
  });
  function markWide(img) {
    if (img.naturalHeight && img.naturalWidth / img.naturalHeight > 5) img.closest('.shot').classList.add('wide');
  }
  document.querySelectorAll('a.shot img').forEach(function (img) {
    if (img.complete) markWide(img); else img.addEventListener('load', function () { markWide(img); });
  });
  document.getElementById('lb-prev').addEventListener('click', function () { step(-1); });
  document.getElementById('lb-next').addEventListener('click', function () { step(1); });
  dlg.addEventListener('close', stop);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  document.addEventListener('keydown', function (e) {
    if (!dlg.open) return;
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
})();
`;
