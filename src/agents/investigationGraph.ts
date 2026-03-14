import { Annotation, StateGraph, START, END } from "@langchain/langgraph"
import { searchNode } from "./nodes/searchNode"
import { analysisNode } from "./nodes/analysisNode"
import { reportNode } from "./nodes/reportNode"
import { EvidenceItem, InvestigationReport, RiskLevel } from "./agentState"

export const InvestigationGraphState = Annotation.Root({
  entity: Annotation<string>(),
  evidence: Annotation<EvidenceItem[]>(),
  analysis: Annotation<string>(),
  riskLevel: Annotation<RiskLevel>(),
  report: Annotation<InvestigationReport>()
})

export type InvestigationGraphStateType =
  typeof InvestigationGraphState.State

export function buildInvestigationGraph() {

  const graph = new StateGraph(InvestigationGraphState)
    .addNode("search", searchNode)
    .addNode("analysisStep", analysisNode)
    .addNode("reportStep", reportNode)

  graph.addEdge(START, "search")
  graph.addEdge("search", "analysisStep")
  graph.addEdge("analysisStep", "reportStep")
  graph.addEdge("reportStep", END)

  return graph.compile()

}
