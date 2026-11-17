/* =====================================================================
   ATESTADOS — leitura do documento (OCR no próprio aparelho) e extração dos dados.
   Nada é enviado para serviços externos: a leitura roda no navegador (Tesseract).
   As regras de extração não inventam nada: o que não estiver escrito fica em branco
   e vai para a conferência do administrador.
   ===================================================================== */
(function (root) {
  'use strict';
  var MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  var EXTENSO = { UM: 1, UMA: 1, DOIS: 2, DUAS: 2, TRES: 3, QUATRO: 4, CINCO: 5, SEIS: 6, SETE: 7, OITO: 8, NOVE: 9, DEZ: 10, ONZE: 11, DOZE: 12, TREZE: 13,
    QUATORZE: 14, CATORZE: 14, QUINZE: 15, DEZESSEIS: 16, DEZESSETE: 17, DEZOITO: 18, DEZENOVE: 19, VINTE: 20, TRINTA: 30, QUARENTA: 40, CINQUENTA: 50, SESSENTA: 60, NOVENTA: 90 };

  function norm(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\u201c\u201d"]/g, ' ').replace(/[ \t]+/g, ' ');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dataValida(y, m, d) {
    if (y < 100) y += 2000;
    if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }
  function somaDias(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function extensoParaNum(t) {
    t = norm(t).replace(/[^A-Z ]/g, ' ').trim(); if (!t) return null;
    var tot = 0, ok = false;
    t.split(/\s+E\s+|\s+/).forEach(function (p) { if (EXTENSO[p] != null) { tot += EXTENSO[p]; ok = true; } });
    return ok ? tot : null;
  }

  /** Todas as datas do texto, na ordem: [{iso, pos, tipo:'num'|'ext'}] */
  function datas(T) {
    var out = [], m, re1 = /(\d{1,2})\s?[\/.\-]\s?(\d{1,2})\s?[\/.\-]\s?(\d{4}|\d{2})(?!\d)/g;
    while ((m = re1.exec(T))) { var iso = dataValida(+m[3], +m[2], +m[1]); if (iso) out.push({ iso: iso, pos: m.index, fim: m.index + m[0].length, tipo: 'num' }); }
    var re2 = new RegExp('(\\d{1,2})\\s*(?:DE\\s+)?(' + MESES.join('|') + ')\\s*(?:DE\\s+)?(\\d{4})', 'g');
    while ((m = re2.exec(T))) { var iso2 = dataValida(+m[3], MESES.indexOf(m[2]) + 1, +m[1]); if (iso2) out.push({ iso: iso2, pos: m.index, fim: m.index + m[0].length, tipo: 'ext' }); }
    return out.sort(function (a, b) { return a.pos - b.pos; });
  }

  /** Lê os campos do texto. funcionarios: [{id, nome, ativo}] */
  function extrair(texto, funcionarios, opts) {
    opts = opts || {};
    var T = norm(texto).replace(/\r/g, '').replace(/\n+/g, ' \n ');
    var Tl = T.replace(/\s*\n\s*/g, ' ');
    var r = { nomeDoc: null, func: null, candidatos: [], emissao: null, atendimento: null, inicio: null, dias: null, retorno: null, cid: null, avisos: [], campos: {} };
    var ds = datas(Tl);

    // ---- nome escrito no documento ----
    var mn = /(?:ATESTO|DECLARO|CERTIFICO)[^.]{0,60}?\bQUE\s+(?:O\(?A\)?\s+|A\s+|O\s+)?(?:SR\(?A?\)?\.?\s+|SRA\.?\s+|PACIENTE\s+)?([A-Z][A-Z ]{3,70}?)\s*,?\s*(?:PORTADOR|PORTADORA|RG\b|CPF\b|INSCRIT|ESTEVE|COMPARECEU|RECEBEU|FOI\s+ATENDID|NECESSITA|DEVE\b|DEVERA|NASCID|CNS\b|,)/.exec(Tl);
    if (!mn) mn = /\b(?:PACIENTE|NOME)\s*:?\s+([A-Z][A-Z ]{3,60}?)\s*(?:,|\bCPF\b|\bRG\b|\bPORTADOR|\bIDADE|\bDATA|\n|$)/.exec(Tl);
    if (!mn) mn = /(?:ATESTO|DECLARO|CERTIFICO)[^\n]{0,60}?\bQUE\s+(?:O\(?A\)?\s+|A\s+|O\s+)?([A-Z]{2,}(?:\s+[A-Z]{1,}){1,5})\s*(?:\n|,)/.exec(T);
    if (mn) r.nomeDoc = mn[1].replace(/\s+/g, ' ').trim();

    // ---- funcionário no cadastro ----
    var alvo = ' ' + (r.nomeDoc || Tl).replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ') + ' ';
    var todos = (funcionarios || []).map(function (f) {
      var tk = norm(f.nome).replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(function (x) { return x.length >= 2 && ['DA', 'DE', 'DO', 'DAS', 'DOS', 'E'].indexOf(x) < 0; });
      if (!tk.length) return null;
      var tem = function (w) { return alvo.indexOf(' ' + w + ' ') >= 0; };
      var nTem = tk.filter(tem).length, primeiro = tem(tk[0]);
      var score = !primeiro ? 0 : nTem === tk.length ? (tk.length > 1 ? 3 : 2) : 1 + (nTem > 1 ? 0.5 : 0);
      return score ? { id: f.id, nome: f.nome, ativo: f.ativo !== false, score: score } : null;
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score || (b.ativo - a.ativo); });
    // empate: quem aparece logo depois do primeiro nome de outro candidato é nome do meio (ex.: SANDRA MARIA -> Sandra)
    if (todos.length > 1 && todos[0].score === todos[1].score) {
      var primeiros = todos.map(function (c) { return norm(c.nome).split(/\s+/)[0]; });
      var meio = todos.filter(function (c, i) {
        var w = primeiros[i], re = new RegExp('\\b([A-Z]+)\\s+' + w + '\\b', 'g'), m2, foi = false;
        while ((m2 = re.exec(alvo))) if (primeiros.indexOf(m2[1]) >= 0 && m2[1] !== w) foi = true;
        return foi;
      });
      if (meio.length && meio.length < todos.length) todos = todos.filter(function (c) { return meio.indexOf(c) < 0; });
    }
    r.candidatos = todos;
    if (todos.length && (todos.length === 1 || todos[0].score > todos[1].score)) {
      r.func = todos[0];
      if (!r.nomeDoc) r.avisos.push('O nome do paciente não foi encontrado com clareza; o funcionário foi reconhecido pelo texto do documento.');
      if (todos[0].score < 2) r.avisos.push('O nome no documento confere só em parte com o cadastro: confira o funcionário.');
    } else if (todos.length > 1) r.avisos.push('Mais de um funcionário combina com o nome do documento: escolha o certo.');
    else r.avisos.push('Nenhum funcionário do cadastro foi reconhecido no documento.');

    // ---- datas ----
    var mAt = /(?:NO\s+DIA|EM)\s+(\d{1,2}\s?[\/.\-]\s?\d{1,2}\s?[\/.\-]\s?\d{2,4})/.exec(Tl);
    if (mAt) { var d0 = datas(mAt[1]); if (d0.length) r.atendimento = d0[0].iso; }
    var ext = ds.filter(function (d) { return d.tipo === 'ext'; });
    if (ext.length) r.emissao = ext[0].iso;
    else if (ds.length) r.emissao = ds[ds.length - 1].iso;

    // ---- quantidade de dias ----
    var md = /(\d{1,3})\s*\(\s*([A-Z ]{2,30}?)\s*\)\s*DIAS?\b/.exec(Tl);
    if (md) {
      r.dias = +md[1];
      var ex = extensoParaNum(md[2]);
      if (ex != null && ex !== r.dias) { r.avisos.push('O número de dias (' + md[1] + ') não bate com o escrito por extenso (' + md[2].trim().toLowerCase() + '): confira.'); r.campos.dias = 'duvida'; }
    } else {
      var md2 = /(?:POR|PERIODO\s+DE|DURANTE|AFASTAD[OA]\s+POR|REPOUSO\s+(?:DE|POR))\s+(\d{1,3})\s*DIAS?\b/.exec(Tl) || /\b(\d{1,3})\s*DIAS?\s+(?:DE\s+)?(?:AFASTAMENTO|REPOUSO|LICENCA)/.exec(Tl);
      if (md2) r.dias = +md2[1];
      else { var md3 = /(?:POR|PERIODO\s+DE|DURANTE)\s+([A-Z ]{2,25}?)\s+DIAS?\b/.exec(Tl); if (md3) { var n3 = extensoParaNum(md3[1]); if (n3) r.dias = n3; } }
    }
    if (r.dias != null && !(r.dias >= 1 && r.dias <= 180)) { r.avisos.push('Quantidade de dias fora do normal (' + r.dias + '): confira.'); r.campos.dias = 'duvida'; }
    if (r.dias == null) r.avisos.push('A quantidade de dias não foi encontrada.');

    // ---- início do afastamento ----
    var mi = /A\s+PARTIR\s+D[OEA]S?\s*(?:DIA\s+)?(\d{1,2}\s?[\/.\-]\s?\d{1,2}\s?[\/.\-]\s?\d{2,4})/.exec(Tl);
    if (mi) { var di = datas(mi[1]); if (di.length) r.inicio = di[0].iso; }
    if (!r.inicio && /A\s+PARTIR\s+(?:DESTA|DESSA|DA\s+PRESENTE)\s+DATA|A\s+PARTIR\s+DE\s+HOJE/.test(Tl)) {
      r.inicio = r.atendimento || r.emissao;
      if (r.atendimento && r.emissao && r.atendimento !== r.emissao) r.avisos.push('A data do atendimento e a data do documento são diferentes: confira o início.');
    }
    if (!r.inicio) {
      var mp = /(?:DE|NO\s+PERIODO\s+DE)\s+(\d{1,2}\s?[\/.\-]\s?\d{1,2}\s?[\/.\-]\s?\d{2,4})\s+(?:A|ATE)\s+(\d{1,2}\s?[\/.\-]\s?\d{1,2}\s?[\/.\-]\s?\d{2,4})/.exec(Tl);
      if (mp) {
        var a1 = datas(mp[1]), a2 = datas(mp[2]);
        if (a1.length && a2.length && a2[0].iso >= a1[0].iso) {
          r.inicio = a1[0].iso;
          var nd = Math.round((Date.parse(a2[0].iso) - Date.parse(a1[0].iso)) / 864e5) + 1;
          if (r.dias == null) r.dias = nd; else if (r.dias !== nd) { r.avisos.push('O período escrito não bate com a quantidade de dias: confira.'); r.campos.dias = 'duvida'; }
        }
      }
    }
    if (!r.inicio) r.avisos.push('A data de início do afastamento não está escrita com clareza: informe na conferência.');
    // data fora do razoável (ex.: 2026 lido como 2076): não usa; pede para conferir
    if (opts.hoje) ['emissao', 'atendimento', 'inicio'].forEach(function (k) {
      if (r[k] && (r[k] < somaDias(opts.hoje, -400) || r[k] > somaDias(opts.hoje, 60))) {
        r.avisos.push('A data ' + ({ emissao: 'de emissão', atendimento: 'do atendimento', inicio: 'de início' })[k] + ' lida (' + r[k].split('-').reverse().join('/') + ') não parece correta: confira no documento.');
        r[k] = null; r.campos[k] = 'duvida';
      }
    });
    if (r.inicio && r.dias) r.retorno = somaDias(r.inicio, r.dias);
    if (!r.emissao) r.avisos.push('A data de emissão não foi encontrada.');
    if (r.emissao && r.inicio && r.inicio < somaDias(r.emissao, -10)) r.avisos.push('O início do afastamento é bem anterior à emissão do documento: confira.');
    if (opts.hoje && r.emissao && r.emissao > somaDias(opts.hoje, 1)) r.avisos.push('A data de emissão é posterior a hoje: confira.');

    // ---- CID (só se estiver escrito) ----
    var mc = /\bC\.?\s?I\.?\s?D\.?\s*(?:-?\s*10)?\s*[:\-]?\s*([A-TV-Z])\s?([0-9O]{2})(?:\s?\.?\s?([0-9O]))?\b/.exec(Tl);
    if (mc) r.cid = mc[1] + mc[2].replace(/O/g, '0') + (mc[3] ? '.' + mc[3].replace(/O/g, '0') : '');

    r.seguro = !!(r.func && r.func.score >= 1 && r.inicio && r.dias && r.dias <= 180 && r.campos.dias !== 'duvida' && r.campos.inicio !== 'duvida' && r.campos.emissao !== 'duvida' && (opts.confianca == null || opts.confianca >= 55));
    if (opts.confianca != null && opts.confianca < 55) r.avisos.push('A leitura da imagem ficou com baixa qualidade (' + Math.round(opts.confianca) + '%): confira todos os campos.');
    return r;
  }

  /* ---------------- leitura (OCR) ---------------- */
  var BASE_LIBS = 'libs/ocr/';
  function carregarScript(src) {
    return new Promise(function (ok, erro) {
      if (document.querySelector('script[data-src="' + src + '"]')) return ok();
      var s = document.createElement('script'); s.src = src; s.dataset.src = src; s.onload = ok; s.onerror = function () { erro(new Error('Não foi possível carregar ' + src)); };
      document.head.appendChild(s);
    });
  }
  /** Arquivo (imagem ou PDF) -> { paginas: [canvas], tipo } */
  async function paraImagens(arquivo) {
    if (/pdf$/i.test(arquivo.type) || /\.pdf$/i.test(arquivo.name || '')) {
      await carregarScript(BASE_LIBS + 'pdf.min.js');
      root.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE_LIBS + 'pdf.worker.min.js';
      var pdf = await root.pdfjsLib.getDocument({ data: await arquivo.arrayBuffer() }).promise, pags = [];
      for (var i = 1; i <= Math.min(pdf.numPages, 3); i++) {
        var pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 2 }), cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; pags.push(cv);
      }
      return { paginas: pags, tipo: 'pdf' };
    }
    var url = URL.createObjectURL(arquivo);
    try {
      var img = await new Promise(function (ok, erro) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { erro(new Error('Imagem inválida')); }; im.src = url; });
      var esc = Math.min(2, 3000 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return { paginas: [c], tipo: 'imagem', original: c };
    } finally { URL.revokeObjectURL(url); }
  }
  /** Foto de celular: tons de cinza e fundo clareado (divide pelo fundo borrado), sem mexer no original arquivado */
  function limpar(c) {
    var w = c.width, h = c.height, x = c.getContext('2d'), px = x.getImageData(0, 0, w, h), d = px.data, g = new Float32Array(w * h);
    for (var i = 0, j = 0; i < d.length; i += 4, j++) g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // fundo: média em blocos (rápido) e interpolação simples
    var B = Math.max(16, Math.round(Math.max(w, h) / 60)), bw = Math.ceil(w / B), bh = Math.ceil(h / B), fundo = new Float32Array(bw * bh);
    for (var by = 0; by < bh; by++) for (var bx = 0; bx < bw; bx++) {
      var mx = 0;
      for (var yy = by * B; yy < Math.min(h, by * B + B); yy += 2) for (var xx = bx * B; xx < Math.min(w, bx * B + B); xx += 2) { var v = g[yy * w + xx]; if (v > mx) mx = v; }
      fundo[by * bw + bx] = Math.max(mx, 60);
    }
    var o = document.createElement('canvas'); o.width = w; o.height = h;
    var ox = o.getContext('2d'), op = ox.createImageData(w, h), od = op.data;
    for (var y = 0; y < h; y++) for (var x2 = 0; x2 < w; x2++) {
      var k = y * w + x2, f = fundo[Math.min(bh - 1, (y / B) | 0) * bw + Math.min(bw - 1, (x2 / B) | 0)];
      var n = Math.min(255, g[k] / f * 255); n = n > 200 ? 255 : n < 110 ? 0 : (n - 110) * 255 / 90;
      od[k * 4] = od[k * 4 + 1] = od[k * 4 + 2] = n; od[k * 4 + 3] = 255;
    }
    ox.putImageData(op, 0, 0);
    return o;
  }
  var worker = null;
  async function ocr(canvases, progresso) {
    await carregarScript(BASE_LIBS + 'tesseract.min.js');
    if (!worker) {
      worker = await root.Tesseract.createWorker('por', 1, {
        workerPath: BASE_LIBS + 'worker.min.js', corePath: BASE_LIBS, langPath: BASE_LIBS, gzip: true,
        logger: function (m) { if (progresso && m && m.status) progresso(m.status, m.progress || 0); }
      });
    }
    var textos = [], confs = [];
    for (var i = 0; i < canvases.length; i++) {
      var r = await worker.recognize(limpar(canvases[i]), { rotateAuto: true });
      textos.push(r.data.text); confs.push(r.data.confidence);
    }
    return { texto: textos.join('\n'), confianca: confs.length ? confs.reduce(function (a, b) { return a + b; }, 0) / confs.length : 0 };
  }
  /** Cópia do original para arquivar: imagem em JPEG reduzido; PDF guardado como está (até 4 MB) */
  async function arquivar(arquivo, imagens) {
    if (imagens.tipo === 'pdf' && arquivo.size <= 4 * 1024 * 1024) {
      return await new Promise(function (ok, erro) { var fr = new FileReader(); fr.onload = function () { ok(fr.result); }; fr.onerror = erro; fr.readAsDataURL(arquivo); });
    }
    var c = imagens.paginas[0], esc = Math.min(1, 1600 / Math.max(c.width, c.height)), d = document.createElement('canvas');
    d.width = Math.round(c.width * esc); d.height = Math.round(c.height * esc);
    var x = d.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, d.width, d.height); x.drawImage(c, 0, 0, d.width, d.height);
    return d.toDataURL('image/jpeg', 0.82);
  }
  async function hashArquivo(arquivo) {
    var buf = await arquivo.arrayBuffer(), h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  /** Fluxo completo: arquivo -> dados extraídos + cópia para arquivo */
  async function lerArquivo(arquivo, funcionarios, hoje, progresso) {
    var imagens = await paraImagens(arquivo);
    var leitura;
    try { leitura = await ocr(imagens.paginas, progresso); }
    catch (e) { leitura = { texto: '', confianca: 0, erro: String(e && e.message || e) }; }
    var dados = extrair(leitura.texto, funcionarios, { confianca: leitura.confianca, hoje: hoje });
    if (leitura.erro) dados.avisos.unshift('Não foi possível ler o documento automaticamente neste aparelho. Preencha os campos olhando a imagem.');
    var arq = await arquivar(arquivo, imagens);
    var previa = imagens.tipo === 'pdf' ? await arquivar({ size: Infinity }, imagens) : arq;
    return { dados: dados, texto: leitura.texto, confianca: leitura.confianca, arquivo: arq, previa: previa, hash: await hashArquivo(arquivo), tipo: imagens.tipo };
  }

  var API = { norm: norm, datas: datas, extrair: extrair, extensoParaNum: extensoParaNum, somaDias: somaDias, lerArquivo: lerArquivo };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.AtestLer = API;
})(typeof window !== 'undefined' ? window : this);
