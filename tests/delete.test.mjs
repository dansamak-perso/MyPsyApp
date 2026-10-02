import { boot, reporter, localDay } from './harness.mjs';
const t = reporter();
const app = await boot({ local: { schemaVersion: 2,
  patients: [
    { id: 'p1', name: 'דנה כהן', sessionRate: 300, payerType: 'private' },
    { id: 'p2', name: 'טעות הקלדה', sessionRate: 300, payerType: 'private' }],
  appointments: [{ id: 'a1', patientId: 'p1', date: localDay(-5), startTime: '10:00', duration: 50, status: 'completed', paid: true, notes: 'סיכום חשוב' }],
  payments: [] } });
const open = async (name) => {
  await app.click(app.findAll('button', /מטופלים$/)[0], 'patients');
  const back = app.findAll('button', /חזרה לרשימת המטופלים/)[0]; if (back) await app.click(back, 'back');
  const tab = app.findAll('button', /^הכל$/)[0]; if (tab) await app.click(tab, 'all');
  await app.click(app.findAll('h3', new RegExp(name))[0]?.closest('.card'), 'open ' + name);
};

// active patient with history: only "end of treatment"
await open('דנה כהן');
t.check('active + history: no delete button', app.findAll('button', /מחיקה/).length === 0);
t.check('active + history: end-of-treatment offered', app.findAll('button', /סיום טיפול/).length === 1);

// end treatment -> inactive, history intact, reactivatable
app.ui.answers = [true];
await app.click(app.findAll('button', /סיום טיפול/)[0], 'end');
t.check('patient inactive', app.store().patients.find((p) => p.id === 'p1').archived === true);
t.check('history kept', app.store().appointments.some((a) => a.id === 'a1' && a.notes === 'סיכום חשוב'));
await app.click(app.findAll('button', /ארכיון \(/)[0], 'archive tab');
await app.click(app.findAll('h3', /דנה כהן/)[0]?.closest('.card'), 'open archived');
t.check('inactive file still shows the notes', /סיכום חשוב/.test(app.txt()));
t.check('reactivate offered', app.findAll('button', /החזרה לטיפול פעיל/).length === 1);
t.check('permanent delete offered only here', app.findAll('button', /מחיקה לצמיתות/).length === 1);

// reactivate
await app.click(app.findAll('button', /החזרה לטיפול פעיל/)[0], 'reactivate');
t.check('reactivated', !app.store().patients.find((p) => p.id === 'p1').archived);

// patient created by mistake (no history): direct delete, no name to type
await open('טעות הקלדה');
const del = app.findAll('button', /^.*מחיקה$/)[0];
t.check('empty patient: delete available', !!del);
await app.click(del, 'delete');
t.check('no typed-name field', !app.window.document.querySelector('.modal input'));
await app.click(app.findAll('.modal button', /^מחיקה$/)[0], 'confirm');
t.check('empty patient removed', !app.store().patients.some((p) => p.id === 'p2'));
t.check('other patient untouched', app.store().patients.some((p) => p.id === 'p1'));
t.done();
