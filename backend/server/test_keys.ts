import './env';
import { GoogleGenAI } from '@google/genai';

async function testKeys() {
    const keysStr = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || process.env.API_KEY;
    const keys = keysStr ? keysStr.split(',').map(k => k.trim()).filter(Boolean) : [];

    if (keys.length === 0) {
        console.log(JSON.stringify({ error: 'No Gemini API keys found' }));
        return;
    }

    const results = [];

    for (let i = 0; i < keys.length; i++) {
        const apiKey = keys[i];
        const maskedKey = `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`;
        const result: any = { index: i + 1, key: maskedKey, status: 'UNKNOWN' };

        try {
            const ai = new GoogleGenAI({ apiKey });
            // Using a very simple model and prompt to minimize cost/time
            const response = await ai.models.generateContent({
                model: "gemini-2.0-flash",
                contents: "ping"
            });
            result.status = 'WORKING';
        } catch (err: any) {
            result.status = 'FAILED';
            result.error = err.message || String(err);
            result.statusCode = err.status || (err.response ? err.response.status : undefined);
        }
        results.push(result);
    }
    console.log(JSON.stringify(results, null, 2));
}

testKeys().catch(err => {
    console.error(JSON.stringify({ error: err.message || String(err) }));
    process.exit(1);
});
