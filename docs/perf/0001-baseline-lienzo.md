# Baseline de rendimiento del lienzo (F0)

- **Fecha**: 2026-09-14
- **Máquina**: Windows, Electron 44 (Chromium), renderer con Vite 7 dev
- **Escenario**: página `?bench=972` (`RDLC_BENCH=972`) — 972 textboxes reales
  (expresión + estilo), drag simulado de 3 s moviendo un item por frame.
- **Implementación medida**: `CanvasPreview` naive — `setState` por frame →
  re-render completo de React y actualización de Konva para los 972 nodos.
  Capa con `listening={false}`. Sin culling, sin `cache()`, sin actualización
  directa del nodo Konva.

## Resultado

```
items: 972 | frames: 89 | fpsP50: 30 | fpsP95: 20 | minFps: 15
heapMB: 30.1 | mountMs: 311
```

| Métrica | Valor | Presupuesto | ¿Cumple? |
|---|---|---|---|
| FPS en drag (p50) | 30 | 60 | ✗ |
| FPS p95 | 20 | 60 | ✗ |
| Heap renderer (972 items) | 30 MB | < 150 MB | ✓ |
| Montaje inicial | 311 ms | < 1500 ms | ✓ |

## Lectura

- La memoria y el montaje no son problema: el peso está en la **fluidez**.
- El cuello es el camino naif `setState por frame → reconciliación React de
  972 elementos`. Es exactamente lo que el documento de pendientes anticipa.

## Implicación para F1 (acciones ya planificadas)

1. **Drag sin React**: mover el nodo Konva directamente
   (`node.position()`) y tocar React solo al soltar (commit del comando).
   Objetivo: no re-renderizar la lista durante el gesto.
2. **Viewport culling** al hacer pan/zoom (`visible(false)` para lo que no
   intersecta), en vez de crear/destruir.
3. **Grid en capa propia cacheada** y `perfectDrawEnabled: false` durante drags.
4. Solo la pestaña activa monta el stage (ya planificado).
5. Los 60 fps son criterio de salida de F1: este benchmark se repetirá como
   test de aceptación (mismo escenario, `RDLC_BENCH=972`).

## Reproducir

```bash
RDLC_BENCH=972 pnpm --filter @rdlc-designer/back dev
# El resultado se imprime en consola/log: [bench] {...}
```

En PowerShell: `$env:RDLC_BENCH='972'; pnpm --filter @rdlc-designer/back dev`.
