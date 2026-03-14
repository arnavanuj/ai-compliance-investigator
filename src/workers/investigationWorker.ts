import { Worker } from "bullmq"
import Redis from "ioredis"
import { redisConnection } from "../config/redis"
import { startTracing } from "../observability/tracing"
import { analysisQueue, investigationQueue, reportQueue, searchQueue } from "../queue/investigationQueue"
import { searchNode } from "../agents/nodes/searchNode"
import { analysisNode } from "../agents/nodes/analysisNode"
import { reportNode } from "../agents/nodes/reportNode"
import { EvidenceItem, InvestigationState } from "../agents/agentState"

type StageName = "queue" | "search" | "analysis" | "report"
type StagePhase = "started" | "completed" | "failed"

type StageEvent = {
  type: "status"
  stage: StageName
  phase: StagePhase
  timestamp: number
  progressMessage: string
  jobId: string
  stageTimeMs?: number
  evidenceCount?: number
}

type InvestigationStartJob = {
  entityName: string
}

type SearchStageJob = {
  investigationId: string
  entityName: string
}

type AnalysisStageJob = {
  investigationId: string
  entityName: string
  evidence: EvidenceItem[]
}

type ReportStageJob = {
  investigationId: string
  entityName: string
  evidence: EvidenceItem[]
  analysis: string
  riskLevel: "LOW" | "MEDIUM" | "HIGH"
  minimalEvidenceWarning: boolean
}

function stateKey(jobId: string): string {
  return `investigation:state:${jobId}`
}

function channelKey(jobId: string): string {
  return `investigation:${jobId}`
}

async function emitStatusEvent(
  publisher: Redis,
  redis: Redis,
  jobId: string,
  payload: Omit<StageEvent, "type" | "timestamp" | "jobId">
): Promise<void> {
  const event: StageEvent = {
    type: "status",
    timestamp: Date.now(),
    jobId,
    ...payload
  }

  const dedupeField = `emitted:${payload.stage}:${payload.phase}`
  const firstEmission = await redis.hsetnx(stateKey(jobId), dedupeField, String(event.timestamp))
  if (firstEmission === 0) {
    return
  }

  await redis.hset(stateKey(jobId), {
    latestEvent: JSON.stringify(event),
    lastPhase: payload.phase,
    lastStage: payload.stage,
    updatedAt: String(event.timestamp)
  })

  await publisher.publish(channelKey(jobId), JSON.stringify(event))
}

async function emitCompleteEvent(
  publisher: Redis,
  redis: Redis,
  jobId: string,
  result: unknown
): Promise<void> {
  const timestamp = Date.now()
  const firstTerminalEmission = await redis.hsetnx(stateKey(jobId), "terminalEventType", "complete")
  if (firstTerminalEmission === 0) {
    return
  }

  await redis.hset(stateKey(jobId), {
    finalStatus: "complete",
    finalResult: JSON.stringify(result),
    completedAt: String(timestamp),
    updatedAt: String(timestamp)
  })

  await publisher.publish(
    channelKey(jobId),
    JSON.stringify({
      type: "complete",
      jobId,
      timestamp,
      result
    })
  )
}

async function emitFailedEvent(
  publisher: Redis,
  redis: Redis,
  jobId: string,
  stage: StageName,
  errorMessage: string
): Promise<void> {
  const timestamp = Date.now()
  const firstTerminalEmission = await redis.hsetnx(stateKey(jobId), "terminalEventType", "failed")
  if (firstTerminalEmission === 0) {
    return
  }

  await redis.hset(stateKey(jobId), {
    finalStatus: "failed",
    error: errorMessage,
    failedAt: String(timestamp),
    updatedAt: String(timestamp)
  })

  await publisher.publish(
    channelKey(jobId),
    JSON.stringify({
      type: "failed",
      jobId,
      stage,
      timestamp,
      error: errorMessage
    })
  )
}

async function bootstrap() {
  await startTracing()

  const publisher = new Redis(redisConnection)
  const redis = new Redis(redisConnection)

  const kickoffWorker = new Worker<InvestigationStartJob>(
    "investigations",
    async (job) => {
      const investigationId = String(job.id)
      const { entityName } = job.data

      await redis.hset(stateKey(investigationId), {
        investigationId,
        entityName,
        startedAt: String(Date.now()),
        finalStatus: "running"
      })

      await emitStatusEvent(publisher, redis, investigationId, {
        stage: "queue",
        phase: "started",
        progressMessage: "Investigation started"
      })

      await emitStatusEvent(publisher, redis, investigationId, {
        stage: "queue",
        phase: "completed",
        progressMessage: "Investigation queued successfully"
      })

        await searchQueue.add(
          "search-stage",
          {
            investigationId,
            entityName
          },
          {
            jobId: `search-${investigationId}`,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 2000
          },
          removeOnComplete: true,
          removeOnFail: false
        }
      )

      return { investigationId, status: "queued" }
    },
    {
      connection: redisConnection,
      concurrency: 10
    }
  )

  const searchWorker = new Worker<SearchStageJob>(
    "investigation-search",
    async (job) => {
      const { investigationId, entityName } = job.data
      const stageStart = Date.now()

      await emitStatusEvent(publisher, redis, investigationId, {
        stage: "search",
        phase: "started",
        progressMessage: "Searching internet sources..."
      })

      try {
        const searchResult = await searchNode({
          entity: entityName,
          evidence: []
        })
        const evidence = searchResult.evidence ?? []
        const stageTimeMs = Date.now() - stageStart

        await redis.hset(stateKey(investigationId), {
          evidence: JSON.stringify(evidence),
          searchStageTimeMs: String(stageTimeMs)
        })

        await emitStatusEvent(publisher, redis, investigationId, {
          stage: "search",
          phase: "completed",
          progressMessage: "Collecting evidence...",
          stageTimeMs,
          evidenceCount: evidence.length
        })

        await analysisQueue.add(
          "analysis-stage",
          {
            investigationId,
            entityName,
            evidence
          },
          {
            jobId: `analysis-${investigationId}`,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 3000
            },
            removeOnComplete: true,
            removeOnFail: false
          }
        )

        return {
          investigationId,
          evidenceCount: evidence.length,
          stageTimeMs
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Search stage failed"
        await emitStatusEvent(publisher, redis, investigationId, {
          stage: "search",
          phase: "failed",
          progressMessage: message,
          stageTimeMs: Date.now() - stageStart
        })
        await emitFailedEvent(publisher, redis, investigationId, "search", message)
        throw error
      }
    },
    {
      connection: redisConnection,
      concurrency: 3
    }
  )

  const analysisWorker = new Worker<AnalysisStageJob>(
    "investigation-analysis",
    async (job) => {
      const { investigationId, entityName, evidence } = job.data
      const stageStart = Date.now()
      const minimalEvidenceWarning =
        evidence.length <= 1 &&
        evidence.some((item) => item.title.toLowerCase().startsWith("search results for"))

      await emitStatusEvent(publisher, redis, investigationId, {
        stage: "analysis",
        phase: "started",
        progressMessage: "Analyzing evidence with AI...",
        evidenceCount: evidence.length
      })

      try {
        const analysisResult = await analysisNode({
          entity: entityName,
          evidence
        })

        const stageTimeMs = Date.now() - stageStart
        const analysis = analysisResult.analysis ?? ""
        const riskLevel = analysisResult.riskLevel ?? "MEDIUM"
        const filteredEvidence = analysisResult.evidence ?? []

        await redis.hset(stateKey(investigationId), {
          analysis,
          riskLevel
        })

        await emitStatusEvent(publisher, redis, investigationId, {
          stage: "analysis",
          phase: "completed",
          progressMessage: "Analysis completed",
          stageTimeMs,
          evidenceCount: evidence.length
        })

        await reportQueue.add(
          "report-stage",
          {
            investigationId,
            entityName,
            evidence: filteredEvidence,
            analysis,
            riskLevel,
            minimalEvidenceWarning
          },
          {
            jobId: `report-${investigationId}`,
            attempts: 3,
            backoff: {
              type: "exponential",
              delay: 3000
            },
            removeOnComplete: true,
            removeOnFail: false
          }
        )

        return {
          investigationId,
          riskLevel,
          stageTimeMs
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Analysis stage failed"
        await emitStatusEvent(publisher, redis, investigationId, {
          stage: "analysis",
          phase: "failed",
          progressMessage: message,
          stageTimeMs: Date.now() - stageStart,
          evidenceCount: evidence.length
        })
        await emitFailedEvent(publisher, redis, investigationId, "analysis", message)
        throw error
      }
    },
    {
      connection: redisConnection,
      concurrency: 2
    }
  )

  const reportWorker = new Worker<ReportStageJob>(
    "investigation-report",
    async (job) => {
      const { investigationId, entityName, evidence, analysis, riskLevel, minimalEvidenceWarning } = job.data
      const stageStart = Date.now()

      await emitStatusEvent(publisher, redis, investigationId, {
        stage: "report",
        phase: "started",
        progressMessage: "Generating report...",
        evidenceCount: evidence.length
      })

      try {
        const reportState = await reportNode({
          entity: entityName,
          evidence,
          analysis,
          riskLevel
        } as InvestigationState)

        const stageTimeMs = Date.now() - stageStart
        const startedAtRaw = await redis.hget(stateKey(investigationId), "startedAt")
        const startedAt = startedAtRaw ? Number(startedAtRaw) : Date.now()
        const investigationTimeMs = Date.now() - startedAt
        const searchStageTimeMsRaw = await redis.hget(stateKey(investigationId), "searchStageTimeMs")
        const searchStageTimeMs = searchStageTimeMsRaw ? Number(searchStageTimeMsRaw) : 0
        const searchTimeMinutes = Number((searchStageTimeMs / 60000).toFixed(2))
        const analysisSummary = analysis.length > 220 ? `${analysis.slice(0, 217)}...` : analysis

        const result = {
          entity: reportState.entity,
          evidence: reportState.evidence ?? [],
          analysis: reportState.analysis ?? "",
          riskLevel: reportState.riskLevel ?? "MEDIUM",
          report: reportState.report,
          investigationTimeMs,
          searchTimeMinutes,
          analysisSummary,
          minimalEvidenceWarning
        }

        await emitStatusEvent(publisher, redis, investigationId, {
          stage: "report",
          phase: "completed",
          progressMessage: "Report generated successfully",
          stageTimeMs,
          evidenceCount: evidence.length
        })

        await emitCompleteEvent(publisher, redis, investigationId, result)

        console.log("Investigation completed:", entityName)

        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : "Report stage failed"
        await emitStatusEvent(publisher, redis, investigationId, {
          stage: "report",
          phase: "failed",
          progressMessage: message,
          stageTimeMs: Date.now() - stageStart,
          evidenceCount: evidence.length
        })
        await emitFailedEvent(publisher, redis, investigationId, "report", message)
        throw error
      }
    },
    {
      connection: redisConnection,
      concurrency: 4
    }
  )

  kickoffWorker.on("failed", (job, err) => {
    console.error(`Kickoff job ${job?.id} failed`, err)
  })

  searchWorker.on("failed", (job, err) => {
    console.error(`Search job ${job?.id} failed`, err)
  })

  analysisWorker.on("failed", (job, err) => {
    console.error(`Analysis job ${job?.id} failed`, err)
  })

  reportWorker.on("failed", (job, err) => {
    console.error(`Report job ${job?.id} failed`, err)
  })
}

bootstrap()
