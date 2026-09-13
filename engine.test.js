require('../assets/engine.js');
const E = globalThis.SLEngine;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}

console.log('\n--- date helpers ---');
check('toISO/parseDate roundtrip', E.toISO(E.parseDate('2026-03-04')) === '2026-03-04');
check('no UTC drift on parse', E.parseDate('2026-03-04').getDate() === 4);
check('addDays crosses month', E.toISO(E.addDays(E.parseDate('2026-01-31'), 1)) === '2026-02-01');
check('addDays crosses year', E.toISO(E.addDays(E.parseDate('2026-12-31'), 1)) === '2027-01-01');
check('leap day 2028', E.toISO(E.addDays(E.parseDate('2028-02-28'), 1)) === '2028-02-29');
check('diffDays basic', E.diffDays('2026-03-01', '2026-03-11') === 10);
check('diffDays negative', E.diffDays('2026-03-11', '2026-03-01') === -10);
check('mondayOf a Wednesday', E.toISO(E.mondayOf('2026-03-04')) === '2026-03-02',
  E.toISO(E.mondayOf('2026-03-04')));
check('mondayOf a Sunday goes back 6', E.toISO(E.mondayOf('2026-03-08')) === '2026-03-02',
  E.toISO(E.mondayOf('2026-03-08')));
check('mondayOf a Monday is itself', E.toISO(E.mondayOf('2026-03-02')) === '2026-03-02');

console.log('\n--- single task scheduling ---');
// 14h of work, 14h/week capacity = 2h/day -> needs 7 days, ending day before due.
let s1 = {
  settings: { weeklyHours: 14, semesterStart: '2026-03-01', semesterEnd: '2026-05-31' },
  courses: [{ id: 'c1', code: 'CS101', name: 'Intro', credits: 3 }],
  tasks: [{ id: 't1', courseId: 'c1', title: 'Essay', due: '2026-04-15', weight: 30, effortHours: 14 }]
};
let p1 = E.schedule(s1, '2026-03-02');
let r1 = p1.results[0];
check('one result produced', p1.results.length === 1);
check('effort fully allocated', Math.abs(r1.days.reduce((a, d) => a + d.hours, 0) - 14) < 0.001);
check('last work day is day before due', r1.days[0].iso === '2026-04-14', r1.days[0].iso);
check('startline is 7 days of work back', r1.startline === '2026-04-08', r1.startline);
check('window is 7 days', r1.windowDays === 7, String(r1.windowDays));
check('not flagged unschedulable', r1.unschedulable === false);
check('semesterWeight = full weight when sole course', Math.abs(r1.semesterWeight - 30) < 0.001,
  String(r1.semesterWeight));

console.log('\n--- credit weighting ---');
let s2 = {
  settings: { weeklyHours: 20, semesterStart: '2026-03-01', semesterEnd: '2026-05-31' },
  courses: [
    { id: 'c1', code: 'A', name: 'A', credits: 3 },
    { id: 'c2', code: 'B', name: 'B', credits: 9 }
  ],
  tasks: [
    { id: 't1', courseId: 'c1', title: 'X', due: '2026-04-15', weight: 40, effortHours: 4 },
    { id: 't2', courseId: 'c2', title: 'Y', due: '2026-04-20', weight: 40, effortHours: 4 }
  ]
};
let p2 = E.schedule(s2);
let byId = {}; p2.results.forEach(r => byId[r.task.id] = r);
check('total credits summed', p2.totalCredits === 12, String(p2.totalCredits));
check('3-credit task = 40 * 3/12 = 10% of semester',
  Math.abs(byId.t1.semesterWeight - 10) < 0.001, String(byId.t1.semesterWeight));
check('9-credit task = 40 * 9/12 = 30% of semester',
  Math.abs(byId.t2.semesterWeight - 30) < 0.001, String(byId.t2.semesterWeight));

console.log('\n--- contention: two tasks competing for the same days ---');
// 7h/week = 1h/day. Two 5h tasks due one day apart. Second must be pushed back.
let s3 = {
  settings: { weeklyHours: 7, semesterStart: '2026-03-01', semesterEnd: '2026-05-31' },
  courses: [{ id: 'c1', code: 'C', name: 'C', credits: 3 }],
  tasks: [
    { id: 'a', courseId: 'c1', title: 'A', due: '2026-04-10', weight: 10, effortHours: 5 },
    { id: 'b', courseId: 'c1', title: 'B', due: '2026-04-11', weight: 10, effortHours: 5 }
  ]
};
let p3 = E.schedule(s3);
let m3 = {}; p3.results.forEach(r => m3[r.task.id] = r);
check('A (earlier deadline) keeps the days next to its own deadline',
  m3.a.days[0].iso === '2026-04-09', m3.a.days[0].iso);
check('A startline 2026-04-05', m3.a.startline === '2026-04-05', m3.a.startline);
check('B takes the one free day next to its deadline', m3.b.days[0].iso === '2026-04-10', m3.b.days[0].iso);
// B gets 1h on 04-10, then 04-05..04-09 are fully claimed by A, so its
// remaining 4h land on 04-04, 04-03, 04-02, 04-01.
check('B is pushed back past A entirely', m3.b.startline === '2026-04-01', m3.b.startline);
check('B skips the days A owns',
  m3.b.days.every(d => !['2026-04-05','2026-04-06','2026-04-07','2026-04-08','2026-04-09'].includes(d.iso)),
  JSON.stringify(m3.b.days.map(d => d.iso)));
check('B window is wider than A window', m3.b.windowDays > m3.a.windowDays,
  m3.b.windowDays + ' vs ' + m3.a.windowDays);
check('no day is double-booked beyond capacity',
  Object.values(p3.dayLoad).every(h => h <= 1.0001),
  JSON.stringify(p3.dayLoad));
let totalAlloc = p3.results.reduce((s, r) => s + r.days.reduce((a, d) => a + d.hours, 0), 0);
check('all 10h allocated exactly once', Math.abs(totalAlloc - 10) < 0.001, String(totalAlloc));

console.log('\n--- behind detection ---');
const t0 = E.today();
let s4 = {
  settings: { weeklyHours: 7, semesterStart: E.toISO(E.addDays(t0, -30)), semesterEnd: E.toISO(E.addDays(t0, 30)) },
  courses: [{ id: 'c1', code: 'C', name: 'C', credits: 3 }],
  // 20h of work at 1h/day, due in 5 days -> needed to start 15 days ago
  tasks: [{ id: 'x', courseId: 'c1', title: 'Late', due: E.toISO(E.addDays(t0, 5)), weight: 50, effortHours: 20 }]
};
let p4 = E.schedule(s4);
check('flagged as behind', p4.results[0].behind === true);
check('appears in behind list', p4.behind.length === 1);
check('daysUntilStart is negative', p4.results[0].daysUntilStart < 0, String(p4.results[0].daysUntilStart));
check('startline 16 days before due', E.diffDays(p4.results[0].startline, p4.results[0].due) === 20,
  String(E.diffDays(p4.results[0].startline, p4.results[0].due)));

console.log('\n--- week aggregation ---');
let p5 = E.schedule(s1, '2026-03-02');
let loaded = p5.weeks.filter(w => w.demand > 0);
check('exactly 2 weeks carry the 14h', loaded.length === 2, String(loaded.length));
check('week demand sums to 14',
  Math.abs(loaded.reduce((a, w) => a + w.demand, 0) - 14) < 0.001);
check('every week has a band label', p5.weeks.every(w => w.band && w.band.label));
check('empty weeks are seeded', p5.weeks.length >= 13, String(p5.weeks.length));
check('weeks are in chronological order',
  p5.weeks.every((w, i) => i === 0 || E.parseDate(w.start) > E.parseDate(p5.weeks[i - 1].start)));
let dueWeek = p5.weeks.find(w => w.due.length > 0);
check('grade at stake lands in the deadline week', Math.abs(dueWeek.gradeAtStake - 30) < 0.001,
  String(dueWeek.gradeAtStake));

console.log('\n--- debt: work scheduled into the past ---');
// 20h at 1h/day due in 5 days -> only 5h fit ahead of today, 15h fall behind it
check('debt is the work scheduled before today', Math.abs(p4.debt - 15) < 0.001, String(p4.debt));
check('no past weeks are returned',
  p4.weeks[0].key === E.toISO(E.mondayOf(E.today())), p4.weeks[0].key);
check('debt lands on the current week', Math.abs(p4.weeks[0].debt - 15) < 0.001, String(p4.weeks[0].debt));
// only 5 of the 20 hours fall on or after today; they may straddle a week
// boundary, so assert the sum rather than assuming they all land in week one
check('future hours across all weeks total 5',
  Math.abs(p4.weeks.reduce((a, w) => a + w.demand, 0) - 5) < 0.001,
  String(p4.weeks.reduce((a, w) => a + w.demand, 0)));
check('week total is its own demand plus carried debt',
  Math.abs(p4.weeks[0].total - (p4.weeks[0].demand + p4.weeks[0].debt)) < 0.001,
  String(p4.weeks[0].total));
check('ratio exceeds 1 once debt is carried', p4.weeks[0].ratio > 1, String(p4.weeks[0].ratio));
check('week is reported as overloaded', p4.overloaded.length >= 1, String(p4.overloaded.length));
check('debt never double counts',
  Math.abs(p4.weeks.reduce((a, w) => a + w.demand, 0) + p4.debt - 20) < 0.001);
check('later weeks carry no debt', p4.weeks.slice(1).every(w => w.debt === 0));

// with capacity to spare there should be no debt at all
let p4b = E.schedule({
  settings: { weeklyHours: 70, semesterStart: E.toISO(E.addDays(t0, -30)), semesterEnd: E.toISO(E.addDays(t0, 30)) },
  courses: [{ id: 'c1', code: 'C', name: 'C', credits: 3 }],
  tasks: [{ id: 'x', courseId: 'c1', title: 'Fine', due: E.toISO(E.addDays(t0, 5)), weight: 50, effortHours: 20 }]
});
check('no debt when the work fits', p4b.debt === 0, String(p4b.debt));
check('nothing flagged behind when the work fits', p4b.behind.length === 0);
check('no overloaded weeks when the work fits', p4b.overloaded.length === 0);

console.log('\n--- bands ---');
check('0 -> clear', E.bandFor(0).id === 'clear');
check('0.5 -> light', E.bandFor(0.5).id === 'light');
check('0.75 -> steady', E.bandFor(0.75).id === 'steady');
check('0.95 -> full', E.bandFor(0.95).id === 'full');
check('1.2 -> over', E.bandFor(1.2).id === 'over');
check('2.0 -> severe', E.bandFor(2.0).id === 'severe');

console.log('\n--- edge cases ---');
let empty = E.schedule({ settings: { weeklyHours: 15, semesterStart: '2026-03-01', semesterEnd: '2026-05-01' }, courses: [], tasks: [] });
check('empty state does not throw', empty.results.length === 0);
check('empty state still seeds weeks', empty.weeks.length > 0);
check('empty state totalCredits 0', empty.totalCredits === 0);

let zero = E.schedule({
  settings: { weeklyHours: 15, semesterStart: '2026-03-01', semesterEnd: '2026-05-01' },
  courses: [{ id: 'c', code: 'C', name: 'C', credits: 3 }],
  tasks: [{ id: 'z', courseId: 'c', title: 'Zero', due: '2026-04-01', weight: 5, effortHours: 0 }]
});
check('zero-effort task does not hang', zero.results.length === 1);
check('zero-effort startline = day before due', zero.results[0].startline === '2026-03-31',
  zero.results[0].startline);

let done = E.schedule({
  settings: { weeklyHours: 15, semesterStart: '2026-03-01', semesterEnd: '2026-05-01' },
  courses: [{ id: 'c', code: 'C', name: 'C', credits: 3 }],
  tasks: [{ id: 'd', courseId: 'c', title: 'Done', due: '2026-04-01', weight: 5, effortHours: 10, done: true }]
});
check('completed tasks are excluded', done.results.length === 0);

let huge = E.schedule({
  settings: { weeklyHours: 1, semesterStart: '2026-03-01', semesterEnd: '2026-05-01' },
  courses: [{ id: 'c', code: 'C', name: 'C', credits: 3 }],
  tasks: [{ id: 'h', courseId: 'c', title: 'Impossible', due: '2026-04-01', weight: 5, effortHours: 400 }]
});
check('impossible load terminates via guard', huge.results.length === 1);
check('impossible load flagged unschedulable', huge.results[0].unschedulable === true);

let noCourse = E.schedule({
  settings: { weeklyHours: 10, semesterStart: '2026-03-01', semesterEnd: '2026-05-01' },
  courses: [],
  tasks: [{ id: 'n', courseId: 'missing', title: 'Orphan', due: '2026-04-01', weight: 20, effortHours: 5 }]
});
check('orphan task does not throw', noCourse.results.length === 1);
check('orphan semesterWeight is 0 when no credits', noCourse.results[0].semesterWeight === 0);

console.log('\n--- ics export ---');
let ics = E.toICS(p1);
check('ics has calendar wrapper', ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'));
check('ics uses CRLF', ics.indexOf('\r\n') > -1);
check('ics has 2 events for 1 task', (ics.match(/BEGIN:VEVENT/g) || []).length === 2);
check('ics VEVENT count matches END count',
  (ics.match(/BEGIN:VEVENT/g) || []).length === (ics.match(/END:VEVENT/g) || []).length);
check('ics startline date present', ics.indexOf('DTSTART;VALUE=DATE:20260408') > -1);
check('ics due date present', ics.indexOf('DTSTART;VALUE=DATE:20260415') > -1);
check('no unfolded line exceeds 75 octets',
  ics.split('\r\n').every(l => Buffer.byteLength(l, 'utf8') <= 75),
  ics.split('\r\n').filter(l => Buffer.byteLength(l, 'utf8') > 75).join(' | '));

let esc = E.toICS({ results: [{
  task: { id: 'e1', title: 'A; B, C\\D' }, course: { code: 'X,Y' },
  startline: '2026-04-01', due: '2026-04-02', effortHours: 3, days: []
}]});
check('ics escapes semicolons', esc.indexOf('A\\; B') > -1);
check('ics escapes commas', esc.indexOf('B\\, C') > -1);

console.log('\n============================');
console.log('passed: ' + pass + '   failed: ' + fail);
console.log('============================\n');
process.exit(fail ? 1 : 0);
