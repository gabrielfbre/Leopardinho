#!/usr/bin/env node
/*
 * Extrai todas as artes do jogo (que são desenhadas por código no <canvas>)
 * para PNGs com fundo transparente, na pasta artes/.
 *
 * Uso:  node ferramentas/extrair-artes.js
 *
 * Como funciona: carrega uma cópia do index.html no Chromium (Playwright),
 * expõe as funções de desenho do jogo e chama cada uma num canvas separado,
 * recortando o resultado. Também gera um manifest.json com o tamanho e o
 * "ponto de apoio" (âncora) de cada sprite, para a gente reimplantar as
 * artes novas depois no lugar exato das antigas.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'artes');

function instrumentar(html) {
  const troca = (de, para) => {
    if (!html.includes(de)) throw new Error('Trecho não encontrado no index.html: ' + de.slice(0, 60));
    html = html.split(de).join(para);
  };
  // ctx precisa ser trocável para desenharmos em canvas separados
  troca("const cv=$('game'), ctx=cv.getContext('2d');", "const cv=$('game'); let ctx=cv.getContext('2d');");
  // para o loop do jogo para ele não desenhar por cima
  troca('function frame(now){', 'function frame(now){if(window.__ARTSTOP)return;');
  // permite desenhar só um elemento (árvore, arbusto...) de cada vez
  troca('for(let i=i0;i<=i1;i++){', 'for(let i=i0;i<=i1;i++){if(window.__ONLY!=null&&i!==window.__ONLY)continue;');
  const hook = `
window.__ART={
  setCtx(c){ctx=c;},
  set(o){if('cam' in o)cam=o.cam;if('GY' in o)GY=o.GY;if('VW' in o)VW=o.VW;if('VH' in o)VH=o.VH;if('T' in o)T=o.T;
    if('theme' in o)TH=THEMES[o.theme];if('mode' in o)mode=o.mode;},
  setEnv,env,WX,race,birds,SKINS,ACCS,RIVALS,THEMES,THEME_IDS,OBS,FRUTAS,POW,UPG,
  drawLeopard,drawRollBall,drawFruit,drawObstacle,drawItem,drawMonkey,drawBirds,drawSky,drawHills,drawFarTrees,
  drawTrees,drawBushes,drawGround,drawBeachFriends,drawForeground,drawFinish,heart,star,rr,
  gsrc(){return GSRC;}
};
`;
  const fim = 'requestAnimationFrame(frame);\n})();';
  troca(fim, 'requestAnimationFrame(frame);\n' + hook + '})();');
  return html;
}

/* ---------- código que roda dentro da página ---------- */
function paginaExtrair() {
  const A = window.__ART;
  window.__ARTSTOP = true;
  const PI = Math.PI, TAU = PI * 2;
  const saida = []; // {arquivo, dataURL}
  const manifest = { versao: 1, observacao: '', grupos: {} };

  const rnd = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function bbox(c) {
    const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) { const row = y * w * 4;
      for (let x = 0; x < w; x++) if (d[row + x * 4 + 3] > 3) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }
  function uniao(bs) { bs = bs.filter(Boolean); return bs.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) })); }
  function recorta(c, b, pad) {
    const x0 = Math.max(0, b.x0 - pad), y0 = Math.max(0, b.y0 - pad), x1 = Math.min(c.width, b.x1 + pad), y1 = Math.min(c.height, b.y1 + pad);
    const o = mk(x1 - x0, y1 - y0); o.getContext('2d').drawImage(c, -x0, -y0); return { c: o, x0, y0 };
  }
  /*
   * Desenha uma lista de quadros com a mesma origem e recorta todos com a
   * mesma caixa (para as animações ficarem alinhadas).
   *   itens: [{nome, draw(ctx)}]  — o ctx já vem com origem (0,0) no ponto de apoio e escala R
   */
  function grupo(id, pasta, itens, o) {
    o = Object.assign({ W: 1000, H: 1000, OX: 500, OY: 800, R: 4, pad: 6, junto: true, ancora: 'pés (base) do desenho' }, o || {});
    const cs = itens.map(it => {
      const c = mk(o.W, o.H), x = c.getContext('2d');
      x.setTransform(o.R, 0, 0, o.R, o.OX, o.OY);
      A.setCtx(x); it.draw(x);
      return c;
    });
    const caixas = cs.map(bbox);
    const g = { pasta, escala_px_por_unidade: o.R, ancora_descricao: o.ancora, quadros: [] };
    const comum = o.junto ? uniao(caixas) : null;
    cs.forEach((c, i) => {
      const b = comum || caixas[i]; if (!b) return;
      const r = recorta(c, b, o.pad), arq = pasta + '/' + itens[i].nome + '.png';
      saida.push({ arquivo: arq, data: r.c.toDataURL('image/png') });
      g.quadros.push(Object.assign({ arquivo: arq, largura: r.c.width, altura: r.c.height,
        ancora_x: o.OX - r.x0, ancora_y: o.OY - r.y0 }, itens[i].info || {}));
    });
    manifest.grupos[id] = g;
    return { canvases: cs, comum };
  }

  const cena = (theme, extra) => { A.set(Object.assign({ theme, cam: 0, T: 0, GY: 0, VW: 2000, VH: 2000, mode: 'aventura' }, extra || {}));
    A.WX.rb = 0; A.WX.ck = 0; A.WX.wk = 0; A.setEnv(0); };
  cena('floresta');

  /* ===== personagens (leopardos e rivais) ===== */
  const RUN = 8;
  function poses(sk, acc) {
    const L = [];
    const base = { air: false, vy: 0, stumble: 0, blink: 0, acc: acc || '' };
    L.push({ nome: 'parado', p: Object.assign({}, base, { phase: 0, t: 0 }) });
    for (let k = 0; k < RUN; k++) { const ph = k * TAU / RUN;
      L.push({ nome: 'correndo_' + String(k + 1).padStart(2, '0'), p: Object.assign({}, base, { phase: ph, t: k / RUN * (TAU / 6) }), info: { animacao: 'correndo', quadro: k + 1, de: RUN } }); }
    L.push({ nome: 'pulando_subindo', p: Object.assign({}, base, { phase: 0, t: 0, air: true, vy: 700 }) });
    L.push({ nome: 'pulando_descendo', p: Object.assign({}, base, { phase: 0, t: 0, air: true, vy: -700 }) });
    L.push({ nome: 'piscando', p: Object.assign({}, base, { phase: 0, t: 0, blink: 1 }) });
    L.push({ nome: 'tropecando', p: Object.assign({}, base, { phase: 0, t: 0, stumble: 1 }) });
    const itens = L.map(q => ({ nome: q.nome, info: q.info, draw: c => A.drawLeopard(c, 0, 0, 1, sk, q.p) }));
    itens.push({ nome: 'bolinha_rolando', info: { obs: 'gira no jogo' }, draw: c => A.drawRollBall(c, 0, 0, 1, sk, 0) });
    return itens;
  }
  A.SKINS.forEach(sk => grupo('leopardo_' + sk.id, 'personagens/' + sk.id + '_' + slug(sk.name), poses(sk)));
  A.RIVALS.forEach(sk => grupo('rival_' + slug(sk.name), 'rivais/' + slug(sk.name), poses(sk)));

  /* ===== acessórios (no Leo) ===== */
  const leo = A.SKINS[0];
  {
    const parado = { phase: 0, t: 0, air: false, vy: 0, stumble: 0, blink: 0 };
    const itens = [{ nome: '_leo_sem_acessorio', draw: c => A.drawLeopard(c, 0, 0, 1, leo, parado) }]
      .concat(A.ACCS.map(a => ({ nome: 'leo_com_' + a.id, info: { acessorio: a.id, nome: a.name }, draw: c => A.drawLeopard(c, 0, 0, 1, leo, Object.assign({ acc: a.id }, parado)) })));
    const r = grupo('acessorios_no_leo', 'acessorios/no_leo', itens);
    // camada só do acessório = pixels que mudaram em relação ao Leo sem acessório
    const semAcc = r.canvases[0].getContext('2d').getImageData(0, 0, 1000, 1000).data;
    const iso = A.ACCS.map((a, i) => ({ nome: a.id, info: { acessorio: a.id, nome: a.name }, src: r.canvases[i + 1] }));
    grupo('acessorios_isolados', 'acessorios/so_o_acessorio', iso.map(q => ({ nome: q.nome, info: q.info, draw: c => {
      c.setTransform(1, 0, 0, 1, 0, 0);
      const d = q.src.getContext('2d').getImageData(0, 0, 1000, 1000), p = d.data;
      for (let k = 0; k < p.length; k += 4) {
        const dif = Math.abs(p[k] - semAcc[k]) + Math.abs(p[k + 1] - semAcc[k + 1]) + Math.abs(p[k + 2] - semAcc[k + 2]) + Math.abs(p[k + 3] - semAcc[k + 3]);
        if (dif < 24) p[k + 3] = 0;
      }
      c.putImageData(d, 0, 0);
    } })), { junto: true, ancora: 'mesma âncora dos sprites do leopardo (pés)' });
  }

  /* ===== frutas ===== */
  const frutas = ['morango', 'ouro'].concat(A.FRUTAS);
  grupo('frutas', 'frutas', frutas.map(k => ({ nome: k === 'ouro' ? 'morango_dourado' : k, info: { tipo: k },
    draw: c => A.drawFruit(c, k, 0, 0, 1, 0) })), { W: 400, H: 400, OX: 200, OY: 200, R: 6, junto: false, ancora: 'centro da fruta' });
  // pedra que cai no modo Chuva
  grupo('pedra_que_cai', 'frutas', [{ nome: 'pedra_que_cai', draw: c => {
    c.fillStyle = '#8E99A8'; c.beginPath(); c.moveTo(-15, 4); c.quadraticCurveTo(-16, -12, -2, -14); c.quadraticCurveTo(15, -13, 15, 0); c.quadraticCurveTo(14, 13, 0, 13); c.quadraticCurveTo(-14, 14, -15, 4); c.fill();
    c.fillStyle = '#B4BECC'; c.beginPath(); c.ellipse(-4, -6, 6, 3.5, -.4, 0, TAU); c.fill(); c.fillStyle = '#6E7787'; c.beginPath(); c.arc(6, 5, 3, 0, TAU); c.fill(); } }],
    { W: 400, H: 400, OX: 200, OY: 200, R: 6, ancora: 'centro (gira no jogo)' });

  /* ===== poderes (itens que flutuam) ===== */
  grupo('poderes', 'poderes', ['ima', 'estrela', 'chuva'].map(k => ({ nome: k === 'chuva' ? 'nuvem_de_frutas' : k, info: { tipo: k },
    draw: c => { A.set({ cam: 0, GY: 0, T: 0 }); A.drawItem({ x: 0, h: 0, kind: k, ph: 0 }); } })),
    { W: 500, H: 500, OX: 250, OY: 250, R: 5, junto: false, ancora: 'centro do item' });

  /* ===== obstáculos ===== */
  {
    const itens = [];
    Object.keys(A.OBS).forEach(k => { const o = A.OBS[k];
      const gy = k === 'galho' ? 300 : 0;
      itens.push({ nome: k, info: { tipo: k, largura_jogo: o.w, altura_jogo: o.h, obs: k === 'galho' ? 'o cipó vai até o topo da tela' : undefined },
        draw: c => { cena('floresta', { GY: gy }); c.translate(0, -gy); A.drawObstacle({ x: 0, k, w: o.w, h: o.h, over: o.over, flat: !!o.flat }); } }); });
    ['pedra', 'toco'].forEach(k => { const o = A.OBS[k];
      itens.push({ nome: k + '_neve', info: { tipo: k, tema: 'neve' }, draw: () => { cena('neve', { GY: 0 }); A.drawObstacle({ x: 0, k, w: o.w, h: o.h }); } }); });
    grupo('obstaculos', 'obstaculos', itens, { W: 1100, H: 1400, OX: 550, OY: 1250, R: 4, junto: false, ancora: 'centro da base, no nível do chão' });
    cena('floresta');
  }

  /* ===== céu ===== */
  grupo('ceu', 'ceu', [
    { nome: 'sol', draw: c => {
      const gl = c.createRadialGradient(0, 0, 10, 0, 0, 120); gl.addColorStop(0, 'rgba(255,240,170,.75)'); gl.addColorStop(1, 'rgba(255,240,170,0)');
      c.fillStyle = gl; c.beginPath(); c.arc(0, 0, 120, 0, TAU); c.fill();
      c.save(); c.fillStyle = 'rgba(255,226,110,.55)'; for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(-6, -40); c.lineTo(0, -62); c.lineTo(6, -40); c.fill(); } c.restore();
      c.fillStyle = '#FFE66D'; c.beginPath(); c.arc(0, 0, 36, 0, TAU); c.fill(); c.fillStyle = '#FFF3A6'; c.beginPath(); c.arc(-9, -9, 20, 0, TAU); c.fill(); } },
    { nome: 'lua', draw: c => {
      const gl = c.createRadialGradient(0, 0, 10, 0, 0, 90); gl.addColorStop(0, 'rgba(220,230,255,.5)'); gl.addColorStop(1, 'rgba(220,230,255,0)');
      c.fillStyle = gl; c.beginPath(); c.arc(0, 0, 90, 0, TAU); c.fill(); c.fillStyle = '#F6F2CF'; c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.fill();
      c.fillStyle = 'rgba(200,196,160,.6)'; [[-10, -8, 6], [9, 4, 8], [-4, 13, 4]].forEach(q => { c.beginPath(); c.arc(q[0], q[1], q[2], 0, TAU); c.fill(); }); } },
    ...[['nuvem', '#fff'], ['nuvem_rosa_doces', '#FFE3F1'], ['nuvem_azul_doces', '#E6F4FF']].map(([n, col]) => ({ nome: n, draw: c => {
      c.globalAlpha = .92; c.fillStyle = col; const s = 1.1; c.beginPath(); c.arc(0, 0, 22 * s, 0, TAU); c.arc(26 * s, -10 * s, 28 * s, 0, TAU); c.arc(58 * s, 0, 24 * s, 0, TAU); c.arc(28 * s, 8 * s, 24 * s, 0, TAU); c.fill(); c.globalAlpha = 1; } })),
    ...[['nuvem_de_chuva', '#8C97AE', '#7A859C'], ['nuvem_de_chuva_doces', '#E8C9F0', '#D9B2E6']].map(([n, a, b]) => ({ nome: n, draw: c => {
      const s2 = 1.2, y = 0; c.globalAlpha = .9; c.fillStyle = a; c.beginPath(); c.arc(0, y, 30 * s2, 0, TAU); c.arc(38 * s2, y - 8, 36 * s2, 0, TAU); c.arc(78 * s2, y + 4, 30 * s2, 0, TAU); c.fill();
      c.fillStyle = b; c.beginPath(); c.ellipse(40 * s2, y + 24, 62 * s2, 14, 0, 0, TAU); c.fill(); c.globalAlpha = 1; } })),
    { nome: 'arco_iris', draw: c => { const R = 420; ['#FF5A5A', '#FFA94D', '#FFE066', '#69DB7C', '#4DABF7', '#9775FA'].forEach((col, k) => {
      c.strokeStyle = col; c.globalAlpha = .55; c.lineWidth = 11; c.beginPath(); c.arc(0, 0, R - k * 11, PI * 1.05, PI * 1.95); c.stroke(); }); c.globalAlpha = 1; } }
  ], { W: 2000, H: 1400, OX: 1000, OY: 1000, R: 2, junto: false, ancora: 'centro (sol/lua) ou ponto de referência do desenho' });

  /* ===== bichinhos do cenário ===== */
  {
    const itens = [];
    const cores = { laranja: '#FF8A65', azul: '#4FC3F7', amarelo: '#FFD54F', roxo: '#BA68C8', verde: '#81C784' };
    Object.entries(cores).forEach(([n, col]) => [0, 1, 2, 3].forEach(f => itens.push({ nome: 'passarinho_' + n + '_' + (f + 1), info: { animacao: 'passarinho_' + n, quadro: f + 1, de: 4 },
      draw: () => { cena('floresta'); A.birds.length = 0; const ph = f * PI / 2; A.birds.push({ x: 0, y: -Math.sin(ph * .3) * 5, dir: 1, n: 1, v: 0, ph, col }); A.drawBirds(); A.birds.length = 0; } })));
    [0, 1, 2, 3].forEach(f => itens.push({ nome: 'gaivota_' + (f + 1), info: { animacao: 'gaivota', quadro: f + 1, de: 4, temas: 'praia, neve' },
      draw: () => { cena('praia'); A.birds.length = 0; const ph = f * PI / 2; A.birds.push({ x: 0, y: -Math.sin(ph * .3) * 5, dir: 1, n: 1, v: 0, ph, col: '#fff' }); A.drawBirds(); A.birds.length = 0; } }));
    itens.push({ nome: 'macaquinho', info: { temas: 'floresta, mística', obs: 'pendurado pelo cipó; o galho fica 40 unidades acima da âncora' }, draw: c => { cena('floresta'); c.translate(0, -40); A.drawMonkey(0, 0, 0); } });
    ['#FF8FB1', '#FFD166', '#8ECDF7', '#C8A2FF'].forEach((col, i) => [1, .5, .1].forEach((f, j) => itens.push({ nome: 'borboleta_' + (i + 1) + '_' + (j + 1), info: { animacao: 'borboleta_' + (i + 1), quadro: j + 1, de: 3 },
      draw: c => { c.fillStyle = col; c.beginPath(); c.ellipse(-5 * f, -3, 6 * f + 1, 8, -.4, 0, TAU); c.ellipse(5 * f, -3, 6 * f + 1, 8, .4, 0, TAU); c.fill(); c.fillStyle = '#5b3a1e'; c.fillRect(-1, -7, 2, 10); } })));
    itens.push({ nome: 'vagalume', draw: c => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 13); g.addColorStop(0, 'rgba(240,255,140,1)'); g.addColorStop(1, 'rgba(240,255,140,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill(); } });
    [0, 1, 2, 3].forEach(fq => itens.push({ nome: 'amiguinho_passaro_' + (fq + 1), info: { animacao: 'amiguinho', quadro: fq + 1, de: 4, obs: 'upgrade Amiguinho' }, draw: c => {
      const f = Math.sin(fq * PI / 2);
      c.fillStyle = '#4FC3F7'; c.beginPath(); c.ellipse(0, 0, 11, 8, 0, 0, TAU); c.fill();
      c.fillStyle = '#FFD54F'; c.beginPath(); c.ellipse(2, 3, 6, 4.5, 0, 0, TAU); c.fill();
      c.fillStyle = '#4FC3F7'; c.beginPath(); c.arc(9, -5, 6.5, 0, TAU); c.fill();
      c.fillStyle = '#FF8A1F'; c.beginPath(); c.moveTo(14, -5); c.lineTo(20, -3); c.lineTo(14, -1); c.fill();
      c.fillStyle = '#222'; c.beginPath(); c.arc(11, -7, 1.5, 0, TAU); c.fill();
      c.fillStyle = '#29B6F6'; c.beginPath(); c.moveTo(-2, -2); c.quadraticCurveTo(-8, -16 * f - 4, 4, -18 * f); c.lineTo(5, -2); c.fill();
      c.fillStyle = '#0288D1'; c.beginPath(); c.moveTo(-10, 0); c.lineTo(-18, -4); c.lineTo(-17, 4); c.fill(); } }));
    grupo('bichinhos', 'bichinhos', itens, { W: 600, H: 600, OX: 300, OY: 300, R: 5, junto: false, ancora: 'centro do bichinho' });
    // caranguejo (praia) e pinguim (neve): desenhados pelo próprio jogo
    const amigo = (tema, nome) => {
      let i0 = 0; while (rnd(i0, 251) < .35) i0++;
      const dx = rnd(i0, 252) * 260 + Math.sin(i0) * 22, dy = 20 + rnd(i0, 253) * 14 - (tema === 'neve' ? 6 : 0);
      return { nome, info: { tema }, draw: c => { cena(tema, { GY: 0, VW: 3000, cam: i0 * 560 }); c.translate(-dx, -dy); window.__ONLY = i0; A.drawBeachFriends(); window.__ONLY = null; } };
    };
    grupo('amigos_do_chao', 'bichinhos', [amigo('praia', 'caranguejo'), amigo('neve', 'pinguim')], { W: 600, H: 600, OX: 300, OY: 300, R: 5, junto: false, ancora: 'centro do bichinho' });
  }

  /* ===== linha de chegada e bandeiras ===== */
  grupo('chegada', 'chegada', [
    { nome: 'chegada_fim_da_fase', draw: () => { cena('floresta', { mode: 'aventura' }); A.race.finish = 0; A.drawFinish(); } },
    { nome: 'chegada_corrida', draw: () => { cena('floresta', { mode: 'corrida' }); A.race.finish = 0; A.drawFinish(); } },
    { nome: 'chegada_sem_texto', draw: c => {
      for (let k = 0; k < 6; k++) { c.fillStyle = k % 2 ? '#fff' : '#222'; c.fillRect(-6 + (k % 2) * 6, -6 + k * 4, 6, 4); c.fillStyle = k % 2 ? '#222' : '#fff'; c.fillRect(-(k % 2) * 6, -6 + k * 4, 6, 4); }
      c.fillStyle = '#E63946'; c.fillRect(-36, -190, 8, 190); c.fillRect(28, -190, 8, 190);
      for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) { c.fillStyle = (r + k) % 2 ? '#fff' : '#222'; c.fillRect(-36 + k * 9, -200 + r * 9, 9, 9); } } },
    ...[['bandeira_checkpoint', '#E63946', false], ['bandeira_checkpoint_ok', '#2fbf55', true]].map(([n, col, ok]) => ({ nome: n, draw: c => {
      c.fillStyle = '#8a8f99'; c.fillRect(-3, -118, 6, 120);
      c.fillStyle = col; c.beginPath(); c.moveTo(3, -118); c.quadraticCurveTo(24, -112, 42, -104); c.lineTo(3, -88); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -120, 5, 0, TAU); c.fill();
      if (ok) { c.font = '900 16px ui-rounded,system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('✓', 18, -104); } } }))
  ], { W: 800, H: 1100, OX: 400, OY: 1000, R: 4, junto: false, ancora: 'centro da base, no nível do chão' });
  A.set({ mode: 'aventura' });

  /* ===== interface ===== */
  grupo('interface', 'interface', [
    { nome: 'coracao_vida_cheio', draw: c => { c.fillStyle = 'rgba(255,255,255,.85)'; A.heart(c, 0, 0, 13); c.fillStyle = '#FF3B6B'; A.heart(c, 0, 0, 10); } },
    { nome: 'coracao_vida_vazio', draw: c => { c.fillStyle = 'rgba(255,255,255,.85)'; A.heart(c, 0, 0, 13); c.fillStyle = '#d9d0d6'; A.heart(c, 0, 0, 10); } },
    { nome: 'estrelinha_brilho', draw: c => { c.fillStyle = '#FFE066'; A.star(c, 0, 0, 12); } }
  ], { W: 400, H: 400, OX: 200, OY: 200, R: 8, junto: false, ancora: 'centro' });

  /* ===== cenários por fase ===== */
  const VW = 960, VH = 540, GYc = VH - Math.max(88, VH * .2);
  const camadas = [['1_ceu', 'drawSky'], ['2_colinas_ou_mar', 'drawHills'], ['3_arvores_ao_fundo', 'drawFarTrees'], ['4_arvores', 'drawTrees'],
    ['5_arbustos', 'drawBushes'], ['6_chao', 'drawGround'], ['7_amigos_do_chao', 'drawBeachFriends'], ['8_folhas_primeiro_plano', 'drawForeground']];
  // [nome, função, parallax, espaçamento, semente do rnd para o x, multiplicador do x]
  const elems = [['arvore_ao_fundo', 'drawFarTrees', .22, 74, 11, 40], ['arvore', 'drawTrees', .48, 170, 21, 90], ['arbusto', 'drawBushes', .75, 128, 52, 70]];
  A.THEME_IDS.forEach(tm => {
    grupo('cenario_' + tm + '_camadas', 'cenario/' + tm + '/camadas', camadas.map(([n, fn]) => ({ nome: n, draw: c => {
      c.translate(-VW / 2, -VH); cena(tm, { VW, VH, GY: GYc }); A[fn](); } })),
      { W: VW * 2, H: VH * 2, OX: VW, OY: VH * 2, R: 2, pad: 0, junto: true, ancora: 'tela inteira 960x540 (unidades do jogo); chão em y=' + GYc });
    // elementos soltos (uma árvore, um arbusto...)
    elems.forEach(([n, fn, p, sp0, seed, mult]) => {
      if (tm === 'praia' && fn === 'drawFarTrees') return;
      const sp = (tm === 'praia' && fn === 'drawTrees') ? 230 : sp0;
      const itens = [];
      for (let i = 0; i < 24; i++) itens.push({ nome: n + '_' + i, draw: c => {
        cena(tm, { VW: 1200, VH: 1200, GY: 0, cam: i * sp / p }); c.translate(-rnd(i, seed) * mult, 0);
        window.__ONLY = i; A[fn](); window.__ONLY = null; } });
      grupo('_tmp', '_tmp', itens, { W: 1500, H: 1500, OX: 750, OY: 1400, R: 3, junto: false });
      const g = manifest.grupos._tmp; delete manifest.grupos._tmp;
      const keep = [];
      g.quadros.forEach(q => {
        const s = saida.splice(saida.findIndex(z => z.arquivo === q.arquivo), 1)[0];
        if (keep.length >= 8) return;
        const arq = 'cenario/' + tm + '/elementos/' + n + '_' + String(keep.length + 1).padStart(2, '0') + '.png';
        saida.push({ arquivo: arq, data: s.data }); keep.push(Object.assign({}, q, { arquivo: arq }));
      });
      manifest.grupos['cenario_' + tm + '_' + n] = { pasta: 'cenario/' + tm + '/elementos', escala_px_por_unidade: 3,
        ancora_descricao: 'ponto de referência no chão (centro do tronco; nos arbustos, a ponta esquerda)', quadros: keep };
    });
  });

  /* ===== ícone do moranguinho dourado (HUD) ===== */
  saida.push({ arquivo: 'interface/moranguinho_dourado_hud.png', data: A.gsrc() });

  return { saida, manifest };
  function slug(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }
}

/* ---------- folhas de contato (uma imagem com tudo de um grupo) ---------- */
function paginaFolha(imgs, titulo, cols, fundo) {
  return new Promise(async res => {
    const els = await Promise.all(imgs.map(src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src.data; })));
    const cw = Math.max(...els.map(i => i.width)), ch = Math.max(...els.map(i => i.height));
    const pad = 24, lab = 34, top = 70;
    cols = Math.min(cols, els.length); const rows = Math.ceil(els.length / cols);
    const c = document.createElement('canvas'); c.width = cols * (cw + pad) + pad; c.height = top + rows * (ch + pad + lab) + pad;
    const x = c.getContext('2d'); x.fillStyle = fundo; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = '#333'; x.font = 'bold 34px sans-serif'; x.fillText(titulo, pad, 48);
    els.forEach((im, k) => { const cx = pad + (k % cols) * (cw + pad), cy = top + Math.floor(k / cols) * (ch + pad + lab);
      x.strokeStyle = '#ccc'; x.strokeRect(cx, cy, cw, ch);
      x.drawImage(im, cx + (cw - im.width) / 2, cy + (ch - im.height) / 2);
      x.fillStyle = '#444'; x.font = '22px sans-serif'; x.fillText(imgs[k].rotulo, cx, cy + ch + 26); });
    res(c.toDataURL('image/jpeg', 0.9));
  });
}

function salvar(arq, dataURL) {
  const p = path.join(OUT, arq); fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, Buffer.from(dataURL.split(',')[1], 'base64'));
}

(async () => {
  const html = instrumentar(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  const tmp = path.join(ROOT, '.extrair-tmp.html');
  fs.writeFileSync(tmp, html);
  for (const d of ['personagens', 'rivais', 'acessorios', 'frutas', 'poderes', 'obstaculos', 'ceu', 'bichinhos', 'chegada', 'interface', 'cenario', 'folhas', 'referencia'])
    fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => console.error('erro na página:', e.message));
    await page.goto('file://' + tmp);
    await page.waitForFunction(() => window.__ART);
    const { saida, manifest } = await page.evaluate(paginaExtrair);
    for (const s of saida) salvar(s.arquivo, s.data);
    manifest.observacao = 'Gerado por ferramentas/extrair-artes.js. Coordenadas em pixels do PNG. ' +
      'ancora_x/ancora_y = ponto do PNG que fica na posição do objeto no jogo. ' +
      'escala_px_por_unidade = quantos pixels do PNG valem 1 unidade do jogo (o leopardo do jogador é desenhado com escala 0.82).';
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
    console.log('PNGs:', saida.length);

    // folhas de contato
    const porPasta = {};
    for (const s of saida) { const d = path.dirname(s.arquivo); (porPasta[d] = porPasta[d] || []).push({ data: s.data, rotulo: path.basename(s.arquivo, '.png') }); }
    let nf = 0;
    await page.addScriptTag({ content: 'window.__folha=' + paginaFolha.toString() });
    for (const [d, imgs] of Object.entries(porPasta)) {
      if (d.includes('/camadas')) continue;
      const cols = imgs.length > 12 ? 5 : Math.min(4, imgs.length);
      const data = await page.evaluate(([a, b, c, f]) => window.__folha(a, b, c, f), [imgs, d, cols, '#f4f4f4']);
      salvar('folhas/' + d.replace(/\//g, '__') + '.jpg', data); nf++;
    }
    console.log('Folhas:', nf);

    // capturas de tela de referência (jogo real, sem modificação)
    for (const tm of ['floresta', 'praia', 'savana', 'neve', 'mistica', 'doces']) {
      const ctxRef = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await ctxRef.addInitScript(tm => { try { localStorage.setItem('leopardinho-v1', JSON.stringify({ total: 0, owned: ['leo'], sel: 'leo', fase: tm, fasesOk: 6, vfx: 0, vmus: 0, nome: 'Teste', nomeSkip: true })); } catch (e) {} }, tm);
      const ref = await ctxRef.newPage();
      await ref.goto('file://' + path.join(ROOT, 'index.html')); await ref.waitForTimeout(900);
      await ref.screenshot({ path: path.join(OUT, 'referencia', 'menu_' + tm + '.png') });
      await ref.evaluate(() => document.getElementById('mAv').click()); await ref.waitForTimeout(3000);
      await ref.screenshot({ path: path.join(OUT, 'referencia', 'jogando_' + tm + '.png') });
      await ctxRef.close();
    }
    console.log('Referências: ok');
  } finally {
    await browser.close();
    fs.rmSync(tmp, { force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
