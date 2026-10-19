"""Turn text the legacy site stored as HTML fragments into plain text.

The old site kept free text the way its forms posted it: line breaks as `<br>`
tags, paragraphs as `<p>`, and anything outside ASCII as numeric entities. The
new site stores plain text and escapes it on output, so a fragment carried
across unconverted would show its tags and entity codes to the reader. Every
step that publishes legacy free text runs it through here, so tips and member
bios come out the same way.
"""
from __future__ import annotations

import html
import re

_TAG_RE = re.compile(r"<[^>]+>")
_BR_RE = re.compile(r"<\s*br\s*/?\s*>", re.IGNORECASE)
_BLOCK_RE = re.compile(r"<\s*/?\s*(p|div|li|ul|ol)\b[^>]*>", re.IGNORECASE)


def legacy_html_to_text(text: str) -> str:
    """Line-break and block tags become newlines, other tags are dropped,
    entities are decoded, and whitespace is tidied: space and tab runs collapse,
    each line is trimmed, and at most one blank line separates paragraphs."""
    if not text:
        return ""
    t = _BR_RE.sub("\n", text)
    t = _BLOCK_RE.sub("\n", t)
    t = _TAG_RE.sub("", t)
    t = html.unescape(t)
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in t.split("\n")]
    out_lines: list[str] = []
    blank = False
    for ln in lines:
        if ln == "":
            if not blank and out_lines:
                out_lines.append("")
            blank = True
        else:
            out_lines.append(ln)
            blank = False
    return "\n".join(out_lines).strip()
