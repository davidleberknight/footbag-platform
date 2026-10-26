---
name: page-check
description: Use after changing a page (template, stylesheet, client script, or a page-shaping service) to measure and drive it on the dev stack without screenshots, or when asked to check a page. Reports layout, behaviour and console problems.
---

# Page Check

## When

- On request, to check a page, the whole page, or named sections.
- After any change to a page (template, stylesheet, client script, or a service that shapes a page), before calling it done.

## Scope

Decide what to drive from the change:
- **Targeted sections:** the areas the change touched, plus whatever shares their partial, stylesheet rule or service shaping.
- **Whole page:** a new page, a layout or stylesheet change, or a request for the whole page.
- **Every impacted page:** a shared partial, stylesheet or service reaches more than one page; check each.

Sign in through the dev persona switch (`/dev/switch?as=<slug>`, or `--as <slug>` on `npm run style -- url`) for member and admin pages; `/dev/personas` lists the slugs. A plain launch seeds none: when the database lacks the slug, ask before adding them (`./run_dev.sh --seed-test-personas`) or rebuilding. A data-dependent page needs current data: when the dev database is stale for the change, ask before rebuilding it.

## The check

On the dev server (port 3000), with no screenshots. If one already answers on 3000, use it: `./run_dev.sh` kills whatever holds ports 3000, 4001 and 3100. Start it only when none answers, and stop it when the check is done. After a stylesheet edit, restart the server you started before measuring: the served stylesheet is memoized per process.

1. Measure layout first with the rendered-style helper: `npm run style -- url <path> [--as <persona>]` measures the page as the browser draws it at phone and laptop widths (390 and 1280) and judges it against the site's layout rules. Report every finding in scope. For a stylesheet change that reaches many pages, `npm run style -- check` runs the whole-site comparison against its known-findings baseline.
2. With the Playwright MCP tools, navigate and read the accessibility snapshot: the changed content is present and correct, and nothing near it broke.
3. Exercise every changed link, control and form, including refusal paths; each lands where its label says.
   For a page a client script enhances (`src/public/js/`), also load it with JavaScript off at both widths: every measurement above runs with scripts on.
4. Read console and network errors.
5. Close the browser.

A missing or broken browser tool is a blocker to fix or report, never a reason to skip. A defect found is fixed, with a test where a test can catch it.

## Report and stop

Stop when every page and section in scope has been checked. Report each URL, width and persona; what was checked; every failure, layout finding, layout-shift note (a note, never a rule) or console error, or "none".
