---
name: page-check
disable-model-invocation: true
description: Targeted browser check of a page without screenshots, led by the rendered-style layout helper: measures and drives the page, or just the sections a change touched, on the dev stack and reports layout, behaviour and console problems. Human-invoked; the add-public-page skill follows it by path after every page change.
---

# Page Check

## When

- On request, to check a page, the whole page, or named sections.
- After any change to a page (template, stylesheet, client script, or a service that shapes a page), before calling it done, when the add-public-page skill directs here.

## Scope

Decide what to drive from the change:
- **Targeted sections:** the areas the change touched, plus whatever shares their partial, stylesheet rule or service shaping.
- **Whole page:** a new page, a layout or stylesheet change, or a request for the whole page.
- **Every impacted page:** a shared partial, stylesheet or service reaches more than one page; check each.

Sign in through the dev persona switch for member and admin pages. A data-dependent page needs current data: when the dev database is stale for the change, ask before rebuilding it.

## The check

On the dev server (`./run_dev.sh`, port 3000), with no screenshots:

1. Measure layout first with the rendered-style helper: `npm run style -- url <path> [--as <persona>]` measures the page as the browser draws it at phone and laptop widths (390 and 1280) and judges it against the site's layout rules. Report every finding in scope. For a stylesheet change that reaches many pages, `npm run style -- check` runs the whole-site comparison against its known-findings baseline.
2. With the Playwright MCP tools, navigate and read the accessibility snapshot: the changed content is present and correct, and nothing near it broke.
3. Exercise every changed link, control and form, including refusal paths; each lands where its label says.
4. Read console and network errors.
5. Close the browser.

A missing or broken browser tool is a blocker to fix or report, never a reason to skip. A defect found is fixed, with a test where a test can catch it.

## Report and stop

Stop when every page and section in scope has been checked. Report each URL, width and persona; what was checked; every failure, layout finding or console error, or "none".
