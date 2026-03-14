import { z } from "zod"

export const InvestigationRequestSchema = z.object({
  entityName: z.string().min(2),
  entityType: z.enum(["person", "company"]),
  jurisdiction: z.string().optional()
})

export type InvestigationRequestDTO = z.infer<typeof InvestigationRequestSchema>