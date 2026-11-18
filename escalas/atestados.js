/* =====================================================================
   ATESTADOS (só administrador)
   Envia o documento uma vez -> leitura automática -> conferência -> o servidor distribui:
   dias de atestado no controle de VT (que alimenta painel, escala, cálculo do VT e funcionários),
   histórico e trilha. Corrigir e cancelar desfazem exatamente o que foi lançado.
   ===================================================================== */
(function (root) {
  'use strict';
  const R$ = v => 'R$ ' + (Math.round((+v || 0) * 100) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const br = iso => iso ? C.dataBR(iso) : '—';
  const st = () => (UI.ats = UI.ats || { etapa: 'lista' });
  const hoje = () => C.hojeISO();
  const fimDe = (ini, dias) => C.addDias(ini, dias - 1);
  const ERROS = { SOBREPOSTO: 'Já existe atestado dessa pessoa nesse período. Corrija o existente em vez de lançar outro.', DUPLICADO: 'Este mesmo documento já foi lançado.',
    FUNCIONARIO_NAO_ENCONTRADO: 'Funcionário não encontrado no cadastro.', DADOS_INVALIDOS: 'Confira o funcionário, a data de início e a quantidade de dias (1 a 365).',
    ATESTADO_NAO_ENCONTRADO: 'Este atestado não existe mais ou já foi cancelado.', SEM_CONEXAO: 'Sem conexão com a internet.', SEM_PERMISSAO: 'Só o administrador pode fazer isso.' };
  const msgErro = e => { const k = (e && (e.code || e.message) || '').split(':')[0].trim(); return ERROS[k] || ERROS[e && e.code] || 'Não foi possível concluir. Tente de novo.'; };

  async function carregar() {
    const s = st(); s.carregando = true;
    try { s.lista = (await Nuvem.rpc('esc_atestados_listar', {})) || []; s.erro = null; s.analiseOk = s.lista.some(a => 'confirmado_por' in a); }
    catch (e) { if (e.code === 'SESSAO_INVALIDA') return Nuvem.sair(true); s.erro = /Could not find the function/.test(e.message || '') ? 'O servidor ainda não recebeu esta atualização.' : msgErro(e); }
    s.carregando = false;
    if (UI.rota === 'atestados' || UI.rota === 'funcionarios') render();
  }

  /* ---------- situação de hoje, a partir do controle de VT (serve para todos os perfis) ---------- */
  const NOMES = { atestado: 'Atestado', afast: 'Afastado', suspensao: 'Suspenso' };
  function ausenciaEm(fid, dia) {
    const a = ((vtDoc(dia.slice(0, 7)).ajustes || {})[fid] || {})[dia];
    return a && NOMES[a.t] ? { t: a.t, nome: NOMES[a.t], ate: a.ate || null, atestadoId: a.atestadoId || null } : null;
  }

  /* ---------- impacto no vale-transporte (só para mostrar; o servidor só marca os dias) ---------- */
  function impactoVT(fid, ini, dias, ignorarId) {
    const f = funcPorId(fid); if (!f || !ini || !(dias > 0)) return null;
    const fim = fimDe(ini, dias), meses = [];
    for (let d = ini; d <= fim; d = C.addDias(d, 1)) if (!meses.includes(d.slice(0, 7))) meses.push(d.slice(0, 7));
    const out = { meses: [], reduz: 0, pagoAMais: 0, diasTrab: 0, fixo: false, semVT: true };
    meses.forEach(m => {
      const base = JSON.parse(JSON.stringify(vtDoc(m))); base.ajustes = base.ajustes || {};
      const meus = Object.assign({}, base.ajustes[fid] || {});
      if (ignorarId) Object.keys(meus).forEach(k => { if (String(meus[k].atestadoId) === String(ignorarId)) delete meus[k]; });
      const antes = Object.assign({}, base, { ajustes: Object.assign({}, base.ajustes, { [fid]: meus }) });
      const dep = JSON.parse(JSON.stringify(antes));
      for (let d = ini; d <= fim; d = C.addDias(d, 1)) if (d.slice(0, 7) === m) dep.ajustes[fid][d] = { t: 'atestado' };
      const la = C.calcularVT({ mes: m, funcionarios: [f], escalas: S.escalas, doc: antes }).linhas[0];
      const ld = C.calcularVT({ mes: m, funcionarios: [f], escalas: S.escalas, doc: dep }).linhas[0];
      if (!la || !ld) return;
      out.semVT = false; if (la.fixo) out.fixo = true;
      la.cel.forEach((c, i) => { if (c.d >= ini && c.d <= fim && c.tipo === 'trab') out.diasTrab++; });
      const qs = ['q1', 'q2'].map(q => {
        const a = la[q].valor, b = ld[q].valor, pago = la.pago[q], reducao = Math.max(0, Math.round((a - b) * 100) / 100);
        const aMais = pago > 0 ? Math.max(0, Math.round((pago - b) * 100) / 100) : 0;
        out.reduz += pago > 0 ? 0 : reducao; out.pagoAMais += aMais;
        return { q, antes: a, depois: b, pago, reducao, aMais };
      }).filter(x => x.reducao > 0 || x.aMais > 0);
      if (qs.length) out.meses.push({ mes: m, qs });
    });
    out.reduz = Math.round(out.reduz * 100) / 100; out.pagoAMais = Math.round(out.pagoAMais * 100) / 100;
    return out;
  }
  function impactoEscala(fid, ini, dias) {
    const f = funcPorId(fid), fim = fimDe(ini, dias); let trab = 0, folga = 0, semEsc = 0;
    for (let d = ini; d <= fim; d = C.addDias(d, 1)) {
      const e = S.escalas[C.inicioSemana(d)];
      if (!e) { semEsc++; continue; }
      const s2 = C.statusDia(e.atribuicoes ? e.atribuicoes[fid] : null, d, f, true);
      if (s2 === 'T' || s2 === 'X') trab++; else if (s2 === 'F') folga++;
    }
    return { trab, folga, semEsc };
  }

  /* ---------- telas ---------- */
  function vAtestados() {
    const s = st();
    if (S.modo !== 'nuvem') return '<h1>Atestados</h1><div class="card empty"><b>Disponível na versão online</b></div>';
    if (s.etapa === 'lendo') return cab() + `<div class="card ats-lendo"><div class="spin"></div><b>${s.loteTotal > 1 ? 'Lendo documento ' + s.loteAtual + ' de ' + s.loteTotal + '…' : 'Lendo o documento…'}</b><p class="muted small">${esc(s.progresso || 'Preparando')}</p><p class="small muted">Na primeira vez o aparelho baixa o leitor (cerca de 10 MB). A leitura é feita no próprio aparelho: o documento não vai para nenhum serviço de fora.</p></div>`;
    if (s.etapa === 'conferir') return cab() + telaConferir();
    if (s.etapa === 'feito') return cab() + telaFeito();
    if (s.etapa === 'lote') return cab() + telaLote();
    if (!s.lista && !s.carregando && !s.erro) carregar();
    return cab() + telaPainel() + `<div class="card ats-env">
      <div><b>Enviar atestados</b><p class="small muted" style="margin:4px 0 0">Foto ou PDF, um ou vários de uma vez. O sistema lê e prepara; você confere antes de salvar. O que não estiver legível fica em branco.</p></div>
      <div class="ats-env-bt"><label class="btn pri ats-file">${ic('plus')} Enviar fotos ou PDFs<input type="file" id="atsArquivo" accept="image/*,application/pdf" multiple hidden></label>
      <button class="btn sm" data-act="atsManual">Lançar sem documento</button></div></div>` + telaLista();
  }
  const cab = () => `<div class="orc-topo"><div><h2 style="margin:0">Atestados</h2><div class="small muted">Envie uma vez: escala, vale-transporte, painel e funcionários são atualizados juntos</div></div></div>`;

  // situação de cada atestado hoje
  const SIT = { analise: ['Em análise', 'b-warn'], andamento: ['Em andamento', 'b-err'], agendado: ['Começa em breve', 'b-blue'], encerrado: ['Encerrado', 'b-ok'], cancelado: ['Cancelado', 'b-off'] };
  function situacao(a, h0) {
    if (a.status === 'cancelado') return 'cancelado';
    if (a.status === 'analise') return 'analise';
    if (a.inicio > h0) return 'agendado';
    return a.fim < h0 ? 'encerrado' : 'andamento';
  }
  const proxRetorno = (a, h0) => a.status === 'ativo' && a.retorno >= h0 && a.retorno <= C.addDias(h0, 7);
  function telaPainel() {
    const s = st(); if (!s.lista) return '';
    const h0 = hoje(), L = s.lista;
    const n = { total: L.filter(a => a.status !== 'cancelado').length, analise: L.filter(a => a.status === 'analise').length,
      andamento: L.filter(a => situacao(a, h0) === 'andamento').length, encerrado: L.filter(a => situacao(a, h0) === 'encerrado').length, retornos: L.filter(a => proxRetorno(a, h0)).length };
    const ind = (k, v, l, cls) => `<button class="ctr-ind${s.filtro === k ? ' on' : ''}${cls ? ' ' + cls : ''}" data-act="atsFiltroSit" data-s="${k}"><b>${v}</b><span>${l}</span></button>`;
    return '<div class="ctr-inds ats-inds">' + ind('', n.total, 'Atestados') + ind('analise', n.analise, 'Em análise', n.analise ? 'alerta' : '') + ind('andamento', n.andamento, 'Afastamentos em andamento', n.andamento ? 'perigo' : '') +
      ind('encerrado', n.encerrado, 'Afastamentos encerrados') + ind('retornos', n.retornos, 'Retornos em 7 dias') + '</div>';
  }
  function telaLista() {
    const s = st();
    if (s.erro) return `<div class="alert e"><span class="ic">!</span><div>${esc(s.erro)} <a href="#" data-act="atsRecarregar">Tentar de novo</a></div></div>`;
    if (!s.lista) return '<div class="loading"><div class="spin"></div>Carregando atestados…</div>';
    const h0 = hoje(), txt = (s.busca || '').trim().toLowerCase(), fil = s.filtro || '';
    const lista = s.lista.filter(a => (!s.filtroFunc || a.func_id === s.filtroFunc) &&
      (!fil ? a.status !== 'cancelado' : fil === 'retornos' ? proxRetorno(a, h0) : situacao(a, h0) === fil) &&
      (!txt || [a.func_nome, a.cid, a.nome_doc, nomeSetor((funcPorId(a.func_id) || {}).setorId)].join(' ').toLowerCase().includes(txt)));
    const chips = [['', 'Todos'], ['analise', 'Em análise'], ['andamento', 'Em andamento'], ['agendado', 'Começam em breve'], ['retornos', 'Retornos'], ['encerrado', 'Encerrados'], ['cancelado', 'Cancelados']];
    let h = `<div class="orc-busca"><input type="search" id="atsBusca" placeholder="Pesquisar por funcionário, setor ou CID" value="${esc(s.busca || '')}" autocomplete="off"></div>
      <div class="orc-chips">${chips.map(c => `<button class="orc-chip${fil === c[0] ? ' on' : ''}" data-act="atsFiltroSit" data-s="${c[0]}">${c[1]}</button>`).join('')}</div>`;
    if (s.filtroFunc) h += `<div class="alert i"><span class="ic">i</span><div>Mostrando só <b>${esc((funcPorId(s.filtroFunc) || {}).nome || '')}</b>. <a href="#" data-act="atsFiltroFunc" data-f="">Ver todos</a></div></div>`;
    h += `<div class="orc-lista-h"><b>${fil || txt || s.filtroFunc ? 'Resultado' : 'Histórico'}</b><span class="small muted">${lista.length} atestado(s)</span></div>`;
    if (!s.lista.length) return h + '<div class="card empty"><b>Nenhum atestado lançado</b>Envie a foto ou o PDF do atestado acima.</div>';
    if (!lista.length) return h + '<div class="card"><p class="muted" style="margin:0">Nenhum atestado encontrado.</p></div>';
    return h + '<div class="orc-lista">' + lista.map(a => cartao(a, h0)).join('') + '</div>';
  }
  function cartao(a, h0) {
    const sit = situacao(a, h0), x = SIT[sit], f = funcPorId(a.func_id), setor = f ? nomeSetor(f.setorId) : '';
    const falta = a.status === 'analise' ? [!a.func_id && 'funcionário', !a.inicio && 'início', !a.dias && 'dias'].filter(Boolean) : [];
    return `<div class="orc-card ats-card ${sit}" data-ats="${a.id}"><div class="orc-card-l1"><span class="orc-num">${a.status === 'analise' ? 'Recebido ' + dtHora(a.enviado_em) : 'Atestado nº ' + a.id}${a.tem_arquivo ? ' · 📎 documento' : ''}</span><span class="badge ${x[1]}">${x[0]}</span></div>
      <div class="orc-card-l2"><b>${a.func_nome ? esc(a.func_nome) : '<span class="muted">Funcionário a identificar</span>'}</b>${a.dias ? `<span class="orc-val">${a.dias} dia${a.dias > 1 ? 's' : ''}</span>` : ''}</div>
      <div class="orc-desc">${setor ? esc(setor) + ' · ' : ''}${a.inicio ? br(a.inicio) + (a.dias ? ' a ' + br(a.fim) : '') : 'datas a conferir'}${a.retorno && a.status !== 'analise' ? ' · <b>volta ' + br(a.retorno) + '</b>' : ''}${a.cid ? ' · CID ' + esc(a.cid) : ''}</div>
      ${falta.length ? `<div class="small" style="color:#a16207;margin-top:3px">Falta conferir: ${falta.join(', ')}</div>` : ''}
      ${sit === 'cancelado' && a.motivo_cancelamento ? `<div class="small muted" style="margin-top:3px">Motivo: ${esc(a.motivo_cancelamento)}</div>` : ''}
      <div class="orc-card-bt ats-bt">${a.status === 'analise' ? `<button class="btn sm ok" data-act="atsCorrigir" data-id="${a.id}">Conferir e confirmar</button>` : ''}
        ${a.tem_arquivo ? `<button class="btn sm" data-act="atsVerDoc" data-id="${a.id}">Documento</button>` : ''}<button class="btn sm" data-act="atsDetalhes" data-id="${a.id}">Detalhes</button>
        ${a.status === 'ativo' ? `<button class="btn sm" data-act="atsCorrigir" data-id="${a.id}">Corrigir</button>` : ''}</div></div>`;
  }
  // detalhes: dados, trilha completa e ações
  function detalhes(id) {
    const s = st(), a = (s.lista || []).find(x => String(x.id) === String(id)); if (!a) return;
    const h0 = hoje(), x = SIT[situacao(a, h0)], f = funcPorId(a.func_id);
    const linha = (l, v) => v ? `<div><span class="small muted">${l}</span><div>${v}</div></div>` : '';
    const trilha = [
      ['Recebido', a.enviado_em, a.enviado_por], [a.status === 'analise' ? '' : 'Confirmado e lançado', a.confirmado_em || a.aprovado_em, a.confirmado_por || a.aprovado_por],
      ['Corrigido', a.corrigido_em, a.corrigido_por], ['Cancelado', a.cancelado_em, a.cancelado_por]].filter(t => t[0] && t[1]);
    const w = abrirModal(`<div class="mh">Atestado ${a.func_nome ? 'de ' + esc(a.func_nome) : ''} <span class="badge ${x[1]}" style="margin-left:6px">${x[0]}</span></div><div class="mbd">
      <div class="orc-info">${linha('Funcionário', a.func_nome ? esc(a.func_nome) : 'a identificar')}${linha('Setor', f ? esc(nomeSetor(f.setorId)) : '')}${linha('Emissão', a.emissao ? br(a.emissao) : '')}
        ${linha('Início', a.inicio ? br(a.inicio) : '')}${linha('Término', a.fim ? br(a.fim) : '')}${linha('Dias', a.dias ? String(a.dias) : '')}${linha('Retorno', a.retorno ? br(a.retorno) : '')}
        ${linha('CID', a.cid ? esc(a.cid) : 'não informado')}${linha('Nome lido no documento', a.nome_doc ? esc(a.nome_doc) : '')}${linha('Leitura', a.leitura_segura === true ? 'automática, conferida' : a.leitura_segura === false ? 'conferida manualmente' : '')}</div>
      ${a.obs ? `<p class="small" style="margin:10px 0 0">${esc(a.obs)}</p>` : ''}
      ${a.motivo_cancelamento ? `<p class="small" style="margin:10px 0 0"><b>Motivo do cancelamento:</b> ${esc(a.motivo_cancelamento)}</p>` : ''}
      <h3 style="margin:14px 0 4px">Histórico do documento</h3><ul class="list-sm">${trilha.map(t => `<li><span><b>${t[0]}</b> ${t[2] ? '· ' + esc(t[2]) : ''}</span><span class="small muted">${dtHora(t[1])}</span></li>`).join('')}</ul>
      <p class="small muted">Documento médico e CID: visíveis só para o administrador. Nenhum registro é apagado.</p></div>
      <div class="mf ats-det-bt">${a.func_id ? `<button class="btn sm" data-x="hist">Histórico de ${esc((a.func_nome || '').split(' ')[0])}</button>` : ''}${a.tem_arquivo ? '<button class="btn sm" data-x="doc">Ver documento</button>' : ''}
        ${a.status !== 'cancelado' ? '<button class="btn sm danger" data-x="canc">Cancelar</button>' : ''}<button class="btn sm pri" data-x="f">Fechar</button></div>`, true);
    w.addEventListener('click', ev => {
      const b = ev.target.closest('[data-x]'); if (!b) return;
      fecharModal(w);
      if (b.dataset.x === 'hist') historicoFunc(a.func_id);
      if (b.dataset.x === 'doc') verDoc(a.id);
      if (b.dataset.x === 'canc') cancelar(a.id);
    });
  }
  // histórico do funcionário: todos os atestados e afastamentos dele
  function historicoFunc(fid) {
    const s = st(), f = funcPorId(fid), L = (s.lista || []).filter(a => a.func_id === fid), h0 = hoje(), ano = h0.slice(0, 4);
    const diasAno = L.filter(a => a.status === 'ativo' && a.inicio && a.inicio.slice(0, 4) === ano).reduce((t, a) => t + (a.dias || 0), 0);
    const w = abrirModal(`<div class="mh">Histórico de ${esc(f ? f.nome : '')}</div><div class="mbd">
      <div class="orc-info">${[['Setor', f ? esc(nomeSetor(f.setorId)) : '—'], ['Atestados', String(L.filter(a => a.status !== 'cancelado').length)], ['Dias afastado em ' + ano, String(diasAno)], ['Situação hoje', (() => { const au = root.ausenciaEm && root.ausenciaEm(fid, h0); return au ? esc(au.nome) + (au.ate ? ' até ' + br(au.ate) : '') : 'Trabalhando / disponível'; })()]].map(z => `<div><span class="small muted">${z[0]}</span><div><b>${z[1]}</b></div></div>`).join('')}</div>
      <ul class="list-sm" style="margin-top:12px">${L.map(a => `<li><span><b>${a.inicio ? br(a.inicio) + (a.fim ? ' a ' + br(a.fim) : '') : 'datas a conferir'}</b><div class="small muted">${a.dias ? a.dias + ' dia(s) · ' : ''}${a.cid ? 'CID ' + esc(a.cid) + ' · ' : ''}${SIT[situacao(a, h0)][0]}</div></span><button class="btn sm" data-x="${a.id}">Detalhes</button></li>`).join('') || '<li class="muted">Nenhum atestado.</li>'}</ul></div>
      <div class="mf"><button class="btn" data-x="lista">Filtrar a lista por ${esc(f ? f.nome.split(' ')[0] : '')}</button><button class="btn pri" data-x="f">Fechar</button></div>`, true);
    w.addEventListener('click', ev => {
      const b = ev.target.closest('[data-x]'); if (!b) return;
      fecharModal(w);
      if (b.dataset.x === 'lista') { s.filtroFunc = fid; s.filtro = ''; render(); }
      else if (/^\d+$/.test(b.dataset.x)) detalhes(b.dataset.x);
    });
  }

  function telaConferir() {
    const s = st(), f = s.form, L = s.leitura;
    const funcs = S.funcionarios.slice().sort((a, b) => (b.ativo - a.ativo) || a.nome.localeCompare(b.nome));
    const ret = f.inicio && f.dias > 0 ? C.addDias(f.inicio, +f.dias) : '';
    const dv = c => s.duvidas && s.duvidas.includes(c) ? ' ats-dv' : '';
    const v = s.verif || {}, bloqueio = s.bloqueio;
    let h = '<div class="ats-conf">';
    if (L && L.previa) h += `<div class="card ats-doc"><img src="${L.previa}" alt="Atestado enviado" data-act="atsZoom" title="Toque para ampliar"><div class="small muted">${L.tipo === 'pdf' ? 'PDF' : 'Foto'} · leitura ${Math.round(L.confianca || 0)}% · <a href="#" data-act="atsZoom">🔍 ampliar a foto</a></div></div>`;
    h += '<div class="ats-campos">';
    if (s.loteIdx != null) h += `<div class="small muted">Documento ${s.loteIdx + 1} de ${s.lote.length}${s.lote[s.loteIdx].nome ? ' · ' + esc(s.lote[s.loteIdx].nome) : ''}</div>`;
    const ehAnal = s.corrigindo && ((s.lista || []).find(x => x.id === s.corrigindo) || {}).status === 'analise';
    if (ehAnal) h += `<div class="alert w"><span class="ic">!</span><div><b>Atestado em análise.</b> Confira os dados com o documento. Ao confirmar, a escala e o vale-transporte são atualizados.</div></div>`;
    else if (s.corrigindo) h += `<div class="alert i"><span class="ic">i</span><div>Corrigindo o atestado lançado. Ao salvar, o que foi lançado antes é desfeito e lançado de novo com os dados abaixo.</div></div>`;
    else if (L) h += L.dados.seguro && !(L.dados.avisos || []).length
      ? `<div class="alert s"><span class="ic">✓</span><div><b>Documento lido com segurança.</b> Confira e confirme.</div></div>`
      : `<div class="alert w"><span class="ic">!</span><div><b>Confira antes de lançar.</b><ul class="ats-av">${(L.dados.avisos || []).map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div></div>`;
    h += `<div class="card">
      <div class="fld${dv('func')}"><label class="f">Funcionário</label><select id="atsFunc"><option value="">Escolha…</option>${funcs.map(x => `<option value="${x.id}" ${x.id === f.func_id ? 'selected' : ''}>${esc(x.nome)}${x.ativo ? '' : ' (inativo)'} · ${esc(nomeSetor(x.setorId))}</option>`).join('')}</select>
        ${L && L.dados.nomeDoc ? `<div class="small muted" style="margin-top:4px">Nome no documento: <b>${esc(L.dados.nomeDoc)}</b></div>` : ''}</div>
      <div class="grid g2">
        <div class="fld${dv('emissao')}"><label class="f">Data de emissão</label><input type="date" id="atsEmissao" value="${f.emissao || ''}"></div>
        <div class="fld${dv('inicio')}"><label class="f">Início do afastamento</label><input type="date" id="atsInicio" value="${f.inicio || ''}"></div>
        <div class="fld${dv('dias')}"><label class="f">Quantidade de dias</label><input type="number" id="atsDias" min="1" max="365" inputmode="numeric" value="${f.dias || ''}"></div>
        <div class="fld"><label class="f">Retorno previsto</label><input type="text" value="${ret ? br(ret) + ' (' + C.DIAS[C.diaSemana(ret)].toLowerCase() + ')' : '—'}" disabled></div>
      </div>
      <div class="fld"><label class="f">CID <span class="small muted">(se estiver no documento; só o administrador vê)</span></label><input type="text" id="atsCid" value="${esc(f.cid || '')}" maxlength="12" autocapitalize="characters" placeholder="não informado"></div>
      <div class="fld"><label class="f">Observação <span class="small muted">(opcional)</span></label><input type="text" id="atsObs" value="${esc(f.obs || '')}" maxlength="300"></div>
    </div>`;
    // o que será lançado
    h += '<div class="card"><h3 style="margin:0 0 8px">O que será lançado</h3>';
    if (!f.func_id || !f.inicio || !(f.dias > 0)) h += '<p class="muted small" style="margin:0">Preencha funcionário, início e quantidade de dias.</p>';
    else {
      const fim = fimDe(f.inicio, +f.dias), ie = impactoEscala(f.func_id, f.inicio, +f.dias), iv = impactoVT(f.func_id, f.inicio, +f.dias, s.corrigindo);
      h += `<ul class="list-sm ats-dist">
        <li><span><b>Escala</b><div class="small muted">${br(f.inicio)} a ${br(fim)} marcados como <b>AT (atestado)</b>, sem contar como falta. ${ie.trab} dia(s) de trabalho previstos ficam cobertos pelo atestado${ie.semEsc ? ' · ' + ie.semEsc + ' dia(s) ainda sem escala gerada' : ''}. Volta em ${br(C.addDias(fim, 1))}.</div></span></li>
        <li><span><b>Vale-transporte</b><div class="small muted">${!iv || iv.semVT ? 'Sem vale-transporte cadastrado nesse período: nada muda no VT.' : (iv.reduz > 0 ? 'Deixa de pagar ' + R$(iv.reduz) + ' (dias sem deslocamento). ' : '') + (iv.pagoAMais > 0 ? '<b>' + R$(iv.pagoAMais) + ' já foram pagos</b> por esses dias: aparecem como saldo a descontar no VT, sem desconto em dobro. ' : '') + (iv.reduz <= 0 && iv.pagoAMais <= 0 ? 'Nenhum valor muda (os dias já não eram pagos). ' : '') + (iv.fixo ? 'Esta pessoa tem valor fixo por quinzena: confira o valor no VT.' : '')}${iv && iv.meses.length ? '<br>' + iv.meses.map(m => m.qs.map(q => (q.q === 'q1' ? '1ª' : '2ª') + ' quinzena de ' + m.mes.slice(5) + '/' + m.mes.slice(0, 4) + ': ' + R$(q.antes) + ' → ' + R$(q.depois) + (q.pago ? ' (pago ' + R$(q.pago) + ')' : '')).join('<br>')).join('<br>') : ''}</div></span></li>
        <li><span><b>Painel e funcionários</b><div class="small muted">Aparece em "Afastados" com a data de volta, e na situação do funcionário.</div></span></li>
        <li><span><b>Salário</b><div class="small muted">Atestado válido: nenhum desconto salarial é lançado pelos dias justificados.</div></span></li></ul>`;
      if (v.mesmo_arquivo) h += `<div class="alert e"><span class="ic">!</span><div>Este documento já foi lançado (${esc(v.mesmo_arquivo.func_nome)}, ${br(v.mesmo_arquivo.inicio)}).</div></div>`;
      if ((v.sobrepostos || []).length) h += `<div class="alert e"><span class="ic">!</span><div>Já existe atestado dessa pessoa nesse período: ${v.sobrepostos.map(x => br(x.inicio) + ' a ' + br(x.fim)).join(', ')}. ${v.sobrepostos.some(x => x.igual) ? 'É o mesmo período: provavelmente o mesmo atestado.' : 'Corrija o existente em vez de lançar outro.'}</div></div>`;
      if ((v.marcados || []).length) h += `<div class="alert i"><span class="ic">i</span><div>Já marcado nesses dias: ${v.marcados.map(x => br(x.data).slice(0, 5) + ' ' + ((C.VT_TIPOS[x.t] || {}).nome || x.t).toLowerCase()).join(', ')}. O atestado fica no lugar; se ele for cancelado, volta o que estava.</div></div>`;
    }
    h += '</div>';
    const emAnalise = s.corrigindo && ((s.lista || []).find(x => x.id === s.corrigindo) || {}).status === 'analise';
    h += `<div class="row ats-bts"><button class="btn" data-act="atsVoltar">${s.loteIdx != null ? 'Voltar à lista' : 'Cancelar'}</button>${s.analiseOk && (!s.corrigindo || emAnalise) ? `<button class="btn" data-act="atsAnalise" ${v.mesmo_arquivo ? 'disabled' : ''}>Guardar para conferir depois</button>` : ''}<button class="btn ok" data-act="atsConfirmar" ${bloqueio ? 'disabled' : ''}>${ic('check')} ${emAnalise ? 'Confirmar e lançar' : s.corrigindo ? 'Salvar correção' : 'Confirmar e lançar'}</button></div>`;
    return h + '</div></div>';
  }

  function telaFeito() {
    const s = st(), r = s.feito;
    return `<div class="card ats-feito"><div class="alert s" style="margin:0 0 12px"><span class="ic">✓</span><div><b>${s.feitoCorrecao ? 'Correção salva' : 'Atestado lançado'}.</b> ${esc(r.func_nome)} fica afastado(a) de ${br(r.inicio)} a ${br(r.fim)} e volta em ${br(r.retorno)}.</div></div>
      <ul class="list-sm">
        <li><span>Escala: ${r.dias} dia(s) marcados como <b>AT</b></span></li>
        <li><span>Vale-transporte: dias registrados como atestado${s.resumoVT ? ' · ' + esc(s.resumoVT) : ''}</span></li>
        <li><span>Painel: em "Afastados" até ${br(r.fim)}</span></li>
        <li><span>Histórico: registrado com o seu nome e o horário</span></li></ul>
      <div class="row mt"><a class="btn" href="#painel">Ver no painel</a><a class="btn" href="#vt">Ver no vale-transporte</a><a class="btn" href="#mensal" data-act="verSemana" data-sem="${C.inicioSemana(r.inicio)}">Ver na escala</a><button class="btn pri" data-act="atsLista">Voltar aos atestados</button></div></div>`;
  }

  /* ---------- vários documentos de uma vez ---------- */
  function itemPronto(it) { return it.status === 'pendente' && !it.bloqueio && !it.conflitoLote && it.L.dados.seguro && !(it.L.dados.avisos || []).length && !it.editado; }
  function situacaoItem(it) {
    if (it.status === 'lancado') return '<span class="badge b-ok">Lançado</span>';
    if (it.status === 'erro') return '<span class="badge b-err">Não lançado</span>';
    if (it.status === 'removido') return '<span class="badge b-off">Removido</span>';
    if (it.status === 'analise') return '<span class="badge b-warn">Em análise</span>';
    if (it.bloqueio || it.conflitoLote) return '<span class="badge b-err">Bloqueado</span>';
    return itemPronto(it) ? '<span class="badge b-ok">Pronto</span>' : '<span class="badge" style="background:#fff4d6;color:#a16207">Conferir</span>';
  }
  function motivoItem(it) {
    if (it.status === 'erro') return it.msg;
    if (it.status !== 'pendente') return '';
    const v = it.verif || {};
    if (v.mesmo_arquivo) return 'Este documento já foi lançado antes.';
    if ((v.sobrepostos || []).length) return 'Já existe atestado dessa pessoa nesse período.';
    if (it.conflitoLote) return it.conflitoLote;
    if (!it.form.func_id || !it.form.inicio || !it.form.dias) return 'Faltam dados: toque em Conferir e complete.';
    if (it.editado) return 'Você alterou os dados: confirme no Conferir.';
    if (!itemPronto(it)) return (it.L.dados.avisos || [])[0] || 'A leitura não ficou segura: confira.';
    return '';
  }
  function conflitosLote() {
    const s = st(), vistos = [];
    s.lote.forEach(it => {
      it.conflitoLote = '';
      if (it.status !== 'pendente') return;
      const f = it.form;
      for (const o of vistos) {
        if (o.L.hash === it.L.hash) { it.conflitoLote = 'Documento repetido nesta seleção.'; break; }
        if (f.func_id && f.func_id === o.form.func_id && f.inicio && o.form.inicio && f.dias && o.form.dias &&
            f.inicio <= fimDe(o.form.inicio, +o.form.dias) && fimDe(f.inicio, +f.dias) >= o.form.inicio) { it.conflitoLote = 'Outro documento desta seleção é da mesma pessoa no mesmo período.'; break; }
      }
      vistos.push(it);
    });
  }
  async function verificarItem(it) {
    const f = it.form;
    it.verif = null; it.bloqueio = false;
    if (!f.func_id || !f.inicio || !(f.dias >= 1 && f.dias <= 365)) return;
    try { it.verif = await Nuvem.rpc('esc_atestado_verificar', { p_func_id: f.func_id, p_inicio: f.inicio, p_dias: +f.dias, p_hash: it.L.hash, p_ignorar: null }); } catch (e) { it.verif = null; }
    it.bloqueio = !!(it.verif && (it.verif.mesmo_arquivo || (it.verif.sobrepostos || []).length));
  }
  function telaLote() {
    const s = st(), L = s.lote; conflitosLote();
    const prontos = L.filter(itemPronto).length, pend = L.filter(it => it.status === 'pendente').length, lanc = L.filter(it => it.status === 'lancado').length;
    let h = `<div class="card mb"><b>${L.length} documento(s) lidos</b><div class="small muted">${lanc ? lanc + ' lançado(s) · ' : ''}${prontos} pronto(s) para lançar${pend - prontos > 0 ? ' · ' + (pend - prontos) + ' para conferir' : ''}</div>
      <p class="small muted" style="margin:6px 0 0">"Pronto" = leitura segura, sem dúvidas e sem conflito. Os outros você abre em <b>Conferir</b>, ajusta e confirma um por um.</p>
      <div class="row mt ats-bts">${pend ? '<button class="btn" data-act="atsLoteSair">Sair sem lançar o resto</button>' + (s.analiseOk ? '<button class="btn" data-act="atsLoteAnalise">Guardar os demais em análise</button>' : '') : '<button class="btn pri" data-act="atsLoteSair">Concluir</button>'}${prontos ? `<button class="btn ok" data-act="atsLoteLancar">${ic('check')} Lançar os ${prontos} prontos</button>` : ''}</div></div>`;
    h += L.map((it, i) => {
      const f = it.form, fn = f.func_id ? (funcPorId(f.func_id) || {}).nome : '', mot = motivoItem(it);
      return `<div class="card mb ats-item${it.status === 'removido' ? ' off' : ''}"><div class="ats-it-h" style="gap:10px">
        ${it.L.previa ? `<img src="${it.L.previa}" alt="" data-act="atsZoom" data-i="${i}" style="width:56px;height:72px;object-fit:cover;border-radius:6px;border:1px solid var(--line);flex:0 0 auto">` : ''}
        <div style="flex:1;min-width:0"><b>${fn ? esc(fn) : '<span class="muted">Funcionário não identificado</span>'}</b>
          <div class="small muted">${f.inicio ? br(f.inicio) : '—'}${f.inicio && f.dias ? ' a ' + br(fimDe(f.inicio, +f.dias)) + ' · ' + f.dias + ' dia(s) · volta ' + br(C.addDias(f.inicio, +f.dias)) : ''}</div>
          ${mot ? `<div class="small" style="margin-top:3px;color:${it.status === 'erro' || it.bloqueio || it.conflitoLote ? '#b91c1c' : '#a16207'}">${esc(mot)}</div>` : ''}</div>${situacaoItem(it)}</div>
        ${it.status === 'pendente' ? `<div class="ats-acoes"><button class="btn sm" data-act="atsLoteConferir" data-i="${i}">${ic('edit')} Conferir</button><button class="btn sm" data-act="atsLoteRemover" data-i="${i}">Remover</button></div>` : ''}</div>`;
    }).join('');
    return h;
  }
  async function enviarVarios(files) {
    const s = st(); files = files.filter(f => f && f.size <= 15 * 1024 * 1024);
    if (!files.length) return toast('Arquivos muito grandes (máximo 15 MB cada).');
    Object.assign(s, { etapa: 'lendo', progresso: 'Abrindo os arquivos', corrigindo: null, leitura: null, verif: null, lote: [], loteIdx: null, loteTotal: files.length, loteAtual: 1 }); render();
    const funcs = S.funcionarios.map(f => ({ id: f.id, nome: f.nome, ativo: f.ativo }));
    for (let i = 0; i < files.length; i++) {
      s.loteAtual = i + 1; const tt = document.querySelector('.ats-lendo b'); if (tt) tt.textContent = 'Lendo documento ' + (i + 1) + ' de ' + files.length + '…';
      try {
        const L = await AtestLer.lerArquivo(files[i], funcs, hoje(), progressoLeitura);
        const it = Object.assign({ nome: files[i].name || '', L, status: 'pendente' }, prepararLeitura(L));
        await verificarItem(it); s.lote.push(it);
      } catch (e) { toast('Não deu para abrir ' + (files[i].name || 'um dos arquivos') + '.'); }
    }
    s.loteTotal = 0;
    if (!s.lote.length) { s.etapa = 'lista'; render(); return; }
    s.etapa = 'lote'; render(); window.scrollTo(0, 0);
  }
  async function lancarProntos(btn) {
    const s = st(); conflitosLote();
    const alvo = s.lote.filter(itemPronto); if (!alvo.length) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Lançando…'; }
    let ok = 0;
    for (const it of alvo) {
      try { it.res = await Nuvem.rpc('esc_atestado_salvar', { p: payload(it.form, it.L, null, false) }); it.status = 'lancado'; ok++; }
      catch (e) { if (e.code === 'SESSAO_INVALIDA') return Nuvem.sair(true); it.status = 'erro'; it.msg = msgErro(e); }
    }
    s.lista = null; await Nuvem.sincronizar().catch(() => {}); carregar();
    toast(ok + ' atestado(s) lançado(s).'); render(); window.scrollTo(0, 0); reverificarLote();
  }
  function reverificarLote() {
    const s = st(); if (!s.lote) return;
    Promise.all(s.lote.filter(it => it.status === 'pendente').map(verificarItem)).then(() => { if (s.etapa === 'lote') render(); });
  }
  function payload(f, L, corrigindo, alterado) {
    const p = Object.assign({}, f, { id: corrigindo || null, vt_resumo: impactoVT(f.func_id, f.inicio, +f.dias, corrigindo) });
    if (L && !L.guardado) Object.assign(p, { arquivo: L.arquivo, arquivo_tipo: L.tipo, arquivo_hash: L.hash, texto_lido: L.texto, confianca: L.confianca, nome_doc: L.dados.nomeDoc, leitura_segura: !!(L.dados.seguro && !alterado) });
    return p;
  }
  function voltarAoLote() {
    const s = st(), it = s.lote[s.loteIdx]; lerForm();
    if (it && it.status === 'pendente') { if (JSON.stringify(it.form) !== JSON.stringify(s.form)) it.editado = true; it.form = s.form; }
    Object.assign(s, { etapa: 'lote', loteIdx: null, leitura: null }); render(); window.scrollTo(0, 0);
    if (it) verificarItem(it).then(() => { if (s.etapa === 'lote') render(); });
  }

  /* foto em tela cheia, com zoom, para ler o que está escrito à mão */
  function ampliar(src) {
    if (!src) return;
    const ov = document.createElement('div'); ov.className = 'ats-zoom'; let z = 1;
    ov.innerHTML = `<div class="ats-zoom-area"><img src="${src}" alt="Atestado"></div>
      <div class="ats-zoom-bar"><button class="btn" data-z="-">−</button><button class="btn" data-z="+">+</button><button class="btn" data-z="r">Girar</button><button class="btn pri" data-z="x">Fechar</button></div>`;
    const img = ov.querySelector('img'); let rot = 0;
    const aplicar = () => { img.style.width = (z * 100) + '%'; img.style.transform = rot ? 'rotate(' + rot + 'deg)' : ''; };
    ov.addEventListener('click', ev => {
      const b = ev.target.closest('[data-z]'); if (!b) return;
      const k = b.dataset.z;
      if (k === 'x') return ov.remove();
      if (k === '+') z = Math.min(5, z + 0.75); if (k === '-') z = Math.max(1, z - 0.75); if (k === 'r') rot = (rot + 90) % 360;
      aplicar();
    });
    document.body.appendChild(ov); aplicar();
  }

  /* ---------- ações ---------- */
  function lerForm() {
    const s = st(), g = id => (document.getElementById(id) || {}).value;
    if (!document.getElementById('atsFunc')) return;
    s.form = { func_id: g('atsFunc') || '', emissao: g('atsEmissao') || '', inicio: g('atsInicio') || '', dias: g('atsDias') ? +g('atsDias') : '', cid: (g('atsCid') || '').trim().toUpperCase(), obs: (g('atsObs') || '').trim() };
  }
  async function verificar() {
    const s = st(), f = s.form;
    s.verif = null; s.bloqueio = !f.func_id || !f.inicio || !(f.dias >= 1 && f.dias <= 365);
    if (!s.bloqueio) {
      try { s.verif = await Nuvem.rpc('esc_atestado_verificar', { p_func_id: f.func_id, p_inicio: f.inicio, p_dias: +f.dias, p_hash: s.leitura ? s.leitura.hash : null, p_ignorar: s.corrigindo || null }); }
      catch (e) { s.verif = null; }
      s.bloqueio = !!(s.verif && (s.verif.mesmo_arquivo || (s.verif.sobrepostos || []).length));
    }
    if (UI.rota === 'atestados' && s.etapa === 'conferir') { const y = window.scrollY; render(); window.scrollTo(0, y); }
  }
  async function enviarArquivo(file) {
    const s = st();
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return toast('Arquivo muito grande (máximo 15 MB).');
    Object.assign(s, { etapa: 'lendo', progresso: 'Abrindo o arquivo', corrigindo: null, leitura: null, verif: null, loteTotal: 0, loteIdx: null }); render();
    let L;
    try {
      L = await AtestLer.lerArquivo(file, S.funcionarios.map(f => ({ id: f.id, nome: f.nome, ativo: f.ativo })), hoje(), progressoLeitura);
    } catch (e) { s.etapa = 'lista'; render(); return modalMsg('Não deu para abrir o arquivo', '<p>Envie uma foto (JPG ou PNG) ou um PDF do atestado.</p>'); }
    Object.assign(s, { etapa: 'conferir', leitura: L, loteIdx: null, duvidasAlteradas: false }, prepararLeitura(L));
    render(); verificar();
  }
  function progressoLeitura(status, p) {
    const s = st(), t = { 'loading tesseract core': 'Baixando o leitor', 'loading language traineddata': 'Baixando o idioma português', 'initializing api': 'Preparando o leitor', 'recognizing text': 'Lendo o texto' }[status] || 'Preparando';
    s.progresso = t + (p ? ' · ' + Math.round(p * 100) + '%' : '');
    const el = document.querySelector('.ats-lendo p'); if (el) el.textContent = s.progresso;
  }
  function prepararLeitura(L) {
    const d = L.dados, duv = [];
    if (!d.func) duv.push('func'); if (!d.inicio) duv.push('inicio'); if (!d.dias || d.campos.dias) duv.push('dias'); if (!d.emissao) duv.push('emissao');
    return { duvidas: duv, form: { func_id: d.func ? d.func.id : '', emissao: d.emissao || '', inicio: d.inicio || '', dias: d.dias || '', cid: d.cid || '', obs: '' } };
  }
  async function confirmarLancamento(btn) {
    const s = st(); lerForm(); const f = s.form;
    if (!f.func_id) return toast('Escolha o funcionário.');
    if (!f.inicio) return toast('Informe o início do afastamento.');
    if (!(f.dias >= 1 && f.dias <= 365)) return toast('Informe a quantidade de dias (1 a 365).');
    await verificar(); if (s.bloqueio) return toast('Resolva os avisos em vermelho antes de lançar.');
    const iv = impactoVT(f.func_id, f.inicio, +f.dias, s.corrigindo), L = s.leitura;
    const p = payload(f, L, s.corrigindo, s.duvidasAlteradas);
    const b = document.querySelector('[data-act="atsConfirmar"]'); if (b) { b.disabled = true; b.textContent = 'Lançando…'; }
    try {
      const r = await Nuvem.rpc('esc_atestado_salvar', { p });
      if (s.loteIdx != null) {
        const it = s.lote[s.loteIdx]; Object.assign(it, { status: 'lancado', res: r, form: f });
        Object.assign(s, { etapa: 'lote', loteIdx: null, leitura: null, lista: null });
        toast('Atestado de ' + r.func_nome + ' lançado.'); await Nuvem.sincronizar().catch(() => {}); render(); window.scrollTo(0, 0); carregar(); reverificarLote(); return;
      }
      Object.assign(s, { etapa: 'feito', filtro: '', feito: r, feitoCorrecao: !!s.corrigindo, resumoVT: iv && !iv.semVT ? (iv.reduz > 0 ? 'deixa de pagar ' + R$(iv.reduz) : '') + (iv.pagoAMais > 0 ? (iv.reduz > 0 ? ' · ' : '') + R$(iv.pagoAMais) + ' já pagos ficam como saldo a descontar' : '') : '', lista: null, leitura: null });
      await Nuvem.sincronizar().catch(() => {});
      render(); window.scrollTo(0, 0); carregar();
    } catch (e) {
      if (e.code === 'SESSAO_INVALIDA') return Nuvem.sair(true);
      if (b) { b.disabled = false; b.textContent = s.corrigindo ? 'Salvar correção' : 'Confirmar e lançar'; }
      modalMsg('Não foi lançado', '<p>' + esc(msgErro(e)) + '</p>');
    }
  }
  async function guardarAnalise(btn) {
    const s = st(); lerForm(); const f = s.form, L = s.leitura;
    const p = Object.assign(payload(f, L, s.corrigindo, s.duvidasAlteradas), { analise: true });
    if (btn) btn.disabled = true;
    try {
      const r = await Nuvem.rpc('esc_atestado_salvar', { p });
      if (s.loteIdx != null) { const it = s.lote[s.loteIdx]; Object.assign(it, { status: 'analise' }); Object.assign(s, { etapa: 'lote', loteIdx: null, leitura: null, lista: null }); }
      else Object.assign(s, { etapa: 'lista', leitura: null, corrigindo: null, lista: null, filtro: 'analise' });
      toast('Guardado em análise. Nada foi lançado na escala nem no VT ainda.'); render(); window.scrollTo(0, 0); carregar();
    } catch (e) { if (btn) btn.disabled = false; modalMsg('Não foi guardado', '<p>' + esc(msgErro(e)) + '</p>'); }
  }
  async function loteAnalise(btn) {
    const s = st(), alvo = s.lote.filter(it => it.status === 'pendente' && !(it.verif && it.verif.mesmo_arquivo) && !it.conflitoLote);
    if (!alvo.length) return; if (btn) btn.disabled = true;
    let ok = 0;
    for (const it of alvo) { try { await Nuvem.rpc('esc_atestado_salvar', { p: Object.assign(payload(it.form, it.L, null, true), { analise: true }) }); it.status = 'analise'; ok++; } catch (e) { it.status = 'erro'; it.msg = msgErro(e); } }
    s.lista = null; carregar(); toast(ok + ' documento(s) guardado(s) em análise.'); render();
  }
  async function verDoc(id) {
    let r; try { r = await Nuvem.rpc('esc_atestado_obter', { p_id: +id }); } catch (e) { return toast(msgErro(e)); }
    if (!r || !r.arquivo) return toast('Documento não encontrado.');
    if (/^data:application\/pdf/.test(r.arquivo)) {
      const b = await (await fetch(r.arquivo)).blob(), u = URL.createObjectURL(b), w = window.open(u, '_blank');
      if (!w) location.href = u; return;
    }
    abrirModal(`<div class="mh">Atestado arquivado</div><div class="mbd"><img src="${r.arquivo}" alt="Atestado" style="width:100%;border-radius:8px">${r.nome_doc ? `<p class="small muted">Nome lido no documento: ${esc(r.nome_doc)}</p>` : ''}<p class="small muted">Documento médico: visível só para o administrador.</p></div><div class="mf"><button class="btn" data-act="ajFechar">Fechar</button></div>`, true);
  }
  async function corrigir(id) {
    const s = st(), a = (s.lista || []).find(x => String(x.id) === String(id)); if (!a) return;
    const duv = a.status === 'analise' ? ['func', 'inicio', 'dias', 'emissao'].filter(k => !(k === 'func' ? a.func_id : a[k])) : [];
    Object.assign(s, { etapa: 'conferir', corrigindo: a.id, leitura: null, duvidas: duv, form: { func_id: a.func_id || '', emissao: a.emissao || '', inicio: a.inicio || '', dias: a.dias || '', cid: a.cid || '', obs: a.obs || '' } });
    render(); window.scrollTo(0, 0); verificar();
    if (a.tem_arquivo && a.arquivo_tipo !== 'pdf') {
      try { const r = await Nuvem.rpc('esc_atestado_obter', { p_id: +a.id }); if (r && r.arquivo && /^data:image/.test(r.arquivo) && s.corrigindo === a.id) { s.leitura = { previa: r.arquivo, tipo: 'foto', confianca: r.confianca || 0, guardado: true, dados: { avisos: [], nomeDoc: r.nome_doc, seguro: false } }; render(); } } catch (e) { }
    }
  }
  async function cancelar(id) {
    const s = st(), a = (s.lista || []).find(x => String(x.id) === String(id)); if (!a) return;
    const w = abrirModal(`<div class="mh">Cancelar atestado?</div><div class="mbd"><p>${esc(a.func_nome || 'Funcionário a identificar')}${a.inicio ? ', ' + br(a.inicio) + (a.fim ? ' a ' + br(a.fim) : '') : ''}.</p><p class="muted small">Os dias voltam a ser como estavam antes na escala e no vale-transporte. O documento continua arquivado.</p>
      <div class="fld"><label class="f">Motivo *</label><input type="text" id="atsMotivo" maxlength="200" placeholder="Ex.: lançado errado"></div></div>
      <div class="mf"><button class="btn" data-x="n">Voltar</button><button class="btn danger" data-x="s">Cancelar atestado</button></div>`);
    w.querySelector('[data-x=n]').onclick = () => fecharModal(w);
    w.querySelector('[data-x=s]').onclick = async () => {
      const motivo = w.querySelector('#atsMotivo').value.trim(); if (!motivo) { w.querySelector('#atsMotivo').focus(); return toast('Escreva o motivo do cancelamento.'); } fecharModal(w);
      try { await Nuvem.rpc('esc_atestado_cancelar', { p_id: +id, p_motivo: motivo }); toast('Atestado cancelado. Os dias voltaram ao que eram.'); await Nuvem.sincronizar().catch(() => {}); carregar(); }
      catch (e) { toast(msgErro(e)); }
    };
  }
  function acao(el, ev) {
    const act = el.dataset.act, s = st();
    switch (act) {
      case 'atsManual': Object.assign(s, { etapa: 'conferir', corrigindo: null, leitura: null, duvidas: [], verif: null, bloqueio: true, form: { func_id: '', emissao: '', inicio: '', dias: '', cid: '', obs: '' } }); render(); return;
      case 'atsVoltar': if (s.loteIdx != null) return voltarAoLote(); // eslint-disable-line no-fallthrough
      case 'atsLista': Object.assign(s, { etapa: 'lista', leitura: null, corrigindo: null }); render(); window.scrollTo(0, 0); return;
      case 'atsConfirmar': return confirmarLancamento(el);
      case 'atsAnalise': return guardarAnalise(el);
      case 'atsLoteAnalise': return loteAnalise(el);
      case 'atsDetalhes': return detalhes(el.dataset.id);
      case 'atsFiltroSit': s.filtro = el.dataset.s || ''; render(); return;
      case 'atsFiltroFunc': if (ev) ev.preventDefault(); s.filtroFunc = el.dataset.f || ''; render(); return;
      case 'atsZoom': { if (ev) ev.preventDefault(); const it = el.dataset.i != null && s.lote ? s.lote[+el.dataset.i] : null; return ampliar(it ? it.L.previa : s.leitura && s.leitura.previa); }
      case 'atsLoteLancar': return lancarProntos(el);
      case 'atsLoteConferir': { const it = s.lote[+el.dataset.i]; if (!it) return; Object.assign(s, { etapa: 'conferir', loteIdx: +el.dataset.i, leitura: it.L, form: Object.assign({}, it.form), duvidas: it.duvidas, duvidasAlteradas: !!it.editado, corrigindo: null, verif: it.verif, bloqueio: it.bloqueio }); render(); window.scrollTo(0, 0); verificar(); return; }
      case 'atsLoteRemover': { const it = s.lote[+el.dataset.i]; if (it) it.status = 'removido'; render(); return; }
      case 'atsLoteSair': { const resta = s.lote.filter(it => it.status === 'pendente').length; const sair = () => { Object.assign(s, { etapa: 'lista', lote: null, loteIdx: null }); render(); window.scrollTo(0, 0); };
        if (!resta) return sair(); return confirmar('Sair da lista?', `<p>${resta} documento(s) ainda não foram lançados e serão descartados desta lista.</p>`, 'Sair').then(ok => { if (ok) sair(); }); }
      case 'atsVerDoc': return verDoc(el.dataset.id);
      case 'atsCorrigir': return corrigir(el.dataset.id);
      case 'atsCancelar': return cancelar(el.dataset.id);
      case 'atsRecarregar': ev.preventDefault(); s.erro = null; s.lista = null; render(); return;
    }
  }
  let buscaT = null;
  document.addEventListener('input', ev => {
    if (!ev.target || ev.target.id !== 'atsBusca') return;
    st().busca = ev.target.value; window.__svcT = Date.now(); clearTimeout(buscaT);
    buscaT = setTimeout(() => { const p = ev.target.selectionStart; render(); const n = document.getElementById('atsBusca'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (e) { } } }, 250);
  });
  document.addEventListener('change', ev => {
    const t = ev.target; if (!t || UI.rota !== 'atestados') return;
    if (t.id === 'atsArquivo') { const fs = Array.from(t.files || []); t.value = ''; return fs.length > 1 ? enviarVarios(fs) : enviarArquivo(fs[0]); }
    if (t.id === 'atsFiltro') { st().filtroFunc = t.value; return render(); }
    if (/^ats(Func|Emissao|Inicio|Dias|Cid|Obs)$/.test(t.id)) { const s = st(); lerForm(); if (s.leitura) s.duvidasAlteradas = true; if (t.id !== 'atsCid' && t.id !== 'atsObs') verificar(); else { const y = window.scrollY; render(); window.scrollTo(0, y); } }
  });

  Object.assign(root, { vAtestados, atsAcao: acao, atsCarregar: carregar, ausenciaEm, atsImpactoVT: impactoVT, atsHistoricoFunc: id => { const s = st(); if (!s.lista) { carregar().then(() => historicoFunc(id)); return; } historicoFunc(id); } });
})(window);
