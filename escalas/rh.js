/* =====================================================================
   RH — aba Funcionários (só administrador)
   Usa o MESMO cadastro de funcionários (escala, VT, painel e atestados continuam lendo dele).
   Dados pessoais, remuneração, documentos, contatos de emergência e ocorrências ficam na coleção
   "rh" (uma ficha por funcionário), que o servidor só entrega ao administrador. Documentos
   anexados ficam em "rh_docs". Nada é apagado: desligamento = arquivamento com data e motivo.
   ===================================================================== */
(function (root) {
  'use strict';
  const br = iso => iso ? C.dataBR(iso) : '—';
  const hoje = () => C.hojeISO();
  const st = () => (UI.rh = UI.rh || { filtro: '', busca: '', setor: '', ficha: null, aba: 'dados' });
  const rhDe = id => (S.rh && S.rh[id]) || {};
  const docsDe = fid => Object.keys(S.rh_docs || {}).filter(k => k.indexOf(fid + '__') === 0).map(k => Object.assign({ id: k }, S.rh_docs[k])).sort((a, b) => (b.em || '').localeCompare(a.em || ''));
  const quem = () => (typeof ehAdmin === 'function' && ehAdmin()) ? 'Administrador' : (S.usuarioNome || '');
  const agora = () => new Date().toISOString();
  const soLer = () => S.somenteLeitura || !(ehAdmin() || pode('funcionarios'));
  const VINCULOS = [['clt', 'CLT (carteira assinada)'], ['prestador', 'Prestador de serviço'], ['diarista', 'Diarista'], ['temporario', 'Temporário'], ['estagio', 'Estágio'], ['outro', 'Outro']];
  const TIPOS_DESL = [['pedido', 'Pedido de demissão'], ['dispensa', 'Dispensa'], ['fim_contrato', 'Fim de contrato'], ['justa_causa', 'Justa causa'], ['outro', 'Outro']];
  const OCORR = { advertencia: ['Advertência', 'b-warn'], suspensao: ['Suspensão', 'b-err'], elogio: ['Elogio', 'b-ok'], anotacao: ['Anotação', 'b-blue'] };

  // nome padronizado: espaços únicos e iniciais maiúsculas (de/da/do/dos/das/e em minúsculo)
  function padronizarNome(n) {
    return String(n || '').trim().replace(/\s+/g, ' ').toLowerCase().split(' ').map((p, i) => i > 0 && /^(de|da|do|das|dos|e)$/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }
  const cpfOk = c => { c = String(c || '').replace(/\D/g, ''); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false; let s = 0, r; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i); r = (s * 10) % 11 % 10; if (r !== +c[9]) return false; s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i); r = (s * 10) % 11 % 10; return r === +c[10]; };
  const mascCpf = v => String(v || '').replace(/\D/g, '').slice(0, 11).replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');

  /* ---------- situação de cada funcionário hoje ---------- */
  function situacao(f, dia) {
    dia = dia || hoje();
    if (!f.ativo) return 'desligado';
    if (C.emFerias(f, dia)) return 'ferias';
    const au = root.ausenciaEm && root.ausenciaEm(f.id, dia);
    if (au && au.t === 'suspensao') return 'suspenso';
    if (au && (au.t === 'atestado' || au.t === 'afast')) return 'afastado';
    return 'ativo';
  }
  const SIT = { ativo: ['Ativo', 'b-ok'], afastado: ['Afastado', 'b-warn'], ferias: ['De férias', 'b-blue'], suspenso: ['Suspenso', 'b-err'], desligado: ['Desligado', 'b-off'] };
  function badge(f) {
    const s = situacao(f), au = root.ausenciaEm && root.ausenciaEm(f.id, hoje());
    let txt = (s === 'afastado' || s === 'suspenso') && au && au.nome ? au.nome : SIT[s][0];
    if ((s === 'afastado' || s === 'suspenso') && au && au.ate) txt += ' até ' + br(au.ate).slice(0, 5);
    if (s === 'ferias') { const p = (f.ferias || []).find(x => x.ini <= hoje() && x.fim >= hoje()); if (p) txt += ' até ' + br(p.fim).slice(0, 5); }
    return `<span class="badge ${SIT[s][1]}">${esc(txt)}</span>`;
  }

  /* ---------- tela principal ---------- */
  /* Próximos aniversários (a partir da data de nascimento da ficha, só funcionários ativos) */
  function aniversarios(dias) {
    const hj = new Date(), base = new Date(hj.getFullYear(), hj.getMonth(), hj.getDate());
    return S.funcionarios.filter(f => f.ativo).map(f => {
      const n = (rhDe(f.id).pessoais || {}).nascimento; if (!n || !/^\d{4}-\d{2}-\d{2}$/.test(n)) return null;
      const [y, m, d] = n.split('-').map(Number);
      let prox = new Date(base.getFullYear(), m - 1, d); if (prox < base) prox = new Date(base.getFullYear() + 1, m - 1, d);
      return { f, prox, falta: Math.round((prox - base) / 86400000), idade: prox.getFullYear() - y };
    }).filter(x => x && x.falta <= dias).sort((a, b) => a.falta - b.falta);
  }
  function anivHtml() {
    const lista = aniversarios(30);
    if (!lista.length) return '';
    const quando = x => x.falta === 0 ? '<b>hoje</b>' : x.falta === 1 ? 'amanhã' : 'em ' + x.falta + ' dias';
    return `<div class="card mb rh-aniv"><h3 style="margin:0 0 8px">Aniversários nos próximos 30 dias</h3>` + lista.map(x =>
      `<div class="rh-aniv-linha" data-act="rhFicha" data-id="${x.f.id}" style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);cursor:pointer">
        <span><b>${esc(x.f.nome)}</b> <span class="small muted">· ${esc(nomeSetor(x.f.setorId))}</span></span>
        <span class="small">${br(x.prox.toISOString().slice(0, 10))} · ${quando(x)} · ${x.idade} anos</span></div>`).join('') + '</div>';
  }
  /* Dados pessoais que ainda faltam na ficha (só funcionários ativos) */
  function faltantes(f) {
    const rec = rhDe(f.id), p = rec.pessoais || {}, pr = rec.profissionais || {}, falta = [];
    if (!(f.telefone || p.telefone)) falta.push('telefone');
    if (!p.cpf) falta.push('CPF');
    if (!p.nascimento) falta.push('nascimento');
    if (!p.endereco) falta.push('endereço');
    if (!p.mae) falta.push('nome da mãe');
    if (!p.email) falta.push('e-mail');
    if (!(rec.emergencia || []).length) falta.push('contato de emergência');
    return falta;
  }
  /* Bloco extra nunca pode derrubar a lista de funcionários */
  function seguro(fn) { try { return fn() || ''; } catch (e) { console.error('[RH]', e); return ''; } }
  function pendenciasHtml() {
    const lista = S.funcionarios.filter(f => f.ativo).map(f => ({ f, falta: faltantes(f) })).filter(x => x.falta.length)
      .sort((a, b) => b.falta.length - a.falta.length || String(a.f.nome || '').localeCompare(String(b.f.nome || ''), 'pt-BR'));
    if (!lista.length) return '';
    return `<div class="card mb rh-pend"><h3 style="margin:0 0 2px">Cadastro incompleto (${lista.length})</h3>
      <p class="small muted" style="margin:0 0 8px">Quem ainda falta algum dado pessoal. Toque na pessoa para abrir a ficha e mandar o link.</p>` + lista.map(x =>
      `<div class="rh-pend-linha" data-act="rhFicha" data-id="${x.f.id}" style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);cursor:pointer">
        <span><b>${esc(x.f.nome)}</b> <span class="small muted">· ${esc(nomeSetor(x.f.setorId))}</span></span>
        <span class="small muted" style="text-align:right">falta: ${esc(x.falta.join(', '))}</span></div>`).join('') + '</div>';
  }
  function vRH() {
    const s = st();
    if (s.ficha) { const f = funcPorId(s.ficha); if (f) return ficha(f); s.ficha = null; }
    const todos = S.funcionarios, cont = { total: todos.length, ativo: 0, afastado: 0, ferias: 0, suspenso: 0, desligado: 0 };
    todos.forEach(f => { const x = situacao(f); cont[x]++; });
    const ativos = todos.filter(f => f.ativo).length;
    const ind = (k, n, l, cls) => `<button class="ctr-ind${s.filtro === k ? ' on' : ''}${cls ? ' ' + cls : ''}" data-act="rhFiltro" data-f="${k}"><b>${n}</b><span>${l}</span></button>`;
    let h = seguro(() => (window.CAD ? CAD.barra() : '')) + seguro(anivHtml) + `<div class="orc-topo"><div><h2 style="margin:0">Funcionários</h2><div class="small muted">RH: cadastro, ficha, afastamentos, férias e ocorrências</div></div>
      ${soLer() ? '' : '<button class="btn pri orc-novo" data-act="rhNovo">+ Novo funcionário</button>'}</div>
      <div class="ctr-inds">${ind('todos', cont.total, 'Cadastrados')}${ind('', ativos, 'Ativos')}${ind('afastado', cont.afastado, 'Afastados', cont.afastado ? 'alerta' : '')}${ind('ferias', cont.ferias, 'De férias')}${ind('suspenso', cont.suspenso, 'Suspensos', cont.suspenso ? 'perigo' : '')}${ind('desligado', cont.desligado, 'Desligados')}</div>
      <div class="orc-busca rh-busca"><input type="search" id="rhBusca" placeholder="Pesquisar por nome, função ou CPF" value="${esc(s.busca)}" autocomplete="off">
        <select id="rhSetor"><option value="">Todos os setores</option>${setoresOrd().map(x => `<option value="${x.id}"${s.setor === x.id ? ' selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
      <div class="orc-chips">${[['', 'Ativos'], ['afastado', 'Afastados'], ['ferias', 'De férias'], ['suspenso', 'Suspensos'], ['desligado', 'Desligados'], ['todos', 'Todos']].map(c => `<button class="orc-chip${s.filtro === c[0] ? ' on' : ''}" data-act="rhFiltro" data-f="${c[0]}">${c[1]}</button>`).join('')}</div>`;
    const q = (s.busca || '').trim().toLowerCase(), qd = q.replace(/\D/g, '');
    const lista = todos.filter(f => {
      const x = situacao(f);
      if (s.filtro === 'todos') { } else if (s.filtro) { if (x !== s.filtro) return false; } else if (!f.ativo) return false;
      if (s.setor && f.setorId !== s.setor) return false;
      if (q) { const cpf = String((rhDe(f.id).pessoais || {}).cpf || '').replace(/\D/g, ''); if (!((f.nome + ' ' + (f.funcao || '')).toLowerCase().includes(q) || (qd.length >= 3 && cpf.includes(qd)))) return false; }
      return true;
    }).sort((a, b) => cmpSetor(a.setorId, b.setorId) || a.nome.localeCompare(b.nome, 'pt-BR'));
    if (!S.setores.length) h += '<div class="alert w"><span class="ic">!</span><div>Cadastre os <a href="#setores">setores</a> antes dos funcionários.</div></div>';
    h += `<div class="orc-lista-h"><b>${s.filtro || q || s.setor ? 'Resultado' : 'Funcionários ativos'}</b><span class="small muted">${lista.length} pessoa(s)</span></div>`;
    if (!lista.length) return h + '<div class="card"><p class="muted" style="margin:0">Ninguém encontrado com esses filtros.</p></div>';
    const setoresDaLista = [...new Set(lista.map(f => f.setorId))].sort((x, y) => nomeSetor(x).localeCompare(nomeSetor(y), 'pt-BR'));
    const grupos = setoresDaLista.map(sid => { const m = lista.filter(f => f.setorId === sid).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
      return `<div style="font-weight:700;margin:16px 0 6px">${esc(nomeSetor(sid))} <span class="small muted" style="font-weight:400">· ${m.length} pessoa(s)</span></div><div class="orc-lista">${m.map(cartao).join('')}</div>`; }).join('');
    return h + grupos +
      (soLer() ? '' : '<div class="row" style="justify-content:center;margin:6px 0 14px"><button class="btn sm" data-act="importarFunc">Cadastrar vários de uma vez</button></div>');
  }
  function cartao(f) {
    const r = rhDe(f.id), vinc = (VINCULOS.find(v => v[0] === (r.profissionais || {}).vinculo) || [0, ''])[1];
    return `<div class="orc-card rh-card ${situacao(f)}" data-func="${f.id}"><div class="orc-card-l1"><span class="orc-num">${esc(nomeSetor(f.setorId))}${f.funcao ? ' · ' + esc(f.funcao) : ''}</span>${badge(f)}</div>
      <div class="orc-card-l2"><span class="rh-av">${esc(iniciais(f.nome))}</span><b>${esc(f.nome)}</b></div>
      <div class="orc-desc">${f.dataEntrada ? 'Entrada ' + br(f.dataEntrada) : 'Entrada não informada'}${vinc ? ' · ' + esc(vinc) : ''}${!f.ativo && r.desligamento ? ' · desligado em ' + br(r.desligamento.data) : ''}</div>
      <div class="orc-card-bt"><button class="btn sm pri" data-act="rhFicha" data-id="${f.id}">Ficha</button>${soLer() ? '' : `<button class="btn sm" data-act="rhEditar" data-id="${f.id}">Editar</button>`}</div></div>`;
  }
  const iniciais = n => String(n || '?').trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();

  /* ---------- ficha individual ---------- */
  const ABAS = [['dados', 'Dados'], ['historico', 'Histórico'], ['afast', 'Afastamentos'], ['ferias', 'Férias'], ['ocorr', 'Advertências e suspensões'], ['docs', 'Documentos'], ['pag', 'Pagamentos']];
  function ficha(f) {
    const s = st(), r = rhDe(f.id), ro = soLer();
    let h = `<div class="orc-topo"><button class="btn" data-act="rhVoltar">← Funcionários</button>${ro ? '' : `<div class="row" style="gap:6px"><button class="btn" data-act="rhLink" data-id="${f.id}">Link de cadastro</button><button class="btn" data-act="rhEditar" data-id="${f.id}">Editar</button></div>`}</div>
      <div class="card mb rh-cab"><span class="rh-av g">${esc(iniciais(f.nome))}</span><div style="flex:1;min-width:0"><h2 style="margin:0">${esc(f.nome)}</h2><div class="small muted">${esc(nomeSetor(f.setorId))}${f.funcao ? ' · ' + esc(f.funcao) : ''}${f.dataEntrada ? ' · desde ' + br(f.dataEntrada) : ''}</div></div>${badge(f)}</div>`;
    if (!f.ativo && r.desligamento) h += `<div class="alert e"><span class="ic">!</span><div><b>Desligado em ${br(r.desligamento.data)}</b> · ${esc((TIPOS_DESL.find(t => t[0] === r.desligamento.tipo) || [0, ''])[1])}${r.desligamento.motivo ? ' · ' + esc(r.desligamento.motivo) : ''}<div class="small">Registrado por ${esc(r.desligamento.por || '—')} em ${dtHora(r.desligamento.em)}</div></div></div>`;
    h += '<div class="orc-chips rh-abas">' + ABAS.map(a => `<button class="orc-chip${s.aba === a[0] ? ' on' : ''}" data-act="rhAba" data-a="${a[0]}">${a[1]}</button>`).join('') + '</div>';
    const corpo = { dados: abaDados, historico: abaHistorico, afast: abaAfast, ferias: abaFerias, ocorr: abaOcorr, docs: abaDocs, pag: abaPag }[s.aba] || abaDados;
    return h + corpo(f, r, ro);
  }
  const linha = (l, v) => v ? `<div><span class="small muted">${l}</span><div>${v}</div></div>` : '';
  function abaDados(f, r, ro) {
    const p = r.pessoais || {}, pr = r.profissionais || {}, rm = r.remuneracao || {}, vt = C.vtValorEm(f, hoje());
    const bloco = (t, conteudo, etapa) => `<div class="card mb"><div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">${t}</h3>${ro ? '' : `<button class="btn sm" data-act="rhEditar" data-id="${f.id}" data-e="${etapa}">Editar</button>`}</div><div class="orc-info">${conteudo || '<span class="small muted">Não informado.</span>'}</div></div>`;
    return bloco('Dados pessoais', linha('CPF', esc(p.cpf || '')) + linha('RG', esc(p.rg || '')) + linha('Nascimento', p.nascimento ? br(p.nascimento) : '') + linha('Telefone', esc(f.telefone || p.telefone || '')) + linha('E-mail', esc(p.email || '')) + linha('Endereço', esc(p.endereco || '')), 1) +
      bloco('Dados profissionais', linha('Vínculo', esc((VINCULOS.find(v => v[0] === pr.vinculo) || [0, ''])[1])) + linha('Matrícula', esc(pr.matricula || '')) + linha('PIS/NIS', esc(pr.pis || '')) + linha('CTPS', esc(pr.ctps || '')) + linha('Escolaridade', esc(pr.escolaridade || '')), 2) +
      bloco('Setor e função', linha('Setor', esc(nomeSetor(f.setorId))) + linha('Função', esc(f.funcao || '')) + linha('Turno', esc(pr.turno || '')), 3) +
      bloco('Admissão e remuneração', linha('Admissão', f.dataEntrada ? br(f.dataEntrada) : '') + linha('Remuneração', rm.valor ? 'R$ ' + brl(rm.valor) + (rm.tipo ? ' (' + esc(rm.tipo) + ')' : '') : '') + linha('Vale-transporte', vt ? (vt.fixo ? 'valor fixo' : 'R$ ' + brl(vt.valor) + ' × ' + vt.qtd + '/dia') : 'não recebe') + linha('PIX', esc(f.pix || '')) + linha('Titular', esc(f.titular || '')), 4) +
      bloco('Contatos de emergência', (r.emergencia || []).map(c => linha(esc(c.parentesco || 'Contato'), esc(c.nome) + (c.telefone ? ' · ' + esc(c.telefone) : ''))).join(''), 6) +
      (f.obs ? `<div class="card mb"><h3 style="margin:0 0 6px">Observações</h3><p class="small" style="margin:0;white-space:pre-line">${esc(f.obs)}</p></div>` : '') +
      (ro ? '' : `<div class="row rh-acoes"><button class="btn" data-act="rhTransferir" data-id="${f.id}">Transferir de setor</button>${f.ativo ? `<button class="btn danger" data-act="rhDesligar" data-id="${f.id}">Desligar (arquivar)</button>` : `<button class="btn pri" data-act="rhReativar" data-id="${f.id}">Reativar</button>`}</div>`);
  }
  function abaHistorico(f, r) {
    // o registro do sistema (auditoria) já tem tudo o que é feito aqui; os eventos da ficha só entram se não houver registro
    const nome = String(f.nome || '').toLowerCase();
    const ev = (S.auditoria || []).filter(a => a.tipo === 'funcionario' && String(a.texto || '').toLowerCase().includes(nome)).map(a => {
      const t = String(a.texto || ''), i = t.indexOf(':');
      return { em: a.ts, t: i > 0 && i < 30 ? t.slice(0, i) : 'Registro', d: esc(i > 0 && i < 30 ? t.slice(i + 1).replace(new RegExp('^\\s*' + f.nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*(—|-)?\\s*', 'i'), '').replace(/^[\s·—-]+/, '') : t), por: a.por };
    });
    if (!ev.length) {
      if (f.criadoEm) ev.push({ em: f.criadoEm, t: 'Cadastrado', d: '' });
      (r.ocorrencias || []).forEach(x => ev.push({ em: x.em, t: (OCORR[x.tipo] || ['Ocorrência'])[0], d: esc(x.motivo || ''), por: x.por }));
      if (r.desligamento) ev.push({ em: r.desligamento.em, t: 'Desligado', d: esc(r.desligamento.motivo || ''), por: r.desligamento.por });
    }
    ev.sort((a, b) => String(b.em || '').localeCompare(String(a.em || '')));
    const setores = (r.historicoSetores || []).slice().sort((a, b) => String(a.em).localeCompare(String(b.em)));
    return `<div class="card mb"><h3 style="margin:0 0 6px">Histórico de setores</h3>${setores.length ? '<ul class="list-sm">' + setores.map(x => `<li><span>${x.de ? esc(x.de) + ' → ' : ''}<b>${esc(x.para)}</b></span><span class="small muted">${br(String(x.em).slice(0, 10))}</span></li>`).join('') + '</ul>' : `<p class="small muted" style="margin:0">Sempre no setor ${esc(nomeSetor(f.setorId))}.</p>`}</div>
      <div class="card mb"><h3 style="margin:0 0 6px">Histórico de alterações</h3>${ev.length ? '<ul class="list-sm rh-ev">' + ev.slice(0, 80).map(x => `<li><span><b>${x.t}</b>${x.d ? '<div class="small">' + x.d + '</div>' : ''}</span><span class="small muted">${x.em ? dtHora(x.em) : ''}${x.por ? '<br>' + esc(x.por) : ''}</span></li>`).join('') + '</ul>' : '<p class="small muted" style="margin:0">Sem registros ainda.</p>'}</div>`;
  }
  function abaAfast(f) {
    const a = (UI.ats && UI.ats.lista) ? UI.ats.lista.filter(x => x.func_id === f.id) : null;
    if (!a && root.atsCarregar && !st().carregouAts) { st().carregouAts = true; root.atsCarregar(); }
    const meses = Object.keys(S.vt || {}).sort().reverse().slice(0, 12), ev = [];
    meses.forEach(m => { const aj = ((S.vt[m] || {}).ajustes || {})[f.id] || {}; Object.keys(aj).forEach(d => { const t = aj[d].t; if (['atestado', 'afast', 'suspensao', 'falta', 'faltaJ'].includes(t)) ev.push({ d, t, obs: aj[d].obs || '' }); }); });
    ev.sort((x, y) => y.d.localeCompare(x.d));
    // agrupa dias seguidos do mesmo tipo
    const grupos = []; ev.slice().reverse().forEach(e => { const g = grupos[grupos.length - 1]; if (g && g.t === e.t && C.addDias(g.fim, 1) === e.d) g.fim = e.d; else grupos.push({ t: e.t, ini: e.d, fim: e.d, obs: e.obs }); });
    const nomes = { atestado: 'Atestado', afast: 'Afastamento', suspensao: 'Suspensão', falta: 'Falta', faltaJ: 'Falta justificada' };
    return `<div class="card mb"><div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Atestados</h3><a class="btn sm" href="#atestados">Central de atestados</a></div>
      ${!a ? '<p class="small muted">Carregando…</p>' : a.length ? '<ul class="list-sm">' + a.map(x => `<li><span><b>${x.inicio ? br(x.inicio) + (x.fim ? ' a ' + br(x.fim) : '') : 'em análise'}</b><div class="small muted">${x.dias ? x.dias + ' dia(s) · ' : ''}${x.cid ? 'CID ' + esc(x.cid) + ' · ' : ''}${x.status === 'cancelado' ? 'cancelado' : x.status === 'analise' ? 'em análise' : x.fim < hoje() ? 'encerrado' : 'em andamento'}</div></span>${x.status !== 'cancelado' && x.tem_arquivo ? `<button class="btn sm" data-act="atsVerDoc" data-id="${x.id}">Documento</button>` : ''}</li>`).join('') + '</ul>' : '<p class="small muted" style="margin:6px 0 0">Nenhum atestado.</p>'}</div>
      <div class="card mb"><h3 style="margin:0 0 6px">Afastamentos, suspensões e faltas (últimos 12 meses)</h3>${grupos.length ? '<ul class="list-sm">' + grupos.reverse().map(g => `<li><span><b>${nomes[g.t]}</b><div class="small muted">${br(g.ini)}${g.fim !== g.ini ? ' a ' + br(g.fim) : ''}${g.obs ? ' · ' + esc(g.obs) : ''}</div></span></li>`).join('') + '</ul>' : '<p class="small muted" style="margin:0">Nenhum registro.</p>'}
      <p class="small muted">Atestados e afastamentos vêm da central de atestados e do controle de vale-transporte.</p></div>`;
  }
  function abaFerias(f, r, ro) {
    const fs = (f.ferias || []).slice().sort((a, b) => b.ini.localeCompare(a.ini));
    return `<div class="card mb"><h3 style="margin:0 0 6px">Férias</h3>${fs.length ? '<ul class="list-sm">' + fs.map((p, i) => `<li><span><b>${br(p.ini)} a ${br(p.fim)}</b><div class="small muted">${Math.round((new Date(p.fim) - new Date(p.ini)) / 864e5) + 1} dia(s) · ${p.fim < hoje() ? 'gozadas' : p.ini > hoje() ? 'programadas' : 'em andamento'}</div></span>${ro ? '' : `<button class="btn sm danger" data-act="rhFeriasDel" data-id="${f.id}" data-i="${(f.ferias || []).indexOf(p)}">Remover</button>`}</li>`).join('') + '</ul>' : '<p class="small muted" style="margin:0">Nenhum período de férias registrado.</p>'}
      ${ro ? '' : `<div class="rh-ferias-add"><div class="fld"><label class="f">De</label><input type="date" id="rhFerIni"></div><div class="fld"><label class="f">Até</label><input type="date" id="rhFerFim"></div><button class="btn pri" data-act="rhFeriasAdd" data-id="${f.id}">Adicionar férias</button></div>`}
      <p class="small muted">Na escala, quem está de férias não recebe folga e aparece em vermelho na folha.</p></div>`;
  }
  function abaOcorr(f, r, ro) {
    const oc = (r.ocorrencias || []).slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
    return `<div class="card mb"><h3 style="margin:0 0 6px">Advertências e suspensões</h3>${oc.length ? '<ul class="list-sm">' + oc.map(o => `<li><span><span class="badge ${(OCORR[o.tipo] || ['', 'b-off'])[1]}">${(OCORR[o.tipo] || [o.tipo])[0]}</span> <b>${br(o.data)}${o.dias ? ' · ' + o.dias + ' dia(s)' : ''}</b><div class="small">${esc(o.motivo || '')}</div><div class="small muted">Registrado por ${esc(o.por || '—')} em ${dtHora(o.em)}</div></span></li>`).join('') + '</ul>' : '<p class="small muted" style="margin:0">Nenhuma ocorrência.</p>'}
      ${ro || !f.ativo ? '' : `<div class="row rh-acoes"><button class="btn" data-act="rhOcorr" data-id="${f.id}" data-t="advertencia">+ Advertência</button><button class="btn" data-act="rhOcorr" data-id="${f.id}" data-t="suspensao">+ Suspensão</button><button class="btn" data-act="rhOcorr" data-id="${f.id}" data-t="elogio">+ Elogio</button><button class="btn" data-act="rhOcorr" data-id="${f.id}" data-t="anotacao">+ Anotação</button></div>`}
      <p class="small muted">A suspensão entra sozinha na escala, no painel e no vale-transporte (dias sem passagem).</p></div>`;
  }
  function abaDocs(f, r, ro) {
    const ds = docsDe(f.id);
    return `<div class="card mb"><h3 style="margin:0 0 6px">Documentos</h3>${ds.length ? '<ul class="list-sm">' + ds.map(d => `<li><span><b>${esc(d.nome || 'Documento')}</b><div class="small muted">${esc(d.categoria || '')}${d.categoria ? ' · ' : ''}${dtHora(d.em)}${d.por ? ' · ' + esc(d.por) : ''}</div></span><button class="btn sm" data-act="rhDocVer" data-id="${d.id}">Abrir</button></li>`).join('') + '</ul>' : '<p class="small muted" style="margin:0">Nenhum documento anexado.</p>'}
      ${ro ? '' : `<div class="rh-ferias-add"><div class="fld"><label class="f">Tipo</label><select id="rhDocCat">${['RG / CPF', 'Comprovante de residência', 'Carteira de trabalho', 'Contrato', 'Certificado', 'Exame admissional', 'Outro'].map(x => `<option>${x}</option>`).join('')}</select></div>
        <label class="btn pri ats-file">Anexar foto ou PDF<input type="file" id="rhDocArq" data-id="${f.id}" accept="image/*,application/pdf" hidden></label></div>`}
      <p class="small muted">Só o administrador vê. Atestados médicos ficam na central de atestados.</p></div>
      ${(() => { const cs = (S.orcamentos || []).filter(c => c.tipoRegistro === 'contrato' && padronizarNome(c.contratadoNome) === padronizarNome(f.nome)); return cs.length ? `<div class="card mb"><h3 style="margin:0 0 6px">Contratos</h3><ul class="list-sm">${cs.map(c => `<li><span><b>${esc(c.numero)}</b><div class="small muted">${esc(c.servico || '')} · ${br(c.inicio)}${c.fim ? ' a ' + br(c.fim) : ''}</div></span><button class="btn sm" data-act="orcCtrVer" data-id="${c.id}">Abrir</button></li>`).join('')}</ul></div>` : ''; })()}`;
  }
  function abaPag(f) {
    const vt = C.vtValorEm(f, hoje()), nn = padronizarNome(f.nome);
    let h = `<div class="card mb"><h3 style="margin:0 0 6px">Vale-transporte</h3><div class="orc-info">${linha('Valor atual', vt ? (vt.fixo ? 'valor fixo' : 'R$ ' + brl(vt.valor) + ' × ' + vt.qtd + '/dia') : 'não recebe')}</div><a class="btn sm" href="#vt" style="margin-top:8px">Abrir o vale-transporte</a></div>`;
    const prest = (S.prestadores || []).filter(p => padronizarNome(p.nome) === nn);
    if (prest.length && typeof servCalc === 'function') {
      const meses = [...new Set(Object.keys(S.servicos || {}).map(k => k.split('__')[0]).filter(m => /^\d{4}-\d{2}$/.test(m)))].sort().reverse().slice(0, 6);
      const lin = [];
      prest.forEach(p => meses.forEach(m => { if (!S.servicos[m + '__' + p.id] && !(typeof servKey === 'function' && S.servicos[servKey(m, p.id)])) return; let r; try { r = servCalc(m, p.id); } catch (e) { return; }
        lin.push(`<li><span><b>${servMesNome(m)}</b><div class="small muted">${r.pagos.map(x => x.nome + ': R$ ' + brl(x.pago && x.valorPago != null ? x.valorPago : x.valor) + (x.pago ? ' pago' : ' a pagar')).join(' · ')}</div></span><span class="small">R$ ${brl(r.liquido)}</span></li>`); }));
      h += `<div class="card mb"><h3 style="margin:0 0 6px">Serviços prestados</h3>${lin.length ? '<ul class="list-sm">' + lin.join('') + '</ul>' : '<p class="small muted" style="margin:0">Sem planilhas recentes.</p>'}<a class="btn sm" href="#servicos" style="margin-top:8px">Abrir serviços prestados</a></div>`;
    }
    return h + '<p class="small muted">Informações financeiras: só o administrador vê.</p>';
  }

  /* ---------- cadastro em etapas ---------- */
  const ETAPAS = [[1, 'Pessoais'], [2, 'Profissão'], [3, 'Setor'], [4, 'Admissão'], [5, 'Docs'], [6, 'Emergência']];
  function abrirCadastro(f, etapa) {
    const base = f ? JSON.parse(JSON.stringify(f)) : { ativo: true, setorId: st().setor || '', ferias: [] };
    const ficha0 = JSON.parse(JSON.stringify(f ? rhDe(f.id) : {}));
    const d = { f: base, r: ficha0, e: etapa || 1, novo: !f };
    const w = abrirModal('<div id="rhCad"></div>', true);
    w.classList.add('rh-modal');
    const desenhar = () => { w.querySelector('#rhCad').innerHTML = telaCadastro(d); };
    const ler = () => {
      const g = n => { const el = w.querySelector('[name="' + n + '"]'); return el ? el.value : undefined; };
      const set = (obj, k, v) => { if (v !== undefined) obj[k] = typeof v === 'string' ? v.trim() : v; };
      const p = d.r.pessoais = d.r.pessoais || {}, pr = d.r.profissionais = d.r.profissionais || {}, rm = d.r.remuneracao = d.r.remuneracao || {};
      set(d.f, 'nome', g('nome')); set(d.f, 'telefone', g('telefone'));
      set(p, 'cpf', g('cpf')); set(p, 'rg', g('rg')); set(p, 'nascimento', g('nascimento')); set(p, 'email', g('email')); set(p, 'endereco', g('endereco'));
      set(pr, 'vinculo', g('vinculo')); set(pr, 'matricula', g('matricula')); set(pr, 'pis', g('pis')); set(pr, 'ctps', g('ctps')); set(pr, 'escolaridade', g('escolaridade')); set(pr, 'turno', g('turno'));
      set(d.f, 'setorId', g('setorId')); set(d.f, 'funcao', g('funcao')); set(d.f, 'dataEntrada', g('dataEntrada')); set(d.f, 'pix', g('pix')); set(d.f, 'titular', g('titular')); set(d.f, 'obs', g('obs'));
      if (g('remValor') !== undefined) rm.valor = g('remValor') ? Math.round(parseFloat(String(g('remValor')).replace(/\./g, '').replace(',', '.')) * 100) / 100 || null : null;
      set(rm, 'tipo', g('remTipo'));
      if (g('vtValor') !== undefined) { d.vtValor = g('vtValor'); d.vtQtd = g('vtQtd'); }
      if (w.querySelector('.rh-emerg')) d.r.emergencia = [...w.querySelectorAll('.rh-emerg')].map(x => ({ nome: x.querySelector('.eN').value.trim(), parentesco: x.querySelector('.eP').value.trim(), telefone: x.querySelector('.eT').value.trim() })).filter(x => x.nome || x.telefone);
    };
    desenhar();
    w.addEventListener('input', ev => { if (ev.target.name === 'cpf') { const pos = ev.target.value.length; ev.target.value = mascCpf(ev.target.value); } });
    w.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-x]'); if (!b) return;
      const x = b.dataset.x;
      if (x === 'fechar') return fecharModal(w);
      ler();
      if (x === 'etapa') { d.e = +b.dataset.e; desenhar(); w.querySelector('.mbd') && (w.querySelector('.mbd').scrollTop = 0); return; }
      if (x === 'addEm') { (d.r.emergencia = d.r.emergencia || []).push({ nome: '', parentesco: '', telefone: '' }); desenhar(); return; }
      if (x === 'delEm') { d.r.emergencia.splice(+b.dataset.i, 1); desenhar(); return; }
      if (x === 'salvar') { b.disabled = true; const ok = await salvarCadastro(d, f); b.disabled = false; if (ok) { fecharModal(w); if (!f) { st().ficha = ok; st().aba = 'dados'; } render(); } }
    });
  }
  function telaCadastro(d) {
    const f = d.f, r = d.r, p = r.pessoais || {}, pr = r.profissionais || {}, rm = r.remuneracao || {}, e = d.e;
    const inp = (l, n, v, extra) => `<div class="fld"><label class="f">${l}</label><input type="text" name="${n}" value="${esc(v || '')}"${extra || ''}></div>`;
    const dt = (l, n, v) => `<div class="fld"><label class="f">${l}</label><input type="date" name="${n}" value="${esc(v || '')}"></div>`;
    let c = '';
    if (e === 1) c = inp('Nome completo *', 'nome', f.nome, ' autocomplete="name"') + '<div class="ctr-grade">' + inp('CPF', 'cpf', mascCpf(p.cpf), ' inputmode="numeric"') + inp('RG', 'rg', p.rg) + dt('Data de nascimento', 'nascimento', p.nascimento) +
      inp('Telefone (WhatsApp)', 'telefone', f.telefone, ' inputmode="tel"') + inp('E-mail', 'email', p.email, ' inputmode="email"') + '</div>' + `<div class="fld"><label class="f">Endereço</label><textarea name="endereco" rows="2">${esc(p.endereco || '')}</textarea></div>`;
    if (e === 2) c = '<div class="ctr-grade">' + `<div class="fld"><label class="f">Vínculo</label><select name="vinculo"><option value="">—</option>${VINCULOS.map(v => `<option value="${v[0]}"${pr.vinculo === v[0] ? ' selected' : ''}>${v[1]}</option>`).join('')}</select></div>` +
      inp('Matrícula', 'matricula', pr.matricula) + inp('PIS/NIS', 'pis', pr.pis, ' inputmode="numeric"') + inp('CTPS', 'ctps', pr.ctps) + inp('Escolaridade', 'escolaridade', pr.escolaridade) + '</div>';
    if (e === 3) c = '<div class="ctr-grade">' + `<div class="fld"><label class="f">Setor *</label><select name="setorId"><option value="">Selecione…</option>${setoresOrd().map(s => `<option value="${s.id}"${f.setorId === s.id ? ' selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></div>` +
      inp('Função', 'funcao', f.funcao) + inp('Turno / horário', 'turno', pr.turno) + '</div>' + (d.novo ? '' : '<p class="small muted">Mudou o setor? A transferência fica registrada no histórico de setores.</p>');
    if (e === 4) { const vt = C.vtValorEm(f, hoje()); c = '<div class="ctr-grade">' + dt('Data de admissão', 'dataEntrada', f.dataEntrada) + inp('Remuneração (R$)', 'remValor', rm.valor ? String(rm.valor).replace('.', ',') : '', ' inputmode="decimal"') +
      `<div class="fld"><label class="f">Tipo</label><select name="remTipo">${['', 'mensal', 'quinzenal', 'semanal', 'por diária', 'por serviço'].map(x => `<option value="${x}"${rm.tipo === x ? ' selected' : ''}>${x || '—'}</option>`).join('')}</select></div>` +
      inp('Vale-transporte: passagem (R$)', 'vtValor', d.vtValor !== undefined ? d.vtValor : (vt && !vt.fixo ? String(vt.valor).replace('.', ',') : ''), ' inputmode="decimal"') + inp('Passagens por dia', 'vtQtd', d.vtQtd !== undefined ? d.vtQtd : (vt ? vt.qtd : 1), ' inputmode="numeric"') +
      inp('Chave PIX', 'pix', f.pix) + inp('Titular da conta', 'titular', f.titular) + '</div>' + `<div class="fld"><label class="f">Observações</label><textarea name="obs" rows="2">${esc(f.obs || '')}</textarea></div><p class="small muted">Valores de remuneração só o administrador vê.</p>`; }
    if (e === 5) c = d.novo ? '<p class="muted">Salve o cadastro primeiro. Depois, na ficha do funcionário, aba <b>Documentos</b>, você anexa fotos e PDFs (RG, comprovante, carteira de trabalho…).</p>' : `<p>Os documentos são anexados na ficha do funcionário, aba <b>Documentos</b>. Hoje há <b>${docsDe(f.id).length}</b> documento(s).</p>`;
    if (e === 6) c = '<p class="small muted" style="margin-top:0">Quem avisar numa emergência.</p>' + (r.emergencia || []).map((x, i) => `<div class="rh-emerg ctr-grade"><div class="fld"><label class="f">Nome</label><input type="text" class="eN" value="${esc(x.nome)}"></div><div class="fld"><label class="f">Parentesco</label><input type="text" class="eP" value="${esc(x.parentesco)}"></div><div class="fld"><label class="f">Telefone</label><input type="text" class="eT" inputmode="tel" value="${esc(x.telefone)}"></div><button class="btn sm danger" data-x="delEm" data-i="${i}" style="align-self:end">Remover</button></div>`).join('') +
      '<button class="btn sm" data-x="addEm">+ Adicionar contato</button>';
    return `<div class="mh">${d.novo ? 'Novo funcionário' : 'Editar ' + esc(f.nome || '')}</div>
      <div class="ctr-passos rh-passos">${ETAPAS.map(x => `<button class="ctr-passo${x[0] === e ? ' on' : x[0] < e ? ' feito' : ''}" data-x="etapa" data-e="${x[0]}"><i>${x[0]}</i><span>${x[1]}</span></button>`).join('')}</div>
      <div class="mbd rh-etapa">${c}</div>
      <div class="mf"><button class="btn" data-x="${e > 1 ? 'etapa' : 'fechar'}" data-e="${e - 1}">${e > 1 ? '← Voltar' : 'Cancelar'}</button>${e < 6 ? `<button class="btn" data-x="etapa" data-e="${e + 1}">Próximo →</button>` : ''}<button class="btn pri" data-x="salvar">Salvar</button></div>`;
  }
  async function salvarCadastro(d, antigo) {
    const f = d.f, r = d.r;
    f.nome = padronizarNome(f.nome);
    if (!f.nome) { toast('Informe o nome completo.'); d.e = 1; return false; }
    if (!f.setorId) { toast('Escolha o setor (etapa 3).'); return false; }
    const cpf = (r.pessoais || {}).cpf;
    if (cpf && !cpfOk(cpf)) { toast('CPF inválido. Confira os números (etapa 1).'); return false; }
    if (cpf) { const dup = S.funcionarios.find(x => x.id !== (antigo && antigo.id) && String((rhDe(x.id).pessoais || {}).cpf || '').replace(/\D/g, '') === cpf.replace(/\D/g, '')); if (dup) { toast('Este CPF já está no cadastro de ' + dup.nome + '.'); return false; } }
    const dupNome = S.funcionarios.find(x => x.id !== (antigo && antigo.id) && padronizarNome(x.nome) === f.nome && x.ativo);
    if (dupNome && !await confirmar('Já existe ' + esc(dupNome.nome), '<p>Já há um funcionário ativo com esse nome. Cadastrar mesmo assim?</p>', 'Cadastrar')) return false;
    if (r.pessoais && r.pessoais.cpf) r.pessoais.cpf = mascCpf(r.pessoais.cpf);
    const id = (antigo && antigo.id) || uid('f');
    // vale-transporte: mesma regra do cadastro antigo (novo valor vale do início do mês atual)
    let vtMudou = false;
    if (d.vtValor !== undefined) {
      const vV = parseFloat(String(d.vtValor || '').replace(/\./g, '').replace(',', '.')), vQ = parseInt(d.vtQtd, 10) || 1, vAnt = C.vtValorEm(antigo || f, hoje());
      if (d.vtValor && vV > 0 && (!vAnt || vAnt.fixo || vAnt.valor !== Math.round(vV * 100) / 100 || vAnt.qtd !== vQ)) {
        const hist = ((f.vt && f.vt.hist) || []).slice(), desde = hist.length ? hoje().slice(0, 7) + '-01' : '2000-01-01';
        f.vt = { hist: hist.filter(x => !(x.desde >= desde && x.desde <= hoje())).concat([{ desde, valor: Math.round(vV * 100) / 100, qtd: vQ }]).sort((a, b) => a.desde.localeCompare(b.desde)), nao: false };
        vtMudou = true;
      }
    }
    const dados = Object.assign({}, f); delete dados.id; dados.atualizadoEm = agora(); if (!dados.criadoEm) dados.criadoEm = dados.atualizadoEm;
    const ant = antigo || {}, mud = [];
    if (antigo) {
      if (ant.nome !== f.nome) mud.push('nome'); if ((ant.funcao || '') !== (f.funcao || '')) mud.push('função'); if ((ant.dataEntrada || '') !== (f.dataEntrada || '')) mud.push('admissão');
      if ((ant.telefone || '') !== (f.telefone || '')) mud.push('telefone'); if ((ant.pix || '') !== (f.pix || '') || (ant.titular || '') !== (f.titular || '')) mud.push('dados de pagamento');
      if (vtMudou) mud.push('vale-transporte');
      const ra = rhDe(id); ['pessoais', 'profissionais', 'remuneracao', 'emergencia'].forEach(k => { if (JSON.stringify(ra[k] || null) !== JSON.stringify(r[k] || null)) mud.push({ pessoais: 'dados pessoais', profissionais: 'dados profissionais', remuneracao: 'remuneração', emergencia: 'contatos de emergência' }[k]); });
    }
    if (antigo && ant.setorId !== f.setorId) (r.historicoSetores = r.historicoSetores || []).push({ em: agora(), de: nomeSetor(ant.setorId), para: nomeSetor(f.setorId), por: quem() });
    if (!antigo) (r.historicoSetores = r.historicoSetores || []).push({ em: agora(), de: '', para: nomeSetor(f.setorId), por: quem() });
    if (antigo && mud.length) (r.alteracoes = r.alteracoes || []).push({ em: agora(), por: quem(), campos: mud.join(', ') });
    try {
      await Store.set('funcionarios', id, dados);
      await Store.set('rh', id, Object.assign({}, r, { atualizadoEm: agora() }));
      if (!antigo) log('funcionario', 'Cadastrado: ' + f.nome + ' (' + nomeSetor(f.setorId) + ')');
      else if (mud.length || ant.setorId !== f.setorId) log('funcionario', 'Editado: ' + f.nome + ' — ' + [ant.setorId !== f.setorId ? 'transferido de ' + nomeSetor(ant.setorId) + ' para ' + nomeSetor(f.setorId) : ''].concat(mud).filter(Boolean).join('; '));
      toast(antigo ? 'Cadastro atualizado.' : 'Funcionário cadastrado.');
      return id;
    } catch (e) { return false; }
  }

  /* ---------- ações ---------- */
  async function desligar(id) {
    const f = funcPorId(id); if (!f) return;
    const w = abrirModal(`<div class="mh">Desligar ${esc(f.nome)}</div><div class="mbd"><p class="small muted" style="margin-top:0">O cadastro não é apagado: fica arquivado em "Desligados", com todo o histórico. Ele deixa de entrar nas próximas escalas.</p>
      <div class="ctr-grade"><div class="fld"><label class="f">Data do desligamento</label><input type="date" id="dlData" value="${hoje()}"></div>
      <div class="fld"><label class="f">Tipo</label><select id="dlTipo">${TIPOS_DESL.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select></div></div>
      <div class="fld"><label class="f">Motivo *</label><textarea id="dlMotivo" rows="3"></textarea></div></div>
      <div class="mf"><button class="btn" data-x="n">Voltar</button><button class="btn danger" data-x="s">Desligar</button></div>`);
    w.querySelector('[data-x=n]').onclick = () => fecharModal(w);
    w.querySelector('[data-x=s]').onclick = async ev => {
      const motivo = w.querySelector('#dlMotivo').value.trim(), data = w.querySelector('#dlData').value || hoje();
      if (!motivo) { w.querySelector('#dlMotivo').focus(); return toast('Escreva o motivo.'); }
      ev.target.disabled = true;
      const r = rhDe(id), dl = { data, tipo: w.querySelector('#dlTipo').value, motivo, por: quem(), em: agora() };
      try {
        await Store.set('rh', id, Object.assign({}, r, { desligamento: dl, desligamentos: (r.desligamentos || []).concat([dl]), atualizadoEm: agora() }));
        const dados = Object.assign({}, f, { ativo: false, atualizadoEm: agora() }); delete dados.id;
        await Store.set('funcionarios', id, dados);
        log('funcionario', 'Desligado: ' + f.nome + ' em ' + br(data) + ' — ' + motivo);
        fecharModal(w); toast('Funcionário desligado e arquivado.'); render();
      } catch (e) { ev.target.disabled = false; }
    };
  }
  async function reativar(id) {
    const f = funcPorId(id); if (!f) return;
    if (!await confirmar('Reativar ' + esc(f.nome) + '?', '<p>Volta para a lista de ativos e para as próximas escalas. O desligamento anterior fica no histórico.</p>', 'Reativar')) return;
    const r = rhDe(id);
    await Store.set('rh', id, Object.assign({}, r, { desligamento: null, reativacoes: (r.reativacoes || []).concat([{ em: agora(), por: quem() }]), atualizadoEm: agora() }));
    const dados = Object.assign({}, f, { ativo: true, atualizadoEm: agora() }); delete dados.id;
    await Store.set('funcionarios', id, dados); log('funcionario', 'Reativado: ' + f.nome); toast('Funcionário reativado.'); render();
  }
  function transferir(id) {
    const f = funcPorId(id); if (!f) return;
    const w = abrirModal(`<div class="mh">Transferir ${esc(f.nome)}</div><div class="mbd"><p>Setor atual: <b>${esc(nomeSetor(f.setorId))}</b></p><div class="fld"><label class="f">Novo setor</label><select id="trSet">${setoresOrd().filter(s => s.id !== f.setorId).map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join('')}</select></div>
      <p class="small muted">Escalas já geradas são conferidas de novo com o novo setor. A mudança fica no histórico de setores.</p></div><div class="mf"><button class="btn" data-x="n">Cancelar</button><button class="btn pri" data-x="s">Transferir</button></div>`);
    w.querySelector('[data-x=n]').onclick = () => fecharModal(w);
    w.querySelector('[data-x=s]').onclick = async () => {
      const ns = w.querySelector('#trSet').value; if (!ns) return;
      const r = rhDe(id);
      try {
        const dados = Object.assign({}, f, { setorId: ns, atualizadoEm: agora() }); delete dados.id;
        await Store.set('funcionarios', id, dados);
        await Store.set('rh', id, Object.assign({}, r, { historicoSetores: (r.historicoSetores || []).concat([{ em: agora(), de: nomeSetor(f.setorId), para: nomeSetor(ns), por: quem() }]), atualizadoEm: agora() }));
        log('funcionario', 'Transferência: ' + f.nome + ' de ' + nomeSetor(f.setorId) + ' para ' + nomeSetor(ns)); fecharModal(w); toast('Funcionário transferido.'); render();
      } catch (e) { }
    };
  }
  async function feriasAdd(id) {
    const f = funcPorId(id), ini = (document.getElementById('rhFerIni') || {}).value, fim = (document.getElementById('rhFerFim') || {}).value;
    if (!ini || !fim) return toast('Informe o início e o fim das férias.');
    if (fim < ini) return toast('O fim não pode ser antes do início.');
    if ((f.ferias || []).some(p => p.ini <= fim && p.fim >= ini)) return toast('Já há férias nesse período.');
    if (!await confirmar('Registrar férias?', `<p>${esc(f.nome)}: ${br(ini)} a ${br(fim)}.</p><p class="small muted">Nas semanas de férias ele não recebe folga na escala.</p>`, 'Registrar')) return;
    const dados = Object.assign({}, f, { ferias: (f.ferias || []).concat([{ ini, fim }]).sort((a, b) => a.ini.localeCompare(b.ini)), atualizadoEm: agora() }); delete dados.id;
    await Store.set('funcionarios', id, dados); log('funcionario', 'Férias: ' + f.nome + ' de ' + br(ini) + ' a ' + br(fim)); toast('Férias registradas.'); render();
  }
  async function feriasDel(id, i) {
    const f = funcPorId(id), p = (f.ferias || [])[i]; if (!p) return;
    if (!await confirmar('Remover férias?', `<p>${br(p.ini)} a ${br(p.fim)}. Fica registrado no histórico.</p>`, 'Remover', true)) return;
    const fer = f.ferias.slice(); fer.splice(i, 1);
    const dados = Object.assign({}, f, { ferias: fer, atualizadoEm: agora() }); delete dados.id;
    await Store.set('funcionarios', id, dados); log('funcionario', 'Férias removidas: ' + f.nome + ' (' + br(p.ini) + ' a ' + br(p.fim) + ')'); render();
  }
  function ocorrencia(id, tipo) {
    const f = funcPorId(id); if (!f) return;
    const susp = tipo === 'suspensao';
    const w = abrirModal(`<div class="mh">${OCORR[tipo][0]} · ${esc(f.nome)}</div><div class="mbd"><div class="ctr-grade"><div class="fld"><label class="f">${susp ? 'Início' : 'Data'}</label><input type="date" id="ocData" value="${hoje()}"></div>
      ${susp ? '<div class="fld"><label class="f">Dias de suspensão</label><input type="text" id="ocDias" inputmode="numeric" value="1"></div>' : ''}</div>
      <div class="fld"><label class="f">${tipo === 'elogio' || tipo === 'anotacao' ? 'Descrição' : 'Motivo'} *</label><textarea id="ocMot" rows="3"></textarea></div>
      ${susp ? '<p class="small muted">Os dias entram na escala e no painel como suspensão, sem vale-transporte.</p>' : ''}</div>
      <div class="mf"><button class="btn" data-x="n">Cancelar</button><button class="btn pri" data-x="s">Registrar</button></div>`);
    w.querySelector('[data-x=n]').onclick = () => fecharModal(w);
    w.querySelector('[data-x=s]').onclick = async ev => {
      const data = w.querySelector('#ocData').value, motivo = w.querySelector('#ocMot').value.trim(), dias = susp ? parseInt(w.querySelector('#ocDias').value, 10) : 0;
      if (!data || !motivo) return toast('Preencha a data e o ' + (tipo === 'elogio' || tipo === 'anotacao' ? 'texto' : 'motivo') + '.');
      if (susp && !(dias >= 1 && dias <= 30)) return toast('Dias de suspensão: de 1 a 30.');
      ev.target.disabled = true;
      const r = rhDe(id), o = { id: uid('oc'), tipo, data, dias: dias || null, motivo, por: quem(), em: agora() };
      try {
        await Store.set('rh', id, Object.assign({}, r, { ocorrencias: (r.ocorrencias || []).concat([o]), atualizadoEm: agora() }));
        if (susp) {
          // mesmo lançamento que o controle de VT usa: escala, painel e VT passam a mostrar a suspensão
          for (let k = 0; k < dias; k++) {
            const dia = C.addDias(data, k), mes = dia.slice(0, 7), doc = JSON.parse(JSON.stringify(S.vt[mes] || { mes }));
            doc.ajustes = doc.ajustes || {}; doc.ajustes[id] = doc.ajustes[id] || {};
            doc.ajustes[id][dia] = { t: 'suspensao', em: agora(), obs: 'Suspensão: ' + motivo.slice(0, 60) };
            doc.alteracoes = (doc.alteracoes || []).concat(k === 0 || dia.slice(8) === '01' ? [{ ts: agora(), texto: f.nome + ', ' + br(dia).slice(0, 5) + ': suspensão (' + dias + ' dia(s)) · aba Funcionários' }] : []);
            S.vt[mes] = doc; await Store.set('vt', mes, Object.assign({}, doc, { atualizadoEm: agora() }));
          }
        }
        log('funcionario', OCORR[tipo][0] + ': ' + f.nome + ' em ' + br(data) + (dias ? ' (' + dias + ' dia(s))' : '') + ' — ' + motivo);
        fecharModal(w); toast(OCORR[tipo][0] + ' registrada.'); render();
      } catch (e) { ev.target.disabled = false; }
    };
  }
  // documentos: imagem reduzida (cabe no limite do servidor); PDF até ~230 KB
  async function anexar(fid, file) {
    if (!file) return;
    const cat = (document.getElementById('rhDocCat') || {}).value || 'Outro';
    let dataUrl;
    const ler = fl => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(fl); });
    if (/^image\//.test(file.type)) {
      const url = await ler(file), img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      let larg = Math.min(1400, img.width), q = 0.8;
      for (let t = 0; t < 6; t++) { const cv = document.createElement('canvas'); cv.width = larg; cv.height = Math.round(img.height * larg / img.width); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); dataUrl = cv.toDataURL('image/jpeg', q); if (dataUrl.length < 230000) break; larg = Math.round(larg * 0.8); q = Math.max(0.5, q - 0.08); }
    } else if (file.type === 'application/pdf') {
      if (file.size > 170000) return modalMsg('PDF grande demais', '<p>O PDF tem ' + Math.round(file.size / 1024) + ' KB. O limite é cerca de 170 KB. Tire uma foto do documento ou envie um PDF menor.</p>');
      dataUrl = await ler(file);
    } else return toast('Envie uma foto ou um PDF.');
    if (!dataUrl || dataUrl.length > 240000) return toast('Arquivo grande demais.');
    const id = fid + '__' + uid('d');
    try { await Store.set('rh_docs', id, { nome: file.name || cat, categoria: cat, arquivo: dataUrl, tipo: file.type, em: agora(), por: quem() }); log('funcionario', 'Documento anexado: ' + (funcPorId(fid) || {}).nome + ' · ' + cat); toast('Documento anexado.'); render(); } catch (e) { }
  }
  function verDocumento(id) {
    const d = (S.rh_docs || {})[id]; if (!d) return;
    if (/^data:application\/pdf/.test(d.arquivo)) { fetch(d.arquivo).then(r => r.blob()).then(b => { const u = URL.createObjectURL(b); if (!window.open(u, '_blank')) location.href = u; }); return; }
    abrirModal(`<div class="mh">${esc(d.nome || 'Documento')}</div><div class="mbd"><img src="${d.arquivo}" alt="" style="width:100%;border-radius:8px"><p class="small muted">${esc(d.categoria || '')} · anexado em ${dtHora(d.em)}${d.por ? ' por ' + esc(d.por) : ''}</p></div><div class="mf"><button class="btn" data-act="ajFechar">Fechar</button></div>`, true);
  }

  function acao(el, ev) {
    const s = st(), act = el.dataset.act, id = el.dataset.id;
    switch (act) {
      case 'rhFiltro': s.filtro = el.dataset.f || ''; return render();
      case 'rhNovo': if (!S.setores.length) return modalMsg('Cadastre um setor', '<p>Antes de cadastrar funcionários, crie pelo menos um setor.</p>'); return abrirCadastro(null);
      case 'rhEditar': return abrirCadastro(funcPorId(id), +el.dataset.e || 1);
      case 'rhLink': return CAD.gerarLink(id);
      case 'rhCadRevisar': return CAD.revisar();
      case 'rhFicha': s.ficha = id; s.aba = 'dados'; render(); window.scrollTo(0, 0); return;
      case 'rhVoltar': s.ficha = null; render(); window.scrollTo(0, 0); return;
      case 'rhAba': s.aba = el.dataset.a; return render();
      case 'rhDesligar': return desligar(id);
      case 'rhReativar': return reativar(id);
      case 'rhTransferir': return transferir(id);
      case 'rhFeriasAdd': return feriasAdd(id);
      case 'rhFeriasDel': return feriasDel(id, +el.dataset.i);
      case 'rhOcorr': return ocorrencia(id, el.dataset.t);
      case 'rhDocVer': return verDocumento(id);
    }
  }
  let buscaT = null;
  document.addEventListener('input', ev => {
    if (!ev.target || ev.target.id !== 'rhBusca') return;
    st().busca = ev.target.value; window.__svcT = Date.now(); clearTimeout(buscaT);
    buscaT = setTimeout(() => { const p = ev.target.selectionStart; render(); const n = document.getElementById('rhBusca'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) { } } }, 250);
  });
  document.addEventListener('change', ev => {
    const t = ev.target; if (!t) return;
    if (t.id === 'rhSetor') { st().setor = t.value; return render(); }
    if (t.id === 'rhDocArq') { const fl = t.files && t.files[0]; t.value = ''; return anexar(t.dataset.id, fl); }
  });

  Object.assign(root, { vRH, rhAcao: acao, rhSituacao: situacao, rhPadronizarNome: padronizarNome });
})(window);
