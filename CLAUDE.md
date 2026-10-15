# Hakatsuki — Malackathon 2026 · Betsson "Intelligent Game Validation"

Contexto para Claude Code. Léelo entero antes de tocar código. Si existe código previo en el repo, **respétalo y adáptalo**; no lo reescribas desde cero.

## El reto (resumen)
Validar un juego de **Pragmatic Play** en Real Play dentro del casino de Betsson **como lo haría un jugador**: sin acceso al DOM del juego (iframe/canvas). Toda la interacción y validación dentro del juego se hace sobre lo que se ve en pantalla. "Un clic en Spin no es prueba de nada".

Enunciado completo: `docs/reto.pdf` (si no está, pedirlo).

### Mercado: SOLO betsson.es
- **Decisión del organizador (15/10):** se sustituyen betsson.com y betsson.pe por **betsson.es** únicamente.
- Debe constar en README y en la cabecera del informe: *"Mercado único betsson.es por indicación del organizador (15/10)"*.
- Idioma esperado: **español**. Moneda: **EUR**. Formato: `1.234,56 €` (coma decimal, punto de millares, símbolo detrás).
- Aun así, **mantener la abstracción de mercado** (`config/markets/es.yaml`, `--market es`, matriz de un elemento en el workflow): se puntúa "configuración por mercado".

### Escenario 1 — Giro completado en Real Play
Lobby → login (cuenta financiada) → lanzar slot Pragmatic → Real Play → leer saldo Betsson antes, apuesta y moneda → localizar controles y girar → verificar en pantalla que el giro empezó y terminó → leer resultado y saldos después.
Verificar:
- El giro empezó y terminó (no basta el clic).
- La apuesta mostrada es la usada.
- La moneda mostrada es EUR.
- El saldo en el juego es coherente.
- Saldo Betsson: `después == antes − apuesta + premio` (premio puede ser 0).

### Escenario 2 — Saldo insuficiente
Cuenta sin saldo utilizable → lanzar juego → leer saldo → intentar girar → verificar mensaje visible de saldo insuficiente **en español**, moneda EUR, que el giro se rechaza y que **ni el saldo Betsson ni el del juego cambian**.

### Entregables y puntuación
| Criterio | Peso |
|---|---|
| Escenarios funcionan (incl. checks de saldo Betsson) | 30 |
| "Ve como un jugador" (lee pantalla, no clics hardcodeados) | 20 |
| Código y arquitectura (config por mercado, sin secretos) | 15 |
| Informe y evidencias (pass/fail por check, capturas/traza/vídeo) | 15 |
| Workflow de GitHub Actions que ejecuta y publica el informe | 10 |
| Demo (7 min, solo finalistas, 16/10) | 10 |
| Bonus | 0–10 |

Ventana de desarrollo: 15/10 hasta las **20:00**. Finalistas se anuncian a las 21:45.

## Arquitectura decidida
**Núcleo determinista: Playwright (Python) + OpenCV + Tesseract.** LLM de visión solo como juez opcional (feature flag). Descartados: SLM local (Moondream/PaliGemma) y SikuliX.

Tres capas de evidencia:
1. **Jugador (primaria, decide pass/fail):** OCR de CRÉDITO / APUESTA / GANANCIA del juego + saldo Betsson en cabecera por OCR; análisis de movimiento en los rodillos.
2. **DOM de Betsson (cruce):** el saldo de la cabecera sí es DOM accesible; leer por DOM y OCR y comprobar que coinciden.
3. **Red (corroboración, bonus):** interceptar respuestas del servidor del juego (saldo/apuesta/premio) para demostrar que el OCR es correcto. **Nunca** como criterio de pass/fail.

### Máquina de estados del giro (`game/`)
`IDLE → STARTED → SETTLED`, con varias señales combinadas (los slots tienen animaciones en reposo):
- **IDLE:** movimiento en ROI de rodillos en línea base (medida antes del clic); CRÉDITO estable en 3 lecturas.
- **STARTED:** en <2 s, movimiento > k·línea base **y** CRÉDITO baja exactamente la APUESTA (Pragmatic descuenta al iniciar).
- **SETTLED:** movimiento bajo umbral ≥1,5 s seguidos, botón de giro vuelve a plantilla de reposo, GANANCIA y CRÉDITO estables (el contador de premio sube animado).
- Timeout → **INCONCLUSIVE** (distinto de FAIL).
- Premio calculado por dos vías (campo GANANCIA y diferencia de CRÉDITO); deben coincidir.
- Todo importe con `decimal.Decimal`, nunca `float`. Saldo Betsson puede tardar: polling con timeout.

### Reglas anti-flaky
- Un solo juego: **slot clásico de líneas (5×3), sin cascadas/tumbles**, apuesta mínima. Verificar que existe en .es.
- Viewport fijo (p. ej. 1366×768), `device_scale_factor=1`, sonido apagado.
- ROIs **relativas al bounding box del iframe** (proporciones), no píxeles absolutos.
- ROIs ancladas por etiqueta: localizar "CRÉDITO"/"APUESTA" con `pytesseract.image_to_data` y leer el número adyacente.
- Helper `click_text("CONTINUAR")` vía OCR para pantallas de intro.
- Tesseract con lista blanca de dígitos sobre recortes binarizados y escalados ×2. No EasyOCR.
- Reintentos solo en infraestructura (navegación/carga), **nunca en aserciones**.

## Particularidades de betsson.es (regulación DGOJ)
- **Límites de sesión obligatorios antes de jugar** (Orden HAP/1370/2014, art. 14): tiempo máximo y cantidad máxima. Necesario un `SessionLimitsModal` (lado Betsson) entre lanzar el juego y Real Play. Límites pequeños desde config.
- **Escenario 2:** el importe máximo de sesión no puede superar el saldo al iniciarla → con saldo 0 Betsson puede bloquear antes de abrir el juego. **Pedir a mentores cuenta con 0 < saldo < apuesta mínima** para que el rechazo lo muestre el juego. Si no es posible, validar el rechazo de Betsson y registrar en el informe **qué capa rechazó** (operador vs proveedor).
- **Avisos periódicos de tiempo de juego:** vigilante de interrupciones en cada tick de la máquina de estados; si aparece: capturar, cerrar, y si cayó en la ventana de medición del giro, invalidar y repetir la medición.
- **Duración mínima de partida 3 s:** no depender de turbo/quick spin. Bonus: check `spin_duration >= 3s`.
- **Resumen de sesión al salir** (apostado y premios): bonus como tercer punto de conciliación.

## Seguridad (cero secretos)
- Credenciales en **GitHub Environment `betsson-es`**: `FUNDED_USER`, `FUNDED_PASS`, `EMPTY_USER`, `EMPTY_PASS`. Localmente vía `.env` (en `.gitignore`), cargado con `pydantic-settings`. Nunca loguearlas.
- **Las trazas de Playwright registran los valores de `fill()`**: hacer login en un contexto **sin traza ni vídeo**, guardar `storage_state` en fichero temporal (en `.gitignore`, nunca como artefacto) y abrir el contexto grabado ya autenticado.
- `mask=[locator_usuario]` en capturas para ocultar el nombre de usuario.
- `gitleaks` en el workflow.

## Infraestructura
- betsson.es probablemente exige IP española → **runner autoalojado en un portátil del equipo** (plan A). Chrome con cabeza y GPU real (sin xvfb ni SwiftShader).
- Repo privado o solo `workflow_dispatch`. Etiquetas `[self-hosted, es]`. Portátil sin suspensión ni cambios de resolución durante la ejecución.
- El pipeline debe poder ejecutarse también en local con `pytest --market es`.

## Estructura objetivo
```
config/markets/es.yaml        # url, idioma, moneda, formato numérico, regulatorio, patrones de mensajes, juego
src/igv/
  settings.py                 # pydantic-settings (credenciales desde env)
  session/                    # login aislado, storage_state, page objects del lobby (DOM Betsson), SessionLimitsModal
  vision/                     # captura del iframe, ROIs, preprocesado, ocr.py, motion.py, money.py, templates/
  game/                       # PragmaticSlotScreen: máquina de estados, click_text, read_credit/bet/win, vigilante de interrupciones
  oracles/                    # network.py (corroboración), llm_judge.py (opcional, flag)
  checks/                     # dataclass Check(id, scenario, market, status, expected, observed, evidence)
  report/                     # JSON → HTML (Jinja2) + resumen markdown para $GITHUB_STEP_SUMMARY
tests/test_s1_spin.py, tests/test_s2_insufficient.py
.github/workflows/validate.yml
```
Estados de check: `PASS`, `FAIL`, `INCONCLUSIVE`. Cada check adjunta evidencias (capturas antes/después, recortes de ROI, GIF del giro).

### es.yaml de referencia
```yaml
base_url: https://www.betsson.es
language: es
currency: { code: EUR, symbol: "€", position: suffix }
number_format: { decimal: ",", thousands: "." }
regulatory:
  session_limits: { required: true, minutes: 15, amount: "2,00" }
  min_spin_seconds: 3
  reality_check_patterns: ["llevas jugando", "tiempo de juego"]   # VERIFICAR textos reales
  session_summary_on_exit: true
insufficient_balance_patterns: ["saldo insuficiente", "no tienes saldo suficiente"]  # VERIFICAR textos reales
game: <slot clásico de líneas disponible en .es>   # PENDIENTE
```

### Workflow de referencia
```yaml
on: [workflow_dispatch]
jobs:
  validate:
    strategy: { fail-fast: false, matrix: { market: [es] } }
    runs-on: [self-hosted, es]
    environment: betsson-${{ matrix.market }}
    steps:
      - uses: actions/checkout@v4
      - uses: gitleaks/gitleaks-action@v2
      - run: pip install -r requirements.txt && playwright install chromium
      - run: pytest tests --market ${{ matrix.market }} --junitxml=out/junit.xml
        env:
          FUNDED_USER: ${{ secrets.FUNDED_USER }}
          FUNDED_PASS: ${{ secrets.FUNDED_PASS }}
          EMPTY_USER:  ${{ secrets.EMPTY_USER }}
          EMPTY_PASS:  ${{ secrets.EMPTY_PASS }}
      - if: always()
        run: python -m igv.report out/ >> $GITHUB_STEP_SUMMARY
      - if: always()
        uses: actions/upload-artifact@v4
        with: { name: report-${{ matrix.market }}, path: out/ }
```

## Plan del día (15/10)
| Hora | Objetivo |
|---|---|
| 12:00–12:45 | Runner autoalojado registrado y workflow mínimo en verde. Recorrido manual en .es (modal de límites, carga, intro). Elegir slot. |
| 12:45–14:00 | Login aislado, storage_state, modal de límites, juego cargado. Capturas de referencia para calibrar ROIs. |
| 14:00–16:30 | Lectura CRÉDITO/APUESTA/GANANCIA, máquina de estados, conciliación con Decimal (saldo Betsson por DOM + OCR). **Escenario 1 en verde.** |
| 16:30–18:00 | Escenario 2 + vigilante de avisos de tiempo. |
| 18:00–19:15 | Informe HTML con evidencias, resumen en Actions, ejecución completa en el runner. |
| 19:15–20:00 | Bonus (duración ≥3 s, resumen de sesión, corroboración por red) o ensayo de demo. |

**Prioridad absoluta:** Escenario 1 de principio a fin antes de las 16:30.

## Pendientes / preguntas a mentores
- [ ] Cuenta para Escenario 2 con 0 < saldo < apuesta mínima.
- [ ] Textos reales de: modal de límites de sesión, aviso de tiempo, mensaje de saldo insuficiente del juego.
- [ ] Slot elegido y su disponibilidad en .es.
- [ ] Confirmar que .es carga desde la red del runner (IP española) y si hay captcha/2FA en el login.

## Equipo
Python, procesamiento de datos, ML (Transformers), visión por computador (robótica), análisis forense. Respuestas y comentarios en **español**.
