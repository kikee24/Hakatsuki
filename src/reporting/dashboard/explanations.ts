/**
 * Spanish wording for the dashboard. Test and check titles stay in English (the specs, the matrix
 * and the Playwright report use them); the dashboard translates them by id here.
 */

export interface CheckExplanation {
  /** What is checked, in a few words. */
  title: string;
  /** How the checker verifies it from the screen, in one or two sentences. */
  how: string;
  /** Attachment names that show the evidence for this check, in the order they are shown. */
  evidence: RegExp[];
}

const BALANCE_BEFORE = /^Betsson balance before$/;
const BALANCE_AFTER = /^Betsson balance after$/;
const PLAY_MODE = /^Play mode$/;
const HUD_FRAME_BEFORE = /^HUD before (spin|attempt) — game frame$/;
const CREDIT_OCR_BEFORE = /^HUD before (spin|attempt) — credit & bet — OCR input$/;
const CREDIT_OCR_AFTER = /^HUD after (spin|attempt) — credit & bet — OCR input$/;
const SPIN_SPINNING = /^Spin \d+\. spinning \(\d+ ms\)( — reel motion .*)?$/;
const SPIN_STOPPED = /^Spin \d+\. (stopped|settled) \(\d+ ms\)$/;
const SPIN_SETTLED = /^Spin \d+\. settled \(\d+ ms\)$/;
const ATTEMPT = /^Attempt \d+\. .*$/;
const MESSAGE = /^Message( frame| — OCR input)$/;

const BETSSON_CURRENCY: CheckExplanation = {
  title: 'El saldo de Betsson está en la moneda del mercado',
  how: 'Se abre el desplegable «Saldo» de la cabecera y se lee «Disponible para retirar»: su moneda debe ser la del mercado.',
  evidence: [BALANCE_BEFORE],
};

const GAME_CURRENCY: CheckExplanation = {
  title: 'Crédito y apuesta del juego en la moneda del mercado',
  how: 'OCR sobre el HUD pintado por el juego (CRÉDITO y APUESTA): los dos importes deben llevar la moneda del mercado.',
  evidence: [CREDIT_OCR_BEFORE, HUD_FRAME_BEFORE],
};

export const CHECK_EXPLANATIONS: Record<string, CheckExplanation> = {
  'S1-01': BETSSON_CURRENCY,
  'S1-02': {
    title: 'El juego está en Real Play',
    how: 'No se ve el aviso de modo Práctica y el lanzador del juego está en dinero real (forReal).',
    evidence: [PLAY_MODE, HUD_FRAME_BEFORE],
  },
  'S1-03': {
    title: 'El proveedor del juego es Pragmatic Play',
    how: 'El lanzador del juego de Betsson indica el proveedor PragmaticPlay.',
    evidence: [PLAY_MODE],
  },
  'S1-04': GAME_CURRENCY,
  'S1-05': {
    title: 'El crédito del juego coincide con el saldo de Betsson antes del giro',
    how: 'El CRÉDITO leído por OCR dentro del juego es el mismo dinero que muestra Betsson.',
    evidence: [BALANCE_BEFORE, CREDIT_OCR_BEFORE],
  },
  'S1-06': {
    title: 'El giro empezó de forma visible',
    how: 'Un clic no basta: hacen falta dos señales independientes en pantalla entre «¡BUENA SUERTE!», el crédito bajando exactamente la apuesta y los rodillos moviéndose.',
    evidence: [SPIN_SPINNING],
  },
  'S1-07': {
    title: 'La apuesta mostrada es la que se cobró',
    how: 'Al empezar el giro, el crédito baja exactamente la APUESTA que se leía antes de girar.',
    evidence: [CREDIT_OCR_BEFORE, SPIN_SPINNING],
  },
  'S1-08': {
    title: 'El giro terminó y su resultado se asentó',
    how: 'Los rodillos se paran (o aparece la ganancia) y el crédito queda igual en dos lecturas seguidas.',
    evidence: [SPIN_STOPPED],
  },
  'S1-09': {
    title: 'Crédito del juego: después = antes − apuesta + premio',
    how: 'Regla del reto sobre el crédito leído por OCR. El premio es la GANANCIA que se ve en pantalla, contrastada con la subida del crédito.',
    evidence: [CREDIT_OCR_BEFORE, SPIN_SETTLED],
  },
  'S1-10': {
    title: 'Saldo de Betsson: después = antes − apuesta + premio',
    how: 'Regla del reto sobre el saldo de Betsson leído antes y después del giro, con la apuesta y el premio vistos en el juego.',
    evidence: [BALANCE_BEFORE, BALANCE_AFTER],
  },
  'S1-11': {
    title: 'El saldo final de Betsson coincide con el crédito del juego',
    how: 'Al terminar, Betsson y el juego muestran el mismo dinero.',
    evidence: [BALANCE_AFTER, SPIN_SETTLED],
  },
  'S2-01': BETSSON_CURRENCY,
  'S2-02': {
    title: 'Real Play con el proveedor Pragmatic Play',
    how: 'Sin aviso de modo Práctica, lanzador en dinero real (forReal) y proveedor PragmaticPlay.',
    evidence: [PLAY_MODE, HUD_FRAME_BEFORE],
  },
  'S2-03': GAME_CURRENCY,
  'S2-04': {
    title: 'El giro se rechaza',
    how: 'Tras pulsar girar no se descuenta la apuesta ni aparece «¡BUENA SUERTE!» o un giro en curso.',
    evidence: [ATTEMPT],
  },
  'S2-05': {
    title: 'El jugador ve un aviso de saldo insuficiente',
    how: 'OCR del aviso que pinta el juego, comparado con las frases del mercado (p. ej. «Fondos insuficientes») con tolerancia a errores de lectura.',
    evidence: [MESSAGE],
  },
  'S2-06': {
    title: 'El aviso está en el idioma del mercado',
    how: 'Las palabras del aviso son las del idioma esperado y no las de otro idioma.',
    evidence: [MESSAGE],
  },
  'S2-07': {
    title: 'El crédito del juego no cambia',
    how: 'CRÉDITO leído por OCR antes y después del intento.',
    evidence: [CREDIT_OCR_BEFORE, CREDIT_OCR_AFTER],
  },
  'S2-08': {
    title: 'El saldo de Betsson no cambia',
    how: '«Disponible para retirar» leído antes y después del intento.',
    evidence: [BALANCE_BEFORE, BALANCE_AFTER],
  },
};

export const SCENARIO_TITLES: Record<string, string> = {
  'Scenario 1 — completed Real Play spin': 'Escenario 1 — Giro completado en Real Play',
  'Scenario 2 — insufficient balance': 'Escenario 2 — Saldo insuficiente',
  'casino lobby is reachable': 'Prueba rápida — el lobby del casino carga',
};

export const SCENARIO_GOALS: Record<string, string> = {
  'Scenario 1 — completed Real Play spin':
    'Con la cuenta con saldo: abrir un juego de Pragmatic Play en Real Play, girar una vez y comprobar en pantalla que el giro empezó, terminó y que los saldos cuadran (después = antes − apuesta + premio).',
  'Scenario 2 — insufficient balance':
    'Con la cuenta sin saldo: intentar girar y comprobar que el giro se rechaza, que aparece el aviso de saldo insuficiente en el idioma del mercado y que ningún saldo cambia.',
  'casino lobby is reachable': 'Sin cuenta: el lobby del casino del mercado abre y responde.',
};

/** On-screen signals that the spin started (spin timeline `startSignals`). */
export const START_SIGNALS: Record<string, string> = {
  'status-text': '«¡BUENA SUERTE!» en pantalla',
  'wager-deducted': 'el crédito baja la apuesta',
  'reel-motion': 'rodillos en movimiento',
};

/** Why the spin watcher moved to a phase (timeline `reason`), in Spanish; unknown wording is kept. */
export function reasonOf(reason: string): string {
  return reason
    .replace(/^before spin$/, 'antes de pulsar girar')
    .replace(/^game reacted: (.+)$/, (_, s: string) => `el juego reaccionó: ${s.split(', ').map((x) => START_SIGNALS[x] ?? x).join(', ')}`)
    .replace(/^status line shows a win$/, 'la línea de estado muestra un premio')
    .replace(/^credit stable at (\d+) cents for (\d+) reads$/, (_, c: string, n: string) => `crédito estable (${c} cént.) en ${n} lecturas`)
    .replace(/^reels still for (\d+) frames$/, (_, n: string) => `rodillos quietos durante ${n} fotogramas`);
}

export const PHASES: Record<string, string> = {
  armed: 'preparado',
  spinning: 'girando',
  stopped: 'parado',
  settled: 'resultado asentado',
};

/** "Spin 2. spinning (1383 ms)" → "Giro · girando · 1,4 s". Other names are returned unchanged. */
export function captionOf(name: string): string {
  const frame = /^(Spin|Attempt) (\d+)\. (\S+) \((\d+) ms\)(?: — reel motion (.+))?$/.exec(name);
  if (frame) {
    const [, kind, , phase, ms, motion] = frame;
    const label = `${kind === 'Spin' ? 'Giro' : 'Intento'} · ${PHASES[phase!] ?? phase} · ${(Number(ms) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} s`;
    return motion ? `${label} · movimiento de rodillos ${motion}` : label;
  }
  return name
    .replace(/^Betsson balance before$/, 'Saldo de Betsson antes')
    .replace(/^Betsson balance after$/, 'Saldo de Betsson después')
    .replace(/^HUD before (spin|attempt)/, 'HUD antes')
    .replace(/^HUD after (spin|attempt)/, 'HUD después')
    .replace(/ — game frame$/, ' — juego completo')
    .replace(/ — credit & bet — OCR input$/, ' — recorte CRÉDITO/APUESTA (entrada OCR)')
    .replace(/ — status line — OCR input$/, ' — recorte línea de estado (entrada OCR)')
    .replace(/^Message frame$/, 'Aviso en pantalla')
    .replace(/^Message — OCR input$/, 'Aviso — recorte (entrada OCR)')
    .replace(/^screenshot on failure$/, 'Pantalla en el momento del fallo');
}

/** Gallery section of an attachment, by name. */
export function groupOf(name: string): string {
  if (/^Betsson balance/.test(name)) return 'Saldo de Betsson';
  if (/^HUD /.test(name)) return 'HUD del juego y recortes de OCR';
  if (/^Spin /.test(name)) return 'Giro: fotogramas clave';
  if (/^Attempt /.test(name)) return 'Intento de giro';
  if (/^Message/.test(name)) return 'Aviso en pantalla';
  if (/failure/.test(name)) return 'Fallo';
  return 'Otras capturas';
}
