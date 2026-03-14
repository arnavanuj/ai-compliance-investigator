import { FormEvent, useRef, useState } from "react"

type EvidenceItem = {
  title: string
  url: string
}

type InvestigationReport = {
  entity: string
  riskLevel: "LOW" | "MEDIUM" | "HIGH"
  summary: string
  evidence: EvidenceItem[]
}

type InvestigationResponse = {
  entity?: string
  analysis?: string
  analysisSummary?: string
  riskLevel?: "LOW" | "MEDIUM" | "HIGH"
  evidence?: EvidenceItem[]
  investigationTimeMs?: number
  searchTimeMinutes?: number
  minimalEvidenceWarning?: boolean
  report?: InvestigationReport
}

type InvestigationStartResponse = {
  jobId: string
  status: "queued"
}

type StatusEventPayload = {
  stage?: "queue" | "search" | "analysis" | "report"
  phase?: "started" | "completed" | "failed"
  timestamp?: number
  progressMessage?: string
  jobId?: string
  stageTimeMs?: number
  evidenceCount?: number
}

function stageLabel(stage?: string, phase?: string): string {
  if (stage === "queue" && phase === "started") {
    return "Investigation started"
  }

  if (stage === "search" && phase === "started") {
    return "Searching internet sources..."
  }

  if (stage === "search" && phase === "completed") {
    return "Collecting evidence..."
  }

  if (stage === "analysis" && phase === "started") {
    return "Analyzing evidence with AI..."
  }

  if (stage === "report" && phase === "started") {
    return "Generating report..."
  }

  if (stage === "report" && phase === "completed") {
    return "Completed"
  }

  if (phase === "failed") {
    return "Failed"
  }

  return "In progress..."
}

export default function HomePage() {
  const [entityName, setEntityName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<InvestigationResponse | null>(null)
  const [status, setStatus] = useState("")
  const [jobId, setJobId] = useState("")
  const [statusHistory, setStatusHistory] = useState<string[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)
  const lastStatusKeyRef = useRef<string>("")

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")
    setResult(null)
    setStatus("")
    setJobId("")
    setStatusHistory([])
    lastStatusKeyRef.current = ""

    eventSourceRef.current?.close()
    eventSourceRef.current = null

    try {
      const response = await fetch("/api/investigation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ entityName })
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        const message = body?.error ?? "Failed to run investigation"
        throw new Error(message)
      }

      const data = (await response.json()) as InvestigationStartResponse
      setJobId(data.jobId)
      setStatus("Investigation started")
      setStatusHistory(["Investigation started"])
      lastStatusKeyRef.current = "queue:started"

      const eventSource = new EventSource(
        `http://localhost:3000/investigation/events/${encodeURIComponent(data.jobId)}`
      )
      eventSourceRef.current = eventSource

      eventSource.addEventListener("status", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as StatusEventPayload
        const statusKey = `${payload.stage ?? "unknown"}:${payload.phase ?? "unknown"}`

        if (lastStatusKeyRef.current === statusKey) {
          return
        }

        lastStatusKeyRef.current = statusKey

        const message = payload.progressMessage?.trim() || stageLabel(payload.stage, payload.phase)

        setStatus(message)
        setStatusHistory((previous) => [...previous, message])
      })

      eventSource.addEventListener("complete", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as InvestigationResponse
        if (lastStatusKeyRef.current !== "terminal:complete") {
          lastStatusKeyRef.current = "terminal:complete"
          setStatusHistory((previous) => [...previous, "Completed"])
        }
        setResult(payload)
        setStatus("Completed")
        setLoading(false)
        eventSource.close()
        eventSourceRef.current = null
      })

      eventSource.addEventListener("failed", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as {
          reason?: string
        }
        if (lastStatusKeyRef.current !== "terminal:failed") {
          lastStatusKeyRef.current = "terminal:failed"
          setStatusHistory((previous) => [...previous, "Failed"])
        }
        setStatus("Failed")
        setError(payload.reason ?? "Investigation failed")
        setLoading(false)
        eventSource.close()
        eventSourceRef.current = null
      })

      eventSource.onerror = () => {
        setError("Progress stream disconnected")
        setLoading(false)
        eventSource.close()
        eventSourceRef.current = null
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error")
      setLoading(false)
    }
  }

  const analysis = result?.analysis ?? result?.report?.summary ?? ""
  const analysisSummary = result?.analysisSummary ?? analysis
  const riskLevel = result?.riskLevel ?? result?.report?.riskLevel ?? ""
  const rawEvidence = result?.evidence ?? result?.report?.evidence ?? []
  const evidence: EvidenceItem[] = Array.isArray(rawEvidence)
    ? rawEvidence
    : rawEvidence && typeof rawEvidence === "object" && "title" in rawEvidence && "url" in rawEvidence
      ? [rawEvidence as EvidenceItem]
      : []
  const investigationTimeMs = result?.investigationTimeMs
  const searchTimeMinutes =
    result?.searchTimeMinutes ?? Number(((investigationTimeMs ?? 0) / 60000).toFixed(2))

  const minimalEvidenceWarning =
    result?.minimalEvidenceWarning ??
    (evidence.length <= 1 &&
      evidence.some((item) => item.title.toLowerCase().startsWith("search results for")))

  return (
    <main style={{ maxWidth: 820, margin: "40px auto", fontFamily: "Arial, sans-serif" }}>
      <h1>AI Compliance Investigator</h1>

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          type="text"
          value={entityName}
          onChange={(event) => setEntityName(event.target.value)}
          placeholder="Enter entity name"
          style={{ flex: 1, padding: 10 }}
          required
        />
        <button type="submit" disabled={loading || !entityName.trim()} style={{ padding: "10px 16px" }}>
          {loading ? "Investigating..." : "Start Investigation"}
        </button>
      </form>

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      {status ? (
        <div>
          <p>
            <strong>Current Status:</strong> {status}
            {jobId ? ` (Job ${jobId})` : ""}
          </p>
          {statusHistory.length ? (
            <ul>
              {statusHistory.map((entry, index) => (
                <li key={`${entry}-${index}`}>{entry}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <section style={{ border: "1px solid #ddd", padding: 16, borderRadius: 8 }}>
          <h2>Result</h2>
          <p>
            <strong>Investigation Time:</strong> {investigationTimeMs ?? "N/A"} ms
          </p>
          {minimalEvidenceWarning ? (
            <p style={{ color: "#b26a00" }}>
              Warning: Evidence is minimal (fallback search result). Risk classification confidence may be lower.
            </p>
          ) : null}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 4px" }}>Risk Level</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 4px" }}>LLM Analysis Summary</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 4px" }}>Title</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 4px" }}>URL</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "8px 4px" }}>Search Time (minutes)</th>
              </tr>
            </thead>
            <tbody>
              {evidence.length ? (
                evidence.map((item) => (
                  <tr key={item.url}>
                    <td style={{ padding: "8px 4px", borderBottom: "1px solid #f0f0f0" }}>{riskLevel || "N/A"}</td>
                    <td style={{ padding: "8px 4px", borderBottom: "1px solid #f0f0f0" }}>{analysisSummary || "N/A"}</td>
                    <td style={{ padding: "8px 4px", borderBottom: "1px solid #f0f0f0" }}>{item.title}</td>
                    <td style={{ padding: "8px 4px", borderBottom: "1px solid #f0f0f0" }}>
                      <a href={item.url} target="_blank" rel="noopener noreferrer">
                        {item.url}
                      </a>
                    </td>
                    <td style={{ padding: "8px 4px", borderBottom: "1px solid #f0f0f0" }}>
                      {Number.isFinite(searchTimeMinutes) ? `${searchTimeMinutes} min` : "N/A"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td style={{ padding: "8px 4px", borderBottom: "1px solid #f0f0f0" }}>{riskLevel || "N/A"}</td>
                  <td style={{ padding: "8px 4px", borderBottom: "1px solid #f0f0f0" }}>{analysisSummary || "N/A"}</td>
                  <td style={{ padding: "8px 4px", borderBottom: "1px solid #f0f0f0" }}>N/A</td>
                  <td style={{ padding: "8px 4px", borderBottom: "1px solid #f0f0f0" }}>N/A</td>
                  <td style={{ padding: "8px 4px", borderBottom: "1px solid #f0f0f0" }}>
                    {Number.isFinite(searchTimeMinutes) ? `${searchTimeMinutes} min` : "N/A"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  )
}
