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
    { id: 'quebra_utensilio', nome: 'Quebra de utensílio', pontos: 15, cls: 'quebra' },
  ];
  const TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t]));
  const INICIAL = 100;
  const AV = { carregado: false, carregando: false, erro: null, func: [], setores: [], registros: [], mes: null, aba: 'registrar', msg: null, msgErro: false, enviando: false, destaques: [] };

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
    if (/DESCRICAO_INVALIDA/.test(m)) return 'A descrição precisa ter entre 5 e 1000 caracteres.';
    if (/DATA_INVALIDA/.test(m)) return 'Informe uma data e horário válidos (não pode ser no futuro).';
    if (/JA_REGISTRADA/.test(m)) return 'Este registro já existe.';
    if (/SESSAO_INVALIDA/.test(m)) return 'Sua sessão expirou. Entre de novo.';
    if (/SEM_CONEXAO/.test(m)) return 'Sem conexão com a internet. Tente de novo.';
    if (/FOTO_INVALIDA/.test(m)) return 'Não foi possível usar esta foto. Tente outra.';
    if (/MES_EM_ANDAMENTO/.test(m)) return 'O destaque só pode ser registrado depois que o mês fechar.';
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
.av-tag.quebra{background:#fde7d9;color:#9a3412}
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
.av-linha{display:grid;grid-template-columns:1fr 1fr;gap:12px;min-width:0}
.av-linha .av-campo{min-width:0}
.av-linha input[type=date],.av-linha input[type=time]{-webkit-appearance:none;appearance:none;min-width:0;width:100%;max-width:100%}
.av-obrig{color:#dc2626;font-weight:700}
.av-top h2{font-size:18px}
@media (max-width:560px){.av-cartao{padding:14px}.av-top{gap:10px}.av-titulo p{font-size:12px}}
#av-print{display:none}
@media print{
  body.av-imprimindo > *:not(#av-print){display:none !important}
  body.av-imprimindo #av-print{display:block !important;position:relative;color:#111827;font-family:Inter,Arial,sans-serif;padding:4mm}
  body.av-imprimindo .av-marca{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;z-index:0}
  body.av-imprimindo .av-marca span{transform:rotate(-32deg);font-size:70px;font-weight:800;letter-spacing:6px;color:rgba(15,76,92,.09);white-space:nowrap}
  body.av-imprimindo .av-marca img{position:absolute;width:60%;opacity:.07}
  body.av-imprimindo .av-folha{position:relative;z-index:1}
  @page{size:A4 portrait;margin:14mm}
}
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
      AV.destaques = soAdmin() ? await Nuvem.rpc('esc_avaliacao_destaques_ler', {}) : [];
      AV.destaques = Array.isArray(AV.destaques) ? AV.destaques : [];
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
  // Dias de férias que caem no mês (contando só os dias do próprio mês)
  function diasDeFeriasNoMes(f, mes) {
    const [y, m] = mes.split('-').map(Number);
    const inicio = Date.UTC(y, m - 1, 1);
    const fim = Date.UTC(y, m, 0);
    const total = (fim - inicio) / 86400000 + 1;
    let dias = 0;
    (f.ferias || []).forEach((p) => {
      const a = Date.parse(p.ini + 'T00:00:00Z');
      const b = Date.parse(p.fim + 'T00:00:00Z');
      const de = Math.max(a, inicio);
      const ate = Math.min(b, fim);
      if (ate >= de) dias += (ate - de) / 86400000 + 1;
    });
    return { dias, total };
  }
  // Regra: quem passa mais da metade do mês de férias não participa do ranking desse mês.
  // Férias não geram desconto de pontos (não são ocorrência).
  const fora = (f, mes) => {
    if (f.foraRanking) return true;
    const r = diasDeFeriasNoMes(f, mes);
    return r.dias > r.total / 2;
  };

  function rankingDoMes(mes) {
    // Quem está fora do ranking (marcado ou de férias na maior parte do mês) não entra na pontuação nem na bonificação
    const porFunc = Object.fromEntries(AV.func.filter((f) => !fora(f, mes)).map((f) => [f.id, { id: f.id, nome: f.nome, setorId: f.setorId, qtd: 0, descontos: 0 }]));
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

  // Nome curto para o ranking: primeiro nome, com a inicial do sobrenome só se houver repetição
  function nomesCurtos(lista) {
    const cont = {};
    lista.forEach((p) => { const f = p.nome.trim().split(/\s+/)[0]; cont[f] = (cont[f] || 0) + 1; });
    return (p) => {
      const partes = p.nome.trim().split(/\s+/);
      if (cont[partes[0]] > 1 && partes.length > 1) return partes[0] + ' ' + partes[partes.length - 1][0] + '.';
      return partes[0];
    };
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
      <div class="av-titulo"><h2>Ocorrências</h2><p>${esc(subtitulo)}</p></div>
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

  // Foto do momento: reduzida no próprio aparelho (JPEG), para caber no registro
  function lerFoto(arquivo) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        const reduzir = (lado, qualidade) => {
          const escala = Math.min(1, lado / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * escala);
          c.height = Math.round(img.height * escala);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', qualidade);
        };
        let dados = reduzir(1024, 0.7);
        if (dados.length > 390000) dados = reduzir(800, 0.5);
        if (dados.length > 390000) dados = reduzir(600, 0.4);
        URL.revokeObjectURL(url);
        dados.length > 400000 ? reject(new Error('FOTO_INVALIDA')) : resolve(dados);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('FOTO_INVALIDA')); };
      img.src = url;
    });
  }

  function previewFoto() {
    return AV.foto
      ? `<img src="${AV.foto}" alt="Foto anexada" style="display:block;max-width:100%;max-height:260px;border-radius:12px;border:1px solid var(--line)">
         <button type="button" class="btn ghost" data-av="foto-remover" style="margin-top:8px">Remover foto</button>`
      : '<div class="small muted">Se preferir, anexe uma foto do momento. A descrição continua obrigatória.</div>';
  }

  function formularioRegistro() {
    // Quem está marcado como fora do ranking não aparece para escolha (pode ser devolvido na aba Ranking)
    const opcFunc = AV.func.filter((f) => !f.foraRanking).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
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
          <div class="av-cheio av-linha">
            <div class="av-campo"><label for="avData">Data do ocorrido <span class="av-obrig">*</span></label>
              <input id="avData" type="date" max="${agoraLocalRecife().slice(0, 10)}" autocomplete="off" /></div>
            <div class="av-campo"><label for="avHora">Horário do ocorrido <span class="av-obrig">*</span></label>
              <input id="avHora" type="time" autocomplete="off" /></div>
            <input type="hidden" id="avQuando" name="ocorrido" value="" /></div>
          <div class="av-campo av-cheio"><label for="avDesc">Descrição do que aconteceu</label>
            <textarea id="avDesc" name="descricao" required minlength="5" maxlength="1000" rows="4" placeholder="Ex.: chegou 20 minutos depois do horário, sem aviso prévio à chefia."></textarea>
            <div class="av-dica"><span>Mínimo de 5 caracteres</span><span id="avContador">0 / 1000</span></div></div>
          <div class="av-cheio">
            <div class="av-campo" style="margin-bottom:12px"><label for="avFotoInput">Foto do momento (opcional)</label>
              <div id="avFotoBox">${previewFoto()}</div>
              <input id="avFotoInput" type="file" accept="image/*" capture="environment" style="margin-top:8px;font:inherit"></div>
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
        ${r.foto ? `<img src="${r.foto}" alt="Foto da ocorrência" loading="lazy" style="display:block;margin-top:10px;max-width:100%;max-height:260px;border-radius:12px;border:1px solid var(--line)">` : ''}
        ${soAdmin() ? `<div class="av-reg-rod">Registrado por ${esc(r.autor || '—')}</div>` : ''}
      </article>`;
    }).join('')}</div>`;
  }

  // Uma linha do ranking: posição, nome, barra de pontuação e nota final
  function linhaRanking(p, curto) {
    const cor = p.final >= 80 ? '#15803d' : p.final >= 50 ? '#a16207' : '#b91c1c';
    const detalhe = `${esc(nomeSetor(p.setorId))} · ${p.qtd} ${p.qtd === 1 ? 'registro' : 'registros'}${p.descontoAplicado ? ' · −' + p.descontoAplicado : ''}`;
    return `<div class="av-rk${p.posicao === 1 ? ' primeiro' : ''}">
      <div class="av-pos">${p.posicao}</div>
      <div style="min-width:0"><div class="av-rk-nome">${esc(curto(p))}</div><div class="av-rk-det">${detalhe}</div></div>
      <div class="av-nota">${p.final}</div>
      <div class="av-barra"><i style="width:${p.final}%;background:${cor}"></i></div>
    </div>`;
  }

  // Texto do critério usado no destaque (tela e impressão para todos)
  function criterioTexto(c) {
    return { pontuacao: 'Maior pontuação do mês', menos_ocorrencias: 'Empate resolvido pelo menor número de ocorrências', tempo_sem_premio: 'Empate resolvido por quem recebeu o destaque há mais tempo', sorteio: 'Empate resolvido por sorteio entre os empatados' }[c] || c;
  }

  // Desempate em três passos: menos ocorrências, quem recebeu o destaque há mais tempo, sorteio
  function escolherDestaque(lista) {
    const topo = lista.filter((p) => p.posicao === 1);
    if (!topo.length) return null;
    if (topo.length === 1) return { candidatos: [topo[0].id], criterio: 'pontuacao' };
    const minQ = Math.min(...topo.map((p) => p.qtd));
    const c = topo.filter((p) => p.qtd === minQ);
    if (c.length === 1) return { candidatos: [c[0].id], criterio: 'menos_ocorrencias' };
    const ultimo = {};
    AV.destaques.forEach((d) => { if (!ultimo[d.vencedorId] || d.mes > ultimo[d.vencedorId]) ultimo[d.vencedorId] = d.mes; });
    const dataDe = (p) => ultimo[p.id] || '';
    const menor = c.map(dataDe).reduce((a, b) => (a < b ? a : b));
    const c2 = c.filter((p) => dataDe(p) === menor);
    if (c2.length === 1) return { candidatos: [c2[0].id], criterio: 'tempo_sem_premio' };
    return { candidatos: c2.map((p) => p.id), criterio: 'sorteio' };
  }

  function nomeCurtoDe(id, nomeReserva) {
    const f = AV.func.find((x) => x.id === id) || { nome: nomeReserva || '' };
    return nomesCurtos(AV.func)(f);
  }

  function blocoDestaque(mes, lista) {
    const reg = AV.destaques.find((d) => d.mes === mes);
    const rotulo = `<div class="small muted" style="text-transform:uppercase;letter-spacing:.5px;font-weight:700">Destaque de ${esc(mesNome(mes))}</div>`;
    const historico = AV.destaques.slice(0, 6).map((d) => `<li>${esc(mesNome(d.mes))}: ${esc(nomeCurtoDe(d.vencedorId, d.vencedorNome))} · ${esc(criterioTexto(d.criterio))}</li>`).join('');
    const rodape = AV.destaques.length ? `<div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px"><div class="small muted" style="font-weight:700;margin-bottom:6px">Histórico</div><ul style="margin:0;padding-left:18px;font-size:13px">${historico}</ul></div>` : '';
    let corpo;
    if (reg) {
      corpo = `${rotulo}
        <div style="font-size:20px;font-weight:700;color:#0f4c5c;margin-top:4px">${esc(nomeCurtoDe(reg.vencedorId, reg.vencedorNome))}</div>
        <div class="small muted" style="margin-top:2px">${esc(reg.setorNome || '')} · ${esc(criterioTexto(reg.criterio))}</div>
        <div style="margin-top:12px"><button class="btn" type="button" data-av="imprimir-destaque" data-mes="${esc(mes)}">Imprimir destaque (para todos)</button></div>`;
    } else if (mes >= mesAgora()) {
      corpo = `${rotulo}<div class="muted" style="margin-top:6px">Será registrado depois que o mês fechar.</div>`;
    } else {
      const escolhido = escolherDestaque(lista);
      if (!escolhido) {
        corpo = '<div class="muted">Sem funcionários para definir o destaque.</div>';
      } else {
        const nomes = escolhido.candidatos.map((id) => nomeCurtoDe(id)).join(' e ');
        corpo = `${rotulo}
          <div style="font-size:18px;font-weight:700;margin-top:4px">${esc(nomes)}</div>
          <div class="small muted" style="margin-top:2px">${esc(criterioTexto(escolhido.criterio))}</div>
          <div style="margin-top:12px"><button class="btn" type="button" data-av="registrar-destaque" data-mes="${esc(mes)}">Registrar destaque do mês</button></div>
          <div class="small muted" style="margin-top:6px">Depois de registrado, o destaque não pode ser alterado.</div>`;
      }
    }
    return `<section class="av-cartao" style="margin-bottom:14px;border-left:5px solid #0f4c5c">${corpo}${rodape}</section>`;
  }

  // Folha para todos: só o funcionário do mês, sem pontos e sem ranking
  function imprimirDestaque(mes) {
    const reg = AV.destaques.find((d) => d.mes === mes);
    if (!reg) return;
    const logo = new URL('logo.png', location.href).href;
    const nome = nomeCurtoDe(reg.vencedorId, reg.vencedorNome);
    const estilo = `body{margin:0;font-family:Inter,Arial,sans-serif;color:#111827;background:#fff}
      .barra{padding:12px;display:flex;gap:10px;flex-wrap:wrap;border-bottom:1px solid #e5e7eb}
      .barra button{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid #0f4c5c;background:#0f4c5c;color:#fff;font:inherit;font-weight:600;cursor:pointer}
      .barra button+button{background:#fff;color:#0f4c5c}
      .folha{padding:24px;text-align:center;border:6px double #e9a23b;margin:16px;min-height:80vh;display:flex;flex-direction:column;justify-content:center;align-items:center}
      .folha img{height:90px;width:auto;margin-bottom:12px}
      .rot{font-size:14px;letter-spacing:1px;text-transform:uppercase;color:#a16207;font-weight:700}
      .nome{font-size:44px;font-weight:800;color:#0f4c5c;margin:14px 0 6px}
      .det{font-size:16px;color:#4b5563}
      .crit{font-size:13px;color:#6b7280;margin-top:18px}
      @media print{.barra{display:none}.folha{margin:0;border-width:4px}@page{size:A4 portrait;margin:14mm}}`;
    const corpo = `<div class="folha"><img src="${logo}" alt="Hotel Fazenda Oásis">
      <div class="rot">Funcionário destaque de ${esc(mesNome(mes))}</div>
      <div class="nome">${esc(nome)}</div>
      <div class="det">${esc(reg.setorNome || '')}</div>
      <div class="crit">${esc(criterioTexto(reg.criterio))}</div>
      <div class="crit" style="margin-top:6px">Hotel Fazenda Oásis</div></div>`;
    const pagina = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Funcionário destaque</title><style>${estilo}</style></head><body><div class="barra"><button onclick="window.print()">Imprimir ou salvar PDF</button><button onclick="window.close()">Fechar</button></div>${corpo}</body></html>`;
    const win = window.open('', '_blank');
    if (!win) { AV.msg = 'O navegador bloqueou a nova janela. Permita pop-ups para este site e tente de novo.'; AV.msgErro = true; render(); return; }
    win.document.open();
    win.document.write(pagina);
    win.document.close();
  }

  function painelAdmin() {
    const mes = AV.mes || mesAgora();
    const atual = mes === mesAgora();
    const lista = rankingDoMes(mes);
    const lider = lista.filter((p) => p.posicao === 1);
    const visiveis = AV.verTodos ? lista : lista.slice(0, 3);
    const curto = nomesCurtos(lista);
    const totalOc = lista.reduce((s, p) => s + p.qtd, 0);
    const comOc = lista.filter((p) => p.qtd > 0).length;
    const media = lista.length ? Math.round(lista.reduce((s, p) => s + p.final, 0) / lista.length) : 0;
    const todosEmpatados = lista.length > 0 && lider.length === lista.length;
    const topo = lider.length && !todosEmpatados
      ? `<div class="av-lider"><div class="rot">${atual ? 'Em primeiro lugar até agora' : 'Destaque de ' + esc(mesNome(mes))}</div>
         <div class="nome">${lider.length > 3 ? lider.length + ' funcionários empatados' : lider.map((p) => esc(curto(p))).join(' e ')}</div>
         <div class="det">${lider[0].final} pontos${lider.length > 1 ? ' · empate na primeira posição' : ''}${atual ? ' · a posição muda com novos registros' : ''}</div></div>`
      : (lista.length ? '' : '<div class="av-cartao av-vazio">Nenhum funcionário cadastrado.</div>');
    const kpi = (rotulo, valor, detalhe) => `<div class="av-kpi"><span>${rotulo}</span><b>${valor}</b><small>${detalhe}</small></div>`;
    return `
      <div class="av-painel-top" style="border:0;padding:0 0 12px">
        <div class="av-campo av-mes"><label for="avMes">Mês</label>
          <input id="avMes" type="month" value="${esc(mes)}" data-av="mes" /></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn" type="button" data-av="imprimir">Imprimir resultado</button><div class="small muted">Pontuação começa em ${INICIAL}. Só o administrador vê esta parte.</div></div>
      </div>
      ${blocoDestaque(mes, lista)}
      ${topo}
      <div class="av-kpis">
        ${kpi('Funcionários', lista.length, 'ativos no sistema')}
        ${kpi('Com ocorrências', comOc, 'no mês')}
        ${kpi('Ocorrências', totalOc, 'registradas no mês')}
        ${kpi('Média', media, 'pontos')}
      </div>
      <section class="av-painel">
        <div class="av-painel-top"><b>Ranking do mês</b><span class="small muted">${lista.length} funcionários</span></div>
        ${lista.length ? visiveis.map((p) => linhaRanking(p, curto)).join('') + (lista.length > 3 ? `<div style="padding:12px 16px;text-align:center"><button class="btn ghost" type="button" data-av="ver-todos">${AV.verTodos ? 'Mostrar só os 3 primeiros' : 'Ver todos os ' + lista.length}</button></div>` : '') : '<div class="av-vazio">Sem funcionários.</div>'}
      </section>
      <section class="av-painel" style="margin-top:14px">
        <div class="av-painel-top"><b>Participação no ranking</b><span class="small muted">${AV.func.filter((f) => !f.foraRanking).length} de ${AV.func.length} participam</span></div>
        ${AV.func.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((f) => `<label style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #f1f3f5;cursor:pointer;margin:0">
          <input type="checkbox" data-av="participa" data-id="${esc(f.id)}" ${f.foraRanking ? '' : 'checked'} style="width:20px;height:20px;accent-color:#0f4c5c;flex:none">
          <span style="flex:1;min-width:0;font-weight:600">${esc(nomesCurtos(AV.func)(f))}</span>
          <span class="small muted">${esc(nomeSetor(f.setorId))}</span></label>`).join('')}
        <p class="av-rodape" style="padding:12px 16px 14px;margin:0">Desmarque para tirar do ranking e da bonificação. A pessoa continua cadastrada e pode receber registros.</p>
      </section>
      <p class="av-rodape">A pontuação é calculada automaticamente. Os gerentes não veem esta parte.</p>`;
  }

  // Impressão do resultado (só administrador): folha com marca d'água "CONFIDENCIAL"
  function imprimirResultado() {
    const mes = AV.mes || mesAgora();
    const lista = rankingDoMes(mes);
    const curto = nomesCurtos(lista);
    const lider = lista.filter((p) => p.posicao === 1);
    const todos = lista.length > 0 && lider.length === lista.length;
    const emitido = new Date().toLocaleString('pt-BR', { timeZone: 'America/Recife', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const destaque = lider.length && !todos
      ? `<p style="margin:12px 0 0;font-size:14px"><b>Primeiro lugar:</b> ${lider.map((p) => esc(curto(p))).join(' e ')}, com ${lider[0].final} pontos.</p>`
      : '';
    const td = 'padding:7px 8px;border-bottom:1px solid #e5e7eb;text-align:left';
    const th = 'padding:7px 8px;border-bottom:2px solid #0f4c5c;text-align:left;background:#f3f6f7;color:#0f4c5c;font-size:11px;text-transform:uppercase;letter-spacing:.4px';
    const linhas = lista.map((p) => `<tr>
      <td style="${td}">${p.posicao}º</td>
      <td style="${td}">${esc(curto(p))}</td>
      <td style="${td}">${esc(nomeSetor(p.setorId))}</td>
      <td style="${td}">${p.qtd}</td>
      <td style="${td}">${p.descontoAplicado ? '−' + p.descontoAplicado : '0'}</td>
      <td style="${td};font-weight:700;color:#0f4c5c">${p.final}</td>
    </tr>`).join('');
    const html = `<div class="av-marca"><img src="logo.png" alt=""><span>CONFIDENCIAL</span></div>
      <div class="av-folha">
        <div style="display:flex;align-items:center;gap:14px;border-bottom:3px solid #e9a23b;padding-bottom:12px">
          <img src="logo.png" alt="Hotel Fazenda Oásis" style="height:52px;width:auto">
          <div><div style="font-size:18px;font-weight:700;color:#0f4c5c">Avaliação: resultado mensal</div>
          <div style="font-size:12px;color:#4b5563">${esc(mesNome(mes))} · emitido em ${esc(emitido)}</div></div>
        </div>
        ${destaque}
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:14px">
          <thead><tr><th style="${th}">Posição</th><th style="${th}">Funcionário</th><th style="${th}">Setor</th><th style="${th}">Registros</th><th style="${th}">Descontos</th><th style="${th}">Final</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        <p style="margin:16px 0 0;font-size:11px;color:#6b7280">Documento confidencial, de uso restrito à administração do Hotel Fazenda Oásis. A pontuação é calculada automaticamente a partir dos registros do mês.</p>
      </div>`;
    // Abre uma página própria com o resultado: a impressão direta não funciona no app instalado do celular
    const logo = new URL('logo.png', location.href).href;
    const corpo = html.split('src="logo.png"').join('src="' + logo + '"');
    const estilo = `body{margin:0;font-family:Inter,Arial,sans-serif;color:#111827;background:#fff}
      .barra{padding:12px;display:flex;gap:10px;flex-wrap:wrap;border-bottom:1px solid #e5e7eb}
      .barra button{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid #0f4c5c;background:#0f4c5c;color:#fff;font:inherit;font-weight:600;cursor:pointer}
      .barra button+button{background:#fff;color:#0f4c5c}
      .av-marca{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden;z-index:0}
      .av-marca span{transform:rotate(-32deg);font-size:70px;font-weight:800;letter-spacing:6px;color:rgba(15,76,92,.09);white-space:nowrap}
      .av-marca img{position:absolute;width:60%;opacity:.07}
      .av-folha{position:relative;z-index:1;padding:16px}
      @media print{.barra{display:none}.av-folha{padding:0}@page{size:A4 portrait;margin:14mm}}`;
    const pagina = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Avaliação: resultado mensal</title><style>${estilo}</style></head><body><div class="barra"><button onclick="window.print()">Imprimir ou salvar PDF</button><button onclick="window.close()">Fechar</button></div>${corpo}</body></html>`;
    const win = window.open('', '_blank');
    if (!win) { AV.msg = 'O navegador bloqueou a nova janela. Permita pop-ups para este site e tente de novo.'; AV.msgErro = true; render(); return; }
    win.document.open();
    win.document.write(pagina);
    win.document.close();
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
    if (acao === 'ver-todos') { AV.verTodos = !AV.verTodos; render(); }
    if (acao === 'foto-remover') { AV.foto = null; const box = document.getElementById('avFotoBox'); if (box) box.innerHTML = previewFoto(); }
    if (acao === 'imprimir' && soAdmin()) imprimirResultado();
    if (acao === 'imprimir-destaque' && soAdmin()) imprimirDestaque(b.dataset.mes);
    if (acao === 'registrar-destaque' && soAdmin()) {
      const mes = b.dataset.mes;
      const escolhido = escolherDestaque(rankingDoMes(mes));
      if (!escolhido || !window.confirm('Registrar o destaque deste mês? Depois de registrado, não pode ser alterado.')) return;
      b.disabled = true;
      Nuvem.rpc('esc_avaliacao_destaque_gravar', { p_mes: mes, p_candidatos: escolhido.candidatos, p_criterio: escolhido.criterio })
        .then(() => avCarregar())
        .catch((e) => { AV.msg = erroAmigavel(e); AV.msgErro = true; render(); });
    }
  });

  document.addEventListener('change', (ev) => {
    if (ev.target && ev.target.dataset && ev.target.dataset.av === 'mes') { AV.mes = ev.target.value || mesAgora(); render(); }
    if (ev.target && ev.target.id === 'avFotoInput') {
      const arquivo = ev.target.files && ev.target.files[0];
      if (!arquivo) return;
      const box = document.getElementById('avFotoBox');
      if (box) box.innerHTML = '<div class="small muted">Preparando a foto…</div>';
      lerFoto(arquivo)
        .then((dados) => { AV.foto = dados; })
        .catch(() => { AV.foto = null; AV.msg = 'Não foi possível usar esta foto. Tente outra.'; AV.msgErro = true; })
        .finally(() => { const b = document.getElementById('avFotoBox'); if (b) b.innerHTML = previewFoto(); });
    }
    if (ev.target && ev.target.dataset && ev.target.dataset.av === 'participa' && soAdmin()) {
      const t = ev.target;
      t.disabled = true;
      Nuvem.rpc('esc_avaliacao_ranking_definir', { p_id: t.dataset.id, p_fora: !t.checked })
        .then(() => avCarregar())
        .catch((e) => { t.checked = !t.checked; t.disabled = false; AV.msg = erroAmigavel(e); AV.msgErro = true; render(); });
    }
  });

  // Data e horário (dois campos) viram o valor do campo oculto "ocorrido", que o envio já lê
  function juntarDataHora() {
    const f = document.getElementById('avForm');
    if (!f) return;
    const d = document.getElementById('avData'), h = document.getElementById('avHora');
    f.ocorrido.value = d && h && d.value && h.value ? d.value + 'T' + h.value : '';
  }
  document.addEventListener('change', (ev) => {
    if (ev.target && (ev.target.id === 'avData' || ev.target.id === 'avHora')) juntarDataHora();
  });
  document.addEventListener('input', (ev) => {
    if (ev.target && (ev.target.id === 'avData' || ev.target.id === 'avHora')) juntarDataHora();
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
    if (AV.foto) dados.foto = AV.foto;
    if (!dados.funcionarioId) { erro.textContent = 'Escolha o funcionário.'; return; }
    if (!dados.tipo) { erro.textContent = 'Escolha o tipo de ocorrência.'; return; }
    if (!f.ocorrido.value) { erro.textContent = 'Informe a data e o horário.'; return; }
    if (dados.descricao.length < 5) { erro.textContent = 'A descrição precisa ter pelo menos 5 caracteres.'; return; }
    // Não redesenha o formulário durante o envio: se der erro, o texto digitado continua na tela
    const btn = f.querySelector('button[type="submit"]');
    AV.enviando = true; erro.textContent = '';
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
    try {
      await Nuvem.rpc('esc_avaliacao_salvar', { p_id: novoUuid(), p_dados: dados });
      AV.msg = 'Ocorrência registrada.'; AV.msgErro = false;
      AV.enviando = false;
      AV.foto = null;
      AV.carregado = false;
      await avCarregar();
      AV.aba = 'registros';
      render();
    } catch (e) {
      AV.enviando = false;
      erro.textContent = erroAmigavel(e);
      if (btn) { btn.disabled = false; btn.textContent = 'Registrar ocorrência'; }
    }
  });
})();
