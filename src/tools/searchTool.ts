import { search, SafeSearchType } from "duck-duck-scrape"

export type SearchResult = {
  title: string
  link: string
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function searchTool(query: string): Promise<SearchResult[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await delay(1500)

      const results = await search(`${query} investigation news`, {
        safeSearch: SafeSearchType.MODERATE,
        locale: "en-us"
      })

      return results.results.slice(0, 5).map((r) => ({
        title: r.title,
        link: r.url
      }))
    } catch (error) {
      if (attempt === 3) {
        return [
          {
            title: `Search results for ${query}`,
            link: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
          }
        ]
      }

      await delay(attempt * 2000)
    }
  }

  return []
}
