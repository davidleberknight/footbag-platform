/*
 * In-page capture for the rendered-style helper.
 *
 * Defines globalThis.__footbagMeasure(opts), which records every element under
 * body as the browser drew it: a stable key, its box, a fixed list of computed
 * properties and a few facts no stylesheet can tell (overflow, label
 * reachability, the width of a "0" in its font). It judges nothing; the rules
 * live in renderedStyle.ts and run in Node over what this returns, so a
 * threshold has one home. It also defines globalThis.__footbagFocusState(),
 * which records the element keyboard focus is on, for the focus check.
 *
 * Plain DOM script with no imports, loaded by path: Playwright's
 * addInitScript({ path }) in the browser spec and the CLI, and the Playwright
 * MCP server's init script in a Claude session. It is never shipped to
 * visitors.
 */
(function () {
  'use strict';

  var CAPTURE_SCHEMA = 2;

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
    'overflow-y', 'text-overflow', '-webkit-line-clamp', 'float', 'aspect-ratio',
    'outline-style', 'outline-width', 'outline-color',
  ];

  // What a focus indicator can change, recorded for the focused element only.
  var FOCUS_PROPS = [
    'outline-style', 'outline-width', 'outline-color', 'box-shadow', 'text-decoration-line',
    'background-color', 'border-top-color', 'border-bottom-color', 'color',
  ];

  // How many boxes around a focused control are read for a focus-within indicator.
  var FOCUS_WITHIN_DEPTH = 3;

  var DEFAULT_TOKENS =['--text', '--text-muted', '--text-subtle', '--bg', '--primary-ink', '--secondary', '--border'];
  // Well above the largest page on the site, the admin emerging-vocabulary
  // table (about 910 rows of 16 cells, near 15,500 elements on the seeded
  // stack), so no page is judged on a part of itself.
  var DEFAULT_CAP = 40000;
  var SKIP_TAGS = { script: 1, style: 1, template: 1, noscript: 1, link: 1, meta: 1 };
  var FIELD_TAGS = { input: 1, select: 1, textarea: 1 };
  // Text this long might be prose; only then is the "0" width worth measuring.
  var CH_MIN_TEXT = 40;
  // State classes a script toggles; a key carrying one would differ between two captures of one page.
  var VOLATILE_CLASS = /^(is|has)-/;

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

  // A short hash of an element's own text, so a sibling inserted before it does not change its key.
  function textHash(s) {
    var h = 5381;
    for (var k = 0; k < s.length; k++) h = ((h * 33) ^ s.charCodeAt(k)) >>> 0;
    return h.toString(36);
  }

  function signature(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.getAttribute('id');
    if (id) return tag + '#' + id;
    var cls = classList(el).filter(function (c) { return !VOLATILE_CLASS.test(c); }).sort();
    var text = ownText(el);
    return [tag].concat(cls).join('.') + (text ? '~' + textHash(text) : '');
  }

  function keyOf(el) {
    var parts = [];
    for (var node = el; node && node !== document.body; node = node.parentElement) {
      var sig = signature(node);
      var nth = 1;
      for (var s = node.previousElementSibling; s; s = s.previousElementSibling) {
        if (!SKIP_TAGS[s.tagName.toLowerCase()] && signature(s) === sig) nth++;
      }
      parts.unshift(sig + ':nth(' + nth + ')');
    }
    return node === document.body ? 'body>' + parts.join('>') : null;
  }

  // Drawn where a reader can see it: not parked off the screen's top or left
  // edge, and not clipped to nothing, the two ways a visually-hidden label is hidden.
  function painted(el) {
    if (!el || !el.getClientRects || el.getClientRects().length === 0) return false;
    var cs = getComputedStyle(el);
    if (cs.visibility !== 'visible') return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    if (r.right + (window.scrollX || 0) <= 0 || r.bottom + (window.scrollY || 0) <= 0) return false;
    var clip = cs.clipPath || '';
    if (clip.indexOf('inset(50%') === 0 || clip.indexOf('inset(100%') === 0) return false;
    if (cs.position === 'absolute' && /^rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)$/.test(cs.clip || '')) return false;
    return true;
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

  // Every custom property the stylesheets define on :root, in source order.
  function rootPropertyNames() {
    var names = [];
    var seen = {};
    function walk(rules) {
      for (var k = 0; k < rules.length; k++) {
        var rule = rules[k];
        if (rule.cssRules && !rule.selectorText) { walk(rule.cssRules); continue; }
        if (!rule.selectorText || rule.selectorText.indexOf(':root') === -1) continue;
        for (var p = 0; p < rule.style.length; p++) {
          var name = rule.style[p];
          if (name.indexOf('--') === 0 && !seen[name]) { seen[name] = 1; names.push(name); }
        }
      }
    }
    for (var s = 0; s < document.styleSheets.length; s++) {
      var rules;
      try { rules = document.styleSheets[s].cssRules; } catch (e) { continue; }
      if (rules) walk(rules);
    }
    return names;
  }

  // Resolves a root token the way the browser would paint it, so a token
  // written as var() or a named colour still compares with computed colours.
  // A token that is not a colour leaves the probe's background at its initial
  // transparent, and is returned as authored.
  function makeProbe() {
    var probe = document.createElement('div');
    probe.style.display = 'none';
    document.documentElement.appendChild(probe);
    return {
      colour: function (name) {
        probe.style.backgroundColor = '';
        probe.style.setProperty('background-color', 'var(' + name + ')');
        var v = getComputedStyle(probe).backgroundColor;
        return v && v !== 'rgba(0, 0, 0, 0)' ? v : null;
      },
      remove: function () { probe.remove(); },
    };
  }

  // The sum of layout-shift scores since the page started loading, or null where the browser reports none.
  function layoutShift() {
    if (typeof PerformanceObserver !== 'function' || !(PerformanceObserver.supportedEntryTypes || []).includes('layout-shift')) {
      return Promise.resolve(null);
    }
    return new Promise(function (resolve) {
      var total = 0;
      var po = new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (e) { if (!e.hadRecentInput) total += e.value; });
      });
      po.observe({ type: 'layout-shift', buffered: true });
      nextFrame().then(function () {
        po.takeRecords().forEach(function (e) { if (!e.hadRecentInput) total += e.value; });
        po.disconnect();
        resolve(Math.round(total * 1000) / 1000);
      });
    });
  }

  globalThis.__footbagMeasure = async function (opts) {
    opts = opts || {};
    // Fixed elements' boxes are offset by the scroll position, so measure from
    // the top; at once, because the site scrolls smoothly and the measurement
    // would otherwise start partway through the animation.
    if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // Fonts are only known to be ready once a frame has laid the page out with them.
    await nextFrame();
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
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
        var sig = signature(c);
        var nth = (seen.get(sig) || 0) + 1;
        seen.set(sig, nth);
        visit(c, tag, classList(c), parentRec, sig + ':nth(' + nth + ')');
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
      // The browser reports an image's attribute ratio as aspect-ratio "auto", so the attributes are read directly.
      if (tag === 'img' && el.hasAttribute('width') && el.hasAttribute('height')) attrs.sized = true;
      if (el.hasAttribute('role')) attrs.role = el.getAttribute('role');
      if (el.hasAttribute('aria-live')) attrs.live = (el.getAttribute('aria-live') || '').toLowerCase();
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
      var wide = el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1;
      var tall = el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 1;
      if (wide || tall) rec.scroll = { sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight };
      if (FIELD_TAGS[tag]) rec.visibleLabel = hasVisibleLabel(el);
      // A paragraph made mostly of links or emphasis is still prose, so its whole text decides.
      if ((el.textContent || '').length >= CH_MIN_TEXT) {
        var ch = zeroWidth(cs);
        if (ch) rec.chPx = ch;
      }
      elements.push(rec);
      // An svg's children are drawing primitives, not layout.
      if (tag !== 'svg') visitChildren(el, rec);
    }

    visitChildren(document.body, null);

    var probe = makeProbe();
    var rootStyle = getComputedStyle(document.documentElement);
    var tokens = {};
    (opts.tokens || DEFAULT_TOKENS).forEach(function (name) {
      var value = probe.colour(name) || rootStyle.getPropertyValue(name).trim();
      if (value) tokens[name] = value;
    });
    var palette = [];
    rootPropertyNames().forEach(function (name) {
      var c = probe.colour(name);
      if (c && palette.indexOf(c) === -1) palette.push(c);
    });
    probe.remove();

    var de = document.documentElement;
    return {
      schema: CAPTURE_SCHEMA,
      url: location.pathname + location.search,
      template: opts.template === undefined ? null : opts.template,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      page: {
        scrollWidth: de.scrollWidth,
        clientWidth: de.clientWidth,
        scrollHeight: de.scrollHeight,
        htmlBackground: getComputedStyle(de).backgroundColor,
        bodyBackground: document.body ? getComputedStyle(document.body).backgroundColor : '',
        layoutShift: await layoutShift(),
      },
      tokens: tokens,
      palette: palette,
      styleProps: STYLE_PROPS.slice(),
      strings: strings,
      elements: elements,
      truncated: truncated,
    };
  };

  // The element keyboard focus is on, keyed as the capture keys it, with what
  // a focus indicator can change; null when focus is on no element in the body.
  globalThis.__footbagFocusState = function () {
    var el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    var key = keyOf(el);
    if (!key) return null;
    var cs = getComputedStyle(el);
    var r = el.getBoundingClientRect();
    function stylesOf(node) {
      var s = getComputedStyle(node);
      var out = {};
      FOCUS_PROPS.forEach(function (p) { out[p] = s.getPropertyValue(p); });
      return out;
    }
    // A box around the control may draw its indicator through focus-within.
    var ancestors = [];
    for (var a = el.parentElement, k = 0; a && a !== document.body && k < FOCUS_WITHIN_DEPTH; a = a.parentElement, k++) {
      var aKey = keyOf(a);
      if (aKey) ancestors.push({ key: aKey, styles: stylesOf(a) });
    }
    return {
      key: key,
      rect: { x: round(r.left + (window.scrollX || 0)), y: round(r.top + (window.scrollY || 0)), w: round(r.width), h: round(r.height) },
      styles: stylesOf(el),
      ancestors: ancestors,
    };
  };
})();
