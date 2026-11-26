/* =====================================================================
   RELATÓRIOS (só administrador). Só consulta: lê os pagamentos já
   registrados (VT e serviços prestados) e não grava nada.
   Folha de pagamento e outros pagamentos não têm registro mensal no
   sistema: aparecem como "Não cadastrado" e não entram no total.
   ===================================================================== */
(function (root) {
  'use strict';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var NAO_CAD = 'Não cadastrado';

  function mdl() { return (UI.mdl = UI.mdl || { rel: null }); }
  function mesAtual() { return C.hojeISO().slice(0, 7); }
  function brl(v) { return 'R$ ' + servMoeda(v); }
  function nomeMes(ym) { return MESES[+ym.slice(5, 7) - 1] + ' de ' + ym.slice(0, 4); }
  function nomeDoSetor(id) { return id ? nomeSetor(id) : '—'; }
  function arred(v) { return Math.round((+v || 0) * 100) / 100; }

  /* Lê os pagamentos reais do mês. Nada é estimado. */
  function dadosRel(ym) {
    var vt = (S.vt || {})[ym] || {}, pags = vt.pagamentos || {};
    var linhas = [], vtTot = 0, servTot = 0;
    (S.funcionarios || []).forEach(function (f) {
      var p = pags[f.id] || {};
      ['q1', 'q2'].forEach(function (q) {
        var v = +((p[q] || {}).valor) || 0;
        if (v > 0) {
          vtTot += v;
          linhas.push({ nome: f.nome, tipo: 'Vale-transporte', motivo: q === 'q1' ? '1ª quinzena' : '2ª quinzena', valor: arred(v) });
        }
      });
    });
    servPrestadores().forEach(function (p) {
      var c = servCalc(ym, p.id) || {};
      (c.pagos || []).forEach(function (x) {
        if (!x.pago) return;
        var v = +(x.valorPago != null ? x.valorPago : x.valor) || 0;
        if (v > 0) {
          servTot += v;
          linhas.push({ nome: p.nome, tipo: 'Serviço prestado', motivo: x.nome + (x.de ? ' (dias ' + x.de + ' a ' + x.ate + ')' : ''), valor: arred(v) });
        }
      });
    });
    linhas.sort(function (a, b) { return (a.tipo < b.tipo ? -1 : a.tipo > b.tipo ? 1 : 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'); });
    return { linhas: linhas, vtTot: arred(vtTot), servTot: arred(servTot), total: arred(vtTot + servTot) };
  }

  function catHtml(rotulo, valor) {
    return '<div class="rel-cat"><span>' + esc(rotulo) + '</span>' +
      (valor == null ? '<b class="na">' + NAO_CAD + '</b>' : '<b>' + brl(valor) + '</b>') + '</div>';
  }

  function vRelatorios() {
    var m = mdl(); m.rel = m.rel || { mes: mesAtual(), todos: false };
    var ym = m.rel.mes, d = dadosRel(ym);
    var lim = m.rel.todos ? d.linhas.length : 5;
    var css = '.rel{max-width:720px;margin:0 auto}' +
      '.rel-top{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:14px}' +
      '.rel-top input[type=month]{padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card,#fff);color:inherit}' +
      '.rel-hero{background:#0f4c5c;color:#fff;border-radius:16px;padding:20px;border-bottom:4px solid #d4a237;margin-bottom:12px}' +
      '.rel-hero span{display:block;font-size:13px;opacity:.85;letter-spacing:.4px;text-transform:uppercase}' +
      '.rel-hero b{display:block;font-size:30px;margin:6px 0 2px;color:#f5d68a}' +
      '.rel-hero small{opacity:.8}' +
      '.rel-cats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:8px}' +
      '@media(min-width:700px){.rel-cats{grid-template-columns:repeat(4,1fr)}}' +
      '.rel-cat{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:12px}' +
      '.rel-cat span{display:block;font-size:12px;color:var(--muted,#64748b)}' +
      '.rel-cat b{display:block;font-size:16px;margin-top:4px;color:#0f4c5c}' +
      '.rel-cat b.na{font-size:12px;color:#94a3b8;font-weight:600}' +
      '.rel-nota{font-size:12px;color:var(--muted,#64748b);margin:6px 2px 14px}' +
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
    h += '<div class="rel-top"><div><h1>Relatórios</h1><p class="sub" style="margin:0">Gastos com funcionários e prestadores</p></div>' +
      '<input type="month" data-mdl="relMes" value="' + esc(ym) + '"></div>';
    h += '<div class="rel-hero"><span>Total gasto com funcionários</span><b>' + brl(d.total) + '</b><small>' + esc(nomeMes(ym)) + '</small></div>';
    h += '<div class="rel-cats">' + catHtml('Folha de pagamento', null) + catHtml('Vale-transporte', d.vtTot) +
      catHtml('Serviços prestados', d.servTot) + catHtml('Outros pagamentos', null) + '</div>';
    h += '<p class="rel-nota">Folha e outros pagamentos não têm registro mensal no sistema, então não entram no total.</p>';
    h += '<div class="rel-card"><div class="rel-cab"><b>Quem recebeu?</b><span class="small muted">' + d.linhas.length + ' pagamento(s)</span></div>';
    if (d.linhas.length) {
      h += '<ul class="rel-lista">' + d.linhas.slice(0, lim).map(function (l) {
        return '<li><div><b>' + esc(l.nome) + '</b><small>' + esc(l.tipo) + ' · ' + esc(l.motivo) + '</small></div><strong>' + brl(l.valor) + '</strong></li>';
      }).join('') + '</ul>';
      if (d.linhas.length > 5) h += '<button class="rel-mais" data-act="mdlTodos">' + (m.rel.todos ? 'Mostrar menos' : 'Ver todos (' + d.linhas.length + ')') + '</button>';
    } else {
      h += '<p class="small muted">Nenhum pagamento registrado neste mês.</p>';
    }
    h += '</div>';
    h += '<div class="rel-exp"><button class="btn pri" data-act="mdlPDF">Baixar PDF</button><button class="btn" data-act="mdlXLS">Exportar Excel</button></div>';
    h += '</div>';
    return h;
  }

  async function exportarRelPDF() {
    try { await carregarScript('libs/jspdf.umd.min.js'); await carregarScript('libs/jspdf.plugin.autotable.min.js'); }
    catch (e) { return modalMsg('Erro', '<p>Não foi possível carregar o gerador de PDF.</p>'); }
    var ym = mdl().rel.mes, d = dadosRel(ym);
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(15, 76, 92);
    doc.text('Gastos com funcionários', 14, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(60, 60, 60);
    doc.text('Hotel Fazenda Oásis · ' + nomeMes(ym), 14, 25);
    doc.setDrawColor(212, 162, 55); doc.setLineWidth(0.8); doc.line(14, 28, 196, 28);
    doc.autoTable({
      startY: 34, head: [['Categoria', 'Valor']], theme: 'grid',
      body: [['Folha de pagamento', NAO_CAD], ['Vale-transporte', brl(d.vtTot)], ['Serviços prestados', brl(d.servTot)], ['Outros pagamentos', NAO_CAD], ['TOTAL (sem folha e outros)', brl(d.total)]],
      headStyles: { fillColor: [15, 76, 92] }, styles: { font: 'helvetica', fontSize: 10 }, columnStyles: { 1: { halign: 'right' } }
    });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 10, head: [['Nome', 'Tipo', 'Motivo', 'Valor']], theme: 'grid',
      body: d.linhas.map(function (l) { return [l.nome, l.tipo, l.motivo, brl(l.valor)]; }),
      headStyles: { fillColor: [15, 76, 92] }, styles: { font: 'helvetica', fontSize: 9 }, columnStyles: { 3: { halign: 'right' } }
    });
    doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR'), 14, 290);
    await salvarArquivo('Funcionarios-' + ym + '.pdf', doc.output('blob'));
  }

  async function exportarRelXLS() {
    try { await carregarScript('libs/exceljs.min.js'); }
    catch (e) { return modalMsg('Erro', '<p>Não foi possível carregar o gerador de Excel.</p>'); }
    var ym = mdl().rel.mes, d = dadosRel(ym);
    var wb = new ExcelJS.Workbook(); wb.creator = (S.config && S.config.nomeHotel) || 'Escalas';
    var ws = wb.addWorksheet('Resumo');
    ws.columns = [{ width: 36 }, { width: 20 }];
    ws.getCell('A1').value = 'Gastos com funcionários · Hotel Fazenda Oásis'; ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F4C5C' } };
    ws.getCell('A2').value = nomeMes(ym);
    ws.addRow([]);
    var cab = ws.addRow(['Categoria', 'Valor']); cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.eachCell(function (c) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C5C' } }; });
    ws.addRow(['Folha de pagamento', NAO_CAD]);
    ws.addRow(['Vale-transporte', d.vtTot]);
    ws.addRow(['Serviços prestados', d.servTot]);
    ws.addRow(['Outros pagamentos', NAO_CAD]);
    var tot = ws.addRow(['TOTAL (sem folha e outros)', d.total]); tot.font = { bold: true };
    ws.getColumn(2).numFmt = '"R$ "#,##0.00';
    var ws2 = wb.addWorksheet('Beneficiários');
    ws2.columns = [{ header: 'Nome', key: 'nome', width: 30 }, { header: 'Tipo', key: 'tipo', width: 20 }, { header: 'Motivo', key: 'motivo', width: 40 }, { header: 'Valor', key: 'valor', width: 14 }];
    ws2.getRow(1).font = { bold: true };
    d.linhas.forEach(function (l) { ws2.addRow(l); });
    ws2.getColumn('valor').numFmt = '"R$ "#,##0.00';
    var buf = await wb.xlsx.writeBuffer();
    await salvarArquivo('Funcionarios-' + ym + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  root.vRelatorios = vRelatorios;
  root.mdlAcao = function (el) {
    var a = el.dataset.act;
    if (a === 'mdlTodos') { var m = mdl(); m.rel.todos = !m.rel.todos; return render(); }
    if (a === 'mdlPDF') return exportarRelPDF();
    if (a === 'mdlXLS') return exportarRelXLS();
  };
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t || !t.dataset || t.dataset.mdl !== 'relMes') return;
    var m = mdl(); m.rel = m.rel || { mes: mesAtual(), todos: false };
    m.rel.mes = t.value || mesAtual(); m.rel.todos = false;
    render();
  });
})(window);
