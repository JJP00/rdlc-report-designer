import { readFileSync } from 'node:fs';
import { XmlDocument, XmlValidateError, XsdValidator, type ErrorDetail } from 'libxml2-wasm';
import type {
  SchemaValidationResult,
  XmlSchemaValidatorPort,
} from '../../application/ports/out/XmlSchemaValidatorPort.js';

/**
 * Validación con el XSD oficial RDL 2016/01 usando libxml2 (WASM).
 *
 * El esquema se compila una vez (perezoso) y se reutiliza; validar un fichero
 * grande del corpus cuesta unos pocos ms.
 */
export class LibXml2SchemaValidatorAdapter implements XmlSchemaValidatorPort {
  private validator: XsdValidator | null = null;

  constructor(private readonly schemaPath: string) {}

  warmUp(): void {
    this.getValidator();
  }

  validate(xml: string): SchemaValidationResult {
    const validator = this.getValidator();
    const document = XmlDocument.fromString(xml);
    try {
      validator.validate(document);
      return { valid: true, problems: [] };
    } catch (error) {
      return { valid: false, problems: toProblems(error) };
    } finally {
      document.dispose();
    }
  }

  private getValidator(): XsdValidator {
    if (!this.validator) {
      const schema = XmlDocument.fromString(readFileSync(this.schemaPath, 'utf8'));
      this.validator = XsdValidator.fromDoc(schema);
    }
    return this.validator;
  }
}

/**
 * Convierte el error de libxml2 en una lista corta y legible: mensaje del
 * validador + **línea/columna** (y XPath cuando libxml2 lo conoce), que es lo
 * que permite localizar el problema sin abrir el XML a ojo.
 */
function toProblems(error: unknown): string[] {
  if (!(error instanceof XmlValidateError)) return [String(error)];

  const details: ErrorDetail[] = error.details ?? [];
  if (details.length > 0) return details.slice(0, 20).map(formatDetail);

  // Respaldo: mensaje sin detalles estructurados.
  return (error.message ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 20);
}

/** Un problema con su localización: «… (Línea 12, columna 7, /Report/…)». */
function formatDetail(detail: ErrorDetail): string {
  const message = detail.message.replace(/\s+/g, ' ').trim();
  const where = [
    detail.line > 0 ? `Línea ${detail.line}` : null,
    detail.col > 0 ? `columna ${detail.col}` : null,
    detail.xpath ? detail.xpath : null,
  ].filter((part): part is string => part !== null);
  return where.length > 0 ? `${message} (${where.join(', ')})` : message;
}
