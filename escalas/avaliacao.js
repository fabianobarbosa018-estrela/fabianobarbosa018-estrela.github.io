/* ===================== AVALIAÇÃO DE FUNCIONÁRIOS =====================
   Aba separada do vale-transporte. Quem tem a permissão "avaliacao" registra ocorrências
   negativas e vê a lista de registros SEM autoria dos colegas.
   Só o administrador vê quem registrou e a pontuação/ranking (para a bonificação).
   Quem manda é o servidor (sql/avaliacao.sql): esta tela só mostra o que o servidor entrega. */
(function () {
  const TIPOS = [
    { id: 'falta_injustificada', nome: 'Falta injustificada', pontos: 50 },
    { id: 'atraso', nome: 'Atraso', pontos: 20 },
    { id: 'esquecimento_ponto', nome: 'Esqueceu o ponto', pontos: 3 },
    { id: 'tarefa_nao_realizada', nome: 'Tarefa não realizada', pontos: 10 },
  ];
  const TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t]));
  const INICIAL = 100;
  const AV = { carregado: false, carregando: false, erro: null, func: [], setores: [], registros: [], mes: null, aba: 'registrar', msg: null, msgErro: false, enviando: false };

  const mesAgora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Recife' }).slice(0, 7);
  const dataHora = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { timeZone: 'America/Recife', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const mesNome = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][m - 1] + ' de ' + y;
  };
  const agoraLocalRecife = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Recife' }).replace(' ', 'T').slice(0, 16);
  const soAdmin = () => ehAdmin();
  const novoUuid = () => (crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
        return (c === 'x' ? r : ((r & 3) | 8)).toString(16);
      }));

  function erroAmigavel(e) {
    const m = (e && e.message) || '';
    if (/SEM_PERMISSAO/.test(m)) return 'Você não tem permissão para esta ação.';
    if (/FUNCIONARIO_INVALIDO/.test(m)) return 'Este funcionário não está disponível para avaliação.';
    if (/TIPO_INVALIDO/.test(m)) return 'Escolha um dos tipos de ocorrência da lista.';
    if (/DESCRICAO_INVALIDA/.test(m)) return 'A descrição precisa ter entre 10 e 1000 caracteres.';
    if (/DATA_INVALIDA/.test(m)) return 'Informe uma data e horário válidos (não pode ser no futuro).';
    if (/JA_REGISTRADA/.test(m)) return 'Este registro já existe.';
    if (/SESSAO_INVALIDA/.test(m)) return 'Sua sessão expirou. Entre de novo.';
    if (/SEM_CONEXAO/.test(m)) return 'Sem conexão com a internet. Tente de novo.';
    return 'Não foi possível concluir. Tente de novo.';
  }

  // Carrega dados do servidor (lista de funcionários e registros)
  async function avCarregar() {
    if (AV.carregando) return;
    AV.carregando = true; AV.erro = null;
    try {
      const [f, r] = await Promise.all([
        Nuvem.rpc('esc_avaliacao_funcionarios', {}),
        Nuvem.rpc('esc_avaliacoes_ler', {}),
      ]);
      AV.func = (f && f.funcionarios) || [];
      AV.setores = (f && f.setores) || [];
      AV.registros = ((r && r.registros) || []).map((x) => Object.assign({ id: x.i }, x.d));
      AV.carregado = true;
    } catch (e) {
      AV.erro = erroAmigavel(e);
    } finally {
      AV.carregando = false;
      if (typeof render === 'function') render();
    }
  }
  window.avCarregar = avCarregar;
  window.avPrecisaCarregar = () => !AV.carregado && !AV.carregando;

  // Pontuação do mês (admin): começa com 100, desconta cada registro, nunca abaixo de zero
  function rankingDoMes(mes) {
    const ativos = AV.func;
    const porFunc = Object.fromEntries(ativos.map((f) => [f.id, { id: f.id, nome: f.nome, setorId: f.setorId, qtd: 0, descontos: 0 }]));
    AV.registros.filter((r) => (r.ocorrido || '').slice(0, 7) === mes).forEach((r) => {
      const p = porFunc[r.funcionarioId];
      if (!p) return;
      p.qtd += 1;
      p.descontos += (TIPO[r.tipo] || { pontos: 0 }).pontos;
    });
    const lista = Object.values(porFunc).map((p) => Object.assign(p, {
      descontoAplicado: Math.min(p.descontos, INICIAL),
      final: Math.max(0, INICIAL - p.descontos),
    }));
    lista.sort((a, b) => b.final - a.final || a.nome.localeCompare(b.nome, 'pt-BR'));
    let pos = 0; let anterior = null;
    lista.forEach((p, i) => {
      if (p.final !== anterior) { pos = i + 1; anterior = p.final; }
      p.posicao = pos;
    });
    return lista;
  }

  function nomeSetor(id) {
    const s = AV.setores.find((x) => x.id === id);
    return s ? s.nome : '—';
  }

  function formularioRegistro() {
    const opcFunc = AV.func.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((f) => `<option value="${esc(f.id)}">${esc(f.nome)} · ${esc(nomeSetor(f.setorId))}</option>`).join('');
    const opcTipo = TIPOS.map((t) => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');
    return `
      <form id="avForm" class="card" style="padding:16px;display:grid;gap:12px;max-width:640px" autocomplete="off">
        <div class="fld"><label class="f">Funcionário</label>
          <select name="funcionarioId" required><option value="">Escolha o funcionário…</option>${opcFunc}</select></div>
        <div class="fld"><label class="f">Tipo de ocorrência</label>
          <select name="tipo" required><option value="">Escolha o tipo…</option>${opcTipo}</select></div>
        <div class="fld"><label class="f">Data e horário do ocorrido</label>
          <input type="datetime-local" name="ocorrido" required max="${agoraLocalRecife()}" /></div>
        <div class="fld"><label class="f">Descrição do que aconteceu</label>
          <textarea name="descricao" required minlength="10" maxlength="1000" rows="3" placeholder="Descreva o ocorrido (mínimo de 10 caracteres)"></textarea></div>
        <div id="avErro" class="small" style="color:#9b2c2c;min-height:1em"></div>
        <div><button class="btn" type="submit" ${AV.enviando ? 'disabled' : ''}>${AV.enviando ? 'Salvando…' : 'Registrar ocorrência'}</button></div>
      </form>`;
  }

  function tabelaRegistros() {
    const linhas = AV.registros.slice().sort((a, b) => (b.ocorrido || '').localeCompare(a.ocorrido || '')).slice(0, 300);
    if (!linhas.length) return '<p class="small muted">Nenhum registro ainda.</p>';
    return `<div class="tbl-wrap" style="overflow-x:auto"><table class="tbl"><thead><tr>
        <th>Ocorrido em</th><th>Funcionário</th><th>Setor</th><th>Tipo</th><th>Descrição</th>${soAdmin() ? '<th>Registrado por</th>' : ''}
      </tr></thead><tbody>${linhas.map((r) => `<tr>
        <td>${esc(dataHora(r.ocorrido))}</td>
        <td>${esc(r.funcionarioNome || '—')}</td>
        <td>${esc(nomeSetor((AV.func.find((f) => f.id === r.funcionarioId) || {}).setorId))}</td>
        <td>${esc((TIPO[r.tipo] || { nome: r.tipo }).nome)}</td>
        <td>${esc(r.descricao || '')}</td>
        ${soAdmin() ? `<td>${esc(r.autor || '—')}</td>` : ''}
      </tr>`).join('')}</tbody></table></div>`;
  }

  function painelAdmin() {
    const mes = AV.mes || mesAgora();
    const lista = rankingDoMes(mes);
    const destaques = lista.filter((p) => p.posicao === 1 && p.qtd > 0);
    return `
      <div class="small muted" style="margin-bottom:10px">Pontuação começa em ${INICIAL} todo mês. Os descontos são automáticos e a pontuação nunca fica abaixo de zero. Os gerentes não veem esta parte.</div>
      <div class="fld" style="max-width:260px;margin-bottom:12px"><label class="f">Mês</label>
        <input type="month" id="avMes" value="${esc(mes)}" data-av="mes" /></div>
      <div class="card" style="padding:14px;margin-bottom:12px">
        <b>Funcionário destaque de ${esc(mesNome(mes))}</b>
        <div style="margin-top:6px">${destaques.length ? destaques.map((d) => `<span class="pill">${esc(d.nome)} · ${d.final} pontos</span>`).join(' ') : '<span class="small muted">Sem ocorrências neste mês (todos com 100).</span>'}</div>
        ${destaques.length > 1 ? '<div class="small muted" style="margin-top:6px">Empate na primeira posição.</div>' : ''}
      </div>
      <div class="tbl-wrap" style="overflow-x:auto;margin-bottom:14px"><table class="tbl"><thead><tr>
        <th>Posição</th><th>Funcionário</th><th>Setor</th><th>Registros</th><th>Descontos</th><th>Pontuação final</th>
      </tr></thead><tbody>${lista.map((p) => `<tr>
        <td>${p.posicao}º</td><td>${esc(p.nome)}</td><td>${esc(nomeSetor(p.setorId))}</td>
        <td>${p.qtd}</td><td>−${p.descontoAplicado}</td><td><b>${p.final}</b></td>
      </tr>`).join('')}</tbody></table></div>`;
  }

  window.vAvaliacao = function () {
    if (!AV.carregado && !AV.carregando && !AV.erro) {
      avCarregar();
      return `<div class="loading"><div class="spin"></div>Carregando avaliações…</div>`;
    }
    if (AV.erro && !AV.carregado) {
      return `<div class="card" style="padding:16px"><p>${esc(AV.erro)}</p><button class="btn ghost" data-av="recarregar">Tentar de novo</button></div>`;
    }
    const abas = soAdmin()
      ? [['registrar', 'Registrar'], ['registros', 'Registros'], ['ranking', 'Ranking e bonificação']]
      : [['registrar', 'Registrar'], ['registros', 'Registros']];
    const aba = abas.some((a) => a[0] === AV.aba) ? AV.aba : 'registrar';
    const msg = AV.msg ? `<div class="alert ${AV.msgErro ? 'e' : 'ok'}" style="margin-bottom:12px"><span class="ic">${AV.msgErro ? '!' : '✓'}</span><div>${esc(AV.msg)}</div></div>` : '';
    const conteudo = aba === 'registrar' ? formularioRegistro()
      : aba === 'registros' ? tabelaRegistros()
      : painelAdmin();
    return `
      ${msg}
      <div class="seg" style="margin-bottom:14px">${abas.map(([id, nome]) =>
        `<button class="${aba === id ? 'on' : ''}" data-av="aba" data-aba="${id}">${esc(nome)}</button>`).join('')}</div>
      ${conteudo}`;
  };

  // Cliques e envios da aba (delegação: não mexe no restante do sistema)
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-av]');
    if (!b) return;
    const acao = b.dataset.av;
    if (acao === 'aba') { AV.aba = b.dataset.aba; AV.msg = null; render(); }
    if (acao === 'recarregar') { AV.carregado = false; AV.erro = null; avCarregar(); }
  });

  document.addEventListener('change', (ev) => {
    if (ev.target && ev.target.dataset && ev.target.dataset.av === 'mes') { AV.mes = ev.target.value || mesAgora(); render(); }
  });

  document.addEventListener('submit', async (ev) => {
    if (!ev.target || ev.target.id !== 'avForm') return;
    ev.preventDefault();
    const f = ev.target;
    const erro = document.getElementById('avErro');
    const dados = {
      funcionarioId: f.funcionarioId.value,
      tipo: f.tipo.value,
      ocorrido: f.ocorrido.value ? f.ocorrido.value + ':00-03:00' : '',
      descricao: f.descricao.value.trim(),
    };
    if (!dados.funcionarioId) { erro.textContent = 'Escolha o funcionário.'; return; }
    if (!dados.tipo) { erro.textContent = 'Escolha o tipo de ocorrência.'; return; }
    if (!f.ocorrido.value) { erro.textContent = 'Informe a data e o horário.'; return; }
    if (dados.descricao.length < 10) { erro.textContent = 'A descrição precisa ter pelo menos 10 caracteres.'; return; }
    AV.enviando = true; erro.textContent = ''; render();
    try {
      const id = novoUuid();
      await Nuvem.rpc('esc_avaliacao_salvar', { p_id: id, p_dados: dados });
      AV.msg = 'Ocorrência registrada.'; AV.msgErro = false;
      AV.enviando = false;
      AV.carregado = false;
      await avCarregar();
      AV.aba = 'registros';
      render();
    } catch (e) {
      AV.enviando = false;
      AV.msg = erroAmigavel(e); AV.msgErro = true;
      render();
    }
  });
})();
