import './env';

const keysStr = process.env.GEMINI_API_KEYS || '';
const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);

console.log('Total keys loaded:', keys.length);
keys.forEach((k, i) => {
    console.log(`Key ${i + 1}: ${k.substring(0, 10)}...${k.substring(k.length - 4)} (Length: ${k.length})`);
});
