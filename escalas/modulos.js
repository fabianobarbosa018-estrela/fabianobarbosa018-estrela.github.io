/* =====================================================================
   MÓDULOS ADMINISTRATIVOS (só administrador): Despesas, Relatórios, Férias e Pagamentos.
   - Lê os dados já carregados em S (funcionários, vt, serviços, prestadores).
   - Grava somente na coleção nova 'despesas'. Nunca apaga: cancelar fica no histórico.
   - Não altera nenhum cálculo existente (VT, serviços, escalas).
   ===================================================================== */
(function (root) {
  'use strict';
  var CATS = ['Manutenção', 'Compras', 'Combustível', 'Utilidades (água, luz, gás)', 'Pessoal', 'Impostos e taxas', 'Outros'];
  var FORMAS = ['Pix', 'Dinheiro', 'Cartão', 'Boleto', 'Transferência'];
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var AFAST = ['atestado', 'suspensao', 'afast'];

  function mdl() { return (UI.mdl = UI.mdl || { dsp: null, rel: null, fer: null, pag: null }); }
  function mesAtual() { return C.hojeISO().slice(0, 7); }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function brl(v) { return 'R$ ' + servMoeda(v); }
  function nomeMes(ym) { return MESES[+ym.slice(5, 7) - 1] + ' de ' + ym.slice(0, 4); }
  function dataBR(iso) { return iso ? C.dataBR(iso) : '—'; }
  function dataCurta(iso) { return iso ? C.dataBR(iso).slice(0, 5) : '—'; }
  function diasEntre(ini, fim) { return Math.round((new Date(fim + 'T12:00:00Z') - new Date(ini + 'T12:00:00Z')) / 86400000) + 1; }
  function nomeDoSetor(id) { return id ? nomeSetor(id) : '—'; }
  function ativos() { return S.funcionarios.filter(function (f) { return f.ativo; }).slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); }); }
  function despesas() { return S.despesas || []; }
  function parseValor(txt) {
    var s = String(txt == null ? '' : txt).trim().replace(/\s/g, '').replace(/R\$/i, '');
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }
  function selectOpts(lista, atual, vazio) {
    return (vazio !== undefined ? '<option value="">' + vazio + '</option>' : '') +
      lista.map(function (x) { var v = x.v !== undefined ? x.v : x, t = x.t !== undefined ? x.t : x; return '<option value="' + esc(v) + '" ' + (String(v) === String(atual) ? 'selected' : '') + '>' + esc(t) + '</option>'; }).join('');
  }
  function badgeSit(s) {
    if (s === 'paga') return '<span class="badge b-ok">Paga</span>';
    if (s === 'cancelada') return '<span class="badge" style="background:#e5e7eb;color:#374151">Cancelada</span>';
    return '<span class="badge" style="background:#fef3c7;color:#92400e">Pendente</span>';
  }
  function cardRes(titulo, valor, sub) {
    return '<div class="card" style="flex:1 1 180px;min-width:150px"><div class="small muted">' + esc(titulo) + '</div><div style="font-size:20px;font-weight:700;margin-top:4px">' + valor + '</div>' + (sub ? '<div class="small muted" style="margin-top:2px">' + esc(sub) + '</div>' : '') + '</div>';
  }

  /* ======================= DESPESAS ======================= */
  function despesasFiltradas() {
    var f = mdl().dsp;
    return despesas().filter(function (d) { return d.data && d.data.slice(0, 7) === f.mes; })
      .filter(function (d) { return !f.setor || d.setorId === f.setor; })
      .filter(function (d) { return !f.cat || d.categoria === f.cat; })
      .filter(function (d) { return !f.sit || d.situacao === f.sit; })
      .filter(function (d) { return !f.busca || norm(d.descricao).indexOf(norm(f.busca)) >= 0; })
      .sort(function (a, b) { return a.data < b.data ? 1 : a.data > b.data ? -1 : 0; });
  }
  function vDespesas() {
    var m = mdl(); m.dsp = m.dsp || { mes: mesAtual(), setor: '', cat: '', sit: '', busca: '' };
    var f = m.dsp, lista = despesasFiltradas();
    var ativas = lista.filter(function (d) { return d.situacao !== 'cancelada'; });
    var total = ativas.reduce(function (a, d) { return a + (+d.valor || 0); }, 0);
    var pend = ativas.filter(function (d) { return d.situacao === 'pendente'; }).reduce(function (a, d) { return a + (+d.valor || 0); }, 0);
    var porCat = {}; ativas.forEach(function (d) { var k = d.categoria || 'Sem categoria'; porCat[k] = (porCat[k] || 0) + (+d.valor || 0); });
    var cats = Object.keys(porCat).sort(function (a, b) { return porCat[b] - porCat[a]; });
    var h = '<div class="row mb"><div><h1>Despesas</h1><p class="sub" style="margin:0">Lançamentos do hotel. Nada é apagado: cancelar fica registrado no histórico.</p></div>' +
      '<div><button class="btn pri edit-only" data-act="mdlDspNova">' + ic('plus') + ' Nova despesa</button></div></div>';
    h += '<div class="card mb"><div class="row" style="flex-wrap:wrap;gap:8px">' +
      '<input type="month" data-mdl="dspMes" value="' + esc(f.mes) + '" style="min-width:150px">' +
      '<select data-mdl="dspSetor"><option value="">Todos os setores</option>' + setoresOrd().map(function (s) { return '<option value="' + s.id + '" ' + (f.setor === s.id ? 'selected' : '') + '>' + esc(s.nome) + '</option>'; }).join('') + '</select>' +
      '<select data-mdl="dspCat"><option value="">Todas as categorias</option>' + selectOpts(CATS, f.cat) + '</select>' +
      '<select data-mdl="dspSit"><option value="">Todas as situações</option>' + selectOpts([{ v: 'paga', t: 'Pagas' }, { v: 'pendente', t: 'Pendentes' }, { v: 'cancelada', t: 'Canceladas' }], f.sit) + '</select>' +
      '<input type="search" id="mdl_dspBusca" data-mdl="dspBusca" placeholder="Buscar descrição…" value="' + esc(f.busca) + '" style="flex:1;min-width:160px">' +
      '</div></div>';
    h += '<div class="row mb" style="flex-wrap:wrap;gap:10px">' +
      cardRes('Total do mês', brl(total), nomeMes(f.mes)) +
      cardRes('Pendentes', brl(pend), ativas.filter(function (d) { return d.situacao === 'pendente'; }).length + ' lançamento(s)') +
      cardRes('Lançamentos', String(lista.length), 'com os filtros atuais') + '</div>';
    if (cats.length) h += '<div class="card mb"><b>Por categoria</b>' + cats.map(function (k) { return '<div class="row" style="justify-content:space-between;padding:4px 0;border-top:1px solid var(--line)"><span>' + esc(k) + '</span><b>' + brl(porCat[k]) + '</b></div>'; }).join('') + '</div>';
    if (!lista.length) return h + '<div class="card empty"><b>Nenhuma despesa neste período</b><div class="small muted">Use "Nova despesa" para lançar.</div></div>';
    h += '<div class="tw"><table class="list"><thead><tr><th>Data</th><th>Descrição</th><th class="hide-m">Categoria</th><th class="hide-m">Setor</th><th class="hide-m">Forma</th><th>Situação</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody>' +
      lista.map(function (d) {
        var canc = d.situacao === 'cancelada';
        return '<tr style="' + (canc ? 'opacity:.6' : '') + '"><td style="white-space:nowrap">' + dataCurta(d.data) + '</td>' +
          '<td><b style="' + (canc ? 'text-decoration:line-through' : '') + '">' + esc(d.descricao) + '</b>' + (d.obs ? '<div class="small muted">' + esc(d.obs) + '</div>' : '') + '</td>' +
          '<td class="hide-m">' + esc(d.categoria || '—') + '</td><td class="hide-m">' + esc(nomeDoSetor(d.setorId)) + '</td><td class="hide-m">' + esc(d.forma || '—') + '</td>' +
          '<td>' + badgeSit(d.situacao) + '</td><td style="text-align:right;white-space:nowrap"><b>' + brl(d.valor) + '</b></td>' +
          '<td><button class="btn sm" data-act="mdlDspEditar" data-id="' + d.id + '">Ver / editar</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    return h;
  }
  function dspForm(id) {
    var d = id ? despesas().find(function (x) { return x.id === id; }) : null;
    if (id && !d) return toast('Lançamento não encontrado.');
    var v = d || { data: C.hojeISO(), descricao: '', valor: '', setorId: '', categoria: '', forma: 'Pix', situacao: 'paga', obs: '' };
    var hist = (d && d.historico) || [];
    var html = '<h3 style="margin:0 0 10px">' + (d ? 'Despesa' : 'Nova despesa') + '</h3>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px">' +
      '<div class="fld" style="flex:1 1 150px"><label class="f">Data</label><input type="date" id="dspData" value="' + esc(v.data) + '"></div>' +
      '<div class="fld" style="flex:1 1 150px"><label class="f">Valor (R$)</label><input type="text" inputmode="decimal" id="dspValor" value="' + (v.valor === '' ? '' : esc(String(v.valor).replace('.', ','))) + '" placeholder="0,00"></div></div>' +
      '<div class="fld"><label class="f">Descrição</label><input type="text" id="dspDesc" value="' + esc(v.descricao) + '" placeholder="Ex.: conta de energia de novembro"></div>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px">' +
      '<div class="fld" style="flex:1 1 150px"><label class="f">Categoria</label><select id="dspCat">' + selectOpts(CATS, v.categoria, '—') + '</select></div>' +
      '<div class="fld" style="flex:1 1 150px"><label class="f">Setor</label><select id="dspSetor"><option value="">—</option>' + setoresOrd().map(function (s) { return '<option value="' + s.id + '" ' + (v.setorId === s.id ? 'selected' : '') + '>' + esc(s.nome) + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="row" style="flex-wrap:wrap;gap:8px">' +
      '<div class="fld" style="flex:1 1 150px"><label class="f">Forma de pagamento</label><select id="dspForma">' + selectOpts(FORMAS, v.forma, '—') + '</select></div>' +
      '<div class="fld" style="flex:1 1 150px"><label class="f">Situação</label><select id="dspSit">' + selectOpts([{ v: 'paga', t: 'Paga' }, { v: 'pendente', t: 'Pendente' }, { v: 'cancelada', t: 'Cancelada' }], v.situacao) + '</select></div></div>' +
      '<div class="fld"><label class="f">Observação</label><input type="text" id="dspObs" value="' + esc(v.obs || '') + '"></div>';
    if (hist.length) html += '<details class="mt"><summary style="cursor:pointer;font-weight:700">Histórico deste lançamento (' + hist.length + ')</summary>' +
      hist.slice().reverse().map(function (x) { return '<div class="small" style="padding:4px 0;border-top:1px solid var(--line)">' + esc(dataBR(String(x.em).slice(0, 10))) + ' · ' + esc(x.por || '') + ' — ' + esc(x.texto) + '</div>'; }).join('') + '</details>';
    html += '<div class="row mt" style="justify-content:flex-end;gap:8px;flex-wrap:wrap">' +
      (d && d.situacao !== 'cancelada' ? '<button class="btn" data-act="mdlDspCancelar" data-id="' + d.id + '">Cancelar lançamento</button>' : '') +
      '<button class="btn" data-act="mdlFechar">Fechar</button>' +
      '<button class="btn pri" data-act="mdlDspSalvar" data-id="' + (id || '') + '">Salvar</button></div>';
    abrirModal(html);
  }
  function dspLer() {
    var valor = parseValor(document.getElementById('dspValor').value);
    return {
      data: document.getElementById('dspData').value,
      descricao: document.getElementById('dspDesc').value.trim(),
      valor: valor,
      setorId: document.getElementById('dspSetor').value || '',
      categoria: document.getElementById('dspCat').value || '',
      forma: document.getElementById('dspForma').value || '',
      situacao: document.getElementById('dspSit').value || 'paga',
      obs: document.getElementById('dspObs').value.trim()
    };
  }
  var ROTULOS = { data: 'data', descricao: 'descrição', valor: 'valor', setorId: 'setor', categoria: 'categoria', forma: 'forma de pagamento', situacao: 'situação', obs: 'observação' };
  function mudancas(antes, depois) {
    return Object.keys(ROTULOS).filter(function (k) { return String((antes || {})[k] == null ? '' : antes[k]) !== String(depois[k] == null ? '' : depois[k]); });
  }
  async function dspSalvar(el) {
    var dados;
    try { dados = dspLer(); } catch (e) { return toast('Confira os campos da despesa.'); }
    if (!dados.data) return toast('Informe a data.');
    if (!dados.descricao) return toast('Informe a descrição.');
    if (!(dados.valor > 0)) return toast('Informe um valor maior que zero.');
    var id = el.dataset.id || uid('desp');
    var antes = despesas().find(function (x) { return x.id === id; });
    var hist = ((antes && antes.historico) || []).slice();
    var agora = new Date().toISOString(), quem = S.usuarioNome || 'Administrador';
    if (!antes) hist.push({ em: agora, por: quem, texto: 'lançada' });
    else { var mud = mudancas(antes, dados); if (mud.length) hist.push({ em: agora, por: quem, texto: 'alterou ' + mud.map(function (k) { return ROTULOS[k]; }).join(', ') }); }
    dados.historico = hist;
    dados.criadoEm = antes ? (antes.criadoEm || agora) : agora;
    dados.atualizadoEm = agora;
    try { await Store.set('despesas', id, dados); fecharModal(el.closest('.mbg')); toast('Despesa salva.'); }
    catch (e) { /* o Store já avisa o motivo */ }
  }
  async function dspCancelar(el) {
    var d = despesas().find(function (x) { return x.id === el.dataset.id; });
    if (!d) return;
    if (!window.confirm('Cancelar esta despesa? Ela continua no histórico, mas deixa de contar nos totais.')) return;
    var agora = new Date().toISOString();
    var dados = Object.assign({}, d, { situacao: 'cancelada', atualizadoEm: agora, historico: (d.historico || []).concat([{ em: agora, por: S.usuarioNome || 'Administrador', texto: 'cancelada' }]) });
    delete dados.id;
    try { await Store.set('despesas', d.id, dados); fecharModal(el.closest('.mbg')); toast('Despesa cancelada.'); } catch (e) { }
  }

  /* ======================= RELATÓRIOS ======================= */
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
    var desp = despesas().filter(function (d) { return d.data && d.data.slice(0, 7) === ym && d.situacao !== 'cancelada'; });
    var despTot = desp.reduce(function (a, d) { return a + (+d.valor || 0); }, 0);
    var h = '<div class="row mb" style="flex-wrap:wrap;gap:8px;justify-content:space-between"><div><h1>Relatórios</h1><p class="sub" style="margin:0">Resumo do mês: ' + esc(nomeMes(ym)) + '</p></div>' +
      '<div class="row" style="gap:8px"><input type="month" data-mdl="relMes" value="' + esc(ym) + '">' +
      '<button class="btn" data-act="mdlImprimir">' + ic('print') + ' Imprimir</button></div></div>';
    h += '<div class="row mb" style="flex-wrap:wrap;gap:10px">' +
      cardRes('Funcionários ativos', String(pessoas.length), pessoas.filter(function (x) { return x.dias > 0; }).length + ' com atestado ou afastamento') +
      cardRes('Vale-transporte fechado', brl(totVT), 'pago: ' + brl(pagoVT)) +
      cardRes('Serviços prestados', brl(servLiq), 'em aberto: ' + brl(servSaldo)) +
      cardRes('Despesas do mês', brl(despTot), desp.length + ' lançamento(s)') + '</div>';
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
    var cats = {}; desp.forEach(function (d) { var k = d.categoria || 'Sem categoria'; cats[k] = (cats[k] || 0) + (+d.valor || 0); });
    h += '<div class="card mb"><b>Despesas por categoria</b>' + (Object.keys(cats).length ? Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; }).map(function (k) { return '<div class="row" style="justify-content:space-between;padding:4px 0;border-top:1px solid var(--line)"><span>' + esc(k) + '</span><b>' + brl(cats[k]) + '</b></div>'; }).join('') : '<div class="small muted">Nenhuma despesa neste mês.</div>') + '</div>';
    return h;
  }

  /* ======================= FÉRIAS ======================= */
  function periodosDeFerias() {
    var hoje = C.hojeISO(), out = [];
    S.funcionarios.filter(function (f) { return f.ativo; }).forEach(function (f) {
      (f.ferias || []).forEach(function (p) {
        var st = p.fim < hoje ? 'concluida' : p.ini > hoje ? 'programada' : 'andamento';
        out.push({ f: f, p: p, st: st, dias: diasEntre(p.ini, p.fim) });
      });
    });
    return out.sort(function (a, b) { return a.p.ini < b.p.ini ? -1 : a.p.ini > b.p.ini ? 1 : 0; });
  }
  function vFerias() {
    var m = mdl(); m.fer = m.fer || { sit: '', setor: '', busca: '' };
    var f = m.fer, lista = periodosDeFerias()
      .filter(function (x) { return !f.sit || x.st === f.sit; })
      .filter(function (x) { return !f.setor || x.f.setorId === f.setor; })
      .filter(function (x) { return !f.busca || norm(x.f.nome).indexOf(norm(f.busca)) >= 0; });
    var andamento = periodosDeFerias().filter(function (x) { return x.st === 'andamento'; }).length;
    var prog = periodosDeFerias().filter(function (x) { return x.st === 'programada'; }).length;
    var h = '<div class="row mb"><div><h1>Férias</h1><p class="sub" style="margin:0">Períodos de férias de todos os funcionários ativos. Para lançar ou alterar, abra a ficha.</p></div></div>';
    h += '<div class="row mb" style="flex-wrap:wrap;gap:10px">' + cardRes('Em andamento', String(andamento), 'agora') + cardRes('Programadas', String(prog), 'próximas') + '</div>';
    h += '<div class="card mb"><div class="row" style="flex-wrap:wrap;gap:8px">' +
      '<select data-mdl="ferSit">' + selectOpts([{ v: 'andamento', t: 'Em andamento' }, { v: 'programada', t: 'Programadas' }, { v: 'concluida', t: 'Concluídas' }], f.sit, 'Todas as situações') + '</select>' +
      '<select data-mdl="ferSetor"><option value="">Todos os setores</option>' + setoresOrd().map(function (s) { return '<option value="' + s.id + '" ' + (f.setor === s.id ? 'selected' : '') + '>' + esc(s.nome) + '</option>'; }).join('') + '</select>' +
      '<input type="search" id="mdl_ferBusca" data-mdl="ferBusca" placeholder="Buscar funcionário…" value="' + esc(f.busca) + '" style="flex:1;min-width:160px">' +
      '</div></div>';
    if (!lista.length) return h + '<div class="card empty"><b>Nenhum período de férias encontrado</b></div>';
    var rot = { andamento: '<span class="badge b-ok">Em andamento</span>', programada: '<span class="badge" style="background:#dbeafe;color:#1e40af">Programada</span>', concluida: '<span class="badge" style="background:#e5e7eb;color:#374151">Concluída</span>' };
    h += '<div class="tw"><table class="list"><thead><tr><th>Funcionário</th><th class="hide-m">Setor</th><th>Início</th><th>Fim</th><th class="hide-m">Dias</th><th>Situação</th><th></th></tr></thead><tbody>' +
      lista.map(function (x) {
        return '<tr><td><b>' + esc(x.f.nome) + '</b></td><td class="hide-m">' + esc(nomeDoSetor(x.f.setorId)) + '</td><td style="white-space:nowrap">' + dataBR(x.p.ini) + '</td><td style="white-space:nowrap">' + dataBR(x.p.fim) + '</td><td class="hide-m">' + x.dias + '</td><td>' + rot[x.st] + '</td>' +
          '<td><button class="btn sm" data-act="mdlIrFicha" data-id="' + x.f.id + '">Abrir ficha</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    return h;
  }

  /* ======================= PAGAMENTOS ======================= */
  function vPagamentos() {
    var m = mdl(); m.pag = m.pag || { mes: mesAtual() };
    var ym = m.pag.mes, vt = (S.vt || {})[ym] || {}, fech = vt.fechamentos || {}, pags = vt.pagamentos || {};
    var linhasVT = [];
    ['q1', 'q2'].forEach(function (q) {
      if (!fech[q]) return;
      ativos().forEach(function (f) {
        var fa = (fech[q].porFunc || {})[f.id], pg = (pags[f.id] || {})[q];
        if (!fa && !pg) return;
        var fechado = fa ? +fa.valor || 0 : 0, pago = pg ? +pg.valor || 0 : null;
        var dif = pg && Math.abs(fechado - pago) > 0.005;
        linhasVT.push({ f: f, q: q, fechado: fechado, pago: pago, pg: pg, dif: dif, dias: fa ? fa.dias : null });
      });
    });
    var totFech = linhasVT.reduce(function (a, x) { return a + x.fechado; }, 0);
    var totPago = linhasVT.reduce(function (a, x) { return a + (x.pago || 0); }, 0);
    var difs = linhasVT.filter(function (x) { return x.dif; }).length;
    var servs = servPrestadores().map(function (p) { var c = servCalc(ym, p.id) || {}; return { p: p, liq: +c.liquido || 0, pago: +c.pago || 0, saldo: +c.saldo || 0 }; }).filter(function (x) { return x.liq > 0 || x.pago > 0; });
    var h = '<div class="row mb" style="flex-wrap:wrap;gap:8px;justify-content:space-between"><div><h1>Pagamentos</h1><p class="sub" style="margin:0">Visão geral dos pagamentos de ' + esc(nomeMes(ym)) + '. Só consulta: os lançamentos continuam nas telas de Vale-transporte e Serviços.</p></div>' +
      '<div><input type="month" data-mdl="pagMes" value="' + esc(ym) + '"></div></div>';
    h += '<div class="row mb" style="flex-wrap:wrap;gap:10px">' + cardRes('Vale-transporte fechado', brl(totFech), 'pago: ' + brl(totPago)) +
      cardRes('Diferenças para verificar', String(difs), difs ? 'valor pago diferente do fechado' : 'nenhuma') +
      cardRes('Serviços em aberto', brl(servs.reduce(function (a, x) { return a + x.saldo; }, 0)), servs.filter(function (x) { return x.saldo > 0.005; }).length + ' prestador(es)') + '</div>';
    h += '<div class="card mb"><b>Vale-transporte</b>';
    h += linhasVT.length ? '<div class="tw" style="margin-top:6px"><table class="list"><thead><tr><th>Funcionário</th><th>Quinzena</th><th class="hide-m">Dias</th><th style="text-align:right">Fechado</th><th style="text-align:right">Pago</th><th>Data</th><th class="hide-m">Forma</th><th>Situação</th></tr></thead><tbody>' +
      linhasVT.map(function (x) {
        var sit = x.dif ? '<span class="badge" style="background:#fee2e2;color:#991b1b">Verificar</span>' : x.pg ? '<span class="badge b-ok">Pago</span>' : '<span class="badge" style="background:#fef3c7;color:#92400e">Pendente</span>';
        return '<tr style="' + (x.dif ? 'background:#fef2f2' : '') + '"><td><b>' + esc(x.f.nome) + '</b></td><td>' + (x.q === 'q1' ? '1ª' : '2ª') + '</td><td class="hide-m">' + (x.dias == null ? '—' : x.dias) + '</td>' +
          '<td style="text-align:right">' + brl(x.fechado) + '</td><td style="text-align:right">' + (x.pago == null ? '—' : brl(x.pago)) + '</td>' +
          '<td style="white-space:nowrap">' + (x.pg && x.pg.data ? dataBR(x.pg.data) : '—') + '</td><td class="hide-m">' + esc((x.pg && x.pg.forma) || '—') + '</td><td>' + sit + '</td></tr>';
      }).join('') + '</tbody></table></div>'
      : '<div class="small muted">Nenhum fechamento de vale-transporte neste mês.</div>';
    h += '</div>';
    h += '<div class="card mb"><b>Serviços prestados</b>';
    h += servs.length ? '<div class="tw" style="margin-top:6px"><table class="list"><thead><tr><th>Prestador</th><th style="text-align:right">Valor</th><th style="text-align:right">Pago</th><th style="text-align:right">Em aberto</th><th>Situação</th></tr></thead><tbody>' +
      servs.map(function (x) { var ab = x.saldo > 0.005; return '<tr><td><b>' + esc(x.p.nome) + '</b></td><td style="text-align:right">' + brl(x.liq) + '</td><td style="text-align:right">' + brl(x.pago) + '</td><td style="text-align:right">' + brl(x.saldo) + '</td><td>' + (ab ? '<span class="badge" style="background:#fef3c7;color:#92400e">Em aberto</span>' : '<span class="badge b-ok">Quitado</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>'
      : '<div class="small muted">Nenhum serviço lançado neste mês.</div>';
    h += '</div>';
    return h;
  }

  /* ======================= AÇÕES E EVENTOS ======================= */
  root.vDespesas = vDespesas;
  root.vRelatorios = vRelatorios;
  root.vFerias = vFerias;
  root.vPagamentos = vPagamentos;
  root.mdlAcao = function (el, ev) {
    var act = el.dataset.act;
    if (act === 'mdlDspNova') return dspForm(null);
    if (act === 'mdlDspEditar') return dspForm(el.dataset.id);
    if (act === 'mdlDspSalvar') return dspSalvar(el);
    if (act === 'mdlDspCancelar') return dspCancelar(el);
    if (act === 'mdlFechar') return fecharModal(el.closest('.mbg'));
    if (act === 'mdlImprimir') return window.print();
    if (act === 'mdlIrFicha') {
      var f = S.funcionarios.find(function (x) { return x.id === el.dataset.id; });
      if (!f) return toast('Funcionário não encontrado.');
      UI.rota = 'funcionarios';
      try { history.replaceState(null, '', '#funcionarios'); } catch (e) { }
      if (typeof root.rhAcao === 'function') root.rhAcao({ dataset: { act: 'rhFicha', id: f.id } }, { preventDefault: function () { } });
      return render();
    }
  };
  document.addEventListener('change', function (ev) {
    var t = ev.target, k = t && t.dataset && t.dataset.mdl; if (!k) return;
    var m = mdl();
    if (k === 'dspMes') m.dsp.mes = t.value || mesAtual();
    else if (k === 'dspSetor') m.dsp.setor = t.value;
    else if (k === 'dspCat') m.dsp.cat = t.value;
    else if (k === 'dspSit') m.dsp.sit = t.value;
    else if (k === 'relMes') m.rel.mes = t.value || mesAtual();
    else if (k === 'ferSit') m.fer.sit = t.value;
    else if (k === 'ferSetor') m.fer.setor = t.value;
    else if (k === 'pagMes') m.pag.mes = t.value || mesAtual();
    else return;
    render();
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target, k = t && t.dataset && t.dataset.mdl; if (!k) return;
    var m = mdl();
    if (k === 'dspBusca') m.dsp.busca = t.value;
    else if (k === 'ferBusca') m.fer.busca = t.value;
    else return;
    UI._foco = 'mdl_' + k;
    render();
  });
})(window);
