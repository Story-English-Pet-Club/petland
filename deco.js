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
  // 머리 위 장식(귀·뿔·모자)은 머리가 기운 만큼(points.tilt, 도) 같이 기울임
  const TILT = { ears: 1, horn: 1, head: 1 };
  const tiltOf = (slot, pts) => (TILT[slot] && pts && pts.tilt ? ` rotate(${pts.tilt}deg)` : "");
  function classes(slot, it) { return "deco d-" + slot + (it && it.fly ? " fly" : "") + (it && it.wrap ? " wrap" : ""); }
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
    // 시트 주소 끝 → [몸 실루엣 주소, 프레임별 앞발(paws), 시트 한 칸 폭(px)]
    for (const a of Object.values(actions || {})) if (a && a.sheet && a.mask) m[tail(asset(a.sheet))] = [asset(a.mask), a.paws || null, a.nmask ? asset(a.nmask) : "", a.emask ? asset(a.emask) : ""];
    return Object.keys(m).length ? JSON.stringify(m) : "";
  }
  const px = (v) => parseFloat(v) || 0;
  /* 옷 소매: 옷 그림(…/body_x.png) 옆의 body_x_sleeve_l/r.png. 앞발이 배 앞에 있는 프레임에만 보이고, 앞발을 따라 조금씩 움직임.
     옷 캔버스(384×320) 안 소매 자리: 가운데 (138,151)·(245,151), 크기 96×80. paw = [왼 dx, dy, 오른 dx, dy] (시트 px), null = 숨김 */
  const SLV = [["l", 138], ["r", 245]];
  function sleeves(img, paw, cpx) {
    if (img._noSleeve || !/\.png(\?|$)/.test(img.getAttribute("src") || "")) return;
    if (!img._slv) {
      if (!paw) return;
      img._slv = SLV.map(([k]) => {
        const s2 = document.createElement("img"); s2.alt = ""; s2.className = "deco d-sleeve smooth"; s2.dataset.slot = "sleeve";
        s2.style.cssText = "position:absolute;pointer-events:none;display:none";
        s2.addEventListener("error", () => { img._noSleeve = 1; for (const x of img._slv || []) x.remove(); img._slv = null; }, { once: true });
        s2.src = img.getAttribute("src").replace(/\.png(\?.*)?$/, `_sleeve_${k}.png$1`);
        return s2;
      });
      img.after(...img._slv);
    }
    const W = px(img.style.width), H = px(img.style.height), L0 = px(img.style.left), T0 = px(img.style.top);
    img._slv.forEach((s2, i) => {
      const st = s2.style;
      if (!paw || !img.isConnected) { if (st.display !== "none") st.display = "none"; return; }
      const v = `${(L0 + ((SLV[i][1] - 48) / 384) * W + (paw[2 * i] || 0) * (cpx || 0)).toFixed(1)}|${(T0 + (111 / 320) * H + (paw[2 * i + 1] || 0) * (cpx || 0)).toFixed(1)}|${((96 / 384) * W).toFixed(1)}|${((80 / 320) * H).toFixed(1)}|${img.style.transform}`;
      if (s2._sig === v) { if (st.display === "none") st.display = ""; return; }
      s2._sig = v; const [l, t, w, h, tr] = v.split("|");
      st.left = l + "px"; st.top = t + "px"; st.width = w + "px"; st.height = h + "px"; st.transform = tr; st.display = "";
    });
  }
  function clipBody(img) {
    const box = img.parentNode; if (!box) return;
    const sp = box.querySelector(":scope > .sprite[data-masks]"), still = sp ? null : box.querySelector(":scope > img[data-mask-still]");
    let url = "", size = "", ox = 0, oy = 0, L, T, paw = [0, 0, 0, 0], cpx = 0;
    if (sp) {
      if (!sp._masks) { try { sp._masks = JSON.parse(sp.dataset.masks); } catch (e) { sp._masks = {}; } }
      const m = /url\(["']?(.*?)["']?\)/.exec(sp.style.backgroundImage || ""), e = m && sp._masks[tail(m[1])];
      if (!e) { sleeves(img, null); return unclip(img); }
      url = Array.isArray(e) ? (img.classList.contains("d-neck") && e[2]) || e[0] : e; size = sp.style.backgroundSize; // 목 장식: 팔을 든 프레임엔 목 가운데만
      const bp = (sp.style.backgroundPosition || "0 0").split(" ");
      ox = px(bp[0]); oy = px(bp[1]); L = px(sp.style.left); T = px(sp.style.top);
      const fwpx = px(sp.style.width), fi = fwpx ? Math.round(-ox / fwpx) : 0, paws = Array.isArray(e) ? e[1] : null;
      paw = paws ? paws[fi] || null : [0, 0, 0, 0]; // null = 팔을 든 프레임
      cpx = fwpx / (+sp.dataset.sw || 288);
    } else if (still) {
      url = still.dataset.maskStill; size = `${still.style.width} ${still.style.height}`; L = px(still.style.left); T = px(still.style.top);
    } else { sleeves(img, null); return unclip(img); }
    if (img.classList.contains("d-body")) sleeves(img, paw, cpx); // 소매는 옷만
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
  // 몸 모양대로 오리기: 옷(d-body) + 목에 두르는 것(목도리·초커처럼 wrap 표시가 있는 목 장식)
  function clipAll(root) { for (const im of (root.querySelectorAll ? root.querySelectorAll("img.d-body, img.d-neck.wrap") : [])) watchBody(im); }

  /* 반짝이 한 겹 더(거울 모양, 다른 박자): 원래 반짝이를 따라 자리·크기·움직임을 맞춤 */
  function auraTwin(img) {
    if (img._twin || img.classList.contains("ph2") || !img.parentNode) return;
    const c = img.cloneNode(false); c.classList.add("ph2"); c.removeAttribute("data-faces"); c.alt = "";
    img._twin = c; img.after(c);
    const sync = () => { if (!c.isConnected && !img.isConnected) return; for (const k of ["left", "top", "width", "height", "transform"]) c.style[k] = img.style[k]; if (c.getAttribute("src") !== img.getAttribute("src")) c.setAttribute("src", img.getAttribute("src")); };
    sync();
    new MutationObserver(sync).observe(img, { attributes: true, attributeFilter: ["style", "src"] });
  }
  function auraAll(root) { for (const im of (root.querySelectorAll ? root.querySelectorAll("img.d-aura:not(.ph2)") : [])) auraTwin(im); }

  /* 귀 장식을 끼면 펫의 원래 귀를 숨김: 펫 그림(.sprite / 가만히 img)에 '귀 뺀 실루엣'(emask)을 CSS mask 로 */
  function earCut(box) {
    if (!box) return;
    const on = !!box.querySelector(":scope > img.d-ears");
    const sp = box.querySelector(":scope > .sprite[data-masks]"), still = sp ? null : box.querySelector(":scope > img[data-emask-still]");
    const el = sp || still; if (!el) return;
    let url = "", size = "", pos = "0px 0px";
    if (on && sp) {
      if (!sp._masks) { try { sp._masks = JSON.parse(sp.dataset.masks); } catch (e) { sp._masks = {}; } }
      const m = /url\(["']?(.*?)["']?\)/.exec(sp.style.backgroundImage || ""), e = m && sp._masks[tail(m[1])];
      url = Array.isArray(e) && e[3] ? e[3] : ""; size = sp.style.backgroundSize; pos = sp.style.backgroundPosition || "0px 0px";
    } else if (on && still) { url = still.dataset.emaskStill; size = "100% 100%"; }
    const sig = url ? url + "|" + size + "|" + pos : "";
    if (el._earSig === sig) return;
    el._earSig = sig;
    for (const pre of ["-webkit-mask-", "mask-"]) {
      if (!url) { el.style.removeProperty(pre + "image"); continue; }
      el.style.setProperty(pre + "image", `url("${url}")`); el.style.setProperty(pre + "size", size); el.style.setProperty(pre + "position", pos); el.style.setProperty(pre + "repeat", "no-repeat");
    }
  }
  function watchEars(box) {
    if (!box || box._earW) { earCut(box); return; }
    box._earW = 1;
    const sp = box.querySelector(":scope > .sprite");
    let q = false;
    const run = () => { if (q) return; q = true; Promise.resolve().then(() => { q = false; earCut(box); }); };
    earCut(box);
    if (sp) new MutationObserver(run).observe(sp, { attributes: true, attributeFilter: ["style"] });
    new MutationObserver(run).observe(box, { childList: true });
  }
  function earsAll(root) { for (const im of (root.querySelectorAll ? root.querySelectorAll("img.d-ears") : [])) watchEars(im.parentNode); }

  // 문서 안의 도트 그림 <img data-crisp="최대px"> 를 한꺼번에
  function crispAll(root) { for (const im of (root || document).querySelectorAll("img[data-crisp]")) { crisp(im, +im.dataset.crisp, +im.dataset.dot || 4); im.removeAttribute("data-crisp"); } }

  // 화면에 새로 붙는 <img data-crisp> 는 저절로 또렷하게
  if (window.MutationObserver) {
    const jitter = (root) => { for (const im of root.querySelectorAll ? root.querySelectorAll("img.d-buddy, img.d-aura") : []) if (!im.dataset.j) { im.dataset.j = 1; im.style.animationDelay = (-Math.random() * 3).toFixed(2) + "s"; } };
    const mo = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches && n.matches("img[data-crisp]")) crispAll(n.parentNode); else if (n.querySelector && n.querySelector("img[data-crisp]")) crispAll(n); if (n.matches && n.matches("img.d-buddy, img.d-aura")) jitter(n.parentNode); else jitter(n); if (n.matches && n.matches("img.d-body, img.d-neck.wrap")) watchBody(n); else clipAll(n); if (n.matches && n.matches("img.d-ears")) watchEars(n.parentNode); else earsAll(n); if (n.matches && n.matches("img.d-aura")) auraTwin(n); else auraAll(n); } }); // 미니펫·반짝이가 다 같이 움직이지 않게
    const start = () => mo.observe(document.body, { childList: true, subtree: true });
    if (document.body) { start(); clipAll(document); auraAll(document); earsAll(document); } else document.addEventListener("DOMContentLoaded", () => { start(); clipAll(document); auraAll(document); earsAll(document); });
  }

  window.CPDeco = { tiltOf, masksData, clipAll, framesData, BACK, FRONT, ALL, FOLLOW, mode, place, placeCrisp, snap, isDot, crisp, crispAll, roomWidth, order, facesAttr, classes, applyFaces, preload };
})();
