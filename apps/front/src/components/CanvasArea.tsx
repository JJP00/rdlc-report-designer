import type { Length, NewItemSpec, ProjectionDto, ScopeRef } from '@rdlc-designer/contracts';
import type { ReactNode } from 'react';
import { CanvasPreview } from '@/components/canvas/CanvasPreview';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { CanvasHit } from '@/lib/hit';
import { itemKindLabel } from '@/lib/palette';

const INSERT_KINDS = ['textbox', 'rectangle', 'line', 'image'] as const;

export interface CanvasAreaProps {
  projection: ProjectionDto | null;
  zoom: number;
  selectedId: string | null;
  /** Último hit del click derecho (destino de Insertar/Pegar). */
  menuHit: CanvasHit | null;
  hasClipboard: boolean;
  reveal: { id: string; nonce: number } | null;
  onSelect: (id: string | null) => void;
  onContextMenuHit: (hit: CanvasHit) => void;
  onZoomChange: (zoom: number) => void;
  onMoveItem: (id: string, top: Length, left: Length) => void;
  /** Tiradores de la selección: mover + redimensionar en un comando. */
  onResizeItem: (id: string, box: { top: Length; left: Length; width: Length; height: Length }) => void;
  /** Separadores de la rejilla: redimensionar una columna/fila del Tablix. */
  onResizeColumn: (id: string, column: number, width: Length) => void;
  onResizeRow: (id: string, row: number, height: Length) => void;
  onInsertAt: (kind: NewItemSpec['kind'], hit: CanvasHit) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPasteAt: (scope: ScopeRef, index: number) => void;
  onDelete: () => void;
}

/** Lienzo + menú contextual (acciones del item arriba, insertar debajo). */
export function CanvasArea({
  projection,
  zoom,
  selectedId,
  menuHit,
  hasClipboard,
  reveal,
  onSelect,
  onContextMenuHit,
  onZoomChange,
  onMoveItem,
  onResizeItem,
  onResizeColumn,
  onResizeRow,
  onInsertAt,
  onDuplicate,
  onCopy,
  onCut,
  onPasteAt,
  onDelete,
}: CanvasAreaProps): ReactNode {
  const paste = (): void => {
    if (menuHit) onPasteAt(menuHit.scope, menuHit.index);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex min-h-0 flex-1 flex-col">
          {projection ? (
            <CanvasPreview
              projection={projection}
              zoom={zoom}
              selectedId={selectedId}
              onSelect={onSelect}
              onMoveItem={onMoveItem}
              onZoomChange={onZoomChange}
              onContextMenuHit={onContextMenuHit}
              onDropItem={onInsertAt}
              onResizeItem={onResizeItem}
              onResizeColumn={onResizeColumn}
              onResizeRow={onResizeRow}
              reveal={reveal}
            />
          ) : (
            <div className="m-auto max-w-lg text-center text-sm text-muted-foreground">
              <p>Sin documento abierto.</p>
              <p className="mt-2">
                Abre un .rdlc, arrastra un tipo de elemento desde la barra al lienzo (o haz click
                derecho para insertar), selecciona un elemento y muévelo (imán de 0,1 cm; Shift lo
                ignora), edita su texto o expresión en el panel derecho, deshaz con Ctrl+Z y
                guarda: solo cambian los valores editados.
              </p>
            </div>
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-56">
        <ContextMenuLabel>{menuHit?.item ? menuHit.item.id : 'Lienzo'}</ContextMenuLabel>
        <ContextMenuSeparator />

        {/* Acciones del item ARRIBA (como en VS Code/Explorer): sobre un item
            hay grupo de portapapeles; en vacío solo pegar. */}
        {menuHit?.item ? (
          <>
            <ContextMenuItem onSelect={onCut}>
              Cortar
              <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={onCopy}>
              Copiar
              <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem disabled={!hasClipboard} onSelect={paste}>
              Pegar
              <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={onDuplicate}>
              Duplicar
              <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={onDelete}>
              Eliminar
              <ContextMenuShortcut>Supr</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : (
          <ContextMenuItem disabled={!hasClipboard} onSelect={paste}>
            Pegar
            <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger>Insertar</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {INSERT_KINDS.map((kind) => (
              <ContextMenuItem
                key={kind}
                onSelect={() => {
                  if (menuHit) onInsertAt(kind, menuHit);
                }}
              >
                {itemKindLabel(kind)}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
  );
}
