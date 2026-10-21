import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IPC_EVENTS, type DocumentChangedEvent } from '@rdlc-designer/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { corpusByName } from '../golden/fixtures.js';
import { cleanupTempDirs, makeService, writeFixture } from './test-utils.js';

/** F0 — caso de uso completo con adaptadores fake (sin Electron). */

afterEach(cleanupTempDirs);

describe('F0 · SessionService (abrir / guardar / vigilar)', () => {
  it('abre un fichero real, proyecta y guarda bytes idénticos', async () => {
    const { service, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const before = await readFile(path);

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;

    const projection = opened.value.projection;
    expect(projection.reportName).toBe('PalletOutput');
    expect(projection.page.width.value).toBeGreaterThan(0);
    expect(projection.page.body.items.length).toBeGreaterThan(0);

    const saved = await service.save(opened.value.sessionId);
    expect(saved.isRight()).toBe(true);
    if (!saved.isRight()) return;
    expect(saved.value.bytesIdentical).toBe(true);

    const after = await readFile(path);
    expect(after.equals(before)).toBe(true);
  });

  it('abre un RDL 2016 (extensión .rdl): misma proyección y round-trip', async () => {
    const { service, tmp } = await makeService();
    const path = join(tmp, 'PalletOutput.rdl');
    await writeFile(path, corpusByName('PalletOutput.rdlc').bytes);

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;

    expect(opened.value.projection.reportName).toBe('PalletOutput');
    expect(opened.value.projection.page.body.items.length).toBeGreaterThan(0);

    const saved = await service.save(opened.value.sessionId);
    expect(saved.isRight()).toBe(true);
    if (!saved.isRight()) return;
    expect(saved.value.bytesIdentical).toBe(true);
  });

  it('rechaza un RDL anterior a 2016 con un motivo claro (E_UNSUPPORTED_SCHEMA)', async () => {
    const { service, tmp } = await makeService();
    const path = join(tmp, 'Viejo.rdl');
    await writeFile(
      path,
      '<?xml version="1.0" encoding="utf-8"?>\r\n' +
        '<Report xmlns="http://schemas.microsoft.com/sqlserver/reporting/2008/01/reportdefinition">' +
        '<Body><ReportItems /></Body></Report>',
      'utf8',
    );

    const opened = await service.open(path);
    expect(opened.isLeft()).toBe(true);
    if (opened.isRight()) return;
    expect(opened.value.code).toBe('E_UNSUPPORTED_SCHEMA');
    expect(opened.value.reason).toBe('unsupportedSchemaVersion');
    expect(opened.value.params?.['version']).toBe('2008');
  });

  it('rechaza un XML cuya raíz no es <Report>', async () => {
    const { service, tmp } = await makeService();
    const path = join(tmp, 'NoEsInforme.rdlc');
    await writeFile(path, '<?xml version="1.0"?><foo><bar /></foo>', 'utf8');

    const opened = await service.open(path);
    expect(opened.isLeft()).toBe(true);
    if (opened.isRight()) return;
    expect(opened.value.code).toBe('E_INVALID_XML');
  });

  it('proyecta el corpus: items, texto y funciones del bloque <Code>', async () => {
    const { service, tmp } = await makeService();
    const path = await writeFixture(tmp, 'SalesInvoiceESP.rdlc');

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;

    const { projection } = opened.value;
    expect(projection.page.width.value).toBeCloseTo(21, 1);
    expect(projection.page.height.value).toBeCloseTo(29.7, 1);
    expect(projection.page.body.items.length).toBeGreaterThan(0);
    expect(projection.meta.fields.length).toBeGreaterThan(0);
    expect(projection.meta.code.functions.length).toBeGreaterThan(0);
  });

  it('detecta cambios externos y empuja una snapshot nueva', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;
    const sessionId = opened.value.sessionId;

    expect(watcher.watchingPaths).toEqual([path]);

    // Simula una edición externa (como haría Report Builder o VS Code).
    const xml = await readFile(path, 'utf8');
    await writeFile(path, xml.replace('<Value>(</Value>', '<Value>[EDITADO]</Value>'), 'utf8');

    watcher.trigger(path);

    await vi.waitFor(() => {
      expect(events.sent.some((e) => e.channel === IPC_EVENTS.documentChanged)).toBe(true);
    });

    const event = events.sent.find((e) => e.channel === IPC_EVENTS.documentChanged)?.payload as
      DocumentChangedEvent | undefined;
    expect(event?.sessionId).toBe(sessionId);
    expect(event?.projection.version).toBe(2);
    // El front distingue recargas externas de snapshots internos (contador/aviso).
    expect(event?.reason).toBe('external');
  });

  it('no dispara recarga por el eco de la propia escritura', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;

    await service.save(opened.value.sessionId);
    watcher.trigger(path);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events.sent.some((e) => e.channel === IPC_EVENTS.documentChanged)).toBe(false);
  });

  it('no pisa las ediciones sin guardar: avisa del conflicto y conserva el documento', async () => {
    const { service, watcher, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;
    const sessionId = opened.value.sessionId;

    // Edición local (equivale a un comando): el documento queda dirty.
    const target = service.getEditTarget(sessionId);
    expect(target.isRight()).toBe(true);
    if (!target.isRight()) return;
    const node = target.value.index.get('Textbox25');
    expect(node).toBeDefined();
    node
      ?.child('Paragraphs')
      ?.child('Paragraph')
      ?.child('TextRuns')
      ?.child('TextRun')
      ?.child('Value')
      ?.setText('EDITADO');
    service.touch(sessionId, { snapshotOut: false });

    // Cambio externo mientras hay cambios sin guardar.
    const external = (await readFile(path, 'utf8')).replace(
      '<Value>(</Value>',
      '<Value>[EXTERNO]</Value>',
    );
    await writeFile(path, external, 'utf8');
    watcher.trigger(path);

    await vi.waitFor(() => {
      expect(events.sent.some((e) => e.channel === IPC_EVENTS.conflictDetected)).toBe(true);
    });

    // No se recargó ni se perdió la edición local.
    expect(events.sent.some((e) => e.channel === IPC_EVENTS.documentChanged)).toBe(false);
    const after = service.getEditTarget(sessionId);
    expect(after.isRight()).toBe(true);
    if (!after.isRight()) return;
    expect(
      after.value.index
        .get('Textbox25')
        ?.child('Paragraphs')
        ?.child('Paragraph')
        ?.child('TextRuns')
        ?.child('TextRun')
        ?.child('Value')
        ?.text(),
    ).toBe('EDITADO');

    // Guardar sobrescribe el cambio externo (decisión explícita del usuario).
    const saved = await service.save(sessionId);
    expect(saved.isRight()).toBe(true);
    expect(await readFile(path, 'utf8')).toContain('EDITADO');
  });

  it('devuelve E_NOT_FOUND con un fichero inexistente', async () => {
    const { service, tmp } = await makeService();
    const result = await service.open(join(tmp, 'no-existe.rdlc'));
    expect(result.isLeft()).toBe(true);
    if (result.isLeft()) expect(result.value.code).toBe('E_NOT_FOUND');
  });

  it('devuelve E_INVALID_XML con un fichero corrupto', async () => {
    const { service, tmp } = await makeService();
    const path = join(tmp, 'roto.rdlc');
    await writeFile(path, '<Report><sin cerrar</Report>', 'utf8');

    const result = await service.open(path);
    expect(result.isLeft()).toBe(true);
    if (result.isLeft()) expect(result.value.code).toBe('E_INVALID_XML');
  });

  it('cierra la sesión y deja de vigilar', async () => {
    const { service, watcher, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;

    const closed = await service.close(opened.value.sessionId);
    expect(closed.isRight()).toBe(true);
    if (closed.isRight()) expect(closed.value.closed).toBe(true);
    expect(watcher.watchingPaths).toEqual([]);

    const saveAfterClose = await service.save(opened.value.sessionId);
    expect(saveAfterClose.isLeft()).toBe(true);
  });

  it('con cambios sin guardar no cierra: pide confirmación (y `force` cierra)', async () => {
    const { service, watcher, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;
    const sessionId = opened.value.sessionId;

    // Edición local (equivale a un comando): la sesión queda dirty.
    const target = service.getEditTarget(sessionId);
    if (!target.isRight()) return;
    target.value.index.get('Textbox25')?.child('Width')?.setText('5cm');
    service.touch(sessionId, { snapshotOut: false });

    const refused = await service.close(sessionId);
    expect(refused.isRight()).toBe(true);
    if (refused.isRight() && !refused.value.closed) {
      expect(refused.value.reason).toBe('dirty');
    }
    // Sigue abierta y vigilando.
    expect(watcher.watchingPaths).toEqual([path]);

    // Forzando (tras confirmar el usuario), sí cierra.
    const forced = await service.close(sessionId, { force: true });
    expect(forced.isRight()).toBe(true);
    if (forced.isRight()) expect(forced.value.closed).toBe(true);
    expect(watcher.watchingPaths).toEqual([]);
  });

  it('tras guardar, cerrar ya no pide confirmación', async () => {
    const { service, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');

    const opened = await service.open(path);
    if (!opened.isRight()) return;
    const sessionId = opened.value.sessionId;

    const target = service.getEditTarget(sessionId);
    if (!target.isRight()) return;
    target.value.index.get('Textbox25')?.child('Width')?.setText('5cm');
    service.touch(sessionId, { snapshotOut: false });
    expect((await service.save(sessionId)).isRight()).toBe(true);

    const closed = await service.close(sessionId);
    expect(closed.isRight()).toBe(true);
    if (closed.isRight()) expect(closed.value.closed).toBe(true);
  });

  it('bloquea el guardado si el XML no valida contra el esquema (E_VALIDATION)', async () => {
    const { service, schema, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const before = await readFile(path);

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;

    schema.result = { valid: false, problems: ["Element 'Bogus': This element is not expected."] };

    const saved = await service.save(opened.value.sessionId);
    expect(saved.isLeft()).toBe(true);
    if (saved.isLeft()) {
      expect(saved.value.code).toBe('E_VALIDATION');
      expect(saved.value.data).toEqual(["Element 'Bogus': This element is not expected."]);
    }

    // No se escribió nada en disco.
    const after = await readFile(path);
    expect(after.equals(before)).toBe(true);
  });

  it('al importar, un XML inválido se avisa pero se abre igual', async () => {
    const { service, schema, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    schema.result = { valid: false, problems: ['aviso de esquema'] };

    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (opened.isRight()) expect(opened.value.warnings).toEqual(['aviso de esquema']);
  });
});

describe('F0 · SessionService (nuevo / guardar como / recargar)', () => {
  it('createNew escribe la plantilla en blanco, la abre y guarda bytes idénticos', async () => {
    const { service, watcher, tmp } = await makeService();
    const path = join(tmp, 'Nuevo.rdlc');

    const created = await service.createNew(path);
    expect(created.isRight()).toBe(true);
    if (!created.isRight()) return;

    expect(created.value.projection.reportName).toBe('Nuevo');
    expect(created.value.projection.page.body.items).toEqual([]);
    expect(created.value.projection.page.width.value).toBeCloseTo(21, 3);
    expect(created.value.projection.page.height.value).toBeCloseTo(29.7, 3);
    expect(watcher.watchingPaths).toEqual([path]);

    // Sin cambios, el guardado escribe exactamente los bytes de la plantilla.
    const saved = await service.save(created.value.sessionId);
    expect(saved.isRight()).toBe(true);
    if (saved.isRight()) expect(saved.value.bytesIdentical).toBe(true);
  });

  it('saveAs escribe en la ruta nueva, re-vigila y deja limpia la sesión', async () => {
    const { service, watcher, tmp } = await makeService();
    const original = await writeFixture(tmp, 'PalletOutput.rdlc');
    const copy = join(tmp, 'Copia.rdlc');

    const opened = await service.open(original);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;
    const sessionId = opened.value.sessionId;

    // Edición local (equivale a un comando): la sesión queda dirty.
    const target = service.getEditTarget(sessionId);
    if (!target.isRight()) return;
    target.value.index.get('Textbox25')?.child('Width')?.setText('7.77cm');
    service.touch(sessionId, { snapshotOut: false });

    const savedAs = await service.saveAs(sessionId, copy);
    expect(savedAs.isRight()).toBe(true);
    if (savedAs.isRight()) expect(savedAs.value.path).toBe(copy);

    expect(await readFile(copy, 'utf8')).toContain('7.77cm');
    // El original no se tocó y el watcher sigue la ruta nueva.
    expect(await readFile(original, 'utf8')).not.toContain('7.77cm');
    expect(watcher.watchingPaths).toEqual([copy]);

    // Limpia: cerrar ya no pide confirmación.
    const closed = await service.close(sessionId);
    expect(closed.isRight()).toBe(true);
    if (closed.isRight()) expect(closed.value.closed).toBe(true);
  });

  it('reload descarta los cambios locales y refleja el disco', async () => {
    const { service, events, tmp } = await makeService();
    const path = await writeFixture(tmp, 'PalletOutput.rdlc');
    const opened = await service.open(path);
    expect(opened.isRight()).toBe(true);
    if (!opened.isRight()) return;
    const sessionId = opened.value.sessionId;

    const target = service.getEditTarget(sessionId);
    if (!target.isRight()) return;
    target.value.index.get('Textbox25')?.child('Width')?.setText('5cm');
    service.touch(sessionId, { snapshotOut: false });

    // Cambio externo: el usuario elige «Recargar» y se descarta lo local.
    const external = (await readFile(path, 'utf8')).replace(
      '<Value>(</Value>',
      '<Value>[EXTERNO]</Value>',
    );
    await writeFile(path, external, 'utf8');

    const reloaded = await service.reload(sessionId);
    expect(reloaded.isRight()).toBe(true);
    if (!reloaded.isRight()) return;

    const after = service.getEditTarget(sessionId);
    if (!after.isRight()) return;
    expect(after.value.index.get('Textbox25')?.child('Width')?.text()).not.toBe('5cm');
    expect(
      events.payloads<{ sessionId: string; dirty: boolean }>(IPC_EVENTS.dirtyChanged).at(-1),
    ).toEqual({ sessionId, dirty: false });
  });
});
