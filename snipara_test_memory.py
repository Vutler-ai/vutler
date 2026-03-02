import os
import asyncio
from snipara import Snipara

SNIPARA_API_KEY = "rlm_414925a28352a923c62d56e29d0334808f2fad876aef6623d9c6e8d40d0ffaff"
SNIPARA_TEAM_MCP_URL = "https://api.snipara.com/mcp/team/alopez-nevicom-1769121450132"
SNIPARA_PROJECT_SLUG = "vutler"

async def main():
    print(f"Connecting to Snipara Team MCP: {SNIPARA_TEAM_MCP_URL} with project slug: {SNIPARA_PROJECT_SLUG}")
    async with Snipara(api_key=SNIPARA_API_KEY, api_url=SNIPARA_TEAM_MCP_URL, project_slug=SNIPARA_PROJECT_SLUG) as s:
        print("Attempting rlm_context_query...")
        result = await s.query(
            query="How does authentication work for our agents?",
            max_tokens=4000
        )
        print("Query Result:")
        print(result)

if __name__ == "__main__":
    asyncio.run(main())
