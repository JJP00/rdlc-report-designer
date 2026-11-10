import type { ProjectionDto, TablixDto, TextboxDto } from '@rdlc-designer/contracts';
import { describe, expect, it } from 'vitest';
import { cm, findItem, patchItem } from './projection';
import {
  createProjectionPreview,
  itemPreview,
  stylePreview,
  tablixTrackPreview,
} from './scrubPreview';

function textbox(id: string): TextboxDto {
  return {
    kind: 'textbox',
    id,
    top: cm(1),
    left: cm(1),
    width: cm(5),
    height: cm(0.5),
    paragraphs: [{ runs: [{ value: 'Hola' }] }],
  };
}

function makeProjection(): ProjectionDto {
  const tablix: TablixDto = {
    kind: 'tablix',
    id: 'Tablix1',
    top: cm(6),
    left: cm(0),
    width: cm(10),
    height: cm(3),
    body: {
      columns: [cm(4), cm(6)],
      rows: [
        { height: cm(1), cells: [] },
        { height: cm(2), cells: [] },
      ],
    },
    rowHierarchy: [],
    columnHierarchy: [],
  };
  return {
    sessionId: 'test',
    version: 1,
    reportName: 'Test',
    meta: { code: { text: '', functions: [] }, fields: [], parameters: [] },
    page: {
      width: cm(21),
      height: cm(29.7),
      margins: { top: cm(2), bottom: cm(2), left: cm(2), right: cm(2) },
      header: { width: cm(21), height: cm(0), items: [] },
      body: { width: cm(21), height: cm(29.7), items: [textbox('A'), textbox('B'), tablix] },
      footer: { width: cm(21), height: cm(0), items: [] },
    },
  };
}

describe('lib/scrubPreview', () => {
  it('aplica la vista previa sin mutar la proyección original', () => {
    const preview = createProjectionPreview();
    const original = makeProjection();
    const shown = preview.apply(original, itemPreview('A', { left: cm(3) }));
    expect(findItem(shown, 'A')?.left).toEqual(cm(3));
    expect(findItem(original, 'A')?.left).toEqual(cm(1));
  });

  it('varias vistas previas seguidas se restauran al valor de antes del arrastre', () => {
    const preview = createProjectionPreview();
    const original = makeProjection();
    let current = preview.apply(original, itemPreview('A', { left: cm(2) }));
    current = preview.apply(current, itemPreview('A', { left: cm(3) }));
    current = preview.apply(current, itemPreview('A', { left: cm(4) }));
    expect(findItem(current, 'A')?.left).toEqual(cm(4));

    const reverted = preview.revert(current);
    expect(findItem(reverted, 'A')?.left).toEqual(cm(1));
  });

  it('solo restaura las claves tocadas: un cambio ajeno durante el arrastre se conserva', () => {
    const preview = createProjectionPreview();
    let current = preview.apply(makeProjection(), itemPreview('A', { left: cm(3) }));
    // Una respuesta del backend reconcilia otro campo mientras se arrastra.
    current = patchItem(current, 'A', { top: cm(9) });
    const reverted = preview.revert(current);
    expect(findItem(reverted, 'A')?.left).toEqual(cm(1));
    expect(findItem(reverted, 'A')?.top).toEqual(cm(9));
  });

  it('el commit real sustituye la vista previa: revertir después no pisa el commit', () => {
    const preview = createProjectionPreview();
    let current = preview.apply(makeProjection(), itemPreview('A', { left: cm(3) }));
    // Commit optimista de `moveTo`: objeto nuevo en la misma clave.
    current = patchItem(current, 'A', { left: cm(3) });
    expect(preview.revert(current)).toBe(current);
  });

  it('tras un commit el siguiente arrastre parte de sus propios originales', () => {
    const preview = createProjectionPreview();
    let current = preview.apply(makeProjection(), itemPreview('A', { left: cm(3) }));
    current = patchItem(current, 'A', { left: cm(3) }); // commit del primer arrastre

    current = preview.apply(current, itemPreview('A', { left: cm(7) }));
    expect(findItem(preview.revert(current), 'A')?.left).toEqual(cm(3));
  });

  it('revertir sin vista previa no cambia nada', () => {
    const projection = makeProjection();
    expect(createProjectionPreview().revert(projection)).toBe(projection);
  });

  it('el estilo se previsualiza como el camino optimista y se restaura (incluido «sin estilo»)', () => {
    const preview = createProjectionPreview();
    const original = makeProjection();
    let current = preview.apply(
      original,
      stylePreview(['A', 'B'], { padding: { top: { value: 4, unit: 'pt' } } }),
    );
    expect(findItem(current, 'A')?.style?.padding?.top).toEqual({ value: 4, unit: 'pt' });
    expect(findItem(current, 'B')?.style?.padding?.top).toEqual({ value: 4, unit: 'pt' });

    current = preview.apply(
      current,
      stylePreview(['A', 'B'], { padding: { top: { value: 6, unit: 'pt' } } }),
    );
    expect(findItem(current, 'A')?.style?.padding?.top).toEqual({ value: 6, unit: 'pt' });

    const reverted = preview.revert(current);
    expect(findItem(reverted, 'A')?.style).toBeUndefined();
    expect(findItem(reverted, 'B')?.style).toBeUndefined();
  });

  it('ignora ids que no existen', () => {
    const preview = createProjectionPreview();
    const projection = makeProjection();
    const shown = preview.apply(projection, stylePreview(['Nada'], { fontSize: cm(1) }));
    expect(shown).toEqual(projection);
  });

  it('previsualiza el ancho de columna y el alto de fila de un Tablix', () => {
    const preview = createProjectionPreview();
    let current = preview.apply(
      makeProjection(),
      tablixTrackPreview('Tablix1', 'column', 1, cm(8)),
    );
    current = preview.apply(current, tablixTrackPreview('Tablix1', 'row', 0, cm(1.5)));
    const tablix = findItem(current, 'Tablix1');
    if (tablix?.kind !== 'tablix') throw new Error('esperaba un tablix');
    expect(tablix.body.columns).toEqual([cm(4), cm(8)]);
    expect(tablix.body.rows.map((row) => row.height)).toEqual([cm(1.5), cm(2)]);

    const restored = findItem(preview.revert(current), 'Tablix1');
    if (restored?.kind !== 'tablix') throw new Error('esperaba un tablix');
    expect(restored.body.columns).toEqual([cm(4), cm(6)]);
    expect(restored.body.rows.map((row) => row.height)).toEqual([cm(1), cm(2)]);
  });

  it('fuera de rango o sin Tablix no hay vista previa de rejilla', () => {
    const projection = makeProjection();
    const preview = createProjectionPreview();
    expect(preview.apply(projection, tablixTrackPreview('Tablix1', 'row', 9, cm(1)))).toEqual(
      projection,
    );
    expect(preview.apply(projection, tablixTrackPreview('A', 'row', 0, cm(1)))).toEqual(projection);
  });
});
