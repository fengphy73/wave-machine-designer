// 橫波與駐波機設計器（扭擺式／Shive 型）：幾何核心（瀏覽器與 Node 共用）
// 從頭自行建模。座標：X = 沿繩（扭轉軸）方向，Y = 沿竹籤方向，Z = 向上；單位 mm；桌面 z = 0。
export const VERSION = '1.0.0';
export const BED = 250;            // 列印平台 25×25 cm
export const BED_USABLE = 240;     // 每邊留 5 mm
export const RHO_PLA = 1.24;       // g/cm³
export const RHO_BAMBOO = 0.7;     // g/cm³（竹籤密度假設值）
export const BASE_FILL = 0.45;     // 底座、端板、羊角栓依「3 層牆＋20–25% 填充」粗估的實料比例

export const DEFAULTS = {
  N: 30,            // 振子數
  a: 25,            // 振子間距
  gap: 25,          // 端距：端板到第一個（最後一個）夾塊
  H: 110,           // 軸心高（桌面到兩繩中線）
  ds: 3.0,          // 竹籤直徑（需實測）
  Ls: 250,          // 竹籤長度（需實測）
  Dw: 15, Lw: 20, hd: 15,   // 配重直徑、長度、盲孔深
  ht: 8, hw: 12,    // 中心夾塊厚（沿繩）、寬（沿竹籤）
  d: 12,            // 雙繩間距（上下）
  cord: 2.0,        // 繩徑（需實測）
  squeeze: 0.2,     // 繩座夾緊量（繩座孔 = 繩徑 − 夾緊量）
  tol: 0.15,        // PLA 一般公差（每側）：鳩尾、端板插槽、羊角栓插座
  tolS: 0.10,       // 竹籤孔公差（每側）
  maxSeg: 220,      // 底座每段最大長度（依 25×25 平台）
  m3: true,         // 底座接縫 M3 螺絲孔
  ticks: true,      // 底座肋條頂面刻度線（夾塊位置）
  T: 8,             // 每條繩拉力（N，只用於估算）
};
export const LIMITS = {
  N: [10, 40], a: [18, 40], gap: [15, 50], H: [80, 150], ds: [2.5, 4], Ls: [150, 300],
  Dw: [10, 20], Lw: [10, 30], hd: [8, 25], ht: [6, 12], hw: [10, 20], d: [6, 20], cord: [1, 3], squeeze: [0, 0.4],
  tol: [0.1, 0.2], tolS: [0.05, 0.2], maxSeg: [150, 230], T: [2, 20],
};
export const INTS = new Set(['N']);
export const BOOLS = new Set(['m3', 'ticks']);

// 固定尺寸（底座）
export const BASE_W = 60, PLATE_T = 5, RIB_W = 4, RIB_TOP = 20, FOOT_W = 120, FOOT_L = 60;
export const EZ = 38;               // 底座外端到立柱內面
export const POST_X0 = 24, POST_T = 14, POST_W = 36, SLOT_X0 = 29, PLATE_W = 26, PLATE_T_ = 4;
export const BOSS = {x0: 2, x1: 20, hy: 12}, CLEAT = {x0: 6, t: 10, hy: 8, zb: 7};
export const DOVE = {neck: 8, head: 12, len: 8, yc: 11}, M3B = {len: 6, y0: 18, y1: 26, z: 12.5, hole: 3.4};

export function sanitize(input = {}) {
  const p = {...DEFAULTS}, warnings = [];
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in input)) continue;
    if (BOOLS.has(k)) { p[k] = !!input[k]; continue; }
    let v = Number(input[k]);
    if (!Number.isFinite(v)) { warnings.push(`「${k}」不是數字，改用預設值 ${DEFAULTS[k]}`); continue; }
    if (INTS.has(k)) v = Math.round(v);
    const [lo, hi] = LIMITS[k];
    if (v < lo || v > hi) { const c = Math.min(hi, Math.max(lo, v)); warnings.push(`${LABELS[k]} ${v} 超出範圍，已限制為 ${c}`); v = c; }
    p[k] = v;
  }
  if (p.hd > p.Lw - 2) { warnings.push(`盲孔深 ${p.hd} 太深，已限制為配重長度 − 2 = ${p.Lw - 2} mm`); p.hd = p.Lw - 2; }
  return {params: p, warnings};
}

export const LABELS = {
  N: '振子數', a: '振子間距', gap: '端距（端板到第一個夾塊）', H: '軸心高', ds: '竹籤直徑', Ls: '竹籤長度',
  Dw: '配重直徑', Lw: '配重長度', hd: '配重盲孔深', ht: '夾塊厚（沿繩）', hw: '夾塊寬（沿竹籤）', d: '雙繩間距', cord: '繩徑',
  squeeze: '繩座夾緊量', tol: 'PLA 公差（每側）', tolS: '竹籤孔公差（每側）', maxSeg: '底座每段最大長度', m3: '接縫 M3 螺絲孔', ticks: '刻度線', T: '每條繩拉力（估算用）',
};

export function layout(p) {
  const span = (p.N - 1) * p.a;
  const total = 2 * EZ + span + 2 * p.gap;
  const nseg = Math.ceil(total / p.maxSeg), seg = total / nseg;
  const hubX = i => EZ + p.gap + i * p.a;
  const seat = p.cord - p.squeeze, neck = 0.6 * p.cord;
  const hh = p.d + seat + 7;                       // 繩座外到頂、底各留 3.5 mm
  const holeR = p.ds / 2 + p.tolS;                  // 竹籤孔半徑
  const plateH = Math.max(30, p.d + 2 * (p.cord + 0.3) + 8);
  const postTop = p.H + plateH / 2;
  const winHalf = Math.max(3, p.cord + 1);          // 立柱過繩窗半寬
  const rIn = p.Ls / 2 - p.hd, rOut = rIn + p.Lw;   // 配重內緣、外緣半徑
  return {span, total, nseg, seg, hubX, seat, neck, hh, holeR, plateH, postTop, winHalf, rIn, rOut,
    fixedHole: p.cord + 0.6, freeHole: 2 * p.cord + 0.6, cleatX: CLEAT.x0 + CLEAT.t / 2};
}

// ── 2D 小工具 ──
// 截頂水滴孔（尖端朝 +u，截在 1.2r）：列印時尖端朝上，免支撐
export function teardrop(M, r, seg = 32) {
  const pts = [];
  for (let i = 0; i <= seg; i++) { const t = Math.PI / 4 + (i / seg) * (1.5 * Math.PI); pts.push([r * Math.cos(t), r * Math.sin(t)]); }
  const k = 1.2 * r, h = Math.SQRT2 * r - k;
  pts.push([k, -h], [k, h]);
  return new M.CrossSection([pts]);
}
// 多邊形一律轉成逆時針（Manifold 正面積規則）
export function ccw(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; } return a < 0 ? pts.slice().reverse() : pts; }
const box = (M, x0, x1, y0, y1, z0, z1) => M.Manifold.cube([x1 - x0, y1 - y0, z1 - z0], false).translate([x0, y0, z0]);
const ALONG_X = [90, 0, 90];   // 2D (u,v) 擠出 w → X = w, Y = u, Z = v
const ALONG_Y = [90, 0, 0];    // 2D (u,v) 擠出 w → X = u, Y = −w, Z = v

// ── 零件 ──
// 中心夾塊（局部座標，中心在原點；竹籤沿 Y 穿過 z = 0；兩繩沿 X 在 z = ±d/2）
export function hubSolid(M, p) {
  const L = layout(p), {Manifold} = M;
  let s = Manifold.cube([p.ht, p.hw, L.hh], true);
  const hole = teardrop(M, L.holeR).extrude(p.hw + 2).translate([0, 0, -(p.hw + 2) / 2]).rotate(ALONG_Y);
  s = s.subtract(hole);
  for (const sg of [1, -1]) {
    const seatC = Manifold.cylinder(p.ht + 2, L.seat / 2, L.seat / 2, 32, true).rotate([0, 90, 0]).translate([0, 0, sg * p.d / 2]);
    const z0 = sg > 0 ? p.d / 2 : -L.hh / 2 - 1, z1 = sg > 0 ? L.hh / 2 + 1 : -p.d / 2;
    s = s.subtract(seatC).subtract(box(M, -p.ht / 2 - 1, p.ht / 2 + 1, -L.neck / 2, L.neck / 2, z0, z1));
  }
  return s;
}
// 配重（局部座標：軸沿 +Y，內端 y = 0、外端 y = Lw；盲孔從內端開）
export function weightSolid(M, p) {
  const L = layout(p), {Manifold} = M;
  const body = Manifold.cylinder(p.Lw, p.Dw / 2, p.Dw / 2, 64).rotate([-90, 0, 0]);
  const hole = Manifold.cylinder(p.hd + 1, L.holeR, L.holeR, 32).translate([0, 0, -1]).rotate([-90, 0, 0]);
  return body.subtract(hole);
}

// 左端座特徵（全域座標，x 從 0 起）；右端用鏡射
function endZone(M, p) {
  const L = layout(p), {Manifold, CrossSection} = M, t = p.tol;
  const parts = [box(M, 0, FOOT_L, -FOOT_W / 2, FOOT_W / 2, 0, PLATE_T)];
  let post = box(M, POST_X0, POST_X0 + POST_T, -POST_W / 2, POST_W / 2, 0, L.postTop);
  post = post.subtract(box(M, SLOT_X0, SLOT_X0 + PLATE_T_ + 2 * t, -(PLATE_W / 2 + t), PLATE_W / 2 + t, p.H - L.plateH / 2, L.postTop + 1));
  post = post.subtract(box(M, POST_X0 - 1, POST_X0 + POST_T + 1, -L.winHalf, L.winHalf, p.H - p.d / 2 - p.cord - 2, L.postTop + 1));
  parts.push(post);
  const finBack = new CrossSection([[[POST_X0, PLATE_T], [POST_X0, 65], [4, PLATE_T]]]);
  const finFront = new CrossSection([[[POST_X0 + POST_T, PLATE_T], [POST_X0 + POST_T + 15, PLATE_T], [POST_X0 + POST_T, 50]]]);
  for (const cs of [finBack, finFront]) {
    const f = cs.extrude(5).rotate(ALONG_Y);           // Y ∈ [−5, 0]
    parts.push(f.translate([0, POST_W / 2, 0]), f.translate([0, -POST_W / 2 + 5, 0]));
  }
  let boss = box(M, BOSS.x0, BOSS.x1, -BOSS.hy, BOSS.hy, 0, RIB_TOP);
  boss = boss.subtract(box(M, CLEAT.x0 - t, CLEAT.x0 + CLEAT.t + t, -(CLEAT.hy + t), CLEAT.hy + t, CLEAT.zb, RIB_TOP + 1));
  parts.push(boss);
  return Manifold.union(parts);
}
// 端座需要的「挖空」：插槽與過繩窗也要切穿底座肋條以外的東西（立柱內已切）。羊角栓插座切掉 boss 內部。
function dovetailTongue(M, B, yc) {
  // 斜邊延伸進本段 1 mm（避免頂點剛好落在段端面上產生重合頂點）；接縫處（x = B）頸寬 = neck
  const {neck, head, len} = DOVE, k = (head - neck) / 2 / len;
  return new M.CrossSection([ccw([[B + 1, yc - neck / 2 + k], [B - len, yc - head / 2], [B - len, yc + head / 2], [B + 1, yc + neck / 2 - k]])]).extrude(PLATE_T);
}
function dovetailSocket(M, B, yc, t) {
  const {neck, head, len} = DOVE, k = (head - neck) / 2 / len, w = t * Math.sqrt(1 + k * k);   // 斜邊法向外擴 t
  const y0 = neck / 2 + w;  // 接縫處半寬
  return new M.CrossSection([ccw([[B + 1, yc - y0 + k], [B - len - t, yc - y0 - k * (len + t)], [B - len - t, yc + y0 + k * (len + t)], [B + 1, yc + y0 - k]])]).extrude(PLATE_T + 2).translate([0, 0, -1]);
}
function m3Block(M, x0, x1) {
  const {Manifold} = M;
  const blocks = [box(M, x0, x1, M3B.y0, M3B.y1, PLATE_T, RIB_TOP), box(M, x0, x1, -M3B.y1, -M3B.y0, PLATE_T, RIB_TOP)];
  return Manifold.union(blocks);
}
function m3Holes(M, B) {
  const h = teardrop(M, M3B.hole / 2).rotate(90).extrude(2 * M3B.len + 4).translate([0, 0, -(M3B.len + 2)]).rotate(ALONG_X);
  return M.Manifold.union([h.translate([B, (M3B.y0 + M3B.y1) / 2, M3B.z]), h.translate([B, -(M3B.y0 + M3B.y1) / 2, M3B.z])]);
}

// 底座一段（全域 x 座標）。opt: {xs, xe, leftJoint, rightJoint, leftEnd, rightEnd, index, windows, ticks}
// 接縫規則：接縫 B 右邊那段帶鳩尾舌頭（伸進左段），左邊那段開鳩尾槽。
export function baseSegment(M, p, opt) {
  const L = layout(p), {Manifold} = M, t = p.tol;
  const {xs, xe} = opt;
  const add = [box(M, xs, xe, -BASE_W / 2, BASE_W / 2, 0, PLATE_T),
    box(M, xs, xe, BASE_W / 2 - RIB_W, BASE_W / 2, PLATE_T, RIB_TOP), box(M, xs, xe, -BASE_W / 2, -BASE_W / 2 + RIB_W, PLATE_T, RIB_TOP)];
  if (opt.leftEnd) add.push(endZone(M, p));
  if (opt.rightEnd) add.push(endZone(M, p).mirror([1, 0, 0]).translate([L.total, 0, 0]));
  if (opt.leftJoint) { for (const yc of [DOVE.yc, -DOVE.yc]) add.push(dovetailTongue(M, xs, yc)); if (p.m3) add.push(m3Block(M, xs, xs + M3B.len)); }
  if (opt.rightJoint && p.m3) add.push(m3Block(M, xe - M3B.len, xe));
  let s = Manifold.union(add);
  const cut = [];
  if (opt.rightJoint) for (const yc of [DOVE.yc, -DOVE.yc]) cut.push(dovetailSocket(M, xe, yc, t));
  if (opt.leftJoint && p.m3) cut.push(m3Holes(M, xs));
  if (opt.rightJoint && p.m3) cut.push(m3Holes(M, xe));
  if (opt.windows) {
    const lo = xs + (opt.leftEnd ? FOOT_L + 15 : 40), hi = xe - (opt.rightEnd ? FOOT_L + 15 : 40);
    const n = Math.floor((hi - lo + 10) / 40);
    if (n > 0) { const used = n * 40 - 10, x0 = (lo + hi - used) / 2; for (let i = 0; i < n; i++) cut.push(box(M, x0 + i * 40, x0 + i * 40 + 30, -16, 16, -1, PLATE_T + 1)); }
  }
  if (opt.index) {  // 段號：在板面 y = 21 處鑽 index 個 Ø2 深 0.6 小凹點
    const x0 = xs + (opt.leftEnd ? FOOT_L + 15 : 45);
    for (let i = 0; i < opt.index; i++) cut.push(Manifold.cylinder(2, 1, 1, 16).translate([x0 + i * 5, 21, PLATE_T - 0.6]));
  }
  if (opt.ticks && p.ticks) for (let i = 0; i < p.N; i++) {
    const x = L.hubX(i); if (x < xs + 1 || x > xe - 1) continue;
    for (const sg of [1, -1]) cut.push(box(M, x - 0.4, x + 0.4, sg > 0 ? BASE_W / 2 - RIB_W - 1 : -BASE_W / 2 - 1, sg > 0 ? BASE_W / 2 + 1 : -BASE_W / 2 + RIB_W + 1, RIB_TOP - 0.4, RIB_TOP + 1));
  }
  if (cut.length) s = s.subtract(Manifold.union(cut));
  return s;
}
// 端板（全域座標，左端）。kind: 'fixed' 兩孔 / 'free' 中心一孔（兩繩收束）
export function endPlate(M, p, kind) {
  const L = layout(p), {Manifold} = M, t = p.tol;
  const x0 = SLOT_X0 + t;
  let s = box(M, x0, x0 + PLATE_T_, -PLATE_W / 2, PLATE_W / 2, p.H - L.plateH / 2, p.H + L.plateH / 2);
  const hole = (dia, z) => Manifold.cylinder(PLATE_T_ + 2, dia / 2, dia / 2, 32, true).rotate([0, 90, 0]).translate([x0 + PLATE_T_ / 2, 0, z]);
  if (kind === 'fixed') s = s.subtract(hole(L.fixedHole, p.H + p.d / 2)).subtract(hole(L.fixedHole, p.H - p.d / 2));
  else s = s.subtract(hole(L.freeHole, p.H));
  return s;
}
// 羊角栓（全域座標，插在左端座後方插座）
export function cleat(M, p) {
  const H = p.H, hy = CLEAT.hy;
  const prof = new M.CrossSection([[[hy, CLEAT.zb], [hy, H - 14], [30, H - 5], [26, H - 2], [-26, H - 2], [-30, H - 5], [-hy, H - 14], [-hy, CLEAT.zb]]]);
  return prof.extrude(CLEAT.t).rotate(ALONG_X).translate([CLEAT.x0, 0, 0]);
}

// ── 列印擺放 ──
export const PRINT_ROT = {hub: [0, -90, 0], weight: [-90, 0, 0], plateFixed: [0, -90, 0], plateFree: [0, -90, 0], cleat: [0, -90, 0]};
export function toPrint(name, solid) {
  const r = PRINT_ROT[name.replace(/\d+$/, '')] || (name.startsWith('seg') ? null : null);
  const s = r ? solid.rotate(r) : solid;
  const b = s.boundingBox();
  return s.translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -b.min[2]]);
}

export function segmentPlan(p) {
  const L = layout(p), list = [];
  for (let k = 0; k < L.nseg; k++) {
    const leftEnd = k === 0, rightEnd = k === L.nseg - 1;
    list.push({key: `seg${k + 1}`, index: k + 1, xs: k * L.seg, xe: (k + 1) * L.seg, leftEnd, rightEnd, leftJoint: k > 0, rightJoint: k < L.nseg - 1, windows: true, ticks: true,
      name: `底座第 ${k + 1} 段` + (leftEnd ? '（左端座＋立柱）' : rightEnd ? '（右端座＋立柱）' : '（中段）')});
  }
  return list;
}

// 試印小件：夾塊＋配重＋一組鳩尾接縫短段（各 40 mm）
export function testKit(M, p, hubP, weightP) {
  const B = 100, cl = baseSegment(M, p, {xs: B - 40, xe: B, rightJoint: true}), cr = baseSegment(M, p, {xs: B, xe: B + 40, leftJoint: true});
  const pl = s => { const b = s.boundingBox(); return s.translate([-b.min[0], -b.min[1], -b.min[2]]); };
  const a = pl(cl), b = pl(cr).translate([40 + 8 + 8, 0, 0]);
  const h = pl(hubP).translate([0, BASE_W + 8, 0]), w = pl(weightP).translate([30, BASE_W + 8, 0]);
  return M.Manifold.union([a, b, h, w]);
}

export const PART_INFO = {
  hub: {name: '中心夾塊', color: 0x2f86c8}, weight: {name: '配重', color: 0x1f5f99}, plateFixed: {name: '固定端板', color: 0xf0a030},
  plateFree: {name: '自由端板', color: 0xe07b20}, cleat: {name: '羊角栓', color: 0x5d6d7e}, testKit: {name: '試印小件組', color: 0x8e44ad},
};

export function buildAll(M, input) {
  const {params: p, warnings} = sanitize(input);
  const L = layout(p);
  const local = {hub: hubSolid(M, p), weight: weightSolid(M, p)};
  const assembled = {plateFixed: endPlate(M, p, 'fixed'), plateFree: endPlate(M, p, 'free'), cleat: cleat(M, p)};
  const segs = segmentPlan(p);
  for (const sg of segs) assembled[sg.key] = baseSegment(M, p, sg);
  const parts = {};
  const reg = (key, src, name, qty, fill) => {
    const pr = toPrint(key, src), b = pr.boundingBox(), size = [0, 1, 2].map(i => b.max[i] - b.min[i]);
    const vol = pr.volume();
    parts[key] = {key, name, qty, src, print: pr, size, volume: vol, mass100: vol * RHO_PLA / 1000, fill, mass: vol * RHO_PLA / 1000 * fill,
      tris: pr.numTri(), genus: pr.genus(), status: pr.status(), fitsBed: size.every(v => v > 0 && v <= BED_USABLE)};
  };
  reg('hub', local.hub, '中心夾塊', p.N + 2, 1);
  reg('weight', local.weight, '配重', 2 * p.N + 4, 1);
  for (const sg of segs) reg(sg.key, assembled[sg.key], sg.name, 1, BASE_FILL);
  reg('plateFixed', assembled.plateFixed, '固定端板', 2, 1);
  reg('plateFree', assembled.plateFree, '自由端板', 1, 1);
  reg('cleat', assembled.cleat, '羊角栓', 1, BASE_FILL);
  reg('testKit', testKit(M, p, parts.hub.print, parts.weight.print), '試印小件組（夾塊＋配重＋鳩尾接縫短段）', 1, 1);
  return {params: p, warnings, layout: L, local, assembled, parts, segs};
}

// ── 檢查與估算 ──
export function walls(p) {
  const L = layout(p);
  return {
    hubBesideHole: p.ht / 2 - 1.2 * L.holeR,                 // 竹籤孔（水滴尖端側）到夾塊側面
    hubHoleToSeat: p.d / 2 - L.seat / 2 - L.holeR,           // 竹籤孔到繩座
    hubSeatToEdge: L.hh / 2 - p.d / 2 - L.seat / 2,          // 繩座到頂／底
    hubBesideNeck: (p.hw - L.neck) / 2,                      // 卡口兩側
    weightRadial: p.Dw / 2 - L.holeR, weightBottom: p.Lw - p.hd,
    postInnerWall: POST_X0 + POST_T - (SLOT_X0 + PLATE_T_ + 2 * p.tol), postOuterWall: SLOT_X0 - POST_X0,
    bossWall: CLEAT.x0 - p.tol - BOSS.x0,
  };
}
// 最大擺幅：竹籤與配重下緣不碰桌面、底座（|y| ≤ 30、z < 20）、端座加寬腳（只在 x 重疊時）
export function maxSwing(p) {
  const L = layout(p);
  const footOverlap = L.hubX(0) - p.Dw / 2 < FOOT_L;
  const pts = [];
  for (let i = 0; i <= 20; i++) pts.push([p.hw / 2 + (L.rIn - p.hw / 2) * i / 20, p.ds / 2]);
  for (let i = 0; i <= 10; i++) pts.push([L.rIn + p.Lw * i / 10, p.Dw / 2]);
  const hits = th => pts.some(([r, s]) => {
    const z = p.H - r * Math.sin(th) - s * Math.cos(th), y = r * Math.cos(th) - s * Math.sin(th);
    return z < 0 || (Math.abs(y) <= BASE_W / 2 && z < RIB_TOP) || (footOverlap && Math.abs(y) <= FOOT_W / 2 && z < PLATE_T);
  });
  let deg = 0; for (; deg <= 90; deg += 0.1) if (hits(deg * Math.PI / 180)) break;
  return {deg: Math.min(90, deg - 0.1), full: deg > 90};
}
// 對稱三對角矩陣特徵值（Sturm 二分）
function triEig(diag, off, k) {
  const n = diag.length, count = x => { let c = 0, q = diag[0] - x; if (q < 0) c++; for (let i = 1; i < n; i++) { q = diag[i] - x - off[i - 1] ** 2 / (q === 0 ? 1e-300 : q); if (q < 0) c++; } return c; };
  let hi = 0; for (let i = 0; i < n; i++) hi = Math.max(hi, diag[i] + Math.abs(off[i - 1] || 0) + Math.abs(off[i] || 0));
  const out = [];
  for (let m = 1; m <= k; m++) { let lo = 0, h = hi; for (let it = 0; it < 100; it++) { const mid = (lo + h) / 2; if (count(mid) >= m) h = mid; else lo = mid; } out.push((lo + h) / 2); }
  return out;
}
export function physics(p, parts) {
  const L = layout(p);
  const mHub = parts.hub.mass100, mW = parts.weight.mass100;
  const mS = Math.PI * (p.ds / 2) ** 2 * p.Ls * RHO_BAMBOO / 1000;
  const rc = L.rIn + p.Lw / 2;
  const Iw = 2 * mW * (rc ** 2 + (3 * (p.Dw / 2) ** 2 + p.Lw ** 2) / 12);
  const Is = mS * p.Ls ** 2 / 12, Ih = mHub * (p.hw ** 2 + L.hh ** 2) / 12;
  const I = (Iw + Is + Ih) * 1e-9;                       // g·mm² → kg·m²
  const kappa = p.T * (p.d / 1000) ** 2 / 2;             // N·m²
  const a = p.a / 1000, v = Math.sqrt(kappa * a / I);
  const modes = right => {
    const n = p.N, diag = [], off = [], k = kappa / a, kg = kappa / (p.gap / 1000);
    for (let i = 0; i < n; i++) diag.push(((i === 0 ? kg : k) + (i === n - 1 ? (right === 'fixed' ? kg : 0) : k)) / I);
    for (let i = 0; i < n - 1; i++) off.push(-k / I);
    return triEig(diag, off, 3).map(l => Math.sqrt(l) / (2 * Math.PI));
  };
  const Ibare = (Is + Ih) * 1e-9;
  return {mHub, mW, mS, I, Iw: Iw * 1e-9, weightShare: Iw / (Iw + Is + Ih), kappa, v, vBare: Math.sqrt(kappa * a / Ibare), transit: L.span / 1000 / v,
    fixed: modes('fixed'), free: modes('free'), lenFixed: L.span + 2 * p.gap};
}
export function checks(p, parts) {
  const L = layout(p), w = walls(p), sw = maxSwing(p), list = [];
  const push = (ok, text) => list.push({ok, text});
  for (const part of Object.values(parts)) push(part.fitsBed, `${part.name}：列印尺寸 ${part.size.map(v => v.toFixed(1)).join(' × ')} mm` + (part.fitsBed ? '，在 25×25 cm 平台內（每邊留 5 mm）' : `，超出平台可用範圍 ${BED_USABLE} mm`));
  const minHub = Math.min(w.hubBesideHole, w.hubHoleToSeat, w.hubSeatToEdge, w.hubBesideNeck);
  push(minHub >= 2, `中心夾塊最薄壁 ${minHub.toFixed(2)} mm（竹籤孔旁 ${w.hubBesideHole.toFixed(2)}、孔到繩座 ${w.hubHoleToSeat.toFixed(2)}、繩座到外緣 ${w.hubSeatToEdge.toFixed(2)}、卡口兩側 ${w.hubBesideNeck.toFixed(2)}）` + (minHub >= 2 ? '' : '：小於 2 mm，請加大夾塊厚或雙繩間距'));
  const minW = Math.min(w.weightRadial, w.weightBottom);
  push(minW >= 2, `配重最薄壁 ${minW.toFixed(2)} mm（孔周 ${w.weightRadial.toFixed(2)}、孔底 ${w.weightBottom.toFixed(2)}）`);
  push(sw.deg >= 30, sw.full ? '竹籤轉到 90° 也不碰桌面與底座' : `最大擺幅約 ±${sw.deg.toFixed(1)}°（超過才會碰桌面或底座）` + (sw.deg >= 30 ? '' : '：太小，請加高軸心或用較短竹籤'));
  push(p.Dw <= p.a - 4, `相鄰配重間隙 ${(p.a - p.Dw).toFixed(1)} mm` + (p.Dw <= p.a - 4 ? '' : '：小於 4 mm，請縮小配重直徑或加大間距'));
  const postClear = p.gap - p.Dw / 2;
  push(postClear >= 3, `第一個配重到端板距離 ${postClear.toFixed(1)} mm` + (postClear >= 3 ? '' : '：太近，請加大端距'));
  push(L.seg >= FOOT_L + 25, `底座分 ${L.nseg} 段，每段 ${L.seg.toFixed(2)} mm` + (L.seg >= FOOT_L + 25 ? '' : '：太短，端座放不下'));
  push(L.neck < L.seat, `繩座 Ø${L.seat.toFixed(2)}、卡口寬 ${L.neck.toFixed(2)} mm（卡口比繩座窄才卡得住）`);
  return {list, walls: w, swing: sw};
}

// ── 網格工具 ──
export function meshArrays(solid) {
  const m = solid.getMesh();
  const np = m.numProp, pos = new Float32Array((m.vertProperties.length / np) * 3);
  for (let i = 0, j = 0; i < m.vertProperties.length; i += np, j += 3) { pos[j] = m.vertProperties[i]; pos[j + 1] = m.vertProperties[i + 1]; pos[j + 2] = m.vertProperties[i + 2]; }
  return {positions: pos, indices: Uint32Array.from(m.triVerts)};
}
export function binarySTL(solid, header = 'wave-machine-designer') {
  const {positions: P, indices: I} = meshArrays(solid);
  const n = I.length / 3, buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf);
  for (let i = 0; i < Math.min(80, header.length); i++) dv.setUint8(i, header.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const a = I[3 * t] * 3, b = I[3 * t + 1] * 3, c = I[3 * t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true); o += 12;
    for (const v of [a, b, c]) { dv.setFloat32(o, P[v], true); dv.setFloat32(o + 4, P[v + 1], true); dv.setFloat32(o + 8, P[v + 2], true); o += 12; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(d) { let c = 0xffffffff; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function makeZip(files) {
  const enc = new TextEncoder(), chunks = [], central = []; let off = 0;
  for (const {name, data} of files) {
    const nb = enc.encode(name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    chunks.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const csize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0)); let q = 0; for (const c of all) { out.set(c, q); q += c.length; }
  return out;
}
export function edgeCheck(solid) {
  const {positions: P, indices: I} = meshArrays(solid);
  const key = i => `${P[3 * i].toFixed(4)},${P[3 * i + 1].toFixed(4)},${P[3 * i + 2].toFixed(4)}`;
  const id = new Map(), vid = new Uint32Array(P.length / 3);
  for (let i = 0; i < vid.length; i++) { const k = key(i); if (!id.has(k)) id.set(k, id.size); vid[i] = id.get(k); }
  const edges = new Map();
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = vid[I[t + e]], b = vid[I[t + (e + 1) % 3]]; const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    const r = edges.get(k) || {f: 0, b: 0}; if (a < b) r.f++; else r.b++; edges.set(k, r);
  }
  let open = 0, bad = 0; for (const r of edges.values()) { if (r.f + r.b === 1) open++; else if (r.f !== 1 || r.b !== 1) bad++; }
  return {edges: edges.size, open, nonManifold: bad, closed: open === 0 && bad === 0};
}
export function rayHits(mesh, o, d) {
  const {positions: P, indices: I} = mesh, hits = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2]; if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det, s = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]];
    const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]); if (u < -1e-9 || u > 1 + 1e-9) continue;
    const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
    const v = f * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]); if (v < -1e-9 || u + v > 1 + 1e-9) continue;
    const tt = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]); if (tt > 1e-9) hits.push(tt);
  }
  hits.sort((x, y) => x - y);
  return hits.filter((h, i) => i === 0 || h - hits[i - 1] > 1e-6);   // 去掉打在共用邊上的重複交點
}
// 下垂面（需支撐）檢查：法向朝下且比 45° 更平、又不在床面上的三角形，依相連分群，回傳每群的窄邊寬（短橋 ≤ 2.5 mm 可接受）
export function overhangGroups(solid) {
  const {positions: P, indices: I} = meshArrays(solid);
  const tris = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    if (Math.max(P[a + 2], P[b + 2], P[c + 2]) < 0.01) continue;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz); if (l < 1e-9) continue;
    if (nz / l < -0.7072) tris.push([a, b, c]);
  }
  const key = i => `${P[i].toFixed(3)},${P[i + 1].toFixed(3)},${P[i + 2].toFixed(3)}`;
  const parent = tris.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const owner = new Map();
  tris.forEach((tr, i) => tr.forEach(v => { const k = key(v); if (owner.has(k)) parent[find(i)] = find(owner.get(k)); else owner.set(k, i); }));
  const groups = new Map();
  tris.forEach((tr, i) => { const g = find(i); const bb = groups.get(g) || [1e9, 1e9, -1e9, -1e9]; for (const v of tr) { bb[0] = Math.min(bb[0], P[v]); bb[1] = Math.min(bb[1], P[v + 1]); bb[2] = Math.max(bb[2], P[v]); bb[3] = Math.max(bb[3], P[v + 1]); } groups.set(g, bb); });
  return [...groups.values()].map(bb => Math.min(bb[2] - bb[0], bb[3] - bb[1]));
}

// ── 組裝說明與零件清單（純文字，也放進 ZIP）──
export function assemblyText(res, phys) {
  const p = res.params, L = res.layout, P = res.parts;
  const lines = [];
  lines.push(`橫波與駐波機設計器 v${VERSION}：組裝說明與零件清單`, '');
  lines.push(`參數：振子 ${p.N} 個、間距 ${p.a} mm、軸心高 ${p.H} mm、竹籤 Ø${p.ds}×${p.Ls} mm、配重 Ø${p.Dw}×${p.Lw} mm、雙繩間距 ${p.d} mm、繩徑 ${p.cord} mm`, '');
  lines.push('【列印件】（數量含備品；重量為估算、未實測）');
  for (const k of Object.keys(P)) { const q = P[k]; lines.push(`- ${q.name} × ${q.qty}：${q.size.map(v => v.toFixed(1)).join('×')} mm，約 ${q.mass.toFixed(1)} g／件` + (q.fill < 1 ? `（依約 ${Math.round(q.fill * 100)}% 實料估算）` : '（100% 填充）')); }
  lines.push('', '【外購件】');
  lines.push(`- 竹籤 Ø${p.ds}×${p.Ls} mm × ${p.N}（另備 5 支；請先實測直徑與長度，挑直的）`);
  lines.push(`- ${p.cord} mm 圓鬆緊繩 約 ${Math.ceil((2 * L.total / 1000 + 0.6) * 2) / 2} m（一條繞回成雙繩）`);
  lines.push('- 瞬間膠少量' + (p.m3 ? `；M3×16 螺絲＋螺帽 × ${2 * (L.nseg - 1)} 組（底座接縫補強，可不裝）` : ''));
  lines.push('- 小段竹籤 1 截（自由端板背後當插銷）', '');
  lines.push('【列印設定建議】中心夾塊、配重、端板 100% 填充（配重質量要一致）；底座、羊角栓 3 層牆、20–25% 填充。全部零件免支撐，STL 已是列印擺放方向。', '');
  lines.push('【組裝步驟】');
  lines.push(`1. 依段號（板面小凹點數＝段號）把底座第 1 段到第 ${L.nseg} 段排好：右邊那段的鳩尾舌頭由上往下插進左邊那段的鳩尾槽。` + (p.m3 ? '需要時再從開口處裝 M3 螺絲鎖緊接縫。' : ''));
  lines.push('2. 兩端立柱的插槽各插一片端板：左端插「固定端板」；右端先插「固定端板」（做自由端示範時換「自由端板」）。');
  lines.push('3. 羊角栓插進左端座後方的插座。');
  lines.push('4. 穿繩：繩從左端板上孔穿出→沿上方拉到右端→穿過右端板上孔、從下孔繞回→沿下方拉回左端→穿過左端板下孔。兩個繩頭從立柱後方拉出，拉到每條約 ' + p.T + ' N（可掛水瓶或用行李秤確認），在羊角栓上繞 8 字固定。繞回設計讓兩股拉力自動相等。');
  lines.push('5. 把中心夾塊對準底座肋條上的刻度線，從上方把上繩、下繩各自壓進鑰匙孔卡口（先張繩再裝夾塊，繩拉長後位置才不會跑）。');
  lines.push(`6. 竹籤穿過夾塊中心孔，兩端各留 ${(p.Ls / 2).toFixed(0)} mm 置中（竹籤沒置中會有重力回復力，波會變成鐘擺波），點一滴瞬間膠。`);
  lines.push('7. 兩端套上配重（盲孔套住竹籤尖端），點膠固定。');
  lines.push('8. 示範：輕扭第一根送出脈衝看行進與反射；照節奏持續扭第一根可看到駐波。換右端「自由端板」時，繩繞過端板中心孔後在背後插一小段竹籤擋住即可。', '');
  lines.push('【估算（未實測）】');
  lines.push(`- 每個振子轉動慣量 I ≈ ${phys.I.toExponential(2)} kg·m²（配重佔 ${(phys.weightShare * 100).toFixed(0)}%）`);
  lines.push(`- 扭轉常數 κ = T·d²/2 ≈ ${phys.kappa.toExponential(2)} N·m²；波速 v = √(κ·a/I) ≈ ${phys.v.toFixed(2)} m/s；跑完全程約 ${phys.transit.toFixed(1)} 秒`);
  lines.push(`- 兩端固定駐波：${phys.fixed.map((f, i) => `第 ${i + 1} 模 ${f.toFixed(2)} Hz`).join('、')}`);
  lines.push(`- 右端自由：${phys.free.map((f, i) => `第 ${i + 1} 模 ${f.toFixed(2)} Hz`).join('、')}`);
  lines.push('', '收納時請放鬆繩子（PLA 長期受力會慢慢變形）。');
  return lines.join('\n');
}
