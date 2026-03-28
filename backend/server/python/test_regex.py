
import re

def clean_email(email):
    """Clean common garbage prefixes and suffixes from extracted emails"""
    if not email or '@' not in email:
        return None
    
    email = email.lower().strip()
    
    # Remove common garbage prefixes (like \u003e from JSON/scripts or lingering mailto:)
    garbage_prefixes = ['u003e', 'u003ae', 'u003c', 'mailto:']
    for prefix in garbage_prefixes:
        if email.startswith(prefix):
            email = email[len(prefix):]
            
    # Remove fragments/queries
    email = email.split('?')[0].split('#')[0]
    
    # Basic validation
    if len(email) < 5 or len(email) > 50:
        print(f"DEBUG: Discarded due to length ({len(email)}): {email}")
        return None
        
    return email

def extract_emails_from_html(html):
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    matches = re.findall(email_pattern, html)
    valid_emails = set()
    for email in matches:
        cleaned = clean_email(email)
        if cleaned:
            valid_emails.add(cleaned)
    return valid_emails

# Test cases
test_html = """
Contact us at contact@verylongcompanynameprovidingitandsoftwaresolutions.com
Or info@subdomain.anotherdomain.solutions
Or direct.message@company.marketing
Or invalid@company.png
"""

print("Results:", extract_emails_from_html(test_html))
