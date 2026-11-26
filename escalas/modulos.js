/* =====================================================================
   RELATÓRIOS (só administrador). Só consulta: lê os dados já carregados em S
   e não grava nada. Não altera nenhum cálculo existente.
   ===================================================================== */
(function (root) {
  'use strict';
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var AFAST = ['atestado', 'suspensao', 'afast'];

  function mdl() { return (UI.mdl = UI.mdl || { rel: null }); }
  function mesAtual() { return C.hojeISO().slice(0, 7); }
  function brl(v) { return 'R$ ' + servMoeda(v); }
  function nomeMes(ym) { return MESES[+ym.slice(5, 7) - 1] + ' de ' + ym.slice(0, 4); }
  function dataCurta(iso) { return iso ? C.dataBR(iso).slice(0, 5) : '—'; }
  function nomeDoSetor(id) { return id ? nomeSetor(id) : '—'; }
  function ativos() { return S.funcionarios.filter(function (f) { return f.ativo; }).slice().sort(function (a, b) { return cmpSetor(a.setorId, b.setorId) || String(a.nome).localeCompare(String(b.nome), 'pt-BR'); }); }
  function cardRes(titulo, valor, sub) {
    return '<div class="card" style="flex:1 1 180px;min-width:150px"><div class="small muted">' + esc(titulo) + '</div><div style="font-size:20px;font-weight:700;margin-top:4px">' + valor + '</div>' + (sub ? '<div class="small muted" style="margin-top:2px">' + esc(sub) + '</div>' : '') + '</div>';
  }
  function diasAfastNoMes(fid, ym) {
    var aj = ((S.vt || {})[ym] || {}).ajustes || {}, dias = 0;
    Object.keys(aj[fid] || {}).forEach(function (d) { var a = aj[fid][d]; if (d.slice(0, 7) === ym && a && AFAST.indexOf(a.t) >= 0) dias++; });
    return dias;
  }
  function feriasNoMes(f, ym) {
    var ini = ym + '-01', fim = C.addDias(C.addDias(ym + '-01', 31), -1);
    return (f.ferias || []).filter(function (p) { return p.ini <= fim && p.fim >= ini; });
  }

  function vRelatorios() {
    var m = mdl(); m.rel = m.rel || { mes: mesAtual() };
    var ym = m.rel.mes, vt = (S.vt || {})[ym] || {}, fech = vt.fechamentos || {}, pags = vt.pagamentos || {};
    var pessoas = ativos().map(function (f) { return { f: f, dias: diasAfastNoMes(f.id, ym), fer: feriasNoMes(f, ym) }; });
    var totVT = ['q1', 'q2'].reduce(function (a, q) { return a + (+((fech[q] || {}).total) || 0); }, 0);
    var pagoVT = 0; Object.keys(pags).forEach(function (fid) { ['q1', 'q2'].forEach(function (q) { pagoVT += +(((pags[fid] || {})[q] || {}).valor) || 0; }); });
    var servs = servPrestadores().map(function (p) { var c = servCalc(ym, p.id) || {}; return { p: p, liq: +c.liquido || 0, pago: +c.pago || 0, saldo: +c.saldo || 0 }; }).filter(function (x) { return x.liq > 0 || x.pago > 0; });
    var servLiq = servs.reduce(function (a, x) { return a + x.liq; }, 0), servSaldo = servs.reduce(function (a, x) { return a + x.saldo; }, 0);
    var h = '<div class="row mb" style="flex-wrap:wrap;gap:8px;justify-content:space-between"><div><h1>Relatórios</h1><p class="sub" style="margin:0">Resumo do mês: ' + esc(nomeMes(ym)) + '</p></div>' +
      '<div class="row" style="gap:8px"><input type="month" data-mdl="relMes" value="' + esc(ym) + '">' +
      '<button class="btn" data-act="mdlImprimir">' + ic('print') + ' Imprimir</button></div></div>';
    h += '<div class="row mb" style="flex-wrap:wrap;gap:10px">' +
      cardRes('Funcionários ativos', String(pessoas.length), pessoas.filter(function (x) { return x.dias > 0; }).length + ' com atestado ou afastamento') +
      cardRes('Vale-transporte fechado', brl(totVT), 'pago: ' + brl(pagoVT)) +
      cardRes('Serviços prestados', brl(servLiq), 'em aberto: ' + brl(servSaldo)) + '</div>';
    var com = pessoas.filter(function (x) { return x.dias > 0 || x.fer.length; });
    h += '<div class="card mb"><b>Pessoas com atestado, afastamento ou férias</b>';
    h += com.length ? com.map(function (x) {
      return '<div class="row" style="justify-content:space-between;padding:6px 0;border-top:1px solid var(--line)"><span><b>' + esc(x.f.nome) + '</b> <span class="small muted">' + esc(nomeDoSetor(x.f.setorId)) + '</span></span>' +
        '<span class="small">' + (x.dias ? x.dias + ' dia(s) de atestado/afastamento' : '') + (x.dias && x.fer.length ? ' · ' : '') + (x.fer.length ? 'férias ' + x.fer.map(function (p) { return dataCurta(p.ini) + ' a ' + dataCurta(p.fim); }).join(', ') : '') + '</span></div>';
    }).join('') : '<div class="small muted">Ninguém neste mês.</div>';
    h += '</div>';
    h += '<div class="card mb"><b>Serviços prestados</b>';
    h += servs.length ? '<div class="tw" style="margin-top:6px"><table class="list"><thead><tr><th>Prestador</th><th style="text-align:right">Valor</th><th style="text-align:right">Pago</th><th style="text-align:right">Em aberto</th></tr></thead><tbody>' +
      servs.map(function (x) { return '<tr><td><b>' + esc(x.p.nome) + '</b></td><td style="text-align:right">' + brl(x.liq) + '</td><td style="text-align:right">' + brl(x.pago) + '</td><td style="text-align:right">' + brl(x.saldo) + '</td></tr>'; }).join('') + '</tbody></table></div>'
      : '<div class="small muted">Nenhum serviço lançado neste mês.</div>';
    h += '</div>';
    return h;
  }

  /* Imprime o conteúdo atual numa folha isolada (funciona no iPhone e no computador). */
  function imprimirConteudo() {
    var origem = document.getElementById('view');
    if (!origem) return window.print();
    var css = Array.prototype.map.call(document.querySelectorAll('style, link[rel="stylesheet"]'), function (n) { return n.outerHTML; }).join('');
    var html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + css +
      '<style>html,body{background:#fff!important}body{padding:16px}.btn,button,input,select{display:none!important}</style></head><body>' + origem.innerHTML + '</body></html>';
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    if (ios) {
      var w = window.open(url, '_blank');
      if (!w) location.href = url;
      return;
    }
    var f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    f.onload = function () {
      try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { window.open(url, '_blank'); }
      setTimeout(function () { f.remove(); URL.revokeObjectURL(url); }, 60000);
    };
    f.src = url;
    document.body.appendChild(f);
  }
  root.vRelatorios = vRelatorios;
  root.mdlAcao = function (el) {
    if (el.dataset.act === 'mdlImprimir') return imprimirConteudo();
  };
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t || !t.dataset || t.dataset.mdl !== 'relMes') return;
    mdl().rel.mes = t.value || mesAtual();
    render();
  });
})(window);
