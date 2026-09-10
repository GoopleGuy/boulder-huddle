import fs from 'node:fs';
import {createHash} from 'node:crypto';
const assets=fs.readdirSync('dist/assets').filter(f=>/\.(js|css)$/.test(f)).map(f=>'assets/'+f);
assets.push(...fs.readdirSync('dist/teams').filter(f=>f.endsWith('.webp')).map(f=>'teams/'+f));
const version=createHash('sha256').update(assets.join(',')+fs.readFileSync('dist/sw.js','utf8')).digest('hex').slice(0,12);
const sw=fs.readFileSync('dist/sw.js','utf8').replace("const VERSION='huddle-v1';",`const VERSION='huddle-${version}';`).replace('const assets=[]; // BUILD_ASSETS',`const assets=${JSON.stringify(assets)};`);
fs.writeFileSync('dist/sw.js',sw);
console.log(`Offline cache includes ${assets.length} compiled assets.`);
