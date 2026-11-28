/* =====================================================================
   RELATÓRIOS (só administrador). Só consulta: lê os pagamentos já
   registrados (diaristas, serviços e vale-transporte) e não grava nada.
   ===================================================================== */
(function (root) {
  'use strict';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  /* Abas: título (PDF/Excel), rótulo do total no painel */
  var ABAS = {
    diaria: { titulo: 'Diaristas', total: 'Total de diaristas pagos', arq: 'Diaristas-' },
    outros: { titulo: 'Serviços 40/60% e combinados', total: 'Total de serviços 40/60% e combinados', arq: 'Servicos-' },
    transporte: { titulo: 'Vale-transporte', total: 'Total de vale-transporte pago', arq: 'Transporte-' }
  };

  function mdl() { return (UI.mdl = UI.mdl || { rel: null }); }
  function mesAtual() { return C.hojeISO().slice(0, 7); }
  function brl(v) { return 'R$ ' + servMoeda(v); }
  function nomeMes(ym) { return MESES[+ym.slice(5, 7) - 1] + ' de ' + ym.slice(0, 4); }
  function nomeDoSetor(id) { return id ? nomeSetor(id) : '—'; }
  function arred(v) { return Math.round((+v || 0) * 100) / 100; }
  function abaValida(aba) { return ABAS[aba] ? aba : 'diaria'; }

  /* Lê os pagamentos reais do mês (só o que foi marcado como pago). Nada é estimado. */
  function dadosRel(ym) {
    var vt = (S.vt || {})[ym] || {}, pags = vt.pagamentos || {};
    var dia = [], outros = [], vtL = [], diaTot = 0, outTot = 0, vtTot = 0;
    (S.funcionarios || []).forEach(function (f) {
      var p = pags[f.id] || {};
      ['q1', 'q2'].forEach(function (q) {
        var v = +((p[q] || {}).valor) || 0;
        if (v > 0) { vtTot += v; vtL.push({ nome: f.nome, grupo: 'Vale-transporte', motivo: q === 'q1' ? '1ª quinzena' : '2ª quinzena', valor: arred(v) }); }
      });
    });
    servPrestadores().forEach(function (p) {
      var diar = grupoDe(p) === 'diaria', c = servCalc(ym, p.id) || {};
      (c.pagos || []).forEach(function (x) {
        if (!x.pago) return;
        var v = +(x.valorPago != null ? x.valorPago : x.valor) || 0;
        if (v <= 0) return;
        var linha = { nome: p.nome, grupo: diar ? 'Diarista' : '40/60% e combinados', motivo: x.nome + (x.de ? ' (dias ' + x.de + ' a ' + x.ate + ')' : ''), valor: arred(v) };
        if (diar) { diaTot += v; dia.push(linha); } else { outTot += v; outros.push(linha); }
      });
    });
    var ord = function (a, b) { return (a.grupo < b.grupo ? -1 : a.grupo > b.grupo ? 1 : 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'); };
    dia.sort(ord); outros.sort(ord); vtL.sort(ord);
    return {
      diaria: { linhas: dia, total: arred(diaTot) },
      outros: { linhas: outros, total: arred(outTot) },
      transporte: { linhas: vtL, total: arred(vtTot) }
    };
  }

  function vRelatorios() {
    var m = mdl(); m.rel = m.rel || { mes: mesAtual(), todos: false, aba: 'diaria' };
    var ym = m.rel.mes, aba = abaValida(m.rel.aba), d = dadosRel(ym);
    var atual = d[aba];
    var lim = m.rel.todos ? atual.linhas.length : 5;
    var css = '.rel{max-width:720px;margin:0 auto}' +
      '.rel-top{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:14px}' +
      '.rel-top input[type=month]{padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card,#fff);color:inherit}' +
      '.rel-abas{display:flex;gap:8px;margin-bottom:12px}' +
      '.rel-aba{flex:1;padding:10px 6px;border-radius:10px;border:1px solid var(--line);background:var(--card,#fff);font-weight:700;cursor:pointer;color:inherit}' +
      '.rel-aba.on{background:#0f4c5c;color:#fff;border-color:#0f4c5c;box-shadow:inset 0 -3px 0 #d4a237}' +
      '.rel-hero{background:#0f4c5c;color:#fff;border-radius:16px;padding:20px;border-bottom:4px solid #d4a237;margin-bottom:12px}' +
      '.rel-hero span{display:block;font-size:13px;opacity:.85;letter-spacing:.4px;text-transform:uppercase}' +
      '.rel-hero b{display:block;font-size:30px;margin:6px 0 2px;color:#f5d68a}' +
      '.rel-hero small{opacity:.8}' +
      '.rel-card{background:var(--card,#fff);border:1px solid var(--line);border-radius:14px;padding:14px}' +
      '.rel-cab{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #d4a237;padding-bottom:8px}' +
      '.rel-lista{list-style:none;margin:0;padding:0}' +
      '.rel-lista li{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}' +
      '.rel-lista li>div{min-width:0}' +
      '.rel-lista small{display:block;color:var(--muted,#64748b);font-size:12px;margin-top:2px}' +
      '.rel-lista strong{white-space:nowrap;color:#0f4c5c}' +
      '.rel-mais{width:100%;margin-top:10px;padding:10px;border:1px dashed #d4a237;border-radius:10px;background:transparent;color:#8a6414;font-weight:700;cursor:pointer}' +
      '.rel-exp{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}' +
      '.rel-exp .btn{flex:1 1 160px}';

    var h = '<style>' + css + '</style><div class="rel">';
    h += '<div class="rel-top"><div><h1>Relatórios</h1><p class="sub" style="margin:0">' + esc(nomeMes(ym)) + '</p></div>' +
      '<input type="month" data-mdl="relMes" value="' + esc(ym) + '"></div>';
    h += '<div class="rel-abas">' +
      '<button class="rel-aba' + (aba === 'diaria' ? ' on' : '') + '" data-act="mdlAba" data-aba="diaria">Diaristas</button>' +
      '<button class="rel-aba' + (aba === 'outros' ? ' on' : '') + '" data-act="mdlAba" data-aba="outros">Serviços</button>' +
      '<button class="rel-aba' + (aba === 'transporte' ? ' on' : '') + '" data-act="mdlAba" data-aba="transporte">Transporte</button></div>';
    h += '<div class="rel-hero"><span>' + esc(ABAS[aba].total) + '</span><b>' + brl(atual.total) + '</b><small>' + esc(nomeMes(ym)) + '</small></div>';
    h += '<div class="rel-card"><div class="rel-cab"><b>Quem recebeu?</b><span class="small muted">' + atual.linhas.length + ' pagamento(s)</span></div>';
    if (atual.linhas.length) {
      h += '<ul class="rel-lista">' + atual.linhas.slice(0, lim).map(function (l) {
        return '<li><div><b>' + esc(l.nome) + '</b><small>' + esc(l.grupo) + ' · ' + esc(l.motivo) + '</small></div><strong>' + brl(l.valor) + '</strong></li>';
      }).join('') + '</ul>';
      if (atual.linhas.length > 5) h += '<button class="rel-mais" data-act="mdlTodos">' + (m.rel.todos ? 'Mostrar menos' : 'Ver todos (' + atual.linhas.length + ')') + '</button>';
    } else {
      h += '<p class="small muted">Nenhum pagamento registrado neste mês.</p>';
    }
    h += '</div>';
    h += '<div class="rel-exp"><button class="btn pri" data-act="mdlPDF">Baixar PDF</button><button class="btn" data-act="mdlXLS">Exportar Excel</button></div>';
    h += '</div>';
    return h;
  }

  /* Marca d'água: logo claro e centralizado em todas as páginas */
  async function marcaRelPDF(doc) {
    var img = await logoPdfData(); if (!img) return;
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), w = 120, h = 42;
    var n = doc.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setGState(new doc.GState({ opacity: 0.08 }));
      try { doc.addImage(img, 'PNG', (W - w) / 2, (H - h) / 2, w, h); } catch (e) { }
      doc.setGState(new doc.GState({ opacity: 1 }));
    }
  }

  async function exportarRelPDF() {
    try { await carregarScript('libs/jspdf.umd.min.js'); await carregarScript('libs/jspdf.plugin.autotable.min.js'); }
    catch (e) { return modalMsg('Erro', '<p>Não foi possível carregar o gerador de PDF.</p>'); }
    var ym = mdl().rel.mes, aba = abaValida(mdl().rel.aba), atual = dadosRel(ym)[aba];
    var doc = new window.jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var y = await pdfCabecalho(doc, 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(15, 76, 92);
    doc.text(ABAS[aba].titulo, 14, y + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(60, 60, 60);
    doc.text('Hotel Fazenda Oásis · ' + nomeMes(ym), 14, y + 14);
    doc.setDrawColor(212, 162, 55); doc.setLineWidth(0.8); doc.line(14, y + 17, 196, y + 17);
    doc.autoTable({ startY: y + 21, margin: { left: 14, right: 14 }, head: [['Resumo', 'Valor']], body: [['TOTAL', brl(atual.total)]], theme: 'grid', headStyles: { fillColor: [15, 76, 92] }, styles: { font: 'helvetica', fontSize: 10 }, columnStyles: { 1: { halign: 'right' } } });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 10, margin: { left: 14, right: 14 }, head: [['Nome', 'Grupo', 'Motivo', 'Valor']], theme: 'grid',
      body: atual.linhas.map(function (l) { return [l.nome, l.grupo, l.motivo, brl(l.valor)]; }),
      headStyles: { fillColor: [15, 76, 92] }, styles: { font: 'helvetica', fontSize: 9 }, columnStyles: { 3: { halign: 'right' } }
    });
    await marcaRelPDF(doc);
    var n = doc.internal.getNumberOfPages();
    doc.setPage(n); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR'), 14, 290);
    await salvarArquivo(ABAS[aba].arq + ym + '.pdf', doc.output('blob'));
  }

  async function exportarRelXLS() {
    try { await carregarScript('libs/exceljs.min.js'); }
    catch (e) { return modalMsg('Erro', '<p>Não foi possível carregar o gerador de Excel.</p>'); }
    var ym = mdl().rel.mes, aba = abaValida(mdl().rel.aba), atual = dadosRel(ym)[aba];
    var wb = new ExcelJS.Workbook(); wb.creator = (S.config && S.config.nomeHotel) || 'Escalas';
    var ws = wb.addWorksheet('Resumo');
    ws.columns = [{ width: 36 }, { width: 20 }];
    ws.getCell('A1').value = ABAS[aba].titulo + ' · Hotel Fazenda Oásis'; ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F4C5C' } };
    ws.getCell('A2').value = nomeMes(ym);
    ws.addRow([]);
    var cab = ws.addRow(['Resumo', 'Valor']); cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.eachCell(function (c) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C5C' } }; });
    var t = ws.addRow(['TOTAL', atual.total]); t.font = { bold: true };
    ws.getColumn(2).numFmt = '"R$ "#,##0.00';
    var ws2 = wb.addWorksheet('Beneficiários');
    ws2.columns = [{ header: 'Nome', key: 'nome', width: 30 }, { header: 'Grupo', key: 'grupo', width: 24 }, { header: 'Motivo', key: 'motivo', width: 40 }, { header: 'Valor', key: 'valor', width: 14 }];
    ws2.getRow(1).font = { bold: true };
    atual.linhas.forEach(function (l) { ws2.addRow({ nome: l.nome, grupo: l.grupo, motivo: l.motivo, valor: l.valor }); });
    ws2.getColumn('valor').numFmt = '"R$ "#,##0.00';
    var buf = await wb.xlsx.writeBuffer();
    await salvarArquivo(ABAS[aba].arq + ym + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  root.vRelatorios = vRelatorios;
  root.mdlAcao = function (el) {
    var a = el.dataset.act;
    if (a === 'mdlTodos') { var m = mdl(); m.rel.todos = !m.rel.todos; return render(); }
    if (a === 'mdlAba') { var m2 = mdl(); m2.rel.aba = el.dataset.aba; m2.rel.todos = false; return render(); }
    if (a === 'mdlPDF') return exportarRelPDF();
    if (a === 'mdlXLS') return exportarRelXLS();
  };
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t || !t.dataset || t.dataset.mdl !== 'relMes') return;
    var m = mdl(); m.rel = m.rel || { mes: mesAtual(), todos: false, aba: 'diaria' };
    m.rel.mes = t.value || mesAtual(); m.rel.todos = false;
    render();
  });
})(window);
