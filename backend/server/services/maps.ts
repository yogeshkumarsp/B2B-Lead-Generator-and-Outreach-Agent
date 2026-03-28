import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BusinessResult {
    name: string;
    address: string;
    website?: string;
    phone?: string;
    email?: string | null;
    rating?: number;
    place_id: string;
    types: string[];
}

export const searchBusinesses = async (keyword: string, location: string): Promise<BusinessResult[]> => {
    return new Promise((resolve, reject) => {
        const pythonScriptPath = path.join(__dirname, '../python/maps_scraper.py');
        console.log(`[Maps] Spawning scraper: py "${pythonScriptPath}" "${keyword}" "${location}"`);

        // Use 'py' launcher on Windows, fallback to 'python3' or 'python' on others if needed
        // Since we know this environment uses 'py', we'll stick with that for now.
        // In a real production app, we might want more robust python detection.
        const pythonProcess = spawn('py', [pythonScriptPath, keyword, location]);

        let dataString = '';
        let errorString = '';

        pythonProcess.stdout.on('data', (data) => {
            dataString += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            const line = data.toString().trim();
            if (line) console.log(`[Maps Scraper] ${line}`);
            errorString += line;
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`[Maps] Scraper process exited with code ${code}`);
                // Don't reject purely on code != 0 if we have data, but usually it means error
                // For now, let's try to parse whatever we got or return empty
                if (!dataString) {
                    console.error(`[Maps] No data returned from scraper. Stderr: ${errorString}`);
                    return resolve([]);
                }
            }

            try {
                // Find the JSON output in the stdout (scraper only prints JSON at the end)
                // But typically stdout might contain other logs if not careful.
                // Our script only prints JSON at the end, but Playwright might print stuff.
                // We should look for the last line or clean the string.
                // A robust way is to try parsing the whole string, or find the last '{' or '['

                // Let's assume the script prints ONLY valid JSON on a single line or block
                // trimming is good.
                const cleanData = dataString.trim();
                // Find list start
                const jsonStartIndex = cleanData.indexOf('[');
                const jsonEndIndex = cleanData.lastIndexOf(']');

                if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                    const jsonStr = cleanData.substring(jsonStartIndex, jsonEndIndex + 1);
                    const results: BusinessResult[] = JSON.parse(jsonStr);
                    console.log(`[Maps] Scraper returned ${results.length} results.`);
                    resolve(results);
                } else {
                    // Maybe it returned an error object
                    const errStartIndex = cleanData.indexOf('{');
                    const errEndIndex = cleanData.lastIndexOf('}');
                    if (errStartIndex !== -1 && errEndIndex !== -1) {
                        const jsonStr = cleanData.substring(errStartIndex, errEndIndex + 1);
                        const errObj = JSON.parse(jsonStr);
                        console.error('[Maps] Scraper returned error object:', errObj);
                    }
                    console.warn('[Maps] Could not parse scraper output as list of results.');
                    resolve([]);
                }

            } catch (e) {
                console.error('[Maps] Failed to parse scraper output:', e);
                console.error('[Maps] Raw stdout:', dataString);
                resolve([]);
            }
        });

        pythonProcess.on('error', (err) => {
            console.error('[Maps] Failed to start python process:', err);
            resolve([]);
        });
    });
};
