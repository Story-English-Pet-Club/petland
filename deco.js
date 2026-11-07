/* 클래스펫츠 꾸미기 자리 공통 규칙 (PPT 위 펫 · 펫나라 · 키오스크 · 선생님 창이 함께 씀)
   - 그리는 순서: 날개(펫 뒤) → 펫 → 옷 → 목 → 입 → 코 → 눈 → 귀 → 뿔 → 모자 → 반짝이 → 미니펫
   - 눈·입은 동작에 따라 표정 그림으로 바꿔 끼움 (faces: happy·closed / open), 눈은 가끔 깜빡임
   - 프레임마다 머리·목이 움직이면 그 자리를 따라 움직임 (FOLLOW) */
"use strict";
(function () {
  const BACK = ["back"];
  const FRONT = ["body", "neck", "mouth", "nose", "eyes", "ears", "horn", "head", "aura", "buddy"];
  const ALL = BACK.concat(FRONT);
  const FOLLOW = { back: "neck", body: "neck", neck: "neck", aura: "neck", mouth: "head", nose: "head", eyes: "head", ears: "head", horn: "head", head: "head" };
  const HAPPY = /^(happy|celebrate|jump|dance)/, EAT = /^(eat)/, SLEEP = /^(sleep|rest)/;

  // 이 동작일 때 눈·입이 어떤 표정인지 (없으면 기본)
  function mode(slot, action) {
    const a = action || "";
    if (slot === "eyes") return HAPPY.test(a) ? "happy" : EAT.test(a) || SLEEP.test(a) ? "closed" : "";
    if (slot === "mouth") return HAPPY.test(a) || EAT.test(a) ? "open" : "";
    return "";
  }
  // 장식 위치(64칸 상자 좌표): 기준점 + 아이템 보정 + 그림 안의 기준(pivot, 기본 가운데)
  function place(it, a, stageId, k) {
    if (!it || !a) return null;
    const off = (it.stage_offsets && it.stage_offsets[stageId]) || it.offset || { dx: 0, dy: 0, scale: 1 };
    const sc = (a.scale || 1) * (off.scale || 1);
    const w = (it.w || 32) * sc, h = (it.h || 32) * sc, pv = it.pivot || [0.5, 0.5];
    const cx = a.x + (off.dx || 0), cy = a.y + (off.dy || 0);
    return { left: (cx - w * pv[0]) * k, top: (cy - h * pv[1]) * k, width: w * k, height: h * k };
  }
  // 장착된 자리를 그리는 순서대로: [{slot, back}]
  function order(eq, allowed) {
    const out = [];
    for (const s of ALL) {
      if (!(eq && eq[s] && (!allowed || allowed.includes(s)))) continue;
      if (s === "ears" && eq.horn && (!allowed || allowed.includes("horn"))) continue; // 뿔과 귀는 함께 안 씀 (뿔이 먼저)
      out.push({ slot: s, back: BACK.includes(s) });
    }
    return out;
  }
  // <img> 에 붙일 표정 정보 (data-faces) — asset: 참조 → 주소
  function facesAttr(it, asset) {
    if (it && it.frames && !it.faces) return framesAttr(it, asset);
    if (!it || !it.faces) return "";
    const f = {};
    for (const [m, ref] of Object.entries(it.faces)) if (ref) f[m] = asset(ref);
    return Object.keys(f).length ? ` data-faces='${JSON.stringify(f).replace(/'/g, "&#39;")}'` : "";
  }
  // 미니펫 움직임 그림 (깜빡·걷기·날갯짓) → data-bframes (core.js 의 data-frames 와 다름)
  function framesData(it, asset) {
    if (!it || !it.frames) return null;
    const f = {};
    for (const [k, v] of Object.entries(it.frames)) f[k] = Array.isArray(v) ? v.map((x) => asset(x)) : asset(v);
    return JSON.stringify(f);
  }
  function framesAttr(it, asset) { const j = framesData(it, asset); return j ? ` data-bframes='${j.replace(/'/g, "&#39;")}'` : ""; }
  // 미니펫 그림 넘기기: 걸을 때 걷기 그림, 날아다니는 친구는 날갯짓, 가끔 눈 깜빡
  let fTick = 0;
  setInterval(() => {
    fTick++;
    for (const im of document.querySelectorAll("img.d-buddy[data-bframes]")) {
      let f; try { f = JSON.parse(im.dataset.bframes); } catch (e) { continue; }
      if (!im.dataset.base0) im.dataset.base0 = im.getAttribute("src");
      const root = im.closest("[data-act]"), walking = !!root && /^walk/.test(root.dataset.act || "");
      let want = im.dataset.base0;
      if (f.flap && f.flap.length) want = f.flap[fTick % f.flap.length];
      else if (walking && f.walk && f.walk.length) want = f.walk[fTick % f.walk.length];
      if (f.blink && !walking && (im.dataset.blinking || Math.random() < 0.03)) { // 깜빡 (0.17초)
        if (!im.dataset.blinking) { im.dataset.blinking = 1; setTimeout(() => { delete im.dataset.blinking; }, 170); }
        if (!f.flap) want = f.blink;
      }
      if (im.getAttribute("src") !== want) im.setAttribute("src", want);
    }
  }, 170);
  function classes(slot, it) { return "deco d-" + slot + (it && it.fly ? " fly" : ""); }
  // 동작이 바뀔 때 부름: 그 펫 안의 눈·입 그림을 표정에 맞게
  function applyFaces(root, action) {
    if (!root) return;
    root.dataset.act = action || "";
    for (const im of root.querySelectorAll("img[data-faces]")) {
      const f = JSON.parse(im.dataset.faces), m = mode(im.dataset.slot, action);
      if (!im.dataset.base) im.dataset.base = im.getAttribute("src");
      const want = (m && f[m]) || im.dataset.base;
      if (im.getAttribute("src") !== want) im.setAttribute("src", want);
      im.dataset.mode = m;
    }
  }
  // 가끔 깜빡이기: 기본 표정인 눈만, 0.15초 감은 눈
  setInterval(() => {
    for (const im of document.querySelectorAll('img.d-eyes[data-faces]')) {
      if (im.dataset.mode || Math.random() > 0.06) continue;
      const f = JSON.parse(im.dataset.faces); if (!f.closed) continue;
      if (!im.dataset.base) im.dataset.base = im.getAttribute("src");
      im.setAttribute("src", f.closed); im.dataset.mode = "blink";
      setTimeout(() => { if (im.dataset.mode === "blink") { im.setAttribute("src", im.dataset.base); im.dataset.mode = ""; } }, 150);
    }
  }, 300);
  // 그림 미리 불러 두기 (표정 바꿀 때 깜빡이지 않게)
  function preload(it, asset) {
    const refs = [];
    if (it && it.faces) refs.push(...Object.values(it.faces));
    if (it && it.frames) for (const v of Object.values(it.frames)) refs.push(...(Array.isArray(v) ? v : [v]));
    for (const ref of refs) if (ref) { const i = new Image(); i.src = asset(ref); }
  }

  /* 도트 그림(4px 격자)을 또렷하게: 도트 한 칸이 화면의 정수 픽셀이 되도록 크기를 맞춤 */
  const dpr = () => window.devicePixelRatio || 1;
  // 가운데를 지키며 크기만 맞춤. dots = 그림 가로 도트 수
  function snap(pl, dots) {
    const n = Math.max(1, Math.round((pl.width * dpr()) / dots)), w = (n * dots) / dpr(), h = (pl.height / pl.width) * w;
    const cx = pl.left + pl.width / 2, cy = pl.top + pl.height / 2;
    return { left: Math.round((cx - w / 2) * dpr()) / dpr(), top: Math.round((cy - h / 2) * dpr()) / dpr(), width: w, height: h };
  }
  function isDot(it) { return !!it && (it.dot || 0) >= 2 && it.render !== "smooth"; }
  function placeCrisp(it, a, stageId, k) {
    const pl = place(it, a, stageId, k);
    return pl && isDot(it) ? snap(pl, ((it.w || 32) * 4) / it.dot) : pl;
  }
  // 상점 칸 같은 작은 그림: max(px) 안에 들어가는 가장 큰 정수 배율로 (작으면 부드럽게)
  function crisp(img, max, dot) {
    const fit = () => {
      const nw = img.naturalWidth, nh = img.naturalHeight; if (!nw) return;
      const d = dot || 4, s = Math.floor((max * dpr()) / (Math.max(nw, nh) / d));
      if (s >= 1 && (Math.max(nw, nh) / d) * s >= max * dpr() * 0.7) { img.style.width = ((nw / d) * s) / dpr() + "px"; img.style.height = ((nh / d) * s) / dpr() + "px"; img.style.imageRendering = "pixelated"; img.style.maxWidth = "none"; img.style.maxHeight = "none"; }
    };
    if (img.complete && img.naturalWidth) fit(); else img.addEventListener("load", fit, { once: true });
    return img;
  }
  // 방 장면(가로 96칸 = 1536px = 384도트): 도트가 정수 픽셀이 되는 폭. 조금(8%까지) 넘치면 양옆을 살짝 자름
  function roomWidth(avail) {
    const per = (avail * dpr()) / 384, up = Math.max(1, Math.round(per)), w = (up * 384) / dpr();
    if (w <= avail * 1.08) return w;
    return (Math.max(1, Math.floor(per)) * 384) / dpr();
  }
  /* 옷을 펫 몸 모양대로 오리기: 펫 그림(.sprite)과 같은 칸의 '몸 실루엣'(mask)을 옷 그림의 CSS mask 로.
     옷이 몸 밖으로 삐져나오지 않고 펫의 외곽선 안쪽에 맞게 보임. 몸이 움직이는 프레임마다 실루엣도 같이 바뀜.
     렌더러는 .sprite 에 data-masks='{"시트 주소 끝": "실루엣 주소"}', 가만히 그림(img)엔 data-mask-still="주소" 를 달아 둠 */
  const tail = (u) => { try { u = decodeURIComponent(u); } catch (e) { /* 그대로 */ } return u.split("/").slice(-3).join("/"); };
  function masksData(actions, asset) {
    const m = {};
    for (const a of Object.values(actions || {})) if (a && a.sheet && a.mask) m[tail(asset(a.sheet))] = asset(a.mask);
    return Object.keys(m).length ? JSON.stringify(m) : "";
  }
  const px = (v) => parseFloat(v) || 0;
  function clipBody(img) {
    const box = img.parentNode; if (!box) return;
    const sp = box.querySelector(":scope > .sprite[data-masks]"), still = sp ? null : box.querySelector(":scope > img[data-mask-still]");
    let url = "", size = "", ox = 0, oy = 0, L, T;
    if (sp) {
      if (!sp._masks) { try { sp._masks = JSON.parse(sp.dataset.masks); } catch (e) { sp._masks = {}; } }
      const m = /url\(["']?(.*?)["']?\)/.exec(sp.style.backgroundImage || ""), u = m && sp._masks[tail(m[1])];
      if (!u) return unclip(img);
      url = u; size = sp.style.backgroundSize;
      const bp = (sp.style.backgroundPosition || "0 0").split(" ");
      ox = px(bp[0]); oy = px(bp[1]); L = px(sp.style.left); T = px(sp.style.top);
    } else if (still) {
      url = still.dataset.maskStill; size = `${still.style.width} ${still.style.height}`; L = px(still.style.left); T = px(still.style.top);
    } else return unclip(img);
    const t = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/.exec(img.style.transform || "");
    const x = L + ox - px(img.style.left) - (t ? +t[1] : 0), y = T + oy - px(img.style.top) - (t ? +t[2] : 0);
    const st = img.style, pos = `${x.toFixed(1)}px ${y.toFixed(1)}px`, im = `url("${url}")`;
    // 같은 값이면 다시 쓰지 않음: 브라우저마다(아이패드 사파리 등) 값을 읽어 오는 모양이 달라서,
    // 읽은 값과 비교하면 '다르다'고 보고 계속 다시 써서 화면이 멈출 수 있음 → 우리가 마지막에 쓴 값(sig)과 비교
    const sig = im + "|" + size + "|" + pos;
    if (img._clipSig === sig) return;
    img._clipSig = sig;
    for (const pre of ["-webkit-mask-", "mask-"]) {
      st.setProperty(pre + "image", im); st.setProperty(pre + "size", size); st.setProperty(pre + "position", pos); st.setProperty(pre + "repeat", "no-repeat");
    }
  }
  function unclip(img) { if (img._clipSig === "") return; img._clipSig = ""; for (const pre of ["-webkit-mask-", "mask-"]) img.style.removeProperty(pre + "image"); }
  function watchBody(img) {
    if (img._clip) return; img._clip = 1;
    const box = img.parentNode, sp = box && box.querySelector(":scope > .sprite");
    let q = false;
    const run = () => { if (q) return; q = true; Promise.resolve().then(() => { q = false; clipBody(img); }); }; // 한 번에 몰아서
    clipBody(img);
    new MutationObserver(run).observe(img, { attributes: true, attributeFilter: ["style"] });
    if (sp) new MutationObserver(run).observe(sp, { attributes: true, attributeFilter: ["style"] });
  }
  function clipAll(root) { for (const im of (root.querySelectorAll ? root.querySelectorAll("img.d-body") : [])) watchBody(im); }

  // 문서 안의 도트 그림 <img data-crisp="최대px"> 를 한꺼번에
  function crispAll(root) { for (const im of (root || document).querySelectorAll("img[data-crisp]")) { crisp(im, +im.dataset.crisp, +im.dataset.dot || 4); im.removeAttribute("data-crisp"); } }

  // 화면에 새로 붙는 <img data-crisp> 는 저절로 또렷하게
  if (window.MutationObserver) {
    const jitter = (root) => { for (const im of root.querySelectorAll ? root.querySelectorAll("img.d-buddy, img.d-aura") : []) if (!im.dataset.j) { im.dataset.j = 1; im.style.animationDelay = (-Math.random() * 3).toFixed(2) + "s"; } };
    const mo = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches && n.matches("img[data-crisp]")) crispAll(n.parentNode); else if (n.querySelector && n.querySelector("img[data-crisp]")) crispAll(n); if (n.matches && n.matches("img.d-buddy, img.d-aura")) jitter(n.parentNode); else jitter(n); if (n.matches && n.matches("img.d-body")) watchBody(n); else clipAll(n); } }); // 미니펫·반짝이가 다 같이 움직이지 않게
    const start = () => mo.observe(document.body, { childList: true, subtree: true });
    if (document.body) { start(); clipAll(document); } else document.addEventListener("DOMContentLoaded", () => { start(); clipAll(document); });
  }

  window.CPDeco = { masksData, clipAll, framesData, BACK, FRONT, ALL, FOLLOW, mode, place, placeCrisp, snap, isDot, crisp, crispAll, roomWidth, order, facesAttr, classes, applyFaces, preload };
})();
