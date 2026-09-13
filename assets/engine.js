/* Startline — scheduling engine.
   Pure functions only. No DOM access in this file.

   The idea: a deadline tells you when work must END. It says nothing about
   when it must BEGIN. Begin-time depends on how much work the task takes and
   how many hours you actually have free between now and then — and crucially,
   on what ELSE is competing for those same hours.

   So we schedule every task backwards from its deadline into a shared pool of
   daily hours. The earliest day a task claims is its "startline".
*/

(function (root) {
  'use strict';

  /* ---------- date helpers ----------
     All dates are handled as local-midnight Date objects built from
     'YYYY-MM-DD' strings. We never use new Date('2026-03-04') because that
     parses as UTC and shifts by a day in UTC+4 (Dubai), which would silently
     put every startline one day early. */

  function parseDate(iso) {
    if (iso instanceof Date) return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate());
    var p = String(iso).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function toISO(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function diffDays(a, b) {
    // whole days from a to b; DST-safe because we round the ms difference
    return Math.round((parseDate(b) - parseDate(a)) / 86400000);
  }

  function mondayOf(d) {
    var x = parseDate(d);
    var wd = x.getDay();              // 0 Sun .. 6 Sat
    var back = (wd === 0) ? 6 : wd - 1; // ISO weeks start Monday
    return addDays(x, -back);
  }

  function today() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  /* ---------- effort defaults ----------
     Used only to pre-fill the form. The student can always override.
     These are starting guesses, not claims about how long work "should" take. */

  var TASK_TYPES = [
    { id: 'essay',        label: 'Essay or report',      hours: 12 },
    { id: 'problem-set',  label: 'Problem set',          hours: 5  },
    { id: 'exam',         label: 'Exam',                 hours: 15 },
    { id: 'quiz',         label: 'Quiz',                 hours: 3  },
    { id: 'lab',          label: 'Lab or practical',     hours: 6  },
    { id: 'presentation', label: 'Presentation',         hours: 8  },
    { id: 'project',      label: 'Project',              hours: 25 },
    { id: 'reading',      label: 'Reading or prep',      hours: 4  }
  ];

  function defaultHoursFor(typeId) {
    for (var i = 0; i < TASK_TYPES.length; i++) {
      if (TASK_TYPES[i].id === typeId) return TASK_TYPES[i].hours;
    }
    return 6;
  }

  /* ---------- the scheduler ----------

     Strategy: greedy just-in-time backward allocation.

     Tasks are processed in deadline order (earliest first). Each task claims
     hours starting from the day before it is due and walking backwards, taking
     whatever capacity is still unclaimed on each day. The earliest day it
     claims becomes its startline.

     Why earliest-deadline-first: a task due Monday has fewer places to go than
     one due in six weeks, so it gets first claim on the days nearest its own
     deadline. Later tasks are pushed further back, which is exactly what
     happens in real life.

     Why just-in-time rather than spreading evenly: it produces the LATEST
     possible honest start date. If even that date is in the past, the student
     is provably behind — there is no optimistic reading left. That is the
     signal worth surfacing.

     This is deliberately greedy, not optimal. An optimal multi-resource
     schedule is NP-hard and, more importantly, unexplainable to the person
     relying on it. A student must be able to look at a startline and
     understand why it says what it says. */

  function schedule(state, nowArg) {
    var now = nowArg ? parseDate(nowArg) : today();
    var cap = Math.max(0.5, Number(state.settings.weeklyHours) || 15);
    var perDay = cap / 7;

    var courseById = {};
    var totalCredits = 0;
    (state.courses || []).forEach(function (c) {
      courseById[c.id] = c;
      totalCredits += Number(c.credits) || 0;
    });

    var live = (state.tasks || []).filter(function (t) { return !t.done; });
    live.sort(function (a, b) {
      var d = parseDate(a.due) - parseDate(b.due);
      if (d !== 0) return d;
      return (Number(b.effortHours) || 0) - (Number(a.effortHours) || 0);
    });

    var dayFree = Object.create(null);   // iso -> hours still unclaimed
    var dayLoad = Object.create(null);   // iso -> hours claimed
    var results = [];

    live.forEach(function (t) {
      var effort = Math.max(0, Number(t.effortHours) || 0);
      var remaining = effort;
      var cursor = addDays(parseDate(t.due), -1); // finish the day before it's due
      var days = [];
      var guard = 0;

      while (remaining > 0.005 && guard < 500) {
        var iso = toISO(cursor);
        if (!(iso in dayFree)) dayFree[iso] = perDay;
        var take = Math.min(dayFree[iso], remaining);
        if (take > 0.005) {
          dayFree[iso] -= take;
          dayLoad[iso] = (dayLoad[iso] || 0) + take;
          days.push({ iso: iso, hours: take });
          remaining -= take;
        }
        cursor = addDays(cursor, -1);
        guard++;
      }

      var startIso = days.length ? days[days.length - 1].iso : toISO(addDays(parseDate(t.due), -1));
      var course = courseById[t.courseId];
      var credits = course ? (Number(course.credits) || 0) : 0;
      var semesterWeight = totalCredits > 0
        ? (Number(t.weight) || 0) * (credits / totalCredits)
        : 0;

      results.push({
        task: t,
        course: course || null,
        startline: startIso,
        due: t.due,
        effortHours: effort,
        days: days,
        windowDays: diffDays(startIso, t.due),
        daysUntilStart: diffDays(now, startIso),
        daysUntilDue: diffDays(now, t.due),
        semesterWeight: semesterWeight,
        unschedulable: remaining > 0.005,
        behind: diffDays(now, startIso) < 0
      });
    });

    /* ---- weekly aggregation ----

       A week's demand can never exceed its capacity: the allocator caps every
       day at perDay, so there is no such thing as a vertically overloaded week.

       Overload here is TEMPORAL. When a task cannot fit in the days remaining
       before its deadline, the allocator walks backwards past today — and
       those hours are gone. They have to be made up out of the time that is
       actually left. That carried-forward figure is the debt, and it lands on
       the current week, which is the only week you can still act on.

       Past weeks are not drawn at all. This is a planner, not a diary. */

    var weeks = Object.create(null);
    var currentKey = toISO(mondayOf(now));

    function makeWeek(key) {
      if (!weeks[key]) {
        weeks[key] = {
          key: key,
          start: key,
          end: toISO(addDays(parseDate(key), 6)),
          demand: 0,      // hours scheduled from today onward
          debt: 0,        // hours whose scheduled days have already gone
          capacity: cap,
          gradeAtStake: 0,
          due: []
        };
      }
      return weeks[key];
    }

    // bucket a date into a week, never earlier than the current week
    function weekBucket(iso) {
      var key = toISO(mondayOf(iso));
      if (parseDate(key) < parseDate(currentKey)) key = currentKey;
      return makeWeek(key);
    }

    // seed from this week through to whichever comes last: the end of the
    // semester, the final deadline, or this week itself
    var lastDay = parseDate(currentKey);
    if (state.settings.semesterEnd && parseDate(state.settings.semesterEnd) > lastDay) {
      lastDay = parseDate(state.settings.semesterEnd);
    }
    results.forEach(function (r) {
      if (parseDate(r.due) > lastDay) lastDay = parseDate(r.due);
    });

    var cursorWeek = parseDate(currentKey);
    var lastWeek = mondayOf(lastDay);
    var safety = 0;
    while (cursorWeek <= lastWeek && safety < 120) {
      makeWeek(toISO(cursorWeek));
      cursorWeek = addDays(cursorWeek, 7);
      safety++;
    }

    var debt = 0;
    results.forEach(function (r) {
      r.days.forEach(function (d) {
        if (parseDate(d.iso) < now) debt += d.hours;
        else weekBucket(d.iso).demand += d.hours;
      });
      var b = weekBucket(r.due);
      b.gradeAtStake += r.semesterWeight;
      b.due.push(r);
    });

    var weekList = Object.keys(weeks).map(function (k) { return weeks[k]; });
    weekList.sort(function (a, b) { return parseDate(a.start) - parseDate(b.start); });

    /* The current week is nearly always partial. Judging Friday's remaining
       load against a whole week's hours would flatter it badly, so its
       capacity is pro-rated to the days that are actually left. */
    if (weekList.length) {
      weekList[0].debt = debt;
      var daysLeft = Math.max(1, Math.min(7, diffDays(now, weekList[0].end) + 1));
      weekList[0].capacity = perDay * daysLeft;
      weekList[0].daysLeft = daysLeft;
      weekList[0].partial = daysLeft < 7;
    }

    weekList.forEach(function (wk) {
      wk.total = wk.demand + wk.debt;
      wk.ratio = wk.capacity > 0 ? wk.total / wk.capacity : 0;
      wk.band = bandFor(wk.ratio);
    });

    /* ---- alerts, ordered by how urgent they are ---- */
    var behind = results.filter(function (r) { return r.behind; })
      .sort(function (a, b) { return b.semesterWeight - a.semesterWeight; });

    var startingSoon = results.filter(function (r) {
      return !r.behind && r.daysUntilStart <= 7;
    }).sort(function (a, b) { return a.daysUntilStart - b.daysUntilStart; });

    var overloaded = weekList.filter(function (wk) { return wk.ratio > 1; });

    return {
      results: results,
      weeks: weekList,
      dayLoad: dayLoad,
      totalCredits: totalCredits,
      behind: behind,
      startingSoon: startingSoon,
      overloaded: overloaded,
      totalEffort: results.reduce(function (s, r) { return s + r.effortHours; }, 0),
      capacity: cap,
      debt: debt,
      now: toISO(now)
    };
  }

  /* Load bands. Colour is never the only carrier of this — every band has a
     written label too, for colour-blind users and screen readers. */
  function bandFor(ratio) {
    if (ratio <= 0.001) return { id: 'clear', label: 'Clear' };
    if (ratio < 0.6)    return { id: 'light', label: 'Light' };
    if (ratio < 0.9)    return { id: 'steady', label: 'Steady' };
    if (ratio <= 1.0)   return { id: 'full', label: 'Full' };
    if (ratio <= 1.4)   return { id: 'over', label: 'Over capacity' };
    return { id: 'severe', label: 'Far over capacity' };
  }

  /* ---------- iCalendar export ----------
     Produces real .ics text. Startlines become all-day events, deadlines
     become all-day events too. Generated entirely in the browser — no server,
     no account, no data leaving the device. */

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;')
      .replace(/,/g, '\\,').replace(/\n/g, '\\n');
  }

  function icsDate(iso) { return String(iso).replace(/-/g, ''); }

  function fold(line) {
    // RFC 5545 says lines over 75 octets must be folded.
    if (line.length <= 73) return line;
    var out = line.slice(0, 73);
    var rest = line.slice(73);
    while (rest.length > 72) { out += '\r\n ' + rest.slice(0, 72); rest = rest.slice(72); }
    return out + '\r\n ' + rest;
  }

  function toICS(plan) {
    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Startline//Semester planner//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Startline'
    ];
    var stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    plan.results.forEach(function (r) {
      var name = r.course ? r.course.code : 'Course';

      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + r.task.id + '-start@startline');
      lines.push('DTSTAMP:' + stamp);
      lines.push('DTSTART;VALUE=DATE:' + icsDate(r.startline));
      lines.push('DTEND;VALUE=DATE:' + icsDate(toISO(addDays(parseDate(r.startline), 1))));
      lines.push(fold('SUMMARY:' + icsEscape('Start: ' + r.task.title + ' (' + name + ')')));
      lines.push(fold('DESCRIPTION:' + icsEscape(
        'Startline computed by Startline. ' + r.effortHours + 'h of work, due ' +
        r.due + '. Starting later than today means finishing late or cutting quality.')));
      lines.push('END:VEVENT');

      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + r.task.id + '-due@startline');
      lines.push('DTSTAMP:' + stamp);
      lines.push('DTSTART;VALUE=DATE:' + icsDate(r.due));
      lines.push('DTEND;VALUE=DATE:' + icsDate(toISO(addDays(parseDate(r.due), 1))));
      lines.push(fold('SUMMARY:' + icsEscape('Due: ' + r.task.title + ' (' + name + ')')));
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  root.SLEngine = {
    parseDate: parseDate, toISO: toISO, addDays: addDays, diffDays: diffDays,
    mondayOf: mondayOf, today: today,
    TASK_TYPES: TASK_TYPES, defaultHoursFor: defaultHoursFor,
    schedule: schedule, bandFor: bandFor, toICS: toICS
  };

})(typeof window !== 'undefined' ? window : globalThis);
