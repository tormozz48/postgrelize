// One-off generator for hero-dark.svg, favicon PNG/ICO, apple-touch-icon and og.png.
// Usage: node docs/icons/build-icons.mjs  (needs Google Chrome on macOS; no npm deps)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../public/', import.meta.url).pathname;
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const work = join(tmpdir(), 'pgz-icons');
mkdirSync(work, { recursive: true });

const tile = (
  rx,
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="${rx}" fill="#4f46e5"/>
  <rect x="13" y="11" width="9" height="42" rx="4.5" fill="#fff"/>
  <clipPath id="c"><path d="M21 22v22a17 7 0 0 0 34 0V22z"/></clipPath>
  <path d="M21 22v22a17 7 0 0 0 34 0V22z" fill="#c7d2fe"/>
  <path d="M21 33a17 7 0 0 0 34 0" fill="none" stroke="#4f46e5" stroke-width="3" clip-path="url(#c)"/>
  <ellipse cx="38" cy="22" rx="17" ry="7" fill="#fff"/>
</svg>
`;
writeFileSync(join(root, 'favicon.svg'), tile(14));

const shot = (html, out, w, h) => {
  const page = join(work, `${out.split('/').pop()}.html`);
  writeFileSync(page, html);
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${w},${h}`,
      `--screenshot=${out}`,
      `file://${page}`,
    ],
    { stdio: 'ignore' },
  );
};
const page = (svg, w, h) =>
  `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${w}" height="${h}" style="display:block"></body></html>`;

const png = (svg, name, size) => {
  const out = join(name.startsWith('/') ? '' : root, name);
  shot(page(svg, size, size), out, size, size);
  return out;
};

png(tile(14), 'favicon-512.png', 512);
png(tile(0), 'apple-touch-icon.png', 180);
const sizes = [16, 32, 48];
const pngs = sizes.map((s) =>
  readFileSync(png(tile(s <= 16 ? 4 : 10), join(work, `f${s}.png`), s)),
);
const head = Buffer.alloc(6);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dirs = pngs.map((p, i) => {
  const d = Buffer.alloc(16);
  d[0] = sizes[i];
  d[1] = sizes[i];
  d.writeUInt16LE(1, 4);
  d.writeUInt16LE(32, 6);
  d.writeUInt32LE(p.length, 8);
  d.writeUInt32LE(offset, 12);
  offset += p.length;
  return d;
});
writeFileSync(join(root, 'favicon.ico'), Buffer.concat([head, ...dirs, ...pngs]));

const hero = readFileSync(join(root, 'hero-dark.svg')).toString('base64');
shot(
  `<html><body style="margin:0;width:1200px;height:630px;overflow:hidden;position:relative;font-family:-apple-system,Helvetica,Arial,sans-serif;background:radial-gradient(circle at 78% 50%,#312e81 0%,#17163a 45%,#0f0f1f 100%)">
<img src="data:image/svg+xml;base64,${hero}" width="560" height="560" style="position:absolute;right:50px;top:35px">
<div style="position:absolute;left:80px;top:150px;width:560px;color:#fff">
<div style="font-size:84px;font-weight:800;letter-spacing:-2px">postgrelize</div>
<div style="font-size:38px;line-height:1.25;margin-top:22px;color:#c7d2fe">The Sequelize v6 API,<br>PostgreSQL only</div>
<div style="font-size:24px;margin-top:30px;color:#818cf8">Drop-in ORM for Node.js &middot; TypeScript</div></div></body></html>`,
  join(root, 'og.png'),
  1200,
  630,
);
