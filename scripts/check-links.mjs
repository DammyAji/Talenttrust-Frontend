// Fast smoke test: every internal link in the nav and in page sources must map to an app route.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../src/app/', import.meta.url));
const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
const nav = JSON.parse(readFileSync(join(srcDir, 'lib/nav.json'), 'utf8'));

const routeExists = (href) => {
  let path = href.split('#')[0].split('?')[0];
  if (path === '/' || path === '') return existsSync(join(appDir, 'page.tsx'));
  // Normalise dynamic segments (e.g. /contracts/${id}/statement or /contracts/12/statement)
  // into the App Router [param] directory form so dynamic routes resolve.
  path = path.replace(/\$\{[^}]*\}/g, '[]');
  const segments = path.split('/').filter(Boolean);
  let dir = appDir;
  for (const segment of segments) {
    if (segment === '[]') {
      let entries;
      try {
        entries = readdirSync(dir);
      } catch {
        return false;
      }
      const dynamic = entries.find((entry) => /^\[.+\]$/.test(entry));
      if (!dynamic) return false;
      dir = join(dir, dynamic);
    } else {
      dir = join(dir, segment);
    }
  }
  return existsSync(join(dir, 'page.tsx'));
};

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

const links = new Set(nav.map((n) => n.href));
for (const file of walk(srcDir)) {
  for (const m of readFileSync(file, 'utf8').matchAll(/href=["{`]+(\/[^"`#?]*)/g)) links.add(m[1]);
}

const broken = [...links].filter((l) => !routeExists(l));
if (broken.length) {
  console.error('Broken internal links:', broken);
  process.exit(1);
}
console.log(`OK: ${links.size} internal links resolve (${[...links].join(', ')})`);
