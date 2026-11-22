/* ===================== AVALIAÇÃO DE FUNCIONÁRIOS =====================
   Aba separada do vale-transporte. Quem tem a permissão "avaliacao" registra ocorrências
   negativas e vê a lista de registros SEM autoria dos colegas.
   Só o administrador vê quem registrou, a pontuação e o ranking (para a bonificação).
   Quem manda é o servidor (sql/avaliacao.sql): esta tela só mostra o que o servidor entrega.
   Visual: estilos próprios (prefixo .av-), sem alterar o restante do sistema. */
(function () {
  const TIPOS = [
    { id: 'falta_injustificada', nome: 'Falta injustificada', pontos: 50, cls: 'falta' },
    { id: 'atraso', nome: 'Atraso', pontos: 20, cls: 'atraso' },
    { id: 'esquecimento_ponto', nome: 'Esqueceu o ponto', pontos: 3, cls: 'ponto' },
    { id: 'tarefa_nao_realizada', nome: 'Tarefa não realizada', pontos: 10, cls: 'tarefa' },
  ];
  const TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t]));
  const INICIAL = 100;
  const AV = { carregado: false, carregando: false, erro: null, func: [], setores: [], registros: [], mes: null, aba: 'registrar', msg: null, msgErro: false, enviando: false };

  const ICONE = {
    registrar: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    registros: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    ranking: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3"/>',
    atualizar: '<path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    vazio: '<path d="M9 11l2 2 4-4"/><rect x="4" y="3" width="16" height="18" rx="2"/>',
  };
  const svg = (nome) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE[nome]}</svg>`;

  const mesAgora = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Recife' }).slice(0, 7);
  const dataHora = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Recife', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

  // Estilos da aba (uma vez só, com prefixo .av-)
  const CSS = `
.av{max-width:980px;margin:0 auto;color:var(--ink);font-size:14px}
.av *{box-sizing:border-box}
.av-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:linear-gradient(120deg,#0f4c5c 0%,#13687d 100%);color:#fff;border-radius:16px;padding:16px 18px;box-shadow:0 4px 14px rgba(15,76,92,.18);border-bottom:3px solid #e9a23b}
.av-logo{height:44px;width:auto;background:#fff;border-radius:12px;padding:5px 8px;flex:none}
.av-titulo{min-width:0;flex:1}
.av-titulo h2{margin:0;font-size:20px;font-weight:700;letter-spacing:-.2px}
.av-titulo p{margin:3px 0 0;font-size:13px;opacity:.88}
.av-atu{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.45);background:rgba(255,255,255,.12);color:#fff;font:inherit;font-weight:600;cursor:pointer}
.av-atu:hover{background:rgba(255,255,255,.22)}
.av-atu:active{transform:scale(.98)}
.av-abas{display:flex;gap:6px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:5px;margin:14px 0;box-shadow:var(--sh)}
.av-aba{flex:1;min-height:46px;border:0;border-radius:10px;background:transparent;font:inherit;font-weight:600;color:var(--ink2);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 8px;transition:background .15s,color .15s}
.av-aba:hover{background:#f3f6f7;color:var(--ink)}
.av-aba[aria-selected="true"]{background:#0f4c5c;color:#fff;box-shadow:0 2px 8px rgba(15,76,92,.25)}
.av-cartao{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--sh);padding:20px}
.av-cartao h3{margin:0 0 4px;font-size:16px;font-weight:700}
.av-cartao > p{margin:0 0 16px;color:var(--ink2);font-size:13px}
.av-form{display:grid;gap:16px;grid-template-columns:1fr}
@media (min-width:720px){.av-form{grid-template-columns:1fr 1fr}.av-cheio{grid-column:1/-1}}
.av-campo label{display:block;font-size:13px;font-weight:600;color:var(--ink2);margin-bottom:6px}
.av-campo select,.av-campo input,.av-campo textarea{width:100%;min-height:48px;border:1px solid #d1d5db;border-radius:12px;padding:10px 14px;font:inherit;font-size:16px;background:#fff;color:var(--ink);transition:border-color .15s,box-shadow .15s}
.av-campo textarea{min-height:130px;resize:vertical;line-height:1.5}
.av-campo select:focus,.av-campo input:focus,.av-campo textarea:focus{outline:none;border-color:#13687d;box-shadow:0 0 0 4px rgba(19,104,125,.16)}
.av-dica{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:var(--ink3);margin-top:6px}
.av-enviar{min-height:50px;width:100%;border:0;border-radius:12px;background:#0f4c5c;color:#fff;font:inherit;font-weight:700;font-size:16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 12px rgba(15,76,92,.22)}
.av-enviar:hover{background:#0b3d4b}
.av-enviar:active{transform:scale(.99)}
.av-enviar:disabled{opacity:.6;cursor:default}
@media (min-width:720px){.av-enviar{width:auto;padding:0 28px;justify-self:start}}
.av-aviso{border-radius:12px;padding:12px 14px;font-size:14px;display:flex;align-items:flex-start;gap:10px;margin-bottom:14px}
.av-aviso.ok{background:#dcfce7;color:#14532d;border:1px solid #86efac}
.av-aviso.err{background:#fee2e2;color:#7f1d1d;border:1px solid #fca5a5}
.av-erro{color:#b91c1c;font-size:13px;min-height:1em}
.av-lista{display:grid;gap:10px}
.av-reg{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:var(--sh)}
.av-reg-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
.av-reg-nome{font-weight:700;font-size:15px}
.av-reg-meta{font-size:12px;color:var(--ink2);margin-top:2px}
.av-reg-desc{margin:10px 0 0;font-size:14px;color:var(--ink);line-height:1.5;white-space:pre-wrap;word-break:break-word}
.av-reg-rod{margin-top:10px;font-size:12px;color:var(--ink3)}
.av-tag{display:inline-flex;align-items:center;font-size:12px;font-weight:700;border-radius:999px;padding:4px 10px;white-space:nowrap}
.av-tag.falta{background:#fee2e2;color:#991b1b}
.av-tag.atraso{background:#fef3c7;color:#854d0e}
.av-tag.ponto{background:#dbeafe;color:#1e40af}
.av-tag.tarefa{background:#eef0f3;color:#374151}
.av-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:14px 0}
.av-kpi{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;box-shadow:var(--sh)}
.av-kpi span{font-size:12px;color:var(--ink2);font-weight:600;text-transform:uppercase;letter-spacing:.4px}
.av-kpi b{display:block;font-size:24px;color:#0f4c5c;margin-top:4px;font-weight:700}
.av-kpi small{font-size:12px;color:var(--ink3)}
.av-lider{background:#fff;border:1px solid var(--line);border-left:5px solid #e9a23b;border-radius:16px;padding:18px 20px;box-shadow:var(--sh);margin-bottom:4px}
.av-lider .rot{font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#a16207;font-weight:700}
.av-lider .nome{font-size:22px;font-weight:700;margin-top:4px;color:#0f4c5c}
.av-lider .det{font-size:13px;color:var(--ink2);margin-top:3px}
.av-painel{background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:var(--sh);overflow:hidden}
.av-painel-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 16px;border-bottom:1px solid var(--line)}
.av-painel-top b{font-size:15px}
.av-rk{display:grid;grid-template-columns:34px minmax(0,1fr) minmax(90px,200px) 56px;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid #f1f3f5}
.av-rk:last-child{border-bottom:0}
.av-rk.primeiro{background:#fffbeb}
.av-pos{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;background:#eef2f4;color:var(--ink2)}
.av-rk.primeiro .av-pos{background:#e9a23b;color:#422006}
.av-rk-nome{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.av-rk-det{font-size:12px;color:var(--ink2)}
.av-barra{height:9px;background:#eef2f4;border-radius:999px;overflow:hidden}
.av-barra i{display:block;height:100%;border-radius:999px}
.av-nota{text-align:right;font-size:18px;font-weight:700;color:#0f4c5c}
@media (max-width:560px){
  .av-rk{grid-template-columns:30px minmax(0,1fr) auto;gap:8px 10px;padding:12px}
  .av-barra{grid-column:2 / 4}
  .av-top{padding:14px}
  .av-logo{height:38px}
  .av-atu span{display:none}
  .av-aba{font-size:13px}
  .av-aba span.av-rot{display:none}
}
.av-vazio{text-align:center;color:var(--ink2);padding:28px 16px}
.av-vazio svg{color:var(--ink3);margin-bottom:6px}
.av-skel{display:flex;align-items:center;justify-content:center;gap:10px;padding:40px 16px;color:var(--ink2);font-weight:600}
.av-spin{width:18px;height:18px;border:2px solid #d1d5db;border-top-color:#0f4c5c;border-radius:50%;animation:av-gira .8s linear infinite}
@keyframes av-gira{to{transform:rotate(360deg)}}
.av-mes{max-width:240px}
.av-mes input{min-height:44px}
.av-rodape{font-size:12px;color:var(--ink3);margin-top:10px}
`;

  function garantirEstilos() {
    if (document.getElementById('av-estilos')) return;
    const s = document.createElement('style');
    s.id = 'av-estilos';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // Ler dados do servidor (lista de funcionários e registros)
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

  // Pontuação do mês (admin): começa com 100, desconta cada registro, nunca abaixo de zero.
  // Entram todos os funcionários ativos, com ou sem registro.
  function rankingDoMes(mes) {
    const porFunc = Object.fromEntries(AV.func.map((f) => [f.id, { id: f.id, nome: f.nome, setorId: f.setorId, qtd: 0, descontos: 0 }]));
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

  function cabecalho() {
    const subtitulo = soAdmin()
      ? 'Registro e acompanhamento de ocorrências'
      : 'Registre ocorrências dos funcionários';
    return `<header class="av-top">
      <img class="av-logo" src="logo.png" alt="Hotel Fazenda Oásis">
      <div class="av-titulo"><h2>Avaliação</h2><p>${esc(subtitulo)}</p></div>
      <button class="av-atu" data-av="recarregar" type="button" aria-label="Atualizar dados">${svg('atualizar')}<span>Atualizar</span></button>
    </header>`;
  }

  function abas() {
    const lista = soAdmin()
      ? [['registrar', 'Registrar', 'registrar'], ['registros', 'Registros', 'registros'], ['ranking', 'Ranking', 'ranking']]
      : [['registrar', 'Registrar', 'registrar'], ['registros', 'Registros', 'registros']];
    const atual = lista.some((a) => a[0] === AV.aba) ? AV.aba : 'registrar';
    return { atual, html: `<nav class="av-abas" role="tablist" aria-label="Seções da avaliação">${lista.map(([id, nome, icone]) =>
      `<button class="av-aba" role="tab" type="button" aria-selected="${atual === id}" data-av="aba" data-aba="${id}">${svg(icone)}<span>${esc(nome)}</span></button>`).join('')}</nav>` };
  }

  function formularioRegistro() {
    const opcFunc = AV.func.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((f) => `<option value="${esc(f.id)}">${esc(f.nome)} · ${esc(nomeSetor(f.setorId))}</option>`).join('');
    const opcTipo = TIPOS.map((t) => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');
    return `
      <form id="avForm" class="av-cartao" autocomplete="off">
        <h3>Nova ocorrência</h3>
        <p>Só são aceitos os quatro tipos negativos da lista. Descreva o fato com clareza.</p>
        <div class="av-form">
          <div class="av-campo"><label for="avFunc">Funcionário</label>
            <select id="avFunc" name="funcionarioId" required><option value="">Escolha o funcionário…</option>${opcFunc}</select></div>
          <div class="av-campo"><label for="avTipo">Tipo de ocorrência</label>
            <select id="avTipo" name="tipo" required><option value="">Escolha o tipo…</option>${opcTipo}</select></div>
          <div class="av-campo"><label for="avQuando">Data e horário do ocorrido</label>
            <input id="avQuando" type="datetime-local" name="ocorrido" required max="${agoraLocalRecife()}" /></div>
          <div class="av-campo av-cheio"><label for="avDesc">Descrição do que aconteceu</label>
            <textarea id="avDesc" name="descricao" required minlength="10" maxlength="1000" rows="4" placeholder="Ex.: chegou 20 minutos depois do horário, sem aviso prévio à chefia."></textarea>
            <div class="av-dica"><span>Mínimo de 10 caracteres</span><span id="avContador">0 / 1000</span></div></div>
          <div class="av-cheio">
            <div id="avErro" class="av-erro"></div>
            <button class="av-enviar" type="submit" ${AV.enviando ? 'disabled' : ''}>${AV.enviando ? '<span class="av-spin" style="border-top-color:#fff;border-color:rgba(255,255,255,.4)"></span> Salvando…' : 'Registrar ocorrência'}</button>
          </div>
        </div>
      </form>`;
  }

  function listaRegistros() {
    const linhas = AV.registros.slice().sort((a, b) => (b.ocorrido || '').localeCompare(a.ocorrido || '')).slice(0, 300);
    if (!linhas.length) {
      return `<div class="av-cartao av-vazio">${svg('vazio')}<div><b>Nenhum registro ainda.</b></div><div class="small">Os registros aparecem aqui assim que forem feitos.</div></div>`;
    }
    return `<div class="av-lista">${linhas.map((r) => {
      const tipo = TIPO[r.tipo] || { nome: r.tipo, cls: 'tarefa' };
      const setor = nomeSetor((AV.func.find((f) => f.id === r.funcionarioId) || {}).setorId);
      return `<article class="av-reg">
        <div class="av-reg-top">
          <div style="min-width:0"><div class="av-reg-nome">${esc(r.funcionarioNome || '—')}</div>
            <div class="av-reg-meta">${esc(setor)} · ${esc(dataHora(r.ocorrido))}</div></div>
          <span class="av-tag ${tipo.cls}">${esc(tipo.nome)}</span>
        </div>
        <p class="av-reg-desc">${esc(r.descricao || '')}</p>
        ${soAdmin() ? `<div class="av-reg-rod">Registrado por ${esc(r.autor || '—')}</div>` : ''}
      </article>`;
    }).join('')}</div>`;
  }

  // Uma linha do ranking: posição, nome, barra de pontuação e nota final
  function linhaRanking(p) {
    const cor = p.final >= 80 ? '#15803d' : p.final >= 50 ? '#a16207' : '#b91c1c';
    const detalhe = `${esc(nomeSetor(p.setorId))} · ${p.qtd} ${p.qtd === 1 ? 'registro' : 'registros'}${p.descontoAplicado ? ' · −' + p.descontoAplicado : ''}`;
    return `<div class="av-rk${p.posicao === 1 ? ' primeiro' : ''}">
      <div class="av-pos">${p.posicao}</div>
      <div style="min-width:0"><div class="av-rk-nome">${esc(p.nome)}</div><div class="av-rk-det">${detalhe}</div></div>
      <div class="av-nota">${p.final}</div>
      <div class="av-barra"><i style="width:${p.final}%;background:${cor}"></i></div>
    </div>`;
  }

  function painelAdmin() {
    const mes = AV.mes || mesAgora();
    const atual = mes === mesAgora();
    const lista = rankingDoMes(mes);
    const lider = lista.filter((p) => p.posicao === 1);
    const totalOc = lista.reduce((s, p) => s + p.qtd, 0);
    const comOc = lista.filter((p) => p.qtd > 0).length;
    const media = lista.length ? Math.round(lista.reduce((s, p) => s + p.final, 0) / lista.length) : 0;
    const todosEmpatados = lista.length > 0 && lider.length === lista.length;
    const topo = lider.length && !todosEmpatados
      ? `<div class="av-lider"><div class="rot">${atual ? 'Em primeiro lugar até agora' : 'Destaque de ' + esc(mesNome(mes))}</div>
         <div class="nome">${lider.length > 3 ? lider.length + ' funcionários empatados' : lider.map((p) => esc(p.nome)).join(' e ')}</div>
         <div class="det">${lider[0].final} pontos${lider.length > 1 ? ' · empate na primeira posição' : ''}${atual ? ' · a posição muda com novos registros' : ''}</div></div>`
      : (lista.length ? '' : '<div class="av-cartao av-vazio">Nenhum funcionário cadastrado.</div>');
    const kpi = (rotulo, valor, detalhe) => `<div class="av-kpi"><span>${rotulo}</span><b>${valor}</b><small>${detalhe}</small></div>`;
    return `
      <div class="av-painel-top" style="border:0;padding:0 0 12px">
        <div class="av-campo av-mes"><label for="avMes">Mês</label>
          <input id="avMes" type="month" value="${esc(mes)}" data-av="mes" /></div>
        <div class="small muted">Pontuação começa em ${INICIAL}. Só o administrador vê esta parte.</div>
      </div>
      ${topo}
      <div class="av-kpis">
        ${kpi('Funcionários', lista.length, 'ativos no sistema')}
        ${kpi('Com ocorrências', comOc, 'no mês')}
        ${kpi('Ocorrências', totalOc, 'registradas no mês')}
        ${kpi('Média', media, 'pontos')}
      </div>
      <section class="av-painel">
        <div class="av-painel-top"><b>Ranking do mês</b><span class="small muted">${lista.length} funcionários</span></div>
        ${lista.length ? lista.map(linhaRanking).join('') : '<div class="av-vazio">Sem funcionários.</div>'}
      </section>
      <p class="av-rodape">A pontuação é calculada automaticamente. Os gerentes não veem esta parte.</p>`;
  }

  window.vAvaliacao = function () {
    garantirEstilos();
    if (!AV.carregado && !AV.carregando && !AV.erro) {
      avCarregar();
      return `<div class="av">${cabecalho()}<div class="av-cartao av-skel"><span class="av-spin"></span>Carregando avaliações…</div></div>`;
    }
    if (AV.erro && !AV.carregado) {
      return `<div class="av">${cabecalho()}<div class="av-cartao"><p style="margin:0 0 12px">${esc(AV.erro)}</p>
        <button class="btn ghost" data-av="recarregar" type="button">Tentar de novo</button></div></div>`;
    }
    const nav = abas();
    const msg = AV.msg ? `<div class="av-aviso ${AV.msgErro ? 'err' : 'ok'}" role="status">${esc(AV.msg)}</div>` : '';
    const conteudo = nav.atual === 'registrar' ? formularioRegistro()
      : nav.atual === 'registros' ? listaRegistros()
      : painelAdmin();
    return `<div class="av">
      ${cabecalho()}
      ${nav.html}
      ${msg}
      ${conteudo}
    </div>`;
  };

  // Cliques e envios da aba (delegação: não mexe no restante do sistema)
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-av]');
    if (!b) return;
    const acao = b.dataset.av;
    if (acao === 'aba') { AV.aba = b.dataset.aba; AV.msg = null; render(); }
    if (acao === 'recarregar') { AV.carregado = false; AV.erro = null; avCarregar(); }
  });

  document.addEventListener('change', (ev) => {
    if (ev.target && ev.target.dataset && ev.target.dataset.av === 'mes') { AV.mes = ev.target.value || mesAgora(); render(); }
  });

  // Contador de caracteres da descrição (só visual)
  document.addEventListener('input', (ev) => {
    if (ev.target && ev.target.name === 'descricao' && ev.target.form && ev.target.form.id === 'avForm') {
      const c = document.getElementById('avContador');
      if (c) c.textContent = ev.target.value.length + ' / 1000';
    }
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
      await Nuvem.rpc('esc_avaliacao_salvar', { p_id: novoUuid(), p_dados: dados });
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
