# DesignAthon 2026 — submission pack

Everything here is for you, not for the judges. Do **not** put this file in the repo.

---

## 1. Before you post — three things only you can do

### a) Replace the survey placeholder (highest priority)

`problem-solution.html`, section 2, has a clearly marked block that says
**"Replace this block with your own survey results."** It is styled to be impossible to
miss. It must not ship as-is.

Criterion 1 of the rubric gives **3 points for "relevant research or evidence supporting
the identified problem."** The three academic citations already on the page are real and
will carry some of that. Primary research you ran yourself carries more, because the rubric
says *research you did*.

**The survey takes about an hour.** Post these six questions in a class or hall WhatsApp
group, aim for 20–30 replies:

1. How many courses are you taking this semester?
2. Roughly how many hours a week are genuinely free for coursework, after classes, work, travel and sleep?
3. Do you keep your deadlines anywhere? Where?
4. For your last major assignment, when did you intend to start, and when did you actually start?
5. Has more than one significant deadline ever landed in the same week without you seeing it coming? What happened?
6. Have you ever worked out, in advance, the date you needed to begin something? If not, why not?

Then write up: sample size, how you recruited, the intended-vs-actual gap from Q4, and the
share answering "no" to Q6. **Report whatever you actually find, including anything that
contradicts the argument.** A judge can tell the difference between honest small-sample
findings and impressive vague ones, and the honest version scores better.

If you genuinely cannot run it, delete the block entirely rather than inventing numbers.
A page with three real citations beats a page with one fabricated statistic.

### b) Put your name on it

The footers currently credit the event, not you. Add your name wherever the competition
expects attribution.

### c) Check the example semester reads right

`assets/app.js` → `demoState()` uses ISTE-121, MATH-181, ECON-201, NSSA-221 and ENGL-210.
Swap any that look wrong for RIT Dubai.

---

## 2. The +TWE post

The guide requires exactly four things in the post: the problem, your solution, the project
link, and the hashtag. Paste this, swapping in your real URL.

> This is my submission for DesignAthon 2026.
>
> **The Problem:**
> Students are not short of tools that store deadlines — they are short of the one number no
> tool gives them: the day a piece of work has to *begin* if it is going to be finished
> properly. A deadline is handed to you. A start date has to be calculated from how long the
> work takes, how many hours you actually have free, and what every other course is demanding
> in the same weeks. Nobody does that calculation, so collisions get discovered in the week
> they happen instead of the month before.
>
> **My Solution:**
> Startline is a semester planner that runs backwards. You enter your courses, your
> assessments and one honest number — the hours you really have free in a week — and it
> returns the last day you can start each piece of work, with clashes between assessments
> already resolved. It shows which weeks will break before you reach them, how much of your
> semester grade falls due in each one, and which assessments needed to begin before today.
> You can export the start dates to any calendar app. No account, no server, nothing leaves
> your device.
>
> It is built on three findings: roughly 80–95% of students procrastinate on coursework
> (Steel, 2007); students underestimate duration so reliably that in one study their own
> worst-case estimate was still shorter than the actual average (Buehler, Griffin & Ross,
> 1994); and deciding in advance *when* you will act has a medium-to-large effect on whether
> you do it (Gollwitzer & Sheeran, 2006). The start date is the one thing no planner computes
> and the evidence says matters most.
>
> **Project Link:** https://YOUR-USERNAME.github.io/YOUR-REPO/
>
> #designathon2026

**Check the hashtag character by character before posting.** The admin's message says
contestants keep mistyping it and that it is how submissions get found. It is lowercase,
no spaces, no hyphen: `#designathon2026`

---

## 3. Pre-submission checklist

- [ ] Survey block replaced with real results, or deleted
- [ ] Site pushed to a **public** repo, GitHub Pages enabled, live URL loads
- [ ] Nav item reads exactly `Problem & Solution` — ampersand, not "and"
- [ ] That page contains all four required parts: the problem, mini research, the solution, why it matters
- [ ] Opened the live URL on a phone and used it
- [ ] Clicked "Load example semester" on the live site and confirmed it works
- [ ] Downloaded the .ics and opened it in a calendar app
- [ ] `#designathon2026` spelled correctly in the post
- [ ] Project link in the post is the live site, not the repo
- [ ] You can explain the scheduling rule out loud without reading it

---

## 4. Where the site earns its marks

| Rubric criterion | Pts | Where it's addressed |
|---|---|---|
| **1. Problem understanding & validation** | 10 | Problem & Solution §1–2: a specific problem, three real citations, four named affected groups with *how they differ*, and a "what this does not fix" section |
| **2. Solution quality & innovation** | 10 | §3: computing a start date rather than storing a deadline; the shared-hours collision model; an explicit "what I deliberately left out" list for the "purposeful rather than complex" points |
| **3. Usability & accessibility** | 10 | Example semester loads on first visit; §6 lists the accessibility work; chart has a full data-table equivalent; colour never the sole signal |
| **4. UI design & visual communication** | 10 | One saturated colour ramp reserved for data; Archivo + IBM Plex Sans; hero states the whole thesis in one image; consistent across all three pages |
| **5. Execution & technical implementation** | 10 | Every feature described is live and testable; 150 passing tests in `tests/`; responsive; real .ics export |

**The two 4-point items in criterion 5** — "fully translated into the website" and "core
features working and testable by judges" — are 8 of the 50 points and the most common place
submissions lose marks, because most will be static mockups of an app that does not exist.
Everything on this site works. Make sure a judge notices in the first thirty seconds: the
example semester loads automatically, so the tool is already full of data when the page opens.

---

## 5. Questions a judge might ask, and the honest answers

**"Why greedy instead of optimal scheduling?"**
Optimal multi-deadline scheduling is NP-hard, and an optimal answer is unexplainable. A
student who cannot see why a date is what it is will not trust it when it says something
unwelcome — which is exactly when it matters.

**"Your effort estimates come from the user, and the research says users are bad at estimating."**
Correct, and it's stated as a limitation on the page. The tool corrects for collisions, not
optimism. Its defence is that changing one estimate takes a second and visibly rearranges the
whole semester, which makes a bad guess obvious instead of hidden.

**"Why no accounts or sync?"**
It's useful within sixty seconds. An email gate loses most of the people it's for, and it
would mean holding student data with no reason to hold it.

**"What would you build next?"**
Reading deadlines straight out of a syllabus PDF — manual entry is the biggest barrier to
adoption. Then per-day capacity instead of averaging across seven days.

**"Did you use AI to build this?"**
Answer honestly, whatever the truth is. The guide is silent on AI, which is not the same as
permission — ask the organisers in the WhatsApp group before submitting, so you are not
answering that question for the first time in front of a judge.
