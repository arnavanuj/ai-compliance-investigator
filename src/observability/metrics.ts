import client from "prom-client"

export const register = new client.Registry()

client.collectDefaultMetrics({
  register
})

export const investigationsTotal = new client.Counter({
  name: "investigations_total",
  help: "Total investigations processed"
})

export const investigationDuration = new client.Histogram({
  name: "investigation_duration_ms",
  help: "Duration of investigation processing",
  buckets: [100, 500, 1000, 2000, 5000]
})

register.registerMetric(investigationsTotal)
register.registerMetric(investigationDuration)