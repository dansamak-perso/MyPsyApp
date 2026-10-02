import { boot as boot0, reporter, makeDrive, localDay } from './harness.mjs';
const HTML = process.env.HTML ? new URL(process.env.HTML, import.meta.url) : undefined;
const boot = (o) => boot0(HTML ? { ...o, htmlPath: HTML } : o);
const t = reporter();

const base = {
  schemaVersion: 2,
  patients: [{ id: 'p1', name: 'דנה כהן', sessionRate: 300, payerType: 'private' }, { id: 'p2', name: 'יוסי לוי', sessionRate: 250, payerType: 'private' }],
  appointments: [
    { id: 'a1', patientId: 'p1', date: localDay(-2), startTime: '10:00', duration: 50, status: 'scheduled', paid: false },
    { id: 'a2', patientId: 'p2', date: localDay(-1), startTime: '11:00', duration: 50, status: 'scheduled', paid: false },
  ],
  payments: [],
};
const drive = makeDrive(null);

// ---------- iPhone connects first, pushes the baseline
const phone = await boot({ local: base, drive, clientId: 'cid' });
await phone.settle(250);
t.check('phone: initial upload happened', drive.uploads >= 1 && JSON.parse(drive.content).appointments.length === 2);

// ---------- iPad was set up earlier with the same baseline, then phone works on Sunday
const padLocal = phone.store();             // what the iPad had last time
await phone.click(phone.findAll('button', /בואי נסדר את היום/)[0], 'flow');
await phone.click(phone.findAll('button', /^✔ הגיע/)[0], 'a? came');
await phone.settle(1900);                   // debounce 1.5 s + sync
const closeP = phone.window.document.querySelector('.modal button'); if (closeP) await phone.click(closeP, 'close flow');
const afterPhone = JSON.parse(drive.content);
const phoneDone = afterPhone.appointments.filter((x) => x.status === 'completed').map((x) => x.id);
t.check('phone: Sunday work reached Drive', phoneDone.length === 1);

// ---------- Monday: iPad opens with its stale local copy
const ipad = await boot({ local: padLocal, drive, clientId: 'cid' });
await ipad.settle(300);
const padNow = ipad.store();
t.check('iPad: pulled the phone\'s work at launch', padNow.appointments.filter((x) => x.status === 'completed').map((x) => x.id).join() === phoneDone.join());

// iPad makes its own change to the OTHER session
const other = padNow.appointments.find((x) => x.status === 'scheduled');
await ipad.click(ipad.findAll('button', /בואי נסדר את היום/)[0], 'flow ipad');
await ipad.click(ipad.findAll('button', /^✖ לא הגיע/)[0], 'noshow');
await ipad.settle(1900);
const closeI = ipad.window.document.querySelector('.modal button'); if (closeI) await ipad.click(closeI, 'close flow');
const merged = JSON.parse(drive.content);
const st = Object.fromEntries(merged.appointments.map((x) => [x.id, x.status]));
t.check('Drive keeps the phone\'s confirmation', st[phoneDone[0]] === 'completed');
t.check('Drive gets the iPad\'s no-show', st[other.id] === 'noshow');

// ---------- phone comes back to foreground: must not overwrite the iPad
phone.window.document.dispatchEvent(new phone.window.Event('visibilitychange'));
await phone.settle(50);
// force past the 20 s throttle for the test, as if time passed
await phone.click(phone.findAll('button', /הגדרות$/)[0], 'settings');
const syncBtn = phone.findAll('button', /סנכרון עכשיו/)[0];
if (syncBtn) await phone.click(syncBtn, 'manual sync');
await phone.settle(300);
const ph = Object.fromEntries(phone.store().appointments.map((x) => [x.id, x.status]));
t.check('phone pulled the iPad\'s no-show', ph[other.id] === 'noshow');
const final = Object.fromEntries(JSON.parse(drive.content).appointments.map((x) => [x.id, x.status]));
t.check('nothing lost after the round trip', final[phoneDone[0]] === 'completed' && final[other.id] === 'noshow');

// ---------- deletion propagates instead of resurrecting
await phone.click(phone.findAll('button', /מטופלים$/)[0], 'patients');
await phone.click(phone.findAll('h3', /יוסי לוי/)[0]?.closest('.card'), 'open p2');
t.check('active patient with history: no delete button', phone.findAll('button', /מחיקה/).length === 0);
phone.ui.answers = [true, true];
await phone.click(phone.findAll('button', /סיום טיפול/)[0], 'end treatment');
await phone.click(phone.findAll('button', /ארכיון \(/)[0], 'archive tab');
await phone.click(phone.findAll('h3', /יוסי לוי/)[0]?.closest('.card'), 'open archived p2');
const permanent = phone.findAll('button', /מחיקה לצמיתות/)[0];
t.check('inactive patient: permanent delete offered', !!permanent);
await phone.click(permanent, 'delete');
t.check('no name to type anymore', !phone.window.document.querySelector('.modal input'));
await phone.click(phone.findAll('.modal button', /^מחיקה$/)[0], 'confirm delete');
await phone.settle(1900);
t.check('deletion reached Drive', !JSON.parse(drive.content).patients.some((p) => p.id === 'p2'));
const ipad2 = await boot({ local: ipad.store(), drive, clientId: 'cid' });  // iPad still had p2 locally
await ipad2.settle(300);
t.check('iPad applies the deletion (no resurrection)', !ipad2.store().patients.some((p) => p.id === 'p2'));
await ipad2.settle(1900);
t.check('Drive still without the deleted patient', !JSON.parse(drive.content).patients.some((p) => p.id === 'p2'));
t.done();
