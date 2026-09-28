/* ============================================================
   QIST / ScienceBridge — the network globe
   No dependencies. Canvas 2D, orthographic projection.

   Drawn as an instrument rather than a map of stickers: a graduated ring like the limb of
   an astrolabe, a faint graticule, land as fine points, members as saffron points with a
   leader line and a label. Routes run from the region to where members work abroad, and a
   short bright segment travels along each one.

   When the globe first comes into view the land and the members appear outward from the
   home cluster (Kazakhstan): the network is read as spreading from the region, which is
   what it is. The loop stops while the canvas is off screen.

   QistGlobe.mount(canvasEl, {
     people:   [{name,title,institution,city,country,lat,lng,geo_precision}],
     landDots: [lat*10, lng*10, lat*10, lng*10, ...],
     tooltip:  HTMLElement,
     hubs:     12,           // how many clusters may carry a label
     labels:   { count: n => '12 researchers', nocity: '…', unknown: '…' }
   }) -> { clusters, resize, highlight(fn|null) -> number of matching people }
   ============================================================ */
(function (global) {
  'use strict';

  var RAD = Math.PI / 180;
  var TAU = Math.PI * 2;
  var RING = 1.11;          // the graduated ring, as a multiple of R
  var ROUTE_LIFT = 0.14;    // apex of a route arc above the surface
  var TILT = 34 * RAD;      // north pole leans toward the viewer, so 48N sits near the centre
  var COS_T = Math.cos(TILT), SIN_T = Math.sin(TILT);
  var FONT = '"IBM Plex Sans", system-ui, sans-serif';

  /* Registan palette, as in style.css */
  var C = {
    oceanHi: 'rgba(40,74,170,0.55)',
    oceanMid: 'rgba(20,34,92,0.88)',
    oceanLo: 'rgba(8,14,40,0.96)',
    land: '232,236,248',        // plaster white
    grid: 'rgba(120,200,205,',  // turquoise
    ring: 'rgba(227,165,58,',   // saffron
    saffron: '#e3a53a',
    saffronRGB: '227,165,58',
    turq: '#1f9aa0',
    ink: '#e6ebf7',
    ink2: 'rgba(179,189,214,'
  };

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* The z term is negated so that east is to the right. The previous globe used +sin and
     drew the world mirrored: Japan west of Kazakhstan, the UK east of it. */
  function vec(latDeg, lngDeg) {
    var la = latDeg * RAD, ln = lngDeg * RAD, cl = Math.cos(la);
    return [cl * Math.cos(ln), Math.sin(la), -cl * Math.sin(ln)];
  }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  // rotate about Y, then tilt about X; z > 0 faces the viewer
  function orient(v, rot) {
    var cr = Math.cos(rot), sr = Math.sin(rot);
    var x = v[0] * cr - v[2] * sr;
    var z = v[0] * sr + v[2] * cr;
    var y = v[1];
    return [x, y * COS_T - z * SIN_T, y * SIN_T + z * COS_T];
  }

  function slerp(a, b, t) {
    var d = Math.max(-1, Math.min(1, dot3(a, b)));
    var om = Math.acos(d);
    if (om < 1e-6) return a.slice();
    var so = Math.sin(om), s0 = Math.sin((1 - t) * om) / so, s1 = Math.sin(t * om) / so;
    return [a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1];
  }

  /* ---------- cluster people onto shared coordinates ---------- */
  function cluster(people) {
    var map = Object.create(null);
    people.forEach(function (p) {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return;
      var key = p.lat.toFixed(1) + '|' + p.lng.toFixed(1);
      if (!map[key]) map[key] = { lat: p.lat, lng: p.lng, people: [] };
      map[key].people.push(p);
    });
    var out = Object.keys(map).map(function (k) {
      var c = map[k];
      c.count = c.people.length;
      c.lead = c.people[0];
      /* Records without a city sit on a country centroid (D-12). They are labelled with the
         country and drawn with a dashed ring, never as a point in a real city. */
      var precise = c.people.filter(function (x) {
        return (x.geo_precision || (x.city ? 'city' : 'country')) === 'city';
      }).length;
      c.vague = precise * 2 < c.people.length;
      c.place = c.vague ? (c.lead.country || '') : (c.lead.city || c.lead.country || '');
      c.v = vec(c.lat, c.lng);
      return c;
    });
    out.sort(function (a, b) { return b.count - a.count; });
    return out;
  }

  function mount(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var tipEl = opts.tooltip || null;
    var labels = opts.labels || {};
    var hubCount = opts.hubs || 12;
    var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var clusters = cluster(opts.people || []);
    var home = clusters[0] || { v: vec(48, 68) };
    clusters.forEach(function (c) { c.dist = Math.acos(Math.max(-1, Math.min(1, dot3(c.v, home.v)))); });
    var hubs = clusters.slice(0, hubCount);

    /* Highlight: a predicate over people, or null. Matching clusters stay lit and show how
       many matched; the rest fade. The home page drives it from the list of fields. */
    var hl = null;
    function highlight(fn) {
      hl = typeof fn === 'function' ? fn : null;
      var total = 0;
      clusters.forEach(function (c) { c.hits = hl ? c.people.filter(hl).length : c.count; total += c.hits; });
      return total;
    }
    highlight(null);

    /* Routes from the region to the largest clusters abroad. */
    var routes = clusters.slice(1).filter(function (c) { return c.dist > 0.35; }).slice(0, 10)
      .map(function (c, i) { return { b: c, phase: i * 0.37 % 1, speed: 0.10 + (i % 3) * 0.02 }; });

    /* Land points, and their angular distance from home for the reveal. */
    var flat = opts.landDots || [];
    var landCount = flat.length / 2;
    var land = new Float64Array(landCount * 3), landDist = new Float32Array(landCount);
    for (var i = 0; i < landCount; i++) {
      var v = vec(flat[i * 2] / 10, flat[i * 2 + 1] / 10);
      land[i * 3] = v[0]; land[i * 3 + 1] = v[1]; land[i * 3 + 2] = v[2];
      landDist[i] = Math.acos(Math.max(-1, Math.min(1, dot3(v, home.v))));
    }

    /* Graticule: meridians every 30 degrees, parallels at 30-degree steps. */
    var grid = [];
    for (var lng = -180; lng < 180; lng += 30) {
      var mer = [];
      for (var la = -80; la <= 80; la += 4) mer.push(vec(la, lng));
      grid.push(mer);
    }
    [-60, -30, 0, 30, 60].forEach(function (lat) {
      var par = [];
      for (var ln = -180; ln <= 180; ln += 4) par.push(vec(lat, ln));
      grid.push(par);
    });

    /* A few fixed stars around the globe: the section sits on the night of the hero photo. */
    var stars = [];
    for (var s = 0; s < 60; s++) {
      stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 0.9 + 0.3, a: Math.random() * 0.35 + 0.08, ph: Math.random() * TAU });
    }

    var W = 0, H = 0, cx = 0, cy = 0, R = 0, dpr = 1;
    function resize() {
      var rect = canvas.getBoundingClientRect();
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      W = Math.max(1, rect.width); H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2;
      R = (Math.min(W, H) / 2 - 10) / (RING + 0.05);
    }

    var rot = 2.757;                // Kazakhstan (48N 68E) faces the viewer
    var spin = 0.0011;
    var dragging = false, lastX = 0, velocity = 0, hovered = null;
    var hits = [];                  // hover targets, rebuilt each frame
    var reveal = reduced ? 1 : 0, revealStart = 0;
    var running = false, visible = true;

    function project(v, radius) {
      var o = orient(v, rot);
      return { x: cx + radius * o[0], y: cy - radius * o[1], z: o[2] };
    }
    /* z is taken from the point on the surface under the arc, not from the lifted point:
       otherwise a route going over the horizon pokes out of the limb as a stray line. */
    function arcPoint(a, b, f) {
      var p = slerp(a, b, f);
      var l = 1 + ROUTE_LIFT * Math.sin(Math.PI * f) * Math.min(1, Math.acos(Math.max(-1, Math.min(1, dot3(a, b)))) / 1.2);
      var o = orient([p[0] * l, p[1] * l, p[2] * l], rot);
      return { x: cx + R * o[0], y: cy - R * o[1], z: orient(p, rot)[2] - 0.08 };
    }
    function ease(t) { return 1 - Math.pow(1 - t, 3); }

    function drawRing(now) {
      var rr = R * RING;
      ctx.lineWidth = 1;
      ctx.strokeStyle = C.ring + '0.22)';
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
      ctx.strokeStyle = C.ring + '0.10)';
      ctx.beginPath(); ctx.arc(cx, cy, rr + 7, 0, TAU); ctx.stroke();
      // graduation: every 5 degrees, longer every 30, turning with the globe
      var off = -rot;
      for (var d = 0; d < 72; d++) {
        var ang = off + d * 5 * RAD;
        var major = d % 6 === 0;
        var r0 = rr, r1 = rr + (major ? 7 : 3.5);
        ctx.strokeStyle = C.ring + (major ? '0.55)' : '0.28)');
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.stroke();
      }
      // an alidade: one fine index line across the instrument, pointing at home
      var hp = project(home.v, R);
      if (hp.z > 0) {
        var ang2 = Math.atan2(hp.y - cy, hp.x - cx);
        ctx.strokeStyle = C.ring + '0.35)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(hp.x, hp.y);
        ctx.lineTo(cx + Math.cos(ang2) * (rr + 12), cy + Math.sin(ang2) * (rr + 12));
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    function drawGrid() {
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = C.grid + '0.13)';
      for (var g = 0; g < grid.length; g++) {
        var line = grid[g], started = false;
        ctx.beginPath();
        for (var k = 0; k < line.length; k++) {
          var o = orient(line[k], rot);
          if (o[2] < 0) { started = false; continue; }
          var x = cx + R * o[0], y = cy - R * o[1];
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    function drawRoute(rt, t) {
      var a = home.v, b = rt.b.v;
      var dim = hl && !rt.b.hits;
      // the route itself, faint
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(' + C.saffronRGB + ',' + (dim ? 0.04 : 0.16) + ')';
      ctx.beginPath();
      var started = false;
      for (var k = 0; k <= 40; k++) {
        var p = arcPoint(a, b, k / 40);
        if (p.z < -0.02) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      if (dim || reduced) return;
      // a bright segment with a fading tail travels outward, pauses, and goes again
      var cyc = (t * rt.speed + rt.phase) % 1.35;
      if (cyc > 1.1) return;
      var head = Math.min(1, cyc), tail = Math.max(0, cyc - 0.28);
      var steps = 14;
      for (var q = 0; q < steps; q++) {
        var f0 = tail + (head - tail) * (q / steps), f1 = tail + (head - tail) * ((q + 1) / steps);
        var p0 = arcPoint(a, b, f0), p1 = arcPoint(a, b, f1);
        if (p0.z < -0.02 || p1.z < -0.02) continue;
        var k2 = (q + 1) / steps;
        ctx.strokeStyle = 'rgba(' + C.saffronRGB + ',' + (0.85 * k2 * k2).toFixed(3) + ')';
        ctx.lineWidth = 0.6 + 1.4 * k2;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      }
      if (cyc <= 1) {
        var hd = arcPoint(a, b, head);
        if (hd.z > -0.02) {
          ctx.fillStyle = '#fff4dc';
          ctx.beginPath(); ctx.arc(hd.x, hd.y, 1.8, 0, TAU); ctx.fill();
        }
      }
    }

    function frame(now) {
      if (!visible) { running = false; return; }
      running = true;
      if (!revealStart) revealStart = now;
      if (!reduced) reveal = Math.min(1, (now - revealStart) / 2400);
      // angular radius already revealed; the visible side is covered by ~1.9 rad
      var rv = reveal < 1 ? ease(reveal) * 1.9 : Math.PI;

      if (!dragging) {
        if (Math.abs(velocity) > 0.00002) { rot += velocity; velocity *= 0.95; }
        else if (!reduced) rot += spin;
      }
      var t = now / 1000;

      ctx.clearRect(0, 0, W, H);

      /* stars, outside the sphere */
      for (var s2 = 0; s2 < stars.length; s2++) {
        var st = stars[s2];
        var tw = reduced ? 1 : 0.65 + 0.35 * Math.sin(t * 0.8 + st.ph);
        ctx.fillStyle = 'rgba(230,235,247,' + (st.a * tw).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(st.x * W, st.y * H, st.r, 0, TAU); ctx.fill();
      }

      /* glow */
      var halo = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.16);
      halo.addColorStop(0, 'rgba(31,154,160,0.14)');
      halo.addColorStop(1, 'rgba(31,154,160,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.16, 0, TAU); ctx.fill();

      drawRing(now);

      /* far side, seen through */
      ctx.fillStyle = 'rgba(' + C.land + ',0.06)';
      for (var k = 0; k < landCount; k++) {
        if (landDist[k] > rv) continue;
        var o = orient([land[k * 3], land[k * 3 + 1], land[k * 3 + 2]], rot);
        if (o[2] >= 0) continue;
        ctx.fillRect(cx + R * o[0] - 0.5, cy - R * o[1] - 0.5, 1, 1);
      }

      /* the sphere, lit from the upper left */
      var body = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.04, cx, cy, R);
      body.addColorStop(0, C.oceanHi);
      body.addColorStop(0.6, C.oceanMid);
      body.addColorStop(1, C.oceanLo);
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

      drawGrid();

      /* near-side land: fine points, brighter toward the viewer; the reveal edge glows */
      for (var m = 0; m < landCount; m++) {
        var dd = landDist[m];
        if (dd > rv) continue;
        var p = orient([land[m * 3], land[m * 3 + 1], land[m * 3 + 2]], rot);
        if (p[2] <= 0) continue;
        var edge = reveal < 1 ? Math.max(0, 1 - (rv - dd) / 0.25) : 0;
        var a = 0.14 + 0.46 * p[2] + 0.5 * edge;
        var sz = 0.8 + 0.9 * p[2];
        ctx.fillStyle = edge > 0.05 ? 'rgba(' + C.saffronRGB + ',' + Math.min(1, a).toFixed(3) + ')'
                                    : 'rgba(' + C.land + ',' + a.toFixed(3) + ')';
        ctx.fillRect(cx + R * p[0] - sz / 2, cy - R * p[1] - sz / 2, sz, sz);
      }

      /* rim */
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(120,200,205,0.35)';
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

      /* routes, once the reveal has reached their far end */
      ctx.lineCap = 'round';
      for (var r2 = 0; r2 < routes.length; r2++) {
        if (routes[r2].b.dist <= rv) drawRoute(routes[r2], t);
      }

      /* every cluster as a point; hubs get a label below */
      hits.length = 0;
      var labelled = [];
      for (var c2 = clusters.length - 1; c2 >= 0; c2--) {
        var cl = clusters[c2];
        if (cl.dist > rv) continue;
        var sp = project(cl.v, R);
        if (sp.z <= 0.03) continue;
        var dim = hl && !cl.hits;
        var n = hl ? cl.hits : cl.count;
        var pr = dim ? 1.2 : Math.min(6, 1.6 + Math.sqrt(n) * 0.55) * (0.75 + 0.25 * sp.z);
        ctx.globalAlpha = dim ? 0.25 : Math.min(1, 0.45 + sp.z);
        ctx.fillStyle = dim ? 'rgba(' + C.land + ',0.5)' : C.saffron;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, pr, 0, TAU); ctx.fill();
        if (cl.vague && !dim) {            // country-level precision: dashed ring
          ctx.strokeStyle = 'rgba(' + C.saffronRGB + ',0.7)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2.5]);
          ctx.beginPath(); ctx.arc(sp.x, sp.y, pr + 3.5, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.globalAlpha = 1;
        hits.push({ c: cl, x: sp.x, y: sp.y, r: Math.max(8, pr + 4) });
        if (!dim && c2 < hubCount && sp.z > 0.2) labelled.push({ c: cl, sp: sp, n: n });
      }

      /* the home cluster breathes */
      var hp = project(home.v, R);
      if (hp.z > 0.03 && !reduced && (!hl || home.hits)) {
        var ph = (t * 0.45) % 1;
        ctx.strokeStyle = 'rgba(' + C.saffronRGB + ',' + (0.6 * (1 - ph)).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(hp.x, hp.y, 6 + ph * 18, 0, TAU); ctx.stroke();
      }

      /* labels: leader line up and out, place name and count; the largest win space */
      labelled.sort(function (a, b) { return b.n - a.n; });
      var boxes = [];
      var fs = Math.max(10, Math.min(12, W * 0.026));
      ctx.font = '500 ' + fs + 'px ' + FONT;
      ctx.textBaseline = 'middle';
      var maxLabels = W < 380 ? 5 : 8;
      for (var li = 0; li < labelled.length && boxes.length < maxLabels; li++) {
        var L = labelled[li];
        var name = L.c.place || '';
        var num = String(L.n);
        ctx.font = '500 ' + fs + 'px ' + FONT;
        var wName = ctx.measureText(name).width;
        ctx.font = '600 ' + fs + 'px ' + FONT;
        var wNum = ctx.measureText(num).width;
        var w = wName + wNum + 6, h = fs + 6;
        var right = L.sp.x < cx + R * 0.35;
        var lx = right ? L.sp.x + 14 : L.sp.x - 14 - w, ly = L.sp.y - 16;
        if (lx < 2) lx = 2; if (lx + w > W - 2) lx = W - 2 - w;
        var box = { x: lx - 3, y: ly - h / 2, w: w + 6, h: h };
        var clash = boxes.some(function (b) {
          return box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y;
        });
        if (clash) continue;
        boxes.push(box);
        var al = Math.min(1, (L.sp.z - 0.2) * 3);
        ctx.globalAlpha = al;
        ctx.strokeStyle = 'rgba(230,235,247,0.35)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(L.sp.x, L.sp.y);
        ctx.lineTo(right ? lx - 3 : lx + w + 3, ly);
        ctx.stroke();
        ctx.textAlign = 'left';
        // a dark halo behind the text keeps it legible over land points
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(10,17,44,0.85)';
        ctx.font = '500 ' + fs + 'px ' + FONT;
        ctx.strokeText(name, lx, ly);
        ctx.fillStyle = hovered === L.c ? '#fff' : C.ink;
        ctx.fillText(name, lx, ly);
        ctx.font = '600 ' + fs + 'px ' + FONT;
        ctx.strokeText(num, lx + wName + 6, ly);
        ctx.fillStyle = C.saffron;
        ctx.fillText(num, lx + wName + 6, ly);
        ctx.globalAlpha = 1;
      }

      requestAnimationFrame(frame);
    }

    function start() { if (!running && visible) requestAnimationFrame(frame); }

    /* ---------- interaction ---------- */
    function onDown(e) {
      dragging = true; velocity = 0;
      lastX = (e.touches ? e.touches[0].clientX : e.clientX);
      canvas.style.cursor = 'grabbing';
    }
    function onMove(e) {
      var x = (e.touches ? e.touches[0].clientX : e.clientX);
      if (dragging) {
        var dx = x - lastX; lastX = x;
        rot += dx * 0.005; velocity = dx * 0.005;
        return;
      }
      if (!tipEl || e.touches) return;
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (mx < 0 || my < 0 || mx > rect.width || my > rect.height) return;
      var found = null, best = Infinity;
      for (var i2 = 0; i2 < hits.length; i2++) {
        var p = hits[i2], d2 = (mx - p.x) * (mx - p.x) + (my - p.y) * (my - p.y);
        if (d2 < p.r * p.r && d2 < best) { best = d2; found = p; }
      }
      hovered = found ? found.c : null;
      canvas.style.cursor = found ? 'pointer' : 'grab';
      if (found) {
        var c = found.c;
        var n = hl ? c.hits : c.count;
        var names = c.people.slice(0, 3).map(function (p) { return p.name; }).join(' · ');
        tipEl.innerHTML =
          '<strong>' + escapeHtml(c.place || labels.unknown || '') + '</strong>' +
          '<span>' + escapeHtml(labels.count ? labels.count(n) : String(n)) +
            (c.vague && labels.nocity ? ' · ' + escapeHtml(labels.nocity) : '') + '</span>' +
          '<span class="names">' + escapeHtml(names) + (c.count > 3 ? ' …' : '') + '</span>';
        tipEl.style.left = Math.round(found.x) + 'px';
        tipEl.style.top = Math.round(found.y - 14) + 'px';
        tipEl.classList.add('on');
      } else {
        tipEl.classList.remove('on');
      }
    }
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
    }
    function onUp() { dragging = false; canvas.style.cursor = 'grab'; }

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('touchstart', onDown, { passive: true });
    global.addEventListener('mousemove', onMove);
    canvas.addEventListener('touchmove', onMove, { passive: true });
    global.addEventListener('mouseup', onUp);
    global.addEventListener('touchend', onUp);
    canvas.addEventListener('mouseleave', function () {
      hovered = null; if (tipEl) tipEl.classList.remove('on');
    });

    canvas.style.cursor = 'grab';
    resize();
    if (global.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    else global.addEventListener('resize', resize);

    /* Run only while on screen; the reveal starts the first time the globe is seen. */
    if (global.IntersectionObserver) {
      visible = false;
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        start();
      }, { threshold: 0.15 }).observe(canvas);
    } else {
      start();
    }

    return { clusters: clusters, resize: resize, highlight: highlight };
  }

  global.QistGlobe = { mount: mount, cluster: cluster, initials: initials };
})(window);
