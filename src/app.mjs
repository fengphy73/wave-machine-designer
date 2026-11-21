import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import Module from 'manifold-3d';
import {VERSION, DEFAULTS, LIMITS, LABELS, BED, buildAll, physics, checks, layout, meshArrays, binarySTL, makeZip, assemblyText, PART_INFO} from './geometry.mjs';

const FIELDS = [
  ['整體', [['N', '個', 1], ['a', 'mm', 0.5], ['gap', 'mm', 0.5], ['H', 'mm', 1]]],
  ['竹籤（請先實測）', [['ds', 'mm', 0.05], ['Ls', 'mm', 1]]],
  ['配重（兩端各一個）', [['Dw', 'mm', 0.5], ['Lw', 'mm', 0.5], ['hd', 'mm', 0.5]]],
  ['中心夾塊與繩', [['ht', 'mm', 0.5], ['hw', 'mm', 0.5], ['d', 'mm', 0.5], ['cord', 'mm', 0.1], ['squeeze', 'mm', 0.05]]],
  ['公差', [['tol', 'mm', 0.01], ['tolS', 'mm', 0.01]]],
  ['底座（分段拼接）', [['maxSeg', 'mm', 1], ['m3', '', 0], ['ticks', '', 0]]],
  ['估算用', [['T', 'N', 0.5]]],
];
const TIPS = {ds: '台灣常見竹籤約 2.8–3.2 mm，請用游標卡尺量 5 支取平均', Ls: '常見 20–30 cm，量實際長度', T: '只影響估算與動畫，不影響 STL', maxSeg: '依 25×25 cm 平台；有鳩尾舌頭的段會再多 8 mm',
  squeeze: '繩座孔 = 繩徑 − 夾緊量', tol: '鳩尾榫、端板插槽、羊角栓插座', tolS: '竹籤孔直徑 = 竹籤直徑 + 2 × 公差'};

const $ = s => document.querySelector(s);
$('#app').innerHTML = `
<header><h1>橫波與駐波機設計器 <small>v${VERSION}</small></h1><p>扭擺式（Shive 型）：兩條平行鬆緊繩當扭轉軸，竹籤橫桿兩端套配重。參數化 3D 列印，輸出 STL。</p></header>
<main>
  <section class="panel" id="form"></section>
  <section class="view">
    <div class="toolbar">
      <label><input type="radio" name="mode" value="assembled" checked> 組裝檢視</label>
      <label><input type="radio" name="mode" value="print"> 列印擺放（25×25 cm 平台）</label>
      <label>右端板 <select id="rightEnd"><option value="fixed">固定端板（兩孔）</option><option value="free">自由端板（收束式）</option></select></label>
      <button id="fit">重設視角</button>
    </div>
    <div id="canvas"></div>
    <div class="anim">扭轉波動畫<span class="tag">示意：依估算波速，未實測</span>
      <button id="pulse">送出一個脈衝</button><button data-mode="1">駐波 第 1 模</button><button data-mode="2">第 2 模</button><button data-mode="3">第 3 模</button><button id="stop">停止歸零</button>
      <span id="animInfo"></span></div>
    <div id="warn"></div>
    <h2>估算 <span class="tag">估算、未實測</span></h2>
    <div class="est" id="est"></div>
    <h2>自動檢查</h2>
    <ul id="checks"></ul>
    <h2>列印件與下載 <span class="tag">重量為估算</span></h2>
    <div id="parts"></div>
    <div class="downloads" id="downloads"></div>
    <h2>組裝說明與零件清單</h2>
    <pre class="asm" id="asm"></pre>
    <p class="note">本設計器從頭自行建模；扭擺式波動機概念參考 J. N. Shive 的波動機與 HeiLaut「Wave Machine」（CC BY-SA）的教學構想，未使用其模型檔。</p>
  </section>
</main>`;

// ── 表單 ──
const state = {...DEFAULTS};
const form = $('#form');
for (const [title, list] of FIELDS) {
  const fs = document.createElement('fieldset'); fs.innerHTML = `<legend>${title}</legend>`;
  for (const [key, unit, step] of list) {
    const row = document.createElement('label'); row.className = 'row';
    if (step === 0) { row.classList.add('chk'); row.innerHTML = `<span>${LABELS[key]}</span><input type="checkbox" data-k="${key}"><em></em>`; }
    else { const [lo, hi] = LIMITS[key]; row.innerHTML = `<span>${LABELS[key]}</span><input type="number" data-k="${key}" min="${lo}" max="${hi}" step="${step}"><em>${unit}</em><small>${TIPS[key] ? TIPS[key] + '｜' : ''}${lo}–${hi}</small>`; }
    fs.appendChild(row);
  }
  form.appendChild(fs);
}
const reset = document.createElement('button'); reset.textContent = '全部恢復預設值'; form.appendChild(reset);
reset.onclick = () => { Object.assign(state, DEFAULTS); syncForm(); schedule(); };
function syncForm() { for (const el of form.querySelectorAll('[data-k]')) { if (el.type === 'checkbox') el.checked = !!state[el.dataset.k]; else el.value = state[el.dataset.k]; } }
syncForm();
form.addEventListener('input', e => {
  const k = e.target.dataset.k; if (!k) return;
  if (e.target.type === 'checkbox') state[k] = e.target.checked;
  else { if (e.target.value === '' || !Number.isFinite(+e.target.value)) return; state[k] = +e.target.value; }
  schedule();
});
// 離開欄位時：立即重算，再把被限制過的值寫回欄位（警告會保留在上方）
form.addEventListener('change', () => { clearTimeout(timer); rebuild(); if (result) { Object.assign(state, result.params); syncForm(); } });

// ── 3D ──
const holder = $('#canvas');
const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
holder.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf3f5f7);
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000); camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(-400, -700, 900); scene.add(sun);
const group = new THREE.Group(); scene.add(group);
const SEG_COLORS = [0x9aa7b0, 0xb8c2c9];

function geomOf(solid) {
  const {positions, indices} = meshArrays(solid);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3)); g.setIndex(new THREE.BufferAttribute(indices, 1));
  const ng = g.toNonIndexed(); ng.computeVertexNormals(); return ng;
}
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide, ...extra});

let M = null, result = null, phys = null, timer = 0, frame = null;
let osc = [], cords = [], plateAnchors = null;
function schedule() { clearTimeout(timer); timer = setTimeout(rebuild, 150); }

function rebuild() {
  if (!M) return;
  result = buildAll(M, state);
  const p = result.params, L = result.layout, P = result.parts;
  phys = physics(p, P);
  const ck = checks(p, P);
  group.clear(); osc = []; cords = [];
  const mode = document.querySelector('input[name=mode]:checked').value;
  const right = $('#rightEnd').value;
  if (mode === 'assembled') {
    result.segs.forEach((sg, i) => group.add(new THREE.Mesh(geomOf(P[sg.key].src), mat(SEG_COLORS[i % 2]))));
    const pl = new THREE.Mesh(geomOf(P.plateFixed.src), mat(PART_INFO.plateFixed.color)); group.add(pl);
    const pr = new THREE.Mesh(geomOf(P[right === 'fixed' ? 'plateFixed' : 'plateFree'].src), mat(PART_INFO[right === 'fixed' ? 'plateFixed' : 'plateFree'].color));
    pr.scale.x = -1; pr.position.x = L.total; group.add(pr);
    group.add(new THREE.Mesh(geomOf(P.cleat.src), mat(PART_INFO.cleat.color)));
    const hubG = geomOf(P.hub.src), wG = geomOf(P.weight.src), hubM = mat(PART_INFO.hub.color), wM = mat(PART_INFO.weight.color);
    const stickG = new THREE.CylinderGeometry(p.ds / 2, p.ds / 2, p.Ls, 12), stickM = mat(0xd9b26f, {roughness: 0.9});
    for (let i = 0; i < p.N; i++) {
      const g = new THREE.Group(); g.position.set(L.hubX(i), 0, p.H);
      g.add(new THREE.Mesh(hubG, hubM)); g.add(new THREE.Mesh(stickG, stickM));
      const w1 = new THREE.Mesh(wG, wM); w1.position.y = L.rIn; g.add(w1);
      const w2 = new THREE.Mesh(wG, wM); w2.scale.y = -1; w2.position.y = -L.rIn; g.add(w2);
      group.add(g); osc.push(g);
    }
    const cm = new THREE.LineBasicMaterial({color: 0xc0392b});
    for (const sgn of [1, -1]) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((p.N + 2) * 3), 3)); const line = new THREE.Line(geo, cm); line.userData.sgn = sgn; group.add(line); cords.push(line); }
    const plateX = 29 + p.tol + 2;
    plateAnchors = {left: plateX, right: L.total - plateX, free: right === 'free'};
    frame = {cx: L.total / 2, cy: 0, cz: p.H / 2, size: L.total};
  } else {
    const keys = ['hub', 'weight', ...result.segs.map(s => s.key), 'plateFixed', 'plateFree', 'cleat', 'testKit'];
    let x = 0;
    for (const k of keys) {
      const q = P[k], m = new THREE.Mesh(geomOf(q.print), mat(PART_INFO[k]?.color ?? SEG_COLORS[0])); m.position.set(x + BED / 2, 0, 0); group.add(m);
      const bed = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(BED, BED)), new THREE.LineBasicMaterial({color: 0x7a1f2b}));
      bed.position.set(x + BED / 2, 0, 0); group.add(bed); x += BED + 30;
    }
    frame = {cx: x / 2, cy: 0, cz: 0, size: x};
  }
  resetAnim(); updateCords();
  if (!rebuild.done) { fitView(); rebuild.done = true; }
  // 警告
  $('#warn').innerHTML = [...result.warnings, ...ck.list.filter(c => !c.ok).map(c => c.text)].map(t => `<div>⚠️ ${t}</div>`).join('');
  $('#checks').innerHTML = ck.list.map(c => `<li class="${c.ok ? '' : 'bad'}">${c.ok ? '✅' : '⚠️'} ${c.text}</li>`).join('');
  // 估算
  const fx = phys.fixed.map(f => f.toFixed(2)).join('／'), fr = phys.free.map(f => f.toFixed(2)).join('／');
  const totalMass = Object.entries(P).filter(([k]) => k !== 'testKit').reduce((s, [, q]) => s + q.mass * q.qty, 0);
  const nParts = Object.entries(P).filter(([k]) => k !== 'testKit').reduce((s, [, q]) => s + q.qty, 0);
  $('#est').innerHTML = [
    ['每個振子轉動慣量 I', `${phys.I.toExponential(2)} kg·m²（配重佔 ${(phys.weightShare * 100).toFixed(0)}%）`],
    ['扭轉常數 κ = T·d²／2', `${phys.kappa.toExponential(2)} N·m²（每繩 ${p.T} N）`],
    ['波速 v = √(κ·a／I)', `${phys.v.toFixed(2)} m/s（不裝配重時約 ${phys.vBare.toFixed(2)} m/s）`],
    ['脈衝從第 1 根到第 ' + p.N + ' 根', `約 ${phys.transit.toFixed(1)} 秒（跨距 ${L.span} mm）`],
    ['兩端固定：前 3 個駐波頻率', `${fx} Hz（週期 ${phys.fixed.map(f => (1 / f).toFixed(1)).join('／')} 秒）`],
    ['右端自由：前 3 個駐波頻率', `${fr} Hz`],
    ['底座', `總長 ${L.total.toFixed(0)} mm，分 ${L.nseg} 段 × ${L.seg.toFixed(2)} mm`],
    ['列印件', `${nParts} 件，PLA 約 ${(totalMass / 1000).toFixed(2)} kg（不含試印小件）`],
  ].map(([a, b]) => `<div><span>${a}</span>${b}</div>`).join('');
  // 零件表與下載
  $('#parts').innerHTML = `<table><tr><th>零件</th><th>數量</th><th>列印尺寸 (mm)</th><th>估計重量／件</th><th>小計</th></tr>` +
    Object.entries(P).map(([k, q]) => `<tr><td>${q.name}</td><td>${q.qty}</td><td>${q.size.map(v => v.toFixed(1)).join(' × ')}</td><td>${q.mass.toFixed(1)} g${q.fill < 1 ? `<small>（約 ${Math.round(q.fill * 100)}% 實料）</small>` : ''}</td><td>${(q.mass * q.qty).toFixed(0)} g</td></tr>`).join('') + '</table>';
  $('#downloads').innerHTML = Object.entries(P).map(([k, q]) => `<button data-dl="${k}">下載 ${q.name} STL</button>`).join('') +
    `<button data-dl="asm">下載組裝說明（TXT）</button><button data-dl="all" class="primary">一鍵下載全部（ZIP）</button>`;
  $('#asm').textContent = assemblyText(result, phys);
  window.__wave = {result, phys, checks: ck};
}

function fitView() {
  if (!frame) return;
  const {cx, cy, cz, size} = frame;
  controls.target.set(cx, cy, cz);
  camera.position.set(cx - size * 0.15, cy - size * 0.75, cz + size * 0.45);
  controls.update();
}
function resize() { const w = holder.clientWidth, h = holder.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener('resize', resize);
document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { rebuild.done = false; rebuild(); }));
$('#rightEnd').addEventListener('change', rebuild);
$('#fit').onclick = fitView;

// ── 扭轉波動畫（離散模型：I·θ̈ᵢ = κ/a·(θᵢ₋₁ − 2θᵢ + θᵢ₊₁) − 阻尼；示意）──
const anim = {theta: [], omega: [], t: 0, mode: null, gain: 0};
const DAMP = 0.25;   // 示意用阻尼（1/s）
function resetAnim() { const n = osc.length; anim.theta = new Array(n).fill(0); anim.omega = new Array(n).fill(0); anim.t = 0; anim.mode = null; $('#animInfo').textContent = ''; applyAnim(); }
function step(dt) {
  const p = result.params, n = anim.theta.length; if (!n) return;
  const k = phys.kappa / (p.a / 1000) / phys.I, kg = phys.kappa / (p.gap / 1000) / phys.I, free = plateAnchors.free, damp = DAMP;
  const th = anim.theta, om = anim.omega, acc = new Array(n);
  for (let i = 0; i < n; i++) {
    const left = i === 0 ? kg * (0 - th[0]) : k * (th[i - 1] - th[i]);
    const right = i === n - 1 ? (free ? 0 : kg * (0 - th[i])) : k * (th[i + 1] - th[i]);
    acc[i] = left + right - damp * om[i];
  }
  if (anim.mode && anim.mode.type === 'drive') acc[0] += anim.gain * Math.sin(2 * Math.PI * anim.mode.f * anim.t);
  for (let i = 0; i < n; i++) { om[i] += acc[i] * dt; th[i] += om[i] * dt; }
  if (anim.mode && anim.mode.type === 'pulse') {
    const tau = 0.5, A = 25 * Math.PI / 180;
    if (anim.t < tau) { const s = Math.sin(Math.PI * anim.t / tau); th[0] = A * s * s; om[0] = A * Math.PI / tau * Math.sin(2 * Math.PI * anim.t / tau); }
  }
  anim.t += dt;
}
function applyAnim() { osc.forEach((g, i) => { g.rotation.x = anim.theta[i] || 0; }); updateCords(); }
function updateCords() {
  if (!cords.length || !result) return;
  const p = result.params, L = result.layout;
  for (const line of cords) {
    const arr = line.geometry.attributes.position.array, s = line.userData.sgn, r = p.d / 2;
    const zEnd = z => plateAnchors.free ? p.H : z;
    arr.set([plateAnchors.left, 0, p.H + s * r], 0);
    osc.forEach((g, i) => { const th = anim.theta[i] || 0; arr.set([L.hubX(i), -s * r * Math.sin(th), p.H + s * r * Math.cos(th)], 3 * (i + 1)); });
    arr.set([plateAnchors.right, 0, zEnd(p.H + s * r)], 3 * (osc.length + 1));
    line.geometry.attributes.position.needsUpdate = true;
  }
}
$('#pulse').onclick = () => { resetAnim(); anim.mode = {type: 'pulse'}; $('#animInfo').textContent = `估算約 ${phys.transit.toFixed(1)} 秒跑到另一端`; };
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
  resetAnim(); const n = +b.dataset.mode, list = plateAnchors.free ? phys.free : phys.fixed, f = list[n - 1];
  anim.mode = {type: 'drive', f};
  // 初始驅動強度：讓第 n 模穩態最大擺幅約 25°（模態近似），之後再自動微調
  const N = result.params.N, phi0 = Math.abs(Math.sin(n * Math.PI / (N + 1))) || 0.1;
  anim.gain = 0.44 * ((N + 1) / 2) * DAMP * 2 * Math.PI * f / phi0;
  $('#animInfo').innerHTML = `第 ${n} 模 <b>${f.toFixed(2)} Hz</b>（週期 ${(1 / f).toFixed(1)} 秒，${plateAnchors.free ? '右端自由' : '兩端固定'}；約 10 秒後穩定）`;
});
$('#stop').onclick = resetAnim;
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (anim.mode && osc.length) {
    const sub = Math.ceil(dt / (1 / 1200)); for (let i = 0; i < sub; i++) step(dt / sub);
    if (anim.mode.type === 'drive') { const mx = Math.max(...anim.theta.map(Math.abs)) * 180 / Math.PI; if (mx > 30) anim.gain *= 0.98; else if (mx < 20 && anim.t > 6) anim.gain *= 1.01; }
    applyAnim();
  }
  controls.update(); renderer.render(scene, camera);
});

// ── 下載 ──
function save(name, data, type = 'model/stl') {
  const url = URL.createObjectURL(new Blob([data], {type})); const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const fileName = (k, q) => { const p = result.params; return `波動機_${q.name.replace(/[（）＋\s]/g, '_').replace(/_+/g, '_').replace(/_$/, '')}_x${q.qty}_竹籤${p.ds}_繩${p.cord}.stl`; };
const asmBytes = () => new TextEncoder().encode('\ufeff' + assemblyText(result, phys));
$('#downloads').addEventListener('click', e => {
  const k = e.target.dataset?.dl; if (!k || !result) return;
  const P = result.parts;
  if (k === 'all') save(`波動機設計器_v${VERSION}_全部.zip`, makeZip([...Object.entries(P).map(([kk, q]) => ({name: fileName(kk, q), data: binarySTL(q.print, `wave-machine ${kk}`)})), {name: '組裝說明與零件清單.txt', data: asmBytes()}]), 'application/zip');
  else if (k === 'asm') save('組裝說明與零件清單.txt', asmBytes(), 'text/plain;charset=utf-8');
  else save(fileName(k, P[k]), binarySTL(P[k].print, `wave-machine ${k}`));
});

resize();
Module({locateFile: f => new URL(f, document.baseURI).href}).then(lib => { lib.setup(); M = lib; rebuild(); window.__ready = true; window.__three = {camera, controls, anim}; });
