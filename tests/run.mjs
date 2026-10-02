// Runs every *.test.mjs in its own process (each boots the app fresh) and summarizes.
import { readdirSync } from 'fs';
import { spawnSync } from 'child_process';
const files = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.test.mjs')).sort();
let pass = 0, fail = 0, broken = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [new URL(f, import.meta.url).pathname], { encoding: 'utf8', timeout: 180000 });
  const lines = (r.stdout || '').split('\n');
  const p = lines.filter((l) => l.startsWith('PASS')).length;
  const x = lines.filter((l) => l.startsWith('FAIL'));
  pass += p; fail += x.length;
  if (r.status !== 0 && !x.length) broken.push(f);
  console.log(`${x.length || r.status ? '✗' : '✓'} ${f.padEnd(26)} ${p} passed${x.length ? ', ' + x.length + ' failed' : ''}`);
  x.forEach((l) => console.log('    ' + l));
  if (r.status !== 0 && !x.length) console.log('    crashed:\n' + (r.stderr || '').split('\n').filter((l) => !/deprecated|^Warning/.test(l)).slice(0, 6).join('\n'));
}
console.log(`\n${pass} passed, ${fail} failed${broken.length ? ', ' + broken.length + ' crashed' : ''}`);
process.exit(fail || broken.length ? 1 : 0);
