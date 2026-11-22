#!/usr/bin/env bash
# Wording gate, defense-in-depth behind the root CLAUDE.md rule that public UI wording
# changes only on explicit human instruction. An Edit, Write or MultiEdit that adds text
# a site visitor reads (template copy and visible attributes, prose string literals in
# server and client code, email subjects and bodies) asks the human once, the prompt
# saying that a human must approve this change to visible UI copy and naming the file,
# each changed line before and after, and the new text. It passes silently when the
# human already approved that text.
#
# Wording is judged in whole units: a text node or visible attribute in a template, a
# prose string literal in code. Only a unit the file did not already hold is new
# wording, so text that is deleted, moved or repeated from elsewhere in the same file
# passes, and so do code directives such as 'use strict'.
#
# Approval is read from the session transcript. A message the human typed counts
# (origin.kind "human", including one sent while Claude was working), and so does a plan
# the human approved through ExitPlanMode: the plan whose tool result Claude Code
# reports as approved, as the human last saw and edited it. Nothing else counts: never
# another tool result, a rejected or unanswered plan, hook feedback, a task
# notification, a compaction summary or Claude's own text. Either approves a unit when
# it contains the unit's words; a typed message also approves one when it opens with a
# yes and the Claude text it answers contains them, as a literal BEFORE/AFTER shows it.
# A unit of under three words also needs the file's name in that text, so a common word
# in some message cannot approve it.
#
# Pre-approval: a human message such as "approve all technical UI wording" or
# "approve ui edits" lets technical words through for the rest of the session without a
# prompt, each unit still announced to the human. A later message such as "stop
# approving UI wording" ends it. Only a typed message grants or ends it, never a plan.
# One test applies whatever the medium, page or email: a technical word is a label,
# button, badge or short status word; prose is a unit that reads as a sentence (six or
# more words, placeholders not counted, or a sentence ending on three or more words or
# on the lowercase tail of a split sentence). Prose always asks under a pre-approval;
# a typed message or approved plan that shows it approves it like any other unit.
#
# Every ask says why: the text was in no message the human typed or plan they approved,
# and either no pre-approval is in force or the one in force does not cover prose.
# Every shown unit is cut at 200 characters and at most six are shown.
#
# Fails to "ask": any internal error (bad input, missing node, unreadable transcript)
# prompts the human. It never denies and never lets a wording change through unseen.
# The work is in Node because jq's regex substitution takes minutes on a large template.
set -uo pipefail

ask_static() {
  printf '%s\n' '{"systemMessage":"A human must approve a change to visible UI copy, and the wording guard could not check this edit: look at the diff before approving.","hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"HUMAN APPROVAL OF UI COPY (check failed): this edit may change text site visitors read, and the wording guard could not read the edit or the conversation to tell whether you approved it. Approve only if you have seen and want the exact wording this edit writes."}}'
  exit 0
}

PROG="$(cat <<'JS'
const fs = require('fs');
const path = require('path');
const ev = JSON.parse(fs.readFileSync(0, 'utf8'));
const t = ev.tool_input || {};
if (!t.file_path) process.exit(0);
const proj = process.env.CLAUDE_PROJECT_DIR || ev.cwd || '';
const file = path.isAbsolute(t.file_path) ? t.file_path : path.join(proj, t.file_path);
const rel = path.relative(proj, file).split(path.sep).join('/');

let kind = null;
if (/^src\/(db|testkit|types|dev-bootstrap)\//.test(rel)) kind = null;
else if (/^src\/views\/.*\.hbs$/.test(rel)) kind = 'hbs';
else if (/^src\/.*\.ts$|^src\/public\/js\/.*\.js$|^curated\/email_templates\/[^/]*\.json$/.test(rel)) kind = 'code';
if (!kind) process.exit(0);

// Prose string literals: a space and a word, not SQL or a directive, outside comments and log lines.
function codeUnits(s) {
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)|logger\.|console\./.test(l)).join('\n')
    // A regex literal (after an operator, bracket or return) is code: it can hold a quote or backtick.
    .replace(/(^|[=(,:;!&|?{}[>]\s*|return\s+)\/(?![\/*])(?:[^\/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[a-z]*/gm, '$1 ')
    // A trailing line comment (whitespace, //, whitespace) is dropped when the quotes before it balance.
    .split('\n').map((l) => { const i = l.search(/\s\/\/\s/); if (i < 0) return l; const p = l.slice(0, i);
      return ["'", '"', '`'].every((q) => (p.split('\\' + q).join('').split(q).length - 1) % 2 === 0) ? p : l; }).join('\n');
  const lits = (s.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || [])
    // A backtick span that holds code is a mis-pairing, not copy.
    .filter((l) => l[0] !== '`' || !/=>|;\s*\n|\)\s*\{/.test(l));
  return lits.map((l) => l.slice(1, -1).replace(/\$\{[^}]*\}/g, ' ').replace(/\\n/g, ' ').replace(/\\(.)/g, '$1'))
    .filter((l) => /[A-Za-z]{2,}\s+[A-Za-z]/.test(l) && !/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE)\b/i.test(l)
      && !/^\s*use (strict|client|server)\s*$/.test(l));
}
// Template copy: each text node, visible attribute and quoted prose in Handlebars, split
// where a Handlebars expression or a tag interrupts it.
function hbsUnits(s) {
  const units = [];
  const keep = (re) => (m) => { for (const x of m.matchAll(re)) units.push(x[1]); return '\u0000'; };
  s = s.replace(/\{\{!--[\s\S]*?--\}\}|\{\{![\s\S]*?\}\}|<!--[\s\S]*?-->/g, '\u0000')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '\u0000')
    .replace(/\{\{[^}]*\}\}/g, keep(/"([^"]*\s[^"]*)"/g))
    .replace(/<[^>]*>/g, keep(/(?:alt|title|placeholder|aria-label)="([^"]*)"/g))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return units.concat(s.split('\u0000'));
}
// A written \n (as a plan or message quotes an email body) separates words, as it does in the unit.
const norm = (s) => ' ' + (s.replace(/\\[nrt]/g, ' ').toLowerCase().replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
  .replace(/\$\{[^}]*\}|\{\{[^}]*\}\}/g, ' ').match(/[a-z0-9]+/g) || []).join(' ') + ' ';
// Units keyed by their normalised words; the value is the text as written, for display.
function units(s) {
  const out = new Map();
  for (const u of (kind === 'hbs' ? hbsUnits(s) : codeUnits(s)).flatMap((x) => x.split('\u0000'))) {
    const k = norm(u);
    if (/[a-z]/.test(k) && !out.has(k)) out.set(k, u.replace(/\s+/g, ' ').trim());
  }
  return out;
}

// The file before and after every edit; an edit whose old text is not in the file is
// judged on its own fragments.
const orig = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
let doc = orig;
const beforeParts = [orig], afterParts = [];
for (const e of [...(t.edits || []), ...(typeof t.old_string === 'string' ? [t] : [])]) {
  const i = doc ? doc.indexOf(e.old_string) : -1;
  if (i < 0) { beforeParts.push(e.old_string); afterParts.push(e.new_string); continue; }
  doc = e.replace_all ? doc.split(e.old_string).join(e.new_string)
    : doc.slice(0, i) + e.new_string + doc.slice(i + e.old_string.length);
}
afterParts.push(typeof t.content === 'string' ? t.content : doc);
const had = new Map(beforeParts.flatMap((p) => [...units(p)]));
const now = new Map(afterParts.flatMap((p) => [...units(p)]));
const fresh = [...now].filter(([k]) => !had.has(k)).map(([k, raw]) => ({ k, raw, words: k.trim().split(' ').length }));
if (!fresh.length) process.exit(0);
const gone = [...had].filter(([k]) => !now.has(k)).map(([, raw]) => raw);

// Each human message, typed at the prompt or sent while Claude was working, with the
// Claude text it answers when it opens with a yes. A subagent's transcript holds no
// human message; its session's file does.
let tp = ev.transcript_path || '';
if (tp.includes('/subagents/')) tp = tp.slice(0, tp.indexOf('/subagents/')) + '.jsonl';
const affirm = /^\s*(y|yes|yep|yeah|yup|ok|okay|go|go ahead|approved?|lgtm|do it|apply|ship it|sounds good|agreed|confirmed?)\b/i;
const msgs = [];
let prev = '';
const plans = new Set();
const approvedPlan = /^(<persisted-output>[\s\S]*?Preview[^\n]*\n)?User has approved your plan\b/;
for (const line of (tp && fs.existsSync(tp) ? fs.readFileSync(tp, 'utf8') : '').split('\n')) {
  if (!line.includes('"assistant"') && !line.includes('"human"') && !line.includes('"queue-operation"')
    && !line.includes('User has approved your plan')) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  let text = null;
  if (e.type === 'assistant') {
    const c = e.message && e.message.content;
    prev += ' ' + (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ') : '');
    if (Array.isArray(c)) for (const b of c) if (b && b.type === 'tool_use' && b.name === 'ExitPlanMode') plans.add(b.id);
    continue;
  }
  // An approved plan: Claude Code's own tool result for an ExitPlanMode call, saying the
  // human approved it and carrying the plan as approved. A rejection is an error result
  // with no plan, so it never matches.
  const r = e.type === 'user' && !e.origin && e.toolUseResult && typeof e.toolUseResult.plan === 'string'
    && e.toolUseResult.isAgent !== true && Array.isArray(e.message && e.message.content)
    && e.message.content.find((b) => b && b.type === 'tool_result' && plans.has(b.tool_use_id) && b.is_error !== true);
  if (r && approvedPlan.test(typeof r.content === 'string' ? r.content
    : Array.isArray(r.content) ? r.content.map((b) => (b && b.text) || '').join(' ') : '')) {
    msgs.push({ raw: e.toolUseResult.plan, h: norm(e.toolUseResult.plan), prev: '', plan: true });
    continue;
  }
  if (e.type === 'user' && e.origin && e.origin.kind === 'human' && !e.isMeta) {
    const c = e.message && e.message.content;
    text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ') : '';
  } else if (e.type === 'attachment' && e.attachment && e.attachment.type === 'queued_command'
    && e.attachment.origin && e.attachment.origin.kind === 'human' && typeof e.attachment.prompt === 'string') {
    text = e.attachment.prompt;
  } else if (e.type === 'queue-operation' && e.operation === 'enqueue' && typeof e.content === 'string'
    && !/^\s*</.test(e.content)) {
    // A message sent while Claude works reaches the transcript as a user line only when
    // the turn ends; its enqueue line lands at once, so it counts from the moment it is sent.
    msgs.push({ raw: e.content, h: norm(e.content), prev: '' });
    continue;
  }
  if (text === null) continue;
  msgs.push({ raw: text, h: norm(text), prev: affirm.test(text) ? norm(prev) : '' });
  prev = '';
}
const fileWords = norm(path.basename(rel).replace(/\.[a-z]+$/, '')).trim();
const approved = (u) => msgs.some((m) => [m.h, m.prev].some((x) => x.includes(u.k) && (u.words >= 3 || x.includes(' ' + fileWords + ' '))));
let todo = fresh.filter((u) => !approved(u));
if (!todo.length) process.exit(0);

// Prose is a unit that reads as a sentence: six or more words, placeholders not counted,
// or a sentence ending (. ! ?) on three or more words or on the lowercase tail of a
// sentence an expression split. Anything shorter is a technical word: a label, button,
// badge or short status word.
const isProse = (u) => {
  const s = u.raw.replace(/\$\{[^}]*\}|\{\{[^}]*\}\}|\{[^}]*\}/g, ' ').trim();
  const w = (s.match(/[A-Za-z0-9']+/g) || []).length;
  return w >= 6 || (/[.!?]["')\]]*$/.test(s) && (w >= 3 || /^[a-z]/.test(s)));
};

// The latest pre-approval or withdrawal of one decides; a pre-approval covers technical
// words only, so prose still asks under it.
const UI = '\\bui\\s+(copy|text|words?|wording|edits?)\\b';
const grant = new RegExp('\\b(all|technical|approve[ds]?)\\b[^\\n.]{0,40}' + UI + '|' + UI + '[^\\n]{0,60}\\btechnical\\b', 'i');
const withdraw = new RegExp('\\b(stop|revoke|withdraw|cancel)\\b[^\\n]{0,40}' + UI
  + '|\\b(no|not|don\'?t|do not|never)\\s+(to\\s+)?(approve|all)\\b[^\\n]{0,40}' + UI, 'i');
let preApproved = false;
for (const m of msgs) {
  if (m.plan) continue;
  if (withdraw.test(m.raw)) preApproved = false;
  else if (grant.test(m.raw)) preApproved = true;
}
const quote = (s) => '"' + s + '"';
// Every shown unit is cut at 200 characters and at most six are shown, so no reason can grow with the file.
const cap = (s) => quote(s.length > 200 ? s.slice(0, 200) + '...' : s);
const more = (n) => (n > 6 ? ' (and ' + (n - 6) + ' more)' : '');
if (preApproved && !todo.some(isProse)) {
  process.stdout.write(JSON.stringify({ systemMessage: 'UI copy changed in ' + rel
    + ' under your pre-approval of technical UI words. New text: '
    + todo.slice(0, 6).map((u) => cap(u.raw)).join('; ') + more(todo.length) }) + '\n');
  process.exit(0);
}
if (preApproved) todo = todo.filter(isProse);

// Whole changed lines of the file, so wording a template expression splits into
// pieces still reads as the sentence a visitor sees.
const linesOf = (s) => s.split('\n').map((l) => l.trim()).filter((l) => /[A-Za-z]/.test(l));
const after = typeof t.content === 'string' ? t.content : doc;
const beforeLines = new Set(linesOf(orig)), afterLines = new Set(linesOf(after));
const shown = (ls) => ls.slice(0, 6).map((l) => quote(l.length > 200 ? l.slice(0, 200) + '...' : l)).join(' / ');
const lineBefore = linesOf(orig).filter((l) => !afterLines.has(l) && gone.some((g) => norm(l).includes(norm(g))));
const lineAfter = linesOf(after).filter((l) => !beforeLines.has(l) && todo.some((u) => norm(l).includes(u.k)));
const reason = 'HUMAN APPROVAL OF UI COPY: Claude is changing text site visitors read in ' + rel
  + ', and public UI wording changes only with a human\'s approval, so approve or reject this exact text.\n'
  + 'Why it asks: this text was not in a message you typed or a plan you approved, and '
  + (preApproved ? 'your pre-approval covers technical UI words only, never prose.\n'
    : 'no pre-approval of technical UI words is in force.\n')
  + (lineBefore.length ? 'Line before: ' + shown(lineBefore) + '\n' : '')
  + (lineAfter.length ? 'Line after: ' + shown(lineAfter) + '\n' : '')
  + (gone.length ? 'Text it replaces or removes: ' + gone.slice(0, 6).map(cap).join('; ') + more(gone.length) + '\n' : '')
  + 'New text: ' + todo.slice(0, 6).map((u) => cap(u.raw)).join('; ') + more(todo.length)
  + (preApproved || todo.every(isProse) ? ''
    : '\nTo let technical UI words (labels, buttons, badges, short status words) through for the rest of this session, say "approve all technical UI wording"; prose always needs its own approval.');
process.stdout.write(JSON.stringify({ systemMessage: reason,
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } }) + '\n');
JS
)"

command -v node >/dev/null 2>&1 || ask_static
OUT="$(node -e "$PROG" 2>/dev/null)" || ask_static
printf '%s' "$OUT"
