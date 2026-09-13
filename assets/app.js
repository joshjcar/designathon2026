/* Startline — application layer.
   Talks to the DOM. All scheduling maths lives in engine.js. */

(function () {
  'use strict';

  var E = window.SLEngine;
  var KEY = 'startline.v1';

  var COURSE_COLOURS = ['#3A34D6', '#0E7C7B', '#A03E99', '#1C7A55', '#B05410', '#5B6270'];

  var state = null;
  var plan = null;
  var selectedWeek = null;
  var editingTaskId = null;
  var asTable = false;

  /* ---------------- helpers ---------------- */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid() {
    return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function fmt(iso) {
    var d = E.parseDate(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function fmtLong(iso) {
    var d = E.parseDate(iso);
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function round1(n) { return Math.round(n * 10) / 10; }

  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }

  function relDays(n) {
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    if (n > 0) return 'in ' + n + ' days';
    return Math.abs(n) + ' days ago';
  }

  var toastTimer = null;
  function toast(msg) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.remove(); }, 3200);
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------- state ---------------- */

  function blankState() {
    var t = E.today();
    return {
      settings: {
        weeklyHours: 15,
        semesterStart: E.toISO(E.addDays(t, -14)),
        semesterEnd: E.toISO(E.addDays(t, 70))
      },
      courses: [],
      tasks: []
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.settings || !Array.isArray(parsed.courses) || !Array.isArray(parsed.tasks)) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      toast('Could not save to this browser. Your work is still on screen.');
    }
  }

  /* ---------------- example semester ----------------
     Built relative to today so the example is always live: some startlines
     have genuinely passed, which is the whole point of the tool. Course codes
     are real RIT Dubai ones so the example reads as a plausible semester. */

  function demoState() {
    var t = E.today();
    var d = function (n) { return E.toISO(E.addDays(t, n)); };

    var courses = [
      { id: 'c1', code: 'ISTE-121', name: 'Computer Problem Solving II', credits: 4, colour: COURSE_COLOURS[0] },
      { id: 'c2', code: 'MATH-181', name: 'Calculus I',                  credits: 4, colour: COURSE_COLOURS[1] },
      { id: 'c3', code: 'ECON-201', name: 'Principles of Macroeconomics', credits: 3, colour: COURSE_COLOURS[2] },
      { id: 'c4', code: 'NSSA-221', name: 'Systems Administration I',     credits: 3, colour: COURSE_COLOURS[3] },
      { id: 'c5', code: 'ENGL-210', name: 'Technical Writing',            credits: 3, colour: COURSE_COLOURS[4] }
    ];

    var rows = [
      ['c1', 'Lab 6: inheritance',        'lab',          2,  5,   5],
      ['c2', 'Problem set 7',             'problem-set',  4,  6,   8],
      ['c3', 'Midterm exam',              'exam',         8,  16, 25],
      ['c5', 'Report, first draft',       'essay',       11,  10, 15],
      ['c4', 'Practical: DNS and DHCP',   'lab',         15,   7, 10],
      ['c1', 'Project milestone 2',       'project',     19,  14, 20],
      ['c2', 'Midterm 2',                 'exam',        23,  15, 25],
      ['c3', 'Essay: monetary policy',    'essay',       30,  12, 20],
      ['c4', 'Final project build',       'project',     38,  20, 30],
      ['c1', 'Final exam',                'exam',        45,  18, 30]
    ];

    var tasks = rows.map(function (r, i) {
      return {
        id: 'd' + i, courseId: r[0], title: r[1], type: r[2],
        due: d(r[3]), effortHours: r[4], weight: r[5], done: false
      };
    });

    return {
      settings: { weeklyHours: 20, semesterStart: d(-24), semesterEnd: d(52) },
      courses: courses,
      tasks: tasks
    };
  }

  /* ---------------- rendering ---------------- */

  function loadDemo() {
    state = demoState();
    $('weeklyHours').value = state.settings.weeklyHours;
    $('semStart').value = state.settings.semesterStart;
    $('semEnd').value = state.settings.semesterEnd;
    selectedWeek = null;
    resetTaskForm();
    recompute();
    toast('Example semester loaded.');
  }

  function recompute() {
    plan = E.schedule(state);
    renderAll();
    save();
  }

  function renderAll() {
    renderVerdict();
    renderKpis();
    renderNow();
    renderChart();
    renderTable();
    renderWeekDetail();
    renderTimeline();
    renderAllList();
    renderCourses();
    renderCourseSelect();
  }

  function renderVerdict() {
    var box = $('verdict');
    var n = plan.results.length;

    if (n === 0) {
      box.innerHTML = '<div class="alert alert-idle">' +
        '<div><h2>Nothing to plan yet</h2>' +
        '<p class="muted">Add an assessment on the left, or load the example semester to see how this works.</p></div></div>';
      return;
    }

    var behind = plan.behind;
    if (behind.length) {
      var grade = round1(behind.reduce(function (s, r) { return s + r.semesterWeight; }, 0));
      var worst = behind.reduce(function (a, r) {
        return (r.daysUntilStart < a.daysUntilStart) ? r : a;
      }, behind[0]);
      box.innerHTML = '<div class="alert alert-over">' +
        '<svg class="alert-icon" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">' +
        '<circle cx="11" cy="11" r="10" fill="none" stroke="#C22E28" stroke-width="2"/>' +
        '<rect x="10" y="5" width="2" height="8" fill="#C22E28"/>' +
        '<rect x="10" y="15" width="2" height="2" fill="#C22E28"/></svg>' +
        '<div><h2>' + behind.length + ' ' + plural(behind.length, 'assessment') +
        ' should already be underway</h2>' +
        '<p>Together they carry <strong>' + grade + '% of your semester grade</strong>. ' +
        'The furthest behind is <strong>' + esc(worst.task.title) + '</strong>, which needed to begin ' +
        relDays(worst.daysUntilStart) + '. Starting now means either working beyond your stated hours or handing in less than your best.</p>' +
        '</div></div>';
      return;
    }

    box.innerHTML = '<div class="alert alert-ok">' +
      '<svg class="alert-icon" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">' +
      '<circle cx="11" cy="11" r="10" fill="none" stroke="#1C7A55" stroke-width="2"/>' +
      '<path d="M6 11.5l3.4 3.4L16 8" fill="none" stroke="#1C7A55" stroke-width="2"/></svg>' +
      '<div><h2>Every start date is still ahead of you</h2>' +
      '<p>Nothing has slipped yet. Keep to the start dates below and the hours you have will be enough.</p></div></div>';
  }

  function renderKpis() {
    var demandAhead = plan.weeks.reduce(function (s, w) { return s + w.total; }, 0);
    var capAhead = plan.weeks.length * plan.capacity;

    var items = [
      { n: plan.results.length, l: 'assessments left' },
      { n: Math.round(demandAhead) + 'h', l: 'of work still to do' },
      { n: plan.overloaded.length, l: 'weeks over capacity' },
      {
        n: capAhead > 0 ? Math.round(demandAhead / capAhead * 100) + '%' : '0%',
        l: 'of your remaining hours spoken for'
      }
    ];

    $('kpis').innerHTML = items.map(function (k) {
      return '<div class="kpi"><span class="kpi-num">' + esc(k.n) + '</span>' +
        '<span class="kpi-lab">' + esc(k.l) + '</span></div>';
    }).join('');
  }

  function taskPill(r) {
    if (r.behind) return '<span class="pill pill-behind">start was ' + relDays(r.daysUntilStart) + '</span>';
    if (r.daysUntilStart <= 3) return '<span class="pill pill-soon">start ' + relDays(r.daysUntilStart) + '</span>';
    return '<span class="pill pill-ok">start ' + relDays(r.daysUntilStart) + '</span>';
  }

  function courseDot(c) {
    if (!c) return '';
    return '<span class="course-dot" style="background:' + esc(c.colour || '#5B6270') + '"></span>';
  }

  function renderNow() {
    var box = $('nowList');
    var urgent = plan.behind.concat(plan.startingSoon);

    if (!plan.results.length) {
      box.innerHTML = '<div class="empty"><h3>Nothing here yet</h3>' +
        '<p>Add an assessment on the left, or see how it works with a ready-made semester.</p>' +
        '<button type="button" class="btn btn-primary" data-loaddemo>Load example semester</button></div>';
      return;
    }
    if (!urgent.length) {
      var next = plan.results.slice().sort(function (a, b) { return a.daysUntilStart - b.daysUntilStart; })[0];
      box.innerHTML = '<p class="muted">Nothing needs to begin in the next seven days. The next thing to start is <strong>' +
        esc(next.task.title) + '</strong> on ' + fmtLong(next.startline) + '.</p>';
      return;
    }

    box.innerHTML = '<ul class="tasklist">' + urgent.map(function (r) {
      return '<li class="taskrow' + (r.behind ? ' is-behind' : '') + '">' +
        '<span aria-hidden="true"></span>' +
        '<div><div class="task-title">' + courseDot(r.course) + esc(r.task.title) + '</div>' +
        '<div class="task-meta">' +
        (r.course ? esc(r.course.code) + ' &middot; ' : '') +
        r.effortHours + 'h of work &middot; due ' + fmt(r.due) + ' &middot; ' +
        round1(r.semesterWeight) + '% of semester' +
        '</div>' +
        '<div class="task-meta"><strong>Begin ' + fmtLong(r.startline) + '</strong></div></div>' +
        '<div>' + taskPill(r) + '</div>' +
        '</li>';
    }).join('') + '</ul>';
  }

  function chartScale() {
    var maxDemand = plan.weeks.reduce(function (m, w) { return Math.max(m, w.total); }, 0);
    return Math.max(plan.capacity * 1.45, maxDemand * 1.06, 1);
  }

  function renderChart() {
    var host = $('weekChart');
    var H = 150;

    if (!plan.weeks.length) { host.innerHTML = ''; $('legend').innerHTML = ''; return; }

    var scale = chartScale();
    var todayWeek = E.toISO(E.mondayOf(E.today()));

    var html = plan.weeks.map(function (w) {
      var base = Math.min(w.total, w.capacity) / scale * H;
      var excess = Math.max(0, w.total - w.capacity) / scale * H;
      var isNow = w.key === todayWeek;
      var label = fmt(w.start);
      var desc = 'Week of ' + fmtLong(w.start) + ': ' + round1(w.total) +
        ' hours needed against ' + round1(w.capacity) + ' available. ' + w.band.label + '.' +
        (w.debt > 0 ? ' ' + round1(w.debt) + ' of those hours are already overdue.' : '') +
        (w.gradeAtStake > 0 ? ' ' + round1(w.gradeAtStake) + ' percent of the semester grade is due this week.' : '');

      return '<button type="button" class="weekcol' + (isNow ? ' is-now' : '') +
        '" data-week="' + w.key + '" aria-pressed="' + (selectedWeek === w.key) + '" title="' + esc(desc) + '">' +
        '<span class="sr-only">' + esc(desc) + '</span>' +
        '<span class="weekcol-bars" aria-hidden="true">' +
        '<span class="weekcap" style="bottom:' + (w.capacity / scale * H).toFixed(1) + 'px"></span>' +
        (excess > 0 ? '<span class="weekbar-excess" style="height:' + excess.toFixed(1) + 'px"></span>' : '') +
        '<span class="weekbar weekbar-' + w.band.id + '" style="height:' + base.toFixed(1) + 'px"></span>' +
        '</span>' +
        '<span class="weeklabel" aria-hidden="true">' + esc(label) + (isNow ? '<br>now' : '') + '</span>' +
        '</button>';
    }).join('');

    host.innerHTML = html;

    var first = plan.weeks[0];
    var partialNote = (first && first.partial)
      ? ' This week is judged on the ' + round1(first.capacity) + ' hours left in it, not a full ' +
        round1(plan.capacity) + '.'
      : '';
    $('loadIntro').textContent =
      'The dashed line on each bar is the hours you have that week.' + partialNote +
      ' Anything hatched above the line is work with nowhere left to go. Select a week for detail.';

    var bands = [
      { id: 'light', label: 'Light' }, { id: 'steady', label: 'Steady' },
      { id: 'full', label: 'Full' }, { id: 'over', label: 'Over capacity' }
    ];
    $('legend').innerHTML = bands.map(function (b) {
      return '<span class="legend-item"><span class="legend-swatch weekbar-' + b.id + '"></span>' + b.label + '</span>';
    }).join('') +
      '<span class="legend-item"><span class="legend-swatch weekbar-excess"></span>Beyond your hours</span>' +
      (plan.debt > 0
        ? '<span class="legend-item"><strong>' + round1(plan.debt) +
          'h already overdue, carried onto this week</strong></span>'
        : '');
  }

  function renderTable() {
    var body = $('weekTable').querySelector('tbody');
    body.innerHTML = plan.weeks.map(function (w) {
      return '<tr><th scope="row" style="font-weight:500">' + esc(fmtLong(w.start)) + '</th>' +
        '<td class="num">' + round1(w.total) + (w.debt > 0 ? ' (incl. ' + round1(w.debt) + ' overdue)' : '') + '</td>' +
        '<td class="num">' + round1(w.capacity) + '</td>' +
        '<td>' + esc(w.band.label) + '</td>' +
        '<td class="num">' + (w.gradeAtStake > 0 ? round1(w.gradeAtStake) + '%' : '—') + '</td></tr>';
    }).join('');
  }

  function renderWeekDetail() {
    var box = $('weekDetail');
    if (!selectedWeek) { box.innerHTML = ''; return; }

    var w = plan.weeks.filter(function (x) { return x.key === selectedWeek; })[0];
    if (!w) { box.innerHTML = ''; return; }

    var working = plan.results.filter(function (r) {
      return r.days.some(function (d) { return E.toISO(E.mondayOf(d.iso)) === w.key; });
    });

    var html = '<div style="margin-top:var(--sp-4);border-top:1px solid var(--line);padding-top:var(--sp-4)">' +
      '<h3>Week of ' + esc(fmtLong(w.start)) + '</h3>' +
      '<p class="small muted">' + round1(w.total) + ' hours of work against ' + round1(w.capacity) +
      ' available. ' + esc(w.band.label) + '.' +
      (w.debt > 0 ? ' That includes ' + round1(w.debt) + ' hours that should already have been done.' : '') +
      (w.gradeAtStake > 0 ? ' ' + round1(w.gradeAtStake) + '% of your semester grade falls due.' : ' Nothing falls due.') +
      '</p>';

    if (w.ratio > 1) {
      html += '<p class="small" style="color:var(--over);font-weight:600">Short by ' +
        round1(w.total - w.capacity) + ' hours. Something has to shrink, slip, or take hours from somewhere else.</p>';
    }

    if (working.length) {
      html += '<ul class="tasklist">' + working.map(function (r) {
        var hrs = r.days.filter(function (d) { return E.toISO(E.mondayOf(d.iso)) === w.key; })
          .reduce(function (s, d) { return s + d.hours; }, 0);
        return '<li class="taskrow"><span aria-hidden="true"></span>' +
          '<div><div class="task-title">' + courseDot(r.course) + esc(r.task.title) + '</div>' +
          '<div class="task-meta">' + round1(hrs) + 'h this week &middot; due ' + fmt(r.due) + '</div></div>' +
          '<div></div></li>';
      }).join('') + '</ul>';
    } else {
      html += '<p class="small muted">No work scheduled in this week.</p>';
    }

    html += '<p><button type="button" class="btn btn-sm" id="btnClearWeek">Clear selection</button></p></div>';
    box.innerHTML = html;
  }

  function renderTimeline() {
    var host = $('timelineWrap');
    if (!plan.results.length) {
      host.innerHTML = '<div class="empty"><h3>No windows to draw</h3><p>Add an assessment to see its work window.</p></div>';
      return;
    }

    var t = E.today();
    var lo = plan.results.reduce(function (m, r) {
      return E.parseDate(r.startline) < m ? E.parseDate(r.startline) : m;
    }, t);
    var hi = plan.results.reduce(function (m, r) {
      return E.parseDate(r.due) > m ? E.parseDate(r.due) : m;
    }, t);
    lo = E.addDays(lo, -2); hi = E.addDays(hi, 2);
    var span = Math.max(1, E.diffDays(lo, hi));

    function pct(iso) { return (E.diffDays(lo, iso) / span) * 100; }

    var sorted = plan.results.slice().sort(function (a, b) {
      return E.parseDate(a.due) - E.parseDate(b.due);
    });

    var rows = sorted.map(function (r) {
      var left = pct(r.startline);
      var right = pct(r.due);
      var width = Math.max(0.8, right - left);
      var lbl = (r.course ? r.course.code + ' — ' : '') + r.task.title;
      return '<div class="tl-row">' +
        '<div class="tl-name" title="' + esc(lbl) + '">' + courseDot(r.course) + esc(r.task.title) + '</div>' +
        '<div class="tl-track">' +
        '<div class="tl-bar ' + (r.behind ? 'tl-bar-behind' : 'tl-bar-normal') + '" style="left:' +
        left.toFixed(2) + '%;width:' + width.toFixed(2) + '%"></div>' +
        '<div class="tl-now" style="left:' + pct(E.toISO(t)).toFixed(2) + '%"></div>' +
        '<div class="tl-due" style="left:' + Math.min(99.6, right).toFixed(2) + '%"></div>' +
        '</div></div>';
    }).join('');

    var mid = E.toISO(E.addDays(lo, Math.round(span / 2)));
    var axis = '<div class="tl-axis"><div></div><div class="tl-axis-marks">' +
      '<span>' + fmt(E.toISO(lo)) + '</span><span>' + fmt(mid) + '</span><span>' + fmt(E.toISO(hi)) + '</span>' +
      '</div></div>';

    host.innerHTML = '<div class="timeline">' + rows + axis + '</div>';
  }

  function renderAllList() {
    var box = $('allList');
    if (!state.tasks.length) {
      box.innerHTML = '<div class="empty"><h3>No assessments yet</h3>' +
        '<p>Use the form on the left, or explore a ready-made semester first.</p>' +
        '<button type="button" class="btn btn-primary" data-loaddemo>Load example semester</button></div>';
      return;
    }

    var byId = {};
    plan.results.forEach(function (r) { byId[r.task.id] = r; });

    var sorted = state.tasks.slice().sort(function (a, b) {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return E.parseDate(a.due) - E.parseDate(b.due);
    });

    box.innerHTML = '<ul class="tasklist">' + sorted.map(function (t) {
      var r = byId[t.id];
      var course = state.courses.filter(function (c) { return c.id === t.courseId; })[0];
      var meta = (course ? esc(course.code) + ' &middot; ' : '') +
        t.effortHours + 'h &middot; ' + t.weight + '% of course &middot; due ' + fmt(t.due);
      var startInfo = r
        ? '<div class="task-meta"><strong>Begin ' + fmtLong(r.startline) + '</strong>' +
          (r.unschedulable ? ' — there are not enough hours before this deadline, even starting today' : '') + '</div>'
        : '<div class="task-meta muted">Marked done</div>';

      return '<li class="taskrow' + (t.done ? ' is-done' : '') + (r && r.behind ? ' is-behind' : '') + '">' +
        '<input type="checkbox" class="task-check" data-done="' + t.id + '"' + (t.done ? ' checked' : '') +
        ' aria-label="Mark ' + esc(t.title) + ' as done">' +
        '<div><div class="task-title">' + courseDot(course) + esc(t.title) + '</div>' +
        '<div class="task-meta">' + meta + '</div>' + startInfo + '</div>' +
        '<div class="task-actions">' +
        '<button type="button" class="btn btn-sm" data-edit="' + t.id + '">Edit</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-del="' + t.id + '" aria-label="Delete ' + esc(t.title) + '">Delete</button>' +
        '</div></li>';
    }).join('') + '</ul>';
  }

  function renderCourses() {
    var box = $('courseList');
    if (!state.courses.length) {
      box.innerHTML = '<li class="small muted">No courses yet. Add one below.</li>';
      return;
    }
    box.innerHTML = state.courses.map(function (c) {
      var count = state.tasks.filter(function (t) { return t.courseId === c.id; }).length;
      return '<li class="taskrow" style="grid-template-columns:1fr auto">' +
        '<div><div class="task-title">' + courseDot(c) + esc(c.code) + '</div>' +
        '<div class="task-meta">' + esc(c.name) + ' &middot; ' + c.credits + ' credits &middot; ' +
        count + ' ' + plural(count, 'assessment') + '</div></div>' +
        '<div><button type="button" class="btn btn-sm btn-danger" data-delcourse="' + c.id +
        '" aria-label="Delete course ' + esc(c.code) + '">Delete</button></div></li>';
    }).join('');
  }

  function renderCourseSelect() {
    var sel = $('tCourse');
    var current = sel.value;
    sel.innerHTML = state.courses.length
      ? state.courses.map(function (c) {
          return '<option value="' + esc(c.id) + '">' + esc(c.code) + ' — ' + esc(c.name) + '</option>';
        }).join('')
      : '<option value="">Add a course first</option>';
    if (current && state.courses.some(function (c) { return c.id === current; })) sel.value = current;
  }

  /* ---------------- validation ---------------- */

  function setError(fieldId, errId, msg) {
    var f = $(fieldId), e = $(errId);
    if (msg) {
      f.classList.add('invalid');
      e.textContent = msg; e.hidden = false;
    } else {
      f.classList.remove('invalid');
      e.textContent = ''; e.hidden = true;
    }
    return !msg;
  }

  function validateTask() {
    var ok = true;
    ok = setError('f-title', 'e-title', $('tTitle').value.trim() ? '' : 'Give it a name so you recognise it later.') && ok;
    ok = setError('f-course', 'e-course', $('tCourse').value ? '' : 'Add a course first, then pick it here.') && ok;
    ok = setError('f-due', 'e-due', $('tDue').value ? '' : 'A deadline is needed to work backwards from.') && ok;

    var h = parseFloat($('tHours').value);
    ok = setError('f-hours', 'e-hours',
      (isFinite(h) && h >= 0 && h <= 300) ? '' : 'Enter the hours as a number between 0 and 300.') && ok;

    var w = parseFloat($('tWeight').value);
    ok = setError('f-weight', 'e-weight',
      (isFinite(w) && w >= 0 && w <= 100) ? '' : 'Enter a percentage between 0 and 100.') && ok;

    return ok;
  }

  function resetTaskForm() {
    editingTaskId = null;
    $('tTitle').value = '';
    $('tDue').value = '';
    $('tWeight').value = '';
    $('tType').value = 'essay';
    $('tHours').value = E.defaultHoursFor('essay');
    $('taskForm').querySelector('button[type=submit]').textContent = 'Add assessment';
    ['f-title|e-title', 'f-course|e-course', 'f-due|e-due', 'f-hours|e-hours', 'f-weight|e-weight']
      .forEach(function (p) { var s = p.split('|'); setError(s[0], s[1], ''); });
  }

  /* ---------------- wiring ---------------- */

  function init() {
    // task type options
    $('tType').innerHTML = E.TASK_TYPES.map(function (t) {
      return '<option value="' + t.id + '">' + esc(t.label) + '</option>';
    }).join('');

    state = load() || demoState();

    $('weeklyHours').value = state.settings.weeklyHours;
    $('semStart').value = state.settings.semesterStart;
    $('semEnd').value = state.settings.semesterEnd;
    resetTaskForm();
    recompute();

    /* settings */
    ['weeklyHours', 'semStart', 'semEnd'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var h = parseFloat($('weeklyHours').value);
        state.settings.weeklyHours = (isFinite(h) && h > 0) ? Math.min(80, h) : 15;
        $('weeklyHours').value = state.settings.weeklyHours;
        if ($('semStart').value) state.settings.semesterStart = $('semStart').value;
        if ($('semEnd').value) state.settings.semesterEnd = $('semEnd').value;
        if (E.parseDate(state.settings.semesterEnd) <= E.parseDate(state.settings.semesterStart)) {
          state.settings.semesterEnd = E.toISO(E.addDays(E.parseDate(state.settings.semesterStart), 84));
          $('semEnd').value = state.settings.semesterEnd;
          toast('Semester end moved after the start date.');
        }
        selectedWeek = null;
        recompute();
      });
    });

    /* type changes prefill hours, but never overwrite a number you typed */
    $('tType').addEventListener('change', function () {
      var current = parseFloat($('tHours').value);
      var wasDefault = E.TASK_TYPES.some(function (t) { return t.hours === current; });
      if (!$('tHours').value || wasDefault) {
        $('tHours').value = E.defaultHoursFor($('tType').value);
      }
    });

    /* add / update assessment */
    $('taskForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!validateTask()) {
        var bad = $('taskForm').querySelector('.invalid input, .invalid select');
        if (bad) bad.focus();
        return;
      }
      var payload = {
        courseId: $('tCourse').value,
        title: $('tTitle').value.trim(),
        type: $('tType').value,
        due: $('tDue').value,
        effortHours: parseFloat($('tHours').value),
        weight: parseFloat($('tWeight').value)
      };

      if (editingTaskId) {
        state.tasks = state.tasks.map(function (t) {
          return t.id === editingTaskId ? Object.assign({}, t, payload) : t;
        });
        toast('Assessment updated.');
      } else {
        payload.id = uid();
        payload.done = false;
        state.tasks.push(payload);
        toast('Added. Its start date is in the list below.');
      }
      resetTaskForm();
      recompute();
      $('tTitle').focus();
    });

    /* add course */
    $('courseForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var code = $('cCode').value.trim();
      if (!code) {
        setError('f-ccode', 'e-ccode', 'A course code is needed.');
        $('cCode').focus();
        return;
      }
      setError('f-ccode', 'e-ccode', '');
      var credits = parseInt($('cCredits').value, 10);
      state.courses.push({
        id: uid(), code: code,
        name: $('cName').value.trim() || code,
        credits: (isFinite(credits) && credits > 0) ? credits : 3,
        colour: COURSE_COLOURS[state.courses.length % COURSE_COLOURS.length]
      });
      $('cCode').value = ''; $('cName').value = ''; $('cCredits').value = 3;
      recompute();
      toast('Course added.');
      $('cCode').focus();
    });

    /* delegated actions across the results column */
    document.addEventListener('click', function (ev) {
      var el = ev.target.closest ? ev.target.closest('[data-del],[data-edit],[data-delcourse],[data-week],[data-loaddemo],#btnClearWeek') : null;
      if (!el) return;

      if (el.hasAttribute('data-loaddemo')) { loadDemo(); return; }

      if (el.id === 'btnClearWeek') {
        selectedWeek = null; renderChart(); renderWeekDetail(); return;
      }
      if (el.hasAttribute('data-week')) {
        var k = el.getAttribute('data-week');
        selectedWeek = (selectedWeek === k) ? null : k;
        renderChart(); renderWeekDetail();
        return;
      }
      if (el.hasAttribute('data-del')) {
        var id = el.getAttribute('data-del');
        var t = state.tasks.filter(function (x) { return x.id === id; })[0];
        if (t && window.confirm('Delete "' + t.title + '"?')) {
          state.tasks = state.tasks.filter(function (x) { return x.id !== id; });
          if (editingTaskId === id) resetTaskForm();
          recompute();
          toast('Deleted.');
        }
        return;
      }
      if (el.hasAttribute('data-delcourse')) {
        var cid = el.getAttribute('data-delcourse');
        var c = state.courses.filter(function (x) { return x.id === cid; })[0];
        var n = state.tasks.filter(function (x) { return x.courseId === cid; }).length;
        var msg = n
          ? 'Delete ' + c.code + ' and its ' + n + ' ' + plural(n, 'assessment') + '?'
          : 'Delete ' + c.code + '?';
        if (window.confirm(msg)) {
          state.courses = state.courses.filter(function (x) { return x.id !== cid; });
          state.tasks = state.tasks.filter(function (x) { return x.courseId !== cid; });
          recompute();
          toast('Course removed.');
        }
        return;
      }
      if (el.hasAttribute('data-edit')) {
        var eid = el.getAttribute('data-edit');
        var task = state.tasks.filter(function (x) { return x.id === eid; })[0];
        if (!task) return;
        editingTaskId = eid;
        $('tTitle').value = task.title;
        $('tCourse').value = task.courseId;
        $('tType').value = task.type || 'essay';
        $('tDue').value = task.due;
        $('tHours').value = task.effortHours;
        $('tWeight').value = task.weight;
        $('taskForm').querySelector('button[type=submit]').textContent = 'Save changes';
        $('tTitle').focus();
        if (typeof $('tTitle').scrollIntoView === 'function') {
          $('tTitle').scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    });

    document.addEventListener('change', function (ev) {
      var cb = ev.target;
      if (!cb.hasAttribute || !cb.hasAttribute('data-done')) return;
      var id = cb.getAttribute('data-done');
      state.tasks = state.tasks.map(function (t) {
        return t.id === id ? Object.assign({}, t, { done: cb.checked }) : t;
      });
      recompute();
    });

    /* chart / table toggle */
    $('btnToggleView').addEventListener('click', function () {
      asTable = !asTable;
      $('chartWrap').hidden = asTable;
      $('tableWrap').hidden = !asTable;
      this.setAttribute('aria-pressed', String(asTable));
      this.textContent = asTable ? 'Show as a chart' : 'Show as a table';
    });

    /* data controls */
    $('btnDemo').addEventListener('click', function () {
      if (state.tasks.length && !window.confirm('This replaces what is currently here. Continue?')) return;
      loadDemo();
    });
    $('btnIcs').addEventListener('click', function () {
      if (!plan.results.length) { toast('Nothing to put in a calendar yet.'); return; }
      download('startline.ics', E.toICS(plan), 'text/calendar;charset=utf-8');
      toast('Calendar file downloaded. Import it into any calendar app.');
    });

    $('btnExport').addEventListener('click', function () {
      download('startline-semester.json', JSON.stringify(state, null, 2), 'application/json');
      toast('Exported.');
    });

    $('btnImportTrigger').addEventListener('click', function () { $('fileImport').click(); });

    $('fileImport').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          if (!data || !data.settings || !Array.isArray(data.courses) || !Array.isArray(data.tasks)) {
            throw new Error('shape');
          }
          state = data;
          $('weeklyHours').value = state.settings.weeklyHours;
          $('semStart').value = state.settings.semesterStart;
          $('semEnd').value = state.settings.semesterEnd;
          selectedWeek = null;
          resetTaskForm();
          recompute();
          toast('Imported.');
        } catch (err) {
          toast('That file is not a Startline export.');
        }
      };
      reader.onerror = function () { toast('That file could not be read.'); };
      reader.readAsText(file);
      ev.target.value = '';
    });

    $('btnReset').addEventListener('click', function () {
      if (!window.confirm('Erase every course and assessment stored in this browser?')) return;
      try { localStorage.removeItem(KEY); } catch (err) { /* nothing to do */ }
      state = blankState();
      $('weeklyHours').value = state.settings.weeklyHours;
      $('semStart').value = state.settings.semesterStart;
      $('semEnd').value = state.settings.semesterEnd;
      selectedWeek = null;
      resetTaskForm();
      recompute();
      toast('Everything erased.');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
