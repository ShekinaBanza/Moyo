// Original mannequin renderer: draws consistent human figures (head, torso, limbs) from joint coordinates.
// Used to generate the exercise illustrations and the activity pictograms (see make-figures.mjs).
// No third-party artwork is used or copied: every figure is computed from the poses below.

export const COL = {
    skin: '#b9774a', skinFar: '#9a6038',
    shirt: '#f97316', shirtFar: '#d65f0c',
    pants: '#134e4a', pantsFar: '#0d3a37',
    hair: '#2b1d16', shoe: '#1f2937', ink: '#134e4a',
    floor: '#c5ced9', mat: '#14b8a6', metal: '#475569', plate: '#0f172a', band: '#ec4899', wood: '#b45309',
};

const pts = (a) => a.map((p) => `${p[0]},${p[1]}`).join(' ');
const line = (a, w, c, extra = '') => `<polyline points="${pts(a)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function arm(a, far) {
    const [sh, el, wr] = a;
    return line(a, 7, far ? COL.skinFar : COL.skin) + line([sh, lerp(sh, el, 0.4)], 10, far ? COL.shirtFar : COL.shirt) + `<circle cx="${wr[0]}" cy="${wr[1]}" r="4.2" fill="${far ? COL.skinFar : COL.skin}"/>`;
}
function leg(l, far, face) {
    const [hip, kn, an] = l;
    const toe = [an[0] + 9 * (face || 1), an[1] + 1.5];
    return line(l, 11, far ? COL.pantsFar : COL.pants) + line([an, toe], 6, COL.shoe);
}

/** pose: {head, torso:[pts], arms:[{p:[sh,el,wr],far}], legs:[{p:[hip,kn,an],far}], eq:[svg], face:1|-1|0} */
export function figure(pose) {
    const face = pose.face ?? 1;
    const far = (k) => pose[k].filter((x) => x.far);
    const near = (k) => pose[k].filter((x) => !x.far);
    const t = pose.torso;
    const hip = t[t.length - 1];
    const [hx, hy] = pose.head;
    let out = '';
    far('legs').forEach((l) => (out += leg(l.p, true, face)));
    far('arms').forEach((a) => (out += arm(a.p, true)));
    out += line(t, pose.front ? 24 : 17, COL.shirt);
    if (pose.front) out += line([[t[0][0] - 17, t[0][1]], [t[0][0] + 17, t[0][1]]], 12, COL.shirt);
    out += `<circle cx="${hip[0]}" cy="${hip[1]}" r="${pose.front ? 11 : 8.5}" fill="${COL.pants}"/>`;
    near('legs').forEach((l) => (out += leg(l.p, false, face)));
    near('arms').forEach((a) => (out += arm(a.p, false)));
    // head: hair behind, face towards the facing direction
    out += `<circle cx="${hx}" cy="${hy}" r="10.4" fill="${COL.hair}"/><circle cx="${hx + 2 * face}" cy="${hy + (pose.front ? 1.6 : 1.2)}" r="9" fill="${COL.skin}"/>`;
    out += `<line x1="${t[0][0]}" y1="${t[0][1] - 6}" x2="${hx}" y2="${hy + 8}" stroke="${COL.skin}" stroke-width="6" stroke-linecap="round"/>`;
    (pose.eq ?? []).forEach((e) => (out += e));
    return out;
}

/** Side view helper (figure faces `face`). near/far: {arm:[el,wr], leg:[kn,an]} */
export function side({ head, sh, hip, torsoMid, near, far, face = 1, eq = [] }) {
    const farSet = far ?? { arm: near.arm?.map((p) => [p[0] - 4 * face, p[1] - 1]), leg: near.leg?.map((p) => [p[0] - 3 * face, p[1]]) };
    const arms = [];
    const legs = [];
    if (farSet.arm) arms.push({ p: [sh, ...farSet.arm], far: true });
    if (near.arm) arms.push({ p: [sh, ...near.arm], far: false });
    if (farSet.leg) legs.push({ p: [hip, ...farSet.leg], far: true });
    if (near.leg) legs.push({ p: [hip, ...near.leg], far: false });
    return { head, torso: [sh, ...(torsoMid ? [torsoMid] : []), hip], arms, legs, eq, face };
}

/** Front view helper. */
export function front({ head, neck, pelvis, armL, armR, legL, legR, eq = [] }) {
    return {
        front: true, face: 0, head, torso: [neck, pelvis], eq,
        arms: [{ p: armL, far: true }, { p: armR, far: false }],
        legs: [{ p: legL, far: true }, { p: legR, far: false }],
    };
}

// ---------- equipment ----------
export const dumbbell = (x, y, a = 0) => `<g transform="translate(${x} ${y}) rotate(${a})"><rect x="-8" y="-2" width="16" height="4" rx="2" fill="${COL.metal}"/><rect x="-11" y="-6" width="5" height="12" rx="1.6" fill="${COL.plate}"/><rect x="6" y="-6" width="5" height="12" rx="1.6" fill="${COL.plate}"/></g>`;
export const band = (a, b) => `<path d="M${a[0]} ${a[1]} Q${(a[0] + b[0]) / 2} ${(a[1] + b[1]) / 2 + 6} ${b[0]} ${b[1]}" fill="none" stroke="${COL.band}" stroke-width="3.4" stroke-linecap="round"/>`;
export const box = (x, y, w, h, c = COL.wood) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${c}"/>`;
export const wall = (x) => `<rect x="${x}" y="10" width="10" height="130" fill="#94a3b8"/><rect x="${x + 10}" y="10" width="3" height="130" fill="#cbd5e1"/>`;
export const bar = (x1, y, x2) => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${COL.metal}" stroke-width="4" stroke-linecap="round"/>`;

// ---------- scene ----------
export function scene(pose, { bg = '#ffedd5', label = '', floorY = 140, mat = false, w = 240, h = 160, title = '' } = {}) {
    const floor = mat
        ? `<rect x="14" y="${floorY - 2}" width="${w - 28}" height="7" rx="3.5" fill="${COL.mat}"/>`
        : `<line x1="14" y1="${floorY + 1}" x2="${w - 14}" y2="${floorY + 1}" stroke="${COL.floor}" stroke-width="3" stroke-linecap="round"/>`;
    const lab = label ? `<text x="14" y="${h - 6}" font-family="system-ui,sans-serif" font-size="10" font-weight="700" fill="${COL.ink}" opacity=".7">${label}</text>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="t"><title id="t">${title}</title><rect width="${w}" height="${h}" rx="22" fill="${bg}"/>${floor}${figure(pose)}${lab}</svg>\n`;
}
