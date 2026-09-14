# RDLC Report Designer

Editor visual de layouts de informes `.rdlc` de Business Central. Alternativa
moderna al Report Builder (obsoleto): Electron + React (lienzo Konva), backend
NestJS con arquitectura hexagonal y **XML lossless** como fuente de verdad.

> Documentación funcional: [`RDLC Report Designer.md`](./RDLC%20Report%20Designer.md)
> Arquitectura: [`RDLC Report Designer - arquitectura.md`](./RDLC%20Report%20Designer%20-%20arquitectura.md)
> Pendientes: [`RDLC Report Designer - Pendientes.md`](./RDLC%20Report%20Designer%20-%20Pendientes.md)

## Estructura

```
apps/back/            # Electron main + NestJS (hexágono: dominio/aplicación/presentación/infraestructura)
apps/front/           # React renderer (Konva + Monaco) — F1
packages/contracts/   # @rdlc-designer/contracts — zod: comandos, proyección, IPC
fixtures/corpus/      # corpus de .rdlc versionado para golden tests
docs/adr/             # decisiones de arquitectura
```

## Requisitos

- Node.js >= 22
- pnpm 9 (`npm install -g pnpm@9.15.4`)

## Comandos

```bash
pnpm install
pnpm test                       # vitest: golden round-trip, comparativa, caso de uso
pnpm typecheck                  # tsc en todos los paquetes
pnpm format                     # prettier
pnpm --filter @rdlc-designer/back dev     # Electron en modo dev (HMR renderer)
pnpm --filter @rdlc-designer/back build   # build de producción (main + preload + renderer)
```

## Estado (Fase 0 — spike round-trip)

- [x] Monorepo pnpm + turbo, TypeScript estricto.
- [x] `packages/contracts` v0: comandos (familias 1-3), proyección completa,
      canales IPC, códigos de error y `RdlcApi` (preload tipado).
- [x] Corpus de 10 ficheros + golden tests de round-trip **byte a byte**.
- [x] Decisión del parser: `xml-trueformat` (ver
      [`docs/adr/0001-parser-xml-lossless.md`](./docs/adr/0001-parser-xml-lossless.md)).
- [x] Parser/serializer tras puertos + SessionService (abrir/guardar/cerrar)
      con `Either`/`DomainError` y tests de integración con adaptadores fake.
- [x] Shell Electron + NestJS (`NestFactory.createApplicationContext`), IPC
      validado con zod y preload tipado (`window.api`).
- [x] File watching (chokidar) → re-parseo → `documentChanged` → recarga en el
      front, filtrando el eco de la propia escritura.
- [x] Proyección mínima F0 (página, bandas, items, Tablix, texto, meta) y
      vista Konva de solo lectura.
- [ ] Benchmark de lienzo (972 textboxes) y presupuesto de memoria del renderer.
- [ ] Diálogo de conflictos y dirty real (F1, con comandos).

