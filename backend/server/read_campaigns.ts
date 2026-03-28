import fs from 'fs';
const data = fs.readFileSync('campaigns_out.json', 'utf16le');
console.log(data);
