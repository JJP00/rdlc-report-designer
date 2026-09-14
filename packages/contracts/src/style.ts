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
});
export type StyleDto = z.infer<typeof styleSchema>;

/** Parche de estilo para `setStyle`: todo opcional, un nivel de anidamiento. */
export const stylePatchSchema = styleSchema
  .partial()
  .extend({
    padding: paddingSchema.partial().optional(),
    border: borderSidesSchema.optional(),
  })
  .strict();
export type StylePatch = z.infer<typeof stylePatchSchema>;
