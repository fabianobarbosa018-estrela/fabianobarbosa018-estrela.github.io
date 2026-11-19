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
    'Quanto falta pagar de serviços prestados?', 'Quais são as minhas pendências administrativas?', 'Relatório de novembro', 'Rascunho de comunicado', 'Ajuda'
  ];

  function ajuda() {
    return 'Posso responder sobre atestados, férias, funcionários ativos, pagamentos em aberto e cadastros incompletos. Experimente:' +
      lista(SUGESTOES.slice(0, 7).map(function (q) { return esc(q); }));
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


  /* ---------- v2: relatórios e rascunhos (só texto; nada é gravado) ---------- */
  var MESES_NOME = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  function reEsc(x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function mesDaPergunta(t) {
    var h = hoje(), ano = h.slice(0, 4);
    for (var i = 0; i < MESES_NOME.length; i++) if (new RegExp('\\b' + MESES_NOME[i] + '\\b').test(t)) return ano + '-' + String(i + 1).padStart(2, '0');
    return h.slice(0, 7);
  }
  function achaFuncionario(t) {
    var melhor = null;
    S.funcionarios.forEach(function (f) {
      var primeiro = norm(f.nome).split(' ')[0];
      if (primeiro && primeiro.length > 2 && new RegExp('\\b' + reEsc(primeiro) + '\\b').test(t)) {
        if (!melhor || primeiro.length > norm(melhor.nome).split(' ')[0].length) melhor = f;
      }
    });
    return melhor;
  }
  function achaSetor(t) {
    var melhor = null;
    (S.setores || []).forEach(function (s) {
      var n = norm(s.nome);
      if (n && new RegExp('\\b' + reEsc(n) + '\\b').test(t)) { if (!melhor || n.length > norm(melhor.nome).length) melhor = s; }
    });
    return melhor;
  }
  function diasNoMes(f, ym) {
    var aj = vtDoc(ym).ajustes || {}, dias = 0, quando = [];
    Object.keys(aj[f.id] || {}).forEach(function (d) {
      var a = aj[f.id][d];
      if (a && (a.t === 'atestado' || a.t === 'afast') && d.slice(0, 7) === ym) { dias++; }
    });
    return dias;
  }
  function feriasNoMes(f, ym) {
    var ini = ym + '-01', fim = C.addDias(C.addDias(ym + '-01', 31), -1);
    return (f.ferias || []).filter(function (p) { return p.ini <= fim && p.fim >= ini; });
  }
  function nomeMes(ym) { return MESES_NOME[+ym.slice(5, 7) - 1] + ' de ' + ym.slice(0, 4); }

  function relatorioMes(ym) {
    var ativos = S.funcionarios.filter(function (f) { return f.ativo; });
    var com = ativos.map(function (f) { return { f: f, dias: diasNoMes(f, ym), fer: feriasNoMes(f, ym) }; });
    var atest = com.filter(function (x) { return x.dias > 0; }), fer = com.filter(function (x) { return x.fer.length; });
    var txt = '<b>Relatório de ' + esc(nomeMes(ym)) + '</b>';
    txt += '<br>Funcionários ativos: <b>' + ativos.length + '</b>';
    txt += '<br>Com atestado ou afastamento: <b>' + atest.length + '</b> (' + atest.reduce(function (a, x) { return a + x.dias; }, 0) + ' dia(s))';
    if (atest.length) txt += lista(atest.map(function (x) { return esc(nomeCurto(x.f.nome)) + ' · ' + x.dias + ' dia(s)'; }));
    txt += '<br>Com férias no período: <b>' + fer.length + '</b>';
    if (fer.length) txt += lista(fer.map(function (x) { return esc(nomeCurto(x.f.nome)) + ' · ' + x.fer.map(function (p) { return C.dataBR(p.ini).slice(0, 5) + ' a ' + C.dataBR(p.fim).slice(0, 5); }).join(', '); }));
    if (pode('servicos')) {
      var linhas = servPrestadores().map(function (p) { var c = servCalc(ym, p.id); return { p: p, liq: c.liquido || 0, pago: c.pago || 0, saldo: c.saldo || 0 }; })
        .filter(function (x) { return x.liq > 0; });
      var liq = r2(linhas.reduce(function (a, x) { return a + x.liq; }, 0)), pago = r2(linhas.reduce(function (a, x) { return a + x.pago; }, 0)), saldo = r2(linhas.reduce(function (a, x) { return a + x.saldo; }, 0));
      txt += '<br>Serviços prestados: <b>R$ ' + servMoeda(liq) + '</b> · pago R$ ' + servMoeda(pago) + ' · em aberto R$ ' + servMoeda(saldo);
    }
    return txt;
  }
  function relatorioFuncionario(f, ym) {
    var txt = '<b>' + esc(f.nome) + '</b> · ' + esc(nomeMes(ym));
    txt += '<br>Setor: ' + esc(nomeSetor(f.setorId)) + ' · ' + (f.ativo ? 'ativo' : 'inativo');
    var d = diasNoMes(f, ym), fe = feriasNoMes(f, ym);
    txt += '<br>Atestado ou afastamento: <b>' + d + ' dia(s)</b>';
    txt += '<br>Férias no mês: ' + (fe.length ? fe.map(function (p) { return C.dataBR(p.ini).slice(0, 5) + ' a ' + C.dataBR(p.fim).slice(0, 5); }).join(', ') : 'nenhuma');
    if (pode('servicos') && (f.id)) {
      var pr = servPrestadores().find(function (p) { return norm(p.nome) === norm(f.nome); });
      if (pr) { var c = servCalc(ym, pr.id); txt += '<br>Serviços: R$ ' + servMoeda(c.liquido || 0) + ' · em aberto R$ ' + servMoeda(c.saldo || 0); }
    }
    return txt;
  }
  function relatorioSetor(s) {
    var membros = S.funcionarios.filter(function (f) { return f.ativo && f.setorId === s.id; });
    return '<b>Setor ' + esc(s.nome) + '</b> · ' + membros.length + ' funcionário(s) ativo(s)' + lista(membros.map(function (f) { return esc(nomeCurto(f.nome)); }));
  }

  function rascunho(t, original) {
    var f = achaFuncionario(t), h = hoje(), dataBR = C.dataBR(h);
    var texto, titulo;
    if (/vencimento|vencer|vence/.test(t)) {
      titulo = 'Aviso de vencimento';
      var lim = C.addDias(h, 10);
      var cts = (S.orcamentos || []).filter(function (c) { return c.tipoRegistro === 'contrato' && c.fim && c.fim >= h && c.fim <= lim && c.status !== 'cancelado' && c.status !== 'encerrado'; });
      if (!cts.length) return 'Nenhum contrato vence nos próximos 10 dias.';
      texto = 'AVISO DE VENCIMENTO\n\n' + cts.map(function (c) { return 'Contrato ' + (c.numero || '') + ' · ' + (c.contratadoNome || '') + ' vence em ' + C.dataBR(c.fim) + '.'; }).join('\n') + '\n\nHotel Fazenda Oásis';
    } else if (/advertenc/.test(t)) {
      titulo = 'Advertência';
      texto = 'ADVERTÊNCIA\n\nFuncionário(a): ' + (f ? f.nome : '[nome completo]') + '\nData: ' + dataBR + '\nMotivo: [descreva o motivo]\n\nDescrição dos fatos: [descreva os fatos com data e local]\n\nEsta advertência fica registrada no cadastro do funcionário. Em caso de reincidência, poderão ser aplicadas as medidas previstas em lei.\n\nHotel Fazenda Oásis\n\nCiente: ______________________ (assinatura do funcionário)';
    } else if (/comunicad/.test(t)) {
      titulo = 'Comunicado';
      texto = 'COMUNICADO\n\nHotel Fazenda Oásis, ' + dataBR + '\n\n[Escreva aqui o comunicado]\n\nAtenciosamente,\nAdministração';
    } else {
      titulo = 'Mensagem para funcionário';
      texto = 'Olá, ' + (f ? nomeCurto(f.nome) : '[nome]') + '!\n\n[Escreva aqui a mensagem]\n\nQualquer dúvida, fale com a administração. Obrigado!';
    }
    return '<b>Rascunho: ' + esc(titulo) + '</b> (copie e revise antes de usar)<textarea class="ast-txa" readonly rows="10">' + esc(texto) + '</textarea>' +
      '<div class="small muted">Rascunho apenas na tela. Nada foi gravado.</div>';
  }

  function responder(texto) {
    var t = norm(texto);
    if (!t) return null;
    if (/\bajuda\b|sugest|o que voce|comandos|o que posso/.test(t)) return ajuda();
    if (/rascunh|comunicad|advertenc|aviso|mensagem/.test(t)) return rascunho(t, texto);
    if (/relatori/.test(t)) {
      var setor = achaSetor(t), pessoa = achaFuncionario(t), ym = mesDaPergunta(t);
      if (setor && /setor/.test(t)) return relatorioSetor(setor);
      if (pessoa) return relatorioFuncionario(pessoa, ym);
      if (setor) return relatorioSetor(setor);
      return relatorioMes(ym);
    }
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
    return 'Não entendi essa pergunta. Tente uma destas:' + lista(SUGESTOES.slice(0, 7).map(function (q) { return esc(q); }));
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
