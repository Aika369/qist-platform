/* ============================================================
   QIST / ScienceBridge — rotating dot globe
   No dependencies. Canvas 2D, orthographic projection.

   QistGlobe.mount(canvasEl, {
     people:   [{name,title,institution,city,country,lat,lng,featured}],
     landDots: [lat*10, lng*10, lat*10, lng*10, ...],
     tooltip:  HTMLElement,
     hubs:     12          // how many clusters get an initials badge
   })
   ============================================================ */
(function (global) {
  'use strict';

  var RAD = Math.PI / 180;
  // Every drawn element sits at some multiple of R. The canvas has to contain
  // the largest of them, or the glow and the arcs get sliced off at the edges.
  var HALO_OUT  = 1.18;   // outer edge of the atmosphere glow
  var BADGE_LIFT = 1.14;  // how far the initials circles float above the surface
  var ARC_LIFT  = 0.16;   // apex of a hub arc, i.e. R * (1 + ARC_LIFT)
  var TILT = 20 * RAD;            // north pole leans toward the viewer
  var COS_T = Math.cos(TILT), SIN_T = Math.sin(TILT);

  var COLORS = {
    ocean0:   '#16324f',
    ocean1:   '#0b1a2c',
    rim:      'rgba(120,180,255,',
    landNear: '90,165,255',
    landFar:  '70,120,190',
    mesh:     'rgba(105,170,255,',
    arc:      'rgba(196,158,74,',
    pulse:    '#f4e9d2',
    ring:     '#b58a2e',
    badge:    '#ffffff',
    badgeInk: '#16263d'
  };

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function vec(latDeg, lngDeg) {
    var la = latDeg * RAD, ln = lngDeg * RAD, cl = Math.cos(la);
    return [cl * Math.cos(ln), Math.sin(la), cl * Math.sin(ln)];
  }

  // rotate about Y, then tilt about X. returns [x, y, z] with z>0 facing viewer
  function orient(v, rot) {
    var cr = Math.cos(rot), sr = Math.sin(rot);
    var x = v[0] * cr - v[2] * sr;
    var z = v[0] * sr + v[2] * cr;
    var y = v[1];
    return [x, y * COS_T - z * SIN_T, y * SIN_T + z * COS_T];
  }

  function slerp(a, b, t) {
    var dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    dot = Math.max(-1, Math.min(1, dot));
    var om = Math.acos(dot);
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
      c.people.sort(function (a, b) {
        return (b.featured || 0) - (a.featured || 0) ||
               String(b.title || '').length - String(a.title || '').length;
      });
      c.count = c.people.length;
      c.lead = c.people[0];
      c.initials = initials(c.lead.name);
      c.place = c.lead.city || c.lead.country || '';
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
    var hubCount = opts.hubs || 12;

    var clusters = cluster(opts.people || []);
    var hubs = clusters.slice(0, hubCount);
    var rest = clusters.slice(hubCount);

    // home node: the largest cluster (Astana) — every arc runs back to it
    var home = clusters[0];
    var arcs = hubs.slice(1, 11).map(function (c, i) {
      return { a: home.v, b: c.v, phase: i / 10 };
    });

    // land dots, decoded from the flat tenth-of-a-degree array
    var flat = opts.landDots || [];
    var land = new Float64Array(flat.length / 2 * 3);
    for (var i = 0, j = 0; i < flat.length; i += 2, j += 3) {
      var v = vec(flat[i] / 10, flat[i + 1] / 10);
      land[j] = v[0]; land[j + 1] = v[1]; land[j + 2] = v[2];
    }
    var landCount = flat.length / 2;

    // a faint mesh of short great-circle hops between random land dots
    var mesh = [];
    (function buildMesh() {
      var tries = 0;
      while (mesh.length < 46 && tries < 4000) {
        tries++;
        var a = (Math.random() * landCount) | 0, b = (Math.random() * landCount) | 0;
        var av = [land[a * 3], land[a * 3 + 1], land[a * 3 + 2]];
        var bv = [land[b * 3], land[b * 3 + 1], land[b * 3 + 2]];
        var d = av[0] * bv[0] + av[1] * bv[1] + av[2] * bv[2];
        if (d < 0.55 || d > 0.93) continue;   // only medium-length hops
        mesh.push({ a: av, b: bv });
      }
    })();

    var W = 0, H = 0, cx = 0, cy = 0, R = 0, dpr = 1, badgeBase = 17;
    function resize() {
      var rect = canvas.getBoundingClientRect();
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      W = Math.max(1, rect.width); H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2;
      badgeBase = Math.max(11, Math.min(19, W * 0.042));
      // reserve room for the glow, and for a badge at full depth plus its ring
      var halfMin = Math.min(W, H) / 2;
      var badgeMargin = badgeBase * 1.10 + 7;
      R = Math.min((halfMin - 3) / HALO_OUT, (halfMin - badgeMargin) / BADGE_LIFT);
    }

    var rot = 0.325;                // (90° - 71.4°) in radians: Astana faces the viewer
    var spin = 0.0016;
    var dragging = false, lastX = 0, velocity = 0, hovered = null;
    var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var screenPts = [];             // hub screen positions, rebuilt each frame

    function project(v, radius) {
      var o = orient(v, rot);
      return { x: cx + radius * o[0], y: cy - radius * o[1], z: o[2] };
    }

    function drawArc(a, b, lift, width, colorFn, samples) {
      samples = samples || 40;
      var started = false;
      ctx.beginPath();
      for (var t = 0; t <= samples; t++) {
        var f = t / samples;
        var p = slerp(a, b, f);
        var n = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
        var l = 1 + lift * Math.sin(Math.PI * f);
        var o = orient([p[0] / n * l, p[1] / n * l, p[2] / n * l], rot);
        if (o[2] < -0.05) { started = false; continue; }
        var sx = cx + R * o[0], sy = cy - R * o[1];
        if (!started) { ctx.moveTo(sx, sy); started = true; } else { ctx.lineTo(sx, sy); }
      }
      ctx.strokeStyle = colorFn;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    function pointOnArc(a, b, f, lift) {
      var p = slerp(a, b, f);
      var n = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
      var l = 1 + lift * Math.sin(Math.PI * f);
      var o = orient([p[0] / n * l, p[1] / n * l, p[2] / n * l], rot);
      return { x: cx + R * o[0], y: cy - R * o[1], z: o[2] };
    }

    function frame(now) {
      if (!dragging) {
        if (Math.abs(velocity) > 0.00002) { rot += velocity; velocity *= 0.95; }
        else if (!reduced) rot += spin;
      }

      ctx.clearRect(0, 0, W, H);

      /* atmosphere */
      var halo = ctx.createRadialGradient(cx, cy, R * 0.90, cx, cy, R * HALO_OUT);
      halo.addColorStop(0, 'rgba(70,140,230,0.22)');
      halo.addColorStop(0.55, 'rgba(70,140,230,0.09)');
      halo.addColorStop(1, 'rgba(70,140,230,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, R * HALO_OUT, 0, 6.2832); ctx.fill();

      /* far-side dots, seen through the globe */
      ctx.fillStyle = 'rgba(' + COLORS.landFar + ',0.13)';
      for (var k = 0; k < landCount; k++) {
        var o = orient([land[k * 3], land[k * 3 + 1], land[k * 3 + 2]], rot);
        if (o[2] >= 0) continue;
        ctx.fillRect(cx + R * o[0] - 0.7, cy - R * o[1] - 0.7, 1.4, 1.4);
      }

      /* the sphere itself — translucent, lit from upper left */
      var body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R);
      body.addColorStop(0, 'rgba(30,68,110,0.78)');
      body.addColorStop(0.62, 'rgba(14,36,62,0.86)');
      body.addColorStop(1, 'rgba(7,18,33,0.93)');
      ctx.fillStyle = body;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.fill();

      /* rim light */
      ctx.strokeStyle = COLORS.rim + '0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.stroke();

      /* near-side land dots */
      for (var m = 0; m < landCount; m++) {
        var p = orient([land[m * 3], land[m * 3 + 1], land[m * 3 + 2]], rot);
        if (p[2] <= 0) continue;
        var a = 0.22 + 0.62 * p[2];
        var s = 0.9 + 1.0 * p[2];
        ctx.fillStyle = 'rgba(' + COLORS.landNear + ',' + a.toFixed(3) + ')';
        ctx.fillRect(cx + R * p[0] - s / 2, cy - R * p[1] - s / 2, s, s);
      }

      /* faint network mesh */
      ctx.lineCap = 'round';
      for (var q = 0; q < mesh.length; q++) {
        drawArc(mesh[q].a, mesh[q].b, 0.035, 0.6, COLORS.mesh + '0.16)', 14);
      }

      /* hub arcs back to the home node, each with a travelling pulse */
      var t = now / 1000;
      for (var r2 = 0; r2 < arcs.length; r2++) {
        var arc = arcs[r2];
        drawArc(arc.a, arc.b, ARC_LIFT, 1.1, COLORS.arc + '0.34)', 44);
        var f = ((t * 0.16) + arc.phase) % 1;
        var pp = pointOnArc(arc.a, arc.b, f, ARC_LIFT);
        if (pp.z > -0.05) {
          ctx.fillStyle = COLORS.pulse;
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Math.PI * f);
          ctx.beginPath(); ctx.arc(pp.x, pp.y, 2.1, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      /* smaller clusters as glowing nodes */
      for (var s2 = 0; s2 < rest.length; s2++) {
        var np = project(rest[s2].v, R * 1.005);
        if (np.z <= 0.02) continue;
        ctx.fillStyle = 'rgba(244,233,210,' + (0.25 + 0.5 * np.z).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(np.x, np.y, 1.9 + np.z, 0, 6.2832); ctx.fill();
      }

      /* hub badges — initials in a circle, floating above the surface */
      screenPts.length = 0;
      var cand = [];
      for (var h = 0; h < hubs.length; h++) {
        var c = hubs[h];
        var badge = project(c.v, R * BADGE_LIFT);
        if (badge.z <= 0.06) continue;
        cand.push({
          c: c,
          anchor: project(c.v, R),
          badge: badge,
          rad: badgeBase * (0.72 + 0.38 * badge.z)
        });
      }
      // biggest clusters win a badge; the ones they would sit on top of fall
      // back to a plain node, so Europe stops turning into a pile of circles
      cand.sort(function (a, b) { return b.c.count - a.c.count; });
      // fewer badges on a small canvas, or they swamp the globe
      var maxBadges = W < 380 ? 6 : (W < 480 ? 9 : 12);
      var drawn = [], crowded = [];
      for (var ci = 0; ci < cand.length; ci++) {
        var it2 = cand[ci], clear = drawn.length < maxBadges;
        for (var pj = 0; pj < drawn.length; pj++) {
          var o2 = drawn[pj];
          var dx2 = it2.badge.x - o2.badge.x, dy2 = it2.badge.y - o2.badge.y;
          var need = (it2.rad + o2.rad) * 0.95;
          if (dx2 * dx2 + dy2 * dy2 < need * need) { clear = false; break; }
        }
        (clear ? drawn : crowded).push(it2);
      }
      for (var cr = 0; cr < crowded.length; cr++) {
        var cp = crowded[cr].badge;
        ctx.fillStyle = 'rgba(244,233,210,' + (0.3 + 0.45 * cp.z).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(cp.x, cp.y, 2.2 + cp.z, 0, 6.2832); ctx.fill();
      }
      drawn.sort(function (a, b) { return a.badge.z - b.badge.z; });

      for (var d = 0; d < drawn.length; d++) {
        var it = drawn[d], b2 = it.badge, an = it.anchor, cl = it.c;
        var depth = it.badge.z;
        var rad = it.rad;
        var alpha = Math.min(1, 0.58 + depth * 0.85);

        ctx.globalAlpha = alpha;
        // tether to the surface
        ctx.strokeStyle = 'rgba(244,233,210,0.38)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(an.x, an.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
        ctx.fillStyle = 'rgba(244,233,210,0.85)';
        ctx.beginPath(); ctx.arc(an.x, an.y, 2.2, 0, 6.2832); ctx.fill();

        // badge
        ctx.shadowColor = 'rgba(3,10,20,0.55)';
        ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
        ctx.fillStyle = COLORS.badge;
        ctx.beginPath(); ctx.arc(b2.x, b2.y, rad, 0, 6.2832); ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

        ctx.strokeStyle = hovered === cl ? '#f4e9d2' : COLORS.ring;
        ctx.lineWidth = hovered === cl ? 3 : 2;
        ctx.beginPath(); ctx.arc(b2.x, b2.y, rad, 0, 6.2832); ctx.stroke();

        ctx.fillStyle = COLORS.badgeInk;
        ctx.font = '700 ' + Math.round(rad * 0.82) + 'px "Source Serif 4", Georgia, serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(cl.initials, b2.x, b2.y + rad * 0.03);

        // "+N more here" counter
        if (cl.count > 1 && rad > 10) {
          var bx = b2.x + rad * 0.78, by = b2.y - rad * 0.78;
          var label = '+' + (cl.count - 1);
          ctx.font = '700 ' + Math.round(rad * 0.5) + 'px "Inter", system-ui, sans-serif';
          var pw = ctx.measureText(label).width + rad * 0.42;
          ctx.fillStyle = COLORS.ring;
          ctx.beginPath();
          if (ctx.roundRect) { ctx.roundRect(bx - pw / 2, by - rad * 0.34, pw, rad * 0.68, rad * 0.34); }
          else { ctx.arc(bx, by, rad * 0.36, 0, 6.2832); }
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.fillText(label, bx, by + rad * 0.02);
        }
        ctx.globalAlpha = 1;
        screenPts.push({ c: cl, x: b2.x, y: b2.y, r: rad });
      }

      requestAnimationFrame(frame);
    }

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
      var found = null;
      for (var i2 = screenPts.length - 1; i2 >= 0; i2--) {
        var p = screenPts[i2];
        if ((mx - p.x) * (mx - p.x) + (my - p.y) * (my - p.y) < (p.r + 4) * (p.r + 4)) { found = p; break; }
      }
      hovered = found ? found.c : null;
      canvas.style.cursor = found ? 'pointer' : 'grab';
      if (found) {
        var c = found.c;
        var names = c.people.slice(0, 3).map(function (p) { return p.name; }).join(' &middot; ');
        tipEl.innerHTML =
          '<strong>' + (c.place || 'Unknown location') + '</strong>' +
          '<span>' + c.count + (c.count === 1 ? ' researcher' : ' researchers') + '</span>' +
          '<span class="names">' + names + (c.count > 3 ? ' &hellip;' : '') + '</span>';
        tipEl.style.left = Math.round(found.x) + 'px';
        tipEl.style.top = Math.round(found.y - found.r - 10) + 'px';
        tipEl.classList.add('on');
      } else {
        tipEl.classList.remove('on');
      }
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
    requestAnimationFrame(frame);

    return { clusters: clusters, resize: resize };
  }

  global.QistGlobe = { mount: mount, cluster: cluster, initials: initials };
})(window);
