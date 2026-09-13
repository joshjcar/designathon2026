const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const dir = require('path').join(__dirname, '..');
let pass = 0, fail = 0;
const errors = [];

function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
}

const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = fs.readFileSync(path.join(dir, 'planner.html'), 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  url: 'http://localhost/planner.html',
  virtualConsole: vc,
  pretendToBeVisual: true,
  resources: undefined
});

const { window } = dom;
const doc = window.document;

// jsdom has no Blob download plumbing; stub just enough for the export buttons.
window.URL.createObjectURL = () => 'blob:stub';
window.URL.revokeObjectURL = () => {};
let confirmAnswer = true;
window.confirm = () => confirmAnswer;
let systemDark = false;
window.matchMedia = q => ({
  matches: /dark/.test(q) ? systemDark : false,
  media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){}
});

// load our two scripts manually (jsdom won't fetch local <script src>)
function inject(file) {
  const s = doc.createElement('script');
  s.textContent = fs.readFileSync(path.join(dir, 'assets', file), 'utf8');
  doc.body.appendChild(s);
}

console.log('\n--- boot ---');
try {
  inject('engine.js');
  inject('app.js');
  inject('theme.js');
  check('scripts executed without throwing', true);
} catch (e) {
  check('scripts executed without throwing', false, e.message);
}

check('engine attached to window', typeof window.SLEngine === 'object');

function main() {

const $ = id => doc.getElementById(id);

console.log('\n--- first paint (example semester by default) ---');
check('verdict rendered', $('verdict').textContent.trim().length > 0);
check('kpis rendered', $('kpis').children.length === 4, String($('kpis').children.length));
check('course list populated', $('courseList').children.length === 5, String($('courseList').children.length));
check('assessment list populated', $('allList').querySelectorAll('.taskrow').length === 10,
  String($('allList').querySelectorAll('.taskrow').length));
check('week chart has columns', $('weekChart').querySelectorAll('.weekcol').length > 5,
  String($('weekChart').querySelectorAll('.weekcol').length));
check('capacity markers drawn', $('weekChart').querySelectorAll('.weekcap').length > 5, String($('weekChart').querySelectorAll('.weekcap').length));
check('timeline drawn', $('timelineWrap').querySelectorAll('.tl-row').length === 10,
  String($('timelineWrap').querySelectorAll('.tl-row').length));
check('course select populated', $('tCourse').options.length === 5, String($('tCourse').options.length));
check('task type select populated', $('tType').options.length === 8, String($('tType').options.length));
check('week table populated', $('weekTable').querySelectorAll('tbody tr').length > 5);

console.log('\n--- the demo actually demonstrates the point ---');
check('demo produces at least one behind task',
  $('verdict').textContent.indexOf('should already be underway') > -1,
  $('verdict').textContent.slice(0, 120));
check('"what to start" is not empty', $('nowList').querySelectorAll('.taskrow').length > 0,
  String($('nowList').querySelectorAll('.taskrow').length));
check('at least one over-capacity week exists',
  $('weekChart').querySelectorAll('.weekbar-excess').length > 0,
  String($('weekChart').querySelectorAll('.weekbar-excess').length));
check('every task shows a Begin date',
  ($('allList').textContent.match(/Begin /g) || []).length === 10,
  String(($('allList').textContent.match(/Begin /g) || []).length));

console.log('\n--- persistence ---');
check('state written to localStorage', !!window.localStorage.getItem('startline.v1'));
const stored = JSON.parse(window.localStorage.getItem('startline.v1'));
check('stored state has 10 tasks', stored.tasks.length === 10);
check('stored state has 5 courses', stored.courses.length === 5);

console.log('\n--- adding an assessment ---');
const before = $('allList').querySelectorAll('.taskrow').length;
$('tTitle').value = 'Pop quiz on chapter 4';
$('tCourse').value = $('tCourse').options[1].value;
$('tDue').value = window.SLEngine.toISO(window.SLEngine.addDays(window.SLEngine.today(), 12));
$('tHours').value = '4';
$('tWeight').value = '10';
$('taskForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
check('assessment added', $('allList').querySelectorAll('.taskrow').length === before + 1,
  String($('allList').querySelectorAll('.taskrow').length));
check('new assessment appears by name', $('allList').textContent.indexOf('Pop quiz on chapter 4') > -1);
check('form cleared after submit', $('tTitle').value === '');
check('timeline grew too', $('timelineWrap').querySelectorAll('.tl-row').length === before + 1);

console.log('\n--- validation blocks bad input ---');
const countNow = $('allList').querySelectorAll('.taskrow').length;
$('tTitle').value = '';
$('tDue').value = '';
$('tHours').value = '';
$('tWeight').value = '';
$('taskForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
check('empty submit rejected', $('allList').querySelectorAll('.taskrow').length === countNow);
check('title error shown', $('e-title').hidden === false);
check('due error shown', $('e-due').hidden === false);
check('hours error shown', $('e-hours').hidden === false);
check('weight error shown', $('e-weight').hidden === false);
check('invalid class applied', $('f-title').classList.contains('invalid'));

$('tTitle').value = 'Bad weight';
$('tDue').value = window.SLEngine.toISO(window.SLEngine.addDays(window.SLEngine.today(), 9));
$('tHours').value = '5';
$('tWeight').value = '250';
$('taskForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
check('out-of-range weight rejected', $('allList').querySelectorAll('.taskrow').length === countNow);
check('weight error message shown', $('e-weight').hidden === false);

console.log('\n--- editing ---');
const editBtn = $('allList').querySelector('[data-edit]');
editBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('edit loads title into form', $('tTitle').value.length > 0, $('tTitle').value);
check('submit button relabelled',
  $('taskForm').querySelector('button[type=submit]').textContent === 'Save changes',
  $('taskForm').querySelector('button[type=submit]').textContent);
$('tHours').value = '99';
$('taskForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
check('edit did not create a duplicate', $('allList').querySelectorAll('.taskrow').length === countNow,
  String($('allList').querySelectorAll('.taskrow').length));
check('edited hours reflected', $('allList').textContent.indexOf('99h') > -1);
check('button label reset', $('taskForm').querySelector('button[type=submit]').textContent === 'Add assessment');

console.log('\n--- completing and deleting ---');
const cb = $('allList').querySelector('[data-done]');
cb.checked = true;
cb.dispatchEvent(new window.Event('change', { bubbles: true }));
check('completed task drops out of the schedule',
  $('allList').querySelectorAll('.taskrow.is-done').length === 1,
  String($('allList').querySelectorAll('.taskrow.is-done').length));

const n1 = $('allList').querySelectorAll('.taskrow').length;
confirmAnswer = true;
$('allList').querySelector('[data-del]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('delete removes one row', $('allList').querySelectorAll('.taskrow').length === n1 - 1);

confirmAnswer = false;
const n2 = $('allList').querySelectorAll('.taskrow').length;
$('allList').querySelector('[data-del]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('cancelling delete changes nothing', $('allList').querySelectorAll('.taskrow').length === n2);
confirmAnswer = true;

console.log('\n--- week selection ---');
const col = $('weekChart').querySelector('.weekcol');
col.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('week detail opens', $('weekDetail').textContent.indexOf('Week of') > -1);
check('column marked pressed',
  $('weekChart').querySelector('.weekcol[aria-pressed="true"]') !== null);
$('weekChart').querySelector('.weekcol[aria-pressed="true"]')
  .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('clicking again closes it', $('weekDetail').textContent.trim() === '');

console.log('\n--- chart / table toggle ---');
$('btnToggleView').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('table shown', $('tableWrap').hidden === false);
check('chart hidden', $('chartWrap').hidden === true);
check('aria-pressed true', $('btnToggleView').getAttribute('aria-pressed') === 'true');
check('button label changed', $('btnToggleView').textContent === 'Show as a chart');
$('btnToggleView').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('toggles back', $('chartWrap').hidden === false && $('tableWrap').hidden === true);

console.log('\n--- settings change recomputes ---');
const kpiBefore = $('kpis').textContent;
$('weeklyHours').value = '4';
$('weeklyHours').dispatchEvent(new window.Event('change', { bubbles: true }));
check('lowering capacity changes the numbers', $('kpis').textContent !== kpiBefore);
check('lowering capacity creates overload',
  $('verdict').textContent.indexOf('should already be underway') > -1);
$('weeklyHours').value = '20';
$('weeklyHours').dispatchEvent(new window.Event('change', { bubbles: true }));

$('semStart').value = window.SLEngine.toISO(window.SLEngine.addDays(window.SLEngine.today(), 10));
$('semEnd').value = window.SLEngine.toISO(window.SLEngine.addDays(window.SLEngine.today(), 2));
$('semEnd').dispatchEvent(new window.Event('change', { bubbles: true }));
check('end-before-start is corrected',
  window.SLEngine.parseDate($('semEnd').value) > window.SLEngine.parseDate($('semStart').value),
  $('semStart').value + ' .. ' + $('semEnd').value);

console.log('\n--- adding a course ---');
const cBefore = $('courseList').children.length;
$('cCode').value = 'PHYS-211';
$('cName').value = 'University Physics I';
$('cCredits').value = '4';
$('courseForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
check('course added', $('courseList').children.length === cBefore + 1);
check('course select updated', $('tCourse').options.length === cBefore + 1);
check('course form cleared', $('cCode').value === '');

$('courseForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
check('empty course code rejected', $('courseList').children.length === cBefore + 1);
check('course code error shown', $('e-ccode').hidden === false);

console.log('\n--- reset and demo reload ---');
$('btnReset').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('reset clears assessments', $('allList').querySelectorAll('.taskrow').length === 0);
check('empty state message shown', $('allList').textContent.indexOf('No assessments yet') > -1);
check('verdict shows idle state', $('verdict').textContent.indexOf('Nothing to plan yet') > -1);
check('timeline shows empty state', $('timelineWrap').textContent.indexOf('No windows to draw') > -1);
check('no crash with zero data', errors.length === 0, errors.join(' | '));

check('empty state offers a working demo button', !!$('allList').querySelector('[data-loaddemo]'));
$('allList').querySelector('[data-loaddemo]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('empty-state button loads the demo', $('allList').querySelectorAll('.taskrow').length === 10,
  String($('allList').querySelectorAll('.taskrow').length));

$('btnReset').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
$('btnDemo').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('demo restores 10 assessments', $('allList').querySelectorAll('.taskrow').length === 10);
check('demo restores 5 courses', $('courseList').children.length === 5);

console.log('\n--- export paths do not throw ---');
try { $('btnIcs').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); check('ics export ran', true); }
catch (e) { check('ics export ran', false, e.message); }
try { $('btnExport').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); check('json export ran', true); }
catch (e) { check('json export ran', false, e.message); }

console.log('\n--- accessibility surface ---');
check('skip link present', !!doc.querySelector('a.skip'));
check('exactly one h1 on page', doc.querySelectorAll('h1').length === 1, String(doc.querySelectorAll('h1').length));
check('live region present', !!doc.querySelector('[aria-live]'));
check('nav is labelled', !!doc.querySelector('nav[aria-label]'));
check('current page marked', !!doc.querySelector('[aria-current="page"]'));
check('every input has a label or aria-label', (function () {
  const bad = [];
  doc.querySelectorAll('input, select, textarea').forEach(el => {
    if (el.type === 'hidden') return;
    const hasLabel = el.id && doc.querySelector('label[for="' + el.id + '"]');
    if (!hasLabel && !el.getAttribute('aria-label')) bad.push(el.id || el.outerHTML.slice(0, 50));
  });
  return bad.length === 0 ? true : (errors.push('unlabelled: ' + bad.join(',')), false);
})(), errors.filter(e => e.startsWith('unlabelled')).join(''));
check('chart columns are real buttons',
  Array.from($('weekChart').querySelectorAll('.weekcol')).every(b => b.tagName === 'BUTTON'));
check('chart columns carry screen-reader text',
  Array.from($('weekChart').querySelectorAll('.weekcol')).every(b => b.querySelector('.sr-only')));
check('table has a caption', !!$('weekTable').querySelector('caption'));
check('all buttons have accessible text', (function () {
  const bad = [];
  doc.querySelectorAll('button').forEach(b => {
    if (!b.textContent.trim() && !b.getAttribute('aria-label')) bad.push(b.outerHTML.slice(0, 60));
  });
  return bad.length === 0;
})());

console.log('\n--- theme ---');
const rootEl = doc.documentElement;
check('data-theme is set before paint', ['light','dark'].includes(rootEl.getAttribute('data-theme')),
  rootEl.getAttribute('data-theme'));
const tBtn = $('themeToggle');
check('toggle button exists', !!tBtn);
check('toggle has an accessible name', !!tBtn && !!tBtn.getAttribute('aria-label'),
  tBtn && tBtn.getAttribute('aria-label'));
check('toggle carries aria-pressed', !!tBtn && tBtn.hasAttribute('aria-pressed'));
check('toggle holds both icons',
  !!tBtn && !!tBtn.querySelector('.icon-moon') && !!tBtn.querySelector('.icon-sun'));
check('toggle icons are hidden from screen readers',
  !!tBtn && Array.from(tBtn.querySelectorAll('svg')).every(x => x.getAttribute('aria-hidden') === 'true'));

const startTheme = rootEl.getAttribute('data-theme');
tBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const flipped = rootEl.getAttribute('data-theme');
check('clicking flips the theme', flipped !== startTheme, startTheme + ' -> ' + flipped);
check('choice is persisted', window.localStorage.getItem('startline.theme') === flipped,
  String(window.localStorage.getItem('startline.theme')));
check('aria-pressed tracks the theme',
  tBtn.getAttribute('aria-pressed') === String(flipped === 'dark'));
check('label offers the other theme',
  tBtn.getAttribute('aria-label').includes(flipped === 'dark' ? 'light' : 'dark'),
  tBtn.getAttribute('aria-label'));

tBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('clicking again flips back', rootEl.getAttribute('data-theme') === startTheme);
check('planner still renders after theme changes',
  $('allList').querySelectorAll('.taskrow').length === 10,
  String($('allList').querySelectorAll('.taskrow').length));

console.log('\n--- no runtime errors overall ---');
const realErrors = errors.filter(e => !e.startsWith('unlabelled') && !/css|stylesheet/i.test(e));
check('clean console', realErrors.length === 0, realErrors.join(' | '));

console.log('\n============================');
console.log('passed: ' + pass + '   failed: ' + fail);
console.log('============================\n');
process.exit(fail ? 1 : 0);
}

if (doc.readyState === 'complete') main();
else window.addEventListener('load', main);
