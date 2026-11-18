/* =====================================================================
   CADASTRO PELO FUNCIONÁRIO — link enviado pelo WhatsApp
   · Público (sem login): #cadastro=CÓDIGO. O funcionário preenche os próprios dados pessoais.
   · Administrador: gera o link na ficha, confere o que chegou (campo a campo) e aplica só o que marcar.
   Salário, setor, função, vínculo, VT, dados de pagamento e desligamento NUNCA são preenchidos aqui.
   ===================================================================== */
(function (root) {
  'use strict';
  const HOTEL = 'Hotel Fazenda Oasis';
  const COD_RE = /^#cadastro=([0-9a-f]{16,64})$/i;
  const codigoDaUrl = () => { const m = COD_RE.exec(location.hash || ''); return m ? m[1].toLowerCase() : null; };
  const soDig = s => String(s || '').replace(/\D/g, '');
  const primeiro = n => String(n || '').trim().split(/\s+/)[0] || '';
  const fmtCpf = d => { d = soDig(d); return d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d; };
  const cpfOk = c => {
    c = soDig(c); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    let s = 0, r; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i); r = (s * 10) % 11 % 10; if (r !== +c[9]) return false;
    s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i); r = (s * 10) % 11 % 10; return r === +c[10];
  };
  const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const ERROS = {
    CODIGO_INVALIDO: 'Este link não vale mais. Peça um novo link ao hotel.',
    CPF_INVALIDO: 'CPF inválido. Confira os números.',
    PIS_INVALIDO: 'PIS/NIS inválido. Confira os números.',
    DATA_INVALIDA: 'Data de nascimento inválida.',
    DADOS_INVALIDOS: 'Não foi possível enviar. Atualize a página e tente de novo.',
    SEM_CONEXAO: 'Sem conexão com o sistema. Tente de novo em instantes.',
    SESSAO_INVALIDA: 'Sua sessão de administrador expirou. Entre de novo.',
    SEM_PERMISSAO: 'Você não tem permissão para esta ação.',
    FUNCIONARIO_INVALIDO: 'Funcionário não encontrado.',
    SEM_ENVIO: 'Este cadastro já foi conferido ou mudou. Atualize a lista.',
  };
  const msgErro = e => ERROS[e && (e.code || e.message)] || ('Algo deu errado: ' + ((e && (e.message || e.code)) || 'tente de novo') + '.');

  /* ---------------- público ---------------- */
  let codigoAtual = null;
  function ehPublico() { return !!codigoDaUrl(); }
  function campo(lbl, name, val, extra, tipo) {
    tipo = tipo || 'text';
    return `<div class="fld"><label class="f" for="c_${name}">${lbl}</label><input id="c_${name}" name="${name}" type="${tipo}" value="${escHtml(val || '')}"${extra || ''}></div>`;
  }
  function formPublico(estado, nome, enviadoEm) {
    const ja = estado === 'enviado' ? `<div class="alert ok" style="margin-bottom:12px"><span class="ic">✓</span><div>Você já enviou seus dados${enviadoEm ? ' em ' + new Date(enviadoEm).toLocaleDateString('pt-BR') : ''}. Se precisar corrigir algo, é só preencher e enviar de novo.</div></div>` : '';
    const em = (n) => `<div class="ctr-grade">${campo('Nome do contato ' + n, 'em' + n + '_nome', '', ' autocomplete="off"')}${campo('Parentesco', 'em' + n + '_par', '', ' autocomplete="off"')}${campo('Telefone', 'em' + n + '_tel', '', ' inputmode="tel"')}</div>`;
    return `<div class="cad-wrap">
      <div class="cad-topo"><b>${HOTEL}</b><span>Cadastro de funcionário</span></div>
      <div class="card">
        <h1 style="margin:0 0 6px;font-size:22px">${nome ? 'Olá, ' + escHtml(nome) + '!' : 'Olá!'}</h1>
        <p class="muted" style="margin:0 0 14px">Preencha seus dados abaixo. Eles são usados só pelo hotel para o seu cadastro e para as obrigações do trabalho. Ao final, o hotel confere tudo.</p>
        ${ja}
        <form id="cadForm" novalidate>
          ${campo('Nome completo *', 'nome', '', ' autocomplete="name" required')}
          <div class="ctr-grade">
            ${campo('CPF', 'cpf', '', ' inputmode="numeric" autocomplete="off"')}
            ${campo('RG', 'rg', '', ' autocomplete="off"')}
            ${campo('Data de nascimento', 'nascimento', '', '', 'date')}
            ${campo('Telefone (WhatsApp)', 'telefone', '', ' inputmode="tel" autocomplete="tel"')}
            ${campo('E-mail', 'email', '', ' inputmode="email" autocomplete="email"')}
          </div>
          <div class="fld"><label class="f" for="c_endereco">Endereço completo</label><textarea id="c_endereco" name="endereco" rows="2"></textarea></div>
          <div class="ctr-grade">
            ${campo('Nome da mãe', 'mae', '', ' autocomplete="off"')}
            ${campo('Nome do pai', 'pai', '', ' autocomplete="off"')}
            ${campo('PIS/NIS', 'pis', '', ' inputmode="numeric"')}
            ${campo('CTPS (número e série)', 'ctps', '', ' autocomplete="off"')}
          </div>
          <div class="fld"><label class="f" for="c_escolaridade">Escolaridade</label>
            <select id="c_escolaridade" name="escolaridade" style="width:100%">
              <option value="">Selecione</option>
              ${['Fundamental incompleto', 'Fundamental completo', 'Médio incompleto', 'Médio completo', 'Superior incompleto', 'Superior completo', 'Pós-graduação'].map(x => `<option>${x}</option>`).join('')}
            </select></div>
          <h3 style="margin:18px 0 4px">Quem avisar em uma emergência</h3>
          <p class="small muted" style="margin:0 0 8px">Pelo menos uma pessoa.</p>
          ${em(1)}${em(2)}
          <div id="cadErro" class="alert e" style="display:none;margin-top:12px"><span class="ic">!</span><div id="cadErroTxt"></div></div>
          <button class="btn pri cad-enviar" type="submit" style="width:100%;margin-top:16px;min-height:48px">Enviar meus dados</button>
        </form>
        <p class="small muted" style="margin:12px 0 0">Os dados ficam guardados com segurança e só o administrador do hotel tem acesso.</p>
      </div></div>`;
  }
  function telaFinal(nome) {
    return `<div class="cad-wrap"><div class="cad-topo"><b>${HOTEL}</b><span>Cadastro de funcionário</span></div>
      <div class="card" style="text-align:center;padding:28px 18px">
        <div style="font-size:44px;line-height:1">✓</div>
        <h1 style="font-size:22px;margin:8px 0">Recebido${nome ? ', ' + escHtml(nome) : ''}!</h1>
        <p class="muted" style="margin:0">O hotel vai conferir os seus dados. Você não precisa fazer mais nada agora.</p>
        <p class="small muted" style="margin:12px 0 0">Se precisar corrigir, peça um novo link ao hotel.</p>
      </div></div>`;
  }
  function telaInvalida(texto) {
    return `<div class="cad-wrap"><div class="cad-topo"><b>${HOTEL}</b><span>Cadastro de funcionário</span></div>
      <div class="card" style="text-align:center;padding:28px 18px"><h1 style="font-size:20px;margin:0 0 8px">Link indisponível</h1>
      <p class="muted" style="margin:0">${escHtml(texto)}</p></div></div>`;
  }
  function montar(html) {
    document.body.className = 'cad-pub';
    document.body.innerHTML = `<div id="app" hidden></div><div id="side" hidden></div><main class="cad-main">${html}</main>`;
  }
  function lerCampos(form) {
    const v = n => (form.querySelector('[name="' + n + '"]') || { value: '' }).value.trim();
    const emergencia = [1, 2].map(i => ({ nome: v('em' + i + '_nome'), parentesco: v('em' + i + '_par'), telefone: v('em' + i + '_tel') })).filter(x => x.nome || x.telefone);
    return { nome: v('nome'), cpf: v('cpf'), rg: v('rg'), nascimento: v('nascimento'), telefone: v('telefone'), email: v('email'),
      endereco: v('endereco'), mae: v('mae'), pai: v('pai'), pis: v('pis'), ctps: v('ctps'), escolaridade: v('escolaridade'), emergencia };
  }
  function validarCampos(d) {
    if (!d.nome || d.nome.split(/\s+/).length < 2) return 'Informe o nome completo (nome e sobrenome).';
    if (d.cpf && !cpfOk(d.cpf)) return 'CPF inválido. Confira os números.';
    if (d.telefone && soDig(d.telefone).length < 10) return 'Telefone incompleto. Informe com DDD.';
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return 'E-mail inválido.';
    if (!d.emergencia.length) return 'Informe pelo menos uma pessoa para avisar em emergência.';
    return null;
  }
  async function publico() {
    codigoAtual = codigoDaUrl();
    montar('<div class="cad-wrap"><div class="card" style="text-align:center"><p class="muted">Carregando…</p></div></div>');
    let info;
    try { info = await Nuvem.rpc('rh_cadastro_ver', { p_codigo: codigoAtual }, true); }
    catch (e) { montar(telaInvalida(e.code === 'SEM_CONEXAO' ? 'Sem conexão com o sistema. Atualize a página em instantes.' : ERROS.CODIGO_INVALIDO)); return; }
    montar(formPublico(info.estado, info.nome, info.enviado_em));
    const form = document.getElementById('cadForm');
    form.cpf.addEventListener('input', () => { const p = form.cpf.selectionStart; form.cpf.value = fmtCpf(form.cpf.value); });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const d = lerCampos(form), erro = validarCampos(d), box = document.getElementById('cadErro'), btn = form.querySelector('.cad-enviar');
      const mostrar = t => { document.getElementById('cadErroTxt').textContent = t; box.style.display = t ? 'flex' : 'none'; };
      if (erro) { mostrar(erro); box.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      mostrar('');
      btn.disabled = true; btn.textContent = 'Enviando…';
      try {
        await Nuvem.rpc('rh_cadastro_enviar', { p_codigo: codigoAtual, p_dados: Object.assign({}, d, { cpf: soDig(d.cpf), pis: soDig(d.pis), telefone: soDig(d.telefone) }) }, true);
        montar(telaFinal(primeiro(d.nome)));
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Enviar meus dados';
        mostrar(msgErro(e));
      }
    });
  }

  /* ---------------- administrador ---------------- */
  let pendentes = null, carregando = false;
  function contagem() {
    if (pendentes === null && !carregando && typeof Nuvem !== 'undefined' && S.modo === 'nuvem') carregarLista(true);
    return pendentes;
  }
  async function carregarLista(silencioso) {
    if (carregando) return null;
    carregando = true;
    try {
      const lista = await Nuvem.rpc('rh_cadastros_listar', {});
      carregando = false;
      pendentes = (lista || []).filter(x => x.status === 'enviado').length;
      if (typeof UI !== 'undefined' && UI.rota === 'funcionarios' && typeof render === 'function') render();
      return lista || [];
    } catch (e) {
      carregando = false;
      pendentes = pendentes || 0;
      return null;
    }
  }
  function barra() {
    const n = contagem();
    if (!n) return '';
    return `<div class="alert ok rh-cad-barra" style="margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="ic">!</span><div style="flex:1;min-width:180px"><b>${n} cadastro${n > 1 ? 's' : ''} para conferir</b><div class="small muted">Funcionários preencheram os próprios dados.</div></div>
      <button class="btn pri" data-act="rhCadRevisar">Conferir</button></div>`;
  }
  async function gerarLink(id) {
    const f = S.funcionarios.find(x => x.id === id);
    if (!f) return;
    let r;
    try { r = await Nuvem.rpc('rh_cadastro_gerar', { p_funcionario_id: id }); }
    catch (e) { return toast(msgErro(e)); }
    const url = location.origin + location.pathname + '#cadastro=' + r.codigo;
    const tel = soDig(f.telefone), nums = tel ? (tel.length <= 11 ? '55' + tel : tel) : '';
    const texto = 'Olá, ' + primeiro(f.nome) + '! Para o seu cadastro no ' + ((S.config && S.config.nomeHotel) || HOTEL) + ', preencha os seus dados neste link (leva uns 5 minutos):\n' + url + '\n\nO link vale 7 dias.';
    const w = abrirModal(`<div class="mh">Link de cadastro — ${escHtml(primeiro(f.nome))}</div><div class="mbd">
      <p class="small muted" style="margin:0 0 8px">Mande pelo WhatsApp. Ele preenche no próprio celular, sem precisar de senha. Você confere depois.</p>
      <div class="fld"><label class="f">Link</label><input type="text" id="cadLink" readonly value="${escHtml(url)}" style="width:100%"></div>
      <div class="fld"><label class="f">Mensagem</label><textarea id="cadTexto" rows="5" style="width:100%">${escHtml(texto)}</textarea></div>
      <p class="small muted">Vale até ${new Date(r.expira).toLocaleDateString('pt-BR')}. Gerar um novo link desativa este.</p>
      </div><div class="mf"><button class="btn" data-x="c">Fechar</button><button class="btn" data-x="cp">Copiar link</button><a class="btn wa" id="cadWa" href="https://wa.me/${nums}?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a></div>`);
    const ta = w.querySelector('#cadTexto'), wa = w.querySelector('#cadWa');
    ta.addEventListener('input', () => { wa.href = 'https://wa.me/' + nums + '?text=' + encodeURIComponent(ta.value); });
    w.querySelector('[data-x=c]').onclick = () => fecharModal(w);
    w.querySelector('[data-x=cp]').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copiado.'); } catch (e) { w.querySelector('#cadLink').select(); toast('Copie o link selecionado.'); } };
    pendentes = null; carregarLista(true);
  }

  const CAMPOS = [
    ['nome', 'Nome completo', (f) => f.nome, 'func'],
    ['telefone', 'Telefone (WhatsApp)', (f) => f.telefone, 'func'],
    ['email', 'E-mail', (f, r) => (r.pessoais || {}).email, 'pessoais'],
    ['nascimento', 'Nascimento', (f, r) => (r.pessoais || {}).nascimento, 'pessoais'],
    ['cpf', 'CPF', (f, r) => fmtCpf((r.pessoais || {}).cpf), 'pessoais'],
    ['rg', 'RG', (f, r) => (r.pessoais || {}).rg, 'pessoais'],
    ['endereco', 'Endereço', (f, r) => (r.pessoais || {}).endereco, 'pessoais'],
    ['mae', 'Nome da mãe', (f, r) => (r.pessoais || {}).mae, 'pessoais'],
    ['pai', 'Nome do pai', (f, r) => (r.pessoais || {}).pai, 'pessoais'],
    ['pis', 'PIS/NIS', (f, r) => (r.profissionais || {}).pis, 'profissionais'],
    ['ctps', 'CTPS', (f, r) => (r.profissionais || {}).ctps, 'profissionais'],
    ['escolaridade', 'Escolaridade', (f, r) => (r.profissionais || {}).escolaridade, 'profissionais'],
    ['emergencia', 'Contatos de emergência', (f, r) => (r.emergencia || []).map(c => [c.nome, c.parentesco, c.telefone].filter(Boolean).join(' · ')).join(' | '), 'emergencia'],
  ];
  const mostra = v => Array.isArray(v) ? v.map(e => [e.nome, e.parentesco, e.telefone].filter(Boolean).join(' · ')).join(' | ') : (v == null ? '' : String(v));
  function linhasComparacao(item, f, r) {
    const d = item.dados || {};
    const enviado = (k) => k === 'cpf' ? fmtCpf(d.cpf) : k === 'pis' ? d.pis || '' : k === 'emergencia' ? mostra(d.emergencia) : (d[k] || '');
    return CAMPOS.map(([k, lbl, atual]) => {
      const novo = enviado(k), cur = mostra(atual(f, r));
      if (!novo) return '';
      const mudou = novo !== cur;
      return `<label class="cad-linha${mudou ? ' mudou' : ''}"><input type="checkbox" class="cadCh" value="${k}"${mudou ? ' checked' : ''}>
        <div style="flex:1;min-width:0"><div class="small muted">${lbl}${mudou ? '' : ' · igual ao cadastro'}</div>
        <div class="cad-atual">${cur ? 'Atual: ' + escHtml(cur) : 'Atual: —'}</div>
        <div class="cad-novo"><b>Enviado:</b> ${escHtml(novo)}</div></div></label>`;
    }).join('');
  }
  async function revisar() {
    const lista = await carregarLista(true);
    if (lista === null) return toast('Não foi possível carregar os cadastros. Verifique a conexão.');
    const envios = lista.filter(x => x.status === 'enviado'), links = lista.filter(x => x.status === 'pendente');
    let corpo = '';
    if (!envios.length) corpo += '<p class="muted">Nenhum cadastro enviado para conferir.</p>';
    envios.forEach(item => {
      const f = S.funcionarios.find(x => x.id === item.funcionario_id) || {};
      const r = (S.rh && S.rh[item.funcionario_id]) || {};
      corpo += `<div class="card mb cad-item" data-id="${item.id}" data-fid="${item.funcionario_id}">
        <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px"><b>${escHtml(item.nome || f.nome || '')}</b><span class="small muted">Enviado em ${item.enviado_em ? new Date(item.enviado_em).toLocaleDateString('pt-BR') : '—'}</span></div>
        <p class="small muted" style="margin:4px 0 8px">Marque o que deve entrar na ficha. Os campos que mudaram já vêm marcados.</p>
        ${linhasComparacao(item, f, r)}
        <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn pri" data-cad="aprovar" data-id="${item.id}">Aplicar na ficha</button>
          <button class="btn danger" data-cad="recusar" data-id="${item.id}">Recusar</button></div></div>`;
    });
    if (links.length) corpo += '<h3 style="margin:14px 0 6px">Links ainda não preenchidos</h3>' + links.map(x => `<div class="small" style="padding:6px 0;border-bottom:1px solid var(--line)"><b>${escHtml(x.nome || '')}</b> · vence em ${new Date(x.expira).toLocaleDateString('pt-BR')}</div>`).join('');
    const w = abrirModal(`<div class="mh">Cadastros para conferir</div><div class="mbd cad-lista">${corpo}</div><div class="mf"><button class="btn" data-x="c">Fechar</button></div>`, true);
    w.querySelector('[data-x=c]').onclick = () => fecharModal(w);
    w.querySelectorAll('[data-cad]').forEach(b => b.onclick = () => {
      const item = lista.find(x => String(x.id) === b.dataset.id); if (!item) return;
      if (b.dataset.cad === 'aprovar') aplicar(item, w, b);
      else recusar(item, w, b);
    });
  }
  async function aplicar(item, w, btn) {
    const f = S.funcionarios.find(x => x.id === item.funcionario_id);
    if (!f) return toast('Funcionário não encontrado no cadastro.');
    const card = btn.closest('.cad-item');
    const marcados = [...card.querySelectorAll('.cadCh:checked')].map(x => x.value);
    if (!marcados.length) return toast('Marque pelo menos um campo para aplicar.');
    const d = item.dados || {};
    if (marcados.includes('cpf') && d.cpf) {
      const dup = S.funcionarios.find(x => x.id !== f.id && soDig((((S.rh || {})[x.id] || {}).pessoais || {}).cpf) === d.cpf);
      if (dup) return toast('Este CPF já está no cadastro de ' + dup.nome + '. Confira antes de aplicar.');
    }
    btn.disabled = true;
    try {
      const r = Object.assign({}, (S.rh && S.rh[f.id]) || {});
      const pes = Object.assign({}, r.pessoais), pro = Object.assign({}, r.profissionais);
      const pesKeys = ['email', 'nascimento', 'cpf', 'rg', 'endereco', 'mae', 'pai'];
      marcados.forEach(k => {
        if (pesKeys.includes(k)) pes[k] = k === 'cpf' ? d.cpf : (d[k] || '');
        if (k === 'pis' || k === 'ctps' || k === 'escolaridade') pro[k] = d[k] || '';
      });
      if (marcados.includes('emergencia')) r.emergencia = d.emergencia || [];
      const agora = new Date().toISOString();
      await Store.set('rh', f.id, Object.assign({}, r, { pessoais: pes, profissionais: pro, atualizadoEm: agora }));
      if (marcados.includes('nome') || marcados.includes('telefone')) {
        await Store.set('funcionarios', f.id, Object.assign({}, f, {
          nome: marcados.includes('nome') ? d.nome : f.nome,
          telefone: marcados.includes('telefone') ? (d.telefone || '') : f.telefone,
          atualizadoEm: agora }));
      }
      await Nuvem.rpc('rh_cadastro_decidir', { p_id: item.id, p_acao: 'aprovar' });
      log('rh', 'Cadastro conferido e aplicado: ' + f.nome);
      fecharModal(w); toast('Dados aplicados na ficha de ' + primeiro(f.nome) + '.');
      pendentes = null; carregarLista(true);
    } catch (e) {
      btn.disabled = false;
      toast(msgErro(e));
    }
  }
  async function recusar(item, w, btn) {
    if (!await confirmar('Recusar este cadastro?', '<p>Os dados enviados serão descartados e a ficha não muda. Você pode gerar um novo link depois.</p>', 'Recusar', true)) return;
    btn.disabled = true;
    try {
      await Nuvem.rpc('rh_cadastro_decidir', { p_id: item.id, p_acao: 'recusar' });
      fecharModal(w); toast('Cadastro recusado.');
      pendentes = null; carregarLista(true);
    } catch (e) { btn.disabled = false; toast(msgErro(e)); }
  }

  root.CAD = { ehPublico, publico, barra, gerarLink, revisar, contagem };
})(window);
