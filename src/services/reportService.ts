import { InvestigationReport, InvestigationState, RiskLevel } from "../agents/agentState"

function buildSummary(analysis: string): string {
  const normalized = analysis.trim().replace(/\s+/g, " ")
  if (normalized.length <= 300) {
    return normalized
  }
  return `${normalized.slice(0, 297)}...`
}

export function generateInvestigationReport(
  state: InvestigationState
): InvestigationReport {
  const riskLevel: RiskLevel = state.riskLevel ?? "MEDIUM"
  const analysis = state.analysis ?? "No analysis available."

  return {
    entity: state.entity,
    riskLevel,
    summary: buildSummary(analysis),
    evidence: state.evidence ?? []
  }
}
