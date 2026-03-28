import asyncio
import aiohttp
import re
import sys
import json
from playwright.async_api import async_playwright

LOG_FILE = 'debug_log.txt'
RESULTS_FILE = 'debug_results.json'

URLS_TO_TEST = [
    "http://www.zettatechnologies.com",
    "https://www.knewtontech.com",
    "https://stechdigitalsolutions.com",
    "http://www.vindhya-infomedia.com",
    "http://www.wefixtechnologies.com",
    "https://gpsoftwaresolutions.com"
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
}

def extract_emails(text):
    if not text: return []
    # Simplified for debug
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    matches = re.findall(email_pattern, text)
    unique = set()
    for m in matches:
        if len(m) < 50 and 'example.com' not in m:
             unique.add(m.lower())
    return list(unique)

async def scrape_aiohttp(session, url):
    try:
        async with session.get(url, headers=HEADERS, timeout=15, ssl=False) as response:
            text = await response.text()
            emails = extract_emails(text)
            return {"status": response.status, "emails": emails, "len": len(text)}
    except Exception as e:
        return {"error": str(e)}

async def scrape_playwright(browser, url):
    try:
        page = await browser.new_page()
        await page.goto(url, timeout=30000)
        content = await page.content()
        emails = extract_emails(content)
        await page.close()
        return {"emails": emails, "len": len(content)}
    except Exception as e:
        return {"error": str(e)}

async def main():
    results = {}
    
    # 1. Test aiohttp
    print("Testing aiohttp...")
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=False)) as session:
        for url in URLS_TO_TEST:
            print(f"  Fetching {url}...")
            results[url] = {"aiohttp": await scrape_aiohttp(session, url)}
            
    # 2. Test Playwright
    print("Testing Playwright...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for url in URLS_TO_TEST:
            print(f"  Browsing {url}...")
            results[url]["playwright"] = await scrape_playwright(browser, url)
        await browser.close()
        
    with open(RESULTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)
    print(f"Results saved to {RESULTS_FILE}")

if __name__ == "__main__":
    try:
        # Windows default loop policy usually works fine for modern python/asyncio
        # but avoiding WindowsSelectorEventLoopPolicy explicitly if it was set
        asyncio.run(main())
    except Exception as e:
        with open(RESULTS_FILE, 'w') as f:
             f.write(json.dumps({"fatal": str(e)}))
        print(f"Fatal error: {e}")
