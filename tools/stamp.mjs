// Stamps every script with the game's version so a browser never mixes old and new files after an update.
// GitHub Pages lets browsers cache each file for a while; without this, a fresh main.js can meet a stale view.js
// and the 3D view goes black. Run after changing VERSION: node tools/stamp.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const root = new URL('../', import.meta.url).pathname;
const v = readFileSync(root + 'js/config.js', 'utf8').match(/VERSION = '([^']+)'/)[1];
const files = [...readdirSync(root + 'js').filter(f => f.endsWith('.js')).map(f => 'js/' + f), 'js/vendor/three.js'];
const map = { imports: Object.fromEntries(files.map(f => ['./' + f, `./${f}?v=${v}`])) };
let html = readFileSync(root + 'index.html', 'utf8');
const tag = `<script type="importmap">\n${JSON.stringify(map, null, 1)}\n</script>\n<script type="module" src="js/main.js?v=${v}"></script>`;
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\n<script type="module" src="js\/main\.js[^"]*"><\/script>|<script type="module" src="js\/main\.js[^"]*"><\/script>/, tag);
html = html.replace(/href="css\/style\.css[^"]*"/, `href="css/style.css?v=${v}"`);
writeFileSync(root + 'index.html', html);
console.log(`stamped ${files.length} scripts with v=${v}`);
