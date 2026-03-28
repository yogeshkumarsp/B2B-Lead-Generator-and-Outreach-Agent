
import asyncio
from playwright.async_api import async_playwright
import re

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        url = "https://www.google.com/maps/place/the+auralis,+digital+marketing/data=!4m7!3m6!1s0x3ba4b72782977457:0x5e08c48477dc1138!8m2!3d13.0483!4d80.2524!16s%2Fg%2F11vsw0_x6x!19sChIJV3SXgnS3pDsROBHcd4TECF4?authuser=0&hl=en&rclk=1"
        print(f"Navigating to: {url}")
        await page.goto(url, wait_until='networkidle')
        
        print(f"Current URL after redirect: {page.url}")
        
        # Try to find coords in the page source
        html = await page.content()
        # Look for [13.0483, 80.2524] style coordinates in the static script blocks
        # 13.0483 is Chennai lat
        matches = re.findall(r'\[(-?\d+\.\d+),(-?\d+\.\d+)\]', html)
        print(f"Possible coordinate pairs found in HTML: {len(matches)}")
        for m in matches[:20]:
            if "13.0" in m[0] or "80.2" in m[1]:
                print(f"MATCH: {m}")

        # Check for any "Chennai" or "Tamil Nadu" in the sidebar
        sidebar = await page.locator('div[role="main"]').inner_text()
        print(f"Sidebar text snippet: {sidebar[:200]}...")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
