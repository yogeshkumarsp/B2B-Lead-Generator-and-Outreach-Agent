import sys
import json
import time
import re
import asyncio
import aiohttp
import os
import html as html_lib
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("Warning: google-generativeai not installed. AI fallback disabled.", file=sys.stderr)

# Global lock for AI calls to prevent 429 storms from concurrent workers
ai_call_lock = asyncio.Lock()
last_ai_call_time = 0
MIN_AI_DELAY = 2.0 # 2 seconds between AI calls

# Headers to mimic a real browser
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
}

def clean_business_name(name):
    """Clean business name by removing descriptive tags and separators."""
    if not name:
        return ""
    
    # Common separators used for keyword stuffing in GMB names
    separators = [
        ' | ', ' - ', ' – ', ' : ', ' — ', ' • ', 
        '|', ' – ', ' — ', ' : '
    ]
    
    cleaned = name
    for sep in separators:
        if sep in cleaned:
            parts = cleaned.split(sep)
            # Take the first part as it's usually the brand name
            potential = parts[0].strip()
            # Safety check: if first part is too short (e.g. "A"), we might have over-clipped
            if len(potential) > 2:
                cleaned = potential
                break
    
    # Remove common descriptive phrase suffixes if they are clearly tags
    descriptive_keywords = [
        'digital marketing', 'website designing', 'web design', 
        'software company', 'it services', 'consultancy', 
        'seo agency', 'social media', 'agency', 'company'
    ]
    
    lower_name = cleaned.lower()
    for phrase in descriptive_keywords:
        # If the phrase is present and not at the very beginning
        idx = lower_name.find(phrase)
        if idx > 3: # Keep the brand if it's before the keyword
            cleaned = cleaned[:idx].strip()
            # Clean up trailing punctuation after clipping
            cleaned = re.sub(r'[\s\-\|\:\.\,\/\–\—\•]+$', '', cleaned)
    
    # Final trim
    return cleaned.strip()

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate the great circle distance in kilometers between two points."""
    import math
    R = 6371.0  # Radius of the earth in km
    
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) * math.sin(dlat / 2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dlon / 2) * math.sin(dlon / 2)
    c = 2 * math.asin(math.sqrt(a))
    distance = R * c
    return distance

def is_expired_or_parked(html, url=""):
    """Check if the HTML content indicates an expired or parked domain"""
    if not html:
        return False
        
    # Standardize for checking
    html_lower = html.lower()
    
    # Common expiration/parking keywords
    expired_keywords = [
        "domain is expired",
        "domain has expired",
        "renew your domain",
        "renew the domain to activate",
        "website content is unavailable due to the fact that domain has expired",
        "this domain is parked",
        "parked free, courtesy of",
        "buy this domain",
        "domain is for sale",
        "domain registration is pending",
        "suspended for non-payment",
        "account suspended",
        "cgi-sys/suspendedpage.cgi",
        "parking-page",
    ]
    
    # Check for keywords
    for keyword in expired_keywords:
        if keyword in html_lower:
            return True
            
    # Check for common parking provider signatures
    parking_signatures = [
        "sedo.com/search/details.php",
        "parking.godaddy.com",
        "hugeDomains.com",
        "dan.com",
        "squadhelp.com",
        "afternic.com/domain/",
        "hostinger-page.png", # Hostinger parking page image
    ]
    
    for sig in parking_signatures:
        if sig.lower() in html_lower:
            return True
            
    return False

async def fetch_html(session, url):
    """Fetch HTML content from a URL using aiohttp"""
    # print(f"Fetching: {url}", file=sys.stderr)
    try:
        async with session.get(url, headers=HEADERS, timeout=15, ssl=False) as response:
            if response.status == 200:
                html = await response.text()
                if is_expired_or_parked(html, url):
                    print(f"Skipping expired/parked domain: {url}", file=sys.stderr)
                    return "EXPIRED"
                return html
            # print(f"Response status: {response.status} for {url}", file=sys.stderr)
            return None
    except Exception as e:
        # print(f"Error fetching {url}: {e}", file=sys.stderr)
        return None

def cf_decode_email(encoded_string):
    """Decode Cloudflare obfuscated email addresses"""
    try:
        r = int(encoded_string[:2], 16)
        email = ''.join([chr(int(encoded_string[i:i+2], 16) ^ r) for i in range(2, len(encoded_string), 2)])
        return email
    except:
        return None

def clean_email(email):
    """Clean common garbage prefixes and suffixes from extracted emails"""
    if not email or '@' not in email:
        return None
    
    email = email.lower().strip()
    
    # Handle common [at] (at) obfuscation before cleaning
    email = email.replace('[at]', '@').replace('(at)', '@').replace('[dot]', '.').replace('(dot)', '.')
    
    # Remove common garbage prefixes (like \u003e from JSON/scripts or lingering mailto:)
    garbage_prefixes = ['u003e', 'u003ae', 'u003c', 'mailto:']
    for prefix in garbage_prefixes:
        if email.startswith(prefix):
            email = email[len(prefix):]
            
    # Remove fragments/queries
    email = email.split('?')[0].split('#')[0]
    
    # Basic validation - increased limit for modern long domains
    if len(email) < 5 or len(email) > 100:
        return None
        
    return email

def extract_emails_from_html(html, soup=None):
    """Enhanced email extraction with mailto links and schema.org support"""
    if not html or html == "EXPIRED":
        return set()
    
    if not soup:
        soup = BeautifulSoup(html, 'html.parser')
    
    valid_emails = set()
    
    # Method 1: Extract from mailto: links (most reliable)
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.startswith('mailto:'):
            email = clean_email(href.replace('mailto:', ''))
            if email:
                valid_emails.add(email)
    
    # Method 2: Check for Cloudflare obfuscated emails
    for el in soup.select('.__cf_email__'):
        encoded = el.get('data-cfemail')
        if encoded:
            decoded = cf_decode_email(encoded)
            cleaned = clean_email(decoded)
            if cleaned:
                valid_emails.add(cleaned)
    
    # Method 3: Check schema.org JSON-LD
    for script in soup.find_all('script', type='application/ld+json'):
        try:
            data = json.loads(script.string)
            if isinstance(data, dict):
                def find_emails(d):
                    if isinstance(d, dict):
                        for k, v in d.items():
                            if k == 'email' and isinstance(v, str):
                                cleaned = clean_email(v)
                                if cleaned: valid_emails.add(cleaned)
                            else:
                                find_emails(v)
                    elif isinstance(d, list):
                        for item in d:
                            find_emails(item)
                find_emails(data)
        except:
            pass
    
    # Method 4: Regex extraction from text
    # We check both the raw HTML (decoded) and the rendered text from soup
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    
    # Search in decoded HTML to handle entities like &#64;
    decoded_html = html_lib.unescape(html)
    matches = re.findall(email_pattern, decoded_html)
    
    # Also search in soup text which decodes many things automatically
    if soup:
        text_content = soup.get_text(separator=' ')
        matches.extend(re.findall(email_pattern, text_content))
    
    for email in matches:
        cleaned = clean_email(email)
        if not cleaned:
            continue
            
        # Filter out common junk/placeholder domains
        invalid_domains = ['example.com', 'domain.com', 'email.com', 'yoursite.com', 
                           'test.com', 'company.com', 'wixpress.com', 'sentry.io',
                           'wordpress.com']
        
        domain = cleaned.split('@')[-1] if '@' in cleaned else cleaned
        if any(domain == d or domain.endswith('.' + d) for d in invalid_domains):
            continue
            
        # Filter out image extensions
        invalid_extensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'css', 'js']
        extension = cleaned.split('.')[-1]
        if extension in invalid_extensions:
            continue
            
        valid_emails.add(cleaned)
    
    return valid_emails

def extract_phone_from_html(html, soup=None):
    """Extract phone numbers from HTML with tel: links"""
    if not html:
        return None
    
    if not soup:
        soup = BeautifulSoup(html, 'html.parser')
    
    # Method 1: Extract from tel: links (most reliable)
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.startswith('tel:'):
            phone = href.replace('tel:', '').strip()
            # Clean and return first valid phone
            digits = re.sub(r'\D', '', phone)
            if len(digits) >= 10:
                return digits[-10:]  # Return last 10 digits
    
    return None

async def extract_with_ai(html, business_name, website_url):
    """Use Gemini AI to extract email and phone from HTML"""
    if not GEMINI_AVAILABLE:
        return None, None
    
    try:
        # Configure Gemini
        keys_str = os.getenv('GEMINI_API_KEYS') or os.getenv('GEMINI_API_KEY')
        if not keys_str:
            return None, None
            
        keys = [k.strip() for k in keys_str.split(',') if k.strip()]
        if not keys:
            return None, None
        
        # Truncate HTML to save tokens (first 8000 chars usually enough)
        html_snippet = html[:8000] if html else ""
        
        prompt = f"""Extract the contact email and phone number for "{business_name}" from this website HTML.

Website: {website_url}

Return ONLY in this exact format:
EMAIL: email@example.com
PHONE: +919876543210

If not found, return:
EMAIL: none
PHONE: none

HTML:
{html_snippet}
"""
        
        global last_ai_call_time
        
        async with ai_call_lock:
            # Ensure minimum delay between calls
            now = time.time()
            elapsed = now - last_ai_call_time
            if elapsed < MIN_AI_DELAY:
                await asyncio.sleep(MIN_AI_DELAY - elapsed)
            
            for api_key in keys:
                try:
                    genai.configure(api_key=api_key)
                    # Use gemini-1.5-flash/2.0-flash
                    model = genai.GenerativeModel('gemini-2.0-flash')
                    response = await asyncio.to_thread(model.generate_content, prompt)
                    text = response.text.strip()
                    
                    last_ai_call_time = time.time()
                    
                    # Parse response
                    email, phone = None, None
                    for line in text.split('\n'):
                        if line.startswith('EMAIL:'):
                            email_val = line.replace('EMAIL:', '').strip()
                            if email_val != 'none' and '@' in email_val:
                                email = email_val.lower()
                                print(f"AI found email for {business_name}: {email}", file=sys.stderr)
                        elif line.startswith('PHONE:'):
                            phone_val = line.replace('PHONE:', '').strip()
                            if phone_val != 'none':
                                digits = re.sub(r'\D', '', phone_val)
                                if len(digits) >= 10:
                                    phone = digits[-10:]
                                    print(f"AI found phone for {business_name}: {phone}", file=sys.stderr)
                    
                    return email, phone
                
                except Exception as e:
                    err_msg = str(e)
                    if "429" in err_msg or "Quota" in err_msg or "403" in err_msg or "Permission denied" in err_msg:
                        print(f"AI extraction key failed for {business_name}, switching to next key...", file=sys.stderr)
                        last_ai_call_time = time.time() # Still update time to prevent immediate retry burst
                        await asyncio.sleep(1) # Small gap between key rotations
                        continue  # Try the next key in the list
                    else:
                        print(f"AI extraction error for {business_name}: {err_msg[:200]}...", file=sys.stderr)
                        return None, None
        
        print(f"All API keys exhausted or suspended for {business_name}", file=sys.stderr)
        return None, None
        
    except Exception as e:
        print(f"Fatal AI extraction error for {business_name}: {str(e)[:200]}...", file=sys.stderr)
        return None, None

async def scrape_email(session, context, website_url, business_name="", keyword=""):
    """Hybrid email extraction: Regex → AI → Playwright search"""
    if not website_url:
        return None
    
    # Ensure URL has protocol
    if not website_url.startswith('http'):
        website_url = 'https://' + website_url

    # STEP 1: Try improved regex patterns (fast, ~0.1s)
    try:
        html = await fetch_html(session, website_url)
        if html and html != "EXPIRED":
            # Filter unwanted WhatsApp API providers if not in keyword
            if keyword:
                wa_terms = ["whatsapp", "bulk sms", "aixbot", "whatsapp business api", "whatsapp automation"]
                is_wa_search = any(term in keyword.lower() for term in wa_terms)
                if not is_wa_search:
                    html_lower = html.lower()
                    title_match = re.search(r'<title[^>]*>(.*?)</title>', html_lower, re.IGNORECASE | re.DOTALL)
                    if title_match:
                        title_text = title_match.group(1)
                        if any(term in title_text for term in wa_terms):
                            print(f"Discarding whatsapp/SMS provider based on title: {website_url}", file=sys.stderr)
                            return "REJECT_UNWANTED"
                    
                    if html_lower.count("whatsapp business api") > 1 or html_lower.count("bulk sms") > 1 or "aixbot" in html_lower:
                        print(f"Discarding whatsapp/SMS provider based on content: {website_url}", file=sys.stderr)
                        return "REJECT_UNWANTED"

            soup = BeautifulSoup(html, 'html.parser')
            
            email_set = extract_emails_from_html(html, soup)
            
            # SPA Fallback: If no email found and page looks like a React/Vite app
            if not email_set:
                is_spa = any(term in html.lower() for term in ['id="root"', 'id="app"', 'index-', '.js', '/assets/'])
                if is_spa or len(html) < 3500:
                    print(f"SPA detected for {business_name}, trying Playwright fallback...", file=sys.stderr)
                    try:
                        page = await context.new_page()
                        # Use shorter timeout and wait for network idle to allow SPA to render
                        await page.goto(website_url, timeout=15000, wait_until='networkidle')
                        rendered_html = await page.content()
                        email_set = extract_emails_from_html(rendered_html)
                        await page.close()
                        if email_set:
                            email = list(email_set)[0]
                            print(f"Playwright found email for SPA {business_name}: {email}", file=sys.stderr)
                            return email
                    except Exception as e:
                        # print(f"Playwright SPA fallback failed for {business_name}: {e}", file=sys.stderr)
                        pass

            if email_set:
                email = list(email_set)[0]
                print(f"Regex found email on homepage for {business_name}: {email}", file=sys.stderr)
                return email
            
            # Deep search: Check contact/about pages
            links_to_check = []
            print(f"Deep searching contact pages for {business_name}...", file=sys.stderr)
            keywords = ['contact', 'about', 'team', 'impressum', 'reach', 'info', 'support', 'touch']
            
            # Also try common direct paths (Option: fast check)
            common_paths = ['/contact', '/contact-us', '/about-us', '/about']
            for path in common_paths:
                links_to_check.append(website_url.rstrip('/') + path)
            
            for a in soup.find_all('a', href=True):
                href = a['href']
                href_lower = href.lower()
                
                if any(k in href_lower for k in keywords):
                    full_url = None
                    if href.startswith('http'):
                        full_url = href
                    elif not href.startswith(('mailto:', 'tel:', 'javascript:')):
                        full_url = website_url.rstrip('/') + '/' + href.lstrip('/')
                    
                    if full_url and full_url not in links_to_check:
                         links_to_check.append(full_url)

            # Prioritize 'contact' pages and remove duplicates
            links_to_check = list(dict.fromkeys(links_to_check)) # Preserves order
            links_to_check.sort(key=lambda x: 'contact' not in x.lower())
            links_to_check = links_to_check[:5] # Increase to 5 for better coverage
            
            for link in links_to_check:
                sub_html = await fetch_html(session, link)
                if sub_html and sub_html != "EXPIRED":
                    # Check if sub-page also looks like a shell
                    if len(sub_html) < 2000 and any(term in sub_html.lower() for term in ['id="root"', 'id="app"']):
                        try:
                            page = await context.new_page()
                            await page.goto(link, timeout=12000, wait_until='networkidle')
                            sub_html = await page.content()
                            await page.close()
                        except: pass

                    emails = extract_emails_from_html(sub_html)
                    if emails:
                        return list(emails)[0]
            
            # STEP 2: If no email found, try AI extraction (~0.5s)
            if GEMINI_AVAILABLE and business_name:
                # Use rendered_html if it was fetched during SPA fallback
                safe_html = locals().get('rendered_html') or html
                ai_email, _ = await extract_with_ai(safe_html, business_name, website_url)
                if ai_email:
                    return ai_email
        elif html == "EXPIRED":
            return "REJECT_EXPIRED"
    except Exception:
        pass

    return None


async def scrape_listing(context, url, center_lat=None, center_lng=None, radius_limit=None, search_location="", keyword=""):
    try:
        page = await context.new_page()
        
        # Block all non-essential resources for maximum speed
        await page.route("**/*", lambda route: route.abort() 
            if route.request.resource_type in ["image", "stylesheet", "font", "media", "other"]
            else route.continue_())

        # Go to URL — balanced timeout for speed vs reliability
        await page.goto(url, timeout=30000, wait_until='domcontentloaded')
        
        # NEW: Check distance after redirect from current page URL
        if center_lat and center_lng and radius_limit:
            current_url = page.url
            # Support both @lat,lng and !3d!4d coordinate patterns
            match = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', current_url) or \
                    re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', current_url)
            
            if match:
                b_lat, b_lng = float(match.group(1)), float(match.group(2))
                dist = haversine_distance(center_lat, center_lng, b_lat, b_lng)
                
                # If distance initially looks out of range, wait 1s for final redirect
                if dist > radius_limit:
                    await page.wait_for_timeout(1000)
                    current_url = page.url
                    match2 = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', current_url) or \
                             re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', current_url)
                    if match2:
                        b_lat, b_lng = float(match2.group(1)), float(match2.group(2))
                        dist = haversine_distance(center_lat, center_lng, b_lat, b_lng)

                if dist > radius_limit:
                    print(f"Discarding result out of {radius_limit}km range: {dist:.1f}km away ({url})", file=sys.stderr)
                    await page.close()
                    return None
        
        try:
            await page.wait_for_selector('h1', timeout=12000)
        except Exception as e:
             # print(f"Failed to load h1 for {url}: {e}", file=sys.stderr)
             await page.close()
             return None

        # Name
        name_el = page.locator('h1').first
        raw_name = await name_el.inner_text()
        name = clean_business_name(raw_name)
        
        # Filter educational institutions if the keyword doesn't request them
        if keyword:
            keyword_lower = keyword.lower()
            name_lower = raw_name.lower()
            edu_terms = ["college", "university", "institute", "school", "academy", "education", "training", "course", "classes", "tuition"]
            
            is_edu_search = any(term in keyword_lower for term in edu_terms)
            is_edu_business = any(term in name_lower for term in edu_terms)
            
            if not is_edu_search and is_edu_business:
                print(f"Discarding educational/training institution: {raw_name}", file=sys.stderr)
                await page.close()
                return None
                
            # Filter huge retail/B2C chains when searching for B2B/agencies/software (false positives for "digital", etc.)
            retail_terms = [
                "reliance digital", "croma", "poorvika", "sangeetha", "supermarket", "grocery", "electronics", 
                "retail", "showroom", "furniture", "clothing", "cctv", "security system", "appliances",
                "home automation", "camera store", "mobile store", "repair shop"
            ]
            b2b_search_terms = ["agency", "agencies", "software", "marketing", "b2b", "it company", "technology", "consulting"]
            
            is_b2b_search = any(term in keyword_lower for term in b2b_search_terms)
            is_retail_search = any(term in keyword_lower for term in retail_terms)
            is_retail_business = any(term in name_lower for term in retail_terms)
            
            if is_b2b_search and not is_retail_search and is_retail_business:
                print(f"Discarding B2C retail/showroom for B2B search: {raw_name}", file=sys.stderr)
                await page.close()
                return None
        
        # Phone
        phone = None
        try:
            phone_btn = page.locator('button[data-item-id*="phone:"]')
            if await phone_btn.count() > 0:
                aria = await phone_btn.first.get_attribute('aria-label')
                if aria:
                     phone = aria.replace("Phone:", "").strip()
                else:
                     # Attempt to find inner text if aria fails
                     phone = await phone_btn.first.locator('.fontBodyMedium').first.inner_text()
                
                # Format phone: remove leading zeros and keep only 10 digits
                if phone:
                    # Remove all non-digit characters
                    digits = re.sub(r'\D', '', phone)
                    # Remove leading zeros
                    digits = digits.lstrip('0')
                    # Keep only 10 digits (Indian phone numbers)
                    if len(digits) >= 10:
                        phone = digits[-10:]
                    else:
                        phone = digits
        except: pass
        
        # Website
        website = None
        try:
            web_btn = page.locator('a[data-item-id="authority"]')
            if await web_btn.count() > 0:
                website = await web_btn.first.get_attribute('href')
        except: pass

        # Address
        address = "Address not found"
        try:
             addr_btn = page.locator('button[data-item-id="address"]')
             if await addr_btn.count() > 0:
                  aria = await addr_btn.first.get_attribute('aria-label')
                  if aria:
                       address = aria.replace("Address:", "").strip()
        except: pass

        # Extra Check: If address mentions a completely different city
        if search_location and address != "Address not found":
            # Word-boundary check: only discard if city is a standalone word (e.g., "Chennai")
            # This avoids false positives for street names like "Bangalore Rd"
            major_cities = ["Chennai", "Bangalore", "Bengaluru", "Mumbai", "Delhi", "Hyderabad"]
            for city in major_cities:
                if re.search(rf"\b{city}\b(?!\s+(?:Rd|Road|Street|Cross|Nagar))", address, re.IGNORECASE):
                    # Check if searching for that city; if not, reject
                    if city.lower() not in search_location.lower():
                        # If city appears after a comma (standard for city name in address), it's definitely that city
                        if "," in address and city.lower() in address.lower().split(",")[-1]:
                           print(f"Discarding result from a different major city: {address}", file=sys.stderr)
                           await page.close()
                           return None
        elif address == "Address not found" and search_location:
            # If address is missing, we MUST be extremely strict with the coordinate-based distance check.
            # We already do this at the start of scrape_listing, but we'll re-verify if possible.
            pass

        # Business Category (e.g. "Software company")
        types = []
        try:
            # This selector often contains the primary category like "Software company" or "CCTV store"
            type_el = page.locator('button[class*="DByne"]').first
            if await type_el.count() > 0:
                biz_type = await type_el.inner_text()
                if biz_type:
                    types.append(biz_type)
        except: pass

        business = {
            "name": name,
            "address": address, 
            "phone": phone,
            "website": website,
            "email": None,  # Will be populated later by email scraper
            "place_id": "scraped_" + name.replace(" ", "_"),
            "types": types
        }
        await page.close()
        return business
        
    except Exception as e:
        return None


async def process_business(session, context, url, center_lat=None, center_lng=None, radius_limit=None, search_location="", keyword=""):
    """Pipeline: Scrape Listing -> Scrape Email"""
    # 1. Scrape Listing (Needs Playwright)
    business = await scrape_listing(context, url, center_lat, center_lng, radius_limit, search_location, keyword)
    if not business:
        return None
        
    # 2. Scrape Email (Try aiohttp first, then Playwright fallback if needed)
    # We pass the same context. Note that scrape_listing closes the page it opens,
    # so we should be fine resource-wise.
    if business.get('website'):
        # print(f"Scraping email for {business['name']} ({business['website']})...", file=sys.stderr)
        email_res = await scrape_email(session, context, business['website'], business['name'], keyword)
        if email_res == "REJECT_EXPIRED":
            print(f"Discarding lead due to expired domain: {business['name']}", file=sys.stderr)
            return None
        if email_res == "REJECT_UNWANTED":
            print(f"Discarding lead due to unwanted niche (WhatsApp/SMS APIs): {business['name']}", file=sys.stderr)
            return None
            
        business['email'] = email_res
        if not email_res:
            # print(f"No email found for: {business['name']} ({business['website']})", file=sys.stderr)
            pass
            
    return business

async def run(keyword, location, radius="60"):
    async with async_playwright() as p:
        # Launch browser with optimization flags (Option 9)
        browser = await p.chromium.launch(
            headless=True,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions'
            ]
        )
        context = await browser.new_context()
        page = await context.new_page()
        
        # 1. Geocode and Search (Timeout 60s for depth)
        print(f"Geocoding location: {location}", file=sys.stderr)
        await page.goto(f"https://www.google.com/maps/search/{location}", timeout=60000, wait_until='domcontentloaded')
        
        try:
            consent_button = page.locator('button[aria-label="Accept all"]', has_text="Accept all")
            if await consent_button.is_visible(timeout=5000):
                 await consent_button.click()
                 await page.wait_for_timeout(500)
        except: pass

        try:
             await page.wait_for_url(lambda url: '@' in url, timeout=10000)
        except:
             print("Could not extract coordinates, falling back", file=sys.stderr)
        
        coords_match = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', page.url)
        search_url = ""
        radius_km = 60
        if coords_match:
            lat = coords_match.group(1)
            lng = coords_match.group(2)
            
            # Map radius to zoom levels
            try:
                radius_int = int(radius)
            except:
                radius_int = 60
                
            # Use wider zoom if radius is 50km or more
            zoom = "10z" if radius_int < 50 else "9z"
            
            # Incorporate location name to bias Google's broad regional search
            search_url = f"https://www.google.com/maps/search/{keyword} {location}/@{lat},{lng},{zoom}"
        else:
            search_url = f"https://www.google.com/maps/search/{keyword} in {location}"

        print(f"Navigating to search URL: {search_url}", file=sys.stderr)
        await page.goto(search_url, timeout=60000, wait_until='domcontentloaded')
        
        # Store center for filtering
        center_lat = float(coords_match.group(1)) if coords_match else None
        center_lng = float(coords_match.group(2)) if coords_match else None
        radius_limit = float(radius)

        try:
            await page.wait_for_selector('div[role="feed"]', timeout=5000)
        except:
            try:
                await page.wait_for_selector('a[href*="/maps/place/"]', timeout=5000)
            except: pass
        
        # Scroll the feed to load more results slightly faster
        try:
            feed = page.locator('div[role="feed"]').first 
            if await feed.count() > 0:
                for _ in range(4): # Increased to load more
                    await feed.evaluate('(node) => node.scrollTop = node.scrollHeight')
                    await page.wait_for_timeout(200) # Reduced from 300ms
        except Exception as e:
            pass
            
        # 2. Collect Result URLs
        links_to_visit = []
        if '/maps/place/' in page.url:
            print("Redirected to single place.", file=sys.stderr)
            links_to_visit.append(page.url)
        else:
            listings_all = await page.locator('a[href*="/maps/place/"]').all()
            
            for listing in listings_all:
                url = await listing.get_attribute('href')
                if not url: continue
                
                # FAST PRE-FILTER: Check distance immediately if coords are in URL
                if center_lat and center_lng:
                    match = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', url) or \
                            re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', url)
                    if match:
                        b_lat, b_lng = float(match.group(1)), float(match.group(2))
                        if haversine_distance(center_lat, center_lng, b_lat, b_lng) > radius_limit:
                            continue
                
                links_to_visit.append(url)
                if len(links_to_visit) >= 15: # Decreased to 15 for faster searches
                    break
        
        print(f"Found {len(links_to_visit)} results within strictly {radius_limit}km. Starting pipelined extraction...", file=sys.stderr)
        
        # 3. Pipelined Extraction
        # Now that we only use aiohttp for website parsing, we can execute all 15 fetches concurrently.
        results = []
        valid_count = 0
        target_valid_leads = 10 # Decreased to 10 for faster searches
        
        # Smoother concurrency for stability
        max_concurrency = 15
        semaphore = asyncio.Semaphore(max_concurrency)

        async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(limit=50, ssl=False)) as session:
            async def worker(url):
                async with semaphore:
                    return await process_business(session, context, url, center_lat, center_lng, radius_limit, location, keyword)

            tasks = [worker(url) for url in links_to_visit]
            
            # Using asyncio.as_completed to process as they finish and exit early when we hit 10
            for coro in asyncio.as_completed(tasks):
                try:
                    res = await coro
                    if res:
                        # Count and append only if it's a "good" lead (has email)
                        if res.get('email') and res['email'] != "REJECT_EXPIRED":
                            results.append(res)
                            valid_count += 1
                            if valid_count >= target_valid_leads:
                                print(f"Found {target_valid_leads} valid leads. Stopping early for speed.", file=sys.stderr)
                                break
                except Exception as e:
                    pass
        
        await browser.close()
        return results

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python maps_scraper.py <keyword> <location>"}))
        sys.exit(1)
        
    keyword = sys.argv[1]
    location = sys.argv[2]
    
    # Run async loop
    try:
        radius = sys.argv[3] if len(sys.argv) > 3 else "60"
        data = asyncio.run(run(keyword, location, radius))
        print(json.dumps(data))
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}))
