# Resizable dialog flashes wider on grab — 2026-11-10

Reported by the user: "in the dialogs that let me change the size, when I change it, it
briefly resizes to a bigger window and then returns to where the cursor is".

IDs continue from `docs/bugs/0003-dialogos-redimensionado-2026-10-13.md` (last used: BUG-65).

> **Closed 2026-11-10 (same session)**: reproduced on the real app, fixed and verified.
> Regression test: `apps/back/e2e/known-bugs.spec.ts` (BUG-66), in the shared
> resizable-dialog `describe`.

## Index

| Bug    | Severity | One line                                                                     |
| ------ | -------- | ---------------------------------------------------------------------------- |
| BUG-66 | P2       | Grabbing the corner grip flashes the dialog to the full window width, then it eases back |

---

## P2

### BUG-66 · Grabbing the corner grip flashes the dialog to the full window width

- **Where:** `apps/front/src/components/ui/dialog.tsx`, `DialogContent` class list:
  `duration-100` with no `transition-property`.
- **What:** in Tailwind 4, `duration-100` emits `--tw-duration` (used by
  `animate-in/out`) **and** `transition-duration: 100ms`. `transition-property` keeps
  its initial value `all`, so every style change on the frame is animated. On the first
  `pointerdown` the frame switches from `width: 100%` (capped by the `max-w-*` classes) to
  `width: min(Npx, 95vw)` with `maxWidth: none`. `max-width` is not interpolable and drops
  at once; `width` interpolates from `100%` of the viewport, so the dialog jumps to the full
  window width and shrinks back to the cursor over 100 ms. Each later pointer move also
  trails the cursor by 100 ms.
- **Measured (before the fix):** a 40 px drag on Report properties: widest frame **1484 px**
  (the whole window), resting width **752 px**.
- **Fix:** `transition-none` on the frame. Open/close animations are unaffected: they read
  `--tw-duration`, which `transition-none` does not touch.
- **Why the BUG-60…65 tests missed it:** they measure with `stableBox`, which only sees
  the resting state. The BUG-66 test samples the frame on every animation frame for the
  whole gesture and requires that no frame is larger than the final size.
- **Verified:** all BUG-60…66 E2E tests pass after the fix; front unit tests 427/427.
