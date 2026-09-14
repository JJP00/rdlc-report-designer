import { readFileSync } from 'node:fs';
import { XmlDocument, XmlValidateError, XsdValidator } from 'libxml2-wasm';
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

/** Convierte el error de libxml2 en una lista corta y legible. */
function toProblems(error: unknown): string[] {
  if (!(error instanceof XmlValidateError)) return [String(error)];

  const lines = (error.message ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  // Quita la ruta del fichero y deja el mensaje del validador.
  const problems = lines.map((line) => line.replace(/^[^:]*:\d+:\s*/, ''));
  return problems.slice(0, 20);
}
