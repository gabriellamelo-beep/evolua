'use strict';
/* Ilustração anatômica estilizada (vista anterior e posterior).
   Cada forma é desenhada no lado esquerdo e espelhada para o direito. */

const BODY = {
  front: {
    center: [
      'M100 9 C111 9 115 18 115 28 C115 40 108 48 100 48 C92 48 85 40 85 28 C85 18 89 9 100 9 Z',
      'M91 42 Q100 50 109 42 L111 62 Q100 67 89 62 Z',
    ],
    base: [
      'M46 142 Q40 160 39 184 Q39 192 42 198 L52 198 Q56 176 60 150 Q56 142 46 142 Z',
      'M40 200 Q37 212 40 222 Q46 228 52 220 Q54 210 52 200 Z',
      'M72 184 Q67 200 70 214 Q84 220 99 226 L100 226 L100 200 Q86 198 74 184 Z',
      'M68 322 Q66 334 70 344 Q80 348 90 342 Q92 330 88 320 Q78 326 68 322 Z',
      'M68 346 Q64 372 70 400 L84 402 Q90 374 89 346 Q80 350 68 346 Z',
      'M70 403 Q62 414 66 422 L88 422 Q90 412 85 403 Z',
    ],
    muscles: [
      ['costas', 'M89 60 Q76 61 66 66 Q80 69 92 66 Z'],
      ['ombros', 'M65 66 Q50 67 46 82 Q44 96 48 106 Q56 96 62 88 Q70 78 72 70 Q70 67 65 66 Z'],
      ['peito', 'M99 70 Q84 66 73 70 Q64 80 63 94 Q66 106 80 110 Q92 111 99 106 Z'],
      ['biceps', 'M48 108 Q43 122 44 138 Q48 145 56 142 Q61 126 61 110 Q58 98 54 100 Q50 102 48 108 Z'],
      ['abdomen', 'M98 114 L84 114 Q80 140 81 168 Q84 190 98 200 Z'],
      ['abdomen', 'M80 112 Q70 114 67 128 Q66 156 73 178 Q77 184 81 184 Q77 150 80 112 Z'],
      ['abdutores', 'M70 190 Q63 204 63 226 Q66 222 72 214 Q75 202 70 190 Z'],
      ['quadriceps', 'M71 210 Q60 240 62 288 Q65 314 78 320 Q88 316 89 298 Q90 262 87 230 Q80 216 71 210 Z'],
      ['adutores', 'M88 226 Q97 226 99 234 Q99 262 92 292 Q90 268 88 236 Z'],
      ['panturrilhas', 'M67 348 Q61 366 65 386 Q70 374 72 352 Z'],
      ['panturrilhas', 'M88 350 Q93 368 88 388 Q85 370 85 352 Z'],
    ],
    lines: ['M84 135 L98 135', 'M83 157 L98 157'],
  },
  back: {
    center: [
      'M100 9 C111 9 115 18 115 28 C115 40 108 48 100 48 C92 48 85 40 85 28 C85 18 89 9 100 9 Z',
      'M91 42 L109 42 L110 56 L90 56 Z',
    ],
    base: [
      'M46 142 Q40 160 39 184 Q39 192 42 198 L52 198 Q56 176 60 150 Q56 142 46 142 Z',
      'M40 200 Q37 212 40 222 Q46 228 52 220 Q54 210 52 200 Z',
      'M68 322 Q66 330 68 340 L90 340 Q92 330 90 320 Q80 326 68 322 Z',
      'M66 386 Q66 398 70 402 L84 402 Q88 394 86 386 Q76 396 66 386 Z',
      'M70 403 Q62 414 66 422 L88 422 Q90 412 85 403 Z',
      'M72 168 Q68 176 70 182 L88 178 Q92 170 90 162 Z',
    ],
    muscles: [
      ['costas', 'M100 46 L91 50 Q86 60 66 66 Q80 72 90 88 L100 112 Z'],
      ['ombros', 'M65 66 Q50 68 46 84 Q46 98 49 104 Q56 92 64 84 Q70 76 70 70 Z'],
      ['costas', 'M74 84 Q64 98 66 120 Q70 146 86 166 Q92 156 96 136 L92 108 Q86 92 74 84 Z'],
      ['triceps', 'M48 106 Q43 122 44 138 Q49 145 57 142 Q62 126 60 108 Q56 98 52 100 Q49 102 48 106 Z'],
      ['lombar', 'M99 136 Q92 140 90 150 Q88 170 91 190 L99 194 Z'],
      ['abdutores', 'M72 180 Q64 188 64 204 Q70 197 82 191 Q88 187 86 182 Q80 177 72 180 Z'],
      ['gluteos', 'M99 196 Q80 188 70 202 Q62 222 70 238 Q84 250 99 242 Z'],
      ['posteriores', 'M70 244 Q62 268 64 298 Q68 318 80 324 Q90 318 92 298 Q94 272 92 252 Q82 252 70 244 Z'],
      ['adutores', 'M93 252 Q99 252 99 262 Q98 282 93 298 Q95 274 93 252 Z'],
      ['panturrilhas', 'M67 340 Q58 360 63 384 Q72 394 79 382 Q80 360 79 342 Q73 336 67 340 Z'],
      ['panturrilhas', 'M81 342 Q91 342 91 358 Q91 378 83 390 Q80 366 81 342 Z'],
    ],
    lines: [],
  },
};

/* levels: {músculo: 0..4}. opts: {interactive, selected, small} */
function bodySVG(view, levels, opts = {}) {
  const b = BODY[view];
  const half = [
    ...b.base.map(d => `<path class="b-base" d="${d}"/>`),
    ...b.muscles.map(([m, d]) => `<path class="mus lv${levels[m] || 0}${opts.selected === m ? ' sel' : ''}" data-m="${m}" d="${d}"${opts.interactive ? ` data-act="muscle"` : ''}><title>${mName(m)}</title></path>`),
    ...b.lines.map(d => `<path class="b-line" d="${d}"/>`),
  ].join('');
  return `<svg class="body${opts.small ? ' small' : ''}" viewBox="30 4 140 422" role="img" aria-label="Mapa muscular — vista ${view === 'front' ? 'anterior' : 'posterior'}">
    ${b.center.map(d => `<path class="b-base" d="${d}"/>`).join('')}
    <g>${half}</g><g transform="translate(200 0) scale(-1 1)">${half}</g>
  </svg>`;
}

function bodyPair(levels, opts = {}) {
  const view = opts.view || 'both';
  const fig = v => `<figure class="body-fig">${bodySVG(v, levels, opts)}${opts.small ? '' : `<figcaption>${v === 'front' ? 'Frente' : 'Costas'}</figcaption>`}</figure>`;
  return `<div class="body-pair ${view}">${view !== 'back' ? fig('front') : ''}${view !== 'front' ? fig('back') : ''}</div>`;
}

const intensityLegend = () => `<div class="legend"><span>Menos</span>${[0, 1, 2, 3, 4].map(i => `<i class="lv${i}"></i>`).join('')}<span>Mais</span></div>`;
