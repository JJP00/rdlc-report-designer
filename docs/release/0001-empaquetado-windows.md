# Empaquetado Windows (T1)

- **Fecha**: 2026-10-02
- **Estado**: hecho — `dist:dir` verificado con smoke empaquetado; `dist` (NSIS+MSI)
  verificado en local. CI añadido (`ci.yml` + `release.yml`) pendiente de su primera ejecución.
- **Herramienta**: [electron-builder](https://www.electron.build/) 26.x, config en
  [`apps/back/electron-builder.yml`](../../apps/back/electron-builder.yml).

## Decisión

- **Targets**: `nsis` (instalador clásico, no one-click: permite elegir carpeta) y `msi`
  (para despliegue corporativo). Salida en `apps/back/release/`.
- **Sin auto-update**: fuera del MVP (el ejecutable se distribuye a mano / por política
  interna). `publish: null` evita publicaciones accidentales.
- **asar**: activo. El **XSD oficial** se lee con `readFileSync` en runtime, así que viaja
  fuera del asar con `extraResources` → `resources/rdl2016/` del paquete. En el proceso
  main la ruta se resuelve con `app.isPackaged` (ver `infrastructure.module.ts`).
- **Dependencias**: `electron-builder` incluye solo las `dependencies` de producción
  (electrón-vite mantiene externos NestJS, chokidar, xml-trueformat, zod…). `libxml2-wasm`
  va **bundleado** en `out/main` (está en `devDependencies`, y el plugin de electron-vite
  solo externaliza `dependencies`), igual que el contrato.
- **Sin rebuild nativo**: no hay módulos nativos (`npmRebuild: false`).
- **Firma**: **decisión pendiente de certificado**. El pipeline firma solo si existen los
  secretos/entorno `CSC_LINK` + `CSC_KEY_PASSWORD`; sin ellos sale sin firmar (aviso de
  SmartScreen). `CSC_IDENTITY_AUTO_DISCOVERY=false` evita búsquedas de certificado.
- **Icono**: `build/icon.ico` (placeholder azul con hoja generado el 2026-10-02,
  256×256 con tamaños de 16 a 256). Sustituible por el definitivo sin tocar la config.

## Comandos

```bash
pnpm --filter @rdlc-designer/back build     # solo compila out/
pnpm dist:dir                               # app desempaquetada en release/win-unpacked (smoke)
pnpm dist                                   # NSIS + MSI en apps/back/release/
```

## CI

- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — en cada push/PR:
  - **checks** (ubuntu): `pnpm typecheck` + `pnpm test` (unit).
  - **e2e** (windows): `pnpm --filter @rdlc-designer/back e2e` (suite completa de Playwright
    sobre Electron) con subida de trazas si falla.
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — en tags `v*` o
  `workflow_dispatch`: compila los instaladores, los sube como artefacto y los adjunta a la
  release de GitHub.

## Verificación (2026-10-02)

1. `dist:dir` → `release/win-unpacked/` con `resources/app.asar` (38,4 MB) y
   `resources/rdl2016/ReportDefinition2016.xsd` (204 KB).
2. **Smoke empaquetado**: se lanza el .exe con una copia del corpus y, desde un guion de QA,
   se hace `openFile` + `save`: `{ ok: true, bytesIdentical: true }` → el XML se serializa y
   **valida contra el XSD empaquetado** antes de escribir.
3. Arranque con captura (`RDLC_SHOT`) y cierre por `RDLC_SHOT_QUIT`.
4. `dist` completo: `RDLC-Report-Designer-0.1.0-setup.exe` (NSIS, 111 MB) y
   `RDLC-Report-Designer-0.1.0.msi` (125 MB) en `apps/back/release/`.

## Pendiente (futuro)

- Firma real cuando haya certificado (`CSC_LINK` + `CSC_KEY_PASSWORD`).
- Evaluar `fileAssociations` (`.rdlc`) y `Squirrel`/auto-update si el despliegue interno lo pide.
