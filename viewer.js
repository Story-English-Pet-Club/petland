/* 펫나라 — 보기 전용. QR 주소의 #k=열쇠로 반 데이터를 풀어서 펫들이 돌아다니는 모습을 보여 줌.
   입력·로그인·기록 수집 없음. 열쇠는 '#' 뒤에 있어 서버로 전송되지 않음. */
"use strict";
(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const el = (tag, css, cls) => { const e = document.createElement(tag); if (css) e.style.cssText = css; if (cls) e.className = cls; return e; };
  const Q = new URLSearchParams(location.search);
  const LOCAL = Q.get("local"); // 교실 화면에서 열 때: 이 컴퓨터의 교실펫 서버에서 바로 읽음
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

  /* ---------------------------------------------------------- 펫 그림 (교실펫 앱과 같은 규칙) */
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

  /* ---------------------------------------------------------- 재주 (교실펫 앱과 같은 움직임, 이 휴대폰에서만 보임) */
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
  const FXART = { heart: "fx_heart", star: "fx_star", note: "fx_note1", dust: "fx_dust", cloud: "fx_cloud", bark: "fx_bark", broom: "fx_broom" };
  function fxArt(name) {
    const ref = D.fx && D.fx[FXART[name]];
    if (ref) { const im = el("img"); im.src = asset(ref); im.alt = ""; return im; }
    const [vb, fill, stroke, d] = PIX[name], svg = document.createElementNS(SVGNS, "svg"), path = document.createElementNS(SVGNS, "path");
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
      case "flip": o.lift = Math.sin(Math.PI * p) * B * 0.9; o.rot = 360 * (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p)); o.pivot = B / 2; break;
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
        emit(0.45, () => particle(v, "note", { x: rnd(-B * 0.5, B * 0.5), y: B * 0.8, vx: rnd(-20, 20), vy: -60, life: 1.1, size: 14 }));
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
    tap.addEventListener("click", () => openSheet(v));
    pets.push(v);
  }
  function step(v, dt) {
    v.t += dt;
    let moving = false;
    if (!v.oneShot && !v.sel && !v.fx) {
      if (v.p.egg) { v.wait -= dt; if (v.wait <= 0) { v.wait = rnd(4, 9); v.hop = 1; } }
      else if (v.wait > 0) v.wait -= dt;
      else {
        const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
        if (d < 3) { v.wait = rnd(1.5, 5); target(v); if (Math.random() < 0.3) { v.oneShot = setAction(v, "jump"); if (!v.oneShot) v.hop = 1; } }
        else { const s = Math.min(d, v.speed * dt * K / 2); v.x += (dx / d) * s; v.y += (dy / d) * s; moving = true; }
      }
    }
    if (moving !== v.moving) { v.moving = moving; if (!v.oneShot && !v.fx) setAction(v, moving ? "walk" : "idle"); }
    let lift = 0, rot = 0, ox = 0, pivot = 0, sx = 1, sy = 1;
    if (moving) lift = Math.abs(Math.sin(v.t * 9)) * v.body * 0.025;
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
    v.lift.style.transform = `translateY(${(-lift - pivot).toFixed(1)}px) rotate(${rot.toFixed(1)}deg) translateY(${pivot.toFixed(1)}px) scale(${sx.toFixed(3)},${sy.toFixed(3)})`;
    tick(v, dt);
  }
  let last = performance.now();
  function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; for (const v of pets) step(v, dt); requestAnimationFrame(frame); }

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
    const w = Math.round(Math.min(130, Math.max(84, W * 0.26))), h = Math.round(w * 30 / 32);
    const root = el("div", "", "store"), btn = el("button", `left:${-w / 2}px;top:${-h}px;width:${w}px;height:${h}px`), tag = el("span", "", "tag");
    btn.setAttribute("aria-label", "Pet Shop"); btn.className = "bob"; btn.appendChild(storeSvg());
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
    for (const it of items) {
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
      if (changed) { for (const v of pets) { target(v); v.wait = rnd(0, 0.6); } toast(p ? `Welcome to the ${p.name}!` : ""); }
      if (LOCAL) fetch(`/api/classes/${encodeURIComponent(LOCAL)}/place`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ place_id: id }) }).catch(() => {});
    }
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
      } catch (e) { if (first) msg("교실펫 앱이 켜져 있는지 확인해 주세요."); return; }
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
    msg(D.pets.length ? "" : "아직 펫이 없어요.");
    $("#hint").hidden = !D.pets.length || !$("#shop").hidden;
    if (first) setTimeout(() => { $("#hint").hidden = true; }, 7000);
    if (first) requestAnimationFrame(frame);
  }
  window.addEventListener("hashchange", () => location.reload());
  window.addEventListener("resize", () => { if (!D) return; layout(); if (storeEl) { storeEl.remove(); placeStore(); } for (const v of pets) { const b = bounds(v); v.x = Math.min(Math.max(v.x, b.x0), b.x1); v.y = Math.min(Math.max(v.y, b.y0), b.y1); target(v); } });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && D) load(false); }); // 다시 볼 때 새 모습으로
  load(true);
})();
