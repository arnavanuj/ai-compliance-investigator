import { EvidenceItem } from "./agentState"

export function investigationPrompt(entity: string, evidence: EvidenceItem[]) {
  const evidenceText = evidence
    .map((item) => `Title: ${item.title}\nSource: ${item.url}`)
    .join("\n\n")

  return `
You are a compliance investigator.
Analyze the following evidence related to the entity and produce a logically consistent result.

Entity: ${entity}

Evidence:
${evidenceText}

You must follow this internal process:
Step 1 - Analyze the evidence.
Step 2 - Explain the reasoning.
Step 3 - Based on that reasoning, determine the risk level.
Step 4 - Output the structured result.

Risk classification rules:
- LOW risk:
  - Information is public.
  - News articles, Wikipedia, biographies, or public roles (politicians, CEOs, celebrities).
  - No sensitive personal data.
- MEDIUM risk:
  - Mixed public and personal information.
  - Some privacy concerns.
  - Unverified allegations.
- HIGH risk:
  - Sensitive personal data.
  - Criminal allegations.
  - Financial crime indicators.
  - Compliance or sanctions concerns.
  - Security risks.

Critical consistency requirements:
- You MUST determine the risk level ONLY after completing the analysis.
- The risk level MUST be logically consistent with the reasoning.
- If the analysis states information is publicly available and non-sensitive, the risk level MUST be LOW.
- Do not assign HIGH risk unless the analysis explicitly identifies sensitive data, crime, sanctions, or compliance concerns.
- The riskLevel must be derived from the analysis reasoning. Do not produce contradictory outputs.

Return ONLY valid JSON in this exact shape:
{
  "riskLevel": "LOW | MEDIUM | HIGH",
  "analysis": "Detailed explanation of reasoning",
  "evidence": [
    { "title": "...", "url": "..." }
  ]
}
`
}
