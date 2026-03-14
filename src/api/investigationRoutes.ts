import { FastifyInstance } from "fastify"
import Redis from "ioredis"
import { z } from "zod"
import { InvestigationService } from "../services/investigationService"
import { InvestigationRequestSchema } from "./schemas"
import { investigationQueue } from "../queue/investigationQueue"
import { redisConnection } from "../config/redis"

const investigationService = new InvestigationService()

type InvestigationChannelEvent =
  | {
      type: "status"
      stage: "queue" | "search" | "analysis" | "report"
      phase: "started" | "completed" | "failed"
      timestamp: number
      progressMessage: string
      jobId: string
      stageTimeMs?: number
      evidenceCount?: number
    }
  | {
      type: "complete"
      jobId: string
      timestamp: number
      result: unknown
    }
  | {
      type: "failed"
      jobId: string
      stage: "queue" | "search" | "analysis" | "report"
      timestamp: number
      error: string
    }

function stateKey(jobId: string): string {
  return `investigation:state:${jobId}`
}

export async function investigationRoutes(server: FastifyInstance) {
  server.post("/investigation", async (request, reply) => {
    const schema = z.object({
      entityName: z.string().min(2)
    })

    const parsed = schema.safeParse(request.body)

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.issues
      })
    }

    const job = await investigationQueue.add(
      "investigation-job",
      {
        entityName: parsed.data.entityName
      },
      {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 2000
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    )

    return {
      jobId: String(job.id),
      status: "queued"
    }
  })

  server.get("/investigation/events/:jobId", async (request, reply) => {
    const paramsSchema = z.object({
      jobId: z.string().min(1)
    })

    const parsedParams = paramsSchema.safeParse(request.params)

    if (!parsedParams.success) {
      return reply.status(400).send({
        error: "Invalid job id"
      })
    }

    const { jobId } = parsedParams.data
    const channel = `investigation:${jobId}`

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    })

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`)
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const subscriber = new Redis(redisConnection)
    const redis = new Redis(redisConnection)

    const heartbeat = setInterval(() => {
      reply.raw.write(": keepalive\n\n")
    }, 15000)

    const cleanup = async () => {
      clearInterval(heartbeat)
      subscriber.removeListener("message", handleMessage)
      await subscriber.unsubscribe(channel).catch(() => undefined)
      await subscriber.quit().catch(() => undefined)
      await redis.quit().catch(() => undefined)
      if (!reply.raw.writableEnded) {
        reply.raw.end()
      }
    }

    const handleMessage = async (_channel: string, message: string) => {
      let parsedMessage: InvestigationChannelEvent

      try {
        parsedMessage = JSON.parse(message) as InvestigationChannelEvent
      } catch {
        return
      }

      if (parsedMessage.type === "status") {
        sendEvent("status", parsedMessage)
        return
      }

      if (parsedMessage.type === "complete") {
        sendEvent("complete", parsedMessage.result)
        await cleanup()
        return
      }

      if (parsedMessage.type === "failed") {
        sendEvent("failed", {
          phase: "failed",
          stage: parsedMessage.stage,
          reason: parsedMessage.error,
          timestamp: parsedMessage.timestamp,
          jobId: parsedMessage.jobId
        })
        await cleanup()
      }
    }

    subscriber.on("message", handleMessage)
    await subscriber.subscribe(channel)

    const state = await redis.hgetall(stateKey(jobId))
    if (state.latestEvent) {
      try {
        const latest = JSON.parse(state.latestEvent)
        sendEvent("status", latest)
      } catch {
        sendEvent("status", {
          stage: "queue",
          phase: "started",
          timestamp: Date.now(),
          progressMessage: "Investigation started",
          jobId
        })
      }
    } else {
      sendEvent("status", {
        stage: "queue",
        phase: "started",
        timestamp: Date.now(),
        progressMessage: "Investigation started",
        jobId
      })
    }

    if (state.finalStatus === "complete" && state.finalResult) {
      try {
        const result = JSON.parse(state.finalResult)
        sendEvent("complete", result)
      } finally {
        await cleanup()
      }
      return
    }

    if (state.finalStatus === "failed") {
      sendEvent("failed", {
        phase: "failed",
        reason: state.error ?? "Investigation failed",
        stage: state.lastStage ?? "report",
        timestamp: Number(state.updatedAt ?? Date.now()),
        jobId
      })
      await cleanup()
      return
    }

    request.raw.on("close", () => {
      cleanup().catch(() => undefined)
    })
  })

  server.post("/investigations", async (request, reply) => {

    const parsed = InvestigationRequestSchema.safeParse(request.body)

    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request",
        details: parsed.error.issues
      })
    }

    const investigation = await investigationService.createInvestigation(parsed.data)

    return {
      investigationId: investigation.id,
      status: investigation.status
    }

  })

}