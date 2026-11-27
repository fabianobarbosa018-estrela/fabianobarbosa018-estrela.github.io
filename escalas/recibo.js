/* Recibo de pagamento (Serviços prestados): descontos e adiantamentos do lote, assinatura na tela ou manual, PDF.
   Usa as funções globais de index.html (servCalc, servSalvar, servPagosDoc, abrirModal, modalMsg, salvarArquivo...).
   Não altera dias, descontos, adiantamentos nem extras: só grava o recibo e marca o lote como pago pelo valor líquido. */
(function (root) {
  'use strict';

  const MOD_TELA = 'tela', MOD_MANUAL = 'manual';
  const esc2 = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = v => 'R$ ' + servMoeda(v);
  const agoraISO = () => new Date().toISOString();
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const pdIni = r => (r.diasPend && r.diasPend.length ? r.diasPend[0].dia : r.lote.de);
  const pdFim = r => (r.diasPend && r.diasPend.length ? r.diasPend[r.diasPend.length - 1].dia : r.lote.ate);
  const listaDias = (mes, dias) => dias.map(x => String(x.dia).padStart(2, '0') + '/' + String(mes).slice(5, 7)).join(', ');
  const dataBR = iso => (iso || '').slice(8, 10) + '/' + (iso || '').slice(5, 7) + '/' + (iso || '').slice(0, 4);
  const dataHoraBR = iso => { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

  /* Índice do lote de um lançamento (mesma regra de servCalc: lote escolhido, senão pela data) */
  function ixLote(lotes, x) {
    const n = lotes.length;
    if (x && x.lote) { const i = lotes.findIndex(y => y.id === x.lote); if (i >= 0) return i; }
    if (!x || !x.data) return n - 1;
    const dia = +String(x.data).slice(8, 10);
    const i = lotes.findIndex(l => dia >= l.de && dia <= l.ate);
    return i >= 0 ? i : n - 1;
  }

  /* Monta o recibo de um lote com os números atuais (não grava nada) */
  function montar(mes, pid, loteId) {
    const c = servCalc(mes, pid);
    const i = c.lotes.findIndex(x => x.id === loteId);
    if (i < 0) return null;
    const lote = c.lotes[i], pg = c.pagos[i];
    const l = c.l || {};
    const nome = _capNome((c.p && c.p.nome) || '');

    // Serviços do lote (diárias ou % do valor mensal) e extras
    const extrasI = (l.extras || []).filter(x => ixLote(c.lotes, x) === i).map(x => ({ desc: x.desc || 'Serviço extra', valor: r2(+x.valor || 0) }));
    const totExtras = r2(extrasI.reduce((a, x) => a + x.valor, 0));
    const servico = r2(c.g[i] - totExtras);
    // só conta os dias que foram lançados com valor (os que de fato trabalhou)
    const diasLote = Object.keys(l.dias || {}).filter(d => { const dd = +d; return dd >= lote.de && dd <= lote.ate && (+l.dias[d] || 0) > 0; }).length;
    const saldoAnt = i === 0 ? r2(c.ant) : 0;
    const bruto = r2(servico + totExtras + saldoAnt);

    // Adiantamentos deste lote
    const adiantI = (l.adiant || []).filter(x => ixLote(c.lotes, x) === i).map(x => ({ desc: x.desc || 'Adiantamento', valor: r2(+x.valor || 0) }));
    const totAdiant = r2(adiantI.reduce((a, x) => a + x.valor, 0));

    // Descontos registrados para este lote e o que sobrou de lotes anteriores
    const descI = (l.descontos || []).filter(x => ixLote(c.lotes, x) === i).map(x => ({ desc: x.desc || 'Desconto', valor: r2(+x.valor || 0) }));
    const somaDesc = r2(descI.reduce((a, x) => a + x.valor, 0));
    const aplicado = c.dsc[i];
    const deAntes = r2(Math.max(0, aplicado - somaDesc));
    const naoAbatido = r2(Math.max(0, somaDesc - aplicado));
    const descLinhas = descI.slice();
    if (deAntes > 0) descLinhas.push({ desc: 'Descontos de lotes anteriores que não couberam antes', valor: deAntes });

    // Pendências: descontos cadastrados até este lote que ainda não foram abatidos (não são descontados aqui)
    let demAcum = 0, abatAcum = 0;
    for (let j = 0; j <= i; j++) {
      demAcum += (l.descontos || []).filter(x => ixLote(c.lotes, x) === j).reduce((a, x) => a + (+x.valor || 0), 0);
      abatAcum += c.dsc[j];
    }
    const pendencia = r2(Math.max(0, demAcum - abatAcum));

    const totDesc = r2(totAdiant + aplicado);
    const liquido = r2(bruto - totAdiant - aplicado);
    // Parte do líquido que já foi paga antes (pagamento parcial): este recibo cobre só o saldo
    const pagoAntes = pg.pago ? r2(pg.valorPago != null ? pg.valorPago : pg.valor) : 0;
    const saldo = r2(liquido - pagoAntes);
    // Só o que ainda falta pagar: o valor já pago abate os primeiros dias do lote, em ordem de data
    const diasPend = [];
    if (c.modal === 'diaria') {
      let resto = pagoAntes;
      Object.keys(l.dias || {}).map(Number).filter(dd => dd >= lote.de && dd <= lote.ate).sort((a, b) => a - b).forEach(dd => {
        const v = r2(+l.dias[dd] || 0);
        if (v <= 0) return;
        if (resto >= v - 0.004) resto = r2(resto - v); else diasPend.push({ dia: dd, valor: v });
      });
    }
    const servicoAPagar = r2(servico - pagoAntes);
    return {
      mes, pid, loteId, lote: { id: lote.id, nome: lote.nome, de: lote.de, ate: lote.ate },
      prestador: { nome, funcao: (c.p && c.p.funcao) || '', modal: c.modal },
      diasLote: diasPend.length, servico, extras: extrasI, totExtras, saldoAnt, bruto,
      adiantamentos: adiantI, totAdiant,
      descontos: descLinhas, descAplicado: aplicado, naoAbatido, pendencia,
      totDesc, liquido,
      valorRegistrado: pg.valor, consistente: liquido === r2(pg.valor),
      pagoAntes, saldo, liquidoLote: liquido, diasPend, servicoAPagar
    };
  }

  /* ---------- PDF ---------- */
  async function gerarPDF(rec, numero, opts) {
    const ok = await servPDFLibs(); if (!ok) return null;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = await pdfCabecalho(doc, 12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text('RECIBO DE PAGAMENTO', 105, y + 6, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('Nº ' + numero, 200, y + 6, { align: 'right' });
    y += 14;
    const p2 = n => String(n).padStart(2, '0');
    const mm = rec.mes.slice(5, 7), aa = rec.mes.slice(0, 4);
    // Período = dias ainda não pagos (primeiro ao último); sem pendência, o período do lote
    const pd = rec.diasPend && rec.diasPend.length ? rec.diasPend : null;
    const de = pd ? pd[0].dia : rec.lote.de, ate = pd ? pd[pd.length - 1].dia : rec.lote.ate;
    const periodo = p2(de) + '/' + mm + '/' + aa + ' a ' + p2(ate) + '/' + mm + '/' + aa;
    const txt = 'Recebi do Hotel Fazenda Oásis (CNPJ 52.756.106/0001-13) a importância líquida de ' + brl(rec.liquido) +
      ', referente a serviços prestados no período de ' + periodo + ', conforme discriminado abaixo.';
    doc.setFontSize(10);
    const linhas = doc.splitTextToSize(txt, 180);
    doc.text(linhas, 15, y); y += linhas.length * 5 + 4;
    doc.setFont('helvetica', 'bold'); doc.text('Beneficiário: ' + rec.prestador.nome, 15, y); y += 6; doc.setFont('helvetica', 'normal');

    const corpo = [];
    const svcP = rec.servicoAPagar != null ? rec.servicoAPagar : rec.servico, diasP = rec.diasPend || [];
    if (svcP) corpo.push(['Serviços a pagar' + (rec.prestador.modal === 'diaria' ? ' (' + diasP.length + ' dia(s)' + (diasP.length ? ': ' + listaDias(rec.mes, diasP) : '') + ')' : ''), brl(svcP)]);
    (rec.extras || []).forEach(x => corpo.push(['Extra: ' + x.desc, brl(x.valor)]));
    if (rec.saldoAnt) corpo.push(['Saldo de meses anteriores', brl(rec.saldoAnt)]);
    const descCorpo = [];
    rec.adiantamentos.forEach(x => descCorpo.push(['Adiantamento: ' + x.desc, '− ' + brl(x.valor)]));
    rec.descontos.forEach(x => descCorpo.push(['Desconto: ' + x.desc, '− ' + brl(x.valor)]));
    if (!descCorpo.length) descCorpo.push(['Descontos', 'nenhum']);
    corpo.push(...descCorpo);
    corpo.push([{ content: 'VALOR A RECEBER (SALDO)', styles: { fontStyle: 'bold', fillColor: [230, 242, 240] } }, { content: brl(rec.liquido), styles: { fontStyle: 'bold', fillColor: [230, 242, 240] } }]);
    doc.autoTable({ startY: y, body: corpo, theme: 'grid', styles: { fontSize: 9.5, cellPadding: 2.2 }, columnStyles: { 0: { cellWidth: 135 }, 1: { halign: 'right' } }, margin: { left: 15, right: 15 } });
    y = doc.lastAutoTable.finalY + 6;

    if (rec.pendencia > 0) {
      doc.setFontSize(9); doc.setTextColor(160, 90, 0);
      doc.text('Pendência para conferência (não descontada neste recibo): ' + brl(rec.pendencia), 15, y); doc.setTextColor(0, 0, 0); y += 8;
    }

    // Assinatura
    y = Math.max(y + 4, 200);
    doc.setFontSize(9.5);
    if (opts.modalidade === MOD_TELA && opts.assinatura) {
      try { doc.addImage(opts.assinatura, 'PNG', 60, y - 22, 80, 26); } catch (e) { }
    }
    doc.line(50, y + 4, 160, y + 4);
    doc.text(rec.prestador.nome, 105, y + 9, { align: 'center' });
    y += 14;
    if (opts.modalidade === MOD_TELA) {
      doc.setFontSize(8.5); doc.setTextColor(60, 60, 60);
      doc.text('Assinado eletronicamente por ' + rec.prestador.nome + ' em ' + dataHoraBR(opts.em) + '.', 105, y, { align: 'center' });
      doc.text('Assinatura desenhada na tela do dispositivo. Não é certificado digital ICP-Brasil.', 105, y + 4, { align: 'center' });
    } else {
      doc.setFontSize(8.5); doc.setTextColor(60, 60, 60);
      doc.text('Assinatura manual do beneficiário.', 105, y, { align: 'center' });
    }
    doc.setTextColor(0, 0, 0);
    return doc.output('blob');
  }

  function nomeArquivo(rec, numero) {
    return 'recibo-' + numero + '-' + rec.prestador.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.pdf';
  }

  /* ---------- tela ---------- */
  function resumoHtml(rec) {
    const linha = (t, v, cls) => `<tr class="${cls || ''}"><td>${esc2(t)}</td><td style="text-align:right;white-space:nowrap">${v}</td></tr>`;
    let h = '<table class="rcb-tab"><tbody>';
    const svc = rec.servicoAPagar != null ? rec.servicoAPagar : rec.servico, dias = rec.diasPend || [];
    if (svc) h += linha('Serviços a pagar' + (rec.prestador.modal === 'diaria' ? ' (' + dias.length + ' dia(s)' + (dias.length ? ': ' + listaDias(rec.mes, dias) : '') + ')' : ''), brl(svc));
    rec.extras.forEach(x => { h += linha('Extra: ' + esc2(x.desc), brl(x.valor)); });
    if (rec.saldoAnt) h += linha('Saldo de meses anteriores', brl(rec.saldoAnt));
    h += linha('<b>Valor bruto</b>', '<b>' + brl(r2(svc + rec.extras.reduce((a, x) => a + (+x.valor || 0), 0) + (rec.saldoAnt || 0))) + '</b>', 'rcb-sub');
    rec.adiantamentos.forEach(x => { h += linha('Adiantamento: ' + esc2(x.desc), '− ' + brl(x.valor), 'rcb-desc'); });
    rec.descontos.forEach(x => { h += linha('Desconto: ' + esc2(x.desc), '− ' + brl(x.valor), 'rcb-desc'); });
    h += linha('<b>Total de descontos</b>', '<b>− ' + brl(rec.totDesc) + '</b>', 'rcb-sub');
    h += linha('<b>Valor deste recibo</b>', '<b>' + brl(rec.liquido) + '</b>', 'rcb-liq');
    h += '</tbody></table>';
    if (rec.pendencia > 0) h += `<div class="alert w mt"><span class="ic">!</span><div><b>Pendência para conferência:</b> ${brl(rec.pendencia)} em descontos ainda não abatidos. Não foi descontado automaticamente neste recibo.</div></div>`;
    if (!rec.consistente) h += `<div class="alert w mt"><span class="ic">!</span><div>O valor do lote na tela (${brl(rec.valorRegistrado)}) não bate com o líquido deste recibo (${brl(rec.liquido)}). Confira antes de assinar.</div></div>`;
    return h;
  }

  /* Canvas de assinatura: dedo no celular ou mouse no computador */
  function iniciarPad(cv) {
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth || 300, h = cv.clientHeight || 180;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    let desenhando = false, ultimo = null, tocou = false;
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.onpointerdown = e => { desenhando = true; try { cv.setPointerCapture(e.pointerId); } catch (_) { } ultimo = pos(e); e.preventDefault(); };
    cv.onpointermove = e => {
      if (!desenhando) return;
      const p = pos(e); ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ultimo = p; tocou = true; e.preventDefault(); if (pad.onChange) pad.onChange(tocou);
    };
    const fim = () => { desenhando = false; ultimo = null; };
    cv.onpointerup = fim; cv.onpointercancel = fim;
    const pad = {
      onChange: null,
      limpar() { ctx.clearRect(0, 0, w, h); tocou = false; if (pad.onChange) pad.onChange(false); },
      temAssinatura() { return tocou; },
      png() { return cv.toDataURL('image/png'); }
    };
    return pad;
  }

  function estiloRecibo() {
    if (document.getElementById('rcbCss')) return;
    const s = document.createElement('style'); s.id = 'rcbCss';
    s.textContent = `.rcb-tab{width:100%;border-collapse:collapse;font-size:14px}.rcb-tab td{padding:7px 4px;border-bottom:1px solid var(--line,#e5e7eb)}
      .rcb-sub td{background:#f6f8f8}.rcb-desc td:last-child{color:#b91c1c}.rcb-liq td{background:#e6f2f0;font-size:16px;border-bottom:0}
      .rcb-pad{width:100%;height:200px;border:2px dashed #94a3b8;border-radius:12px;background:#fff;touch-action:none;display:block}
      .rcb-modo{display:flex;gap:8px;flex-wrap:wrap}.rcb-modo label{flex:1;min-width:150px;border:1px solid var(--line,#d1d5db);border-radius:10px;padding:10px;cursor:pointer}
      .rcb-modo input{margin-right:6px}.rcb-chk{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:14px}`;
    document.head.appendChild(s);
  }

  /* Abre o recibo de um lote: ver (se já assinado) ou emitir */
  async function abrir(mes, pid, loteId) {
    if (!pode('servicos')) return toast('Seu acesso não inclui esta função.');
    const k = servKey(mes, pid);
    const guardado = (S.servicos[k] && S.servicos[k].recibos || {})[loteId];
    if (guardado) return verRecibo(mes, pid, loteId, guardado);
    const rec = montar(mes, pid, loteId);
    if (!rec) return toast('Lote não encontrado.');
    if (rec.liquido <= 0) return modalMsg('Recibo', '<p>Não há valor líquido a receber neste lote.</p>');
    if (rec.saldo <= 0.004) return modalMsg('Recibo', '<p>Este lote já está pago e já tem recibo registrado.</p>');
    estiloRecibo();
    let modalidade = MOD_TELA, pad = null;
    const w = abrirModal(`<div class="mh">Recibo · ${esc2(rec.prestador.nome)}<div class="small muted" style="font-weight:400">${esc2(rec.lote.nome)} · ${esc2(servMesNome(mes))}</div></div>
      <div class="mbd" id="rcbCorpo">
        ${resumoHtml(rec)}
        <div class="fld mt"><label class="f">Como será assinado</label>
          <div class="rcb-modo">
            <label><input type="radio" name="rcbModo" value="${MOD_TELA}" checked>Assinar na tela</label>
            <label><input type="radio" name="rcbModo" value="${MOD_MANUAL}">Assinatura manual (imprimir)</label>
          </div></div>
        <div id="rcbArea"></div>
        <label class="rcb-chk"><input type="checkbox" id="rcbOk"><span id="rcbOkTxt">Confirmo que recebi <b>${brl(rec.saldo)}</b> (valor deste recibo), referente a este lote.</span></label>
      </div>
      <div class="mf" style="flex-wrap:wrap;gap:8px"><button class="btn" data-x="c">Cancelar</button><button class="btn" id="rcbLimpar" style="display:none">Limpar assinatura</button><button class="btn" id="rcbPDF" style="display:none">Gerar PDF para assinar</button><button class="btn pri" id="rcbOkBtn" disabled>Confirmar e assinar</button></div>`);
    const q = s => w.querySelector(s);
    const area = () => {
      if (modalidade === MOD_TELA) {
        q('#rcbArea').innerHTML = `<div class="fld mt"><label class="f">Assinatura do beneficiário (use o dedo ou o mouse)</label><canvas id="rcbPad" class="rcb-pad"></canvas></div>`;
        q('#rcbLimpar').style.display = ''; q('#rcbPDF').style.display = 'none';
        const cv = q('#rcbPad');
        pad = iniciarPad(cv);
        pad.onChange = () => atualizar();
      } else {
        q('#rcbArea').innerHTML = `<p class="small muted mt">Imprima o recibo, o beneficiário assina no papel e depois você confirma aqui. Nenhuma assinatura digital é registrada neste modo.</p>`;
        q('#rcbLimpar').style.display = 'none'; q('#rcbPDF').style.display = '';
        pad = null;
      }
      q('#rcbOk').checked = false; atualizar();
    };
    const atualizar = () => {
      const ok = q('#rcbOk').checked;
      const pronto = modalidade === MOD_TELA ? (pad && pad.temAssinatura() && ok) : ok;
      q('#rcbOkBtn').disabled = !pronto;
      q('#rcbOkTxt').innerHTML = modalidade === MOD_TELA
        ? `Confirmo que recebi <b>${brl(rec.saldo)}</b> (valor deste recibo), referente a este lote, e que esta assinatura é do beneficiário.`
        : `Confirmo que o beneficiário assinou o recibo impresso no valor de <b>${brl(rec.saldo)}</b>.`;
    };
    w.querySelectorAll('input[name=rcbModo]').forEach(r => r.onchange = () => { modalidade = r.value; area(); });
    q('#rcbOk').onchange = atualizar;
    q('#rcbLimpar').onclick = () => { if (pad) pad.limpar(); };
    q('#rcbPDF').onclick = async () => {
      const blob = await gerarPDF(Object.assign({}, rec, { liquido: rec.saldo, liquidoLote: rec.liquido }), 'RASCUNHO', { modalidade: MOD_MANUAL });
      if (blob) salvarArquivo('recibo-para-assinar-' + rec.lote.id + '.pdf', blob);
    };
    q('[data-x=c]').onclick = () => fecharModal(w);
    q('#rcbOkBtn').onclick = async () => {
      const ok = q('#rcbOk').checked;
      if (!ok) return;
      if (modalidade === MOD_TELA && !(pad && pad.temAssinatura())) return toast('Faça a assinatura antes de confirmar.');
      q('#rcbOkBtn').disabled = true;
      try {
        await gravar(mes, pid, loteId, rec, modalidade, modalidade === MOD_TELA ? pad.png() : null);
        fecharModal(w);
      } catch (e) {
        q('#rcbOkBtn').disabled = false;
        toast('Não consegui salvar o recibo. Tente de novo.');
      }
    };
    area();
  }

  /* Grava o recibo assinado e marca o lote como pago pelo líquido (sem tocar em dias, descontos ou adiantamentos) */
  async function gravar(mes, pid, loteId, rec, modalidade, assinatura) {
    const k = servKey(mes, pid);
    const atual = S.servicos[k] || {};
    const agora = agoraISO();
    const numero = 'REC-' + mes.replace('-', '') + '-' + pid.slice(-4).toUpperCase() + '-' + (rec.lote.id || '').slice(-4).toUpperCase();
    const recibo = {
      numero, modalidade, em: agora, dataPagamento: hojeISO(),
      assinadoPor: rec.prestador.nome, assinatura: assinatura || null,
      mes, pid, lote: rec.lote,
      servico: rec.servico, extras: rec.extras, saldoAnt: rec.saldoAnt, bruto: rec.bruto,
      adiantamentos: rec.adiantamentos, descontos: rec.descontos, totDesc: rec.totDesc,
      pendencia: rec.pendencia, liquido: rec.saldo, liquidoLote: rec.liquido, jaPago: rec.pagoAntes, prestador: rec.prestador, diasLote: rec.diasLote, servicoAPagar: rec.servicoAPagar, diasPend: rec.diasPend
    };
    // O pagamento do lote é confirmado aqui, pela assinatura: valor total do lote recebido
    const pagos = Object.assign({}, servPagosDoc(atual));
    pagos[loteId] = Object.assign({}, pagos[loteId], { pago: true, valorPago: rec.liquido, data: hojeISO() });
    const recibos = Object.assign({}, atual.recibos || {}, { [loteId]: recibo });
    await servSalvar(mes, pid, { pagos, recibos });
    log('servicos', 'Recibo ' + (modalidade === MOD_TELA ? 'assinado na tela' : 'assinado à mão') + ': ' + rec.prestador.nome + ' · ' + rec.lote.nome + ' · ' + brl(rec.liquido));
    render();
    const blob = await gerarPDF(recibo, numero, { modalidade, assinatura, em: agora });
    const w = abrirModal(`<div class="mh">Recibo assinado</div><div class="mbd">
      <p><b>${esc2(numero)}</b> · ${brl(recibo.liquido)} · ${esc2(recibo.prestador.nome)}</p>
      <p class="small muted">Registrado em ${dataHoraBR(agora)}. O valor líquido foi marcado como pago.</p></div>
      <div class="mf"><button class="btn" data-x="c">Fechar</button><button class="btn pri" data-x="p">Ver, imprimir ou compartilhar PDF</button></div>`);
    w.querySelector('[data-x=c]').onclick = () => fecharModal(w);
    w.querySelector('[data-x=p]').onclick = () => { if (blob) salvarArquivo(nomeArquivo(recibo, numero), blob); };
  }

  /* Recibo já emitido: mostra o registro guardado (não recalcula) */
  async function verRecibo(mes, pid, loteId, r) {
    estiloRecibo();
    const linhas = [
      ['Número', esc2(r.numero)],
      ['Modo', r.modalidade === MOD_TELA ? 'Assinado na tela' : 'Assinado à mão (impresso)'],
      ['Registrado em', dataHoraBR(r.em)],
      ['Valor líquido', brl(r.liquido)]
    ].map(([t, v]) => `<tr><td>${t}</td><td style="text-align:right">${v}</td></tr>`).join('');
    const w = abrirModal(`<div class="mh">Recibo · ${esc2(r.prestador.nome)}<div class="small muted" style="font-weight:400">${esc2(r.lote.nome)} · ${esc2(servMesNome(mes))}</div></div>
      <div class="mbd">${resumoHtml({ ...r, consistente: true, pendencia: r.pendencia || 0 })}
        <table class="rcb-tab mt"><tbody>${linhas}</tbody></table>
        ${r.assinatura ? `<div class="mt"><span class="small muted">Assinatura registrada</span><img src="${r.assinatura}" alt="Assinatura" style="display:block;max-width:100%;height:110px;object-fit:contain;border:1px solid var(--line,#e5e7eb);border-radius:10px;background:#fff"></div>` : ''}
      </div>
      <div class="mf"><button class="btn" data-x="c">Fechar</button><button class="btn pri" data-x="p">Ver, imprimir ou compartilhar PDF</button></div>`);
    w.querySelector('[data-x=c]').onclick = () => fecharModal(w);
    w.querySelector('[data-x=p]').onclick = async () => {
      const blob = await gerarPDF(r, r.numero, { modalidade: r.modalidade, assinatura: r.assinatura, em: r.em });
      if (blob) salvarArquivo(nomeArquivo(r, r.numero), blob);
    };
  }

  /* ---------- envio por WhatsApp (mesmo mecanismo dos contratos) ---------- */
  const isoLocal = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const numeroRec = (mes, pid, loteId) => 'REC-' + mes.replace('-', '') + '-' + pid.slice(-4).toUpperCase() + '-' + (loteId || '').slice(-4).toUpperCase();
  const contratoIdRec = (mes, pid, loteId) => 'rec|' + mes + '|' + pid + '|' + loteId;

  /* Documento que o prestador lê e assina: foto dos valores no momento do envio */
  function documentoRecibo(rec, numero) {
    const p2 = n => String(n).padStart(2, '0');
    // Só o que falta pagar (dias ainda não pagos), com os descontos e adiantamentos que houve
    const linhas = [];
    const svc = rec.servicoAPagar != null ? rec.servicoAPagar : rec.servico, dias = rec.diasPend || [];
    if (svc) linhas.push({ t: 'Serviços a pagar' + (rec.prestador.modal === 'diaria' ? ' (' + dias.length + ' dia(s)' + (dias.length ? ': ' + listaDias(rec.mes, dias) : '') + ')' : ''), v: brl(svc) });
    (rec.extras || []).forEach(x => linhas.push({ t: 'Extra: ' + x.desc, v: brl(x.valor) }));
    if (rec.saldoAnt) linhas.push({ t: 'Saldo de meses anteriores', v: brl(rec.saldoAnt) });
    const descs = [];
    rec.adiantamentos.forEach(x => descs.push({ t: 'Adiantamento: ' + x.desc, v: '− ' + brl(x.valor) }));
    rec.descontos.forEach(x => descs.push({ t: 'Desconto: ' + x.desc, v: '− ' + brl(x.valor) }));
    if (!descs.length) descs.push({ t: 'Descontos', v: 'nenhum' });
    linhas.push(...descs);
    linhas.push({ t: 'Valor a receber (saldo)', v: brl(rec.liquido), negrito: true });
    return {
      tipo: 'recibo', numero, hotel: 'Hotel Fazenda Oásis', cnpj: '52.756.106/0001-13',
      contratada: { nome: rec.prestador.nome, doc: '' },
      lote: rec.lote.nome, inicio: rec.mes + '-' + p2(pdIni(rec)), fim: rec.mes + '-' + p2(pdFim(rec)),
      linhas, liquido: rec.liquido, pendencia: rec.pendencia,
      mes: rec.mes, pid: rec.pid, loteId: rec.loteId, loteObj: rec.lote,
      servico: rec.servico, extras: rec.extras, saldoAnt: rec.saldoAnt, bruto: rec.bruto,
      adiantamentos: rec.adiantamentos, descontos: rec.descontos, totDesc: rec.totDesc,
      liquidoLote: rec.liquidoLote, jaPago: rec.pagoAntes, diasLote: rec.diasLote, prestador: rec.prestador,
      servicoAPagar: rec.servicoAPagar, diasPend: rec.diasPend
    };
  }

  async function enviarWhats(mes, pid, loteId, btn) {
    if (!pode('servicos') || S.somenteLeitura) return toast('Seu acesso não inclui esta função.');
    const rec = montar(mes, pid, loteId);
    if (!rec) return toast('Lote não encontrado.');
    if (rec.saldo <= 0.004) return modalMsg('Recibo', '<p>Este lote já está pago.</p>');
    if (rec.liquido <= 0) return modalMsg('Recibo', '<p>Não há valor líquido a receber neste lote.</p>');
    if (btn) { btn.disabled = true; btn.textContent = 'Gerando link…'; }
    try {
      const doc = Object.assign({}, documentoRecibo(Object.assign({}, rec, { liquido: rec.saldo, liquidoLote: rec.liquido }), numeroRec(mes, pid, loteId)));
      const r = await Nuvem.rpc('esc_recibo_link', { p_contrato_id: contratoIdRec(mes, pid, loteId), p_documento: doc, p_dias: 7 });
      const base = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
      const url = base + 'assinar.html#' + r.link;
      const atual = S.servicos[servKey(mes, pid)] || {};
      await servSalvar(mes, pid, { recibosLink: Object.assign({}, atual.recibosLink || {}, { [loteId]: { id: r.id, expira: r.expira, criadoEm: agoraISO() } }) });
      const primeiro = String(rec.prestador.nome || '').split(' ')[0];
      const texto = 'Olá' + (primeiro ? ', ' + primeiro : '') + '! Segue o recibo de pagamento do Hotel Fazenda Oásis para você conferir e assinar pelo celular: ' + url + ' . O link vale por 7 dias.';
      modalMsg('Link de assinatura pronto', `<p>Mande para <b>${esc2(rec.prestador.nome)}</b>. O link vale 7 dias e só serve para este recibo.</p>
        <div class="fld mt"><label class="f">Link</label><input type="text" readonly value="${esc2(url)}" onclick="this.select()"></div>
        <div class="row mt"><a class="btn pri" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(texto)}">Enviar pelo WhatsApp</a><button class="btn" id="rcbCopia">Copiar link</button></div>
        <p class="small muted mt">Quando ele assinar, o lote é marcado como pago pelo líquido e o PDF assinado fica salvo aqui.</p>`);
      setTimeout(() => { const b = document.getElementById('rcbCopia'); if (b) b.onclick = () => { navigator.clipboard && navigator.clipboard.writeText(url).then(() => toast('Link copiado.'), () => toast('Não consegui copiar.')); }; }, 50);
      render();
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Enviar pelo WhatsApp'; }
      toast('Não deu para gerar o link: ' + ((e && e.message) || 'tente de novo').replace(/^[A-Z_]+:\s*/, ''));
    }
  }

  /* Grava o recibo a partir da assinatura feita pelo link (valores do documento que foi assinado) */
  async function gravarRemoto(mes, pid, loteId, ass) {
    const k = servKey(mes, pid), atual = S.servicos[k] || {}, d = ass.documento || {};
    const quando = new Date(ass.assinado_em);
    const recibo = {
      numero: d.numero || numeroRec(mes, pid, loteId), modalidade: MOD_TELA, origem: 'whatsapp', em: ass.assinado_em,
      dataPagamento: isoLocal(quando), assinadoPor: ass.nome, cpf: ass.cpf, assinatura: ass.assinatura || null,
      codigo: String(ass.documento_hash || '').slice(0, 16).toUpperCase(),
      mes, pid, lote: d.loteObj, servico: d.servico, extras: d.extras || [], saldoAnt: d.saldoAnt || 0, bruto: d.bruto,
      adiantamentos: d.adiantamentos || [], descontos: d.descontos || [], totDesc: d.totDesc, pendencia: d.pendencia || 0,
      liquido: d.liquido, liquidoLote: d.liquidoLote, jaPago: d.jaPago, prestador: d.prestador, diasLote: d.diasLote, servicoAPagar: d.servicoAPagar, diasPend: d.diasPend
    };
    const pagos = Object.assign({}, servPagosDoc(atual));
    pagos[loteId] = Object.assign({}, pagos[loteId], { pago: true, valorPago: d.liquidoLote, data: isoLocal(quando) });
    const recibos = Object.assign({}, atual.recibos || {}, { [loteId]: recibo });
    const links = Object.assign({}, atual.recibosLink || {}); delete links[loteId];
    await servSalvar(mes, pid, { pagos, recibos, recibosLink: links });
    log('servicos', 'Recibo assinado pelo WhatsApp: ' + (d.prestador && d.prestador.nome || '') + ' · ' + (d.loteObj && d.loteObj.nome || '') + ' · ' + brl(d.liquidoLote));
  }

  /* Consulta o link de um lote: se foi assinado, registra; se expirou ou foi cancelado, libera para reenviar */
  async function sincronizarLote(mes, pid, loteId) {
    const atual = S.servicos[servKey(mes, pid)] || {};
    if (!(atual.recibosLink || {})[loteId] || (atual.recibos || {})[loteId]) return 'nada';
    const lista = await Nuvem.rpc('esc_assinaturas_listar', { p_contrato_id: contratoIdRec(mes, pid, loteId) });
    const ass = (lista || []).find(x => x.status === 'assinado');
    if (ass) { await gravarRemoto(mes, pid, loteId, ass); return 'assinado'; }
    if ((lista || []).some(x => x.status === 'pendente')) return 'pendente';
    const links = Object.assign({}, atual.recibosLink || {}); delete links[loteId];
    await servSalvar(mes, pid, { recibosLink: links });
    return 'liberado';
  }

  let sincronizando = false;
  /* Ao abrir Serviços prestados: confere os links pendentes do mês e registra as assinaturas feitas */
  async function sincronizarMes(mes) {
    if (sincronizando || !mes || !S.servicos) return;
    const alvos = [];
    Object.keys(S.servicos).forEach(k => {
      if (k.indexOf(mes + '__') !== 0) return;
      const l = S.servicos[k] || {};
      Object.keys(l.recibosLink || {}).forEach(loteId => { if (!(l.recibos || {})[loteId]) alvos.push([l.pid || k.slice(mes.length + 2), loteId]); });
    });
    if (!alvos.length) return;
    sincronizando = true;
    let mudou = false;
    try {
      for (const [pid, loteId] of alvos) {
        const r = await sincronizarLote(mes, pid, loteId);
        if (r === 'assinado' || r === 'liberado') mudou = true;
      }
    } catch (e) { /* sem internet: tenta de novo na próxima abertura */ }
    finally { sincronizando = false; }
    if (mudou) render();
  }

  /* Botões do recibo no cartão do lote */
  root.reciboBotoes = function (mes, pid, loteId, l) {
    const r = (l.recibos || {})[loteId], pend = (l.recibosLink || {})[loteId];
    const btnAbrir = `<button class="btn sm" data-act="rcbAbrir" data-pid="${esc2(pid)}" data-lote="${esc2(loteId)}">${r ? 'Ver recibo' : 'Emitir recibo'}</button>`;
    if (r) return btnAbrir;
    const aguarda = pend ? `<span class="small muted">Link enviado · aguardando assinatura</span>` : '';
    return aguarda + btnAbrir + `<button class="btn sm pri" data-act="rcbWhats" data-pid="${esc2(pid)}" data-lote="${esc2(loteId)}">${pend ? 'Reenviar WhatsApp' : 'Enviar pelo WhatsApp'}</button>`;
  };
  root.reciboSincronizarMes = sincronizarMes;

  root.reciboAcao = function (el) {
    const act = el.dataset.act;
    if (act === 'rcbAbrir') return abrir(UI.servMes, el.dataset.pid, el.dataset.lote);
    if (act === 'rcbWhats') return enviarWhats(UI.servMes, el.dataset.pid, el.dataset.lote, el);
  };
  root.reciboMontar = montar;
})(window);
