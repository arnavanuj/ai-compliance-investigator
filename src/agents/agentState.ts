export type RiskLevel = "LOW" | "MEDIUM" | "HIGH"

export interface EvidenceItem {
  title: string
  url: string
}

export interface InvestigationReport {
  entity: string
  riskLevel: RiskLevel
  summary: string
  evidence: EvidenceItem[]
}

export interface InvestigationState {
  entity: string
  evidence?: EvidenceItem[]
  analysis?: string
  riskLevel?: RiskLevel
  report?: InvestigationReport
}
