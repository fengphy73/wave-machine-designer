// 橫波與駐波機設計器 v1.0.0 測試：網格封閉、免支撐、平台內、實際尺寸量測（射線）、零件配合
import Module from 'manifold-3d';
import {buildAll, layout, physics, checks, walls, maxSwing, edgeCheck, overhangGroups, meshArrays, rayHits, binarySTL, hubSolid, weightSolid, DEFAULTS, BED_USABLE, SLOT_X0, PLATE_T_} from '../src/geometry.mjs';
const M = await Module(); M.setup();
let fail = 0, pass = 0; const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL ' + msg); } if (process.env.V || !c) return; };
const log = (...a) => console.log(...a);
const near = (a, b, e = 0.02) => Math.abs(a - b) <= e;

const cases = [['預設', {}], ['振子 10', {N: 10}], ['振子 40', {N: 40}], ['間距 18＋配重 Ø14', {a: 18, Dw: 14}], ['間距 40', {a: 40}],
  ['軸心 80', {H: 80}], ['軸心 150', {H: 150}], ['繩間距 6', {d: 6}], ['繩間距 20＋繩徑 3', {d: 20, cord: 3}], ['繩徑 1', {cord: 1}],
  ['竹籤 2.5', {ds: 2.5}], ['竹籤 4.0', {ds: 4}], ['竹籤 150', {Ls: 150}], ['竹籤 300', {Ls: 300}], ['無 M3', {m3: false}], ['無刻度', {ticks: false}],
  ['每段 150', {maxSeg: 150}], ['每段 230', {maxSeg: 230}], ['公差 0.1／0.2', {tol: 0.1, tolS: 0.2}], ['公差 0.2／0.05', {tol: 0.2, tolS: 0.05}],
  ['夾塊 6×10', {ht: 6, hw: 10}], ['夾塊 12×20', {ht: 12, hw: 20}], ['配重 Ø20×30 盲孔 25', {Dw: 20, Lw: 30, hd: 25}], ['配重 Ø10×10', {Dw: 10, Lw: 10, hd: 8}]];
for (const [tag, inp] of cases) {
  const r = buildAll(M, inp);
  let allOk = true, worstOH = 0, maxDim = 0;
  for (const [k, q] of Object.entries(r.parts)) {
    const e = edgeCheck(q.print), oh = overhangGroups(q.print);
    const good = q.status === 'NoError' && e.closed && q.volume > 0 && q.fitsBed && oh.every(w => w <= 2.5);
    worstOH = Math.max(worstOH, ...oh, 0); maxDim = Math.max(maxDim, ...q.size);
    if (!good) { allOk = false; log(`   ${tag}｜${q.name}：status ${q.status} closed ${e.closed} size ${q.size.map(v => v.toFixed(1))} OH ${oh}`); }
  }
  // 相鄰段不重疊、鳩尾確實咬合（右段往右拉 1 mm 會卡住）
  let jointOk = true;
  for (let i = 0; i + 1 < r.segs.length; i++) {
    const A = r.parts[r.segs[i].key].src, B = r.parts[r.segs[i + 1].key].src;
    const inter = A.intersect(B).volume(), pulled = A.intersect(B.translate([1, 0, 0])).volume();
    if (!(inter < 1e-6 && pulled > 0.1)) { jointOk = false; log(`   ${tag}｜接縫 ${i + 1}/${i + 2}：重疊 ${inter.toFixed(3)}，拉開 1 mm 時卡住體積 ${pulled.toFixed(2)}`); }
  }
  const L = r.layout, segSum = r.segs.reduce((s, g) => s + (g.xe - g.xs), 0);
  ok(allOk, `${tag}｜所有零件封閉、免支撐（下垂面只有 ≤ 2.5 mm 短橋）、在平台 ${BED_USABLE} mm 內`);
  ok(jointOk, `${tag}｜底座相鄰段不重疊，鳩尾咬合`);
  ok(near(segSum, L.total, 1e-6) && L.seg <= r.params.maxSeg + 1e-9, `${tag}｜分段總和 = 總長 ${L.total.toFixed(1)}，每段 ${L.seg.toFixed(2)} ≤ ${r.params.maxSeg}`);
  log(`PASS? ${allOk && jointOk ? '是' : '否'}｜${tag}：總長 ${L.total.toFixed(1)}，${L.nseg} 段 × ${L.seg.toFixed(2)}，最大列印尺寸 ${maxDim.toFixed(1)} mm，最寬短橋 ${worstOH.toFixed(2)} mm，擺幅 ±${maxSwing(r.params).deg.toFixed(1)}°，警告 ${checks(r.params, r.parts).list.filter(c => !c.ok).length} 項`);
}

// ── 預設參數：實際量測 ──
const r = buildAll(M, {}), p = r.params, L = r.layout, P = r.parts;
log('\n【預設參數量測（由網格射線實測）】');
const hub = meshArrays(r.local.hub);
const hz = rayHits(hub, [0, 0, 0], [0, 0, 1]), hxm = rayHits(hub, [0, 0, 0], [-1, 0, 0]), hxp = rayHits(hub, [0, 0, 0], [1, 0, 0]);
const holeD = hz[0] * 2, wallBeside = hxp[1] - hxp[0];
const seatR = rayHits(hub, [0, 0, p.d / 2], [1e-4, 1, 0])[0];
const seatToTop = rayHits(hub, [0, 0.7, p.d / 2], [0, 0, 1]); // 卡口旁（y = 0.7）往上：先穿出繩座再到頂
const throughX = rayHits(hub, [-50, 0, p.d / 2], [1, 0, 0]).length;
const holeToSeat = rayHits(hub, [0, 0.3, 0], [0, 0, 1]);
log(`中心夾塊外形 ${P.hub.size.map(v => v.toFixed(2)).join(' × ')}；竹籤孔直徑（量 Z 向）${holeD.toFixed(2)}；水滴尖端 ${hxp[0].toFixed(2)}；孔旁最薄壁 ${wallBeside.toFixed(2)}／另一側 ${(hxm[1] - hxm[0]).toFixed(2)}`);
log(`  繩座直徑 ${(2 * seatR).toFixed(2)}；繩沿 X 穿過夾塊無阻擋：${throughX === 0}；竹籤孔到繩座 ${(holeToSeat[1] - holeToSeat[0]).toFixed(2)}；卡口旁繩座到頂 ${(seatToTop[seatToTop.length - 1] - seatToTop[seatToTop.length - 2]).toFixed(2)}`);
ok(near(holeD, p.ds + 2 * p.tolS, 0.05), `竹籤孔 ${holeD.toFixed(2)} ≈ ${p.ds + 2 * p.tolS}`);
ok(near(2 * seatR, L.seat, 0.05), `繩座 ${(2 * seatR).toFixed(2)} ≈ ${L.seat}`);
ok(throughX === 0, '繩沿 X 方向穿過夾塊不受阻');
ok(wallBeside >= 2, `夾塊竹籤孔旁最薄壁 ${wallBeside.toFixed(2)} ≥ 2`);
ok(near(wallBeside, walls(p).hubBesideHole, 0.05), '實測最薄壁與公式一致');
const wt = meshArrays(r.local.weight);
const depth = rayHits(wt, [0, -1, 0], [0, 1, 0])[0] - 1, wHoleR = rayHits(wt, [0, 1, 0], [1, 0, 0])[0];
log(`配重外形 ${P.weight.size.map(v => v.toFixed(2)).join(' × ')}；盲孔深 ${depth.toFixed(2)}；孔徑 ${(2 * wHoleR).toFixed(2)}；體積 ${P.weight.volume.toFixed(0)} mm³ → ${P.weight.mass100.toFixed(2)} g`);
ok(near(depth, p.hd, 0.02) && near(2 * wHoleR, p.ds + 2 * p.tolS, 0.05), '配重盲孔深與孔徑正確');
for (const sg of r.segs) { const q = P[sg.key]; log(`${q.name}：設計段長 ${(sg.xe - sg.xs).toFixed(2)}，列印外框 ${q.size.map(v => v.toFixed(2)).join(' × ')}，體積 ${(q.volume / 1000).toFixed(1)} cm³，實心 ${q.mass100.toFixed(0)} g／估 ${q.mass.toFixed(0)} g`); }
const s1 = meshArrays(P.seg1.src);
const postTop = 1000 - rayHits(s1, [27, 10, 1000], [0, 0, -1])[0];
const slotW = (() => { const h = rayHits(s1, [20, 8, p.H + 5], [1, 0, 0]); return h[2] - h[1]; })();
const cordFree = rayHits(s1, [-10, 0, p.H + p.d / 2], [1, 0, 0]).filter(t => t < 60).length === 0 && rayHits(s1, [-10, 0, p.H - p.d / 2], [1, 0, 0]).filter(t => t < 60).length === 0;
log(`立柱頂高 ${postTop.toFixed(2)}（軸心 ${p.H} + 端板高 ${L.plateH}/2）；端板插槽寬 ${slotW.toFixed(2)}（端板 ${PLATE_T_}）；繩在軸心高 ±${p.d / 2} 穿過立柱無阻擋：${cordFree}`);
ok(near(postTop, p.H + L.plateH / 2) && near(slotW, PLATE_T_ + 2 * p.tol) && cordFree, '立柱高度、插槽寬、過繩窗正確');
const pf = P.plateFixed.src, seg1 = P.seg1.src, cl = P.cleat.src;
ok(pf.intersect(seg1).volume() < 1e-6 && pf.translate([p.tol + 0.05, 0, 0]).intersect(seg1).volume() > 0.01, `端板插進插槽：不干涉，往內移 ${p.tol + 0.05} mm 才碰到（每側間隙 ${p.tol}）`);
ok(cl.intersect(seg1).volume() < 1e-6 && cl.translate([p.tol + 0.05, 0, 0]).intersect(seg1).volume() > 0.01, '羊角栓插進插座：不干涉，間隙 = 公差');
const pm = meshArrays(pf);
ok(rayHits(pm, [0, 0, p.H + p.d / 2], [1, 0, 0]).length === 0 && rayHits(pm, [0, 0, p.H], [1, 0, 0]).length === 2, '固定端板兩孔在 H ± d/2');
ok(rayHits(meshArrays(P.plateFree.src), [0, 0, p.H], [1, 0, 0]).length === 0, '自由端板中心孔在 H');
// 夾塊、配重裝到位置後不碰底座與立柱
const hubPlaced = r.local.hub.translate([L.hubX(0), 0, p.H]);
const wPlaced = r.local.weight.translate([L.hubX(0), L.rIn, p.H]);
ok(hubPlaced.intersect(seg1).volume() < 1e-6 && wPlaced.intersect(seg1).volume() < 1e-6, '第一個振子（夾塊＋配重）不碰端座');
const sw = maxSwing(p);
ok(sw.deg > 50, `最大擺幅 ±${sw.deg.toFixed(1)}°`);
// 旋轉到最大擺幅時，配重不碰底座（實體檢查）
const wRot = r.local.weight.translate([0, L.rIn, 0]).rotate([-(sw.deg - 0.5), 0, 0]).translate([L.hubX(0), 0, p.H]);
const wRot2 = r.local.weight.translate([0, L.rIn, 0]).rotate([-(sw.deg + 1.5), 0, 0]).translate([L.hubX(0), 0, p.H]);
const wb = wRot.boundingBox(), wb2 = wRot2.boundingBox();
log(`配重轉到 ${(sw.deg - 0.5).toFixed(1)}° 時最低點 z = ${wb.min[2].toFixed(2)}；${(sw.deg + 1.5).toFixed(1)}° 時 z = ${wb2.min[2].toFixed(2)}`);
ok(wb.min[2] > 0 && wb2.min[2] < 0.3, '擺幅極限由桌面決定，與實體旋轉一致');
const stl = binarySTL(P.hub.print);
ok(stl.length === 84 + 50 * P.hub.tris, `STL 二進位格式正確（夾塊 ${P.hub.tris} 面）`);
const ph = physics(p, P);
log(`估算：I = ${ph.I.toExponential(3)} kg·m²（配重 ${(ph.weightShare * 100).toFixed(1)}%）、κ = ${ph.kappa.toExponential(3)}、v = ${ph.v.toFixed(3)} m/s（無配重 ${ph.vBare.toFixed(2)}）、全程 ${ph.transit.toFixed(2)} s`);
log(`  兩端固定 ${ph.fixed.map(f => f.toFixed(3)).join('／')} Hz；右端自由 ${ph.free.map(f => f.toFixed(3)).join('／')} Hz；連續近似 f1 = v/2L = ${(ph.v / (2 * ph.lenFixed / 1000)).toFixed(3)}`);
ok(near(ph.fixed[0], ph.v / (2 * ph.lenFixed / 1000), 0.005), '離散模型基頻 ≈ 連續近似 v/2L');
ok(near(ph.fixed[1] / ph.fixed[0], 2, 0.02) && near(ph.free[1] / ph.free[0], 3, 0.05), '駐波頻率比：固定 1:2，自由端 1:3');
const tot = Object.entries(P).filter(([k]) => k !== 'testKit').reduce((s, [, q]) => s + q.mass * q.qty, 0);
log(`列印件合計約 ${(tot).toFixed(0)} g（不含試印小件）；試印小件組 ${P.testKit.size.map(v => v.toFixed(1)).join(' × ')} mm，${P.testKit.mass100.toFixed(1)} g`);
log(`\n共 ${pass} 項通過，${fail} 項失敗`);
process.exit(fail ? 1 : 0);
