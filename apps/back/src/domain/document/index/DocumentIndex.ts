import { parseLength, type Length } from '../style/Length.js';
import type { RdlcNode } from '../tree/RdlcNode.js';

export type RegionName = 'pageHeader' | 'body' | 'pageFooter';

export interface RegionBounds {
  width: Length;
  height: Length;
}

export interface DocumentBounds {
  header: RegionBounds;
  body: RegionBounds;
  footer: RegionBounds;
}

const DEFAULT_WIDTH: Length = { value: 21, unit: 'cm' };
const DEFAULT_HEIGHT: Length = { value: 29.7, unit: 'cm' };

function regionFor(tagName: string): RegionName | undefined {
  if (tagName === 'Body') return 'body';
  if (tagName === 'PageHeader') return 'pageHeader';
  if (tagName === 'PageFooter') return 'pageFooter';
  return undefined;
}

/**
 * Índice `Name → nodo` del documento. Es la clave de los comandos: resolver un
 * `id` es O(1) y las operaciones del backend no recorren el árbol.
 * Además sabe en qué región vive cada elemento y los límites de cada región
 * (invariante: un item no puede salir de su región).
 */
export class DocumentIndex {
  private readonly byName = new Map<string, RdlcNode>();
  private readonly regionByName = new Map<string, RegionName>();
  private readonly boundsValue: DocumentBounds;

  private constructor(root: RdlcNode) {
    this.boundsValue = readBounds(root);
    const walk = (node: RdlcNode, region: RegionName | undefined): void => {
      const effective = regionFor(node.tagName) ?? region;
      const name = node.attribute('Name');
      if (name) {
        this.byName.set(name, node);
        if (effective) this.regionByName.set(name, effective);
      }
      for (const child of node.children()) walk(child, effective);
    };
    walk(root, undefined);
  }

  static build(root: RdlcNode): DocumentIndex {
    return new DocumentIndex(root);
  }

  get(name: string): RdlcNode | undefined {
    return this.byName.get(name);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  names(): string[] {
    return [...this.byName.keys()];
  }

  get size(): number {
    return this.byName.size;
  }

  /** Región en la que vive el elemento indexado. */
  regionOf(name: string): RegionName | undefined {
    return this.regionByName.get(name);
  }

  bounds(): DocumentBounds {
    return this.boundsValue;
  }

  boundsOf(name: string): RegionBounds {
    const region = this.regionOf(name) ?? 'body';
    const bounds = this.boundsValue;
    if (region === 'pageHeader') return bounds.header;
    if (region === 'pageFooter') return bounds.footer;
    return bounds.body;
  }
}

function readBounds(root: RdlcNode): DocumentBounds {
  const section = root.child('ReportSections')?.child('ReportSection');
  const page = section?.child('Page');

  const pageWidth = parseLength(page?.child('PageWidth')?.text()) ?? DEFAULT_WIDTH;
  const pageHeight = parseLength(page?.child('PageHeight')?.text()) ?? DEFAULT_HEIGHT;
  const bodyWidth = parseLength(section?.child('Width')?.text()) ?? pageWidth;
  const bodyHeight =
    parseLength(section?.child('Body')?.child('Height')?.text()) ?? pageHeight;

  return {
    header: {
      width: pageWidth,
      height: parseLength(page?.child('PageHeader')?.child('Height')?.text()) ?? {
        value: 0,
        unit: 'cm',
      },
    },
    body: { width: bodyWidth, height: bodyHeight },
    footer: {
      width: pageWidth,
      height: parseLength(page?.child('PageFooter')?.child('Height')?.text()) ?? {
        value: 0,
        unit: 'cm',
      },
    },
  };
}
