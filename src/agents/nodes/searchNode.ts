import { searchTool, SearchResult } from "../../tools/searchTool"
import { InvestigationState } from "../agentState"

export async function searchNode(state: InvestigationState) {

  const results: SearchResult[] = await searchTool(state.entity)

  const evidence = results.map((result) => ({
    title: result.title,
    url: result.link
  }))

  return {
    ...state,
    evidence
  }

}
