import axios from "axios"
import { selectModel } from "../models/modelRouter"

export async function callOllama(prompt: string) {
  const model = selectModel(prompt)
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"

  const response = await axios.post(`${ollamaBaseUrl}/api/generate`, {
    model,
    prompt: prompt,
    stream: false
  })

  return response.data.response
}
