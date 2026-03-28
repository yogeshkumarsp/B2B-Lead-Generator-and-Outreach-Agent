
import asyncio
from playwright.async_api import async_playwright
import re
import sys

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print("Searching for digital marketing agency krishnagiri...")
        # Use a real center coordinate for Krishnagiri
        center_lat, center_lng = 12.5247851, 78.216004
        search_url = f"https://www.google.com/maps/search/digital+marketing+agency+krishnagiri/@{center_lat},{center_lng},10z"
        
        await page.goto(search_url)
        try:
            await page.wait_for_selector('a[href*="/maps/place/"]', timeout=10000)
        except:
            print("No results found.")
            await browser.close()
            return

        listings = await page.locator('a[href*="/maps/place/"]').all()
        print(f"Found {len(listings)} links.")
        for l in listings[:15]:
            url = await l.get_attribute('href')
            if not url: continue
            
            # Extract name/text for context
            text = await l.inner_text()
            name = text.split('\n')[0] if '\n' in text else text
            
            match = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', url)
            has_coords = "YES" if match else "NO"
            
            dist_str = "N/A"
            if match:
                import math
                lat2, lng2 = float(match.group(1)), float(match.group(2))
                # Simple distance check
                dist = math.sqrt((center_lat - lat2)**2 + (center_lng - lng2)**2) * 111 # rough km
                dist_str = f"{dist:.1f}km"

            print(f"- {name[:30]} | Coords: {has_coords} | Dist: {dist_str} | URL: {url[:60]}...")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
