/* =====================================================================
   RELATÓRIOS (só administrador). Só consulta: lê os pagamentos já
   registrados (serviços prestados e vale-transporte) e não grava nada.
   ===================================================================== */
(function (root) {
  'use strict';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  
  function mdl() { return (UI.mdl = UI.mdl || { rel: null }); }
  function mesAtual() { return C.hojeISO().slice(0, 7); }
  function brl(v) { return 'R$ ' + servMoeda(v); }
  function nomeMes(ym) { return MESES[+ym.slice(5, 7) - 1] + ' de ' + ym.slice(0, 4); }
  function nomeDoSetor(id) { return id ? nomeSetor(id) : '—'; }
  function arred(v) { return Math.round((+v || 0) * 100) / 100; }

  /* Lê os pagamentos reais do mês (só o que foi marcado como pago). Nada é estimado. */
  function dadosRel(ym) {
    var vt = (S.vt || {})[ym] || {}, pags = vt.pagamentos || {};
    var serv = [], vtL = [], servTot = 0, vtTot = 0, diaTot = 0, outTot = 0;
    (S.funcionarios || []).forEach(function (f) {
      var p = pags[f.id] || {};
      ['q1', 'q2'].forEach(function (q) {
        var v = +((p[q] || {}).valor) || 0;
        if (v > 0) { vtTot += v; vtL.push({ nome: f.nome, tipo: 'Vale-transporte', motivo: q === 'q1' ? '1ª quinzena' : '2ª quinzena', valor: arred(v) }); }
      });
    });
    servPrestadores().forEach(function (p) {
      var grupo = grupoDe(p), c = servCalc(ym, p.id) || {};
      (c.pagos || []).forEach(function (x) {
        if (!x.pago) return;
        var v = +(x.valorPago != null ? x.valorPago : x.valor) || 0;
        if (v > 0) {
          servTot += v; if (grupo === 'diaria') diaTot += v; else outTot += v;
          serv.push({ nome: p.nome, grupo: grupo === 'diaria' ? 'Diarista' : '40/60% e combinados', tipo: grupo, motivo: x.nome + (x.de ? ' (dias ' + x.de + ' a ' + x.ate + ')' : ''), valor: arred(v) });
        }
      });
    });
    var ord = function (a, b) { return (a.grupo < b.grupo ? -1 : a.grupo > b.grupo ? 1 : 0) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'); };
    serv.sort(ord); vtL.sort(ord);
    return {
      serv: { linhas: serv, total: arred(servTot), diaria: arred(diaTot), outros: arred(outTot) },
      vt: { linhas: vtL, total: arred(vtTot) }
    };
  }

  function vRelatorios() {
    var m = mdl(); m.rel = m.rel || { mes: mesAtual(), todos: false, aba: 'servicos' };
    var ym = m.rel.mes, aba = m.rel.aba || 'servicos', d = dadosRel(ym);
    var atual = aba === 'servicos' ? d.serv : d.vt;
    var lim = m.rel.todos ? atual.linhas.length : 5;
    var css = '.rel{max-width:720px;margin:0 auto}' +
      '.rel-top{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:10px;margin-bottom:14px}' +
      '.rel-top input[type=month]{padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card,#fff);color:inherit}' +
      '.rel-abas{display:flex;gap:8px;margin-bottom:12px}' +
      '.rel-aba{flex:1;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--card,#fff);font-weight:700;cursor:pointer;color:inherit}' +
      '.rel-aba.on{background:#0f4c5c;color:#fff;border-color:#0f4c5c;box-shadow:inset 0 -3px 0 #d4a237}' +
      '.rel-hero{background:#0f4c5c;color:#fff;border-radius:16px;padding:20px;border-bottom:4px solid #d4a237;margin-bottom:12px}' +
      '.rel-hero span{display:block;font-size:13px;opacity:.85;letter-spacing:.4px;text-transform:uppercase}' +
      '.rel-hero b{display:block;font-size:30px;margin:6px 0 2px;color:#f5d68a}' +
      '.rel-hero small{opacity:.8}' +
      '.rel-cats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:12px}' +
      '.rel-cat{background:var(--card,#fff);border:1px solid var(--line);border-radius:12px;padding:12px}' +
      '.rel-cat span{display:block;font-size:12px;color:var(--muted,#64748b)}' +
      '.rel-cat b{display:block;font-size:16px;margin-top:4px;color:#0f4c5c}' +
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
      '<button class="rel-aba' + (aba === 'servicos' ? ' on' : '') + '" data-act="mdlAba" data-aba="servicos">Serviços prestados</button>' +
      '<button class="rel-aba' + (aba === 'transporte' ? ' on' : '') + '" data-act="mdlAba" data-aba="transporte">Transporte</button></div>';
    if (aba === 'servicos') {
      h += '<div class="rel-hero"><span>Total de serviços prestados</span><b>' + brl(d.serv.total) + '</b><small>' + esc(nomeMes(ym)) + '</small></div>';
      h += '<div class="rel-cats"><div class="rel-cat"><span>Diaristas</span><b>' + brl(d.serv.diaria) + '</b></div>' +
        '<div class="rel-cat"><span>40/60% e combinados</span><b>' + brl(d.serv.outros) + '</b></div></div>';
    } else {
      h += '<div class="rel-hero"><span>Total de vale-transporte pago</span><b>' + brl(d.vt.total) + '</b><small>' + esc(nomeMes(ym)) + '</small></div>';
    }
    h += '<div class="rel-card"><div class="rel-cab"><b>Quem recebeu?</b><span class="small muted">' + atual.linhas.length + ' pagamento(s)</span></div>';
    if (atual.linhas.length) {
      h += '<ul class="rel-lista">' + atual.linhas.slice(0, lim).map(function (l) {
        return '<li><div><b>' + esc(l.nome) + '</b><small>' + esc(l.grupo || l.tipo) + ' · ' + esc(l.motivo) + '</small></div><strong>' + brl(l.valor) + '</strong></li>';
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

  function tituloAba(aba) { return aba === 'transporte' ? 'Vale-transporte' : 'Serviços prestados'; }

  async function exportarRelPDF() {
    try { await carregarScript('libs/jspdf.umd.min.js'); await carregarScript('libs/jspdf.plugin.autotable.min.js'); }
    catch (e) { return modalMsg('Erro', '<p>Não foi possível carregar o gerador de PDF.</p>'); }
    var ym = mdl().rel.mes, aba = mdl().rel.aba || 'servicos', d = dadosRel(ym), atual = aba === 'servicos' ? d.serv : d.vt;
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(15, 76, 92);
    doc.text(tituloAba(aba), 14, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(60, 60, 60);
    doc.text('Hotel Fazenda Oásis · ' + nomeMes(ym), 14, 25);
    doc.setDrawColor(212, 162, 55); doc.setLineWidth(0.8); doc.line(14, 28, 196, 28);
    var resumo = aba === 'servicos'
      ? [['Diaristas', brl(d.serv.diaria)], ['40/60% e combinados', brl(d.serv.outros)], ['TOTAL', brl(d.serv.total)]]
      : [['TOTAL pago no mês', brl(d.vt.total)]];
    doc.autoTable({ startY: 34, head: [['Resumo', 'Valor']], body: resumo, theme: 'grid', headStyles: { fillColor: [15, 76, 92] }, styles: { font: 'helvetica', fontSize: 10 }, columnStyles: { 1: { halign: 'right' } } });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 10, head: [['Nome', aba === 'servicos' ? 'Grupo' : 'Tipo', 'Motivo', 'Valor']], theme: 'grid',
      body: atual.linhas.map(function (l) { return [l.nome, l.grupo || l.tipo, l.motivo, brl(l.valor)]; }),
      headStyles: { fillColor: [15, 76, 92] }, styles: { font: 'helvetica', fontSize: 9 }, columnStyles: { 3: { halign: 'right' } }
    });
    doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text('Gerado em ' + new Date().toLocaleDateString('pt-BR'), 14, 290);
    await salvarArquivo((aba === 'servicos' ? 'Servicos-prestados-' : 'Transporte-') + ym + '.pdf', doc.output('blob'));
  }

  async function exportarRelXLS() {
    try { await carregarScript('libs/exceljs.min.js'); }
    catch (e) { return modalMsg('Erro', '<p>Não foi possível carregar o gerador de Excel.</p>'); }
    var ym = mdl().rel.mes, aba = mdl().rel.aba || 'servicos', d = dadosRel(ym), atual = aba === 'servicos' ? d.serv : d.vt;
    var wb = new ExcelJS.Workbook(); wb.creator = (S.config && S.config.nomeHotel) || 'Escalas';
    var ws = wb.addWorksheet('Resumo');
    ws.columns = [{ width: 36 }, { width: 20 }];
    ws.getCell('A1').value = tituloAba(aba) + ' · Hotel Fazenda Oásis'; ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F4C5C' } };
    ws.getCell('A2').value = nomeMes(ym);
    ws.addRow([]);
    var cab = ws.addRow(['Resumo', 'Valor']); cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.eachCell(function (c) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C5C' } }; });
    if (aba === 'servicos') { ws.addRow(['Diaristas', d.serv.diaria]); ws.addRow(['40/60% e combinados', d.serv.outros]); var t = ws.addRow(['TOTAL', d.serv.total]); t.font = { bold: true }; }
    else { var t2 = ws.addRow(['TOTAL pago no mês', d.vt.total]); t2.font = { bold: true }; }
    ws.getColumn(2).numFmt = '"R$ "#,##0.00';
    var ws2 = wb.addWorksheet('Beneficiários');
    ws2.columns = [{ header: 'Nome', key: 'nome', width: 30 }, { header: aba === 'servicos' ? 'Grupo' : 'Tipo', key: 'grupo', width: 24 }, { header: 'Motivo', key: 'motivo', width: 40 }, { header: 'Valor', key: 'valor', width: 14 }];
    ws2.getRow(1).font = { bold: true };
    atual.linhas.forEach(function (l) { ws2.addRow({ nome: l.nome, grupo: l.grupo || l.tipo, motivo: l.motivo, valor: l.valor }); });
    ws2.getColumn('valor').numFmt = '"R$ "#,##0.00';
    var buf = await wb.xlsx.writeBuffer();
    await salvarArquivo((aba === 'servicos' ? 'Servicos-prestados-' : 'Transporte-') + ym + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
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
    var m = mdl(); m.rel = m.rel || { mes: mesAtual(), todos: false, aba: 'servicos' };
    m.rel.mes = t.value || mesAtual(); m.rel.todos = false;
    render();
  });
})(window);
