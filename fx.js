/* 클래스펫츠 재주(기술) 공통 움직임 — PPT 위 펫 · 펫나라 · 키오스크가 함께 씀
   쓰는 쪽은 펫마다 '어댑터' a 를 넘김:
     a.body   펫 몸 높이(px)
     a.root   파티클을 붙일 곳 (기준점 = 발 밑 가운데, 위가 -y)
     a.lift   펫 그림 층 (필터·투명도·복제에 씀)
     a.shadow 그림자 (없어도 됨), a.shadowBase = 그림자 기본 transform
     a.art(name) → 파티클 그림 노드 (heart, star, note, note2, dust, cloud, bark, broom, swirl, ember, confetti, …)
     a.act(name) → 펫 그림 동작 바꾸기 (walk, idle, happy, jump …)
     a.src(key) → fx 그림 주소 (fx_magic_circle, fx_firework_1 … 없으면 ""; 없으면 앱이 그리는 모양으로 대신)
     a.say(text, sec) → 말풍선 (없어도 됨),  a.pitch() → 목소리 높이 (없으면 1),  a.maxUp() → 머리 위로 올라갈 수 있는 px (좁은 방이면)
   start(a, id) → 상태 f,  step(a, f, dt) → {lift, ox, rot, pivot, sx, sy} (끝나면 null) */
"use strict";
(function () {
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---------------- 펫 목소리: 녹음 없이 브라우저가 그 자리에서 만드는 '꾸꾸' 소리 (Web Audio) ----------------
     a.pitch() → 목소리 높이 배율 (아기 1.25, 어른 1, 다 자란 0.9 쯤). 소리 끄기: localStorage "cp.sound" = "off" */
  let AC = null, OUT = null; // OUT = 렌더링(미리 듣기 파일 만들기)용으로 바꿔 끼울 수 있는 출력
  function ac() {
    if (OUT) return OUT;
    try { if (localStorage.getItem("cp.sound") === "off") return null; } catch (e) { /* 저장소 없음 */ }
    if (!AC) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = new C(); }
    if (AC.state === "suspended") AC.resume();
    return AC;
  }
  /* 기니피그 '뀌익' 한 번: 톱니파를 목소리처럼 걸러서, 높이가 쭉 올라갔다가 끝에 살짝 꺾임 + 까끌한 떨림
     f0 = 시작 높이, f1 = 가장 높은 곳, d = 길이(초), when = 몇 초 뒤 */
  function squeal(f0, f1, d, when = 0, vol = 0.16, rasp = 1, smooth = false) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + 0.02 + when;
    const o = c.createOscillator(), o2 = c.createOscillator(), bp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain(), am = c.createGain();
    const trem = c.createOscillator(), tg = c.createGain();
    o.type = smooth ? "triangle" : "sawtooth"; o2.type = "sine";
    const fr = (osc, k) => {
      osc.frequency.setValueAtTime(f0 * k, t);
      osc.frequency.exponentialRampToValueAtTime(f1 * k, t + d * 0.72);
      osc.frequency.exponentialRampToValueAtTime(f1 * 0.9 * k, t + d);
    };
    fr(o, 1); fr(o2, 1);
    bp.type = "bandpass"; bp.frequency.value = Math.min(4200, f1 * 1.6); bp.Q.value = 1.1;
    lp.type = "lowpass"; lp.frequency.value = 5200;
    trem.type = smooth ? "sine" : "square"; trem.frequency.value = smooth ? 34 : 52; tg.gain.value = 0.22 * rasp; // 까끌까끌한 기니피그 목소리 (smooth = 부드럽게)
    am.gain.value = 0.78; trem.connect(tg); tg.connect(am.gain);
    const g2 = c.createGain(); g2.gain.value = 0.55;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(bp); bp.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(am); am.connect(g); g.connect(c.destination);
    for (const x of [o, o2, trem]) { x.start(t); x.stop(t + d + 0.05); }
  }
  const SONGS = [[0, 2, 4, 0, 4, 7, 4, 2], [7, 4, 7, 9, 7, 4, 2, 0], [0, 4, 7, 12, 9, 7, 4, 7], [4, 4, 7, 4, 2, 0, 2, 4]];
  const voice = {
    wheek(p = 1) { // 뀌익 뀌익 뀌이익~ (점점 높게)
      squeal(900 * p, 1700 * p, 0.2, 0); squeal(950 * p, 1850 * p, 0.2, 0.27); squeal(1000 * p, 2100 * p, 0.42, 0.54);
      return 1;
    },
    sing(p = 1) { // 뀌익 소리로 부르는 노래 한 소절 (8음)
      const song = SONGS[(Math.random() * SONGS.length) | 0], base = 1046 * p;
      song.forEach((n, i) => { const f = base * Math.pow(2, n / 12), last = i === song.length - 1; squeal(f * 0.78, f, last ? 0.42 : 0.2, i * 0.3, 0.14, 0.8); });
      return song.length * 0.3 + 0.3;
    },
    talk(p = 1, n = 8) { // 쫑알쫑알: 짧은 '뀍'을 말하듯 높낮이를 바꿔 가며 (말끝은 살짝 올림)
      let at = 0;
      const base = rnd(1150, 1350) * p;
      for (let i = 0; i < n; i++) {
        const last = i === n - 1, f = base * rnd(0.88, 1.18) * (last ? 1.15 : 1), d = last ? rnd(0.2, 0.26) : rnd(0.08, 0.14);
        squeal(f * 0.82, f * (last ? 1.35 : rnd(1.05, 1.25)), d, at, 0.13, 0.35, true);
        at += d + (i % 3 === 2 ? rnd(0.12, 0.18) : rnd(0.03, 0.07)); // 세 마디마다 잠깐 쉼
      }
      return at;
    },
    happy(p = 1) { squeal(1000 * p, 1900 * p, 0.18); squeal(1100 * p, 2100 * p, 0.2, 0.22); }, // 뀌익 뀌익!
    woof(p = 1) { squeal(800 * p, 1300 * p, 0.12, 0, 0.17, 1.4); squeal(820 * p, 1350 * p, 0.12, 0.2, 0.17, 1.4); },
    _out(ctx) { OUT = ctx; }, // 미리 듣기 파일 만들 때만 씀
  };
  const DUR = { hearts: 1.8, zoomies: 2.4, flip: 1.1, bark: 1.4, clean: 2.4, dance1: 2.6, dance2: 2.2, dance3: 2.6, float: 3.2, sparkle: 2.4,
    rainbow: 2.6, sing: 2.9, talk: 5.2, fireworks: 2.8, magic: 3, poof: 1.8, clone: 2.6, rocket: 2.4, giant: 2.6, bubbles: 2.8 };
  // 새 재주 (펫나라·키오스크 버튼 이름)
  const NEW = [
    { id: "sing", name: "노래하기", name_en: "Sing a Song" },
    { id: "talk", name: "수다쟁이", name_en: "Chatter" },
    { id: "rainbow", name: "무지개 달리기", name_en: "Rainbow Dash" },
    { id: "bubbles", name: "비눗방울", name_en: "Bubbles" },
    { id: "poof", name: "순간이동", name_en: "Teleport" },
    { id: "giant", name: "커졌다 작아졌다", name_en: "Big & Small" },
    { id: "rocket", name: "로켓 점프", name_en: "Rocket Jump" },
    { id: "clone", name: "분신술", name_en: "Clone Party" },
    { id: "magic", name: "마법 주문", name_en: "Magic Spell" },
    { id: "fireworks", name: "불꽃놀이", name_en: "Fireworks" },
  ];
  const TALK = ["Hi!", "Hello!", "I love you!", "Yay!", "Let's play!", "Yummy!", "You're the best!", "Good job!", "Thank you!", "I'm happy!", "Kku kku~", "La la la~"];
  const BUBBLE = ["#FFFFFF", "#CFF4FF", "#FFE0F4", "#E8E0FF"];
  const FIRE = [0, 40, 160, 200, 280, 320]; // 불꽃 색 (hue-rotate 도)

  function node(a, name) { const n = a.art(name); return n; }
  // 파티클: name = 그림 이름 또는 {el: 직접 만든 노드}
  function particle(a, name, { x = 0, y = 0, vx = 0, vy = -60, life = 1.2, size = 14, h = 0, cls = "rise", hue = null, delay = 0, under = false, flip = false } = {}) {
    const d = document.createElement("div");
    d.className = "fxp " + cls;
    d.appendChild(typeof name === "string" ? node(a, name) : name.el);
    d.style.left = x + "px"; d.style.top = -y + "px"; d.style.width = size + "px"; d.style.height = (h || size) + "px";
    if (flip) d.firstChild.style.transform = "scaleX(-1)";
    d.style.animationDuration = life + "s";
    if (delay) d.style.animationDelay = delay + "s";
    d.style.setProperty("--vx", vx + "px"); d.style.setProperty("--vy", vy + "px");
    if (hue != null) d.style.filter = `hue-rotate(${hue}deg) saturate(1.4)`;
    if (under) a.root.insertBefore(d, a.root.firstChild); else a.root.appendChild(d); // under = 펫 뒤에
    setTimeout(() => d.remove(), (life + delay) * 1000 + 60);
    return d;
  }
  const div = (cls) => { const d = document.createElement("div"); d.className = cls; return d; };
  const src = (a, key) => (a.src && a.src(key)) || "";
  const has = (a, ...keys) => keys.every((k) => src(a, k));
  function pic(a, key) { const im = document.createElement("img"); im.src = src(a, key); im.alt = ""; im.className = "fxi"; return im; }
  // 여러 장 그림을 차례로 (ms = 각 장 시간)
  function anim(a, keys, ms) {
    const im = pic(a, keys[0]); let i = 0;
    const next = () => { i++; if (i >= keys.length || !im.isConnected && i > 1) return; im.src = src(a, keys[i]); setTimeout(next, ms[i] || 120); };
    setTimeout(next, ms[0] || 120);
    return im;
  }
  const preloaded = new Set();
  function preload(a, keys) { for (const k of keys) { const u = src(a, k); if (u && !preloaded.has(u)) { preloaded.add(u); const i = new Image(); i.src = u; } } }
  const FW = ["fx_firework_1", "fx_firework_2", "fx_firework_3", "fx_firework_4"], POOF = ["fx_poof_1", "fx_poof_2", "fx_poof_3"], FLAME = ["fx_rocket_flame_1", "fx_rocket_flame_2", "fx_rocket_flame_3"];

  function start(a, id) {
    const f = { type: id, t: 0, dur: DUR[id] || 2, emit: 0, extra: [] };
    a.act(id === "talk" ? "idle" : id === "zoomies" || id === "rainbow" ? "walk" : id === "float" || id === "sparkle" || id === "magic" ? "idle" : id === "rocket" ? "jump" : "happy");
    const B = a.body;
    preload(a, { fireworks: FW, poof: POOF, rocket: FLAME, bubbles: ["fx_bubble_1", "fx_bubble_2"], magic: ["fx_magic_circle"], rainbow: ["fx_rainbow_trail"], clone: ["fx_clone_flash"], giant: ["fx_grow_sparkle"] }[id] || []);
    if (id === "hearts") for (let i = 0; i < 6; i++) setTimeout(() => particle(a, "heart", { x: rnd(-B * 0.3, B * 0.3), y: B * rnd(0.5, 0.9), vx: rnd(-30, 30), vy: -rnd(60, 110), life: 1.4, size: rnd(12, 20) }), i * 160);
    const P = (a.pitch && a.pitch()) || 1;
    if (id === "bark") { if (a.say) a.say("Woof! Woof!"); voice.woof(P); }
    if (id === "sing") voice.sing(P);
    if (id === "hearts") voice.wheek(P);
    if (id === "magic") { // 발밑 마법진
      const ring = div("fxring"); ring.style.width = B * 1.5 + "px"; ring.style.height = B * 1.5 + "px"; // 동그라미를 눕혀서(CSS) 바닥에 깔린 것처럼
      if (has(a, "fx_magic_circle")) { const im = pic(a, "fx_magic_circle"); im.classList.add("spin"); ring.appendChild(im); ring.classList.add("art"); }
      else { ring.appendChild(div("r1")); ring.appendChild(div("r2")); }
      a.root.insertBefore(ring, a.root.firstChild); f.extra.push(ring);
    }
    if (id === "rocket" && has(a, ...FLAME)) { // 발밑 불꽃 (올라가는 동안만 보임)
      const fl = div("fxflame"); fl.appendChild(pic(a, FLAME[0])); fl.style.width = B * 0.42 + "px"; fl.style.height = B * 0.63 + "px";
      a.root.insertBefore(fl, a.lift); f.extra.push(fl); f.flame = fl;
    }
    if (id === "clone") { // 분신: 지금 모습을 2개 복사해 양옆으로
      for (const s of [-1, 1]) {
        const c = a.lift.cloneNode(true); c.classList.add("fxclone"); c.removeAttribute("id");
        for (const n of c.querySelectorAll("[id]")) n.removeAttribute("id");
        a.lift.parentNode.insertBefore(c, a.lift); f.extra.push(c); c._side = s;
      }
    }
    return f;
  }
  function end(a, f) {
    a.lift.style.filter = ""; a.lift.style.opacity = "";
    if (a.shadow) { a.shadow.style.transform = a.shadowBase || ""; a.shadow.style.opacity = ""; }
    for (const e of f.extra) e.remove();
    a.act("idle");
  }
  function step(a, f, dt) {
    const B = a.body, t = f.t;
    f.t += dt; f.emit -= dt;
    const p = Math.min(1, f.t / f.dur);
    if (f.t >= f.dur) { end(a, f); return null; }
    const o = {}, emit = (every, fn) => { if (f.emit <= 0) { f.emit = every; fn(); } };
    const once = (key, at, fn) => { if (!f[key] && f.t >= at) { f[key] = 1; fn(); } };
    const shadow = (sc, op) => { if (a.shadow) { a.shadow.style.transform = `${a.shadowBase || ""} scale(${sc.toFixed(2)})`; a.shadow.style.opacity = op == null ? "" : op; } };
    switch (f.type) {
      case "hearts": o.lift = Math.sin(Math.PI * Math.min(1, p * 2)) * B * 0.1; break;
      case "zoomies":
        o.ox = Math.sin(p * Math.PI * 4) * B * 1.4; o.lift = Math.abs(Math.sin(t * 20)) * B * 0.07;
        emit(0.1, () => particle(a, "dust", { x: o.ox - Math.sign(Math.cos(p * Math.PI * 4)) * B * 0.3, y: 4, vy: -10, life: 0.6, size: 14, cls: "puff" }));
        break;
      case "flip":
        o.lift = Math.sin(Math.PI * p) * B * 0.9; o.rot = 360 * (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p)); o.pivot = B / 2;
        emit(0.25, () => particle(a, "swirl", { x: rnd(-B * 0.4, B * 0.4), y: o.lift + B * 0.5, vy: -10, life: 0.6, size: 22, cls: "puff" }));
        break;
      case "bark":
        o.lift = Math.abs(Math.sin(p * Math.PI * 4)) * B * 0.08; o.sy = 1 + Math.sin(p * Math.PI * 8) * 0.05; o.sx = 2 - o.sy;
        emit(0.35, () => particle(a, "bark", { x: B * 0.35, y: B * 0.75, vx: 20, vy: -20, life: 0.5, size: 18, cls: "puff" }));
        break;
      case "clean":
        o.ox = Math.sin(p * Math.PI * 6) * B * 0.15; o.rot = Math.sin(p * Math.PI * 6) * 6;
        emit(0.18, () => particle(a, Math.random() < 0.5 ? "dust" : "star", { x: rnd(-B * 0.6, B * 0.6), y: rnd(2, 10), vx: rnd(-20, 20), vy: -rnd(10, 40), life: 0.8, size: rnd(10, 14), cls: "puff" }));
        once("broom", 0, () => particle(a, "broom", { x: B * 0.45, y: B * 0.3, vy: 0, life: f.dur, size: 22, cls: "sweep" }));
        break;
      case "dance1":
        o.rot = Math.sin(t * 8) * 12; o.lift = Math.abs(Math.sin(t * 8)) * B * 0.06;
        emit(0.4, () => particle(a, "note", { x: rnd(-B * 0.5, B * 0.5), y: B * 0.8, vx: rnd(-20, 20), vy: -60, life: 1.1, size: 14 }));
        break;
      case "dance2":
        o.sx = Math.cos(p * Math.PI * 6); if (Math.abs(o.sx) < 0.08) o.sx = 0.08 * Math.sign(o.sx || 1);
        o.lift = Math.abs(Math.sin(p * Math.PI * 6)) * B * 0.1;
        emit(0.45, () => particle(a, Math.random() < 0.5 ? "note2" : "note", { x: rnd(-B * 0.5, B * 0.5), y: B * 0.8, vx: rnd(-20, 20), vy: -60, life: 1.1, size: 14 }));
        break;
      case "dance3":
        o.sy = 1 + Math.sin(t * 12) * 0.12; o.sx = 2 - o.sy; o.ox = Math.sin(t * 4) * B * 0.2; o.lift = Math.max(0, Math.sin(t * 12)) * B * 0.12;
        emit(0.3, () => particle(a, Math.random() < 0.5 ? "note" : "star", { x: rnd(-B * 0.6, B * 0.6), y: B * 0.7, vx: rnd(-30, 30), vy: -70, life: 1, size: 14 }));
        break;
      case "float": {
        const up = Math.min(1, p * 4) * (p > 0.8 ? (1 - p) / 0.2 : 1);
        o.lift = up * B * 0.45 + Math.sin(t * 3) * 5 * up;
        shadow(1 - up * 0.4);
        emit(0.5, () => particle(a, "cloud", { x: rnd(-B * 0.5, B * 0.5), y: o.lift * 0.4, vx: rnd(-15, 15), vy: -15, life: 1.2, size: 20, cls: "puff" }));
        break;
      }
      case "sparkle": {
        const g = 0.5 + 0.5 * Math.sin(t * 10);
        a.lift.style.filter = `drop-shadow(0 0 ${(4 + g * 8).toFixed(1)}px rgba(255,240,150,.95))`;
        o.lift = Math.sin(Math.PI * Math.min(1, p * 2)) * B * 0.05;
        emit(0.15, () => particle(a, "star", { x: rnd(-B * 0.6, B * 0.6), y: rnd(B * 0.1, B * 1.1), vy: -10, life: 0.7, size: rnd(10, 16), cls: "twinkle" }));
        break;
      }
      case "sing": { // 몸을 흔들며 노래, 음표가 둥실둥실
        o.rot = Math.sin(t * 5.6) * 9; o.lift = Math.abs(Math.sin(t * 5.6)) * B * 0.05;
        o.sy = 1 + Math.sin(t * 11.2) * 0.03; o.sx = 2 - o.sy;
        emit(0.28, () => particle(a, Math.random() < 0.5 ? "note" : "note2", { x: rnd(-B * 0.2, B * 0.5), y: B * 0.85, vx: rnd(10, 40), vy: -rnd(60, 90), life: 1.2, size: rnd(14, 20) }));
        break;
      }
      case "talk": { // 말풍선을 바꿔 가며 옹알옹알
        o.lift = Math.abs(Math.sin(t * 14)) * B * 0.025; o.sy = 1 + Math.sin(t * 18) * 0.025; o.sx = 2 - o.sy;
        const P = (a.pitch && a.pitch()) || 1;
        for (const [k, at] of [["w1", 0.05], ["w2", 1.75], ["w3", 3.45]]) once(k, at, () => {
          const w = TALK[(Math.random() * TALK.length) | 0];
          if (a.say) a.say(w, 1.6); voice.talk(P, 7 + ((Math.random() * 3) | 0));
        });
        break;
      }
      /* ---------------- 새 재주 ---------------- */
      case "rainbow": { // 좌우로 달리며 무지개 꼬리
        o.ox = Math.sin(p * Math.PI * 4) * B * 1.5; o.lift = Math.abs(Math.sin(t * 18)) * B * 0.08;
        if (has(a, "fx_rainbow_trail")) {
          const dir = Math.cos(p * Math.PI * 4) >= 0 ? 1 : -1; // 오른쪽으로 갈 때 +1
          emit(0.08, () => particle(a, { el: pic(a, "fx_rainbow_trail") }, { x: o.ox - dir * B * 0.55, y: B * 0.4 + o.lift * 0.5, vy: 0, life: 0.55, size: B * 1.1, h: B * 0.55, cls: "trail", under: true, flip: dir > 0 }));
        } else emit(0.035, () => { const s = div("rb"); particle(a, { el: s }, { x: o.ox, y: B * 0.35 + o.lift * 0.5, vy: 0, life: 0.7, size: B * 0.34, cls: "trail", under: true }); });
        if (Math.random() < 0.25) particle(a, "star", { x: o.ox + rnd(-B * 0.3, B * 0.3), y: rnd(B * 0.2, B * 0.8), vy: -20, life: 0.6, size: rnd(8, 13), cls: "twinkle" });
        break;
      }
      case "fireworks": { // 펑! 펑! 펑! 머리 위에서 터지는 불꽃
        o.lift = Math.abs(Math.sin(t * 6)) * B * 0.06;
        for (const [k, at] of [["f1", 0.25], ["f2", 1.0], ["f3", 1.75]]) once(k, at, () => {
          const cx = rnd(-B * 0.9, B * 0.9), cy = B * rnd(1.4, 1.9), hue = FIRE[(Math.random() * FIRE.length) | 0], n = 14;
          particle(a, "star", { x: cx, y: B * 0.3, vy: -(cy - B * 0.3), life: 0.35, size: 10, cls: "shoot" });
          if (has(a, ...FW)) { // 불꽃 그림 4장: 빛 점 → 퍼짐 → 활짝 → 흩어짐
            particle(a, { el: anim(a, FW, [90, 120, 300, 500]) }, { x: cx, y: cy, vy: 0, life: 1.1, size: B * 1.7, cls: "still", hue, delay: 0.33 });
            for (let i = 0; i < 5; i++) particle(a, "star", { x: cx, y: cy, vx: rnd(-1, 1) * B * 0.6, vy: rnd(-1, 1) * B * 0.6, life: 1, size: rnd(8, 12), cls: "burst", delay: 0.5 });
            return;
          }
          for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2, r = B * rnd(0.55, 0.8);
            particle(a, i % 3 ? "star" : "confetti", { x: cx, y: cy, vx: Math.cos(ang) * r, vy: Math.sin(ang) * r, life: 1.1, size: rnd(10, 16), cls: "burst", hue, delay: 0.33 });
          }
          particle(a, { el: div("flash") }, { x: cx, y: cy, vy: 0, life: 0.5, size: B * 0.9, cls: "fxpop", hue, delay: 0.33 });
        });
        break;
      }
      case "magic": { // 발밑 마법진이 돌고 별이 소용돌이치며 올라감
        const up = Math.min(1, p * 3) * (p > 0.85 ? (1 - p) / 0.15 : 1);
        o.lift = up * B * 0.25 + Math.sin(t * 4) * 3 * up; o.rot = Math.sin(t * 5) * 6 * up;
        a.lift.style.filter = `drop-shadow(0 0 ${(6 + 6 * Math.sin(t * 8)).toFixed(1)}px rgba(190,150,255,.95))`;
        const ring = f.extra[0]; if (ring) ring.style.opacity = up.toFixed(2);
        emit(0.08, () => {
          const ang = t * 6, r = B * 0.6;
          particle(a, "star", { x: Math.cos(ang) * r, y: B * 0.1, vx: -Math.cos(ang) * r * 0.6, vy: -B * 1.2, life: 1.1, size: rnd(9, 15), cls: "rise", hue: 220 + rnd(-30, 30) });
        });
        break;
      }
      case "poof": { // 펑! 사라졌다가 옆에서 나타나고, 다시 펑! 돌아옴
        if (!f.side) { // 공간이 있는 쪽으로 (a.room() = {x, x0, x1}: 펫 위치와 다닐 수 있는 범위)
          f.side = Math.random() < 0.5 ? -1 : 1;
          const r = a.room && a.room();
          if (r) { const ok = (sd) => r.x + sd * B * 1.4 >= r.x0 - B * 0.2 && r.x + sd * B * 1.4 <= r.x1 + B * 0.2; if (!ok(f.side)) f.side = -f.side; }
        }
        const side = f.side;
        const phase = f.t < 0.3 ? 0 : f.t < 1.2 ? 1 : 2;
        o.ox = phase === 1 ? side * B * 1.4 : 0;
        const vis = (f.t > 0.15 && f.t < 0.45) || (f.t > 1.05 && f.t < 1.35) ? 0 : 1;
        a.lift.style.opacity = vis; if (a.shadow) a.shadow.style.opacity = vis;
        const puff = (x) => { if (has(a, ...POOF)) { particle(a, { el: anim(a, POOF, [80, 140, 220]) }, { x, y: B * 0.45, vy: 0, life: 0.5, size: B * 1.3, cls: "still" }); return; } for (let i = 0; i < 7; i++) particle(a, "cloud", { x: x + rnd(-B * 0.3, B * 0.3), y: rnd(B * 0.1, B * 0.7), vx: rnd(-40, 40), vy: -rnd(10, 40), life: 0.7, size: rnd(18, 30), cls: "puff" }); particle(a, "star", { x, y: B * 0.5, vy: -30, life: 0.6, size: 18, cls: "twinkle" }); };
        once("p1", 0.12, () => puff(0)); once("p2", 0.4, () => puff(side * B * 1.4));
        once("p3", 1.02, () => puff(side * B * 1.4)); once("p4", 1.3, () => puff(0));
        if (phase === 1) o.lift = Math.max(0, Math.sin((f.t - 0.45) * 7)) * B * 0.1;
        break;
      }
      case "clone": { // 분신술: 양옆에 반투명 분신이 나왔다가 쏙 들어감
        const out = Math.min(1, p * 4) * (p > 0.8 ? (1 - p) / 0.2 : 1);
        o.lift = Math.abs(Math.sin(t * 7)) * B * 0.06;
        for (const c of f.extra) {
          c.style.transform = a.lift.style.transform;
          c.style.translate = `${(c._side * out * B * 0.9).toFixed(1)}px ${(-Math.abs(Math.sin(t * 7 + (c._side > 0 ? 1.6 : 0.8))) * B * 0.06).toFixed(1)}px`;
          c.style.opacity = (out * 0.6).toFixed(2);
        }
        if (has(a, "fx_clone_flash")) { once("cf1", 0.1, () => { for (const sx of [-1, 1]) particle(a, { el: pic(a, "fx_clone_flash") }, { x: sx * B * 0.9, y: B * 0.5, vy: 0, life: 0.6, size: B * 1.1, cls: "fxpop" }); }); once("cf2", f.dur * 0.8, () => { for (const sx of [-1, 1]) particle(a, { el: pic(a, "fx_clone_flash") }, { x: sx * B * 0.9, y: B * 0.5, vy: 0, life: 0.5, size: B * 0.9, cls: "fxpop" }); }); }
        emit(0.3, () => particle(a, "swirl", { x: rnd(-B, B), y: rnd(B * 0.2, B * 0.8), vy: -15, life: 0.6, size: 18, cls: "puff" }));
        break;
      }
      case "rocket": { // 웅크렸다가 슝! 하늘로, 그리고 사뿐 착지
        if (p < 0.15) { const q = p / 0.15; o.sy = 1 - q * 0.18; o.sx = 1 + q * 0.12; }
        else if (p < 0.85) {
          const q = (p - 0.15) / 0.7, h = Math.sin(Math.PI * q);
          o.lift = h * Math.min(B * 2.2, a.maxUp ? Math.max(B * 0.6, a.maxUp()) : B * 2.2); // 좁은 방(키오스크)에서는 천장까지만 o.sy = 1 + (q < 0.3 ? 0.12 : 0); o.sx = 2 - o.sy;
          shadow(1 - h * 0.6, (1 - h * 0.5).toFixed(2));
          if (f.flame) { f.flame.style.opacity = q < 0.55 ? 1 : 0; f.flame.style.top = -o.lift + "px"; f.flame.firstChild.src = src(a, FLAME[Math.floor(t * 14) % 3]); }
          if (q < 0.5) emit(f.flame ? 0.1 : 0.04, () => particle(a, Math.random() < 0.6 ? "ember" : "cloud", { x: rnd(-B * 0.15, B * 0.15), y: o.lift + B * 0.05, vx: rnd(-25, 25), vy: rnd(10, 40), life: 0.6, size: rnd(12, 20), cls: "puff" }));
        } else { if (f.flame) f.flame.style.opacity = 0; const q = (p - 0.85) / 0.15; o.sy = 1 - Math.sin(Math.PI * q) * 0.15; o.sx = 2 - o.sy; once("land", f.dur * 0.86, () => { for (let i = 0; i < 6; i++) particle(a, "dust", { x: rnd(-B * 0.5, B * 0.5), y: 3, vx: rnd(-40, 40), vy: -10, life: 0.6, size: 16, cls: "puff" }); }); }
        break;
      }
      case "giant": { // 쑥쑥 커졌다가 콩알만 해졌다가 원래대로
        let s = 1;
        if (p < 0.35) s = 1 + 0.65 * Math.sin((p / 0.35) * Math.PI / 2);
        else if (p < 0.5) s = 1.65 - 1.15 * ((p - 0.35) / 0.15);
        else if (p < 0.75) s = 0.5 + Math.sin(t * 20) * 0.03;
        else s = 0.5 + 0.5 * Math.min(1, (p - 0.75) / 0.15) + Math.sin(t * 16) * 0.05 * (1 - p);
        if (a.maxUp) s = Math.min(s, Math.max(1.15, (a.maxUp() + B) / B)); // 천장에 닿지 않게
        o.sx = s; o.sy = s;
        shadow(s);
        emit(0.2, () => particle(a, has(a, "fx_grow_sparkle") && Math.random() < 0.5 ? { el: pic(a, "fx_grow_sparkle") } : "star", { x: rnd(-B * 0.7, B * 0.7) * s, y: rnd(0.2, 1) * B * s, vy: -10, life: 0.7, size: rnd(14, 22), cls: "twinkle" }));
        break;
      }
      case "bubbles": { // 비눗방울이 퐁퐁
        o.rot = Math.sin(t * 4) * 6; o.lift = Math.abs(Math.sin(t * 4)) * B * 0.04;
        emit(0.12, () => {
          const b = has(a, "fx_bubble_1") ? pic(a, Math.random() < 0.5 || !has(a, "fx_bubble_2") ? "fx_bubble_1" : "fx_bubble_2") : div("bub"); b.style.setProperty("--c", BUBBLE[(Math.random() * BUBBLE.length) | 0]);
          particle(a, { el: b }, { x: rnd(-B * 0.3, B * 0.3), y: B * 0.6, vx: rnd(-B * 0.8, B * 0.8), vy: -rnd(B * 0.8, B * 1.5), life: rnd(1.4, 2), size: rnd(B * 0.12, B * 0.28), cls: "float" });
        });
        break;
      }
    }
    return o;
  }
  window.CPFx = { DUR, NEW, start, step, end, particle, voice };
})();
