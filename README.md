# Startline

A semester planner that runs backwards. You enter your courses, your assessments and
the hours you actually have free in a week; it returns the last honest day you can
begin each piece of work.

Built for **DesignAthon 2026** — GDC RIT Dubai in partnership with +TWE.

## The idea

A deadline is a fact about the work. A start date is a fact about your life — it depends
on how long the work takes, how many hours you really have, and what else is competing
for those same hours. No calendar computes it, so nobody knows it, and students discover
collisions in the week they happen rather than the month before.

Startline computes it.

## Running it

It is three static HTML files with no build step and no dependencies. Open `index.html`
in a browser, or serve the folder:

```
python3 -m http.server 8000
```

## Deploying to GitHub Pages

1. Create a public repository and push these files to the root of the `main` branch.
2. Repository **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**; pick `main` and `/ (root)`. Save.
4. Wait a minute or two, then load `https://<your-username>.github.io/<repo-name>/`.

There is no build step, so nothing else needs configuring.

## Structure

```
index.html              landing page — the problem in one picture
planner.html            the working tool
problem-solution.html   problem, research, solution, why it matters
assets/engine.js        scheduling and iCalendar generation (no DOM access)
assets/app.js           state, rendering, interaction
assets/styles.css       design tokens and layout
tests/engine.test.js    75 unit tests for the scheduler
tests/dom.test.js       75 integration tests driving the real UI
```

## Tests

The scheduler is separated from the interface precisely so it can be tested on its own.

```
node tests/engine.test.js          # no dependencies
npm install jsdom                  # for the integration tests only
node tests/dom.test.js
```

`engine.test.js` covers date arithmetic across month, year and leap boundaries, backward
allocation, contention between assessments competing for the same hours, credit-weighted
grade maths, debt carried from missed days, week aggregation, and RFC 5545 line folding
and escaping in the calendar export.

`dom.test.js` loads `planner.html` in a real DOM and exercises adding, editing, completing
and deleting assessments, form validation, week selection, the chart/table toggle, import
and export, reset, and an accessibility surface check.

## How the scheduling works

1. Weekly hours are divided across seven days to give a daily budget.
2. Assessments are taken in deadline order, nearest first.
3. Each claims hours backwards from the day before it is due, taking whatever remains
   unclaimed on each day and walking further back when a day is full. The earliest day it
   claims is its **startline**.
4. Hours that end up scheduled before today are **debt** — they cannot be done, so they are
   carried onto the current week, whose capacity is pro-rated to the days actually left in it.
5. Grade at stake per week weights each assessment by its course credits.

Greedy and just-in-time by design. It yields the *latest* honest start date, so when that
date has already passed there is no optimistic reading left. An optimal multi-deadline
schedule is computationally hard and, worse, impossible for a student to argue with.

## Privacy

No account, no server, no analytics, no third-party scripts. State lives in `localStorage`
on the device and can be exported or erased from the planner. The calendar file is generated
in the browser.
