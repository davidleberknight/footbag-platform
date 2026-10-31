#!/usr/bin/env bash
# Wording gate, defense-in-depth behind the root CLAUDE.md rule that public UI wording
# changes only on explicit human instruction. An Edit, Write or MultiEdit that changes
# text a site visitor reads (template copy and visible attributes, prose string literals
# in server and client code, email subjects and bodies) passes silently only when the
# human already approved that wording in this conversation; otherwise it asks, and the
# prompt names the file and the visible text before and after.
#
# Approval is read from the session transcript. Only a message the human typed counts
# (origin.kind "human"; never a tool result, hook feedback, task notification, compaction
# summary or Claude's own text). It approves a change when it contains the new wording,
# or when it opens with a yes (yes, go, ok, approved, apply ...) and the Claude text it
# answers contains the new wording, as a literal BEFORE/AFTER shows it. Text is compared
# as lowercase words, so markup, Handlebars, quoting and punctuation do not matter; a
# change of under three words is matched with three words of context on each side, so a
# common word in some message cannot approve it.
#
# Fails to "ask": any internal error (bad input, missing node, unreadable transcript)
# prompts the human. It never denies and never lets a wording change through unseen.
# The work is in Node because jq's regex substitution takes minutes on a large template.
set -uo pipefail

ask_static() {
  printf '%s\n' '{"systemMessage":"Do you approve of the UI wording change in this edit? The wording guard could not check it, so look at the diff before approving.","hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"APPROVE SITE WORDING (check failed): the wording guard could not read this edit or the conversation, so it cannot tell whether the visible site text was approved. Approve only if you have seen and want the exact wording this edit writes."}}'
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

// Prose string literals: a space and a word, not SQL, outside comments and log lines.
function codeText(s) {
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)|logger\.|console\./.test(l)).join('\n');
  const lits = s.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) || [];
  return lits.map((l) => l.slice(1, -1).replace(/\$\{[^}]*\}/g, '').replace(/\\n/g, ' ').replace(/\\(.)/g, '$1'))
    .filter((l) => /[A-Za-z]{2,}\s+[A-Za-z]/.test(l) && !/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE)\b/i.test(l))
    .join(' ');
}
// Template copy: text between tags, visible attributes, quoted prose in Handlebars.
function hbsText(s) {
  const quoted = (re) => (m) => ' ' + [...m.matchAll(re)].map((x) => x[1]).join(' ') + ' ';
  return s.replace(/\{\{!--[\s\S]*?--\}\}|\{\{![\s\S]*?\}\}|<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/\{\{[^}]*\}\}/g, quoted(/"([^"]*\s[^"]*)"/g))
    .replace(/<[^>]*>/g, quoted(/(?:alt|title|placeholder|aria-label)="([^"]*)"/g))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
const visible = (s) => (kind === 'hbs' ? hbsText(s) : codeText(s)).split(/\s+/).filter(Boolean);
const norm = (s) => ' ' + (s.toLowerCase().replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
  .match(/[a-z0-9]+/g) || []).join(' ') + ' ';

// Each edit as whole-file text before and after, so a fragment that starts inside a tag
// is judged in context; an edit whose old text is not in the file is judged on its own.
let doc = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const pairs = [];
if (typeof t.content === 'string') pairs.push([doc, t.content]);
for (const e of [...(t.edits || []), ...(typeof t.old_string === 'string' ? [t] : [])]) {
  const i = doc ? doc.indexOf(e.old_string) : -1;
  if (i < 0) { pairs.push([e.old_string, e.new_string]); continue; }
  const next = e.replace_all ? doc.split(e.old_string).join(e.new_string)
    : doc.slice(0, i) + e.new_string + doc.slice(i + e.old_string.length);
  pairs.push([doc, next]);
  doc = next;
}

// The changed span between two word lists, common prefix and suffix removed, and the
// same span with three words of context on each side.
const changes = [];
for (const [o, n] of pairs) {
  const a = visible(o), b = visible(n);
  let p = 0; while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0; while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const before = a.slice(p, a.length - s).join(' '), after = b.slice(p, b.length - s).join(' ');
  if (before === after) continue;
  const p3 = Math.max(p - 3, 0);
  const c = { before, after,
    beforeCtx: a.slice(p3, Math.min(a.length - s + 3, a.length)).join(' '),
    afterCtx: b.slice(p3, Math.min(b.length - s + 3, b.length)).join(' ') };
  c.key = norm(after).trim().split(' ').length >= 3 ? norm(after) : norm(c.afterCtx);
  changes.push(c);
}
if (!changes.length) process.exit(0);

// Each human message, normalised, with the Claude text it answers when it opens with a yes.
// A subagent's own transcript holds no human message; its session's file does.
let tp = ev.transcript_path || '';
if (tp.includes('/subagents/')) tp = tp.slice(0, tp.indexOf('/subagents/')) + '.jsonl';
const affirm = /^\s*(y|yes|yep|yeah|yup|ok|okay|go|go ahead|approved?|lgtm|do it|apply|ship it|sounds good|agreed|confirmed?)\b/i;
const msgs = [];
let prev = '';
for (const line of (tp && fs.existsSync(tp) ? fs.readFileSync(tp, 'utf8') : '').split('\n')) {
  if (!line.includes('"assistant"') && !line.includes('"human"')) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  const c = e.message && e.message.content;
  const text = typeof c === 'string' ? c
    : Array.isArray(c) ? c.filter((b) => b && b.type === 'text').map((b) => b.text).join(' ') : '';
  if (e.type === 'assistant') prev += ' ' + text;
  else if (e.type === 'user' && e.origin && e.origin.kind === 'human' && !e.isMeta) {
    msgs.push({ h: norm(text), prev: affirm.test(text) ? norm(prev) : '' });
    prev = '';
  }
}
const unapproved = changes.filter((c) => !msgs.some((m) => m.h.includes(c.key) || m.prev.includes(c.key)));
if (!unapproved.length) process.exit(0);

const short = (s) => (s.length > 200 ? s.slice(0, 197) + '...' : s);
const reason = 'APPROVE SITE WORDING: visitors will read new text on ' + rel + '. No approval of this text was found earlier in the conversation.\n'
  + unapproved.map((c) => 'Before: "' + (c.before ? short(c.beforeCtx) : '(none)') + '"\nAfter:  "'
    + (c.after ? short(c.afterCtx) : '(removed)') + '"').join('\n')
  + '\nApprove only if this is the exact wording you want.';
// An Edit prompt shows the human the diff but not this reason, so a prompt here would ask
// without saying why. The first time an unapproved change is attempted in a session it is
// denied instead, telling Claude to write the reason and the exact text into its message;
// the same change retried then prompts, directly under that explanation. Modelled on
// guard-maintainer-gate.sh. A mark that cannot be written falls through to the prompt.
const shownChanges = unapproved.map((c) => 'Before: "' + (c.before ? short(c.beforeCtx) : '(none)') + '"\nAfter:  "'
  + (c.after ? short(c.afterCtx) : '(removed)') + '"').join('\n');
let explained = true;
try {
  const crypto = require('crypto');
  const os = require('os');
  const session = String(ev.session_id || 'nosession').replace(/[^A-Za-z0-9_-]/g, '');
  const markDir = path.join(process.env.TMPDIR || os.tmpdir(), 'claude-wording-gate', session);
  const mark = path.join(markDir, crypto.createHash('sha1')
    .update(rel + '\0' + unapproved.map((c) => c.key).join('\0')).digest('hex').slice(0, 16));
  if (!fs.existsSync(mark)) {
    fs.mkdirSync(markDir, { recursive: true });
    fs.writeFileSync(mark, '');
    explained = false;
  }
} catch { explained = true; }
if (!explained) {
  const why = 'WORDING PROMPT NOT YET EXPLAINED: the edit prompt will show the human only the diff, never a reason. '
    + 'End your message with: "Next: an edit prompt for ' + rel + '. Visible wording changes:" followed by each '
    + 'Before and After below, then "Do you approve of the UI wording change as shown?". Then retry the same edit '
    + 'on its own; it will prompt.\n' + shownChanges;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why } }) + '\n');
  process.exit(0);
}
process.stdout.write(JSON.stringify({ systemMessage: 'Do you approve of the UI wording change as shown? ' + reason,
  hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } }) + '\n');
JS
)"

command -v node >/dev/null 2>&1 || ask_static
OUT="$(node -e "$PROG" 2>/dev/null)" || ask_static
printf '%s' "$OUT"
