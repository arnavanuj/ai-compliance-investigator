const TOKEN_THRESHOLD = 1000
const CHARS_PER_TOKEN_ESTIMATE = 4

function estimateTokens(prompt: string): number {
  return Math.ceil(prompt.length / CHARS_PER_TOKEN_ESTIMATE)
}

export function selectModel(prompt: string): string {
  const estimatedTokens = estimateTokens(prompt)
  return estimatedTokens < TOKEN_THRESHOLD ? "mistral" : "llama3"
}
