import { z } from 'zod';

/**
 * Unidad de longitud RDL. En el corpus de Business Central todo llega en `cm`,
 * pero el schema admite las cuatro unidades canónicas del estándar.
 */
export const lengthUnitSchema = z.enum(['cm', 'mm', 'in', 'pt']);
export type LengthUnit = z.infer<typeof lengthUnitSchema>;

/** Longitud con unidad explícita (nunca un número suelto). */
export const lengthSchema = z.object({
  value: z.number().finite(),
  unit: lengthUnitSchema,
});
export type Length = z.infer<typeof lengthSchema>;

/** Región del informe donde puede vivir un item. */
export const regionKindSchema = z.enum(['body', 'pageHeader', 'pageFooter']);
export type RegionKind = z.infer<typeof regionKindSchema>;
