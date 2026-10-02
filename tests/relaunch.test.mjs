import { boot, reporter, localDay } from './harness.mjs';
const t = reporter();
const voice = 'data:audio/mp4;base64,' + 'B'.repeat(900_000);
const data = { schemaVersion: 2,
  patients: [{ id: 'p1', name: 'דנה כהן', sessionRate: 300, payerType: 'private' }],
  appointments: [{ id: 'v1', patientId: 'p1', date: localDay(-3), startTime: '10:00', duration: 50, status: 'completed', paid: true, voiceNote: voice, notes: 'סיכום' }],
  payments: [] };
const a = await boot({ local: data });
await a.settle(150);
const raw = a.raw();
t.check('first launch offloads audio', raw.includes('"idb:v1"') && !raw.includes('data:audio'));

// relaunch: same device = same localStorage + same IndexedDB
const b = await boot({ rawLocal: raw, idb: a.idb });
await b.settle(150);
let shared = null;
b.window.navigator.canShare = () => true;
b.window.navigator.share = ({ files }) => new Promise((resolve) => {
  const r = new b.window.FileReader();
  r.onload = () => { shared = r.result; resolve(); };
  r.readAsText(files[0]);
});
await b.click(b.findAll('button', /הגדרות$/)[0], 'settings');
const exportBtn = b.findAll('button', /ייצוא|גיבוי לקובץ|הורדת גיבוי/)[0];
t.check('backup button found', !!exportBtn);
await b.click(exportBtn, 'export');
await b.settle(80);
t.check('export went through the share sheet', !!shared);
const exported = shared ? JSON.parse(shared) : null;
t.check('export contains the real audio, not a reference', exported && exported.appointments[0].voiceNote === voice);
t.check('relaunch keeps localStorage light', b.raw().length < 20_000);
t.done();
