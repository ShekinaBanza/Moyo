// Generates public/images/exercises/*.svg (start + end positions) and public/images/activities/*.svg.
// Run: node scripts/make-figures.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { COL, band, bar, box, dumbbell, figure, front, scene, side, wall } from './figures.mjs';

const OUT_EX = 'public/images/exercises';
const OUT_ACT = 'public/images/activities';
mkdirSync(OUT_EX, { recursive: true });
mkdirSync(OUT_ACT, { recursive: true });

const BG = { musculation: '#ffedd5', abdominaux: '#fde4e4', mobilite: '#e0f2fe', general: '#dcfce7' };

// ---- reusable bases ----
const stand = (o = {}) => side({ head: [122, 32], sh: [120, 48], hip: [120, 88], near: { arm: [[120, 70], [122, 90]], leg: [[120, 114], [120, 138]] }, ...o });
const quad = (o = {}) => side({ head: [158, 92], sh: [140, 100], hip: [92, 100], near: { arm: [[140, 118], [140, 136]], leg: [[92, 136], [62, 134]] }, ...o });
const plank = (o = {}) => side({ head: [162, 92], sh: [150, 98], hip: [108, 112], near: { arm: [[151, 118], [152, 136]], leg: [[76, 122], [44, 132]] }, ...o });
const lyingBack = (o = {}) => side({ face: -1, head: [42, 128], sh: [56, 128], hip: [100, 130], near: { arm: [[80, 130], [100, 132]], leg: [[128, 108], [142, 138]] }, ...o });
const frontStand = (o = {}) => front({
    head: [120, 32], neck: [120, 48], pelvis: [120, 88],
    armL: [[102, 48], [98, 70], [98, 92]], armR: [[138, 48], [142, 70], [142, 92]],
    legL: [[111, 88], [108, 114], [106, 138]], legR: [[129, 88], [132, 114], [134, 138]], ...o,
});

// ---- exercises: slug -> {group, mat, start, end, startLabel, endLabel} ----
const EX = {
    'pompes-classiques': { g: 'musculation', mat: true, start: plank(), end: plank({ head: [164, 120], sh: [150, 124], hip: [110, 128], near: { arm: [[128, 132], [152, 136]], leg: [[78, 130], [44, 134]] } }) },
    'pompes-inclinees': {
        g: 'musculation',
        start: side({ head: [162, 50], sh: [148, 56], hip: [108, 88], near: { arm: [[150, 76], [152, 96]], leg: [[75, 109], [44, 132]] }, eq: [box(140, 96, 44, 44)] }),
        end: side({ head: [162, 74], sh: [148, 80], hip: [108, 102], near: { arm: [[126, 92], [152, 96]], leg: [[76, 118], [44, 132]] }, eq: [box(140, 96, 44, 44)] }),
    },
    'pompes-genoux': {
        g: 'musculation', mat: true,
        start: side({ head: [162, 92], sh: [150, 98], hip: [118, 119], near: { arm: [[151, 118], [152, 136]], leg: [[86, 134], [58, 126]] } }),
        end: side({ head: [164, 118], sh: [150, 124], hip: [118, 131], near: { arm: [[128, 132], [152, 136]], leg: [[88, 136], [60, 128]] } }),
    },
    'tirage-elastique': {
        g: 'musculation', mat: true,
        start: side({ head: [94, 72], sh: [92, 88], hip: [90, 128], near: { arm: [[118, 94], [146, 96]], leg: [[128, 130], [162, 136]] }, eq: [band([146, 96], [162, 132])] }),
        end: side({ head: [94, 72], sh: [92, 88], hip: [90, 128], near: { arm: [[84, 100], [108, 94]], leg: [[128, 130], [162, 136]] }, eq: [band([108, 94], [162, 132])] }),
    },
    'rowing-halteres': {
        g: 'musculation',
        start: side({ head: [158, 56], sh: [142, 62], hip: [100, 82], near: { arm: [[142, 84], [142, 106]], leg: [[108, 112], [104, 138]] }, eq: [dumbbell(142, 108, 90)] }),
        end: side({ head: [158, 56], sh: [142, 62], hip: [100, 82], near: { arm: [[120, 74], [130, 90]], leg: [[108, 112], [104, 138]] }, eq: [dumbbell(130, 92, 90)] }),
    },
    superman: {
        g: 'musculation', mat: true,
        start: side({ head: [156, 128], sh: [140, 128], hip: [100, 130], near: { arm: [[160, 129], [182, 130]], leg: [[72, 131], [46, 132]] } }),
        end: side({ head: [156, 110], sh: [140, 118], hip: [100, 128], near: { arm: [[162, 112], [184, 108]], leg: [[72, 122], [46, 114]] } }),
    },
    'elevations-laterales': {
        g: 'musculation',
        start: frontStand({ eq: [dumbbell(98, 94), dumbbell(142, 94)] }),
        end: frontStand({ armL: [[102, 48], [80, 50], [60, 52]], armR: [[138, 48], [160, 50], [180, 52]], eq: [dumbbell(58, 52, 90), dumbbell(182, 52, 90)] }),
    },
    'developpe-epaules': {
        g: 'musculation',
        start: frontStand({ armL: [[102, 48], [84, 60], [94, 34]], armR: [[138, 48], [156, 60], [146, 34]], eq: [dumbbell(94, 32, 90), dumbbell(146, 32, 90)] }),
        end: frontStand({ armL: [[102, 48], [100, 28], [104, 8]], armR: [[138, 48], [140, 28], [136, 8]], eq: [dumbbell(104, 6, 90), dumbbell(136, 6, 90)] }),
    },
    'curl-biceps': {
        g: 'musculation',
        start: stand({ eq: [dumbbell(122, 94, 90)] }),
        end: stand({ near: { arm: [[120, 70], [136, 56]], leg: [[120, 114], [120, 138]] }, eq: [dumbbell(138, 54, 40)] }),
    },
    'dips-chaise': {
        g: 'musculation',
        start: side({ head: [96, 46], sh: [94, 62], hip: [104, 104], near: { arm: [[86, 82], [80, 100]], leg: [[130, 106], [146, 138]] }, eq: [box(30, 100, 52, 40)] }),
        end: side({ head: [96, 68], sh: [94, 84], hip: [104, 122], near: { arm: [[72, 94], [80, 100]], leg: [[130, 118], [146, 138]] }, eq: [box(30, 100, 52, 40)] }),
    },
    squat: {
        g: 'musculation',
        start: stand({ near: { arm: [[134, 58], [150, 60]], leg: [[120, 114], [120, 138]] } }),
        end: side({ head: [118, 52], sh: [112, 68], hip: [96, 106], near: { arm: [[130, 64], [148, 66]], leg: [[132, 108], [120, 138]] } }),
    },
    fentes: {
        g: 'musculation',
        start: stand({ near: { arm: [[106, 74], [116, 92]], leg: [[120, 114], [120, 138]] } }),
        end: side({ head: [121, 42], sh: [118, 58], hip: [118, 98], near: { arm: [[106, 76], [116, 92]], leg: [[152, 106], [154, 138]] }, far: { arm: [[102, 76], [112, 92]], leg: [[96, 126], [72, 122]] } }),
    },
    'chaise-murale': {
        g: 'musculation',
        start: stand({ head: [70, 32], sh: [68, 48], hip: [68, 88], near: { arm: [[68, 70], [70, 90]], leg: [[68, 114], [68, 138]] }, eq: [wall(48)] }),
        end: side({ head: [70, 54], sh: [68, 70], hip: [68, 110], near: { arm: [[84, 92], [100, 104]], leg: [[106, 110], [106, 138]] }, eq: [wall(48)] }),
    },
    'pont-fessier': {
        g: 'musculation', mat: true,
        start: lyingBack(),
        end: lyingBack({ sh: [60, 126], hip: [104, 102], head: [46, 128] }),
    },
    'donkey-kick': {
        g: 'musculation', mat: true,
        start: quad(),
        end: quad({ near: { arm: [[140, 118], [140, 136]], leg: [[98, 114], [98, 84]] }, far: { arm: [[144, 118], [144, 136]], leg: [[92, 136], [62, 134]] } }),
    },
    'tirage-vertical': {
        g: 'musculation',
        start: side({ head: [114, 44], sh: [112, 60], hip: [112, 104], near: { arm: [[124, 40], [132, 22]], leg: [[148, 104], [150, 136]] }, eq: [box(88, 106, 50, 32, '#64748b'), '<line x1="132" y1="0" x2="132" y2="22" stroke="#475569" stroke-width="3"/>', bar(106, 20, 160)] }),
        end: side({ head: [114, 46], sh: [112, 62], hip: [112, 104], near: { arm: [[100, 80], [128, 66]], leg: [[148, 104], [150, 136]] }, eq: [box(88, 106, 50, 32, '#64748b'), '<line x1="130" y1="0" x2="130" y2="66" stroke="#475569" stroke-width="3"/>', bar(108, 66, 152)] }),
    },
    'montees-genoux': {
        g: 'general',
        start: stand({ near: { arm: [[104, 66], [118, 52]], leg: [[120, 114], [120, 138]] }, far: { arm: [[138, 64], [148, 80]], leg: [[120, 114], [120, 138]] } }),
        end: stand({ near: { arm: [[104, 66], [118, 52]], leg: [[150, 92], [150, 120]] }, far: { arm: [[138, 64], [148, 80]], leg: [[120, 114], [120, 138]] } }),
    },
    'mountain-climbers': {
        g: 'general', mat: true,
        start: plank(),
        end: plank({ near: { arm: [[151, 118], [152, 136]], leg: [[136, 112], [124, 128]] }, far: { arm: [[155, 118], [156, 136]], leg: [[76, 122], [44, 132]] } }),
    },
    crunch: {
        g: 'abdominaux', mat: true,
        start: lyingBack({ near: { arm: [[52, 114], [44, 120]], leg: [[128, 108], [142, 138]] } }),
        end: lyingBack({ head: [56, 106], sh: [66, 114], near: { arm: [[58, 96], [50, 100]], leg: [[128, 108], [142, 138]] } }),
    },
    'dead-bug': {
        g: 'abdominaux', mat: true,
        start: lyingBack({ near: { arm: [[56, 108], [56, 86]], leg: [[104, 98], [132, 98]] } }),
        end: lyingBack({ near: { arm: [[36, 126], [16, 128]], leg: [[104, 98], [132, 98]] }, far: { arm: [[56, 108], [56, 86]], leg: [[140, 126], [176, 134]] } }),
    },
    'gainage-ventral': {
        g: 'abdominaux', mat: true,
        start: side({ head: [136, 98], sh: [122, 104], hip: [86, 116], near: { arm: [[122, 136], [148, 136]], leg: [[64, 126], [44, 134]] } }),
        end: side({ head: [136, 112], sh: [122, 118], hip: [90, 128], near: { arm: [[122, 136], [148, 136]], leg: [[66, 136], [42, 126]] } }),
    },
    'gainage-lateral': {
        g: 'abdominaux', mat: true,
        start: side({ head: [136, 98], sh: [122, 104], hip: [86, 116], near: { arm: [[122, 136], [148, 136]], leg: [[64, 126], [44, 134]] }, far: { arm: [[122, 84], [122, 62]], leg: [[66, 124], [46, 132]] } }),
        end: side({ head: [136, 112], sh: [122, 118], hip: [90, 128], near: { arm: [[122, 136], [148, 136]], leg: [[66, 136], [42, 126]] }, far: { arm: [[122, 98], [122, 76]], leg: [[68, 134], [44, 124]] } }),
    },
    'bird-dog': {
        g: 'abdominaux', mat: true,
        start: quad(),
        end: quad({ near: { arm: [[140, 118], [140, 136]], leg: [[92, 136], [62, 134]] }, far: { arm: [[162, 98], [186, 96]], leg: [[66, 102], [40, 104]] } }),
    },
    'releves-genoux': {
        g: 'abdominaux', mat: true,
        start: lyingBack(),
        end: lyingBack({ hip: [100, 128], near: { arm: [[80, 130], [100, 132]], leg: [[118, 96], [142, 104]] } }),
    },
    'etirement-quadriceps': {
        g: 'mobilite',
        start: stand(),
        end: stand({ near: { arm: [[110, 72], [98, 98]], leg: [[121, 114], [98, 100]] }, far: { arm: [[112, 72], [104, 94]], leg: [[120, 114], [120, 138]] } }),
    },
    'etirement-ischios': {
        g: 'mobilite', mat: true,
        start: side({ head: [82, 70], sh: [80, 86], hip: [80, 128], near: { arm: [[104, 108], [118, 122]], leg: [[118, 130], [156, 134]] } }),
        end: side({ head: [128, 96], sh: [110, 98], hip: [80, 128], near: { arm: [[136, 112], [156, 126]], leg: [[118, 130], [156, 134]] } }),
    },
    'chat-vache': {
        g: 'mobilite', mat: true,
        start: quad({ head: [152, 110], torsoMid: [116, 82] }),
        end: quad({ head: [158, 88], torsoMid: [116, 112] }),
    },
    'rotation-thoracique': {
        g: 'mobilite', mat: true,
        start: quad({ near: { arm: [[150, 84], [158, 94]], leg: [[92, 136], [62, 134]] }, far: { arm: [[140, 118], [140, 136]], leg: [[92, 136], [62, 134]] } }),
        end: quad({ near: { arm: [[152, 66], [158, 90]], leg: [[92, 136], [62, 134]] }, far: { arm: [[140, 118], [140, 136]], leg: [[92, 136], [62, 134]] }, head: [162, 86] }),
    },
    'posture-enfant': {
        g: 'mobilite', mat: true,
        start: side({ head: [92, 54], sh: [90, 70], hip: [84, 114], near: { arm: [[92, 92], [96, 112]], leg: [[106, 134], [74, 136]] } }),
        end: side({ head: [148, 124], sh: [132, 122], hip: [82, 120], near: { arm: [[160, 128], [188, 134]], leg: [[104, 134], [72, 136]] } }),
    },
};

export const SLUGS = Object.keys(EX);
const TITLE = (slug) => slug.replaceAll('-', ' ');
for (const [slug, e] of Object.entries(EX)) {
    const opt = { bg: BG[e.g], mat: e.mat };
    writeFileSync(`${OUT_EX}/${slug}-start.svg`, scene(e.start, { ...opt, label: 'Départ', title: `${TITLE(slug)} : position de départ` }));
    writeFileSync(`${OUT_EX}/${slug}-end.svg`, scene(e.end, { ...opt, label: 'Arrivée', title: `${TITLE(slug)} : position finale` }));
}

// ---- category covers + banner (composed from the same figures) ----
const group = (pose, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${figure(pose)}</g>`;
const cover = (name, bg, pose, title, bbox = [20, 20, 200, 142]) => {
    const [x1, y1, x2, y2] = bbox;
    const s = Math.min(170 / (x2 - x1), 96 / (y2 - y1));
    const tx = 120 - ((x1 + x2) / 2) * s;
    const ty = 76 - ((y1 + y2) / 2) * s;
    writeFileSync(`${OUT_EX}/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160" role="img" aria-labelledby="t"><title id="t">${title}</title><rect width="240" height="160" rx="22" fill="${bg}"/>${group(pose, tx, ty, s)}</svg>\n`);
};
cover('cat-musculation', BG.musculation, EX['pompes-classiques'].start, 'Catégorie musculation : pompes', [30, 80, 180, 140]);
cover('cat-abdominaux', BG.abdominaux, EX['gainage-ventral'].start, 'Catégorie abdominaux : gainage', [30, 90, 160, 140]);
cover('cat-mobilite', BG.mobilite, EX['chat-vache'].start, 'Catégorie mobilité : chat-vache', [40, 70, 180, 140]);
cover('cat-general', BG.general, EX['montees-genoux'].end, 'Catégorie renforcement général : montées de genoux', [90, 22, 170, 142]);
const banner = [
    group(EX.squat.end, -6, 6, 0.74), group(EX['curl-biceps'].end, 78, 12, 0.7), group(EX['gainage-ventral'].start, 150, 36, 0.62),
].join('');
writeFileSync(`${OUT_EX}/banner.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 160" role="img" aria-labelledby="t"><title id="t">Trois personnes à l'entraînement : squat, curl avec haltère et gainage</title><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ccfbf1"/><stop offset="1" stop-color="#fde8c8"/></linearGradient></defs><rect width="400" height="160" rx="26" fill="url(#g)"/><line x1="16" y1="141" x2="384" y2="141" stroke="${COL.floor}" stroke-width="3" stroke-linecap="round"/>${banner}</svg>\n`);

// ---- activity pictograms (same mannequin, original) ----
const icon = (name, bg, title, pose, bbox, extraBefore = '') => {
    const [x1, y1, x2, y2] = bbox;
    const s = Math.min(92 / (x2 - x1), 92 / (y2 - y1));
    const tx = 60 - ((x1 + x2) / 2) * s;
    const ty = 62 - ((y1 + y2) / 2) * s;
    writeFileSync(`${OUT_ACT}/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-labelledby="t"><title id="t">${title}</title><rect width="120" height="120" rx="28" fill="${bg}"/><g transform="translate(${tx} ${ty}) scale(${s})">${extraBefore}${figure(pose)}</g></svg>\n`);
};
const walkPose = (o = {}) => side({ head: [122, 32], sh: [120, 48], hip: [118, 88], near: { arm: [[108, 68], [98, 88]], leg: [[136, 112], [146, 138]] }, far: { arm: [[132, 68], [142, 86]], leg: [[102, 112], [92, 134]] }, ...o });
const person = [76, 20, 176, 142];
icon('walk', '#dcfce7', 'Marche', walkPose(), person);
icon('hill', '#d1fae5', 'Marche en montée', walkPose(), [60, 10, 190, 150], `<polygon points="40,150 40,128 200,60 200,150" fill="#86efac" opacity=".8" transform="translate(0 6)"/>`);
icon('stairs', '#e0f2fe', 'Escaliers', walkPose({ near: { arm: [[108, 68], [98, 88]], leg: [[140, 98], [150, 112]] }, far: { arm: [[132, 68], [142, 86]], leg: [[108, 114], [100, 138]] } }), [40, 20, 200, 150], `<polygon points="30,150 30,128 80,128 80,112 130,112 130,96 180,96 180,150" fill="#7dd3fc" transform="translate(0 -4)"/>`);
icon('run', '#ffedd5', 'Course à pied', side({ head: [138, 38], sh: [128, 54], hip: [110, 88], near: { arm: [[142, 68], [154, 52]], leg: [[142, 94], [130, 122]] }, far: { arm: [[110, 68], [98, 82]], leg: [[94, 106], [72, 126]] } }), [60, 20, 200, 140]);
icon('bike', '#e0e7ff', 'Vélo', side({ head: [134, 36], sh: [122, 52], hip: [98, 84], near: { arm: [[144, 66], [158, 80]], leg: [[124, 94], [112, 118]] }, far: { arm: [[148, 68], [160, 82]], leg: [[116, 104], [98, 122]] } }), [40, 20, 210, 150],
    `<g fill="none" stroke="${COL.ink}" stroke-width="4" stroke-linecap="round"><circle cx="66" cy="118" r="26"/><circle cx="170" cy="118" r="26"/><path d="M66 118 L98 78 H152 L170 118 M98 78 L116 118 H66 M152 78 L146 62 H160"/></g>`);
icon('dance', '#fce7f3', 'Danse', front({ head: [120, 32], neck: [120, 48], pelvis: [120, 88], armL: [[102, 48], [84, 34], [78, 12]], armR: [[138, 48], [156, 58], [174, 46]], legL: [[111, 88], [104, 114], [100, 138]], legR: [[129, 88], [144, 106], [136, 128]] }), [60, 4, 190, 144]);
icon('ball', '#f1f5f9', 'Football', side({ head: [112, 34], sh: [114, 50], hip: [112, 88], near: { arm: [[132, 62], [150, 68]], leg: [[132, 110], [112, 138]] }, far: { arm: [[96, 66], [82, 80]], leg: [[140, 98], [166, 112]] } }), [60, 20, 210, 142], `<circle cx="184" cy="126" r="11" fill="#fff" stroke="${COL.ink}" stroke-width="3"/><path d="M184 119 l6 4.5 -2.3 7 h-7.4 l-2.3 -7z" fill="${COL.ink}"/>`);
icon('home', '#fef3c7', 'Travaux ménagers', stand({ near: { arm: [[126, 68], [142, 82]], leg: [[120, 114], [120, 138]] } }), [70, 20, 200, 142], `<line x1="148" y1="52" x2="164" y2="136" stroke="${COL.wood}" stroke-width="5" stroke-linecap="round"/><path d="M156 128 l22 4 -4 12 -26 -4z" fill="#f59e0b"/>`);
icon('broom', '#ecfccb', 'Nettoyage', side({ head: [140, 54], sh: [128, 64], hip: [102, 90], near: { arm: [[148, 82], [164, 96]], leg: [[112, 116], [108, 138]] } }), [70, 30, 210, 142], `<line x1="160" y1="70" x2="182" y2="134" stroke="${COL.wood}" stroke-width="5" stroke-linecap="round"/><rect x="170" y="130" width="28" height="9" rx="4" fill="#60a5fa"/>`);
icon('garden', '#dcfce7', 'Jardinage', side({ head: [138, 52], sh: [126, 62], hip: [100, 90], near: { arm: [[148, 80], [158, 100]], leg: [[112, 116], [110, 138]] } }), [70, 30, 200, 142], `<line x1="160" y1="70" x2="176" y2="132" stroke="${COL.wood}" stroke-width="5" stroke-linecap="round"/><path d="M168 130 l22 -2 -6 14 -18 0z" fill="#94a3b8"/><path d="M186 140 q10 -14 20 0z" fill="#22c55e"/>`);
icon('work', '#fee2e2', 'Travail physique', stand({ near: { arm: [[136, 44], [150, 24]], leg: [[120, 114], [120, 138]] }, far: { arm: [[132, 70], [146, 80]], leg: [[120, 114], [120, 138]] } }), [80, 6, 190, 142], `<rect x="146" y="14" width="26" height="12" rx="2" fill="#64748b" transform="rotate(-20 150 22)"/>`);
icon('desk', '#e2e8f0', 'Travail assis', side({ head: [102, 48], sh: [100, 64], hip: [96, 104], near: { arm: [[122, 82], [150, 88]], leg: [[130, 104], [132, 138]] } }), [60, 30, 220, 144],
    `<rect x="70" y="106" width="34" height="6" rx="3" fill="${COL.wood}"/><line x1="86" y1="112" x2="86" y2="140" stroke="${COL.wood}" stroke-width="4"/><rect x="146" y="92" width="74" height="6" rx="3" fill="${COL.wood}"/><line x1="214" y1="98" x2="214" y2="140" stroke="${COL.wood}" stroke-width="4"/><rect x="170" y="70" width="28" height="20" rx="2" fill="#fff" stroke="${COL.ink}" stroke-width="3"/>`);
icon('other', '#f3e8ff', 'Autre activité', frontStand({ armL: [[102, 48], [98, 28], [104, 8]], armR: [[138, 48], [142, 28], [136, 8]] }), [80, 0, 160, 142]);
icon('strength', '#ffedd5', 'Séance de musculation', EX['curl-biceps'].end, [80, 20, 170, 142]);
icon('abs', '#fde4e4', 'Abdominaux et gainage', EX['gainage-ventral'].start, [30, 90, 160, 142]);
icon('stretch', '#e0f2fe', 'Mobilité et étirements', EX['etirement-quadriceps'].end, [80, 20, 160, 142]);
icon('circuit', '#dcfce7', 'Renforcement général', EX['montees-genoux'].end, [90, 22, 170, 142]);
console.log(`${SLUGS.length} exercises x2, 4 covers, 1 banner, 13 activity icons`);
