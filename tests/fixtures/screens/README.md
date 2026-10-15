# Screen fixtures — Wolf Gold on betsson.es

Real screenshots taken by hand on 15 Oct 2026. They let the vision code be tested without opening
Betsson (no account, no anti-fraud blocks, works in CI). None of them shows account details.

| File | Mode | What the OCR should read |
|---|---|---|
| `wolf-gold-intro.webp` | Practice | Intro splash (continue button, "NO VOLVER A MOSTRAR") |
| `wolf-gold-practice-spinning.webp` | Practice | `CRÉDITO 99.998,00 €`, `APUESTA 2,00 €`, status `¡BUENA SUERTE!` |
| `wolf-gold-practice-win.webp` | Practice | `CRÉDITO 99.992,40 €`, `APUESTA 2,00 €`, `GANANCIA 0,40 €`, `LA LÍNEA 12 ABONA 0,40 €` |
| `wolf-gold-real-idle.webp` | Real | `CRÉDITO 98,90 €`, `APUESTA 2,00 €`, status `¡HAGA SU APUESTA!`, no practice banner |
| `wolf-gold-insufficient-funds.png` | Real (empty account) | Modal `MENSAJE`: "Fondos insuficientes para realizar esta apuesta…", `ACEPTAR` |
| `wolf-gold-free-spins.webp` | Real | Free spins in progress: `GANANCIA 0,25 €`, `TIRADAS GRATIS RESTANTES 2` |
| `wolf-gold-free-spins-end.webp` | Real | End of free spins, still in the bonus (`TIRADAS GRATIS RESTANTES 0`): "¡ENHORABUENA! … HA GANADO 1,85 € — PULSE EN CUALQUIER PARTE PARA CONTINUAR" |
| `wolf-gold-after-free-spins.webp` | Real | Back to the base game: `CRÉDITO 99,15 €`, `TIRADAS GRATIS COMPLETADAS` |

The last three are frames of a screen recording of a real bonus (three scatters, 5 free spins).

The first four are full browser screenshots at different sizes, so code must locate the game
area instead of relying on fixed pixel positions. The last one is a crop of the modal only.
