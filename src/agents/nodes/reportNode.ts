import { InvestigationState } from "../agentState"
import { generateInvestigationReport } from "../../services/reportService"

export async function reportNode(state: InvestigationState) {
  const report = generateInvestigationReport(state)

  return {
    ...state,
    report
  }
}
