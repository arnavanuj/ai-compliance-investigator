export type EntityType = "person" | "company"

export interface InvestigationRequest {
  entityName: string
  entityType: EntityType
  jurisdiction?: string
}

export interface Investigation {
  id: string
  entityName: string
  entityType: EntityType
  jurisdiction?: string
  status: "queued" | "running" | "completed"
  createdAt: string
}