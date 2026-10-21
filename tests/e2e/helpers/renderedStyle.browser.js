/*
 * In-page capture for the rendered-style helper.
 *
 * Defines globalThis.__footbagMeasure(opts), which records every element under
 * body as the browser drew it: a stable key, its box, a fixed list of computed
 * properties and a few facts no stylesheet can tell (overflow, label
 * reachability, the width of a "0" in its font). It judges nothing; the rules
 * live in renderedStyle.ts and run in Node over what this returns, so a
 * threshold has one home.
 *
 * Plain DOM script with no imports, loaded by path: Playwright's
 * addInitScript({ path }) in the browser spec and the CLI, and the Playwright
 * MCP server's init script in a Claude session. It is never shipped to
 * visitors.
 */
(function () {
  'use strict';

  var CAPTURE_SCHEMA = 1;

  // Must match STYLE_PROPS in renderedStyle.ts, entry for entry; a unit test compares them.
  var STYLE_PROPS = [
    'display', 'visibility', 'opacity', 'position', 'overflow-x',
    'color', 'background-color', 'background-image',
    'font-size', 'font-weight', 'font-family', 'line-height',
    'text-decoration-line', 'text-transform', 'white-space', 'overflow-wrap', 'max-width',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-left-color', 'border-top-left-radius',
    'box-shadow', 'flex-direction', 'grid-template-columns', 'row-gap', 'column-gap',
    'list-style-type', 'clip-path',
  ];

  var DEFAULT_TOKENS = ['--text', '--text-muted', '--text-subtle', '--bg', '--primary-ink', '--secondary', '--border'];
  // Well above the largest page on the site, the admin emerging-vocabulary
  // table (about 910 rows of 16 cells, near 15,500 elements on the seeded
  // stack), so no page is judged on a part of itself.
  var DEFAULT_CAP = 40000;
  var SKIP_TAGS = { script: 1, style: 1, template: 1, noscript: 1, link: 1, meta: 1 };
  var FIELD_TAGS = { input: 1, select: 1, textarea: 1 };
  // Text this long might be prose; only then is the "0" width worth measuring.
  var CH_MIN_TEXT = 40;

  function round(n) { return Math.round(n * 100) / 100; }

  function classList(el) {
    var raw = el.getAttribute('class') || '';
    return raw.split(/\s+/).filter(Boolean);
  }

  function ownText(el) {
    var s = '';
    for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3) s += n.nodeValue;
    return s.replace(/\s+/g, ' ').trim();
  }

  function painted(el) {
    if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
    var cs = getComputedStyle(el);
    if (cs.visibility !== 'visible') return false;
    var r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  function textOfIds(ids, needPainted) {
    var text = '';
    ids.split(/\s+/).filter(Boolean).forEach(function (id) {
      var t = document.getElementById(id);
      if (t && (!needPainted || painted(t))) text += (t.textContent || '').trim();
    });
    return text;
  }

  function isNamed(el) {
    if ((el.getAttribute('aria-label') || '').trim()) return true;
    var ids = el.getAttribute('aria-labelledby');
    return !!(ids && textOfIds(ids, false));
  }

  function hasVisibleLabel(el) {
    var labels = el.labels ? Array.prototype.slice.call(el.labels) : [];
    for (var k = 0; k < labels.length; k++) {
      if (painted(labels[k]) && (labels[k].textContent || '').trim()) return true;
    }
    var ids = el.getAttribute('aria-labelledby');
    return !!(ids && textOfIds(ids, true));
  }

  var chCache = {};
  var ctx2d = null;
  function zeroWidth(cs) {
    var font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    if (font in chCache) return chCache[font];
    if (ctx2d === null) {
      var canvas = document.createElement('canvas');
      ctx2d = (canvas.getContext && canvas.getContext('2d')) || false;
    }
    var w = ctx2d ? (ctx2d.font = font, ctx2d.measureText('0').width) : 0;
    chCache[font] = w > 0 ? round(w) : undefined;
    return chCache[font];
  }

  // A background tab never fires animation frames, so a timer stands in rather
  // than leaving a Claude session's measurement waiting forever.
  function nextFrame() {
    return new Promise(function (resolve) {
      var timer = setTimeout(resolve, 100);
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { clearTimeout(timer); resolve(); });
    });
  }

  globalThis.__footbagMeasure = async function (opts) {
    opts = opts || {};
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await nextFrame();
    await nextFrame();

    var cap = opts.cap || DEFAULT_CAP;
    var strings = [];
    var stringIndex = new Map();
    function intern(s) {
      var k = stringIndex.get(s);
      if (k === undefined) { k = strings.length; strings.push(s); stringIndex.set(s, k); }
      return k;
    }

    var elements = [];
    var truncated = false;
    var sx = window.scrollX || 0;
    var sy = window.scrollY || 0;

    function visitChildren(parentEl, parentRec) {
      var seen = new Map();
      for (var c = parentEl.firstElementChild; c; c = c.nextElementSibling) {
        var tag = c.tagName.toLowerCase();
        if (SKIP_TAGS[tag]) continue;
        if (elements.length >= cap) { truncated = true; return; }
        var cls = classList(c);
        var sig = [tag].concat(cls.slice().sort()).join('.');
        var nth = (seen.get(sig) || 0) + 1;
        seen.set(sig, nth);
        visit(c, tag, cls, parentRec, sig + ':nth(' + nth + ')');
        if (truncated) return;
      }
    }

    function visit(el, tag, cls, parentRec, segment) {
      var cs = getComputedStyle(el);
      var r = el.getBoundingClientRect();
      var text = ownText(el);
      var attrs = {};
      if (el.hasAttribute('hidden')) attrs.hidden = true;
      if (tag === 'details' && el.open) attrs.open = true;
      if (el.getAttribute('aria-hidden') === 'true') attrs.ariaHidden = true;
      if (el.disabled === true || el.hasAttribute('disabled')) attrs.disabled = true;
      if (tag === 'a' && el.hasAttribute('href')) attrs.href = true;
      if (el.hasAttribute('role')) attrs.role = el.getAttribute('role');
      if (el.hasAttribute('tabindex')) attrs.tabindex = el.getAttribute('tabindex');
      if (el.hasAttribute('type')) attrs.type = (el.getAttribute('type') || '').toLowerCase();
      if (isNamed(el)) attrs.named = true;

      var rec = {
        i: elements.length,
        parent: parentRec ? parentRec.i : null,
        key: (parentRec ? parentRec.key : 'body') + '>' + segment,
        tag: tag,
        cls: cls.join(' '),
        attrs: attrs,
        rect: { x: round(r.left + sx), y: round(r.top + sy), w: round(r.width), h: round(r.height) },
        ownText: text.slice(0, 200),
        textLen: text.length,
        styles: STYLE_PROPS.map(function (p) { return intern(cs.getPropertyValue(p)); }),
      };
      if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1) rec.scroll = { sw: el.scrollWidth, cw: el.clientWidth };
      if (FIELD_TAGS[tag]) rec.visibleLabel = hasVisibleLabel(el);
      if (text.length >= CH_MIN_TEXT) {
        var ch = zeroWidth(cs);
        if (ch) rec.chPx = ch;
      }
      elements.push(rec);
      // An svg's children are drawing primitives, not layout.
      if (tag !== 'svg') visitChildren(el, rec);
    }

    visitChildren(document.body, null);

    var rootStyle = getComputedStyle(document.documentElement);
    var tokens = {};
    (opts.tokens || DEFAULT_TOKENS).forEach(function (name) {
      var value = rootStyle.getPropertyValue(name).trim();
      if (value) tokens[name] = value;
    });

    var de = document.documentElement;
    return {
      schema: CAPTURE_SCHEMA,
      url: location.pathname + location.search,
      template: opts.template === undefined ? null : opts.template,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      page: { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, scrollHeight: de.scrollHeight },
      tokens: tokens,
      styleProps: STYLE_PROPS.slice(),
      strings: strings,
      elements: elements,
      truncated: truncated,
    };
  };
})();
