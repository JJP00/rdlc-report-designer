import type { ItemDto, Length, ProjectionDto, TablixDto } from '@rdlc-designer/contracts';

/** Utilidades de la proyección (read-model del lienzo). */

export function toCm(length: Length): number {
  switch (length.unit) {
    case 'cm':
      return length.value;
    case 'mm':
      return length.value / 10;
    case 'in':
      return length.value * 2.54;
    case 'pt':
      return (length.value * 2.54) / 72;
  }
}

export function cm(value: number): Length {
  return { value: Math.round(value * 10000) / 10000, unit: 'cm' };
}

/**
 * Orden de pintado y de hit-test: por `ZIndex` (los items sin `ZIndex` cuentan
 * como 0) y, a igualdad, el orden del XML. Konva pinta en el orden del árbol, así
 * que el front debe reordenar (el XML no tiene por qué venir en orden de ZIndex).
 */
export function sortByZIndex(items: ItemDto[]): ItemDto[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (a.item.zIndex ?? 0) - (b.item.zIndex ?? 0) || a.index - b.index)
    .map((entry) => entry.item);
}

/** Busca un item por id en todas las regiones (incluye anidados y celdas). */
export function findItem(projection: ProjectionDto, id: string): ItemDto | undefined {
  return flattenItems(projection).find((item) => item.id === id);
}

/**
 * Items del **mismo contenedor** (región o rectángulo) que el item dado; es la
 * lista en la que manda el `ZIndex`. `undefined` si vive en una celda de Tablix
 * (contenido único: no hay orden que cambiar).
 */
export function findSiblings(projection: ProjectionDto, id: string): ItemDto[] | undefined {
  const search = (items: ItemDto[]): ItemDto[] | undefined => {
    if (items.some((item) => item.id === id)) return items;
    for (const item of items) {
      if (item.kind === 'rectangle') {
        const found = search(item.children);
        if (found) return found;
      }
    }
    return undefined;
  };

  return (
    search(projection.page.header.items) ??
    search(projection.page.body.items) ??
    search(projection.page.footer.items)
  );
}

/**
 * Contenido de las cabeceras de un Tablix (bandas de columna/fila + esquina),
 * sin nulos. Viven **fuera de `body.rows`** pero son items normales: hay que
 * incluirlos en el recorrido para que se puedan seleccionar, editar y contar.
 */
export function tablixHeaderItems(tablix: TablixDto): ItemDto[] {
  const headers = tablix.headers;
  if (!headers) return [];

  const items: ItemDto[] = [];
  const push = (cell: ItemDto | null | undefined): void => {
    if (cell) items.push(cell);
  };
  for (const band of headers.columns) band.cells.forEach(push);
  for (const band of headers.rows) band.cells.forEach(push);
  for (const row of headers.corner) row.forEach(push);
  return items;
}

/**
 * true si el item es el **contenido directo de una celda** de Tablix (o de una
 * cabecera/esquina): ahí manda la celda (su tamaño lo pone la fila/columna), así
 * que no se redimensiona con tiradores.
 */
export function isCellContent(projection: ProjectionDto, id: string): boolean {
  for (const item of flattenItems(projection)) {
    if (item.kind !== 'tablix') continue;
    for (const row of item.body.rows) {
      for (const cell of row.cells) {
        if (cell?.content?.id === id) return true;
      }
    }
    if (tablixHeaderItems(item).some((header) => header.id === id)) return true;
  }
  return false;
}

/**
 * Id del item **contenedor** del item dado (rectángulo o Tablix), si lo hay.
 * Sirve para «subir un nivel» con Esc: muy útil cuando los bordes de una tabla
 * anidada coinciden con los del contenedor y no se puede pinchar.
 */
export function findParentItemId(projection: ProjectionDto, id: string): string | undefined {
  const search = (items: ItemDto[], parent: ItemDto | undefined): string | undefined => {
    for (const item of items) {
      if (item.id === id) return parent?.id;
      if (item.kind === 'rectangle') {
        const found = search(item.children, item);
        if (found !== undefined) return found;
      }
      if (item.kind === 'tablix') {
        for (const row of item.body.rows) {
          for (const cell of row.cells) {
            if (!cell?.content) continue;
            if (cell.content.id === id) return item.id;
            const found = search([cell.content], item);
            if (found !== undefined) return found;
          }
        }
        for (const header of tablixHeaderItems(item)) {
          if (header.id === id) return item.id;
          const found = search([header], item);
          if (found !== undefined) return found;
        }
      }
    }
    return undefined;
  };

  for (const region of [projection.page.header, projection.page.body, projection.page.footer]) {
    const found = search(region.items, undefined);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Busca un item por id dentro de una lista (anidados y celdas incluidos). */
export function findItemInList(items: ItemDto[], id: string): ItemDto | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.kind === 'rectangle') {
      const found = findItemInList(item.children, id);
      if (found) return found;
    }
    if (item.kind === 'tablix') {
      for (const row of item.body.rows) {
        for (const cell of row.cells) {
          if (cell?.content) {
            const found = findItemInList([cell.content], id);
            if (found) return found;
          }
        }
      }
      for (const header of tablixHeaderItems(item)) {
        const found = findItemInList([header], id);
        if (found) return found;
      }
    }
  }
  return undefined;
}

/**
 * Todos los items de la proyección en orden de documento (regiones, hijos de
 * rectángulos y contenido de celdas de Tablix incluidos).
 */
export function flattenItems(projection: ProjectionDto): ItemDto[] {
  const items: ItemDto[] = [];

  const walk = (list: ItemDto[]): void => {
    for (const item of list) {
      items.push(item);
      if (item.kind === 'rectangle') walk(item.children);
      if (item.kind === 'tablix') {
        for (const row of item.body.rows) {
          for (const cell of row.cells) {
            if (cell?.content) walk([cell.content]);
          }
        }
        walk(tablixHeaderItems(item));
      }
    }
  };

  walk(projection.page.header.items);
  walk(projection.page.body.items);
  walk(projection.page.footer.items);
  return items;
}

/** Devuelve una copia de la proyección con el item parcheado (inmutable). */
export function patchItem(
  projection: ProjectionDto,
  id: string,
  patch: Partial<ItemDto>,
): ProjectionDto {
  function patchIn(items: ItemDto[]): ItemDto[] {
    return items.map((item) => {
      if (item.id === id) return { ...item, ...patch } as ItemDto;
      if (item.kind === 'rectangle') return { ...item, children: patchIn(item.children) };
      if (item.kind === 'tablix') {
        return {
          ...item,
          body: {
            ...item.body,
            rows: item.body.rows.map((row) => ({
              ...row,
              cells: row.cells.map((cell) =>
                cell?.content
                  ? { ...cell, content: patchIn([cell.content])[0] ?? cell.content }
                  : cell,
              ),
            })),
          },
          ...(item.headers ? { headers: patchHeaders(item.headers) } : {}),
        };
      }
      return item;
    });
  }

  function patchHeaders(headers: NonNullable<TablixDto['headers']>): TablixDto['headers'] {
    const patchCell = (cell: ItemDto | null): ItemDto | null =>
      cell ? (patchIn([cell])[0] ?? cell) : null;
    return {
      ...headers,
      columns: headers.columns.map((band) => ({ ...band, cells: band.cells.map(patchCell) })),
      rows: headers.rows.map((band) => ({ ...band, cells: band.cells.map(patchCell) })),
      corner: headers.corner.map((row) => row.map(patchCell)),
    };
  }

  return {
    ...projection,
    page: {
      ...projection.page,
      header: { ...projection.page.header, items: patchIn(projection.page.header.items) },
      body: { ...projection.page.body, items: patchIn(projection.page.body.items) },
      footer: { ...projection.page.footer, items: patchIn(projection.page.footer.items) },
    },
  };
}

export function countItems(projection: ProjectionDto): {
  total: number;
  byKind: Record<string, number>;
} {
  const items = flattenItems(projection);
  const byKind: Record<string, number> = {};

  for (const item of items) {
    byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
  }

  return { total: items.length, byKind };
}

export function formatKinds(byKind: Record<string, number>): string {
  return Object.entries(byKind)
    .map(([kind, count]) => `${count} ${kind}`)
    .join(', ');
}

/** Todos los ids usados en la proyección (para proponer nombres libres). */
export function collectIds(projection: ProjectionDto): Set<string> {
  return new Set(flattenItems(projection).map((item) => item.id));
}
