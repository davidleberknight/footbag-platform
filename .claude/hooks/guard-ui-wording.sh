#!/usr/bin/env bash
# Wording gate, defense-in-depth behind the root CLAUDE.md rule that public UI wording
# changes only on explicit human instruction. An Edit, Write or MultiEdit that adds text
# a site visitor reads (template copy and visible attributes, prose string literals in
# server and client code, email subjects and bodies) asks the human once, the prompt
# saying that a human must approve this change to visible UI copy and naming the file
# and the new text. It passes silently when the human already approved that text.
#
# Wording is judged in whole units: a text node or visible attribute in a template, a
# prose string literal in code. Only a unit the file did not already hold is new
# wording, so text that is deleted, moved or repeated from elsewhere in the same file
# passes, and so do code directives such as 'use strict'.
#
# Approval is read from the session transcript. Only a message the human typed counts
# (origin.kind "human", including one sent while Claude was working; never a tool
# result, hook feedback, task notification, compaction summary or Claude's own text).
# It approves a unit when it contains the unit's words, or when it opens with a yes and
# the Claude text it answers contains them, as a literal BEFORE/AFTER shows it. A unit
# of under three words also needs the file's name in that text, so a common word in
# some message cannot approve it.
#
# Pre-approval: a human message such as "approve all technical UI wording" lets
# technical wording through for the rest of the session without a prompt, each unit
# still announced to the human. A later message such as "stop approving UI wording"
# ends it. Editorial copy is never covered: email template text, and any unit of over
# forty words, still asks.
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
const editorialFile = /^curated\/email_templates\//.test(rel);

// Prose string literals: a space and a word, not SQL or a directive, outside comments and log lines.
function codeUnits(s) {
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)|logger\.|console\./.test(l)).join('\n');
  const lits = s.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || [];
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
const norm = (s) => ' ' + (s.toLowerCase().replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
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
for (const line of (tp && fs.existsSync(tp) ? fs.readFileSync(tp, 'utf8') : '').split('\n')) {
  if (!line.includes('"assistant"') && !line.includes('"human"')) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  let text = null;
  if (e.type === 'assistant') {
    const c = e.message && e.message.content;
    prev += ' ' + (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ') : '');
    continue;
  }
  if (e.type === 'user' && e.origin && e.origin.kind === 'human' && !e.isMeta) {
    const c = e.message && e.message.content;
    text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ') : '';
  } else if (e.type === 'attachment' && e.attachment && e.attachment.type === 'queued_command'
    && e.attachment.origin && e.attachment.origin.kind === 'human' && typeof e.attachment.prompt === 'string') {
    text = e.attachment.prompt;
  }
  if (text === null) continue;
  msgs.push({ raw: text, h: norm(text), prev: affirm.test(text) ? norm(prev) : '' });
  prev = '';
}
const fileWords = norm(path.basename(rel).replace(/\.[a-z]+$/, '')).trim();
const approved = (u) => msgs.some((m) => [m.h, m.prev].some((x) => x.includes(u.k) && (u.words >= 3 || x.includes(' ' + fileWords + ' '))));
let todo = fresh.filter((u) => !approved(u));
if (!todo.length) process.exit(0);

// The latest pre-approval or withdrawal of one decides; editorial copy is never covered.
const UI = '\\bui\\s+(copy|text|words?|wording)\\b';
const grant = new RegExp('\\b(all|technical)\\b[^\\n.]{0,40}' + UI + '|' + UI + '[^\\n]{0,60}\\btechnical\\b', 'i');
const withdraw = new RegExp('\\b(stop|revoke|withdraw|cancel)\\b[^\\n]{0,40}' + UI
  + '|\\b(no|not|don\'?t|do not|never)\\s+(to\\s+)?(approve|all)\\b[^\\n]{0,40}' + UI, 'i');
let preApproved = false;
for (const m of msgs) {
  if (withdraw.test(m.raw)) preApproved = false;
  else if (grant.test(m.raw)) preApproved = true;
}
const editorial = (u) => editorialFile || u.words > 40;
const quote = (s) => '"' + s + '"';
if (preApproved) {
  const passed = todo.filter((u) => !editorial(u));
  todo = todo.filter(editorial);
  if (!todo.length) {
    process.stdout.write(JSON.stringify({ systemMessage: 'UI copy changed in ' + rel
      + ' under your pre-approval of technical UI wording. New text: '
      + passed.map((u) => quote(u.raw)).join('; ') }) + '\n');
    process.exit(0);
  }
}

const reason = 'HUMAN APPROVAL OF UI COPY: Claude is changing text site visitors read in ' + rel
  + ', and public UI wording changes only with a human\'s approval, so approve or reject this exact text.\n'
  + (gone.length ? 'Text it replaces or removes: ' + gone.map(quote).join('; ') + '\n' : '')
  + 'New text: ' + todo.map((u) => quote(u.raw)).join('; ') + '\n'
  + (preApproved ? 'Your pre-approval of technical UI wording does not cover this: it is email text or prose of over forty words.'
    : 'To let technical wording (labels, hints, validation and error messages) through for the rest of this session, say "approve all technical UI wording".');
process.stdout.write(JSON.stringify({ systemMessage: reason,
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } }) + '\n');
JS
)"

command -v node >/dev/null 2>&1 || ask_static
OUT="$(node -e "$PROG" 2>/dev/null)" || ask_static
printf '%s' "$OUT"
