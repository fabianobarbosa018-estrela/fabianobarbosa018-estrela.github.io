/* Assistente administrativo (sem IA paga, sem serviços externos).
   Responde a perguntas por palavras-chave, usando só os dados já carregados no sistema.
   Não grava nada: é só leitura. Acesso restrito ao que o usuário pode ver. */
(function () {
  var AST = null; // conversa da sessão (não é gravada)

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function lista(itens) { return '<ul class="ast-lista">' + itens.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; }
  function hoje() { return C.hojeISO(); }

  var SUGESTOES = [
    'Quem está de atestado?', 'Quem está de férias?', 'Quantos funcionários estão ativos?',
    'Quanto falta pagar de serviços prestados?', 'Quais são as minhas pendências administrativas?', 'Ajuda'
  ];

  function ajuda() {
    return 'Posso responder sobre atestados, férias, funcionários ativos, pagamentos em aberto e cadastros incompletos. Experimente:' +
      lista(SUGESTOES.slice(0, 5).map(function (q) { return esc(q); }));
  }

  function atestadosHoje() {
    var h = hoje(), aj = vtDoc(h.slice(0, 7)).ajustes || {}, out = [];
    S.funcionarios.filter(function (f) { return f.ativo; }).forEach(function (f) {
      var a = (aj[f.id] || {})[h];
      if (a && (a.t === 'atestado' || a.t === 'afast')) out.push({ f: f, ate: a.ate });
    });
    return out;
  }
  function feriasHoje() {
    var h = hoje();
    return S.funcionarios.filter(function (f) { return f.ativo; }).map(function (f) {
      var p = (f.ferias || []).find(function (x) { return x.ini <= h && x.fim >= h; });
      return p ? { f: f, p: p } : null;
    }).filter(Boolean);
  }
  function feriasProximas() {
    var h = hoje(), ate = C.addDias(h, 30), out = [];
    S.funcionarios.filter(function (f) { return f.ativo; }).forEach(function (f) {
      (f.ferias || []).forEach(function (p) { if (p.ini > h && p.ini <= ate) out.push({ f: f, p: p }); });
    });
    return out;
  }
  function pagamentosAbertos() {
    if (!pode('servicos')) return null;
    var m = hoje().slice(0, 7);
    return servPrestadores().map(function (p) { return { p: p, saldo: r2(servCalc(m, p.id).saldo || 0) }; })
      .filter(function (x) { return x.saldo > 0.004; });
  }
  function cadastrosIncompletos() {
    return S.funcionarios.filter(function (f) { return f.ativo; }).filter(function (f) {
      var r = (S.rh || {})[f.id] || {}, pe = r.pessoais || {};
      return !(f.telefone || pe.telefone) || !pe.cpf || !pe.nascimento || !pe.endereco || !pe.mae || !pe.email || !(r.emergencia || []).length;
    });
  }

  function responder(texto) {
    var t = norm(texto);
    if (!t) return null;
    if (/\bajuda\b|sugest|o que voce|comandos|o que posso/.test(t)) return ajuda();
    if (/pendenc|incomplet|cadastr/.test(t)) {
      var inc = cadastrosIncompletos(), pag = pagamentosAbertos(), at = atestadosHoje(), partes = [];
      partes.push(inc.length ? '<b>' + inc.length + ' cadastro(s) incompleto(s)</b>' + lista(inc.slice(0, 8).map(function (f) { return esc(nomeCurto(f.nome)); })) : 'Nenhum cadastro incompleto.');
      if (pag === null) partes.push('Pagamentos: sem permissão para ver.');
      else partes.push(pag.length ? '<b>' + pag.length + ' pagamento(s) em aberto</b> neste mês.' : 'Nenhum pagamento em aberto neste mês.');
      partes.push(at.length ? '<b>' + at.length + ' pessoa(s)</b> de atestado ou afastada hoje.' : 'Ninguém de atestado hoje.');
      return partes.join('<br>');
    }
    if (/atestad/.test(t)) {
      var l = atestadosHoje();
      if (!l.length) return 'Ninguém de atestado ou afastado hoje.';
      return '<b>' + l.length + ' de atestado ou afastado hoje:</b>' + lista(l.map(function (x) {
        return esc(nomeCurto(x.f.nome)) + (x.ate ? ' · volta ' + C.dataBR(C.addDias(x.ate, 1)).slice(0, 5) : '');
      }));
    }
    if (/ferias/.test(t)) {
      var hj = feriasHoje(), pr = feriasProximas(), txt = '';
      txt += hj.length ? '<b>' + hj.length + ' de férias hoje:</b>' + lista(hj.map(function (x) { return esc(nomeCurto(x.f.nome)) + ' · até ' + C.dataBR(x.p.fim).slice(0, 5); })) : 'Ninguém de férias hoje.';
      if (pr.length) txt += '<br><b>Começam em até 30 dias:</b>' + lista(pr.map(function (x) { return esc(nomeCurto(x.f.nome)) + ' · ' + C.dataBR(x.p.ini).slice(0, 5); }));
      return txt;
    }
    if (/quant|ativ/.test(t) && /ativ|funcion/.test(t)) {
      var n = S.funcionarios.filter(function (f) { return f.ativo; }).length;
      return 'Há <b>' + n + '</b> funcionários ativos, de <b>' + S.funcionarios.length + '</b> cadastrados.';
    }
    if (/pagar|pagament|pendent|saldo|prestad/.test(t)) {
      var abertos = pagamentosAbertos();
      if (abertos === null) return 'Você não tem permissão para ver pagamentos de serviços.';
      if (!abertos.length) return 'Nenhum pagamento em aberto neste mês.';
      var total = r2(abertos.reduce(function (a, x) { return a + x.saldo; }, 0));
      return '<b>R$ ' + servMoeda(total) + '</b> em aberto neste mês:' + lista(abertos.map(function (x) {
        return esc(nomeCurto(x.p.nome)) + ' · R$ ' + servMoeda(x.saldo);
      }));
    }
    return 'Não entendi essa pergunta. Tente uma destas:' + lista(SUGESTOES.slice(0, 5).map(function (q) { return esc(q); }));
  }

  function conversa() {
    if (!AST) AST = { msgs: [] };
    if (!AST.msgs.length) AST.msgs.push({ de: 'bot', html: ajuda() });
    return AST.msgs.map(function (m) {
      return '<div class="ast-msg ' + (m.de === 'eu' ? 'eu' : 'bot') + '">' + (m.de === 'eu' ? esc(m.texto) : m.html) + '</div>';
    }).join('');
  }

  window.vAssistente = function () {
    return '<div class="orc-topo"><div><h2 style="margin:0">Assistente</h2><div class="small muted">Consulta dos dados do sistema. Só lê, não altera nada.</div></div>' +
      '<button class="btn sm" data-act="astLimpar">Nova conversa</button></div>' +
      '<div class="ast-chat" id="astChat">' + conversa() + '</div>' +
      '<div class="ast-sug">' + SUGESTOES.map(function (q) { return '<button class="ast-chip" data-act="astSug" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<div class="ast-entrada"><input id="astTxt" type="text" placeholder="Digite uma pergunta" autocomplete="off"><button class="btn pri" data-act="astEnviar">Enviar</button></div>';
  };

  function perguntar(q) {
    if (!AST) AST = { msgs: [] };
    AST.msgs.push({ de: 'eu', texto: q });
    var r = responder(q);
    AST.msgs.push({ de: 'bot', html: r || ajuda() });
    render();
    setTimeout(function () { var c = document.getElementById('astChat'); if (c) c.scrollTop = c.scrollHeight; }, 0);
  }

  window.astAcao = function (el) {
    var act = el.dataset.act;
    if (act === 'astLimpar') { AST = { msgs: [] }; render(); return; }
    if (act === 'astSug') return perguntar(el.dataset.q || '');
    if (act === 'astEnviar') {
      var i = document.getElementById('astTxt'), q = i ? i.value.trim() : '';
      if (!q) return;
      return perguntar(q);
    }
  };

  (function estilo() {
    if (document.getElementById('astCss')) return;
    var st = document.createElement('style'); st.id = 'astCss';
    st.textContent = '.ast-chat{display:flex;flex-direction:column;gap:10px;max-height:58vh;overflow:auto;padding:12px 2px;margin-top:10px}' +
      '.ast-msg{max-width:92%;padding:10px 12px;border-radius:14px;line-height:1.45;font-size:15px}' +
      '.ast-msg.bot{background:#fff;border:1px solid var(--line);align-self:flex-start}' +
      '.ast-msg.eu{background:#0f4f5c;color:#fff;align-self:flex-end;white-space:pre-wrap}' +
      '.ast-lista{margin:6px 0 0;padding-left:18px}.ast-lista li{margin:2px 0}' +
      '.ast-sug{display:flex;gap:6px;overflow-x:auto;padding:8px 0;margin-top:6px}' +
      '.ast-chip{flex:none;border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer}' +
      '.ast-entrada{display:flex;gap:8px;margin-top:6px}.ast-entrada input{flex:1;min-width:0;padding:10px 12px;border:1px solid var(--line);border-radius:10px;font-size:16px}';
    document.head.appendChild(st);
  })();
})();
