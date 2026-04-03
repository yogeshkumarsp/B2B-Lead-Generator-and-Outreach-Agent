
import axios from 'axios';
import * as cheerio from 'cheerio';

interface ScrapedData {
    emails: string[];
    socialLinks: string[];
    description?: string;
}

export const scrapeWebsite = async (url: string): Promise<ScrapedData> => {
    if (!url) return { emails: [], socialLinks: [] };

    try {
        // Add protocol if missing
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }

        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const text = $('body').text();
        const html = $('body').html() || '';

        // Extract Emails
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
        const matches = html.match(emailRegex) || [];
        const emails = [...new Set(matches.map(m => m.toLowerCase().replace(/[.,:;!?)\]>]+$/, '').trim()))].filter(e => e.includes('@'));

        // Extract Social Links
        const socialLinks: string[] = [];
        $('a').each((_, element) => {
            const href = $(element).attr('href');
            if (href && (href.includes('linkedin.com') || href.includes('twitter.com') || href.includes('facebook.com') || href.includes('instagram.com'))) {
                socialLinks.push(href);
            }
        });

        // Extract Meta Description
        const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content');

        return {
            emails: emails.slice(0, 3), // Limit to 3 emails
            socialLinks: [...new Set(socialLinks)],
            description
        };

    } catch (error) {
        console.warn(`Error scraping ${url}:`, error instanceof Error ? error.message : String(error));
        return { emails: [], socialLinks: [] };
    }
};
