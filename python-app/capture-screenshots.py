"""
Screenshot automation for Børnebog Generator API.
Captures the FastAPI Swagger UI docs page.
Requires: playwright (pip install playwright && playwright install chromium)
"""

import asyncio
import os
from pathlib import Path
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8000")
OUT_DIR = Path("screenshots")
OUT_DIR.mkdir(exist_ok=True)


async def capture():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page(viewport={"width": 1280, "height": 800})

        # 1. Swagger UI docs
        await page.goto(f"{BASE_URL}/docs", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=OUT_DIR / "01_api_docs.png", full_page=True)
        print(f"  Saved {OUT_DIR / '01_api_docs.png'}")

        # 2. ReDoc documentation
        await page.goto(f"{BASE_URL}/redoc", wait_until="networkidle")
        await page.wait_for_timeout(1000)
        await page.screenshot(path=OUT_DIR / "02_api_redoc.png", full_page=True)
        print(f"  Saved {OUT_DIR / '02_api_redoc.png'}")

        await browser.close()
    print("Screenshots complete.")


if __name__ == "__main__":
    asyncio.run(capture())
