
import asyncio
import aiohttp
import sys
import os
from bs4 import BeautifulSoup

# Import functions from the actual script if possible, or just copy them
# For speed I'll copy the relevant parts
import re

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
}

def clean_email(email):
    if not email or '@' not in email:
        return None
    email = email.lower().strip()
    garbage_prefixes = ['u003e', 'u003ae', 'u003c', 'mailto:']
    for prefix in garbage_prefixes:
        if email.startswith(prefix):
            email = email[len(prefix):]
    email = email.split('?')[0].split('#')[0]
    if len(email) < 5 or len(email) > 50:
        return None
    return email

def extract_emails_from_html(html, soup=None):
    if not html:
        return set()
    if not soup:
        soup = BeautifulSoup(html, 'html.parser')
    valid_emails = set()
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.startswith('mailto:'):
            email = clean_email(href.replace('mailto:', ''))
            if email:
                valid_emails.add(email)
    
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    matches = re.findall(email_pattern, html)
    for email in matches:
        cleaned = clean_email(email)
        if not cleaned: continue
        invalid_domains = ['example.com', 'domain.com', 'email.com', 'yoursite.com', 
                           'test.com', 'company.com', 'wixpress.com', 'sentry.io',
                           'wordpress.com']
        if any(d in cleaned for d in invalid_domains):
            continue
        valid_emails.add(cleaned)
    return valid_emails

async def test_site(url):
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, headers=HEADERS, timeout=15, ssl=False) as response:
                print(f"Status: {response.status}")
                html = await response.text()
                print(f"HTML length: {len(html)}")
                print("HTML content start:")
                print(html[:1000])
                
                # Check for WA terms
                wa_terms = ["whatsapp", "bulk sms", "aixbot", "whatsapp business api", "whatsapp automation"]
                html_lower = html.lower()
                for term in wa_terms:
                    if term in html_lower:
                        print(f"Found WA term: {term}")
                
                emails = extract_emails_from_html(html)
                print(f"Emails found: {emails}")
                
                # Check contact pages
                soup = BeautifulSoup(html, 'html.parser')
                links = []
                for a in soup.find_all('a', href=True):
                    href = a['href']
                    if 'contact' in href.lower():
                        if href.startswith('http'):
                            links.append(href)
                        else:
                            links.append(url.rstrip('/') + '/' + href.lstrip('/'))
                
                print(f"Contact links: {links}")
                for link in links[:2]:
                    async with session.get(link, headers=HEADERS, timeout=15, ssl=False) as resp2:
                        sub_html = await resp2.text()
                        sub_emails = extract_emails_from_html(sub_html)
                        print(f"Emails on {link}: {sub_emails}")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_site("https://stechdigitalsolutions.com/"))
