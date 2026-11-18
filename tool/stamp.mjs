// Stamps a deploy: replaces __VERSION__ in index.html and sw.js with the
// commit, and fills sw.js's PRECACHE with every file the site ships, using
// the same versioned URLs index.html asks for.
//
//   node tool/stamp.mjs _site <version>
//
// Run by .github/workflows/pages.yml on the copied site, never on the repo.

import fs from 'node:fs';
import path from 'node:path';

const [site, version] = process.argv.slice(2);
if (!site || !version) {
  console.error('usage: node tool/stamp.mjs <site dir> <version>');
  process.exit(1);
}

// Files index.html loads with ?v=: the stylesheet, the scripts and the head.
const versioned = (rel) => rel === 'style.css' || rel.startsWith('src/') || rel === 'models/head.glb';

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [path.relative(site, p).split(path.sep).join('/')];
  });
}

const precache = ['./'];
for (const rel of walk(site).sort()) {
  if (rel === 'index.html' || rel === 'sw.js' || rel === 'CNAME' || rel.endsWith('.txt')) continue;
  precache.push(versioned(rel) ? `${rel}?v=${version}` : rel);
}

for (const file of ['index.html', 'sw.js']) {
  const p = path.join(site, file);
  let text = fs.readFileSync(p, 'utf8').replaceAll('__VERSION__', version);
  if (file === 'sw.js') {
    const marker = '[] /* __PRECACHE__ */';
    if (!text.includes(marker)) throw new Error('sw.js has no PRECACHE marker');
    text = text.replace(marker, JSON.stringify(precache));
  }
  if (text.includes('__VERSION__') || text.includes('__PRECACHE__')) throw new Error(`${file} still has a placeholder`);
  fs.writeFileSync(p, text);
}

console.log(`stamped ${version}; precache ${precache.length} files`);
