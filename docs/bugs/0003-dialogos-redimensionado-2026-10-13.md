# Resizable dialogs — 2026-10-13

Reported by the user ("resizing dialogs like Report properties or the text editor is
buggy, I can't explain it; resizing is not correctly responsive") and then analysed by
**static reading** of `apps/front/src/components/ui/dialog.tsx` and the dialogs that use
it. **The app was not run**: every entry is **open**, has **no reproduction and no
regression test yet**, and the cause is a hypothesis taken from the code. Severity is
expert judgement.

IDs continue from `docs/bugs/0002-resiliencia-2026-10-08.md` (last used: BUG-59).
Convention for the future regression tests, same as 0001/0002: assert the **correct**
behaviour and mark it as an expected failure (`test.fail()`) until fixed.

**Open question for the user** (decides what to reproduce first): is the problem the
dialog _jumping while you drag the corner handle_, or the dialog and its buttons _going
off-screen when you resize the window_? BUG-60/61 explain the first, BUG-62/64 the second.

> **Closed 2026-10-13 (same session)**: all six bugs are **fixed and verified on the real
> app**. The original hypotheses were confirmed by measurement (drag moved the opposite
> edge +50 px; the oversized dialog ended ~110 px off-screen; «Aplicar» fell ~270 px below
> the fold; the size survived close/reopen), then reverted by the fixes. Regression tests
> live in `apps/back/e2e/known-bugs.spec.ts` (BUG-60…65). The resizable layout is now
> shared by Report properties, Text editor, Group properties, Expression and Tablix
> filters via `ResizableDialogContent` + `DialogBody`
> (`apps/front/src/components/ui/dialog.tsx`); confirm dialogs stay fixed. BUG-65 resolves
> as **reset on close** (the doc's safer default). **Revisión del usuario (misma fecha)**:
> el redimensionado mantiene el diálogo **centrado** (crece simétrico, delta doblado) en
> vez de fijar la esquina opuesta; ver el status de BUG-60. Verificado con `typecheck` en
> ambos paquetes, **418 back + 350 front** unit tests y **130/130 E2E** (`pnpm e2e`).

## Index

| Bug    | Severity | One line                                                                          |
| ------ | -------- | --------------------------------------------------------------------------------- |
| BUG-60 | P1       | The corner handle runs away from the cursor (dialog is centred, grows both sides) |
| BUG-61 | P2       | The handle lags and jitters (portal + `ResizeObserver` + `setState`, animation)   |
| BUG-62 | P1       | Pixel size is clamped only while dragging; a smaller window leaves it oversized   |
| BUG-63 | P2       | Only Report properties is `resizable`; the other dialogs behave differently       |
| BUG-64 | P1       | Report properties scrolls its footer away: Save/Cancel disappear when shrunk      |
| BUG-65 | P3       | The chosen size may survive close/reopen (to verify)                              |

---

## P1

### BUG-60 · The corner handle runs away from the cursor

- **Where:** `dialog.tsx` — class `fixed top-1/2 left-1/2 … -translate-x-1/2 -translate-y-1/2`
  (line 237) and `onPointerMove` → `setSize(clampSize(start.width + dx, start.height + dy))`
  (lines 171–180).
- **What:** the dialog is centred with a transform. Dragging the bottom-right handle by
  `dx` grows the width by `dx`, but because it stays centred the right edge moves only
  `dx / 2` and the left edge moves `-dx / 2`. The handle moves at half the cursor speed
  and the dialog also grows to the left and upwards.
- **Expected:** the edge under the cursor follows it 1:1 and the dialog **stays centred**
  (the opposite edge mirrors it). User revision (2026-10-13): the first fix pinned the
  top-left corner, which left the dialog off-centre after expanding; the centre must not
  move.
- **Proposed fix:** with a centred dialog, growing the width by `2·dx` makes the dragged
  edge advance `dx` while the centre (and the opposite edge, mirrored) stay put. This is
  the option the user chose; the original "pin `left/top` and drop the translate" was
  discarded because it decentres the dialog.
- **Test:** E2E — drag the handle by 100 px and assert that the right/bottom edges moved
  100 px (±1), that the left/top edges moved −100 px, and that the centre did not move.
- **Status:** fixed. El tamaño crece el doble del delta del puntero: el borde agarrado sigue
  al cursor 1:1, los bordes simétricos y el centro quieto; el estado de posición fija se
  eliminó. El doble clic vuelve al tamaño original y se mantienen los mínimos 320×220.
  Revisado el 2026-10-13 a petición del usuario (fijar la esquina descentraba el diálogo).
  Cubierto por: E2E (`known-bugs.spec.ts`).

### BUG-62 · Pixel size is not re-clamped when the window changes

- **Where:** `dialog.tsx` — `clampSize` (lines 118–124) runs only inside the drag;
  `style={{ width, height, maxWidth: 'none', maxHeight: 'none' }}` (lines 225–235).
- **What:** once a size is set, the dialog keeps those pixels with its viewport caps
  removed. Shrinking the window afterwards (the app only enforces 960×600) leaves a dialog
  taller or wider than the window: the buttons end up off-screen and the dialog can't be
  reached. This is the "not correctly responsive" report.
- **Expected:** the dialog is always inside the viewport (≤ 95 % × 90 %) whatever the
  window does, and recovers its size when the window grows again.
- **Proposed fix:** keep the user size as a _preference_ and apply
  `min(preferred, viewport × ratio)` through CSS (`min(<px>, 95vw)`), or re-clamp on the
  window `resize` event. CSS is simpler and has no extra state.
- **Test:** E2E — resize the dialog, shrink the window to 960×600, assert the dialog rect
  is inside the viewport and the footer buttons are visible.
- **Status:** fixed. El tamaño es una preferencia con tope de viewport en CSS
  (`width: min(<px>px, 95vw)`, `height: min(<px>px, 90vh)`, con `maxWidth/maxHeight: none`
  sobre las clases de breakpoint) y la posición fijada se recorta en cada `resize`;
  al volver a crecer se recuperan tamaño y posición preferidos. Cubierto por: E2E
  (`known-bugs.spec.ts`: diálogo sobredimensionado + ventana a 960×600 → rect dentro del
  viewport y «Aplicar» visible, y recuperación al crecer; antes el borde superior quedaba
  a −110 px).

### BUG-64 · Report properties scrolls its footer away

- **Where:** `ReportPropertiesDialog.tsx:29` — `className="max-h-[85vh] max-w-2xl overflow-y-auto"`
  with `resizable`; `DialogFooter` uses `-mx-4 -mb-4` (`dialog.tsx:312`).
- **What:** the whole content, header and footer included, is the scroll container. After
  making the dialog shorter the footer is below the fold and has to be scrolled to. The
  dialogs that use `flex flex-col overflow-hidden` + an inner `overflow-y-auto` body
  (`TextEditorDialog`, `GroupPropertiesDialog`, `TablixFiltersDialog`) keep it pinned, so
  the behaviour is inconsistent between dialogs.
- **Expected:** title and actions always visible; only the body scrolls.
- **Proposed fix:** the same layout as the other three (flex column, `min-h-0` body with
  its own scroll); ideally inside the shared component (see BUG-63).
- **Test:** E2E — shorten the dialog to its minimum height and assert the footer buttons
  are in the viewport.
- **Status:** fixed. «Propiedades del informe» usa el marco en columna de
  `ResizableDialogContent` + `DialogBody` + `DialogFooter`: el título y «Aplicar» quedan
  fijos y solo scrollea el cuerpo (el pie de la pestaña activa vive ahora en el pie del
  marco, no dentro del scroll). Cubierto por: E2E (`known-bugs.spec.ts`: con el alto mínimo
  (220 px) el título y «Aplicar» siguen dentro del viewport; antes el borde inferior del
  botón quedaba ~270 px por debajo del pliegue).

## P2

### BUG-61 · The handle lags behind the dialog and can jitter

- **Where:** `dialog.tsx` — handle rendered through `createPortal` to `document.body`;
  position taken from `getBoundingClientRect()` in a `ResizeObserver` callback that calls
  `setCorner` (lines 93–116); a `setTimeout(update, 200)` waits for the entry animation.
- **What:** the handle is not part of the dialog, so its position is always one
  render behind it. During the `zoom-in-95` entry animation the measured rect is scaled,
  so the handle can start in the wrong place and jump 200 ms later. With BUG-60 the lag is
  amplified because the dialog moves in a direction the handle does not follow.
- **Expected:** the handle sticks to the corner at all times.
- **Proposed fix:** render the handle **inside** the dialog with `position: sticky` or an
  absolutely positioned element on a non-scrolling wrapper (the reason for the portal was
  the scroll of the content: solved by BUG-64's layout, where the body scrolls and the
  frame does not). Removes `corner` state, the observer and the timer.
- **Status:** fixed. La agarradera es un hijo absoluto del marco, que ya no scrollea
  (`overflow-hidden`); el scroll es del cuerpo (`DialogBody`). Fuera el portal, el
  `ResizeObserver`, el estado `corner`, el `setTimeout(200)` y `isGripEvent`/`keepGrip`
  (Radix ya no ve la agarradera como interacción «fuera»); se mantienen
  `data-rdlc-dialog-grip`, `role="separator"`, `aria-label="Redimensionar el diálogo"` y
  las flechas. Cubierto por: E2E (`known-bugs.spec.ts`: la agarradera es descendiente del
  diálogo y sigue su esquina durante la animación de entrada; antes no existía dentro del
  marco).

### BUG-63 · Resizing is available in one dialog only

- **Where:** `resizable` appears only in `ReportPropertiesDialog.tsx:29`. `TextEditorDialog`
  (`max-w-4xl`, `max-h-[85vh]`), `GroupPropertiesDialog`, `ExpressionDialog` and
  `TablixFiltersDialog` have fixed caps and no handle; `ExpressionDialog` is a flex column
  without an inner scroll.
- **What:** the user expects the same behaviour in every dialog; in some the handle exists,
  in others it does not, and each reacts to the window size with different caps.
- **Expected:** one behaviour (minimum size, maximum = viewport, handle, double click to
  reset) for every content-heavy dialog. The text editor and the expression editor are the
  first that need it (Monaco and the run list want room).
- **Proposed fix:** a single `ResizableDialogContent` layout (frame + scrolling body +
  pinned footer) used by Report properties, Text editor, Group properties, Expression and
  Filters; confirm dialogs (unsaved, conflict, save-all) stay fixed.
- **Status:** fixed. El editor de texto, el diálogo de expresión, «Propiedades del grupo» y
  «Filtros del Tablix» usan el mismo marco que «Propiedades del informe»
  (`ResizableDialogContent` + `DialogBody`): agarradera, mínimo 320×220, máximo el viewport,
  doble clic para volver al tamaño original y cabecera/pie fijos con el scroll solo en el
  cuerpo; las guardas (cambios sin guardar, conflicto, guardar todo) siguen fijas y sin
  agarradera. Cubierto por: E2E (`known-bugs.spec.ts`: el editor de texto y el diálogo de
  expresión se arrastran 1:1 y con el alto mínimo (220 px) el título y las acciones siguen
  dentro del viewport; «Propiedades del grupo» y «Filtros del Tablix» comparten la
  agarradera; la guarda de cambios sin guardar no tiene ninguna).

## P3

### BUG-65 · The chosen size may survive close and reopen (to verify)

- **Where:** `dialog.tsx` — `size` is `useState` of `DialogContent`, which the parent
  keeps mounted (Radix unmounts only its content). The 2026-10-08 comment in the file about
  the handle ("the dialog closed: Radix unmounts its content, not this component") shows the
  component outlives the dialog.
- **What:** probably the size survives closing, so a dialog opens at an odd size after a
  window change (compounds BUG-62). Not verified.
- **Expected:** decide explicitly: either reset on close, or remember per dialog and clamp
  on open. Resetting is the safer default.
- **Status:** fixed (reiniciar, el defecto seguro). Al cerrar, Radix desmonta el contenido
  y la ref lo detecta: tamaño y posición vuelven al estado original, así el diálogo reabre
  como la primera vez. Cubierto por: E2E (`known-bugs.spec.ts`: redimensionar, cerrar,
  reabrir → tamaño original; antes el ancho sobrevivía 150 px mayor).

---

## Suggested order

1. BUG-60 + BUG-62 + BUG-64 in the shared component (one commit, with the three E2E tests).
2. BUG-61 (removes the portal) together with BUG-63 (apply to the other dialogs).
3. BUG-65 after deciding the rule.

Reproduce first with the real app (`pnpm build:e2e` + a Playwright script that drags the
handle and resizes the window); the E2E build is needed, a production build lacks the
`__rdlc*` hooks.
