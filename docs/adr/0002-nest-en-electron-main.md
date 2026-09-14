# ADR 0002 — NestJS en el main de Electron: DI explícita por token

- **Fecha**: 2026-09-14
- **Estado**: aceptado
- **Fase**: 0

## Contexto

El backend del hexágono es un contexto NestJS
(`NestFactory.createApplicationContext`) que vive dentro del proceso main de
Electron. Electron-vite empaqueta el main con esbuild/Rollup.

esbuild **no emite `design:paramtypes`** (el `emitDecoratorMetadata` de tsc).
NestJS usa esa metadata para la inyección por tipo en el constructor, así que
`constructor(private readonly service: SessionService)` compila pero revienta
en runtime con `Nest can't resolve dependencies`.

## Decisión

Inyectar **siempre con token explícito**:

```ts
constructor(
  @Inject(FILE_SYSTEM_PORT) private readonly fileSystem: FileSystemPort,
  @Inject(RDLC_PARSER_PORT) private readonly parser: RdlcParserPort,
) {}
```

- Cada puerto/interfaz exporta un `Symbol` junto a su tipo
  (`export const FILE_SYSTEM_PORT = Symbol('FileSystemPort')`).
- Los módulos Nest son solo el mapa `provide: token → useClass/useExisting`.
- `experimentalDecorators` sigue activo en `tsconfig` (para `@Module`,
  `@Injectable`), pero el runtime **no depende** de `emitDecoratorMetadata`.

## Consecuencias

- Ventaja secundaria: el grafo de dependencias es explícito y auditable
  (`grep @Inject`), y desacopla de los tipos concretos (permite fakes en tests
  sin monkey-patching de Nest).
- Coste: escribir el `@Inject(...)` es obligatorio; olvidarlo no lo caza el
  compilador. Mitigación: test de bootstrap que instancia `AppModule` en CI
  (pendiente de F1, aprovechando que los adaptadores de Electron no se cargan
  al crear el contexto).
- Alternativas descartadas:
  - `unplugin-swc` para emitir metadata: dependencia extra y configuración
    más frágil.
  - Compilar el main con `tsc` antes de electron-vite: rompe el HMR del main
    y duplica toolchain.
