import { z } from 'zod';
import { lengthSchema } from './common.js';

export const borderStyleSchema = z.enum(['None', 'Solid', 'Dashed', 'Dotted', 'Double']);
export type BorderStyle = z.infer<typeof borderStyleSchema>;

export const borderSideSchema = z.object({
  style: borderStyleSchema,
  color: z.string().optional(),
  width: lengthSchema.optional(),
});
export type BorderSide = z.infer<typeof borderSideSchema>;

export const paddingSchema = z.object({
  top: lengthSchema.optional(),
  left: lengthSchema.optional(),
  bottom: lengthSchema.optional(),
  right: lengthSchema.optional(),
});
export type Padding = z.infer<typeof paddingSchema>;

export const borderSidesSchema = z.object({
  top: borderSideSchema.optional(),
  left: borderSideSchema.optional(),
  bottom: borderSideSchema.optional(),
  right: borderSideSchema.optional(),
});
export type BorderSides = z.infer<typeof borderSidesSchema>;

/**
 * Mismo bag de estilo en los tres niveles (item / párrafo / run).
 * El backend solo emite lo aplicable a cada nivel.
 */
export const styleSchema = z.object({
  fontFamily: z.string().optional(),
  fontSize: lengthSchema.optional(),
  fontWeight: z.enum(['Normal', 'Bold']).optional(),
  fontStyle: z.enum(['Normal', 'Italic']).optional(),
  textDecoration: z.enum(['None', 'Underline', 'LineThrough', 'Overline']).optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  textAlign: z.enum(['Left', 'Center', 'Right', 'Justify']).optional(),
  verticalAlign: z.enum(['Top', 'Middle', 'Bottom']).optional(),
  padding: paddingSchema.optional(),
  border: borderSidesSchema.optional(),
  format: z.string().optional(),
  /** Viñetas / numeración del párrafo (RDL `ListStyle`). */
  listStyle: z.enum(['None', 'Bulleted', 'Numbered']).optional(),
});
export type StyleDto = z.infer<typeof styleSchema>;

/** Parche de estilo para `setStyle`: los campos a `null` se eliminan del `<Style>`. */
const optional = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();

const paddingPatchSchema = z
  .object({
    top: optional(lengthSchema),
    left: optional(lengthSchema),
    bottom: optional(lengthSchema),
    right: optional(lengthSchema),
  })
  .strict();

export const stylePatchSchema = z
  .object({
    fontFamily: optional(z.string()),
    fontSize: optional(lengthSchema),
    fontWeight: optional(z.enum(['Normal', 'Bold'])),
    fontStyle: optional(z.enum(['Normal', 'Italic'])),
    textDecoration: optional(z.enum(['None', 'Underline', 'LineThrough', 'Overline'])),
    color: optional(z.string()),
    backgroundColor: optional(z.string()),
    textAlign: optional(z.enum(['Left', 'Center', 'Right', 'Justify'])),
    verticalAlign: optional(z.enum(['Top', 'Middle', 'Bottom'])),
    padding: optional(paddingPatchSchema),
    border: optional(borderSidesSchema),
    format: optional(z.string()),
    listStyle: optional(z.enum(['None', 'Bulleted', 'Numbered'])),
  })
  .strict();
export type StylePatch = z.infer<typeof stylePatchSchema>;
