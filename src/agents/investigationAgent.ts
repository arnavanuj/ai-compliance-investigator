import { buildInvestigationGraph } from "./investigationGraph"
import { logInvestigation } from "../observability/investigationLogger"
import { investigationsTotal, investigationDuration } from "../observability/metrics"

export async function investigationAgent(entity: string) {

  const graph = buildInvestigationGraph()

  const startTime = Date.now()

  logInvestigation({
    entity,
    status: "started"
  })

  const initialState = {
    entity,
    evidence: [],
    analysis: ""
  } satisfies Parameters<typeof graph.invoke>[0]

  const result = await graph.invoke(initialState)

  const totalTimeMs = Date.now() - startTime

  logInvestigation({
    entity,
    status: "completed",
    durationMs: totalTimeMs
  })

  investigationsTotal.inc()
  investigationDuration.observe(totalTimeMs)

  return {
    ...result,
    investigationTimeMs: totalTimeMs
  }

}
