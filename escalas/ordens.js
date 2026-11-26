/* =====================================================================
   ORDENS DE SERVIÇO (só administrador).
   Importa o TXT exportado do WhatsApp, sugere as tarefas por regras
   (palavras de pedido e nome do funcionário), o administrador revisa e
   gera um PDF A4 com uma ordem por funcionário. Não grava nada no banco.
   ===================================================================== */
(function (root) {
  'use strict';

  var PALAVRAS = /(favor|preciso|precisa|precisamos|pode|podem|limpar|limpa|arrumar|arruma|organizar|organiza|fazer|faz|trocar|troca|levar|leva|buscar|busca|verificar|verifica|colocar|coloca|lavar|lava|tirar|tira|ajeitar|varrer|passar|recolher|entregar|reparar|conserta|consertar|providenciar|separar|guardar|repor|conferir|checar|cuidar|atender|pendente|urgente|quando puder|se possivel)/;
  var VERBO_INICIO = /^(trocar|colocar|consertar|tirar|tapar|pintar|rocar|jogar|ver|concluir|arrumar|limpar|lavar|instalar|cortar|retirar|guardar|varrer|regar|podar|substituir|apertar|emassar|reparar|ajustar|desentupir|providenciar|buscar|levar|organizar|fazer|verificar|checar|conferir|separar|recolher|entregar|tratar|cuidar|montar|desmontar|trocar)\b/;
  var PROBLEMA = /(nao funciona|nao esta funcionando|nao estao funcionando|entupid|quebrad|vazand|vazamento|solto|rachad|infiltra|queimad|desligad|sujo|sujeira|manchad)/;
  var LINHA = /^[‎‏﻿]*\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(?:-\s*)?([^:]{1,60}?):\s?(.*)$/;
  var seq = 0, zipAtual = null;

  function norm(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function escRe(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function ord() { return (UI.ord = UI.ord || { itens: [], data: C.hojeISO(), arquivo: '', msgs: 0 }); }
  function ativosOrd() {
    return (S.funcionarios || []).filter(function (f) { return f.ativo; })
      .slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
  }

  /* Lê as linhas do WhatsApp (formatos com colchetes ou com hífen) */
  function lerConversa(txt) {
    var msgs = [];
    String(txt || '').replace(/\r/g, '').split('\n').forEach(function (l) {
      var m = l.match(LINHA);
      if (m) msgs.push({ data: m[1], hora: m[2], quem: m[3].trim(), texto: m[4] });
      else if (msgs.length && l.trim()) msgs[msgs.length - 1].texto += '\n' + l.trim();
    });
    return msgs;
  }

  function pareceTarefa(t) {
    var n = norm(t).trim();
    if (!n) return false;
    if (VERBO_INICIO.test(n) || PROBLEMA.test(n)) return true;
    return n.length >= 8 && (PALAVRAS.test(n) || n.indexOf('?') >= 0);
  }
  function dataISO(d) { var p = String(d || '').split('/'); return p.length === 3 ? (p[2].length === 2 ? '20' + p[2] : p[2]) + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0') : ''; }
  /* Aplica o período escolhido (De/Até) às mensagens já lidas */
  function aplicarPeriodo(o) {
    var lista = (o.todas || []).filter(function (m) { var d = dataISO(m.data); return (!o.de || d >= o.de) && (!o.ate || d <= o.ate); });
    o.itens = montarItens(lista);
  }

  /* Procura o funcionário citado (nome completo ou primeiro nome, com 3+ letras) */
  function acharFuncionario(texto) {
    var n = norm(texto);
    var achados = ativosOrd().filter(function (f) {
      var nome = norm(f.nome).trim(), primeiro = nome.split(/\s+/)[0];
      if (nome && n.indexOf(nome) >= 0) return true;
      return primeiro.length >= 3 && new RegExp('(^|[^a-z])' + escRe(primeiro) + '([^a-z]|$)').test(n);
    });
    return achados.length === 1 ? achados[0].id : '';
  }

  /* Quem mandou a mensagem é funcionário? Então é resposta, e não entra por padrão */
  function ehFuncionario(nome) {
    var n = norm(nome);
    return ativosOrd().some(function (f) { return norm(f.nome).trim() === n; });
  }

  function montarItens(msgs) {
    var itens = [];
    msgs.forEach(function (m) {
      var fotoM = m.texto.match(/<anexado:\s*([^>]+)>/i), foto = fotoM && /PHOTO/i.test(fotoM[1]) && /\.jpe?g$/i.test(fotoM[1].trim()) ? fotoM[1].trim() : '';
      var texto = m.texto.replace(/<anexado:[^>]*>/gi, '').replace(/[\u200e\u200f]/g, '').trim();
      if (!pareceTarefa(texto) && !foto) return;
      seq++;
      itens.push({ id: seq, data: m.data, hora: m.hora, quem: m.quem, texto: texto, foto: foto, fotoIncluir: !!foto, local: '',
        func: texto ? acharFuncionario(texto) : '', incluir: !ehFuncionario(m.quem) && !!texto });
    });
    return itens;
  }

  function atualizarState(id) { return ord().itens.find(function (x) { return x.id === id; }); }

  function vOrdens() {
    var o = ord();
    var h = '<style>' +
      '.ord{max-width:760px;margin:0 auto}' +
      '.ord-card{background:var(--card,#fff);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}' +
      '.ord-card h3{margin:0 0 8px;font-size:15px;color:#0f4c5c}' +
      '.ord-it{border:1px solid var(--line);border-radius:12px;padding:10px;margin-bottom:8px}' +
      '.ord-it.off{opacity:.55}' +
      '.ord-it-top{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--muted,#64748b);margin-bottom:6px;flex-wrap:wrap}' +
      '.ord-it textarea{width:100%;min-height:60px;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:8px;background:transparent;color:inherit;font:inherit}' +
      '.ord-it select{width:100%;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--card,#fff);color:inherit}' +
      '.ord-chk{display:flex;align-items:center;gap:6px;font-size:13px;margin-top:6px}' +
      '.ord-aviso{font-size:13px;color:#a16207;margin:8px 0 0}' +
      '.ord-arq{display:inline-block;padding:10px 14px;border-radius:10px;background:#0f4c5c;color:#fff;font-weight:700;cursor:pointer}' +
      '.ord-arq input{display:none}' +
      '.ord-res{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}' +
      '.ord-res span{font-size:12.5px;background:rgba(15,76,92,.08);border-radius:999px;padding:4px 10px}' +
      '</style><div class="ord">';
    h += '<div class="row mb"><div><h1>Ordens de Serviço</h1><p class="sub" style="margin:0">Importe a conversa do WhatsApp, revise e imprima uma ordem por funcionário</p></div></div>';

    h += '<div class="ord-card"><h3>1. Importar conversa</h3>' +
      '<label class="ord-arq">Escolher arquivo (.zip ou .txt)<input type="file" accept=".zip,.txt,application/zip,text/plain" data-ord="arq"></label>' +
      (o.arquivo ? '<p class="small muted" style="margin:8px 0 0">' + esc(o.arquivo) + ' · ' + o.msgs + ' mensagem(ns) lida(s)</p>' : '<p class="small muted" style="margin:8px 0 0">No WhatsApp: abra a conversa, Mais opções → Mais → Exportar conversa → Sem mídia.</p>') +
      '<div class="fld" style="margin-top:10px"><label class="f">Ou cole o texto da conversa</label><textarea data-ord="colar" rows="4" placeholder="Abra o _chat.txt, copie tudo e cole aqui" style="width:100%;box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:8px;background:transparent;color:inherit;font:inherit"></textarea><button class="btn" data-act="ordColar" style="margin-top:6px;width:100%">Usar texto colado</button></div>' +
      (o.todas ? '<div class="row" style="gap:8px;margin-top:10px"><div class="fld" style="flex:1"><label class="f">Período: de</label><input type="date" data-ord="de" value="' + esc(o.de || '') + '"></div><div class="fld" style="flex:1"><label class="f">até</label><input type="date" data-ord="ate" value="' + esc(o.ate || '') + '"></div></div>' : '') +
      '<div class="fld" style="margin-top:10px"><label class="f">Data da ordem</label><input type="date" data-ord="data" value="' + esc(o.data) + '"></div></div>';

    if (o.itens.length) {
      var inc = o.itens.filter(function (x) { return x.incluir; });
      h += '<div class="ord-card"><h3>2. Revisar pedidos</h3><p class="small muted" style="margin:0 0 8px">Confira o texto, escolha o funcionário e desmarque o que não é tarefa. Nada é atribuído sem a sua confirmação.</p>';
      h += o.itens.map(function (x) {
        var opc = '<option value="">— escolher funcionário —</option>' + ativosOrd().map(function (f) {
          return '<option value="' + f.id + '"' + (x.func === f.id ? ' selected' : '') + '>' + esc(f.nome) + ' · ' + esc(nomeSetor(f.setorId)) + '</option>';
        }).join('');
        return '<div class="ord-it' + (x.incluir ? '' : ' off') + '">' +
          '<div class="ord-it-top"><span>' + esc(x.data) + ' ' + esc(x.hora) + ' · ' + esc(x.quem) + '</span>' + (x.func ? '<span>Funcionário sugerido</span>' : '<span>Sem responsável</span>') + '</div>' +
          (x.foto && o.img && o.img[x.foto] ? '<img src="' + o.img[x.foto] + '" alt="foto" style="display:block;max-width:100%;max-height:200px;border-radius:8px;margin:6px 0">' : (x.foto ? '<p class="small muted" style="margin:4px 0">Foto ' + esc(x.foto) + ' (não encontrada no arquivo)</p>' : '')) +
          (x.foto ? '<label class="ord-chk"><input type="checkbox" data-ord="fotoIncluir" data-id="' + x.id + '"' + (x.fotoIncluir ? ' checked' : '') + '> Imprimir a foto na ordem</label>' : '') +
          '<input type="text" data-ord="local" data-id="' + x.id + '" value="' + esc(x.local || '') + '" placeholder="Local (ex.: Quarto Amor)" style="width:100%;box-sizing:border-box;margin-top:6px;padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--card,#fff);color:inherit">' +
          '<textarea data-ord="texto" data-id="' + x.id + '" placeholder="Escreva a tarefa (ex.: consertar a porta do quarto 3)">' + esc(x.texto) + '</textarea>' +
          '<select data-ord="func" data-id="' + x.id + '">' + opc + '</select>' +
          '<label class="ord-chk"><input type="checkbox" data-ord="incluir" data-id="' + x.id + '"' + (x.incluir ? ' checked' : '') + '> Incluir nas ordens</label></div>';
      }).join('');
      h += '<button class="btn" data-act="ordAdd" style="width:100%">Adicionar tarefa manual</button></div>';

      var semFunc = 0, semTexto = inc.filter(function (x) { return !String(x.texto || '').trim(); }).length;
      var porFunc = {};
      inc.forEach(function (x) { if (x.func) porFunc[x.func] = (porFunc[x.func] || 0) + 1; });
      h += '<div class="ord-card"><h3>3. Gerar ordens</h3>';
      h += '<div class="ord-res">' + Object.keys(porFunc).map(function (fid) {
        var f = (S.funcionarios || []).find(function (q) { return q.id === fid; }) || { nome: '?' };
        return '<span>' + esc(f.nome) + ': ' + porFunc[fid] + ' tarefa(s)</span>';
      }).join('') + '</div>';
      if (semTexto) h += '<p class="ord-aviso">' + semTexto + ' tarefa(s) sem texto. Escreva o que deve ser feito ou desmarque.</p>';
      h += '<div class="row" style="gap:10px;margin-top:12px;flex-wrap:wrap">' +
        '<button class="btn pri" data-act="ordPDF"' + (inc.length && !semFunc && !semTexto ? '' : ' disabled') + ' style="flex:1 1 200px">Gerar ordens (PDF A4)</button>' +
        '<button class="btn" data-act="ordLimpar" style="flex:1 1 140px">Limpar</button></div></div>';
    }
    h += '</div>';
    return h;
  }

  /* Aceita o .txt ou o .zip que o WhatsApp exporta (o _chat.txt é lido de dentro do zip) */
  async function textoDoArquivo(file) {
    zipAtual = null;
    if (!/\.zip$/i.test(file.name) && file.type !== 'application/zip' && file.type !== 'application/x-zip-compressed') return file.text();
    await carregarScript('libs/jszip.min.js');
    var zip = await window.JSZip.loadAsync(file);
    zipAtual = zip;
    var nomes = Object.keys(zip.files).filter(function (n) { return /\.txt$/i.test(n) && !zip.files[n].dir; });
    var chat = nomes.find(function (n) { return /_chat\.txt$/i.test(n); }) || nomes[0];
    if (!chat) throw new Error('sem txt');
    return zip.files[chat].async('string');
  }

  /* Lê as fotos citadas que estão no zip (só as que aparecem nos pedidos) */
  async function carregarFotos(o) {
    o.img = o.img || {};
    if (!o.zip) return;
    await Promise.all(o.itens.filter(function (x) { return x.foto; }).map(async function (x) {
      if (o.img[x.foto] || !o.zip.file(x.foto)) return;
      o.img[x.foto] = 'data:image/jpeg;base64,' + await o.zip.file(x.foto).async('base64');
    }));
  }

  function lerArquivo(file) {
    textoDoArquivo(file).then(function (txt) {
      var msgs = lerConversa(txt), o = ord();
      o.todas = msgs; o.arquivo = file.name; o.msgs = msgs.length; o.zip = zipAtual; aplicarPeriodo(o);
      return carregarFotos(o).then(render);
      if (!msgs.length) toast('Não encontrei mensagens nesse arquivo. Use a exportação de conversa do WhatsApp.');
      render();
    }).catch(function () { toast('Não foi possível ler o arquivo. Se for o zip, confira se a conversa foi exportada do WhatsApp.'); });
  }

  async function gerarPDF() {
    try { await carregarScript('libs/jspdf.umd.min.js'); await carregarScript('libs/jspdf.plugin.autotable.min.js'); }
    catch (e) { return modalMsg('Erro', '<p>Não foi possível carregar o gerador de PDF.</p>'); }
    var o = ord(), inc = o.itens.filter(function (x) { return x.incluir; });
    if (!inc.length) return toast('Nenhuma tarefa para gerar.');
    var grupos = {}, ordem = [];
    inc.forEach(function (x) { var k = x.func || '__sem__'; if (!grupos[k]) { grupos[k] = []; ordem.push(k); } grupos[k].push(x); });
    var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var dataBR = C.dataBR(o.data);
    for (var i = 0; i < ordem.length; i++) {
      if (i > 0) doc.addPage();
      var f = (S.funcionarios || []).find(function (q) { return q.id === ordem[i]; }) || { nome: '______________________________' };
      var itens = grupos[ordem[i]];
      var y = await pdfCabecalho(doc, 8);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(15, 76, 92);
      doc.text('ORDEM DE SERVIÇO', 14, y + 8);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
      doc.text('Hotel Fazenda Oásis', 14, y + 14);
      doc.setDrawColor(212, 162, 55); doc.setLineWidth(0.8); doc.line(14, y + 17, 196, y + 17);
      doc.setFontSize(11); doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold'); doc.text('Funcionário:', 14, y + 26); doc.setFont('helvetica', 'normal'); doc.text(String(f.nome || ''), 42, y + 26);
      doc.setFont('helvetica', 'bold'); doc.text('Setor:', 14, y + 33); doc.setFont('helvetica', 'normal'); doc.text(String(f.setorId ? nomeSetor(f.setorId) : '______________________________'), 42, y + 33);
      doc.setFont('helvetica', 'bold'); doc.text('Data:', 14, y + 40); doc.setFont('helvetica', 'normal'); doc.text(dataBR, 42, y + 40);
      doc.autoTable({
        startY: y + 47, margin: { left: 14, right: 14 },
        head: [['Nº', 'Tarefas a executar']], theme: 'grid',
        body: itens.map(function (x, k) { var tx = String(x.texto || '').trim() || 'Ver a foto abaixo'; return [String(k + 1), (x.local ? x.local.trim() + ': ' : '') + tx]; }),
        headStyles: { fillColor: [15, 76, 92] }, styles: { font: 'helvetica', fontSize: 11, cellPadding: 3, valign: 'middle' },
        columnStyles: { 0: { cellWidth: 14, halign: 'center' } }
      });
      var py = doc.lastAutoTable.finalY + 8;
      for (var k2 = 0; k2 < itens.length; k2++) {
        var x = itens[k2];
        if (!x.foto || !x.fotoIncluir || !o.img || !o.img[x.foto]) continue;
        var props = doc.getImageProperties(o.img[x.foto]);
        var w = 110, h = w * props.height / props.width;
        if (py + h + 12 > 280) { doc.addPage(); py = 15; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
        doc.text('Tarefa ' + (k2 + 1) + (x.texto ? ': ' + String(x.texto).slice(0, 90) : ''), 14, py);
        doc.addImage(o.img[x.foto], 'JPEG', 14, py + 2, w, h);
        py += h + 10;
      }
      var fy = Math.min(py + 12, 270);
      if (fy < doc.internal.pageSize.getHeight() - 20) {
        doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3); doc.line(14, fy, 110, fy);
        doc.setFontSize(10); doc.text('Assinatura do funcionário', 14, fy + 5);
      }
    }
    await salvarArquivo('ordens-servico-' + o.data + '.pdf', doc.output('blob'));
  }

  root.vOrdens = vOrdens;
  root.ordAcao = function (el) {
    var a = el.dataset.act, o = ord();
    if (a === 'ordAdd') { seq++; o.itens.push({ id: seq, data: C.hojeISO(), hora: '', quem: 'Manual', texto: '', func: '', incluir: true }); return render(); }
    if (a === 'ordLimpar') { UI.ord = { itens: [], data: C.hojeISO(), arquivo: '', msgs: 0 }; return render(); }
    if (a === 'ordPDF') return gerarPDF();
    if (a === 'ordColar') {
      var ta = document.querySelector('[data-ord="colar"]'), txt = ta ? ta.value : '';
      if (!txt.trim()) return toast('Cole o texto da conversa primeiro.');
      var msgs = lerConversa(txt);
      o.todas = msgs; o.arquivo = 'texto colado'; o.msgs = msgs.length; o.zip = null; o.img = {}; aplicarPeriodo(o);
      if (!msgs.length) toast('Não encontrei mensagens nesse texto.');
      return render();
    }
  };
  document.addEventListener('change', function (ev) {
    var t = ev.target, o = ord();
    if (!t || !t.dataset || !t.dataset.ord) return;
    var k = t.dataset.ord;
    if (k === 'arq') { if (t.files && t.files[0]) lerArquivo(t.files[0]); return; }
    if (k === 'data') { o.data = t.value || C.hojeISO(); return render(); }
    if (k === 'de' || k === 'ate') { o[k] = t.value || ''; aplicarPeriodo(o); return render(); }
    var it = atualizarState(+t.dataset.id); if (!it) return;
    if (k === 'func') { it.func = t.value; return render(); }
    if (k === 'incluir') { it.incluir = t.checked; return render(); }
    if (k === 'fotoIncluir') { it.fotoIncluir = t.checked; return render(); }
    if (k === 'local') { it.local = t.value; return; }
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (!t || !t.dataset || (t.dataset.ord !== 'texto' && t.dataset.ord !== 'local')) return;
    var it = atualizarState(+t.dataset.id); if (it) { if (t.dataset.ord === 'texto') it.texto = t.value; else it.local = t.value; } // sem redesenhar, para não perder o cursor
  });
})(window);
