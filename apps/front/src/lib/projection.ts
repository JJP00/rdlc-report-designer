import type { ItemDto, Length, ProjectionDto } from '@rdlc-designer/contracts';

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

/** Busca un item por id en todas las regiones (incluye anidados y celdas). */
export function findItem(projection: ProjectionDto, id: string): ItemDto | undefined {
  const regions = [projection.page.header, projection.page.body, projection.page.footer];
  for (const region of regions) {
    const found = findIn(region.items, id);
    if (found) return found;
  }
  return undefined;
}

function findIn(items: ItemDto[], id: string): ItemDto | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.kind === 'rectangle') {
      const found = findIn(item.children, id);
      if (found) return found;
    }
    if (item.kind === 'tablix') {
      for (const row of item.body.rows) {
        for (const cell of row.cells) {
          if (cell?.content) {
            const found = findIn([cell.content], id);
            if (found) return found;
          }
        }
      }
    }
  }
  return undefined;
}

/** Devuelve una copia de la proyección con el item parcheado (inmutable). */
export function patchItem(
  projection: ProjectionDto,
  id: string,
  patch: Partial<ItemDto>,
): ProjectionDto {
  const patchIn = (items: ItemDto[]): ItemDto[] =>
    items.map((item) => {
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
        };
      }
      return item;
    });

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

export function countItems(projection: ProjectionDto): {  total: number;
  byKind: Record<string, number>;
} {
  const byKind: Record<string, number> = {};
  let total = 0;

  const walk = (items: ItemDto[]): void => {
    for (const item of items) {
      total += 1;
      byKind[item.kind] = (byKind[item.kind] ?? 0) + 1;
      if (item.kind === 'rectangle') walk(item.children);
      if (item.kind === 'tablix') {
        for (const row of item.body.rows) {
          for (const cell of row.cells) {
            if (cell?.content) walk([cell.content]);
          }
        }
      }
    }
  };

  walk(projection.page.header.items);
  walk(projection.page.body.items);
  walk(projection.page.footer.items);
  return { total, byKind };
}

export function formatKinds(byKind: Record<string, number>): string {
  return Object.entries(byKind)
    .map(([kind, count]) => `${count} ${kind}`)
    .join(', ');
}

/** Todos los ids usados en la proyección (para proponer nombres libres). */
export function collectIds(projection: ProjectionDto): Set<string> {
  const ids = new Set<string>();

  const walk = (items: ItemDto[]): void => {
    for (const item of items) {
      ids.add(item.id);
      if (item.kind === 'rectangle') walk(item.children);
      if (item.kind === 'tablix') {
        for (const row of item.body.rows) {
          for (const cell of row.cells) {
            if (cell?.content) walk([cell.content]);
          }
        }
      }
    }
  };

  walk(projection.page.header.items);
  walk(projection.page.body.items);
  walk(projection.page.footer.items);
  return ids;
}
