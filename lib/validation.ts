import { z } from "zod";
export const rulesSchema = z
  .object({
    bedrooms: z.array(z.number().int().min(0).max(20)).max(20).optional(),
    bathrooms: z.array(z.number().min(0).max(20)).max(20).optional(),
    floorplans: z.array(z.string().max(120)).max(100).optional(),
    unitKeys: z.array(z.string().max(150)).max(100).optional(),
    minSqft: z.number().min(0).max(50000).optional(),
    maxRent: z.number().positive().max(1000000).optional(),
    availableWithinDays: z.number().int().min(0).max(365).optional(),
  })
  .strict();
export const sourceSchema = z
  .object({
    group_id: z.uuid(),
    property_id: z.uuid().optional(),
    property_name: z.string().min(1).max(150),
    url: z.url().max(2048),
  })
  .strict();
export const segmentSchema = z
  .object({
    source_id: z.uuid(),
    name: z.string().min(1).max(100),
    rules: rulesSchema,
    cadence_hours: z.union([z.literal(24), z.literal(48)]),
  })
  .strict();
