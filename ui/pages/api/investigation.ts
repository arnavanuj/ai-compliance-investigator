import type { NextApiRequest, NextApiResponse } from "next"

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const upstream = await fetch("http://localhost:3000/investigation", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body ?? {})
    })

    const payload = await upstream.json().catch(() => ({}))
    return res.status(upstream.status).json(payload)
  } catch {
    return res.status(500).json({ error: "Unable to reach backend API" })
  }
}
