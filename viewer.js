/* 펫나라 — 보기 전용. QR 주소의 #k=열쇠로 반 데이터를 풀어서 펫들이 돌아다니는 모습을 보여 줌.
   입력·로그인·기록 수집 없음. 열쇠는 '#' 뒤에 있어 서버로 전송되지 않음. */
"use strict";
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const el = (tag, css, cls) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (cls) e.className = cls; return e; };
  const Q = new URLSearchParams(location.search);
  const LOCAL = Q.get("local"); // 교실 화면에서 열 때: 이 컴퓨터의 클래스펫츠 서버에서 바로 읽음
  const asset = (ref) => {
    if (!ref || ref.indexOf(":") < 0) return "";
    const i = ref.indexOf(":"), src = ref.slice(0, i), parts = ref.slice(i + 1).split("/").map(encodeURIComponent);
    if (LOCAL) return src === "builtin" ? "/assets/builtin/" + parts.join("/") : "/assets/user/" + parts.join("/");
    return (src === "builtin" ? "a/b/" : "a/u/") + parts.join("/");
  };
  const msg = (t) => { const m = $("#msg"); m.textContent = t; m.hidden = !t; };

  /* ---------------------------------------------------------- 열쇠로 풀기 (HMAC-SHA256 카운터 + 확인값) */
  const enc = new TextEncoder();
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const b64url = (s) => b64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  async function hkey(raw) { return crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); }
  async function hm(key, data) { return new Uint8Array(await crypto.subtle.sign("HMAC", key, data)); }
  const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
  async function decrypt(box, keyRaw) {
    const root = await hkey(keyRaw);
    const encKey = await hkey(await hm(root, enc.encode("classpet-enc")));
    const macKey = await hkey(await hm(root, enc.encode("classpet-mac")));
    const n = b64(box.n), c = b64(box.c), t = b64(box.t);
    const want = await hm(macKey, cat(n, c));
    if (want.length !== t.length || want.some((v, i) => v !== t[i])) throw new Error("key");
    const blocks = await Promise.all(Array.from({ length: Math.ceil(c.length / 32) }, (_, i) => {
      const ctr = new Uint8Array(4); new DataView(ctr.buffer).setUint32(0, i); return hm(encKey, cat(n, ctr));
    }));
    const out = new Uint8Array(c.length);
    for (let i = 0; i < c.length; i++) out[i] = c[i] ^ blocks[i >> 5][i & 31];
    return JSON.parse(new TextDecoder().decode(out));
  }

  /* ---------------------------------------------------------- 펫 그림 (클래스펫츠 앱과 같은 규칙) */
  let D = null, K = 2;
  const pets = [];
  const stageFit = (st) => Object.assign({ x: 32, ground: 61, height: 40 }, (D.stages[st] || {}).fit || {});
  function anchor(p, slot) { return (p.anchors && p.anchors[slot]) || ((D.stages[p.stage] || {}).anchors || {})[slot]; }
  function buildBox(p, k) {
    const sf = stageFit(p.stage), ch = p.char;
    const box = el("div", `left:${-sf.x * k}px;top:${-sf.ground * k}px;width:${64 * k}px;height:${64 * k}px`, "box");
    let sprite = null, cpx = 0;
    if (ch && typeof ch === "object" && ch.fit && ch.w) {
      const sc = sf.height / ch.fit.body_h, fw = ch.w * sc * k, fh = ch.h * sc * k;
      const pos = `left:${(sf.x - ch.fit.pivot_x * sc) * k}px;top:${(sf.ground - ch.fit.foot_y * sc) * k}px;width:${fw}px;height:${fh}px`;
      if (ch.actions && ch.actions.idle) {
        sprite = el("div", pos, "sprite"); sprite.dataset.fw = fw; sprite.dataset.fh = fh; cpx = sc * k; box.appendChild(sprite);
      } else { const im = el("img", pos); im.src = asset(ch.image); im.alt = ""; box.appendChild(im); }
    } else { const im = el("img", "", "full"); im.src = asset(typeof ch === "string" ? ch : ""); im.alt = ""; box.appendChild(im); }
    const decos = [];
    const dpr = window.devicePixelRatio || 1;
    for (const slot of ["neck", "head"]) {
      const iid = (p.eq || {})[slot], it = iid && D.items[iid], a = anchor(p, slot);
      if (!it || !a) continue;
      const off = (it.stage_offsets && it.stage_offsets[p.stage]) || it.offset || { dx: 0, dy: 0, scale: 1 };
      const s = (a.scale || 1) * (off.scale || 1);
      let w = (it.w || 32) * s * k, h = (it.h || 32) * s * k;
      const cx = (a.x + (off.dx || 0)) * k, cy = (a.y + (off.dy || 0)) * k;
      const dot = it.dot || 4, img = el("img", "");
      if (dot >= 2) { const dots = ((it.w || 32) * 4) / dot, n = Math.max(1, Math.round((w * dpr) / dots)); const w2 = (n * dots) / dpr; h = (h / w) * w2; w = w2; img.className = "px"; }
      img.style.cssText = `left:${cx - w / 2}px;top:${cy - h / 2}px;width:${w}px;height:${h}px;pointer-events:none`;
      img.src = asset(it.image); img.alt = ""; img.dataset.slot = slot;
      box.appendChild(img); decos.push(img);
    }
    return { box, sprite, cpx, decos, basePts: ch && ch.actions && ch.actions.idle && (ch.actions.idle.points || [])[0], actions: ch && ch.actions, body: sf.height * k };
  }
  function setAction(v, name) {
    if (!v.sprite || !v.actions) return false;
    const act = v.actions[name] || (name === "jump" && v.actions.happy) || v.actions.idle;
    if (act === v.action) return act !== v.actions.idle || name === "idle";
    v.action = act; v.frame = 0; v.ft = 0;
    v.sprite.style.backgroundImage = `url("${asset(act.sheet)}")`;
    v.sprite.style.backgroundSize = `${act.frames * +v.sprite.dataset.fw}px ${+v.sprite.dataset.fh}px`;
    v.sprite.style.backgroundPosition = "0 0";
    decoFollow(v);
    return act !== v.actions.idle || name === "idle";
  }
  function decoFollow(v) {
    if (!v.basePts || !v.decos.length) return;
    const pts = v.action && v.action.points && v.action.points[v.frame];
    for (const d of v.decos) { const a = pts && pts[d.dataset.slot], b = v.basePts[d.dataset.slot]; d.style.transform = a && b ? `translate(${(a[0] - b[0]) * v.cpx}px,${(a[1] - b[1]) * v.cpx}px)` : ""; }
  }
  function tick(v, dt) {
    const act = v.action;
    if (!act || act.frames < 2) return;
    v.ft += dt * 1000;
    const dur = (act.durations && act.durations[v.frame]) || 120;
    if (v.ft < dur) return;
    v.ft -= dur; v.frame++;
    if (v.frame >= act.frames) { if (act.loop === false && !v.fx) { v.oneShot = false; setAction(v, v.moving ? "walk" : "idle"); return; } v.frame = 0; }
    v.sprite.style.backgroundPosition = `${-v.frame * +v.sprite.dataset.fw}px 0`;
    decoFollow(v);
  }

  /* ---------------------------------------------------------- 재주 (클래스펫츠 앱과 같은 움직임, 이 휴대폰에서만 보임) */
  const SVGNS = "http://www.w3.org/2000/svg";
  const PIX = { // [viewBox, fill, stroke, path]
    heart: ["0 0 7 6", "#FF7FB0", "", "M1 0h2v1h-2zM4 0h2v1h-2zM0 1h7v2h-7zM1 3h5v1h-5zM2 4h3v1h-3zM3 5h1v1h-1z"],
    star: ["0 0 7 7", "#FFE38A", "#C99A2E", "M3 0h1v2h2v1H5v1h1v2H5V5H2v1H1V4h1V3H1V2h2z"],
    note: ["0 0 6 7", "#8E91FD", "", "M2 0h4v2H3v4H0V4h2z"],
    dust: ["0 0 6 4", "#E8E2D6", "", "M1 1h4v2H1zM2 0h2v1H2zM0 2h1v1H0zM5 2h1v1H5z"],
    cloud: ["0 0 8 5", "#FFFFFF", "#C9CAF0", "M2 1h1V0h3v1h1v1h1v2H0V2h2z"],
    bark: ["0 0 8 8", "none", "#23245E", "M1 1l2 2M4 0v3M7 1L5 3"],
    broom: ["0 0 8 8", "#FFE38A", "#8B6A2E", "M5 0h1v4H5zM3 4h5v1h-1v3H3V5z"],
  };
  const FXART = { heart: "fx_heart", star: "fx_star", note: "fx_note1", note2: "fx_note2", swirl: "fx_swirl", dust: "fx_dust", cloud: "fx_cloud", bark: "fx_bark", broom: "fx_broom",
    drop: "fx_drop", flake: "fx_snowflake", ember: "fx_ember", confetti: "fx_confetti", splash: "fx_splash", sand: "fx_sand", snowball: "fx_snowball" };
  function fxArt(name) {
    const ref = D.fx && D.fx[FXART[name]];
    if (ref) { const im = el("img"); im.src = asset(ref); im.alt = ""; return im; }
    const [vb, fill, stroke, d] = PIX[name] || PIX[name === "note2" ? "note" : "star"], svg = document.createElementNS(SVGNS, "svg"), path = document.createElementNS(SVGNS, "path");
    svg.setAttribute("viewBox", vb); svg.setAttribute("shape-rendering", "crispEdges");
    path.setAttribute("d", d); path.setAttribute("fill", fill);
    if (stroke) { path.setAttribute("stroke", stroke); path.setAttribute("stroke-width", name === "bark" ? ".8" : ".4"); }
    svg.appendChild(path); return svg;
  }
  function particle(v, name, { x = 0, y = 0, vx = 0, vy = -60, life = 1.2, size = 14, cls = "rise" } = {}) {
    const d = el("div", "", "fxp " + cls);
    d.appendChild(fxArt(name));
    d.style.cssText = `left:${x}px;top:${-y}px;width:${size}px;height:${size}px;animation-duration:${life}s`;
    d.style.setProperty("--vx", vx + "px"); d.style.setProperty("--vy", vy + "px");
    v.root.appendChild(d);
    setTimeout(() => d.remove(), life * 1000 + 50);
  }
  const FX_DUR = { hearts: 1.8, zoomies: 2.4, flip: 1.1, bark: 1.4, clean: 2.4, dance1: 2.6, dance2: 2.2, dance3: 2.6, float: 3.2, sparkle: 2.4 };
  function startFx(v, id) {
    if (v.fx) return;
    v.fx = { type: id, t: 0, dur: FX_DUR[id] || 2, emit: 0 };
    v.oneShot = false; v.wait = Math.max(v.wait, 1);
    setAction(v, id === "zoomies" ? "walk" : id === "float" || id === "sparkle" ? "idle" : "happy");
    const B = v.body;
    if (id === "hearts") for (let i = 0; i < 6; i++) setTimeout(() => particle(v, "heart", { x: rnd(-B * 0.3, B * 0.3), y: B * rnd(0.5, 0.9), vx: rnd(-30, 30), vy: -rnd(60, 110), life: 1.4, size: rnd(12, 20) }), i * 160);
    if (id === "bark") { const b = el("div", `bottom:${B + 12}px`, "pop"); b.textContent = "Woof! Woof!"; v.root.appendChild(b); setTimeout(() => b.remove(), 1500); }
  }
  function fxStep(v, dt) {
    const f = v.fx, B = v.body, t = f.t;
    f.t += dt; f.emit -= dt;
    const p = Math.min(1, f.t / f.dur);
    if (f.t >= f.dur) { v.fx = null; v.lift.style.filter = ""; v.shadow.style.transform = ""; setAction(v, "idle"); return {}; }
    const o = {}, emit = (every, fn) => { if (f.emit <= 0) { f.emit = every; fn(); } };
    switch (f.type) {
      case "hearts": o.lift = Math.sin(Math.PI * Math.min(1, p * 2)) * B * 0.1; break;
      case "zoomies":
        o.ox = Math.sin(p * Math.PI * 4) * B * 1.4; o.lift = Math.abs(Math.sin(t * 20)) * B * 0.07;
        emit(0.1, () => particle(v, "dust", { x: o.ox - Math.sign(Math.cos(p * Math.PI * 4)) * B * 0.3, y: 4, vy: -10, life: 0.6, size: 14, cls: "puff" }));
        break;
      case "flip":
        o.lift = Math.sin(Math.PI * p) * B * 0.9; o.rot = 360 * (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p)); o.pivot = B / 2;
        if (D.fx && D.fx.fx_swirl) emit(0.25, () => particle(v, "swirl", { x: rnd(-B * 0.4, B * 0.4), y: o.lift + B * 0.5, vy: -10, life: 0.6, size: 20, cls: "puff" }));
        break;
      case "bark":
        o.lift = Math.abs(Math.sin(p * Math.PI * 4)) * B * 0.08; o.sy = 1 + Math.sin(p * Math.PI * 8) * 0.05; o.sx = 2 - o.sy;
        emit(0.35, () => particle(v, "bark", { x: B * 0.35, y: B * 0.75, vx: 20, vy: -20, life: 0.5, size: 18, cls: "puff" }));
        break;
      case "clean":
        o.ox = Math.sin(p * Math.PI * 6) * B * 0.15; o.rot = Math.sin(p * Math.PI * 6) * 6;
        emit(0.18, () => particle(v, Math.random() < 0.5 ? "dust" : "star", { x: rnd(-B * 0.6, B * 0.6), y: rnd(2, 10), vx: rnd(-20, 20), vy: -rnd(10, 40), life: 0.8, size: rnd(10, 14), cls: "puff" }));
        if (f.t < dt * 1.5) particle(v, "broom", { x: B * 0.45, y: B * 0.3, vy: 0, life: f.dur, size: 22, cls: "sweep" });
        break;
      case "dance1":
        o.rot = Math.sin(t * 8) * 12; o.lift = Math.abs(Math.sin(t * 8)) * B * 0.06;
        emit(0.4, () => particle(v, "note", { x: rnd(-B * 0.5, B * 0.5), y: B * 0.8, vx: rnd(-20, 20), vy: -60, life: 1.1, size: 14 }));
        break;
      case "dance2":
        o.sx = Math.cos(p * Math.PI * 6); if (Math.abs(o.sx) < 0.08) o.sx = 0.08 * Math.sign(o.sx || 1);
        o.lift = Math.abs(Math.sin(p * Math.PI * 6)) * B * 0.1;
        emit(0.45, () => particle(v, Math.random() < 0.5 ? "note2" : "note", { x: rnd(-B * 0.5, B * 0.5), y: B * 0.8, vx: rnd(-20, 20), vy: -60, life: 1.1, size: 14 }));
        break;
      case "dance3":
        o.sy = 1 + Math.sin(t * 12) * 0.12; o.sx = 2 - o.sy; o.ox = Math.sin(t * 4) * B * 0.2; o.lift = Math.max(0, Math.sin(t * 12)) * B * 0.12;
        emit(0.3, () => particle(v, Math.random() < 0.5 ? "note" : "star", { x: rnd(-B * 0.6, B * 0.6), y: B * 0.7, vx: rnd(-30, 30), vy: -70, life: 1, size: 14 }));
        break;
      case "float": {
        const up = Math.min(1, p * 4) * (p > 0.8 ? (1 - p) / 0.2 : 1);
        o.lift = up * B * 0.45 + Math.sin(t * 3) * 5 * up;
        v.shadow.style.transform = `translate(-50%,-50%) scale(${(1 - up * 0.4).toFixed(2)})`;
        emit(0.5, () => particle(v, "cloud", { x: rnd(-B * 0.5, B * 0.5), y: o.lift * 0.4, vx: rnd(-15, 15), vy: -15, life: 1.2, size: 20, cls: "puff" }));
        break;
      }
      case "sparkle": {
        const g = 0.5 + 0.5 * Math.sin(t * 10);
        v.lift.style.filter = `drop-shadow(0 0 ${(4 + g * 8).toFixed(1)}px rgba(255,240,150,.95))`;
        o.lift = Math.sin(Math.PI * Math.min(1, p * 2)) * B * 0.05;
        emit(0.15, () => particle(v, "star", { x: rnd(-B * 0.6, B * 0.6), y: rnd(B * 0.1, B * 1.1), vy: -10, life: 0.7, size: rnd(10, 16), cls: "twinkle" }));
        break;
      }
    }
    return o;
  }

  /* ---------------------------------------------------------- 장면 */
  let W = 0, H = 0, groundTop = 0, order = [];
  function layout() {
    const sc = $("#scene"); W = sc.clientWidth; H = sc.clientHeight;
    const bg = $("#bg");
    // 그림의 지평선(높이의 65%)이 화면 42% 근처에 오도록: 넓은 화면에서는 하늘을 잘라 위로 올림
    const bw = Math.max(W, 520), bh = bw * 0.75, HZ = 0.655;
    const top = Math.min(0, H * 0.42 - bh * HZ);
    bg.style.width = bw + "px"; bg.style.height = bh + "px"; bg.style.top = top + "px";
    groundTop = top + bh * HZ;
    // 화면에 펫이 다 들어가도록: 다 자란 펫 몸 높이 ≈ 50K, 반 인원이 많으면 조금 작게
    const n = Math.max(1, (D && D.pets.length) || 1), room = W * Math.max(120, H - groundTop);
    K = Math.max(0.9, Math.min(2.2, W / 260, Math.sqrt(room / n) / 95));
  }
  const barH = () => { const b = $("#places"); return b && !b.hidden ? b.offsetHeight : 0; };
  const bounds = (v) => { const y1 = Math.max(groundTop + 40, H - 30 - barH()); return { x0: 40, x1: Math.max(60, W - 40), y0: Math.min(y1, groundTop + v.view.body * 0.6), y1 }; };
  function target(v) { const b = bounds(v); v.tx = rnd(b.x0, b.x1); v.ty = rnd(b.y0, b.y1); }
  function makePet(p, i) {
    const root = el("div", "", "pet");
    const shadow = el("div", "", "shadow"), lift = el("div", "", "lift"), tap = el("button", "", "tap"), tag = el("span", "", "tag");
    tag.textContent = p.name || p.who;
    tap.setAttribute("aria-label", (p.name || p.stage_name) + ", " + p.who);
    root.append(shadow, lift, tap, tag);
    $("#pets").appendChild(root);
    const v = { p, root, shadow, lift, tap, t: rnd(0, 6), wait: rnd(0, 3), speed: rnd(22, 38), hop: 0, moving: false };
    v.view = buildBox(p, K); Object.assign(v, v.view); lift.appendChild(v.box);
    const B = v.body, bw = B * (p.egg ? 0.8 : 0.95);
    tap.style.cssText = `left:${-bw / 2}px;top:${-B}px;width:${bw}px;height:${B + 22}px`;
    shadow.style.cssText = `left:0;top:0;width:${B * 0.7}px;height:${B * 0.11}px`;
    setAction(v, "idle");
    const b = bounds(v), slot = order[i] / D.pets.length; // 처음엔 고르게 흩어 놓기
    v.x = b.x0 + (b.x1 - b.x0) * (slot + rnd(0.1, 0.9) / D.pets.length); v.y = rnd(b.y0, b.y1); target(v);
    tap.addEventListener("click", () => { if (v.dragged) { v.dragged = false; return; } openSheet(v); });
    bindDrag(v);
    pets.push(v);
  }
  function step(v, dt) {
    v.t += dt;
    if (v.drag) { // 잡혀 있는 동안: 손가락을 따라 대롱대롱
      const B = v.body, sw = Math.sin(v.t * 6) * 7 + Math.max(-14, Math.min(14, v.drag.vx * 0.04));
      v.drag.vx *= 0.85;
      v.root.style.transform = `translate(${v.x.toFixed(1)}px,${v.y.toFixed(1)}px)`;
      v.root.style.zIndex = 9600;
      v.lift.style.transform = `translateY(${(-B * 0.12).toFixed(1)}px) rotate(${sw.toFixed(1)}deg) scale(${v.flip ? -1 : 1},1)`;
      tick(v, dt);
      return;
    }
    let moving = false, act = null;
    if (v.act) act = actStep(v, dt);
    if (act) moving = !!act.moving;
    else if (!v.oneShot && !v.sel && !v.fx) {
      if (v.p.egg) { v.wait -= dt; if (v.wait <= 0) { v.wait = rnd(4, 9); v.hop = 1; } }
      else if (v.wait > 0) v.wait -= dt;
      else {
        const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
        if (v.eager) { v.eager = false; if (maybeAct(v, true)) return step(v, 0); }
        if (d < 3) { v.wait = rnd(1.5, 5); if (maybeAct(v)) return step(v, 0); freeTarget(v); if (Math.random() < 0.3) { v.oneShot = setAction(v, "jump"); if (!v.oneShot) v.hop = 1; } }
        else { const s = Math.min(d, v.speed * dt * K / 2); v.x += (dx / d) * s; v.y += (dy / d) * s; moving = true; }
      }
    }
    if (moving !== v.moving) { v.moving = moving; if (!v.oneShot && !v.fx) setAction(v, moving ? "walk" : "idle"); }
    let lift = 0, rot = 0, ox = 0, pivot = 0, sx = 1, sy = 1;
    if (moving) lift = Math.abs(Math.sin(v.t * 9)) * v.body * 0.025;
    if (act && !act.moving) { lift += act.lift || 0; if (act.rot) rot = act.rot; if (act.sy) sy = act.sy; }
    if (v.hidden) return;
    if (v.hop > 0) { lift += Math.sin((1 - v.hop) * Math.PI) * v.body * (v.p.egg ? 0.05 : 0.18); if (v.p.egg) rot = Math.sin(v.t * 30) * 6 * v.hop; v.hop = Math.max(0, v.hop - dt * 1.8); }
    if (v.fx) {
      const f = fxStep(v, dt);
      lift += f.lift || 0; ox = f.ox || 0; pivot = f.pivot || 0;
      if (f.rot !== undefined) rot = f.rot;
      if (f.sx !== undefined) sx = f.sx;
      if (f.sy !== undefined) sy = f.sy;
    }
    v.root.style.transform = `translate(${(v.x + ox).toFixed(1)}px,${v.y.toFixed(1)}px)`;
    v.root.style.zIndex = v.fx ? 9000 : Math.round(v.y);
    v.lift.style.transform = `translateY(${(-lift - pivot).toFixed(1)}px) rotate(${rot.toFixed(1)}deg) translateY(${pivot.toFixed(1)}px) scale(${(sx * (v.flip ? -1 : 1)).toFixed(3)},${sy.toFixed(3)})`;
    tick(v, dt);
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (RM) roomStep(dt); // 방에 있는 동안은 바깥 장면을 쉼
    else { playScene(dt); for (const v of pets) step(v, dt); }
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------- 잡아서 옮기기 (이 휴대폰 화면에서만) */
  function bindDrag(v) {
    let st = null;
    v.tap.addEventListener("pointerdown", (e) => {
      if (v.hidden || (e.pointerType === "mouse" && e.button !== 0)) return;
      st = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: v.x, vy: v.y, lx: e.clientX };
      try { v.tap.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });
    v.tap.addEventListener("pointermove", (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!v.drag) {
        if (Math.hypot(dx, dy) < 8 || v.fx) return;
        if (cur === v) closeSheet();
        if (v.act) endAct(v, true);
        v.oneShot = false; v.drag = { vx: 0 }; v.root.classList.add("held");
        setAction(v, "held");
        $("#hint").hidden = true;
      }
      v.drag.vx += (e.clientX - st.lx) * 8; st.lx = e.clientX;
      v.x = Math.max(16, Math.min(W - 16, st.vx + dx));
      v.y = Math.max(groundTop - v.body * 0.6, Math.min(H - 8 - barH(), st.vy + dy));
      e.preventDefault();
    });
    const up = (e) => {
      if (!st || (e && e.pointerId !== st.id)) return;
      st = null;
      if (!v.drag) return;
      v.drag = null; v.dragged = true; v.root.classList.remove("held");
      setTimeout(() => { v.dragged = false; }, 400);
      const b = bounds(v);
      v.y = Math.max(b.y0, Math.min(b.y1, v.y)); v.x = Math.max(b.x0 - 20, Math.min(b.x1 + 20, v.x));
      v.hop = 0.8; v.wait = rnd(1, 2.5); v.moving = false;
      setAction(v, "idle");
      // 수영장 물에 내려놓으면 바로 수영
      if (S2.place === "pool" && S2.zone && !v.p.egg && inZone(v.x, v.y, S2.zone, 0)) {
        const z = S2.zone, B = v.body;
        v.act = { type: "swim", phase: "go", t: 0, until: rnd(12, 22), tx: Math.max(z.x0 + B * 0.45, Math.min(z.x1 - B * 0.45, v.x)), ty: Math.max(z.y0, Math.min(z.y1, v.y)) };
        v.x = v.act.tx; v.y = v.act.ty; v.wait = 0;
      } else target(v);
    };
    v.tap.addEventListener("pointerup", up);
    v.tap.addEventListener("pointercancel", up);
  }

  /* ---------------------------------------------------------- 방 구경 (보기만) */
  let RM = null;
  const iconImg = (ref, txt) => { if (ref) { const im = el("img"); im.src = asset(ref); im.alt = ""; return im; } const t = el("span"); t.textContent = txt; return t; };
  function openRoom(pv) {
    const p = pv.p, r = p.room || {};
    closeSheet();
    $("#rTitle").textContent = `${p.name || p.who}'s Room`;
    $("#rWho").textContent = p.name ? p.who : "";
    $("#rStage").textContent = p.stage_name;
    $("#rNext").textContent = r.final ? "All grown up!" : r.next ? `${r.remaining} XP to ${r.next}` : "";
    $("#rBar").style.width = Math.round((r.progress || 0) * 100) + "%";
    $("#rXp").textContent = r.xp || 0; $("#rCoin").textContent = r.coins || 0; $("#rHeart").textContent = p.hearts || 0;
    const I = D.icons || {};
    for (const [id, ref, t] of [["#rXpI", I.xp, "⭐"], ["#rCoinI", I.coin, "●"], ["#rHeartI", I.heart, "♥"]]) { const n = $(id); n.textContent = ""; n.appendChild(iconImg(ref, t)); }
    const tr = $("#rTricks"); tr.textContent = "";
    if (!p.tricks.length) { const sp = el("span"); sp.textContent = "No tricks yet"; tr.appendChild(sp); }
    for (const t of p.tricks) {
      const b = el("button", "", "trick"); b.type = "button"; b.textContent = t.name;
      b.addEventListener("click", () => { if (RM) startFx(RM.v, t.id); });
      tr.appendChild(b);
    }
    const th = $("#rThings"); th.textContent = "";
    if (!(r.things || []).length) { const e = el("p", "", "empty"); e.textContent = "Nothing yet. 아직 없어요."; th.appendChild(e); }
    for (const it of r.things || []) {
      const c = el("div", "", "th" + (it.worn ? " worn" : "")), im = el("img", "", (it.dot || 4) >= 2 ? "px" : "");
      im.src = asset(it.image); im.alt = "";
      const nm = el("span"); nm.textContent = it.name;
      c.append(im, nm);
      if (it.qty > 1) { const q = el("b", "", "q"); q.textContent = "×" + it.qty; c.appendChild(q); }
      if (it.worn) { const w = el("span", "", "w"); w.textContent = it.kind === "furniture" ? "In room" : "Wearing"; c.appendChild(w); }
      th.appendChild(c);
    }
    $("#rBg").src = asset(r.bg || D.bg);
    $("#room").hidden = false; $("#hint").hidden = true;
    $("#room .room-body").scrollTop = 0;
    requestAnimationFrame(() => buildRoomPet(p));
  }
  function closeRoom() { RM = null; $("#rPets").textContent = ""; $("#room").hidden = true; last = performance.now(); }
  $("#roomBack").addEventListener("click", closeRoom);
  $("#goRoom").addEventListener("click", () => { if (cur) openRoom(cur); });
  function buildRoomPet(p) {
    const sc = $("#rScene"), RW = sc.clientWidth, RH = sc.clientHeight, box = $("#rPets"); box.textContent = "";
    const k = (RH * (p.egg ? 0.24 : 0.36)) / stageFit(p.stage).height;
    const u = RW / 96 / 16; // 그림 16px = 방 1칸
    for (const f of (p.room || {}).furniture || []) { // 놓아 둔 가구 (펫 뒤)
      const im = el("img", `position:absolute;left:${f.x * 16 * u - f.ax * u}px;top:${f.y * 16 * u - f.ay * u}px;width:${f.w * u}px;height:${f.h * u}px;image-rendering:pixelated;pointer-events:none`);
      im.src = asset(f.image); im.alt = ""; box.appendChild(im);
    }
    const root = el("div", "", "pet"), shadow = el("div", "", "shadow"), lift = el("div", "", "lift"), tap = el("button", "", "tap");
    tap.setAttribute("aria-label", p.name || p.who);
    root.append(shadow, lift, tap); box.appendChild(root);
    const v = { p, root, shadow, lift, tap, t: 0, wait: 1, speed: 30, hop: 0, moving: false };
    v.view = buildBox(p, k); Object.assign(v, v.view); lift.appendChild(v.box);
    const B = v.body, bw = B * (p.egg ? 0.8 : 0.95);
    tap.style.cssText = `left:${-bw / 2}px;top:${-B}px;width:${bw}px;height:${B}px`;
    shadow.style.cssText = `left:0;top:0;width:${B * 0.7}px;height:${B * 0.11}px`;
    const b = { x0: RW * 0.18, x1: RW * 0.82, y0: RH * 0.76, y1: RH * 0.92 };
    v.x = RW / 2; v.y = RH * 0.86; v.tx = v.x; v.ty = v.y;
    setAction(v, "idle");
    tap.addEventListener("click", () => {
      if (v.fx) return;
      if (p.egg) { v.hop = 1; return; }
      v.oneShot = setAction(v, "happy"); if (!v.oneShot) v.hop = 1;
      particle(v, "heart", { x: rnd(-B * 0.2, B * 0.2), y: B * 0.9, vy: -50, life: 1, size: 16 });
    });
    RM = { v, b };
  }
  function roomStep(dt) {
    const v = RM.v, b = RM.b;
    v.t += dt;
    let moving = false;
    if (!v.oneShot && !v.fx) {
      if (v.p.egg) { v.wait -= dt; if (v.wait <= 0) { v.wait = rnd(3, 7); v.hop = 1; } }
      else if (v.wait > 0) v.wait -= dt;
      else {
        const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
        if (d < 3) { v.wait = rnd(1.5, 4.5); v.tx = rnd(b.x0, b.x1); v.ty = rnd(b.y0, b.y1); if (Math.random() < 0.3) { v.oneShot = setAction(v, "jump"); if (!v.oneShot) v.hop = 1; } }
        else { const s2 = Math.min(d, v.speed * dt * (v.body / 50)); v.x += (dx / d) * s2; v.y += (dy / d) * s2; moving = true; }
      }
    }
    if (moving !== v.moving) { v.moving = moving; if (!v.oneShot && !v.fx) setAction(v, moving ? "walk" : "idle"); }
    let lift = moving ? Math.abs(Math.sin(v.t * 9)) * v.body * 0.025 : 0, rot = 0, ox = 0, pivot = 0, sx = 1, sy = 1;
    if (v.hop > 0) { lift += Math.sin((1 - v.hop) * Math.PI) * v.body * (v.p.egg ? 0.05 : 0.18); if (v.p.egg) rot = Math.sin(v.t * 30) * 6 * v.hop; v.hop = Math.max(0, v.hop - dt * 1.8); }
    if (v.fx) { const f = fxStep(v, dt); lift += f.lift || 0; ox = f.ox || 0; pivot = f.pivot || 0; if (f.rot !== undefined) rot = f.rot; if (f.sx !== undefined) sx = f.sx; if (f.sy !== undefined) sy = f.sy; }
    v.root.style.transform = `translate(${(v.x + ox).toFixed(1)}px,${v.y.toFixed(1)}px)`;
    v.lift.style.transform = `translateY(${(-lift - pivot).toFixed(1)}px) rotate(${rot.toFixed(1)}deg) translateY(${pivot.toFixed(1)}px) scale(${(sx * (v.flip ? -1 : 1)).toFixed(3)},${sy.toFixed(3)})`;
    tick(v, dt);
  }

  /* ---------------------------------------------------------- 눌렀을 때 카드 */
  let cur = null;
  function openSheet(v) {
    if (cur) cur.sel = false, cur.root.classList.remove("sel");
    cur = v; v.sel = true; v.root.classList.add("sel");
    const p = v.p;
    $("#sName").textContent = p.name || p.who;
    $("#sWho").textContent = p.name ? p.who : "";
    $("#sStage").textContent = p.stage_name;
    $("#sHearts").textContent = p.hearts + " hearts";
    $("#sNext").textContent = p.tricks.length >= 10 ? "All tricks!" : `Next trick: ${p.next} more`;
    $("#sBar").style.width = ((10 - p.next) * 10) + "%";
    const tr = $("#sTricks"); tr.textContent = "";
    $("#sTip").hidden = !p.tricks.length;
    if (!p.tricks.length) { const s = el("span"); s.textContent = "No tricks yet"; tr.appendChild(s); }
    for (const t of p.tricks) {
      const b = el("button", "", "trick"); b.type = "button"; b.textContent = t.name;
      b.addEventListener("click", () => { closeSheet(); startFx(v, t.id); });
      tr.appendChild(b);
    }
    const big = $("#big"); big.textContent = "";
    const kk = 104 / (stageFit(p.stage).height + 12);
    const bv = buildBox(p, kk);
    const holder = el("div", `position:absolute;left:56px;top:${104}px;width:0;height:0`);
    holder.appendChild(bv.box); big.appendChild(holder);
    if (bv.sprite) { bv.sprite.style.backgroundImage = `url("${asset(p.char.actions.idle.sheet)}")`; bv.sprite.style.backgroundSize = `${p.char.actions.idle.frames * +bv.sprite.dataset.fw}px ${+bv.sprite.dataset.fh}px`; }
    $("#dim").hidden = false; $("#sheet").hidden = false; $("#hint").hidden = true;
  }
  function closeSheet() { if (cur) { cur.sel = false; cur.root.classList.remove("sel"); cur = null; } $("#dim").hidden = true; $("#sheet").hidden = true; }
  $("#dim").addEventListener("click", closeSheet);
  $("#close").addEventListener("click", closeSheet);

  /* ---------------------------------------------------------- 상점 (보기만, 찜은 이 휴대폰에만) */
  const STORE_PX = [ // [x, y, w, h, 색] 32×30 도트
    [3,0,26,6,"#3B1A11"],[4,1,24,4,"#8E91FD"],[13,2,6,2,"#FFE38A"],[15,1,2,4,"#FFE38A"],[6,2,2,2,"#FF9EC4"],[24,2,2,2,"#FF9EC4"],
    [1,6,30,6,"#3B1A11"],[2,6,4,5,"#FF9EC4"],[6,6,4,5,"#FFF3D6"],[10,6,4,5,"#FF9EC4"],[14,6,4,5,"#FFF3D6"],[18,6,4,5,"#FF9EC4"],[22,6,4,5,"#FFF3D6"],[26,6,4,5,"#FF9EC4"],
    [2,11,2,1,"#FF9EC4"],[6,11,2,1,"#FFF3D6"],[10,11,2,1,"#FF9EC4"],[14,11,2,1,"#FFF3D6"],[18,11,2,1,"#FF9EC4"],[22,11,2,1,"#FFF3D6"],[26,11,2,1,"#FF9EC4"],
    [3,12,26,17,"#3B1A11"],[4,12,24,16,"#FFE9C7"],
    [6,14,11,8,"#3B1A11"],[7,15,9,6,"#CDEBFF"],[8,18,2,2,"#E8484F"],[9,17,1,1,"#4BAA5A"],[11,18,3,2,"#FF9EC4"],[12,19,1,1,"#C2507A"],[14,17,1,3,"#FFE38A"],[7,20,9,1,"#B98A5A"],
    [19,15,7,13,"#3B1A11"],[20,16,5,12,"#FF9EC4"],[21,17,3,4,"#FFC4DC"],[23,22,1,1,"#3B1A11"],
    [5,24,13,4,"#B98A5A"],[5,24,13,1,"#8B6A2E"],[0,28,32,2,"#7FB069"],
  ];
  function storeSvg() {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 32 30"); svg.setAttribute("shape-rendering", "crispEdges");
    for (const [x, y, w, h, c] of STORE_PX) { const r = document.createElementNS(SVGNS, "rect"); r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", w); r.setAttribute("height", h); r.setAttribute("fill", c); svg.appendChild(r); }
    return svg;
  }
  let storeEl = null;
  function placeStore() {
    if (!D.shop || !D.shop.items.length) return;
    const art = D.icons && D.icons.shop; // 그림(256×240, 바닥 가운데 128,236)이 있으면 그림, 없으면 앱이 그린 도트
    const w = Math.round(Math.min(130, Math.max(84, W * 0.26))), h = Math.round(art ? w * 240 / 256 : w * 30 / 32), foot = art ? h * 236 / 240 : h;
    const root = el("div", "", "store"), btn = el("button", `left:${-w / 2}px;top:${-foot}px;width:${w}px;height:${h}px`), tag = el("span", "", "tag");
    btn.setAttribute("aria-label", "Pet Shop"); btn.className = "bob";
    if (art) { const im = el("img", "width:100%;height:100%;display:block;image-rendering:pixelated"); im.src = asset(art); im.alt = ""; btn.appendChild(im); }
    else btn.appendChild(storeSvg());
    tag.textContent = "Shop";
    root.append(btn, tag);
    // 들판 뒤쪽 언덕 위 (펫보다 뒤, 펫이 걸어다니는 땅보다 위)
    const x = W - w / 2 - 12, y = Math.max(h + 8, groundTop + 2);
    root.style.transform = `translate(${x}px,${y}px)`; root.style.zIndex = 0;
    tag.style.top = `${-h - 24}px`;
    btn.addEventListener("click", openShop);
    $("#pets").appendChild(root); storeEl = root;
  }
  const wishKey = () => "petland-wish-" + (new URLSearchParams(location.search).get("c") || "");
  function wishes() { try { return new Set(JSON.parse(localStorage.getItem(wishKey()) || "[]")); } catch (e) { return new Set(); } }
  function saveWishes(set) { try { localStorage.setItem(wishKey(), JSON.stringify([...set])); } catch (e) { /* 저장 안 되는 브라우저: 이번에만 */ } }
  let shopTab = null, wishMem = null;
  function openShop() {
    closeSheet();
    wishMem = wishes();
    if (!shopTab || (shopTab !== "wish" && !D.shop.kinds.some((k) => k.id === shopTab))) shopTab = D.shop.kinds[0].id;
    renderShop();
    $("#shop").hidden = false; $("#hint").hidden = true;
  }
  function renderShop() {
    const tabs = $("#shopTabs"); tabs.textContent = "";
    for (const [id, label] of [...D.shop.kinds.map((k) => [k.id, k.name]), ["wish", `♥ My list (${[...wishMem].filter((i) => D.shop.items.some((x) => x.id === i)).length})`]]) {
      const b = el("button", "", shopTab === id ? "on" : ""); b.type = "button"; b.textContent = label;
      b.addEventListener("click", () => { shopTab = id; renderShop(); $("#shopList").scrollTop = 0; });
      tabs.appendChild(b);
    }
    const list = $("#shopList"); list.textContent = "";
    const items = shopTab === "wish" ? D.shop.items.filter((i) => wishMem.has(i.id)) : D.shop.items.filter((i) => i.kind === shopTab);
    if (!items.length) { const e = el("p", "", "empty"); e.textContent = shopTab === "wish" ? "Tap ♡ on things you want!\n갖고 싶은 물건의 ♡를 눌러 보세요." : "Nothing here yet."; e.style.whiteSpace = "pre-line"; list.appendChild(e); return; }
    let lastTheme = null;
    for (const it of items) {
      if (it.theme && it.theme !== lastTheme && shopTab !== "wish") { // 가구는 테마별 제목
        lastTheme = it.theme;
        const h = el("h3", "", "theme"); h.textContent = "🛋️ " + ((D.shop.themes || {})[it.theme] || it.theme); list.appendChild(h);
      }
      const on = wishMem.has(it.id), card = el("div", "", "card" + (on ? " wished" : ""));
      const pic = el("div", "", "pic" + (it.kind === "background" ? " bgpic" : "")), im = el("img", "", (it.dot || 4) >= 2 ? "px" : "");
      im.src = asset(it.image); im.alt = ""; pic.appendChild(im);
      const nm = el("b"); nm.textContent = it.name;
      const ko = el("span", "", "ko"); ko.textContent = it.name_ko && it.name_ko !== it.name ? it.name_ko : "";
      const pr = el("span", "", "price");
      if (D.icons && D.icons.coin) { const c = el("img"); c.src = asset(D.icons.coin); c.alt = ""; pr.appendChild(c); } else { const c = el("i"); c.textContent = "●"; pr.appendChild(c); }
      pr.appendChild(document.createTextNode(it.price));
      const wb = el("button", "", "wish"); wb.type = "button"; wb.textContent = on ? "♥" : "♡";
      wb.setAttribute("aria-pressed", on); wb.setAttribute("aria-label", "Wish " + it.name);
      wb.addEventListener("click", () => { if (wishMem.has(it.id)) wishMem.delete(it.id); else wishMem.add(it.id); saveWishes(wishMem); renderShop(); });
      card.append(wb, pic, nm, ko, pr);
      list.appendChild(card);
    }
  }
  $("#shopClose").addEventListener("click", () => { $("#shop").hidden = true; });

  /* ---------------------------------------------------------- 반 공동 퀘스트: 게이지·퀘스트·장소 */
  let curPlace = null, toastT = 0;
  const placeKey = () => "petland-place-" + (LOCAL || Q.get("c") || "");
  function toast(t) { const m = $("#toast"); m.textContent = t; m.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { m.hidden = true; }, 2600); }
  function renderTeam() {
    const T = D.team, box = $("#team");
    if (!T) { box.hidden = true; $("#places").hidden = true; return; }
    const nx = T.places.find((p) => p.id === T.next), prev = Math.max(0, ...T.places.filter((p) => p.unlocked).map((p) => p.goal));
    $("#tPts").textContent = T.points;
    $("#tNext").textContent = nx ? `Next: ${nx.name} at ${nx.goal}` : "All places open!";
    $("#tBar").style.width = (nx ? Math.max(3, Math.min(100, ((T.points - prev) / Math.max(1, nx.goal - prev)) * 100)) : 100) + "%";
    const qb = $("#tQuest");
    qb.hidden = !T.quests.length;
    if (T.quests.length) qb.textContent = "Quest: " + T.quests.join(" · ");
    box.hidden = false;
    const bar = $("#places"); bar.textContent = "";
    for (const p of T.places) {
      const b = el("button", "", "place" + (p.unlocked ? "" : " locked") + (p.id === curPlace ? " on" : ""));
      b.type = "button";
      const th = el("span", "", "th"), im = el("img"); im.src = asset(p.thumb); im.alt = ""; th.appendChild(im);
      if (!p.unlocked) { const lk = el("i", "", "lock"); lk.textContent = "🔒"; th.appendChild(lk); }
      const nm = el("span", "", "nm"); nm.textContent = p.name;
      b.append(th, nm);
      b.setAttribute("aria-label", p.unlocked ? p.name : `${p.name} (locked)`);
      b.addEventListener("click", () => {
        if (!p.unlocked) { toast(`🔒 ${p.name}: ${p.goal} points to open! (now ${T.points})`); return; }
        goPlace(p.id, true);
      });
      bar.appendChild(b);
    }
    bar.hidden = false;
  }
  function goPlace(id, user) {
    const p = D.team && D.team.places.find((x) => x.id === id && x.unlocked);
    if (!p) id = "meadow";
    const changed = curPlace !== id;
    curPlace = id;
    const img = (p && p.image) || D.bg;
    const bg = $("#bg");
    bg.onload = () => { // 그림 아래쪽 땅 색으로 화면 나머지를 채움
      try {
        const c = document.createElement("canvas"); c.width = 8; c.height = 1;
        const g = c.getContext("2d"); g.drawImage(bg, 0, bg.naturalHeight - 2, bg.naturalWidth, 1, 0, 0, 8, 1);
        const d = g.getImageData(0, 0, 8, 1).data; let r = 0, gg = 0, b = 0;
        for (let i = 0; i < 32; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        $("#scene").style.background = `rgb(${r >> 3},${gg >> 3},${b >> 3})`;
      } catch (e) { /* 색을 못 읽으면 기본 풀색 */ }
    };
    if (changed && user) { bg.classList.add("fade"); setTimeout(() => { bg.src = asset(img); bg.classList.remove("fade"); }, 180); }
    else bg.src = asset(img);
    $$(".place").forEach((b, i) => b.classList.toggle("on", D.team.places[i].id === id));
    if (user) {
      try { localStorage.setItem(placeKey(), id); } catch (e) { /* 저장 안 되는 브라우저 */ }
      if (changed) { for (const v of pets) { freeTarget(v); v.wait = rnd(0, 0.6); } setupPlay(id); toast(p ? `Welcome to the ${p.name}!` : ""); }
      if (LOCAL) fetch(`/api/classes/${encodeURIComponent(LOCAL)}/place`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ place_id: id }) }).catch(() => {});
    }
  }

  /* ---------------------------------------------------------- 장소 놀이: 장소마다 어울리는 활동을 하다가 다시 흩어져 돌아다님 */
  const PX = (vb, rects, cls) => { // 작은 도트 그림 (그림 파일이 오면 바꿔 끼울 자리)
    const svg = document.createElementNS(SVGNS, "svg"); svg.setAttribute("viewBox", vb); svg.setAttribute("shape-rendering", "crispEdges");
    if (cls) svg.setAttribute("class", cls);
    for (const [x, y, w, h, c] of rects) { const r = document.createElementNS(SVGNS, "rect"); r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", w); r.setAttribute("height", h); r.setAttribute("fill", c); svg.appendChild(r); }
    return svg;
  };
  const ART = {
    ring: ["0 0 20 8", [[2, 1, 16, 6, "#3B1A11"], [3, 2, 14, 4, "#FF7F9E"], [6, 2, 3, 4, "#FFFFFF"], [12, 2, 3, 4, "#FFFFFF"], [5, 3, 10, 2, "#3B1A11"]]],
    logs: ["0 0 24 10", [[2, 5, 20, 4, "#3B1A11"], [3, 6, 18, 2, "#9A6B44"], [0, 7, 5, 3, "#8C8C99"], [19, 7, 5, 3, "#8C8C99"], [9, 8, 6, 2, "#8C8C99"]]],
    castle: ["0 0 20 16", [[2, 8, 16, 8, "#3B1A11"], [3, 9, 14, 7, "#F2CE8A"], [2, 3, 5, 6, "#3B1A11"], [3, 4, 3, 5, "#F2CE8A"], [13, 3, 5, 6, "#3B1A11"], [14, 4, 3, 5, "#F2CE8A"], [8, 1, 4, 8, "#3B1A11"], [9, 2, 2, 7, "#F2CE8A"], [9, 0, 1, 2, "#3B1A11"], [10, 0, 3, 1, "#FF7F9E"], [9, 12, 2, 4, "#C99A5A"]]],
    snowman: ["0 0 16 22", [[3, 10, 10, 11, "#3B1A11"], [4, 11, 8, 10, "#FFFFFF"], [4, 2, 8, 9, "#3B1A11"], [5, 3, 6, 7, "#FFFFFF"], [6, 5, 1, 1, "#3B1A11"], [9, 5, 1, 1, "#3B1A11"], [7, 7, 3, 1, "#FF9A3C"], [4, 9, 8, 2, "#E2475F"], [4, 0, 8, 3, "#3B1A11"], [5, 0, 6, 2, "#5C5F9E"]]],
    balloon: ["0 0 10 18", [[2, 0, 6, 1, "#3B1A11"], [1, 1, 8, 7, "#3B1A11"], [2, 1, 6, 7, "COL"], [3, 2, 2, 2, "#FFFFFF"], [4, 8, 2, 1, "#3B1A11"], [5, 9, 1, 9, "#8C8C99"]]],
    fly: ["0 0 12 8", [[0, 0, 5, 4, "#3B1A11"], [1, 1, 3, 3, "COL"], [7, 0, 5, 4, "#3B1A11"], [8, 1, 3, 3, "COL"], [1, 4, 4, 3, "#3B1A11"], [2, 4, 2, 2, "COL"], [7, 4, 4, 3, "#3B1A11"], [8, 4, 2, 2, "COL"], [5, 1, 2, 6, "#3B1A11"]]],
    drop: ["0 0 4 5", [[1, 0, 2, 1, "#9AD8F5"], [0, 1, 4, 3, "#9AD8F5"], [1, 4, 2, 1, "#9AD8F5"], [1, 1, 1, 1, "#FFFFFF"]]],
    flake: ["0 0 5 5", [[2, 0, 1, 5, "#FFFFFF"], [0, 2, 5, 1, "#FFFFFF"], [1, 1, 1, 1, "#FFFFFF"], [3, 3, 1, 1, "#FFFFFF"], [3, 1, 1, 1, "#FFFFFF"], [1, 3, 1, 1, "#FFFFFF"]]],
    ember: ["0 0 2 2", [[0, 0, 2, 2, "#FFB347"]]],
    confetti: ["0 0 2 3", [[0, 0, 2, 3, "COL"]]],
  };
  const COLS = ["#FF7F9E", "#FFD45C", "#7FC8F8", "#9BE3A1", "#B9A2F5", "#FFA25C"];
  const art = (name, col, cls) => { const [vb, r] = ART[name]; return PX(vb, r.map((x) => x[4] === "COL" ? [...x.slice(0, 4), col || COLS[0]] : x), cls); };
  const PR = (name) => D.props && D.props[name];
  function propEl(name, w, cls) { // 소품 그림 (가로 시트면 움직임). w = 화면 너비
    const P = PR(name), cw = P.cell ? P.cell[0] : P.w, ch = P.cell ? P.cell[1] : P.h, h = w * ch / cw;
    const d = el("div", `width:${w}px;height:${h}px`, cls || "");
    if (P.frames > 1 && P.progress) { // 쌓기 단계 그림: 진행도에 따라 칸을 고름 (자동 반복 아님)
      d.style.backgroundImage = `url("${asset(P.image)}")`; d.style.backgroundSize = `${P.frames * 100}% 100%`;
      d.style.imageRendering = "pixelated"; d.style.backgroundPosition = "0 0"; d._frames = P.frames;
    } else if (P.frames > 1) {
      d.style.backgroundImage = `url("${asset(P.image)}")`; d.style.backgroundSize = `${P.frames * 100}% 100%`;
      d.style.imageRendering = "pixelated"; d.style.animation = `sheet ${(P.frames * (P.ms || 150)) / 1000}s steps(${P.frames}, jump-none) infinite`;
    } else { const im = el("img", "width:100%;height:100%;display:block;image-rendering:pixelated"); im.src = asset(P.image); im.alt = ""; d.appendChild(im); }
    d._ax = P.anchor ? P.anchor[0] / cw * w : w / 2; d._ay = P.anchor ? P.anchor[1] / ch * h : h;
    return d;
  }
  function placeProp(name, x, y, w, z) { const d = propEl(name, w, "prop"); d.style.left = (x - d._ax) + "px"; d.style.top = (y - d._ay) + "px"; d.style.zIndex = z == null ? Math.round(y) : z; S2.layer.appendChild(d); return d; }
  /* 장소 놀이: 펫마다 따로, 무작위로 놀이를 고름 → 놀다가 → 다시 혼자 돌아다님 */
  ART.stool = ["0 0 16 10", [[1, 1, 14, 9, "#3B1A11"], [2, 3, 12, 6, "#9A6B44"], [2, 2, 12, 2, "#E3B67A"], [5, 2, 6, 1, "#C9935A"]]];
  const S2 = { place: null, layer: null, F: null, B: 0, zone: null, fire: null, seats: [], castle: null, snowman: null, slots: {}, water: 0,
    gate: null, track: null, queue: [], ride: null, flies: [], shots: [], grow: { castle: 0, snowman: 0 }, hold: { castle: 0, snowman: 0 }, warm: 0 };
  const floor = () => { const y0 = groundTop + 10, y1 = Math.max(y0 + 60, H - 30 - barH()); return { x0: 0, x1: W, y0, y1, h: y1 - y0 }; };
  const hasAct = (v, name) => !!(v.actions && v.actions[name]);
  const bodyH = (v) => (v.p.char && v.p.char.fit && v.p.char.fit.body_h) || 140;
  const WATERLINE = { 140: 209, 180: 191, 205: 180 }; // v5 수영 그림: 이 줄 아래는 물속(투명)
  const cellY = (v, y) => (y - 272) * v.cpx; // 펫 그림 칸의 y → 발 기준 화면 거리
  function setStage(el2, i) { if (el2 && el2._frames) { el2.style.backgroundPosition = `${(i / (el2._frames - 1)) * 100}% 0`; el2._stage = i; } }
  function clearPlay() {
    for (const v of pets) endAct(v, true);
    if (S2.layer) S2.layer.remove();
    Object.assign(S2, { layer: null, zone: null, fire: null, seats: [], castle: null, snowman: null, slots: {}, gate: null, track: null, queue: [], ride: null, flies: [], shots: [] });
  }
  function addProp(node, x, y, w, h, z) {
    const d = el("div", `left:${x - w / 2}px;top:${y - h}px;width:${w}px;height:${h}px;z-index:${z == null ? Math.round(y) : z}`, "prop");
    d.appendChild(node); S2.layer.appendChild(d); return d;
  }
  function setupPlay(place) {
    clearPlay();
    S2.place = place;
    if (!D) return;
    const F = floor(), L = el("div", "", "props"); S2.layer = L; S2.F = F; $("#pets").appendChild(L);
    const B = S2.B = 50 * K; // 다 자란 펫 몸 높이쯤
    const walkers = pets.filter((v) => !v.p.egg).length;
    if (place === "meadow") {
      for (let k = 0; k < 3; k++) {
        const b = el("div", "", "fly");
        if (PR("butterfly")) { const sp = propEl("butterfly", 26); sp.style.animationDelay = `-${k * 0.12}s`; b.appendChild(sp); b.classList.add("art"); }
        else b.appendChild(art("fly", COLS[(k * 2) % COLS.length]));
        L.appendChild(b);
        S2.flies.push({ el: b, k, x: rnd(60, W - 60), y: groundTop + rnd(20, 80), ph: rnd(0, 6) });
      }
    } else if (place === "pool") {
      const w = Math.min(W * 0.66, 560), h = Math.min(F.h * 0.42, w * 0.38), cx = W * 0.5, top = F.y0 + F.h * 0.22;
      if (PR("pool")) {
        const P = PR("pool"), ph = Math.max(h, Math.min(F.h * 0.5, w * P.h / P.w)), wa = P.water || [0.1, 0.16, 0.9, 0.82];
        const im = el("img", `left:${cx - w / 2}px;top:${top}px;width:${w}px;height:${ph}px;z-index:1;image-rendering:pixelated`, "prop"); im.src = asset(P.image); im.alt = ""; L.appendChild(im);
        S2.zone = { x0: cx - w / 2 + w * wa[0], x1: cx - w / 2 + w * wa[2], y0: top + ph * wa[1] + B * 0.5, y1: top + ph * wa[3] - 4 };
      } else {
        L.appendChild(el("div", `left:${cx - w / 2}px;top:${top}px;width:${w}px;height:${h}px;z-index:1`, "pool"));
        S2.zone = { x0: cx - w / 2 + 14, x1: cx + w / 2 - 14, y0: top + B * 0.55, y1: top + h - 8 };
      }
    } else if (place === "camp") {
      const cx = W * 0.5, cy = F.y0 + F.h * 0.42, w = Math.max(44, B * 0.9);
      if (PR("campfire")) placeProp("campfire", cx, cy, Math.max(64, B * 1.3));
      else {
        addProp(art("logs"), cx, cy, w, w * 10 / 24);
        const fire = el("div", `left:${cx - w * 0.3}px;top:${cy - w * 0.62}px;width:${w * 0.6}px;height:${w * 0.5}px;z-index:${Math.round(cy)}`, "fire");
        fire.append(el("i"), el("i"), el("i")); L.appendChild(fire);
      }
      L.appendChild(el("div", `left:${cx - w * 1.6}px;top:${cy - w * 1.2}px;width:${w * 3.2}px;height:${w * 1.6}px`, "glow"));
      S2.fire = { x: cx, y: cy };
      const n = Math.max(4, Math.min(8, Math.ceil(walkers * 0.7))), r = Math.min(W * 0.42, Math.max(B * 1.7, w * 1.5));
      for (let i = 0; i < n; i++) { // 화로를 빙 둘러 의자
        const ang = (i / n) * Math.PI * 2 + Math.PI / n, x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r * 0.5 + 6;
        if (PR("stool") && PR("stool").anchor) { // v5 통나무 의자: 윗면 중심에 펫 엉덩이(발 기준점)
          const P = PR("stool"), sw = B * 0.8, sh = sw * P.h / P.w, top = y - sh * (1 - P.anchor[1] / P.h);
          const st = propEl("stool", sw); st.classList.add("prop"); st.style.left = (x - st._ax) + "px"; st.style.top = (top - st._ay) + "px"; st.style.zIndex = Math.round(y) - 1; L.appendChild(st);
          S2.seats.push({ x, y, h: y - top, top, who: null, el: st, v5: true });
          continue;
        }
        const sw = B * 0.62, node = PR("stool") ? propEl("stool", sw) : art("stool");
        const st = PR("stool") ? (node.classList.add("prop"), node.style.left = (x - node._ax) + "px", node.style.top = (y - node._ay) + "px", node.style.zIndex = Math.round(y) - 1, L.appendChild(node), node)
          : addProp(node, x, y, sw, sw * 10 / 16, Math.round(y) - 1);
        S2.seats.push({ x, y, h: sw * 10 / 16, who: null, el: st });
      }
    } else if (place === "beach") {
      const w = Math.max(48, B * 1.0), x = W * 0.74, y = F.y0 + F.h * 0.6;
      S2.castle = PR("sandcastle_build") ? placeProp("sandcastle_build", x, y, w * 1.3) : PR("sandcastle") ? placeProp("sandcastle", x, y, w * 1.3) : addProp(art("castle"), x, y, w, w * 0.8);
      if (PR("bucket")) placeProp("bucket", x - w * 1.25, y + w * 0.12, w * 0.45);
      S2.castle.classList.add("grow"); S2.castle._x = x; S2.castle._y = y;
      S2.slots.castle = [[-0.9, 0.05], [0.9, 0.05], [0, 0.32]].map(([dx, dy]) => ({ x: x + dx * w, y: y + dy * w + 4, who: null }));
      S2.water = F.y0 + 6;
    } else if (place === "snow") {
      const w = Math.max(40, B * 0.75), x = W * 0.3, y = F.y0 + F.h * 0.42;
      if (PR("snowman_build")) S2.snowman = placeProp("snowman_build", x, y, w * 1.4);
      else if (PR("snowman")) S2.snowman = placeProp("snowman", x, y, w * 1.4);
      else { const sm = el("div", "", "snowman"); sm.append(el("i", "", "b1"), el("i", "", "b2"), el("i", "", "hat"), el("i", "", "nose"), el("i", "", "scarf")); S2.snowman = addProp(sm, x, y, w, w * 1.45); }
      S2.snowman.classList.add("grow"); S2.snowman._x = x; S2.snowman._y = y;
      S2.slots.snowman = [[-1, 0.05], [1, 0.05], [0, 0.4]].map(([dx, dy]) => ({ x: x + dx * w * 0.95, y: y + dy * w + 4, who: null }));
    } else if (place === "park") {
      const gx = Math.max(B * 0.9, W * 0.14), gy = F.y0 + 4, gw = Math.max(70, B * 1.5);
      if (PR("ride_gate")) S2.gate = placeProp("ride_gate", gx, gy, gw * 1.3);
      else {
        const g = el("div", "", "gate"); g.append(el("i", "", "roof"), el("i", "", "door"), el("i", "", "sign"));
        S2.gate = addProp(g, gx, gy, gw, gw * 0.95);
      }
      S2.gate._x = gx; S2.gate._y = gy; S2.gate._w = gw;
      buildTrack(gx, gw);
    }
    for (const v of pets) if (v.p.egg) { // 알은 걷지 않으니 물·불 위에 있으면 아래로 옮겨 둠
      const bad = (S2.zone && inZone(v.x, v.y, S2.zone, v.body * 0.4)) || (S2.fire && Math.hypot(v.x - S2.fire.x, (v.y - S2.fire.y) * 2) < B * 2.2);
      if (bad) { v.y = Math.min(F.y1, (S2.zone ? S2.zone.y1 : S2.fire.y) + B * 0.9); v.x = rnd(B, W - B); }
    }
    // 처음 들어왔을 때 몇몇은 바로 놀기 시작
    for (const v of pets) if (!v.p.egg && Math.random() < 0.6) { v.wait = rnd(0.3, 4); v.eager = true; }
  }
  function buildTrack(gx, gw) { // 롤러코스터 길 (탑승구 → 언덕 → 내리막 → 다시 탑승구)
    const T = PR("coaster_track");
    if (T && T.path) { // v5 레일 그림 + 레일 위 경로 점
      const x0 = gx + gw * 0.35, avail = Math.min(W - 20, W * 0.94) - x0;
      const s = Math.max(0.35, Math.min(avail / T.w, (S2.F.y0 - 70) / T.anchor[1], 1.6)), base = S2.F.y0 + 4;
      const im = el("img", `left:${x0 - T.anchor[0] * s}px;top:${base - T.anchor[1] * s}px;width:${T.w * s}px;height:${T.h * s}px;z-index:2;image-rendering:pixelated`, "prop");
      im.src = asset(T.image); im.alt = ""; S2.layer.appendChild(im);
      const pts = T.path.map(([px, py]) => [x0 + (px - T.anchor[0]) * s, base + (py - T.anchor[1]) * s]);
      const svg = document.createElementNS(SVGNS, "svg"); svg.setAttribute("class", "track"); svg.setAttribute("width", W); svg.setAttribute("height", H); svg.style.visibility = "hidden";
      const path = document.createElementNS(SVGNS, "path"); path.setAttribute("d", "M " + pts.map((q) => q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" L ")); svg.appendChild(path);
      S2.layer.appendChild(svg);
      S2.track = path; S2.trackScale = s; S2.trackOneWay = true;
      return;
    }
    const base = groundTop - 4, top = base - Math.max(50, Math.min(115, (groundTop - 110) * 0.75));
    const x0 = gx + gw * 0.45, x1 = Math.min(W - 150, W * 0.72), amp = base - top;
    const d = `M ${x0} ${base - amp * 0.1} C ${x0 + (x1 - x0) * 0.15} ${base - amp * 0.1}, ${x0 + (x1 - x0) * 0.2} ${top}, ${x0 + (x1 - x0) * 0.32} ${top}`
      + ` C ${x0 + (x1 - x0) * 0.45} ${top}, ${x0 + (x1 - x0) * 0.5} ${base - 6}, ${x0 + (x1 - x0) * 0.62} ${base - 8}`
      + ` C ${x0 + (x1 - x0) * 0.72} ${base - 10}, ${x0 + (x1 - x0) * 0.75} ${base - amp * 0.55}, ${x0 + (x1 - x0) * 0.85} ${base - amp * 0.55}`
      + ` C ${x1} ${base - amp * 0.55}, ${x1} ${base - 4}, ${x1 - 30} ${base - 2} L ${x0} ${base - 2}`;
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "track"); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("width", W); svg.setAttribute("height", H);
    const mk = (attrs) => { const e = document.createElementNS(SVGNS, "path"); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; };
    for (let i = 0; i <= 14; i++) { // 기둥
      const x = x0 + (x1 - x0) * (i / 14);
      mk({ d: `M ${x} ${base} V ${top}`, stroke: "#C9B8D8", "stroke-width": 3, opacity: 0.55 });
    }
    mk({ d, fill: "none", stroke: "#3B1A11", "stroke-width": 7, "stroke-linejoin": "round" });
    const rail = mk({ d, fill: "none", stroke: "#FF7F9E", "stroke-width": 4, "stroke-linejoin": "round" });
    svg.style.zIndex = 2;
    S2.layer.appendChild(svg);
    S2.track = rail;
  }
  const inZone = (x, y, z, m = 0) => z && x > z.x0 - m && x < z.x1 + m && y > z.y0 - m - 30 && y < z.y1 + m;
  function freeTarget(v) { // 돌아다닐 때는 수영장 물·모닥불·탑승 줄을 피함
    for (let i = 0; i < 12; i++) {
      target(v);
      if (S2.zone && inZone(v.tx, v.ty, S2.zone, v.body * 0.4)) continue;
      if (S2.fire && Math.hypot(v.tx - S2.fire.x, (v.ty - S2.fire.y) * 2) < v.body * 1.2) continue;
      return;
    }
  }
  /* 놀이 고르기: 장소마다 할 수 있는 것 중 무작위 */
  function maybeAct(v, force) {
    if (v.p.egg || v.act || v.sel || v.fx) return false;
    if (!force && Math.random() > 0.55) return false;
    const P = S2.place, opts = [];
    const free = (arr) => arr && arr.filter((s) => !s.who);
    if (P === "meadow") opts.push(["chase", 1]);
    if (P === "pool" && S2.zone && pets.filter((x) => x.act && x.act.type === "swim").length < Math.max(2, pets.length * 0.6)) opts.push(["swim", 1]);
    if (P === "camp" && free(S2.seats).length) opts.push(["sit", 1]);
    if (P === "beach") { opts.push(["splash", 1]); if (free(S2.slots.castle).length) opts.push(["build", 1]); }
    if (P === "snow") { opts.push(["snowball", 1]); if (free(S2.slots.snowman).length) opts.push(["build", 1]); }
    if (P === "park") { if (S2.queue.length < 9 && (!v.rodeAt || performance.now() - v.rodeAt > 25000)) opts.push(["queue", 1.4]); opts.push(["balloon", 0.6]); }
    if (!opts.length) return false;
    let r = Math.random() * opts.reduce((n, o) => n + o[1], 0), pick = opts[0][0];
    for (const [k, wgt] of opts) { if ((r -= wgt) <= 0) { pick = k; break; } }
    const a = { type: pick, phase: "go", t: 0, until: rnd(12, 22), tx: v.x, ty: v.y };
    const B = v.body;
    if (pick === "swim") { const z = S2.zone; a.tx = rnd(z.x0 + B * 0.45, z.x1 - B * 0.45); a.ty = rnd(z.y0, z.y1); }
    else if (pick === "sit") { const st = free(S2.seats); const seat = st[Math.floor(Math.random() * st.length)]; seat.who = v; a.seat = seat; a.tx = seat.x; a.ty = seat.y + 1; a.until = rnd(14, 26); }
    else if (pick === "build") { const arr = free(S2.place === "beach" ? S2.slots.castle : S2.slots.snowman); const sl = arr[Math.floor(Math.random() * arr.length)]; sl.who = v; a.slot = sl; a.tx = sl.x; a.ty = sl.y; }
    else if (pick === "splash") { a.tx = rnd(B, W - B * 1.2); a.ty = S2.water + B * 0.62 + rnd(0, 16); a.until = rnd(9, 16); }
    else if (pick === "snowball") { const left = Math.random() < 0.5; a.tx = left ? rnd(W * 0.5, W * 0.62) : rnd(W * 0.78, W - B * 0.6); a.ty = rnd(S2.F.y0 + S2.F.h * 0.3, S2.F.y1 - 10); a.cool = rnd(0.8, 2.5); }
    else if (pick === "queue") { S2.queue.push(v); a.until = 999; }
    else if (pick === "balloon") { a.col = COLS[Math.floor(Math.random() * COLS.length)]; a.until = rnd(10, 16); }
    else if (pick === "chase") { a.fly = Math.floor(Math.random() * 3); a.until = rnd(8, 14); }
    v.act = a; v.wait = 0;
    return true;
  }
  function endAct(v, quiet) {
    const a = v.act;
    if (!a) return;
    for (const k of ["ringB", "ringF", "ripple", "balloon", "stick"]) if (a[k]) a[k].remove();
    if (a.seat) a.seat.who = null;
    if (a.slot) a.slot.who = null;
    if (a.type === "queue") { const i = S2.queue.indexOf(v); if (i >= 0) S2.queue.splice(i, 1); }
    v.box.style.clipPath = ""; v.shadow.style.opacity = ""; v.flip = false; v.root.style.display = ""; v.hidden = false;
    v.act = null; v.wait = rnd(0.5, 2);
    if (!quiet) { freeTarget(v); setAction(v, "idle"); }
  }
  function puff(x, y, name, o = {}) { // 장면 위 작은 입자 (장소 놀이용)
    if (!S2.layer) return;
    const d = el("div", "", "fxp " + (o.cls || "rise"));
    d.appendChild(name === "cloud" || name === "star" || name === "dust" || (D.fx && D.fx[FXART[name]]) ? fxArt(name) : art(name, o.col));
    const z = o.size || 10;
    d.style.cssText = `left:${x}px;top:${y}px;width:${z}px;height:${z}px;animation-duration:${o.life || 1}s;z-index:${o.z || 9500}`;
    if (o.filter) d.style.filter = o.filter;
    d.style.setProperty("--vx", (o.vx || 0) + "px"); d.style.setProperty("--vy", (o.vy || -40) + "px");
    S2.layer.appendChild(d); setTimeout(() => d.remove(), (o.life || 1) * 1000 + 60);
  }
  function throwBall(from, to, at) { // 눈덩이: 포물선으로 날아가 맞으면 퍽
    const b = el("div", "", "snowball"); S2.layer.appendChild(b);
    if (D.fx && D.fx.fx_snowball) { b.classList.add("art"); b.appendChild(fxArt("snowball")); }
    S2.shots.push({ el: b, x0: at ? at.x : from.x + (to.x > from.x ? 1 : -1) * from.body * 0.3, y0: at ? at.y : from.y - from.body * 0.7, to, t: 0, dur: 0.75 });
  }
  function growProp(el2, k) { if (el2) el2.style.transform = `scale(${(0.55 + 0.6 * k).toFixed(3)})`; }
  function playScene(dt) {
    if (!S2.layer) return;
    const P = S2.place;
    if (P === "camp" && S2.fire && Math.random() < dt * 4) puff(S2.fire.x + rnd(-8, 8), S2.fire.y - 20, "ember", { size: rnd(4, 7), vy: -rnd(30, 60), vx: rnd(-10, 10), life: 1.2 });
    if (P === "snow" && Math.random() < dt * 6) puff(rnd(0, W), rnd(groundTop - 200, groundTop), "flake", { size: rnd(5, 9), vy: rnd(60, 140), vx: rnd(-15, 15), life: 2.5, cls: "fall" });
    for (const e of S2.flies) { // 나비
      e.ph += dt; const s = e.ph;
      e.x += Math.cos(s * 0.7 + e.k) * 40 * dt; e.y += Math.sin(s * 1.3 + e.k * 2) * 25 * dt;
      e.x = Math.min(W - 20, Math.max(20, e.x)); e.y = Math.min(floor().y1 - 40, Math.max(groundTop - 40, e.y));
      e.el.style.transform = `translate(${e.x.toFixed(1)}px,${(e.y - 30).toFixed(1)}px)` + (e.el.classList.contains("art") ? "" : ` scaleX(${(0.4 + 0.6 * Math.abs(Math.sin(s * 14))).toFixed(2)})`);
    }
    for (let i = S2.shots.length - 1; i >= 0; i--) { // 눈덩이
      const sh = S2.shots[i]; sh.t += dt;
      const p = Math.min(1, sh.t / sh.dur), tx = sh.to.x, ty = sh.to.y - sh.to.body * 0.55;
      const x = sh.x0 + (tx - sh.x0) * p, y = sh.y0 + (ty - sh.y0) * p - Math.sin(p * Math.PI) * 60;
      sh.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; sh.el.style.zIndex = 9400;
      if (p >= 1) { sh.el.remove(); S2.shots.splice(i, 1); puff(tx, ty, "cloud", { size: 22, vy: -8, life: 0.5, cls: "puff" }); if (!sh.to.act || sh.to.act.type !== "swim") sh.to.hop = 0.7; }
    }
    for (const k of ["castle", "snowman"]) { // 다 같이 지으면 점점 커지고, 다 지으면 다시
      const el2 = S2[k];
      if (!el2) continue;
      const builders = pets.filter((v) => v.act && v.act.type === "build" && v.act.phase === "do").length;
      if (el2._frames) { // v5 단계 그림: 0 → 1 → 2(완성), 완성되면 잠깐 두었다가 다시
        if (S2.hold[k] > 0) { S2.hold[k] -= dt; if (S2.hold[k] <= 0) { S2.grow[k] = 0; setStage(el2, 0); } continue; }
        S2.grow[k] = Math.min(1, S2.grow[k] + dt * 0.035 * builders);
        const st = S2.grow[k] >= 1 ? 2 : S2.grow[k] >= 0.5 ? 1 : 0;
        if (st !== el2._stage) { setStage(el2, st); el2.classList.remove("bump"); void el2.offsetWidth; el2.classList.add("bump"); puff(el2._x, el2._y - 20, k === "castle" ? "sand" : "flake", { size: 14, vy: -30, life: 0.6, cls: "puff" }); }
        if (st === 2) { S2.hold[k] = 8; for (const v of pets) if (v.act && v.act.type === "build") { v.hop = 1; setAction(v, "celebrate"); v.oneShot = true; } puff(el2._x, el2._y - 30, "star", { size: 20, vy: -40, life: 0.9 }); }
        continue;
      }
      S2.grow[k] = Math.min(1.05, S2.grow[k] + dt * 0.03 * builders);
      if (S2.grow[k] >= 1.05) { S2.grow[k] = 0; for (const v of pets) if (v.act && v.act.type === "build") { v.hop = 1; setAction(v, "celebrate"); v.oneShot = true; } puff(el2._x, el2._y - 30, "star", { size: 20, vy: -40, life: 0.9 }); }
      growProp(el2, S2.grow[k]);
    }
    if (P === "park") rideScene(dt);
  }
  /* 롤러코스터: 줄 → 3마리씩 탑승구로 들어가 사라짐 → 차가 길을 한 바퀴 → 다시 나옴 */
  function queueSpot(i) { const g = S2.gate; return { x: g._x + g._w * 0.7 + i * S2.B * 0.62, y: g._y + S2.B * 0.55 + (i % 2) * 5 }; }
  function rideScene(dt) {
    const R = S2.ride;
    if (!R) {
      const front = S2.queue.slice(0, 3).filter((v) => v.act && v.act.phase === "do");
      const head = S2.queue[0];
      if (head && head.act && head.act.phase === "do" && (front.length >= 3 || head.act.t > 6)) {
        S2.ride = { riders: front, phase: "board", t: 0 };
        for (const v of front) { v.act.phase = "board"; const i = S2.queue.indexOf(v); S2.queue.splice(i, 1); }
        if ($("#shop").hidden && $("#sheet").hidden) toast("🎢 Roller coaster!");
      }
      return;
    }
    R.t += dt;
    if (R.phase === "board" && R.riders.every((v) => v.hidden || !v.act)) {
      R.riders = R.riders.filter((v) => v.act);
      if (!R.riders.length) { S2.ride = null; return; }
      R.phase = "run"; R.t = 0; R.len = S2.track.getTotalLength(); R.dur = 7.5;
      if (PR("coaster_car_back") && PR("coaster_car_back").seats && S2.trackScale) { // v5 차: 뒤판 → 펫 3마리 → 앞판
        const Pb = PR("coaster_car_back"), cs = S2.trackScale, cw = Pb.w * cs, chh = Pb.h * cs;
        const car = el("div", `width:${cw}px;height:${chh}px;scale:1;transform-origin:${Pb.anchor[0] * cs}px ${Pb.anchor[1] * cs}px`, "car v5");
        const bk = propEl("coaster_car_back", cw); bk.style.cssText += ";position:absolute;left:0;top:0"; car.appendChild(bk);
        R.riders.forEach((v, i) => {
          const seat = Pb.seats[i] || Pb.seats[1], k = (50 * cs) / stageFit(v.p.stage).height, bv = buildBox(v.p, k);
          const holder = el("div", `position:absolute;left:${seat[0] * cs}px;top:${seat[1] * cs}px;width:0;height:0`); holder.appendChild(bv.box);
          if (bv.sprite && v.p.char.actions && v.p.char.actions.idle) { const ia = v.p.char.actions.happy || v.p.char.actions.idle; bv.sprite.style.backgroundImage = `url("${asset(ia.sheet)}")`; bv.sprite.style.backgroundSize = `${ia.frames * +bv.sprite.dataset.fw}px ${+bv.sprite.dataset.fh}px`; }
          car.appendChild(holder);
        });
        if (PR("coaster_car_front")) { const fr = propEl("coaster_car_front", cw); fr.style.cssText += ";position:absolute;left:0;top:0"; car.appendChild(fr); }
        car._ax = Pb.anchor[0] * cs; car._ay = Pb.anchor[1] * cs;
        S2.layer.appendChild(car); R.car = car;
        return;
      }
      const car = el("div", "", "car");
      if (PR("coaster_car_back")) { const bk = propEl("coaster_car_back", 110); bk.classList.add("cb"); car.appendChild(bk); }
      R.riders.forEach((v, i) => { // 자리마다 펫 모습 (아랫몸은 차에 가려짐)
        const k = 30 / (stageFit(v.p.stage).height + 6), bv = buildBox(v.p, k), seat = el("div", `left:${18 + i * 30}px`, "seat");
        const holder = el("div", `position:absolute;left:15px;top:${30}px;width:0;height:0`); holder.appendChild(bv.box); seat.appendChild(holder);
        if (bv.sprite && v.p.char.actions && v.p.char.actions.idle) { const ia = v.p.char.actions.happy || v.p.char.actions.idle; bv.sprite.style.backgroundImage = `url("${asset(ia.sheet)}")`; bv.sprite.style.backgroundSize = `${ia.frames * +bv.sprite.dataset.fw}px ${+bv.sprite.dataset.fh}px`; }
        car.appendChild(seat);
      });
      const front = el("div", "", "cf"); if (PR("coaster_car_front")) { front.classList.add("art"); front.appendChild(propEl("coaster_car_front", 110)); } car.appendChild(front);
      S2.layer.appendChild(car); R.car = car;
    } else if (R.phase === "run") {
      const p = Math.min(1, R.t / R.dur), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const L = e * R.len, pt = S2.track.getPointAtLength(L), pt2 = S2.track.getPointAtLength(Math.min(R.len, L + 2));
      let ang = Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * 180 / Math.PI, back = false;
      if (ang > 90) { ang -= 180; back = true; } else if (ang < -90) { ang += 180; back = true; } // 왼쪽으로 갈 땐 뒤집지 않고 좌우만
      ang = Math.max(-40, Math.min(40, ang));
      const ox = R.car._ax != null ? R.car._ax : 55, oy = R.car._ay != null ? R.car._ay : 34;
      R.car.style.transform = `translate(${(pt.x - ox).toFixed(1)}px,${(pt.y - oy).toFixed(1)}px) rotate(${ang.toFixed(1)}deg)${back ? " scaleX(-1)" : ""}`;
      if (S2.trackOneWay) R.car.style.opacity = p > 0.94 ? ((1 - p) / 0.06).toFixed(2) : p < 0.04 ? (p / 0.04).toFixed(2) : "1";
      if (Math.random() < dt * 3) puff(pt.x, pt.y - 30, "confetti", { col: COLS[Math.floor(rnd(0, 6))], size: 6, vy: 40, vx: rnd(-20, 20), life: 1 });
      if (p >= 1) { R.car.remove(); R.phase = "exit"; R.t = 0; }
    } else if (R.phase === "exit") {
      const g = S2.gate;
      R.riders.forEach((v, i) => { v.x = g._x + g._w * 0.3 + i * 12; v.y = g._y + S2.B * 0.4; v.rodeAt = performance.now(); endAct(v); v.hop = 1; });
      S2.ride = null;
    }
  }
  // 펫 한 마리의 장소 놀이. 처리했으면 {lift, rot, moving} 돌려줌, 아니면 null
  function actStep(v, dt) {
    const a = v.act;
    if (!a || v.sel || v.fx) return null;
    if (a.phase === "hidden") return { lift: 0 };
    a.t += dt;
    const B = v.body;
    let tx = a.tx, ty = a.ty, follow = false;
    if (a.type === "queue") {
      const i = S2.queue.indexOf(v);
      if (a.phase === "board") { tx = S2.gate._x; ty = S2.gate._y + 2; }
      else if (i >= 0) { const q = queueSpot(i); tx = q.x; ty = q.y; follow = true; }
    } else if (a.type === "chase") {
      const b = S2.flies[a.fly % Math.max(1, S2.flies.length)];
      if (b) { tx = b.x + B * 0.4; ty = Math.max(S2.F.y0 + B * 0.6, Math.min(S2.F.y1, b.y + B * 0.9)); follow = true; }
    } else if (a.type === "balloon") {
      if (!a.balloon) {
        a.balloon = el("div", `left:${B * 0.2}px;top:${-B * 1.75}px;width:${B * 0.32}px;height:${B * 0.58}px`, "balloon");
        if (PR("balloon")) {
          const Pb = PR("balloon"), url = `url("${asset(Pb.image)}")`, im = el("img", "width:100%;height:100%;display:block;image-rendering:pixelated"); im.src = asset(Pb.image); im.alt = "";
          const tint = el("u", `background:${a.col}`); tint.style.webkitMaskImage = url; tint.style.maskImage = url;
          a.balloon.classList.add("art"); a.balloon.append(im, tint);
        } else a.balloon.append(el("i", `background:${a.col}`), el("b"));
        v.lift.appendChild(a.balloon);
      }
      if (a.phase === "do" && a.t > rnd(2, 4)) { freeTarget(v); a.tx = v.tx; a.ty = v.ty; a.phase = "go"; a.t = 0; }
    }
    const dx = tx - v.x, dy = ty - v.y, d = Math.hypot(dx, dy);
    if (a.phase === "go" || a.phase === "board" || (follow && d > 6)) {
      if (d > 3) {
        const st = Math.min(d, 1.15 * v.speed * dt * K / 2);
        v.x += (dx / d) * st; v.y += (dy / d) * st;
        if (a.type === "chase" && Math.random() < dt * 0.5) v.hop = 1;
        return { moving: true, lift: Math.abs(Math.sin(v.t * 9)) * B * 0.025 };
      }
      if (a.phase === "board") { a.phase = "hidden"; v.hidden = true; v.root.style.display = "none"; return { lift: 0 }; }
      if (a.phase === "go") { a.phase = "do"; a.t = 0; onArrive(v, a); }
    }
    if (a.type !== "queue") { a.until -= dt; if (a.until <= 0) { endAct(v); return null; } }
    if (v.oneShot) return { lift: 0 };
    switch (a.type) {
      case "swim": {
        setAction(v, hasAct(v, "swim") ? "swim" : "idle");
        if (Math.random() < dt * 0.35) { a.tx = Math.min(S2.zone.x1 - B * 0.45, Math.max(S2.zone.x0 + B * 0.45, v.x + rnd(-B, B))); a.ty = Math.min(S2.zone.y1, Math.max(S2.zone.y0, v.y + rnd(-10, 10))); }
        const ddx = a.tx - v.x, ddy = a.ty - v.y, dd = Math.hypot(ddx, ddy);
        if (dd > 2) { const st = Math.min(dd, 0.5 * v.speed * dt * K / 2); v.x += (ddx / dd) * st; v.y += (ddy / dd) * st; }
        const side = Math.sin(v.t * 5 + a.i0) > 0 ? 1 : -1; // 팔 장구: 양옆 번갈아 물보라
        if (Math.random() < dt * 5) puff(v.x + side * B * rnd(0.35, 0.55), v.y - B * 0.42, "drop", { size: rnd(5, 8), vy: -rnd(14, 26), vx: side * rnd(4, 14), life: 0.5, cls: "puff" });
        return { lift: Math.sin(v.t * 2.2 + a.i0) * B * 0.025, rot: hasAct(v, "swim") ? 0 : Math.sin(v.t * 5 + a.i0) * 5 };
      }
      case "sit": {
        setAction(v, hasAct(v, "roast") ? "roast" : hasAct(v, "sit") ? "sit" : "idle");
        if (a.seat.v5 && hasAct(v, "roast")) return { lift: a.seat.h, rot: 0 };
        if (a.t > a.toast) { a.toast = a.t + rnd(6, 10); if (a.stick) { a.stick.classList.remove("mm"); void a.stick.offsetWidth; a.stick.classList.add("mm"); } if (hasAct(v, "eat")) { setAction(v, "eat"); v.oneShot = true; } else v.hop = 0.6; }
        return { lift: a.seat.v5 ? a.seat.h : a.seat.h * 0.55, rot: hasAct(v, "roast") ? 0 : Math.sin(v.t * 1.3) * 2 };
      }
      case "build": {
        setAction(v, hasAct(v, "build") ? "build" : "idle");
        if (Math.random() < dt * 2.5) {
          const beach = S2.place === "beach", nice = D.fx && D.fx[beach ? "fx_sand" : "fx_snowflake"];
          puff(v.x + (v.flip ? -1 : 1) * B * 0.35, v.y - 6, nice ? (beach ? "sand" : "flake") : beach ? "dust" : "cloud", { size: rnd(nice ? 12 : 10, nice ? 20 : 16), vy: -rnd(8, 18), life: 0.6, cls: "puff", filter: !nice && beach ? "sepia(.6) saturate(1.6)" : "" });
        }
        return { lift: 0, sy: hasAct(v, "build") ? 1 : 1 - 0.07 * Math.abs(Math.sin(v.t * 7)) };
      }
      case "splash":
        setAction(v, hasAct(v, "splash") ? "splash" : "idle");
        if (Math.random() < dt * (hasAct(v, "splash") ? 2 : 0.9)) { if (!hasAct(v, "splash")) v.hop = 1; if (D.fx && D.fx.fx_splash) puff(v.x + rnd(-B * 0.3, B * 0.3), v.y - B * 0.15, "splash", { size: rnd(18, 26), vy: -rnd(10, 24), life: 0.6, cls: "puff" }); for (let k = 0; k < 4; k++) puff(v.x + rnd(-B * 0.35, B * 0.35), v.y - B * rnd(0.1, 0.5), "drop", { size: rnd(5, 8), vy: -rnd(30, 60), vx: rnd(-25, 25), life: 0.7, cls: "puff" }); }
        return { lift: 0 };
      case "snowball": {
        setAction(v, "idle");
        a.cool -= dt;
        if (a.cool <= 0) {
          a.cool = rnd(1.6, 3.5);
          const foes = pets.filter((o) => o !== v && !o.hidden && !o.p.egg && (o.act && o.act.type === "snowball" ? 3 : 1) && Math.abs(o.x - v.x) > B * 0.8);
          const pool = foes.filter((o) => o.act && o.act.type === "snowball"); const tg = (pool.length ? pool : foes)[Math.floor(Math.random() * (pool.length || foes.length))];
          if (tg) {
            v.flip = tg.x < v.x;
            if (hasAct(v, "throw")) { // 던지는 그림: 놓는 순간 손에서 눈덩이가 나감
              setAction(v, "throw"); v.oneShot = true;
              const A = v.actions.throw, hand = A.points && A.points[A.releaseFrame != null ? A.releaseFrame : 3] && A.points[A.releaseFrame != null ? A.releaseFrame : 3].hand;
              setTimeout(() => { if (!S2.layer || v.act !== a) return; const from = hand ? { x: v.x + (v.flip ? -1 : 1) * (hand[0] - 144) * v.cpx, y: v.y + cellY(v, hand[1]) } : null; throwBall(v, tg, from); }, A.releaseTimeMs || 320);
            } else { v.hop = 0.5; throwBall(v, tg); }
          }
        }
        return { lift: 0 };
      }
      case "queue": setAction(v, "idle"); return { lift: 0, rot: Math.sin(v.t * 3) * 2 };
      case "chase": return { lift: 0 };
      case "balloon": return { lift: 0 };
    }
    return { lift: 0 };
  }
  function onArrive(v, a) {
    const B = v.body;
    a.i0 = rnd(0, 6);
    if (a.type === "swim" && hasAct(v, "swim") && PR("swimring_back") && PR("swimring_front") && v.cpx) {
      // v5: 튜브 뒤판 → 펫 → 튜브 앞판. 그림은 수면선 아래가 이미 투명, 목 장식도 수면선에서 자름
      const wl = cellY(v, WATERLINE[bodyH(v)] || 200), boxH = parseFloat(v.box.style.height), foot = -parseFloat(v.box.style.top);
      v.box.style.clipPath = `inset(0 0 ${(boxH - (foot + wl)).toFixed(1)}px 0)`;
      v.shadow.style.opacity = "0";
      const rw = 128 * v.cpx * (bodyH(v) / 140) * 1.05;
      const mk = (name) => { const r = propEl(name, rw, "ring art"); r.style.left = `${-r._ax}px`; r.style.top = `${wl - r._ay}px`; return r; };
      a.ringB = mk("swimring_back"); a.ringF = mk("swimring_front");
      a.ringB.style.zIndex = "0"; a.ringF.style.zIndex = "3"; // 뒤판은 펫 뒤, 앞판은 펫 앞 (.ring 기본 z-index 때문에 둘 다 앞에 그려지던 문제)
      v.lift.insertBefore(a.ringB, v.box); v.lift.appendChild(a.ringF);
      a.ripple = el("div", `left:${-rw * 0.6}px;top:${wl - 4}px;width:${rw * 1.2}px;height:${rw * 0.3}px`, "ripple");
      v.root.insertBefore(a.ripple, v.lift);
    } else if (a.type === "swim") { // 튜브 안에 쏙: 튜브 뒤쪽 → 펫 → 튜브 앞쪽, 아랫몸은 물속
      const depth = B * (hasAct(v, "swim") ? 0.45 : 0.4), boxH = parseFloat(v.box.style.height), foot = -parseFloat(v.box.style.top);
      const rw = B * 1.1, rh = PR("swimring") ? rw * 48 / 128 : rw * 0.34;
      v.box.style.clipPath = `inset(0 0 ${(boxH - (foot - depth + rh * 0.18)).toFixed(1)}px 0)`;
      v.shadow.style.opacity = "0";
      const mk = (half) => {
        const r = PR("swimring") ? propEl("swimring", rw, "ring art") : el("div", `width:${rw}px;height:${rh}px`, "ring");
        r.style.left = `${-rw / 2}px`; r.style.top = `${-depth - rh / 2}px`;
        r.style.clipPath = half === "back" ? "inset(0 0 50% 0)" : "inset(50% 0 0 0)";
        return r;
      };
      a.ringB = mk("back"); a.ringF = mk("front");
      a.ringB.style.zIndex = "0"; a.ringF.style.zIndex = "3"; // 뒤판은 펫 뒤, 앞판은 펫 앞 (.ring 기본 z-index 때문에 둘 다 앞에 그려지던 문제)
      v.lift.insertBefore(a.ringB, v.box); v.lift.appendChild(a.ringF);
      a.ripple = el("div", `left:${-rw * 0.6}px;top:${-depth - 4}px;width:${rw * 1.2}px;height:${rw * 0.3}px`, "ripple");
      v.root.insertBefore(a.ripple, v.lift);
    } else if (a.type === "sit") {
      v.flip = a.seat.x > S2.fire.x; // 화로 쪽을 보고
      a.toast = rnd(5, 8);
      if (!hasAct(v, "roast")) { // 마시멜로 꼬치 (그림이 오면 동작 그림에 포함)
        a.stick = el("div", `left:${B * 0.12}px;top:${-B * 0.62}px;width:${B * 0.62}px;height:${B * 0.3}px`, "stick mm");
        a.stick.append(el("i"), el("b")); v.lift.appendChild(a.stick);
      }
    } else if (a.type === "build") {
      const c = S2.place === "beach" ? S2.castle : S2.snowman;
      v.flip = c && v.x > c._x;
    } else if (a.type === "splash") v.flip = Math.random() < 0.5;
  }
  /* ---------------------------------------------------------- 시작 */
  async function load(first) {
    const slug = Q.get("c") || "", k = new URLSearchParams(location.hash.slice(1)).get("k") || "";
    let data;
    if (LOCAL) {
      try {
        const r = await fetch(`/api/classes/${encodeURIComponent(LOCAL)}/petland`, { cache: "no-store" });
        data = (await r.json()).data;
        if (!data) throw new Error("x");
      } catch (e) { if (first) msg("클래스펫츠 앱이 켜져 있는지 확인해 주세요."); return; }
    } else try {
      if (!/^[\w-]{4,40}$/.test(slug) || !/^[\w-]{10,60}$/.test(k)) { msg("QR 코드를 다시 찍어 주세요. 주소가 잘렸어요."); return; }
      if (!(window.crypto && crypto.subtle)) { msg("이 브라우저에서는 열 수 없어요. 다른 브라우저로 열어 주세요."); return; }
      const r = await fetch(`c/${slug}.json?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 404 ? "gone" : "net");
      data = await decrypt(await r.json(), b64url(k));
    } catch (e) {
      if (first) msg(e.message === "key" || e.message === "gone" ? "QR 코드가 바뀌었어요. 선생님께 새 QR을 받아 주세요." : "인터넷 연결을 확인하고 다시 열어 주세요.");
      return;
    }
    D = data;
    $("#cls").textContent = `${D.class} 펫나라`;
    document.title = `${D.class} 펫나라`;
    $("#upd").textContent = LOCAL ? `${D.pets.length}마리` : `${D.updated.slice(5).replace("-", "/")} 업데이트 · ${D.pets.length}마리`;
    let want = Q.get("place") || (D.team && D.team.place) || "meadow";
    if (!LOCAL && first) { try { want = localStorage.getItem(placeKey()) || want; } catch (e) { /* 없음 */ } }
    if (!first && curPlace) want = curPlace;
    renderTeam();
    goPlace(want, false);
    const hi = $("#hIcon"); hi.textContent = "";
    if (D.icons && D.icons.heart) { const im = el("img"); im.src = asset(D.icons.heart); im.alt = ""; hi.appendChild(im); } else hi.textContent = "♥";
    layout();
    closeSheet();
    pets.length = 0; $("#pets").textContent = "";
    order = D.pets.map((_, i) => i).sort(() => Math.random() - 0.5);
    D.pets.forEach(makePet);
    placeStore();
    setupPlay(curPlace);
    msg(D.pets.length ? "" : "아직 펫이 없어요.");
    $("#hint").hidden = !D.pets.length || !$("#shop").hidden;
    if (first) setTimeout(() => { $("#hint").hidden = true; }, 7000);
    if (first) requestAnimationFrame(frame);
  }
  window.addEventListener("hashchange", () => location.reload());
  window.addEventListener("resize", () => { if (!D) return; layout(); if (storeEl) { storeEl.remove(); placeStore(); } setupPlay(curPlace); for (const v of pets) { const b = bounds(v); v.x = Math.min(Math.max(v.x, b.x0), b.x1); v.y = Math.min(Math.max(v.y, b.y0), b.y1); target(v); } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && D) load(false); }); // 다시 볼 때 새 모습으로
  load(true);
})();
