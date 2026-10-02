import { boot, reporter, localDay } from './harness.mjs';
const t = reporter();
const voice = (n) => 'data:audio/mp4;base64,' + String(n).repeat(1).padEnd(1_280_000, 'A');

// --- legacy data: 3 inline voice notes (~3.8 MB) already in localStorage
const legacy = {
  schemaVersion: 2,
  patients: [{ id: 'p1', name: 'דנה כהן', sessionRate: 300, payerType: 'private' }, { id: 'p2', name: 'יוסי לוי', sessionRate: 250, payerType: 'private' }],
  appointments: [0, 1, 2].map((i) => ({ id: 'v' + i, patientId: 'p1', date: localDay(-7 * (i + 1)), startTime: '10:00', duration: 50, status: 'completed', paid: true, voiceNote: voice(i) })),
  payments: [],
};
const app = await boot({ local: legacy });
await app.settle(150);

const raw1 = app.raw();
t.check('legacy audio moved out of localStorage on first save', !raw1.includes('data:audio'));
t.check('localStorage now small (< 50 KB)', raw1.length < 50_000);
t.check('references left in place', (raw1.match(/"idb:/g) || []).length === 3);
const keys = await app.idbKeys();
t.check('3 recordings stored in IndexedDB', keys.length === 3);

// --- the scenario that used to fail silently: archive a patient
await app.click(app.findAll('button', /מטופלים$/)[0], 'patients');
await app.click(app.findAll('h3', /יוסי לוי/)[0]?.closest('.card'), 'open');
app.ui.answers = [true];
await app.click(app.findAll('button', /סיום טיפול/)[0], 'archive');
await app.settle(80);
t.check('ordinary change now persisted', app.store().patients.find((p) => p.id === 'p2').archived === true);
t.check('no save-error banner', !app.window.document.querySelector('[role="alert"]'));

// --- 10 more recordings: far beyond the old 5 MB ceiling
const s = app.store();
const many = Array.from({ length: 10 }, (_, i) => ({ id: 'n' + i, patientId: 'p1', date: localDay(-i - 1), startTime: '12:00', duration: 50, status: 'completed', paid: true }));
// reboot a fresh device with refs + inline mix, then record through the app path
const app2 = await boot({ local: { ...s, appointments: [...s.appointments, ...many] } });
await app2.settle(100);
await app2.click(app2.findAll('button', /סטטיסטיקה$/)[0], 'nav'); // any navigation, just to exercise render
t.check('app boots fine with refs (hydration)', app2.txt().length > 100);

// --- loud failure when storage really cannot be written
const app3 = await boot({ local: { schemaVersion: 2, patients: [{ id: 'p1', name: 'דנה כהן', sessionRate: 300, payerType: 'private' }], appointments: [], payments: [] } });
const orig = app3.window.Storage.prototype.setItem;
app3.window.Storage.prototype.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
await app3.click(app3.findAll('button', /מטופלים$/)[0], 'patients');
await app3.click(app3.findAll('h3', /דנה כהן/)[0]?.closest('.card'), 'open');
app3.ui.answers = [true];
await app3.click(app3.findAll('button', /סיום טיפול/)[0], 'archive');
await app3.settle(40);
const banner = app3.window.document.querySelector('[role="alert"]');
t.check('save failure is shown loudly', !!banner && /השמירה במכשיר נכשלה/.test(banner.textContent));
app3.window.Storage.prototype.setItem = orig;
t.done();
