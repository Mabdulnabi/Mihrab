/*
 * The home screen for web-app TVs (LG webOS, Samsung Tizen), with the Android app's design and behavior (HomeView):
 *  - top: the "For You" title and the tabs (Explore, Movies, Shows); icon-only glass buttons at the right (Live TV,
 *    HDMI Inputs, Settings) and the crypto quotes at the end of the tab row;
 *  - three picks for this hour in the selected tab; the background is the first one's photo, blurred and almost white;
 *  - the glass shelf with the apps; ↓ opens the drawer (inputs, shortcuts, weather, prices); ↑ or Back closes it;
 *  - a night look from sunset to sunrise; a screensaver after a few idle minutes.
 * The remote's arrows, OK and Back move the focus; a pointer (LG's Magic Remote) focuses what it points at.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function sym(name, parent, size) {
    var s = el('span', 'sym', parent);
    s.style.webkitMaskImage = 'url(symbols/' + name + '.png)';
    s.style.maskImage = 'url(symbols/' + name + '.png)';
    if (size) { s.style.width = size + 'px'; s.style.height = size + 'px'; }
    return s;
  }

  function coin(i, parent) {
    var c = window.COINS && window.COINS[i];
    if (!c) return;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    for (var k = 0; k < c.length; k++) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', c[k]);
      p.setAttribute('fill-rule', 'evenodd');
      svg.appendChild(p);
    }
    parent.appendChild(svg);
  }

  function hasClass(e, c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0; }
  function setClass(e, c, on) {
    if (!e) return;
    if (on && !hasClass(e, c)) e.className = (e.className + ' ' + c).replace(/^\s+/, '');
    else if (!on && hasClass(e, c)) e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  var stage = $('stage'), body = document.body;

  /** The 1920 × 1080 stage fills the window (on the TV it already is 1920 × 1080). */
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.webkitTransform = stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }

  // MARK: - Apps on the shelf

  /** Shelf apps in this order when installed, like the Android app: key, LG app id, name on the TV, brand gradient. */
  var SHELF = [
    ['netflix', /^netflix$/, /netflix/i, ['#0A0A0A', '#000000']],
    ['youtube', /youtube/, /^youtube$/i, ['#1C1C1E', '#09090A']],
    ['prime', /^amazon$/, /prime video|amazon/i, ['#2AA8FF', '#0A68D4']],
    ['disney', /disney/, /disney/i, ['#173584', '#08143F']],
    ['max', /hbo|wbd/, /^(hbo )?max$|hbo max/i, ['#5C30E8', '#221684']],
    ['appletv', /appletv|apple\.tv/, /apple tv/i, ['#1C1C1E', '#000000']],
    ['hulu', /^hulu/, /hulu/i, ['#1CE783', '#0B8F4E']],
    ['paramount', /paramount|cbs/, /paramount/i, ['#0064FF', '#002A86']],
    ['peacock', /peacock/, /peacock/i, ['#1C1C1E', '#000000']],
    ['nfl', /nfl/, /^nfl/i, ['#013369', '#00163D']],
    ['globoplay', /globoplay/, /globoplay/i, ['#FF8A1F', '#FF2D5A']],
    ['jellyfin', /jellyfin/i, /jellyfin/i, ['#AA5CC3', '#00A4DC']],
    ['spotify', /spotify/, /spotify/i, ['#1DB954', '#0F7A36']]
  ];
  var MAX_SHELF = 8;

  function shelfKey(app) {
    for (var i = 0; i < SHELF.length; i++) if (SHELF[i][1].test(app.id) || SHELF[i][2].test(app.title)) return SHELF[i];
    return null;
  }

  function darken(hex, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#161618';
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ')';
  }

  /** A name that fits the tile on one line (the font shrinks for long names). */
  function wordFit(title, width, max) {
    return Math.max(18, Math.min(max, Math.floor(width * 0.8 / (Math.max(4, title.length) * 0.56))));
  }

  // MARK: - Logos

  // The TV's icons are small squares with their own background (white behind Netflix, black behind Max). Like the
  // Android app does with the TV art, the logo is lifted off it once: the background goes transparent and the rest is
  // cropped to the logo, which then fills the tile on the brand's color.
  var lifted = {};   // icon url -> {src, bg: [r, g, b], ink: luminance histogram} or false (keep the icon as it is)
  var LIFT_SIZE = 240;

  // sRGB (0-255) to linear light, computed once: lift() needs it for every pixel, and old TVs are slow at Math.pow.
  var LINEAR = [];
  for (var li = 0; li < 256; li++) LINEAR[li] = li <= 10 ? li / 255 / 12.92 : Math.pow((li / 255 + 0.055) / 1.055, 2.4);

  /** Relative luminance (0-1) of an sRGB color (whole numbers, as read from the canvas). */
  function luminance(r, g, b) {
    return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
  }

  function rgbOf(color) {
    var m = /^#?([0-9a-f]{6})$/i.exec(color || '');
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color || '');
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  }

  function lift(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return false;
    var f = Math.min(1, LIFT_SIZE / Math.max(w, h));
    w = Math.max(1, Math.round(w * f));
    h = Math.max(1, Math.round(h * f));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var g = canvas.getContext('2d');
    var data;
    try {
      g.drawImage(img, 0, 0, w, h);
      data = g.getImageData(0, 0, w, h);
    } catch (e) {
      return false;   // a TV that doesn't let the page read its icons
    }
    var px = data.data;
    // The background: the most common color a little inside the edges (rounded icons have transparent corners).
    var votes = {}, best = null, bestN = 0, inset = Math.round(Math.min(w, h) * 0.08);
    for (var s = 0; s < 64; s++) {
      var t = s % 16 / 16, side = s >> 4;
      var x = side < 2 ? Math.round(inset + t * (w - 2 * inset)) : side === 2 ? inset : w - 1 - inset;
      var y = side < 2 ? (side === 0 ? inset : h - 1 - inset) : Math.round(inset + t * (h - 2 * inset));
      var i = (y * w + x) * 4;
      var key = px[i + 3] < 128 ? 'clear' : (px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4);
      votes[key] = (votes[key] || 0) + 1;
      if (votes[key] > bestN) { bestN = votes[key]; best = key === 'clear' ? null : [px[i], px[i + 1], px[i + 2]]; }
    }
    var minX = w, minY = h, maxX = -1, maxY = -1, ink = [0, 0, 0, 0, 0, 0, 0, 0], inkSum = 0;
    for (var p = 0; p < w * h; p++) {
      var j = p * 4, a = px[j + 3] / 255;
      if (best) {
        // color to alpha: how far each channel is from the background, as a share of how far it could go, so the
        // anti-aliased edges come out as the logo's color, partly clear, without a fringe of the background
        var k = 0, c;
        for (c = 0; c < 3; c++) {
          var v = px[j + c], o = best[c];
          k = Math.max(k, v > o ? (v - o) / Math.max(1, 255 - o) : (o - v) / Math.max(1, o));
        }
        k = Math.max(0, Math.min(1, (k - 0.1) / 0.9));   // compression noise stays clear
        if (k > 0 && k < 1) {
          for (c = 0; c < 3; c++) px[j + c] = Math.max(0, Math.min(255, best[c] + (px[j + c] - best[c]) / k));
        }
        a *= k;
      }
      px[j + 3] = Math.round(a * 255);
      if (a > 0.3) {
        var px0 = p % w, py0 = (p / w) | 0;
        if (px0 < minX) minX = px0;
        if (px0 > maxX) maxX = px0;
        if (py0 < minY) minY = py0;
        if (py0 > maxY) maxY = py0;
        ink[Math.min(7, Math.floor(Math.sqrt(luminance(px[j], px[j + 1], px[j + 2])) * 8))] += a;
        inkSum += a;
      }
    }
    // Nothing left, or nothing taken away (a picture rather than a logo on a background): keep the icon.
    if (maxX < 0 || (maxX - minX > w * 0.96 && maxY - minY > h * 0.96)) return false;
    var crop = document.createElement('canvas');
    crop.width = maxX - minX + 1;
    crop.height = maxY - minY + 1;
    g.putImageData(data, 0, 0);
    crop.getContext('2d').drawImage(canvas, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
    for (var b = 0; b < 8; b++) ink[b] /= inkSum;
    try {
      return {src: crop.toDataURL('image/png'), bg: best, ink: ink};
    } catch (e2) {
      return false;
    }
  }

  /**
   * Share of the logo that hardly shows on a tile of this luminance (YouTube's black type on a dark tile). Each bin
   * of the histogram holds the ink whose square-root luminance falls in it.
   */
  function unseen(ink, tileLum) {
    var share = 0;
    for (var b = 0; b < 8; b++) {
      var l = Math.pow((b + 0.5) / 8, 2);
      if ((Math.max(l, tileLum) + 0.05) / (Math.min(l, tileLum) + 0.05) < 1.8) share += ink[b];
    }
    return share;
  }

  function paint(box, top, bottom) {
    box.style.background = '-webkit-linear-gradient(top, ' + top + ', ' + bottom + ')';
    box.style.background = 'linear-gradient(' + top + ', ' + bottom + ')';
  }

  function showLogo(img, box, top, bottom, logo) {
    img.className = 'logo';
    img.src = logo.src;
    var a = rgbOf(top), z = rgbOf(bottom);
    var tileLum = (luminance(a[0], a[1], a[2]) + luminance(z[0], z[1], z[2])) / 2;
    if (logo.bg && unseen(logo.ink, tileLum) > 0.35) {
      // the logo only reads on its own background: the tile takes it
      var bg = 'rgb(' + logo.bg.join(',') + ')';
      var hex = '#' + ((1 << 24) | (logo.bg[0] << 16) | (logo.bg[1] << 8) | logo.bg[2]).toString(16).slice(1);
      paint(box, bg, darken(hex, 0.93));
    }
  }

  /** An app's face: its logo on its brand color (or its name, when the icon can't be read). */
  function face(app, box, wordSize) {
    var k = shelfKey(app);
    var top = k ? k[3][0] : app.color ? darken(app.color, 0.92) : '#2A2A2E';
    var bottom = k ? k[3][1] : app.color ? darken(app.color, 0.62) : '#161618';
    paint(box, top, bottom);
    var word = el('div', 'word', box, app.title);
    if (wordSize) word.style.fontSize = wordSize + 'px';
    var logo = /shahid|شاهد/i.test(app.title) ? 'icons/shahid-mbc.png' : app.icon;
    if (logo) {
      var img = el('img', '', box), url = logo;
      word.style.visibility = 'hidden';
      img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); word.style.visibility = ''; };
      if (lifted[url]) { showLogo(img, box, top, bottom, lifted[url]); return; }
      if (lifted[url] !== false) {
        img.onload = function () {
          img.onload = null;
          if (lifted[url] === undefined) lifted[url] = lift(img);
          if (lifted[url]) showLogo(img, box, top, bottom, lifted[url]);
        };
      }
      img.src = url;
    }
  }

  var apps = [], shelf = [], others = [], inputs = [];

  /** App ids for the names in the config, in that order; a name matches a title it's part of, any case. */
  function idsByName(names) {
    var ids = [];
    for (var n = 0; n < names.length; n++) {
      var want = names[n].toLowerCase();
      for (var a = 0; a < apps.length; a++) {
        if (apps[a].title.toLowerCase().indexOf(want) >= 0 && ids.indexOf(apps[a].id) < 0) { ids.push(apps[a].id); break; }
      }
    }
    return ids;
  }

  function pickShelf() {
    var byName = idsByName(CONFIG.shelfApps || []);
    var chosen = Prefs.shelf() || (byName.length ? byName : null), out = [];
    if (chosen) {
      for (var i = 0; i < chosen.length && out.length < MAX_SHELF; i++) {
        for (var j = 0; j < apps.length; j++) if (apps[j].id === chosen[i]) out.push(apps[j]);
      }
    } else {
      for (var s = 0; s < SHELF.length && out.length < MAX_SHELF; s++) {
        for (var a = 0; a < apps.length; a++) {
          if ((SHELF[s][1].test(apps[a].id) || SHELF[s][2].test(apps[a].title)) && out.indexOf(apps[a]) < 0) { out.push(apps[a]); break; }
        }
      }
      if (!out.length) out = apps.slice(0, MAX_SHELF);
    }
    shelf = out;
    others = apps.filter(function (x) { return shelf.indexOf(x) < 0; });
  }

  // MARK: - Focus

  var Z = {TOP: 'top', CARDS: 'cards', SHELF: 'shelf', DRAWER: 'drawer', APPS: 'apps', SETTINGS: 'settings', EDIT: 'edit', LANG: 'lang', RADIO: 'radio'};
  var st = {zone: Z.SHELF, top: 0, tab: 0, card: 0, shelf: 0, drawer: 0, grid: 0, row: 0, edit: 0, lang: 0};
  var cards = [];

  function sheetOpen() { return st.zone === Z.APPS || st.zone === Z.SETTINGS || st.zone === Z.EDIT || st.zone === Z.LANG || st.zone === Z.RADIO; }

  function updateFocus() {
    var i, list;
    list = $('tabs').children;
    for (i = 0; i < list.length; i++) {
      setClass(list[i], 'on', i === st.tab);
      setClass(list[i], 'focus', st.zone === Z.TOP && st.top === i);
    }
    list = $('buttons').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.TOP && st.top === 3 + i);
    setClass($('netbadge'), 'focus', st.zone === Z.TOP && st.top === 2);
    setClass($('btbadge'), 'focus', st.zone === Z.TOP && st.top === 1);
    var rp = $('islamic') && $('islamic').querySelector('.ik-radio');
    if (rp) {
      setClass(rp.querySelector('.rp-play'), 'focus', st.zone === Z.TOP && st.top === 0);
      setClass(rp.querySelector('.rp-auto'), 'focus', st.zone === Z.TOP && st.top === -1);
      setClass(rp.querySelector('.rp-list'), 'focus', st.zone === Z.TOP && st.top === -2);
    }
    setClass($('quotes'), 'hide', st.zone === Z.TOP && st.top >= 3);
    list = $('cards').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.CARDS && st.card === i);
    list = $('tiles').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.SHELF && st.shelf === i);
    list = document.querySelectorAll('#drawer .key');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.DRAWER && st.drawer === i);
    list = document.querySelectorAll('#apps .cell');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.APPS && st.grid === i);
    var rows = Math.max(1, Math.ceil(others.length / 5)), r = Math.floor(st.grid / 5), first = Math.max(0, Math.min(rows - 3, r - 1));
    $('apps').lastChild.style.webkitTransform = $('apps').lastChild.style.transform = 'translateY(' + (-first * 239) + 'px)';
    focusRows($('settings'), st.row, st.zone === Z.SETTINGS);
    focusRows($('shelfedit'), st.edit, st.zone === Z.EDIT);
    focusRows($('langpick'), st.lang, st.zone === Z.LANG);
    if (langHint) langHint.textContent = (st.lang + 1) + ' / ' + languageChoices().length + '  ·  ' + tr('OK picks, Back cancels.');
    setClass(body, 'drawer-open', st.zone === Z.DRAWER);
  }

  function focusRows(sheet, index, on) {
    var rows = sheet.querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) setClass(rows[i], 'focus', on && i === index);
    var holder = sheet.querySelector('.rows');
    if (!holder) return;
    var visible = 7, first = Math.max(0, Math.min(rows.length - visible, index - 3));
    holder.style.webkitTransform = holder.style.transform = 'translateY(' + (-first * 78) + 'px)';
  }

  function nearest(nodes, x) {
    var best = 0, bestD = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect(), d = Math.abs((r.left + r.right) / 2 - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function centerX(node) {
    if (!node) return 960;
    var r = node.getBoundingClientRect();
    return (r.left + r.right) / 2;
  }

  // MARK: - Top: title, tabs, buttons, quotes

  var TAB_KIND = [null, 'movie', 'tv'];

  /** Arabic reads right to left: a box that starts x from the left starts x from the right instead. */
  function rtl() { return document.documentElement.dir === 'rtl'; }
  function place(e, x) {
    if (rtl()) { e.style.left = 'auto'; e.style.right = x + 'px'; }
    else { e.style.left = x + 'px'; e.style.right = ''; }
  }

  function renderTop() {
    $('title').textContent = greeting(cairoNow());
    var buttons = $('buttons');
    buttons.innerHTML = '';
    var defs = [['live_tv', tr('light|Live TV')], ['hdmi', tr('HDMI Inputs')], ['settings', tr('light|Settings')]];
    for (var b = 0; b < 3; b++) {
      var r = el('button', 'round' + (b === 2 ? ' last' : ''), buttons);
      place(r, 1596 + 88 * b);
      sym(defs[b][0], r);
      el('div', 'tip', r, defs[b][1]);
      hover(r, Z.TOP, 3 + b);
    }
  }

  function renderQuotes() {
    var q = $('quotes'), coins = Data.activeCoins();
    q.innerHTML = '';
    var g = Data.gold();
    if (g) {
      el('span', 'q', q, tr('24K') + ' ' + Math.round(g.k24));
      el('span', 'q', q, tr('21K') + ' ' + Math.round(g.k21));
      return;
    }
    for (var i = 0; i < coins.length; i++) {
      var item = el('span', 'q', q);
      coin(coins[i], item);
      el('span', '', item, Data.compact(Data.prices[coins[i]]));
    }
  }

  // MARK: - Picks and background

  function renderCards() {
    var list = Data.picks(TAB_KIND[st.tab]);
    var holder = $('cards');
    setClass(body, 'no-picks', !list.length);
    if (list.length) hidePhoto(); else showPhoto();
    var same = list.length === cards.length;
    for (var i = 0; same && i < list.length; i++) same = list[i].id === cards[i].id && list[i].backdrop === cards[i].backdrop && list[i].meta === cards[i].meta;
    if (same && holder.children.length === list.length) return;
    cards = list;
    holder.innerHTML = '';
    var rects = [[80, 1040], [1160, 320], [1520, 320]];
    for (var c = 0; c < list.length; c++) {
      var p = list[c], card = el('div', 'card', holder);
      place(card, rects[c][0]);
      card.style.width = rects[c][1] + 'px';
      var img = el('div', 'img', card);
      img.style.backgroundImage = 'url(' + Data.image(p.backdrop, c === 0 ? 'w1280' : 'w780') + ')';
      el('div', 'name', card, p.title);
      if (c === 0 && p.meta) el('div', 'meta', card, p.meta);
      hover(card, Z.CARDS, c);
    }
    st.card = Math.min(st.card, Math.max(0, list.length - 1));
    if (!list.length && st.zone === Z.CARDS) st.zone = Z.SHELF;
    backdrop(list.length ? Data.image(list[0].backdrop, 'w300') : '');
    updateFocus();
  }

  var bgUrl = null, bgFront = 'bgA';

  /** The first pick's photo as the background: drawn tiny and stretched, it's already as soft as a heavy blur. */
  function backdrop(url) {
    if (url === bgUrl) return;
    bgUrl = url;
    var next = bgFront === 'bgA' ? 'bgB' : 'bgA';
    if (!url) {
      setClass($('bgA'), 'on', false);
      setClass($('bgB'), 'on', false);
      return;
    }
    var img = new Image();
    img.onload = function () {
      if (bgUrl !== url) return;
      var canvas = $(next), ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setClass(canvas, 'on', true);
      setClass($(bgFront), 'on', false);
      bgFront = next;
    };
    img.src = url;
  }

  function renderClock() {
    var d = cairoNow(), c = $('clock'), hj = hijri(d);
    $('title').textContent = greeting(d);
    c.querySelector('.time').textContent = formatDate('format|h:mm', d.getTime());
    c.querySelector('.date').textContent = formatDate('format|EEEE, MMMM d', d.getTime()) + (hj ? '  ·  ' + hj : '');
    weatherLine(c.querySelector('.wx'));
    renderIslamic(d);
    renderAzkar(d);
    renderRadio();
    renderNetwork();
  }

  /** The current time in Cairo, from UTC (EET +2; EEST +3 from the last Friday of April to the last Thursday of
      October), as a Date whose fields read Cairo's. Doesn't depend on the TV's own time zone. */
  function cairoNow() {
    var t = Date.now(), y = new Date(t).getUTCFullYear();
    var start = lastWeekdayUTC(y, 3, 5), end = lastWeekdayUTC(y, 9, 4) + 86400000;
    var c = new Date(t + (t >= start && t < end ? 3 : 2) * 3600000);
    return new Date(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate(), c.getUTCHours(), c.getUTCMinutes(), c.getUTCSeconds());
  }

  /** The last `weekday` (0 = Sunday) of a month (0-based), as a UTC time. */
  function lastWeekdayUTC(year, month, weekday) {
    var d = new Date(Date.UTC(year, month + 1, 0));
    while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() - 1);
    return d.getTime();
  }

  /** Morning runs from Fajr to Maghrib, evening after; before the times arrive, from 5 to 17. */
  function isMorning(d) {
    var t = Data.timings();
    if (!t) return d.getHours() >= 5 && d.getHours() < 17;
    var now = d.getHours() * 60 + d.getMinutes();
    var f = t.Fajr.split(':'), m = t.Maghrib.split(':');
    return now >= parseInt(f[0], 10) * 60 + parseInt(f[1], 10) && now < parseInt(m[0], 10) * 60 + parseInt(m[1], 10);
  }

  function greeting(d) { return isMorning(d) ? tr('Good morning') : tr('Good evening'); }

  /** The gold prices in EGP per gram (24 and 21 karat), or '' before they arrive. */
  function goldText() {
    var g = Data.gold();
    return g ? tr('24K') + ' ' + Math.round(g.k24) + '  ·  ' + tr('21K') + ' ' + Math.round(g.k21) : '';
  }

  function weatherLine(box) {
    box.innerHTML = '';
    var w = Data.weather;
    if (w) sym(Data.symbol(w.code, w.isDay), box, 30);
    el('span', '', box, weatherText());
  }

  function weatherText() {
    var w = Data.weather;
    return w ? Data.degrees(w.temp) + '  ·  ' + Data.condition(w.code, w.isDay) : '';
  }

  /** The next prayer with its time and what's left, for the screensaver. */
  function prayerLine(d) {
    var next = Data.nextPrayer(d);
    if (!next) return '';
    var mins = next.minutes;
    return prayerName(next.key) + '  ' + formatDate('format|h:mm a', next.at.getTime()) + '  ·  '
      + trf('in {time}', {time: trf('{h}h {m}m', {h: Math.floor(mins / 60), m: mins % 60})});
  }

  /** The Hijri date in the locale's numerals (Umm al-Qura), or '' where Intl doesn't know the calendar. */
  function hijri(d) {
    if (I18N.lang !== 'ar') return '';
    try {
      return new Intl.DateTimeFormat(I18N.locale() + '-u-ca-islamic-umalqura',
        {day: 'numeric', month: 'long', year: 'numeric'}).format(d);
    } catch (e) { return ''; }
  }

  /** The prayer's name in the catalogue (literal keys, so the translation tool sees them). */
  function prayerName(key) {
    var names = {Fajr: tr('Fajr'), Dhuhr: tr('Dhuhr'), Asr: tr('Asr'), Maghrib: tr('Maghrib'), Isha: tr('Isha')};
    return names[key];
  }

  /** The next prayer and a hadith, on the no-picks home screen, in Arabic. */
  function renderIslamic(d) {
    var arabic = I18N.lang === 'ar', box = $('islamic');
    setClass(body, 'arabic', arabic);
    if (!arabic || !box) return;
    var next = Data.nextPrayer(d), h = Data.hadithOfDay(d);
    box.querySelector('.ik-head').textContent = tr('Next prayer');
    box.querySelector('.ik-prayer').textContent = next
      ? prayerName(next.key) + '  ' + formatDate('format|h:mm a', next.at.getTime()) : '—';
    var mins = next ? next.minutes : 0;
    box.querySelector('.ik-left').textContent = next
      ? trf('in {time}', {time: trf('{h}h {m}m', {h: Math.floor(mins / 60), m: mins % 60})}) : '';
    box.querySelector('.ik-hadith').textContent = h.text;
    box.querySelector('.ik-src').textContent = h.src;
  }

  // MARK: - Shelf

  function renderShelf() {
    var n = shelf.length, gap = 48, pad = 40;
    // 16:9 tiles, as on Android: never taller than 126, and the glass keeps its bottom edge.
    var tw = Math.min(126 * 16 / 9, (1760 - Math.max(0, n - 1) * gap) / Math.max(1, n)), th = tw * 9 / 16;
    var width = n * tw + Math.max(0, n - 1) * gap, left = (1920 - width) / 2;
    var platter = $('platter');
    platter.style.display = n ? '' : 'none';
    place(platter, left - pad);
    platter.style.width = (width + 2 * pad) + 'px';
    platter.style.top = (814 + 126 - th) + 'px';
    platter.style.height = (th + 2 * pad) + 'px';
    var tiles = $('tiles');
    tiles.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var t = el('div', 'tile', tiles);
      place(t, left + i * (tw + gap));
      t.style.top = (854 + 126 - th) + 'px';
      t.style.width = tw + 'px';
      t.style.height = th + 'px';
      face(shelf[i], t, wordFit(shelf[i].title, tw, 30));
      hover(t, Z.SHELF, i);
    }
    st.shelf = Math.min(st.shelf, Math.max(0, n - 1));
  }

  // MARK: - Drawer

  var drawerItems = [], drawerInputs = 0;

  function renderDrawer() {
    var d = $('drawer');
    d.innerHTML = '';
    drawerItems = [];
    for (var i = 0; i < inputs.length; i++) {
      var x = inputs[i];
      drawerItems.push({label: x.label || tr('Live TV'), symbol: x.symbol, off: !x.connected, run: launcher(x.id, x.label)});
    }
    drawerInputs = drawerItems.length;
    drawerItems.push({label: tr('All Apps'), symbol: 'apps', run: openApps});
    drawerItems.push({label: tr('Change background'), symbol: 'sync', run: photoTurn});
    drawerItems.push({label: tr('Favorite background'), symbol: 'sparkles', run: toggleFavorite});
    drawerItems.push({label: tr('Home Settings'), symbol: 'settings', run: openSettings});
    drawerItems.push({label: tr('TV Settings'), symbol: 'tv_settings', run: tvSettings});
    var n = drawerItems.length, gap = 18, groupGap = 56, groups = drawerInputs > 0 && drawerInputs < n ? 2 : 1;
    var tw = Math.min(230, (1760 - Math.max(0, n - groups) * gap - (groups - 1) * groupGap) / Math.max(1, n));
    var xPos = 80;
    for (var k = 0; k < n; k++) {
      if (k === drawerInputs && k > 0) {
        xPos += groupGap - gap;
        place(el('div', 'row-title', d, tr('Shortcuts')), xPos + 4);
      }
      if (k === 0 && drawerInputs) place(el('div', 'row-title', d, tr('Inputs')), 84);
      var item = drawerItems[k], key = el('div', 'key glass' + (item.off ? ' off' : ''), d);
      place(key, xPos);
      key.style.width = tw + 'px';
      sym(item.symbol, key);
      el('div', 'label', key, item.label);
      hover(key, Z.DRAWER, k);
      xPos += tw + gap;
    }
    renderPanels();
    updateFocus();
  }

  function renderPanels() {
    var d = $('drawer');
    var old = d.querySelectorAll('.panel');
    for (var o = 0; o < old.length; o++) d.removeChild(old[o]);
    var wx = Prefs.weather(), gold = Data.gold(), qt = !!gold;
    var split = 80 + 1760 * 0.585;
    if (wx) {
      var w = el('div', 'panel glass', d);
      w.id = 'weather';
      place(w, 80);
      w.style.width = ((qt ? split - 16 : 1840) - 80) + 'px';
      renderWeather(w);
    }
    if (qt) {
      var q = el('div', 'panel glass', d);
      q.id = 'prices';
      var left = wx ? split + 16 : 80;
      place(q, left);
      q.style.width = (1840 - left) + 'px';
      renderGold(q, gold);
    }
  }

  function renderWeather(card) {
    el('div', 'head', card, Data.cityName() || tr('Weather'));
    var w = Data.weather;
    if (!w) {
      el('div', 'cond', card, tr('No weather data right now.')).style.top = '96px';
      return;
    }
    var now = el('div', 'now', card);
    sym(Data.symbol(w.code, w.isDay), now);
    el('span', 'temp', now, Data.degrees(w.temp));
    el('div', 'cond', card, Data.condition(w.code, w.isDay));
    el('div', 'range', card, trf('H:{max}', {max: Data.degrees(w.max)}) + '   ' + trf('L:{min}', {min: Data.degrees(w.min)}));
    el('div', 'split', card);
    var hours = el('div', 'hours', card), width = parseFloat(card.style.width) - 30 - 422, hw = width / 6;
    for (var i = 0; i < w.hours.length && i < 6; i++) {
      var h = el('div', 'hour', hours), x = w.hours[i];
      place(h, hw * i);
      h.style.width = hw + 'px';
      el('div', 't', h, Data.hour(x.at));
      sym(Data.symbol(x.code, x.day), h);
      el('div', 'd', h, Data.degrees(x.temp));
    }
    var sun = el('div', 'sun', card);
    if (w.sunrise) { var a = el('span', '', sun); sym('sunrise', a); a.appendChild(document.createTextNode(trf('Sunrise {time}', {time: Data.time(w.sunrise)}))); }
    if (w.sunset) { var b = el('span', '', sun); sym('sunset', b); b.appendChild(document.createTextNode(trf('Sunset {time}', {time: Data.time(w.sunset)}))); }
  }

  /** The gold price per gram in EGP, 24 and 21 karat, in the drawer's price card. */
  function renderGold(card, gold) {
    el('div', 'head', card, tr('Gold'));
    el('div', 'side', card, tr('EGP per gram'));
    var rows = [[tr('24K'), gold.k24], [tr('21K'), gold.k21]];
    for (var j = 0; j < rows.length; j++) {
      var row = el('div', 'coin', card);
      row.style.top = (86 + 52 * j) + 'px';
      el('div', 'n', row, rows[j][0]);
      el('div', 'p', row, String(Math.round(rows[j][1])));
    }
  }

  function renderPrices(card, coins) {
    el('div', 'head', card, tr('Crypto'));
    var stale = Data.staleness(Data.pricesAt, 5 * 60000);
    el('div', 'side', card, stale ? trf('quotes|{ago}', {ago: stale}) : tr('24h change'));
    for (var j = 0; j < coins.length; j++) {
      var i = coins[j], row = el('div', 'coin', card);
      row.style.top = (86 + 52 * j) + 'px';
      coin(i, row);
      el('span', 'n', row, Data.coinName(i));
      el('span', 'p', row, Data.money(Data.prices[i]));
      var ch = Data.changes[i];
      if (!isNaN(ch)) el('span', 'c ' + (ch >= 0 ? 'up' : 'down'), row, Data.change(ch));
    }
  }

  function openDrawer() {
    if (!drawerItems.length) return;
    var tiles = $('tiles').children;
    st.zone = Z.DRAWER;
    st.drawer = Math.min(drawerItems.length - 1, nearest(document.querySelectorAll('#drawer .key'), centerX(tiles[st.shelf])));
    updateFocus();
  }

  function closeDrawer() {
    var keys = document.querySelectorAll('#drawer .key');
    st.zone = Z.SHELF;
    if (shelf.length) st.shelf = nearest($('tiles').children, centerX(keys[st.drawer]));
    updateFocus();
  }

  // MARK: - All Apps

  function renderApps() {
    var sheet = $('apps');
    sheet.firstChild.textContent = tr('All Apps');
    var grid = sheet.lastChild;
    grid.innerHTML = '';
    for (var i = 0; i < others.length; i++) {
      var r = Math.floor(i / 5), c = i % 5, cell = el('div', 'cell', grid);
      place(cell, 130 + c * 340);
      cell.style.top = (196 + r * 239) + 'px';
      face(others[i], el('div', 'face', cell), wordFit(others[i].title, 300, 34));
      el('div', 'label', cell, others[i].title);
      hover(cell, Z.APPS, i);
    }
  }

  function openApps() {
    renderApps();
    st.zone = Z.APPS;
    st.grid = 0;
    setClass($('apps'), 'open', true);
    updateFocus();
  }

  function closeSheets() {
    setClass($('apps'), 'open', false);
    setClass($('settings'), 'open', false);
    setClass($('shelfedit'), 'open', false);
    setClass($('langpick'), 'open', false);
    langHint = null;
    st.zone = Z.SHELF;
    updateFocus();
  }

  // MARK: - Home Settings

  function settingRows() {
    var unit = Prefs.temperature(), theme = Prefs.theme();
    var auto = tr('Automatic'), picked = pickedLanguage();
    var rows = [
      {label: tr('Language'), value: picked === 'auto' ? auto : I18N.languageName(picked), opens: true, language: true,
        step: function (d) { if (d >= 0) openLanguages(); }},
      {label: tr('Temperature'), value: unit === 'C' ? '°C' : unit === 'F' ? '°F' : tr('unit|Automatic'),
        step: function (d) { cycle('temperature', ['auto', 'C', 'F'], unit, d); renderPanels(); }},
      {label: tr('Theme'), value: theme === 'light' ? tr('Light') : theme === 'dark' ? tr('Dark') : auto,
        step: function (d) { cycle('theme', ['auto', 'light', 'dark'], theme, d); checkNight(); }},
      {label: tr('Weather location'), value: Prefs.location() >= 0 ? LOCATIONS[Prefs.location()].name : tr('Automatic'),
        step: function (d) {
          var i = Prefs.location(), n = LOCATIONS.length;
          i = i < 0 ? (d > 0 ? 0 : n - 1) : (i + (d || 1) + n) % n;
          Prefs.set('location', i);
          Data.setLocation(LOCATIONS[i]);
          Data.refresh();
          renderPanels();
        }},
      {label: tr('Quran radio'), value: Prefs.radio() === 'auto' ? tr('Automatic') : tr('Manual'),
        step: function (d) { cycle('radio', ['manual', 'auto'], Prefs.radio(), d); }},
      {label: tr('Glass'), value: Prefs.glass() === 'light' ? tr('Light') : Prefs.glass() === 'dark' ? tr('Dark') : auto,
        step: function (d) { cycle('glass', ['auto', 'light', 'dark'], Prefs.glass(), d); checkNight(); }},
      {label: tr('Backgrounds'), value: Prefs.photos() === 'fav' ? tr('Favorites') : tr('Library'),
        step: function (d) { cycle('photos', ['all', 'fav'], Prefs.photos(), d); photoTurn(); }},
      {label: tr('Weather widget'), toggle: Prefs.weather(),
        step: function () { Prefs.set('weather', !Prefs.weather()); renderPanels(); }},
      {label: tr('Quotes widget'), toggle: Prefs.quotes(),
        step: function () { Prefs.set('quotes', !Prefs.quotes()); Data.settingsChanged(); }}
    ];
    var names = ['Bitcoin', 'Ethereum', 'Solana', tr('Dollar')];
    var count = Data.currency === 'BRL' ? 4 : 3;
    for (var i = 0; i < count; i++) {
      (function (i) {
        rows.push({label: names[i], toggle: Prefs.quotes() && Prefs.coin(i), dim: !Prefs.quotes(),
          step: function () { if (Prefs.quotes()) { Prefs.setCoin(i, !Prefs.coin(i)); Data.settingsChanged(); } }});
      })(i);
    }
    rows.push({label: tr('Shelf'), value: '›', step: function (d) { if (d >= 0) openShelfEdit(); }});
    rows.push({label: tr('TV Settings'), value: '›', step: function (d) { if (d >= 0) tvSettings(); }});
    return rows;
  }

  function cycle(name, values, current, d) {
    var i = values.indexOf(current);
    Prefs.set(name, values[(i + (d || 1) + values.length) % values.length]);
  }

  var LOCATIONS = [
    {name: 'القاهرة', lat: 30.0444, lon: 31.2357},
    {name: 'المنوفية', lat: 30.5598, lon: 31.0061},
    {name: 'الجيزة', lat: 30.0131, lon: 31.2089},
    {name: 'الإسكندرية', lat: 31.2001, lon: 29.9187},
    {name: 'المنصورة', lat: 31.0364, lon: 31.3807},
    {name: 'طنطا', lat: 30.7865, lon: 31.0004},
    {name: 'أسيوط', lat: 27.1801, lon: 31.1837},
    {name: 'الأقصر', lat: 25.6872, lon: 32.6396},
    {name: 'أسوان', lat: 24.0889, lon: 32.8998},
    {name: 'الإسماعيلية', lat: 30.5965, lon: 32.2715}
  ];

  var rowsNow = [];

  function renderSettings() {
    var box = $('settings').firstChild;
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('settings', title);
    title.appendChild(document.createTextNode(tr('Home Settings')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    rowsNow = settingRows();
    list.style.height = Math.min(rowsNow.length, 7) * 78 + 'px';
    for (var i = 0; i < rowsNow.length; i++) {
      var r = rowsNow[i], row = el('div', 'row' + (r.dim ? ' dim' : ''), holder, r.label);
      if (r.toggle !== undefined) setClass(el('div', 'toggle', row), 'on', r.toggle);
      else {
        var v = el('span', 'value', row);
        if (r.value === '›') v.textContent = '›';
        else if (r.opens) { v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
        else { el('span', 'chev', v, '‹'); v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
      }
      hover(row, Z.SETTINGS, i);
    }
    el('div', 'hint', box, tr('OK or the arrows change the value.'));
    updateFocus();
  }

  function openSettings() {
    st.zone = Z.SETTINGS;
    st.row = 0;
    renderSettings();
    setClass($('settings'), 'open', true);
    updateFocus();
  }

  // MARK: - Language: a list of every catalogue in its own name, as on Android (moving through it doesn't switch the app)

  var langHint = null;

  function languageChoices() {
    return ['auto'].concat(I18N.languages());
  }

  /** The language in use: "auto", or the catalogue the setting resolved to ("pt-BR" in config.properties is "pt"). */
  function pickedLanguage() {
    return Prefs.language() === 'auto' ? 'auto' : I18N.lang;
  }

  function renderLanguages() {
    var box = $('langpick').firstChild, choices = languageChoices(), current = choices.indexOf(pickedLanguage());
    box.innerHTML = '';
    el('div', 'title', box, tr('Language'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(choices.length, 7) * 78 + 'px';
    for (var i = 0; i < choices.length; i++) {
      var row = el('div', 'row', holder, choices[i] === 'auto' ? tr('Automatic') : I18N.languageName(choices[i]));
      if (i === current) sym('check', el('span', 'value', row));
      hover(row, Z.LANG, i);
    }
    langHint = el('div', 'hint', box);
    updateFocus();
  }

  function openLanguages() {
    setClass($('settings'), 'open', false);
    st.zone = Z.LANG;
    st.lang = Math.max(0, languageChoices().indexOf(pickedLanguage()));
    renderLanguages();
    setClass($('langpick'), 'open', true);
    updateFocus();
  }

  /** OK: the language under the focus; Back: none. Either way, back to Home Settings, on the Language row. */
  function closeLanguages(pick) {
    setClass($('langpick'), 'open', false);
    langHint = null;
    var code = languageChoices()[st.lang];
    if (pick && code !== pickedLanguage()) {
      Prefs.set('language', code);
      I18N.set(Prefs.language());
      renderAll();
      Data.refresh();   // the picks' titles and genres come in the new language
    }
    openSettings();
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i].language) st.row = i;
    updateFocus();
  }

  // MARK: - Shelf editor: which apps, in what order

  function editList() {
    var ids = shelf.map(function (a) { return a.id; });
    return {ids: ids, rows: apps.slice().sort(function (a, b) {
      var ia = ids.indexOf(a.id), ib = ids.indexOf(b.id);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
    })};
  }

  function renderShelfEdit() {
    var box = $('shelfedit').firstChild, e = editList();
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('apps', title);
    title.appendChild(document.createTextNode(tr('Shelf')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(e.rows.length, 7) * 78 + 'px';
    for (var i = 0; i < e.rows.length; i++) {
      var a = e.rows[i], at = e.ids.indexOf(a.id), row = el('div', 'row', holder, a.title);
      el('span', 'value', row, at >= 0 ? '#' + (at + 1) : tr('shelf|Off'));
      hover(row, Z.EDIT, i);
    }
    el('div', 'hint', box, trf('OK adds or removes (up to {n}). ← → change the order.', {n: MAX_SHELF}));
    updateFocus();
  }

  function openShelfEdit() {
    setClass($('settings'), 'open', false);
    st.zone = Z.EDIT;
    st.edit = 0;
    renderShelfEdit();
    setClass($('shelfedit'), 'open', true);
    updateFocus();
  }

  function editShelf(dx) {
    var e = editList(), app = e.rows[st.edit];
    if (!app) return;
    var ids = e.ids.slice(), at = ids.indexOf(app.id);
    if (dx === 0) {
      if (at >= 0) ids.splice(at, 1);
      else if (ids.length < MAX_SHELF) ids.push(app.id);
      else { toast(trf('The shelf holds up to {n} apps.', {n: MAX_SHELF})); return; }
    } else {
      if (at < 0) return;
      var to = Math.max(0, Math.min(ids.length - 1, at + dx));
      ids.splice(at, 1);
      ids.splice(to, 0, app.id);
    }
    Prefs.set('shelf', ids);
    pickShelf();
    renderShelf();
    var again = editList();
    for (var i = 0; i < again.rows.length; i++) if (again.rows[i].id === app.id) st.edit = i;
    renderShelfEdit();
  }

  // MARK: - Opening things

  function launcher(id, name) {
    return function () {
      TV.launch(id, null, function (ok) {
        if (!ok) toast(trf("Couldn't open {app}.", {app: name || id}));
      });
    };
  }

  function tvSettings() {
    TV.settings(function (ok) {
      if (!ok) toast(tr("Couldn't open TV Settings"));
    });
  }

  function liveTV() {
    for (var i = 0; i < inputs.length; i++) if (inputs[i].key === 'live') return inputs[i];
    return null;
  }

  function activate() {
    switch (st.zone) {
      case Z.TOP:
        if (st.top === 0) { toggleRadio(); return; }
        if (st.top === -1) { toggleAuto(); return; }
        if (st.top === -2) { openRadioList(); return; }
        if (st.top === 1 || st.top === 2) { tvSettings(); return; }
        if (st.top < 3) return;
        if (st.top === 3) { var live = liveTV(); if (live) launcher(live.id, tr('Live TV'))(); }
        else if (st.top === 4) { st.zone = Z.SHELF; openDrawer(); st.drawer = 1 < drawerInputs ? 1 : 0; updateFocus(); }
        else openSettings();
        return;
      case Z.CARDS:
        var p = cards[st.card], app = p && Data.appFor(p.app);
        if (app) launcher(app.id, app.title)();
        return;
      case Z.SHELF:
        if (shelf[st.shelf]) launcher(shelf[st.shelf].id, shelf[st.shelf].title)();
        return;
      case Z.DRAWER:
        if (drawerItems[st.drawer]) drawerItems[st.drawer].run();
        return;
      case Z.APPS:
        if (others[st.grid]) launcher(others[st.grid].id, others[st.grid].title)();
        return;
      case Z.SETTINGS:
        if (rowsNow[st.row]) { rowsNow[st.row].step(1); if (st.zone === Z.SETTINGS) renderSettings(); }
        return;
      case Z.EDIT:
        editShelf(0);
        return;
      case Z.LANG:
        closeLanguages(true);
        return;
    }
  }

  function selectTab(i) {
    if (i === st.tab) return;
    st.tab = i;
    renderCards();
  }

  function move(dx, dy) {
    var tiles = $('tiles').children, cardNodes = $('cards').children;
    switch (st.zone) {
      case Z.SHELF:
        if (dx) st.shelf = Math.max(0, Math.min(shelf.length - 1, st.shelf + dx));
        else if (dy > 0) { openDrawer(); return; }
        else if (dy < 0) {
          if (cards.length) { st.zone = Z.CARDS; st.card = nearest(cardNodes, centerX(tiles[st.shelf])); }
          else { st.zone = Z.TOP; st.top = 3; }
        }
        break;
      case Z.CARDS:
        if (dx) st.card = Math.max(0, Math.min(cards.length - 1, st.card + dx));
        else if (dy < 0) { st.zone = Z.TOP; st.top = 3; }
        else if (shelf.length) { st.zone = Z.SHELF; st.shelf = nearest(tiles, centerX(cardNodes[st.card])); }
        break;
      case Z.TOP:
        if (dx) {
          st.top = Math.max(-2, Math.min(5, st.top + dx));
        } else if (dy > 0) {
          if (cards.length) { st.zone = Z.CARDS; st.card = Math.min(cards.length - 1, st.top < 3 ? 0 : cards.length - 1); }
          else st.zone = Z.SHELF;
        }
        break;
      case Z.DRAWER:
        if (dx) st.drawer = Math.max(0, Math.min(drawerItems.length - 1, st.drawer + dx));
        else if (dy < 0) { closeDrawer(); return; }
        break;
      case Z.APPS:
        var g = st.grid + dx + dy * 5;
        if (g >= 0 && g < others.length && (dx === 0 || Math.floor(g / 5) === Math.floor(st.grid / 5))) st.grid = g;
        break;
      case Z.SETTINGS:
        if (dy) st.row = Math.max(0, Math.min(rowsNow.length - 1, st.row + dy));
        else if (dx && rowsNow[st.row]) {
          var r = rowsNow[st.row];
          if (r.value !== '›') { r.step(dx); if (st.zone === Z.SETTINGS) renderSettings(); }
        }
        break;
      case Z.EDIT:
        if (dy) st.edit = Math.max(0, Math.min(apps.length - 1, st.edit + dy));
        else if (dx) editShelf(dx);
        break;
      case Z.LANG:
        if (dy) st.lang = Math.max(0, Math.min(languageChoices().length - 1, st.lang + dy));
        break;
    }
    updateFocus();
  }

  function back() {
    if (st.zone === Z.EDIT) { setClass($('shelfedit'), 'open', false); openSettings(); st.row = rowsNow.length - 2; updateFocus(); return; }
    if (st.zone === Z.LANG) { closeLanguages(false); return; }
    if (sheetOpen()) { closeSheets(); return; }
    if (st.zone === Z.DRAWER) { closeDrawer(); return; }
    if (st.zone !== Z.SHELF && shelf.length) { st.zone = Z.SHELF; updateFocus(); return; }
    TV.back();
  }

  /** The pointer focuses what it's over (the Magic Remote, or a mouse when previewing). */
  function hover(node, zone, index) {
    node.onmouseover = function () {
      if (saverOn || (sheetOpen() !== (zone === Z.APPS || zone === Z.SETTINGS || zone === Z.EDIT || zone === Z.LANG))) return;
      if (zone === Z.DRAWER && st.zone !== Z.DRAWER) return;
      if (zone !== Z.DRAWER && st.zone === Z.DRAWER && zone !== Z.SHELF) return;
      if (zone === Z.SHELF && st.zone === Z.DRAWER) closeDrawer();
      st.zone = zone;
      if (zone === Z.TOP) { st.top = index; if (index < 3) selectTab(index); }
      else if (zone === Z.CARDS) st.card = index;
      else if (zone === Z.SHELF) st.shelf = index;
      else if (zone === Z.DRAWER) st.drawer = index;
      else if (zone === Z.APPS) st.grid = index;
      else if (zone === Z.SETTINGS) st.row = index;
      else if (zone === Z.EDIT) st.edit = index;
      else if (zone === Z.LANG) st.lang = index;
      updateFocus();
    };
    node.onclick = function () { node.onmouseover(); activate(); };
  }

  // MARK: - Toast

  var toastTimer = 0;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    setClass(t, 'on', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { setClass(t, 'on', false); }, 6000);
  }

  // MARK: - Night, clock, screensaver

  function checkNight() {
    var th = Prefs.theme();
    setClass(body, 'night', th === 'dark' || photoOn || (th !== 'light' && Data.isNight(Date.now())));
    setClass(body, 'light-photo', photoOn && th === 'light');
    var gl = Prefs.glass();
    setClass(body, 'glass-dark', gl === 'dark');
    setClass(body, 'glass-light', gl === 'light');
  }

  // MARK: - Photos: shown with no picks (no TMDB key, or none yet), on the home screen and in the screensaver

  /** The photos that come with the app, by time of day: a natural scene in the day, a lit room at dusk, a mosque at night. */
  var PHOTOS = {morning: ['backgrounds/bg4.webp'], day: ['backgrounds/bg4.webp'], evening: ['backgrounds/bg4.webp'], night: ['backgrounds/bg4.webp']};
  var REMOTE_PHOTOS = null;
  var WEB_QUERIES = {morning: 'sunrise landscape', day: 'nature landscape', evening: 'sunset landscape', night: 'night sky stars landscape'};
  var WEB_PHOTOS = {morning: [], day: [], evening: [], night: []};

  /** Photos from the web for each time of day (Wikimedia Commons' open images), read on start; the ones above are the fallback. */
  function loadWebPhotos() {
    fetchWebPhotos(timeOfDay(cairoNow()));
  }

  function timeOfDay(d) {
    var h = d.getHours();
    return h >= 5 && h < 8 ? 'morning' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 19 ? 'evening' : 'night';
  }

  function fetchWebPhotos(k) {
    var url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6'
      + '&gsrlimit=20&gsrsearch=' + encodeURIComponent(WEB_QUERIES[k] + ' filetype:bitmap')
      + '&prop=imageinfo&iiprop=url&iiurlwidth=1280';
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || x.status !== 200) return;
      try {
        var pages = JSON.parse(x.responseText).query.pages, list = [];
        for (var id in pages) {
          if (pages.hasOwnProperty(id) && pages[id].imageinfo && pages[id].imageinfo[0]) list.push(pages[id].imageinfo[0].thumburl);
        }
        if (list.length) WEB_PHOTOS[k] = list;
      } catch (e) { /* keep the bundled photos */ }
    };
    x.send();
  }

  /** The photo number i for the time `d`: the link's list when there is one, else the ones for this time of day. */
  function photoAt(i, d) {
    var favs = Prefs.photos() === 'fav' ? Prefs.favs() : [];
    var list = favs.length ? favs : REMOTE_PHOTOS;
    if (!list) {
      var when = timeOfDay(d);
      list = WEB_PHOTOS[when].concat(PHOTOS[when]);
    }
    return list[i % list.length];
  }
  var photoOn = false, photoIndex = 0, photoSlot = 0, photoTimer = 0;

  /** Crossfades one photo layer into the other with `url`; returns the slot to show next time. */
  function fade(idA, idB, slot, url) {
    var a = $(idA), b = $(idB), show = slot ? b : a, hide = slot ? a : b;
    show.style.backgroundImage = 'url(' + url + ')';
    setClass(show, 'on', true);
    setClass(hide, 'on', false);
    return 1 - slot;
  }

  function showPhoto() {
    if (photoOn) return;
    photoOn = true;
    setClass(body, 'photo', true);
    checkNight();
    photoTurn();
    photoTimer = setInterval(photoTurn, 10 * 60000);
    setInterval(loadWebPhotos, 3600000);
  }

  function hidePhoto() {
    if (!photoOn) return;
    photoOn = false;
    clearInterval(photoTimer);
    setClass(body, 'photo', false);
    checkNight();
  }

  var currentPhoto = '';

  function photoTurn() {
    currentPhoto = photoAt(photoIndex++, cairoNow());
    photoSlot = fade('photoA', 'photoB', photoSlot, currentPhoto);
  }

  /** Adds the photo on screen to the favourites, or takes it out. */
  function toggleFavorite() {
    if (!currentPhoto) return;
    var favs = Prefs.favs().slice(), i = favs.indexOf(currentPhoto);
    if (i < 0) favs.push(currentPhoto); else favs.splice(i, 1);
    Prefs.set('favs', favs);
    toast(i < 0 ? tr('Added to favorites') : tr('Removed from favorites'));
  }

  /** The photos can be changed without reinstalling: backgrounds_url in config.properties is a JSON list of links. */
  function loadBackgrounds() {
    if (!CONFIG.backgroundsUrl) return;
    var x = new XMLHttpRequest();
    x.open('GET', CONFIG.backgroundsUrl + (CONFIG.backgroundsUrl.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), true);
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || x.status !== 200) return;
      try {
        var list = JSON.parse(x.responseText);
        if (list && list.length) { REMOTE_PHOTOS = list; photoIndex = 0; saverIndex = 0; }
      } catch (e) { /* keep the photos that came with the app */ }
    };
    x.send();
  }

  // MARK: - Screensaver: the photos, a big clock with the Hijri date, the weather, the next prayer and a hadith

  var saverOn = false, idleAt = Date.now(), saverTimer = 0, SAVER_AFTER = 5 * 60000;
  var saverSlot = 0, saverIndex = 0;

  function showSaver() {
    saverOn = true;
    setClass($('saver'), 'on', true);
    saverTurn();
    saverTimer = setInterval(saverTurn, 120000);
    renderSaver(cairoNow());
  }

  function saverTurn() {
    saverSlot = fade('sphotoA', 'sphotoB', saverSlot, photoAt(saverIndex++, cairoNow()));
  }

  var AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  function arDigits(text) {
    if (I18N.lang !== 'ar') return String(text);
    return String(text).replace(/[0-9]/g, function (c) { return AR_DIGITS[+c]; });
  }

  /** The screensaver, as the reference: weather and gold top left, the Hijri date top right, a big clock, the
      remembrance card, and along the bottom the next prayer and Ramadan. */
  var RADIO_DEFAULT = {name: 'إذاعة القرآن الكريم (القاهرة)', url: 'https://radio.xecod.com/station/quran-cairo'};
  var RADIOS = [RADIO_DEFAULT];
  var radio = new Audio(RADIO_DEFAULT.url);
  var radioRow = 0;

  /** The stations from the list on the web; the Cairo Quran station is always first. */
  function loadRadios() {
    var x = new XMLHttpRequest();
    x.open('GET', 'https://data-rosy.vercel.app/radio.json', true);
    x.onreadystatechange = function () {
      if (x.readyState !== 4 || x.status !== 200) return;
      try {
        var list = JSON.parse(x.responseText).radios || [], extra = [];
        for (var i = 0; i < list.length; i++) {
          if (list[i].url && list[i].url !== RADIO_DEFAULT.url) extra.push({name: list[i].name, url: list[i].url});
        }
        RADIOS = [RADIO_DEFAULT].concat(extra);
        var saved = Prefs.station(), at = 0;
        for (var j = 0; j < RADIOS.length; j++) if (RADIOS[j].url === saved) at = j;
        radioRow = at;
        if (at !== 0 || saved) setStation(at, false);
        renderRadio();
      } catch (e) { /* keep the Cairo station */ }
    };
    x.send();
  }

  /** Changes the station; plays it if the radio was playing (or always when `play` is true). */
  function setStation(i, play) {
    var was = !radio.paused;
    radio.src = RADIOS[i].url;
    Prefs.set('station', RADIOS[i].url);
    if (play || was) radio.play().catch(function (e) { radioError(e && e.name ? e.name : 'error'); });
    renderRadio();
  }

  function toggleRadio() {
    if (!radio.paused) { radio.pause(); renderRadio(); return; }
    try {
      var p = radio.play();
      if (p && p.catch) p.catch(function (e) { radioError(e && e.name ? e.name : 'error'); });
    } catch (e) { radioError('error'); }
    renderRadio();
  }

  /** AUTO: the radio starts with the app and starts again if the stream stops. */
  function toggleAuto() {
    Prefs.set('radio', Prefs.radio() === 'auto' ? 'manual' : 'auto');
    if (Prefs.radio() === 'auto' && radio.paused) radio.play().catch(function () {});
    renderRadio();
  }

  /** Shows why the radio didn't start, on the Quran radio line. */
  function radioError(why) {
    var box = $('islamic');
    if (!box) return;
    box.querySelector('.ik-radio .rp-t').textContent = tr('Quran radio could not start') + ' (' + why + ')';
  }

  radio.onerror = function () {
    radioError(radio.error ? 'code ' + radio.error.code : 'load');
    retryRadio();
  };
  radio.onended = retryRadio;

  function retryRadio() {
    if (Prefs.radio() !== 'auto') return;
    setTimeout(function () { radio.load(); radio.play().catch(function () {}); }, 10000);
  }

  function renderRadio() {
    var box = $('islamic');
    if (!box) return;
    var pill = box.querySelector('.ik-radio');
    var name = RADIOS[0] ? (RADIOS.filter(function (r) { return r.url === radio.src; })[0] || RADIOS[radioRow] || RADIO_DEFAULT).name : RADIO_DEFAULT.name;
    pill.querySelector('.rp-t').textContent = name + '  ·  ' + (radio.paused ? tr('Stopped') : tr('Playing'));
    setClass(pill, 'on', !radio.paused);
    setClass(pill.querySelector('.rp-auto'), 'on', Prefs.radio() === 'auto');
  }

  /** The station list, moved with the remote's up and down keys; OK picks one. */
  function openRadioList() {
    radioRow = Math.max(0, RADIOS.map(function (r) { return r.url; }).indexOf(radio.src));
    st.zone = Z.RADIO;
    renderRadioList();
    setClass($('radiolist'), 'open', true);
  }

  function closeRadioList() {
    st.zone = Z.TOP;
    st.top = -2;
    setClass($('radiolist'), 'open', false);
    updateFocus();
  }

  function renderRadioList() {
    var box = $('radiolist'), rows = box.querySelector('.rows');
    box.querySelector('.title').textContent = tr('Quran radio');
    rows.innerHTML = '';
    for (var i = 0; i < RADIOS.length; i++) {
      var row = el('div', 'row', rows, RADIOS[i].name);
      setClass(row, 'focus', i === radioRow);
    }
  }

  function radioKey(k) {
    if (k === TV.keys.up) radioRow = Math.max(0, radioRow - 1);
    else if (k === TV.keys.down) radioRow = Math.min(RADIOS.length - 1, radioRow + 1);
    else if (k === TV.keys.ok) { setStation(radioRow, true); closeRadioList(); return; }
    else if (k === TV.keys.back || k === 27) { closeRadioList(); return; }
    renderRadioList();
  }

  var AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

  function arDigits(text) {
    return String(text).replace(/[0-9]/g, function (c) { return AR_DIGITS[+c]; });
  }

  /** The screensaver, as the reference: weather and gold top left, the Hijri date top right, a big clock, the
      remembrance card, and along the bottom the next prayer and Ramadan. */
  var radio = new Audio('https://radio.xecod.com/station/quran-cairo');

  /** The Quran radio: the remote's play/pause keys start and stop it. */
  function toggleRadio() {
    if (!radio.paused) { radio.pause(); renderRadio(); return; }
    try {
      var p = radio.play();
      if (p && p.catch) p.catch(function (e) { radioError(e && e.name ? e.name : 'error'); });
    } catch (e) { radioError('error'); }
    renderRadio();
  }

  /** Shows why the radio didn't start, on the line under the hadith. */
  function radioError(why) {
    var box = $('islamic');
    if (!box) return;
    box.querySelector('.ik-radio .rp-t').textContent = tr('Quran radio could not start') + ' (' + why + ')';
  }

  radio.onerror = function () { radioError(radio.error ? 'code ' + radio.error.code : 'load'); };

  function radioPlay() { toggleRadio(); }

  function renderRadio() {
    var box = $('islamic');
    if (!box) return;
    var line = box.querySelector('.ik-radio');
    line.querySelector('.rp-t').textContent = radio.paused ? tr('Quran radio: press play on the remote') : tr('Quran radio: playing');
    setClass(line, 'on', !radio.paused);
  }

  function renderNetwork() {
    var n = $('netbadge'), b = $('btbadge');
    if (n) setClass(n, 'off', !navigator.onLine);
    if (b) setClass(b, 'off', false);
  }

  function renderSaver(d) {
    var s = $('saver'), t = d.getTime(), w = Data.weather, az = azkarOf(d), next = Data.nextPrayer(d);
    function set(sel, text) { s.querySelector(sel).textContent = text; }
    var h12 = d.getHours() % 12 || 12, mm = d.getMinutes();
    set('.sv-time', arDigits(h12 + ':' + (mm < 10 ? '0' : '') + mm));
    set('.sv-mer', d.getHours() < 12 ? tr('AM') : tr('PM'));
    set('.sv-tz', tr('Cairo time'));
    set('.sv-hijri', formatDate('format|EEEE', t) + '، ' + hijri(d));
    set('.sv-greg', arDigits(formatDate('format|EEEE, MMMM d', t) + ' ' + d.getFullYear()));
    var tb = s.querySelector('.sv-temp');
    tb.innerHTML = '';
    if (w) sym(Data.symbol(w.code, w.isDay), tb, 44);
    el('span', '', tb, w ? arDigits(Data.degrees(w.temp)) + '  ' + Data.condition(w.code, w.isDay) : '');
    set('.sv-sub', w ? Data.cityName() + '  ·  ' + arDigits(Data.degrees(w.max) + ' / ' + Data.degrees(w.min)) : '');
    set('.sv-gold', arDigits(goldText()));
    var pz = azkarPos(d);
    set('.sv-head', (isMorning(d) ? tr('Morning remembrance') : tr('Evening remembrance')) + '  ·  ' + trf('{i} of {n}', pz));
    drawDots(s.querySelector('.sv-dots'), pz);
    set('.sv-h', az.text);
    s.querySelector('.sv-h').style.fontSize = azkarSize(az.text, 30) + 'px';
    set('.sv-s', az.src);
    renderPrayerRow(d);
    var r = ramadanInfo(d);
    set('.sv-ram .t', r ? tr('Ramadan') + ' ' + arDigits(r.year) : '');
    set('.sv-ram .m', !r ? '' : r.during ? arDigits(trf('Ramadan, day {n}', {n: r.day})) : arDigits(trf('{n} days', {n: r.days})));
  }

  var prayerKey = '';

  /** The five prayers of the day with what's left until each (the ones passed count to tomorrow). */
  function renderPrayerRow(d) {
    var t = Data.timings(), box = $('saver').querySelector('.sv-prayers');
    if (!t) { box.innerHTML = ''; return; }
    var key = d.getHours() + ':' + d.getMinutes() + ':' + d.getDate();
    if (key === prayerKey) return;
    prayerKey = key;
    box.innerHTML = '';
    var now = d.getHours() * 60 + d.getMinutes(), order = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    var lefts = [], best = 0;
    for (var j = 0; j < order.length; j++) {
      var p = t[order[j]].split(':');
      lefts.push((parseInt(p[0], 10) * 60 + parseInt(p[1], 10) - now + 1440) % 1440);
      if (lefts[j] < lefts[best]) best = j;
    }
    for (var i = 0; i < order.length; i++) {
      var parts = t[order[i]].split(':'), left = lefts[i], col = el('div', 'sv-pcol' + (i === best ? ' next' : ''), box);
      el('div', 'pn', col, prayerName(order[i]));
      el('div', 'pt', col, arDigits(formatDate('format|h:mm a', new Date(d.getFullYear(), d.getMonth(), d.getDate(), parseInt(parts[0], 10), parseInt(parts[1], 10)).getTime())));
      el('div', 'pl', col, arDigits(trf('in {time}', {time: trf('{h}h {m}m', {h: Math.floor(left / 60), m: left % 60})})));
    }
  }

  var ramadanCache = {day: '', info: null};

  /** Ramadan from the Hijri calendar: the day of it, or how many days until it starts and when. Worked out once a day. */
  function ramadanInfo(d) {
    var key = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
    if (ramadanCache.day === key) return ramadanCache.info;
    var today = hijriOf(d), info = null;
    if (today && today.month === 9) info = {during: true, day: today.day, year: today.year};
    else if (today) {
      for (var i = 1; i < 400 && !info; i++) {
        var later = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i), h = hijriOf(later);
        if (h && h.month === 9 && h.day === 1) info = {during: false, days: i, start: later, year: h.year};
      }
    }
    ramadanCache = {day: key, info: info};
    return info;
  }

  /** Which remembrance is on now, counted from 1: {i} of {n}. */
  function azkarPos(d) {
    return {i: (Math.floor(d.getTime() / 180000) % AZKAR.length) + 1, n: AZKAR.length};
  }

  /** One dot per remembrance; the one on now is lit. */
  function drawDots(box, p) {
    if (!box) return;
    if (box.childNodes.length !== p.n) {
      box.innerHTML = '';
      for (var i = 0; i < p.n; i++) el('span', '', box);
    }
    for (var j = 0; j < p.n; j++) setClass(box.childNodes[j], 'on', j === p.i - 1);
  }

  /** The remembrance for the current three-minute slot (the same on the home screen and in the screensaver). */
  function azkarOf(d) {
    return AZKAR[Math.floor(d.getTime() / 180000) % AZKAR.length];
  }

  /** The font size that fits a remembrance of this length on its card: shorter ones larger, longer ones smaller. */
  function azkarSize(text, max) {
    var n = text.length;
    return n <= 120 ? max : n <= 200 ? Math.round(max * 0.85) : n <= 300 ? Math.round(max * 0.72) : Math.round(max * 0.62);
  }

  /** The home screen's remembrance card: the same one as the screensaver's, with its source. */
  function renderAzkar(d) {
    var box = $('azkar'), az = azkarOf(d);
    if (!box) return;
    var p = azkarPos(d);
    box.querySelector('.az-head').textContent = (isMorning(d) ? tr('Morning remembrance') : tr('Evening remembrance')) + '  ·  ' + trf('{i} of {n}', p);
    drawDots(box.querySelector('.az-dots'), p);
    box.querySelector('.az-text').textContent = az.text;
    box.querySelector('.az-text').style.fontSize = azkarSize(az.text, 26) + 'px';
    box.querySelector('.az-src').textContent = az.src;
  }

  /** The Hijri month and day of `d` (Umm al-Qura), or null where Intl doesn't know the calendar. */
  function hijriOf(d) {
    try {
      var p = {};
      new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {day: 'numeric', month: 'numeric', year: 'numeric'})
        .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      return {day: +p.day, month: +p.month, year: +p.year};
    } catch (e) { return null; }
  }

  /** "Ramadan in N days" before it, "Ramadan, day N" during it (N counted from the Hijri calendar). */
  function ramadanLine(d) {
    var today = hijriOf(d);
    if (!today) return '';
    if (today.month === 9) return trf('Ramadan, day {n}', {n: today.day});
    for (var i = 1; i < 400; i++) {
      var later = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      var h = hijriOf(later);
      if (h && h.month === 9 && h.day === 1) return trf('Ramadan in {n} days', {n: i});
    }
    return '';
  }

  function hideSaver() {
    saverOn = false;
    clearInterval(saverTimer);
    setClass($('saver'), 'on', false);
  }

  function poke() {
    idleAt = Date.now();
    if (saverOn) { hideSaver(); return true; }
    return false;
  }

  // MARK: - Keys

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (st.zone === Z.RADIO) { e.preventDefault(); radioKey(k); return; }
    if (k === 179 || k === 415 || k === 19 || k === 413) { e.preventDefault(); toggleRadio(); return; }
    // Arabic: the layout is mirrored, so the arrow that goes right on screen moves to the previous item.
    if (rtl() && (k === TV.keys.left || k === TV.keys.right)) k = k === TV.keys.left ? TV.keys.right : TV.keys.left;
    if (poke()) { e.preventDefault(); return; }   // the first press only wakes the screen
    if (k === TV.keys.left) move(-1, 0);
    else if (k === TV.keys.right) move(1, 0);
    else if (k === TV.keys.up) move(0, -1);
    else if (k === TV.keys.down) move(0, 1);
    else if (k === TV.keys.ok) activate();
    else if (k === TV.keys.back || k === 27 || k === 8) back();
    else return;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function () { poke(); });

  // MARK: - Start

  function renderAll() {
    renderTop();
    renderQuotes();
    cards = [];
    renderCards();
    renderShelf();
    renderDrawer();
    renderClock();
    checkNight();
    if (st.zone === Z.SETTINGS) renderSettings();
    updateFocus();
  }

  /** hide_apps in config.properties: left out of the shelf, All Apps and the picks, by id or name (part of it). */
  var HIDE = (CONFIG.hideApps || []).map(function (s) { return s.toLowerCase(); });
  function hidden(app) {
    var id = (app.id || '').toLowerCase(), title = (app.title || '').toLowerCase();
    for (var i = 0; i < HIDE.length; i++) if (id.indexOf(HIDE[i]) >= 0 || title.indexOf(HIDE[i]) >= 0) return true;
    return false;
  }

  function loadApps(done) {
    TV.apps(function (list) {
      apps = list.filter(function (a) { return !hidden(a); });
      Data.setApps(apps);
      pickShelf();
      TV.inputs(function (list2) {
        inputs = list2;
        if (done) done();
      });
    });
  }

  /** Back to the home screen (the app was opened again): the shelf, everything closed, the first tab. */
  function reset() {
    hideSaver();
    closeSheets();
    st.zone = Z.SHELF;
    st.shelf = 0;
    if (st.tab !== 0) { st.tab = 0; renderCards(); }
    updateFocus();
  }

  Data.onChange(function () {
    renderIslamic(new Date());
    renderQuotes();
    renderCards();
    renderPanels();
    checkNight();
  });

  function reopened() {
    // LG: with handlesRelaunch the app has to come to the front itself, or opening it again while it runs shows nothing.
    if (window.PalmSystem && window.PalmSystem.activate) window.PalmSystem.activate();
    reset();
    loadApps(function () { renderShelf(); renderDrawer(); Data.refresh(); });
  }

  window.addEventListener('resize', fit);
  document.addEventListener('webOSRelaunch', reopened);   // LG: opened again while running
  window.addEventListener('appcontrol', reopened);        // Samsung: the same
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hideSaver(); return; }
    idleAt = Date.now();
    loadApps(function () { renderShelf(); renderDrawer(); updateFocus(); Data.refresh(); });
  });

  // pointer (Magic Remote) clicks on the status badges and the radio line
  $('netbadge').onclick = function () { tvSettings(); };
  $('btbadge').onclick = function () { tvSettings(); };
  var rpl = $('islamic').querySelector('.ik-radio');
  rpl.querySelector('.rp-play').onclick = function () { toggleRadio(); };
  rpl.querySelector('.rp-t').onclick = function () { toggleRadio(); };
  rpl.querySelector('.rp-auto').onclick = function () { toggleAuto(); };
  rpl.querySelector('.rp-list').onclick = function () { openRadioList(); };
  I18N.set(Prefs.language());
  loadRadios();
  if (Prefs.radio() === 'auto') radio.play().catch(function () {});
  if (Prefs.location() >= 0) Data.setLocation(LOCATIONS[Prefs.location()]);
  // the screen first; the photos from the network after it's up
  setTimeout(function () { loadBackgrounds(); loadWebPhotos(); }, 15000);
  setInterval(loadBackgrounds, 600000);
  fit();
  renderTop();
  loadApps(function () {
    renderAll();
    Data.refresh();
  });
  setInterval(function () {
    renderClock();
    checkNight();
    Data.refresh();
    if (!saverOn && !sheetOpen() && Date.now() - idleAt > SAVER_AFTER) showSaver();
    if (saverOn) renderSaver(cairoNow());
  }, 30000);

  // For the browser preview and tests.
  window.FreeMyTV = {state: st, move: move, activate: activate, back: back, showSaver: showSaver, hideSaver: hideSaver, toast: toast};
})();
