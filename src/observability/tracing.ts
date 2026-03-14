import { NodeSDK } from "@opentelemetry/sdk-node"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"

const traceExporter = new OTLPTraceExporter()

export const otelSDK = new NodeSDK({
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()]
})

export async function startTracing() {
  await otelSDK.start()
  console.log("OpenTelemetry tracing started")
}