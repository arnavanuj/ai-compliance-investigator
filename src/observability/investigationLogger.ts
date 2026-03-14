import fs from "fs"
import path from "path"

const logFile = path.join(process.cwd(), "investigation-audit.log")

export function logInvestigation(event: any) {

  const record = {
    timestamp: new Date().toISOString(),
    ...event
  }

  fs.appendFileSync(logFile, JSON.stringify(record) + "\n")

}