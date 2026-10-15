# Panel de control de resultados — guía para construirlo

Objetivo: al terminar una ejecución, lanzar **un comando** (`npm run panel`) que abra un panel con
apartados de **capturas**, **vídeo** y **tests unitarios**, y que para **cada test** diga **qué hace**,
**qué ha salido** y si está **bien o mal**.

Todo lo que el panel necesita ya lo producen las pruebas; esta guía explica dónde está y en qué
formato. No hace falta tocar las pruebas ni tener cuenta de Betsson para desarrollarlo.

## 1. Conseguir el código

```bash
git fetch origin
git switch feat/sesion-manual     # o main, cuando se mergee el PR
npm ci
```

## 2. Conseguir datos de una ejecución

Los resultados **no están en git** (`.gitignore`): se generan en cada ejecución. Tres formas:

| Forma | Cuándo | Cómo |
|---|---|---|
| **Exportación** (recomendada) | Alguien ejecutó los escenarios en su PC | Esa persona, al terminar: `npm run export:results` → carpeta `results-export/<fecha>/`. La comprime y te la pasa. |
| **Tests unitarios** | Siempre, sin cuenta ni navegador | Tú mismo: `npm run test:unit` y luego `npm run export:results` |
| **GitHub Actions** | Ejecución desde *Actions → Game validation* | Descargar los artefactos `game-validation-report` (escenarios) y `unit-report` |

`npm run export:results` deja:

```
results-export/2026-10-15T14-21-06/
  scenarios.json      informe JSON de Playwright de la última ejecución de escenarios
  unit.json           el de la última ejecución de tests unitarios
  check-matrix.json   resultado de cada check (S1-01…S2-08) por mercado
  files/              todos los adjuntos (capturas, recortes OCR, JSON…) como ficheros
```

En `scenarios.json` / `unit.json` cada adjunto tiene `path` relativo a esa carpeta (`files/0003-…png`).
**Las trazas no se exportan**: graban el tráfico de la sesión real (cookies, tokens). Aparecen con
`"omitted": "…"` para que el panel pueda decir "traza solo disponible en local".

> Las ejecuciones se pisan: cada `npm run test:es` reemplaza `test-results/`, `playwright-report/` y
> `check-matrix/`. Exportar justo después de cada ejecución buena guarda una copia con fecha.

## 3. Formato de los datos

### `scenarios.json` y `unit.json` (reporter JSON de Playwright)

```jsonc
{
  "stats": { "startTime": "…", "duration": 175296, "expected": 1, "unexpected": 0 },
  "suites": [{                       // un suite por fichero; puede haber suites anidados
    "file": "spin-completed.spec.ts",
    "specs": [{
      "title": "Scenario 1 — completed Real Play spin",
      "tests": [{
        "projectName": "betsson-es",  // "unit" para los unitarios
        "annotations": [ { "type": "check", "description": "{\"id\":\"S1-01\",…}" }, { "type": "bonus", … } ],
        "results": [{
          "status": "passed",          // passed | failed | timedOut | skipped
          "duration": 175296,
          "errors": [ { "message": "…" } ],
          "steps": [ { "title": "[S1-06] Spin visibly started …", "duration": 3, "error": { … } } ],
          "attachments": [ { "name": "Spin 2. spinning (1385 ms)", "contentType": "image/png", "path": "files/0007-….png" } ]
        }]
      }]
    }]
  }]
}
```

Recorrer `suites` recursivamente (`suite.suites`). Cada `test.results[]` es un intento (sin reintentos: uno).

### Qué hace cada test y qué ha salido

- **Qué hace**: `spec.title` + la lista de `steps[].title`, que están escritos como pasos legibles
  ("Open the casino lobby as the funded player", "Read the Betsson balance before the spin",
  "Spin and watch the screen until the result settles", …).
- **Checks de los escenarios**: `annotations` con `type: "check"`; su `description` es un JSON
  `{ id, title, passed, detail }`. `detail` dice **qué se comparó** con valores reales, p. ej.
  `"98,90 € − 0,25 € + 0,15 € = 98,80 €; seen 98,80 €"`. Son los S1-01…S1-11 y S2-01…S2-08 de
  `src/reporting/check-catalog.ts` (título = qué comprueba).
- **Bien o mal**: `results[].status` del test y `passed` de cada check. Un error de un check también
  aparece en el step `[Sx-yy] …` con `error`.
- **Otras anotaciones útiles**: `bonus` (hubo ronda de tiradas gratis), `rejected-by` (Escenario 2:
  si el rechazo vino de Betsson o del juego).
- **Tests unitarios** (`unit.json`): `spec.title` describe lo que prueba (p. ej. "rejects \"GANANCIA 15 €\"
  (live misread of 0,15 €)…"), `suite.file` el fichero, `status`, `duration` y `errors` si falla.

### `check-matrix.json` (resumen ya calculado)

```jsonc
{
  "verdict": "pass" | "fail",
  "totals": { "pass": 9, "fail": 2, "not-run": 8 },
  "markets": ["betsson-es"],
  "rows": [ { "scenario": "Scenario 1 — …", "id": "S1-09", "title": "…",
              "cells": { "betsson-es": { "state": "fail", "detail": "…" } } } ],
  "runs": [ { "scenario": "…", "market": "betsson-es", "status": "failed", "durationMs": 175296, "error": "…" } ]
}
```

Ideal para la cabecera del panel (veredicto y totales) y la tabla de checks. "not-run" = el escenario
no se ejecutó en esa ejecución.

### Adjuntos: qué es cada uno

| `name` | Tipo | Qué es |
|---|---|---|
| `Betsson balance before` / `after` | png | Recorte del saldo de Betsson (sin el nombre del jugador) |
| `Play mode`, `Game session (DGOJ)`, `Summary` | json | Modo Real/Práctica, lo que mostró el formulario de sesión de juego, resumen del escenario |
| `HUD before spin — game frame` | png | El juego entero antes de girar |
| `HUD … — OCR input` / `— OCR text` | png / txt | Exactamente qué recorte se pasó al OCR y qué texto leyó |
| `HUD … — values (cents)` | json | Crédito, apuesta, ganancia y estado leídos |
| `Spin N. <fase> (<ms> ms)` | png | **Fotogramas clave del giro**: armed → spinning → stopped → settled (+ fases de bonus) |
| `Spin N. … — reel motion X%` | png | Diferencia de píxeles de los rodillos (movimiento) |
| `Spin — timeline` | json | Línea de tiempo del giro: señales de inicio, cambios de fase, premio por las dos vías (`payoutCents` = GANANCIA leída, `payoutFromCreditCents` = diferencia de crédito), `bonus`, `bonusPresses` |
| `Attempt …`, `Message frame`, `Message — OCR …` | png / txt | Escenario 2: intento de giro y mensaje "Fondos insuficientes" |
| `screenshot on failure` | png | La pestaña real en el momento del fallo |
| `trace` | zip | Traza Playwright de la pestaña real (**solo local**, omitida al exportar) |
| `video` | webm | Vídeo automático: **solo** en pruebas sin cuenta (p. ej. el smoke del lobby) |

## 4. Qué debería mostrar el panel

1. **Cabecera**: veredicto, totales pass/fail/not-run, fecha, duración, mercado. Texto fijo exigido
   por el reto: *"Mercado único betsson.es por indicación del organizador (15/10)"*.
2. **Escenarios**: una tarjeta por escenario con su estado; dentro, la tabla de checks (id, qué
   comprueba, resultado ✅/❌/⚪, `detail`) y los pasos con su duración.
3. **Capturas**: galería por escenario, ordenada como sucedió: saldo antes → juego → HUD/OCR → fotogramas
   del giro → saldo después. Pie de foto = `name`.
4. **Vídeo**: la pestaña real no se puede grabar en vídeo (está conectada por CDP). Opción buena:
   **reproducir los fotogramas `Spin N. …` como diapositivas** (o generar un GIF con ellos) con la
   línea de tiempo al lado. Si hay `video` (pruebas sin cuenta), mostrarlo con `<video>`.
5. **Tests unitarios**: lista agrupada por fichero, con título, ✅/❌, duración y error si falla.

## 5. Propuesta técnica (simple y sin servidor)

- `tools/panel.ts` (se ejecuta con `tsx`, ya instalado): lee la carpeta más reciente de
  `results-export/` (o una pasada como argumento), genera `panel/index.html` con HTML/CSS propios y
  las imágenes enlazadas a `results-export/<fecha>/files/…`, y lo abre en el navegador.
- En `package.json`: `"panel": "tsx tools/panel.ts"`. Flujo final:
  ```bash
  npm test                  # unitarios + escenarios (o test:es / test:unit por separado)
  npm run export:results
  npm run panel
  ```
- Añadir `panel/` a `.gitignore`.
- Para probarlo sin Betsson: `npm run test:unit` + `npm run export:results` ya da datos reales de
  unitarios; para escenarios, pedir una carpeta exportada a quien los ejecute.

## 6. Cuidado con

- **Nada sensible en el panel**: no incrustar trazas (`omitted`), no añadir capturas de la cabecera
  completa de Betsson (el nombre del jugador sale en el desplegable de saldo; los recortes de saldo
  ya lo excluyen).
- Los títulos de tests y checks están en inglés; si el panel va en español, traducir con un mapa
  por `id` (S1-01…) en vez de cambiar los títulos (el informe y la matriz los usan).
- Importes: vienen en céntimos (`9880` = 98,80 €); formatear con `Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })`.
