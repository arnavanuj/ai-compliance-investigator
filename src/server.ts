import Fastify from "fastify"
import { investigationRoutes } from "./api/investigationRoutes"
import { register } from "./observability/metrics"


const server = Fastify({
  logger: true
})

server.get("/health", async () => {
  return { status: "ok" }
})


server.get("/metrics", async (req, reply) => {
  reply.header("Content-Type", register.contentType)
  return register.metrics()
})


server.register(investigationRoutes)

const start = async () => {
  try {
    await server.listen({ port: 3000, host: "0.0.0.0" })
    console.log("Server running on port 3000")
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()