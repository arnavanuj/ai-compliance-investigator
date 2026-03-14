import { EvidenceItem, InvestigationState, RiskLevel } from "../agentState"
import axios from "axios"
import { callOllama } from "../ollamaClient"

type LinkEvaluation = {
  riskLevel: RiskLevel
  summary: string
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
}

async function getEvidenceText(url: string): Promise<{ text: string; error?: string }> {
  try {
    const response = await axios.get<string>(url, {
      timeout: 10000,
      responseType: "text",
      maxRedirects: 5
    })

    const cleaned = stripHtml(response.data).slice(0, 12000)
    return { text: cleaned }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scraping error"
    return { text: "", error: message }
  }
}

function parseRiskLevel(value: unknown): RiskLevel {
  if (typeof value !== "string") {
    return "MEDIUM"
  }

  const normalized = value.trim().toUpperCase()
  if (normalized === "HIGH" || normalized === "MEDIUM" || normalized === "LOW") {
    return normalized
  }

  return "MEDIUM"
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const firstBrace = raw.indexOf("{")
  const lastBrace = raw.lastIndexOf("}")
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return null
  }

  const jsonSlice = raw.slice(firstBrace, lastBrace + 1)
  try {
    return JSON.parse(jsonSlice) as Record<string, unknown>
  } catch {
    return null
  }
}

async function evaluateWithLlm(
  entity: string,
  item: EvidenceItem,
  cleanedText: string
): Promise<LinkEvaluation> {
  const prompt = `
You are a compliance investigator.
Evaluate this single source for risk related to the entity.

Entity: ${entity}
Source title: ${item.title}
Source URL: ${item.url}
Cleaned source content:
${cleanedText || "No page text could be extracted."}

Return only valid JSON in this exact shape:
{
  "riskLevel": "LOW | MEDIUM | HIGH",
  "summary": "A concise 1-2 sentence explanation grounded in this source content."
}
`

  const rawResponse = await callOllama(prompt)
  const parsed = extractJsonObject(String(rawResponse))

  if (!parsed) {
    return {
      riskLevel: "MEDIUM",
      summary: "LLM response could not be parsed; assigned MEDIUM risk conservatively."
    }
  }

  const riskLevel = parseRiskLevel(parsed.riskLevel)
  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : "LLM did not provide a usable summary."

  return { riskLevel, summary }
}

function foldRiskLevel(current: RiskLevel, next: RiskLevel): RiskLevel {
  if (current === "HIGH" || next === "HIGH") {
    return "HIGH"
  }
  if (current === "MEDIUM" || next === "MEDIUM") {
    return "MEDIUM"
  }
  return "LOW"
}

function isFallbackEvidence(title: string, url: string): boolean {
  return (
    title.toLowerCase().startsWith("search results for") ||
    url.includes("duckduckgo.com/?q=")
  )
}

export async function analysisNode(state: InvestigationState) {
  const prioritizedEvidence = (state.evidence ?? []).slice(0, 2)
  const analysisNotes: string[] = []
  let finalRiskLevel: RiskLevel = "LOW"
  let evidenceForReport: InvestigationState["evidence"] = []

  for (let index = 0; index < prioritizedEvidence.length; index++) {
    const item = prioritizedEvidence[index]
    const fallbackEvidence = isFallbackEvidence(item.title, item.url)
    const scrapeResult = fallbackEvidence
      ? { text: "", error: "Fallback search result cannot be scraped reliably." }
      : await getEvidenceText(item.url)

    let linkEvaluation: LinkEvaluation
    try {
      linkEvaluation = await evaluateWithLlm(state.entity, item, `${item.title}\n${scrapeResult.text}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown LLM analysis error"
      linkEvaluation = {
        riskLevel: "MEDIUM",
        summary: `LLM analysis failed (${message}); assigned MEDIUM risk conservatively.`
      }
    }

    analysisNotes.push(
      `Link ${index + 1} (${item.title}) -> ${linkEvaluation.riskLevel} risk. ${linkEvaluation.summary}${
        scrapeResult.error ? ` Scrape note: ${scrapeResult.error}.` : ""
      }`
    )

    if (linkEvaluation.riskLevel === "HIGH") {
      finalRiskLevel = "HIGH"
      evidenceForReport = [item]
      analysisNotes.push(
        `High-risk indicators were detected from link ${index + 1}; link ${index + 2} was skipped.`
      )
      break
    }

    finalRiskLevel = foldRiskLevel(finalRiskLevel, linkEvaluation.riskLevel)
  }

  if (prioritizedEvidence.length === 0) {
    analysisNotes.push("No evidence links were available for evaluation.")
    finalRiskLevel = "MEDIUM"
  }

  if (finalRiskLevel !== "HIGH") {
    evidenceForReport = []
    analysisNotes.push("No HIGH-risk evidence detected from the first two links.")
  }

  const analysis = analysisNotes.join(" ")

  return {
    ...state,
    analysis,
    riskLevel: finalRiskLevel,
    evidence: evidenceForReport
  }
}
