import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { IPC_EVENTS, type DocumentChangedEvent } from '@rdlc-designer/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(watcher.watchingPaths).toEqual([]);

    const saveAfterClose = await service.save(opened.value.sessionId);
    expect(saveAfterClose.isLeft()).toBe(true);
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
