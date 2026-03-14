import { Queue } from "bullmq"
import { redisConnection } from "../config/redis"

export const investigationQueue = new Queue("investigations", {
  connection: redisConnection
})

export const searchQueue = new Queue("investigation-search", {
  connection: redisConnection
})

export const analysisQueue = new Queue("investigation-analysis", {
  connection: redisConnection
})

export const reportQueue = new Queue("investigation-report", {
  connection: redisConnection
})
