import { randomUUID } from "crypto"
import { Investigation, InvestigationRequest } from "../models/investigation"
import { investigationQueue } from "../queue/investigationQueue"

export class InvestigationService {

  async createInvestigation(data: InvestigationRequest): Promise<Investigation> {

    const investigation: Investigation = {
      id: randomUUID(),
      entityName: data.entityName,
      entityType: data.entityType,
      jurisdiction: data.jurisdiction,
      status: "queued",
      createdAt: new Date().toISOString()
    }

    await investigationQueue.add("investigation-job", investigation)

    return investigation
  }

}