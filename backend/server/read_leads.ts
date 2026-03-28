import fs from 'fs';
const data = fs.readFileSync('leads_out.json', 'utf16le');
console.log(data);
