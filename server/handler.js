// SALA DIGITAL — camada de servidor: liga o núcleo ao banco (PostgreSQL) e ao armazenamento de fotos
import { criarNucleo } from './core.js';
export function criarServidor(io) {
  const N = criarNucleo({ sha256b64: io.sha256b64, uuid: io.uuid, senhasAleatorias: !!io.senhasAleatorias });
  async function gravar(x) {
    for (const u of x.uploads) await io.enviar(u);
    if (x.ops.length) await io.aplicar(x.ops);
    for (const f of x.rpc) await io.rpc(f, {});
    for (const r of x.remover) { try { await io.remover(r); } catch (e) { } }
  }
  async function processar(body) {
    const b = body || {};
    let dados = await io.carregar();
    if (!dados.Usuarios || !dados.Usuarios.length) {   // primeiro acesso: instala a plataforma (só acontece com o banco vazio)
      try { await instalar(); } catch (e) { }
      dados = await io.carregar();
    }
    const x = N.executar(dados, String(b.token || ''), String(b.acao || ''), b.d || {});
    let resp = x.resposta;
    if (resp && resp.ok) {
      try { await gravar(x); }
      catch (e) {
        const m = String((e && e.message) || e);
        if (/sd_usuarios_login|sd_usuarios_email/.test(m)) return { ok: false, erro: 'Este usuário ou e-mail já está em uso. Escolha outro.' };
        if (/sd_entregas_unica/.test(m)) return { ok: false, erro: 'Esta atividade foi aberta em outro aparelho ao mesmo tempo. Recarregue a página.' };
        if (/sd_turmas_codigo/.test(m)) return { ok: false, erro: 'Tente novamente.' };
        if (typeof console !== 'undefined') console.error('gravar', m);
        return { ok: false, erro: 'Não foi possível salvar agora. Tente novamente.' };
      }
      if (resp.d && resp.d.__assinar) resp = { ok: true, d: await io.assinar(resp.d.__assinar) };
      else if (resp.d && resp.d.__ia) resp = await executarIA(resp.d.__ia);
      else if (resp.d && resp.d.__banco) resp = await executarBanco(resp.d.__banco);
    } else {
      // em caso de erro nada é gravado, exceto contadores de segurança (tentativas) e o registro de auditoria
      const seg = x.ops.filter(o => o.op === 'kv' || o.t === 'Log');
      if (seg.length) { try { await io.aplicar(seg); } catch (e) { } }
    }
    return resp;
  }
  // ---------- Inteligência Artificial (API da Anthropic / Claude) ----------
  const PRECO = { 'claude-sonnet-5-5': { in: 2, out: 10 }, 'claude-haiku-5-5': { in: 0.10, out: 0.50 } };
  function mensagens(spec) {
    if (spec.modo !== 'tutor') return [{ role: 'user', content: spec.conteudo }];
    const m = [];
    for (const h of spec.historico || []) {
      if (!m.length && h.role !== 'user') continue;
      if (m.length && m[m.length - 1].role === h.role) m[m.length - 1].content += '\n' + h.content; else m.push({ role: h.role, content: h.content });
    }
    if (m.length && m[m.length - 1].role === 'user') m.pop();
    m.push({ role: 'user', content: spec.conteudo });
    return m;
  }
  // ---- Google Gemini (cota gratuita) ----
  const GEMINI_MODELOS = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-2.5-flash-lite'];
  async function executarGemini(spec) {
    if (!io.chaveGemini) return { ok: false, erro: 'A Inteligência Artificial ainda não foi ativada pelo administrador (falta configurar a chave do Google Gemini).' };
    const partes = spec.conteudo.map(b => b.type === 'text' ? { text: b.text } : { inline_data: { mime_type: b.source.media_type, data: b.source.data } });
    const tutor = spec.modo === 'tutor';
    const contents = tutor ? mensagens(spec).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: typeof m.content === 'string' ? [{ text: m.content }] : partes })) : [{ role: 'user', parts: partes }];
    const corpo = { systemInstruction: { parts: [{ text: spec.sistema }] }, contents: contents,
      generationConfig: tutor ? { maxOutputTokens: 1024, temperature: 0.6 } : { responseMimeType: 'application/json', maxOutputTokens: Math.max(8192, spec.max_tokens), temperature: 0.4 } };
    const modelos = io.modeloGemini ? [io.modeloGemini].concat(GEMINI_MODELOS) : GEMINI_MODELOS;
    let r, j, usado = '';
    for (const m of modelos) {
      try {
        r = await io.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent', { method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': io.chaveGemini }, body: JSON.stringify(corpo) });
        j = await r.json();
      } catch (e) { return { ok: false, erro: 'Não foi possível falar com o serviço de IA agora. Tente de novo em instantes.' }; }
      usado = m;
      if (r.status !== 404) break;   // modelo inexistente: tenta o próximo
    }
    if (!r.ok) {
      const msg = String((j && j.error && (j.error.message + ' ' + j.error.status)) || '');
      if (typeof console !== 'undefined') console.error('Gemini', r.status, msg);
      if (/API_KEY|API key|PERMISSION_DENIED/i.test(msg) || r.status === 401 || r.status === 403) return { ok: false, erro: 'A chave do Google Gemini é inválida. Avise o administrador.' };
      if (r.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(msg)) return { ok: false, erro: 'A cota gratuita de IA do dia acabou. Tente de novo mais tarde ou amanhã.' };
      if (r.status === 413 || /too large|exceeds|size/i.test(msg)) return { ok: false, erro: 'O material é grande demais para uma vez só. Envie menos páginas.' };
      if (r.status >= 500) return { ok: false, erro: 'O serviço de IA está ocupado. Tente de novo em instantes.' };
      return { ok: false, erro: 'A IA não conseguiu processar este pedido. Verifique os arquivos e tente de novo.' };
    }
    const um = j.usageMetadata || {};
    try { await io.rpc('sd_ia_registrar', { p_mes: new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7), p_modo: spec.modo, p_usd: 0, p_in: um.promptTokenCount || 0, p_out: um.candidatesTokenCount || 0 }); } catch (e) { }
    const texto = (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.map(p => p.text || '').join('').trim();
    if (tutor) return { ok: true, d: { resposta: texto || 'Desculpe, não consegui responder agora. Tente perguntar de outro jeito.' } };
    let saida = null;
    try { saida = JSON.parse(texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); }
    catch (e) { const a = texto.indexOf('{'), b = texto.lastIndexOf('}'); try { saida = JSON.parse(texto.slice(a, b + 1)); } catch (e2) { } }
    const res = N.limparIA(saida, spec.meta);
    if (!res.questoes.length) return { ok: false, erro: 'A IA não conseguiu criar questões com este material. Tente fotos mais nítidas ou outro trecho.' };
    res.custoUSD = 0; res.pedidas = spec.meta.quantidade; res.modelo = usado;
    return { ok: true, d: res };
  }
  async function executarIA(spec) {
    if (spec.provedor === 'gemini') return executarGemini(spec);
    if (!io.chaveIA) return { ok: false, erro: 'A Inteligência Artificial ainda não foi ativada pelo administrador (falta configurar a chave do serviço de IA).' };
    const corpo = { model: spec.modelo, max_tokens: spec.max_tokens, system: spec.sistema, messages: mensagens(spec) };
    if (spec.ferramenta) { corpo.tools = [spec.ferramenta]; corpo.tool_choice = { type: 'tool', name: spec.ferramenta.name }; }
    let r, j;
    try {
      r = await io.fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': io.chaveIA, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(corpo) });
      j = await r.json();
    } catch (e) { return { ok: false, erro: 'Não foi possível falar com o serviço de IA agora. Tente de novo em instantes.' }; }
    if (!r.ok) {
      const msg = String((j && j.error && j.error.message) || '');
      if (typeof console !== 'undefined') console.error('IA', r.status, msg);
      if (r.status === 401 || r.status === 403) return { ok: false, erro: 'A chave do serviço de IA é inválida. Avise o administrador.' };
      if (/credit|balance|billing/i.test(msg)) return { ok: false, erro: 'Os créditos do serviço de IA acabaram. Avise o administrador.' };
      if (r.status === 429) return { ok: false, erro: 'Muitos pedidos à IA ao mesmo tempo. Aguarde um minuto e tente de novo.' };
      if (r.status === 413 || /too large|exceed/i.test(msg)) return { ok: false, erro: 'O material é grande demais para uma vez só. Envie menos páginas.' };
      if (r.status >= 500) return { ok: false, erro: 'O serviço de IA está ocupado. Tente de novo em instantes.' };
      return { ok: false, erro: 'A IA não conseguiu processar este pedido. Verifique os arquivos e tente de novo.' };
    }
    const uso = j.usage || {}; const p = PRECO[spec.modelo] || { in: 0, out: 0 };
    const usd = ((uso.input_tokens || 0) * p.in + (uso.output_tokens || 0) * p.out) / 1e6;
    try { await io.rpc('sd_ia_registrar', { p_mes: new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7), p_modo: spec.modo, p_usd: usd, p_in: uso.input_tokens || 0, p_out: uso.output_tokens || 0 }); } catch (e) { }
    if (spec.modo === 'gerar') {
      const tu = (j.content || []).find(c => c.type === 'tool_use');
      const res = N.limparIA(tu ? tu.input : null, spec.meta);
      if (!res.questoes.length) return { ok: false, erro: 'A IA não conseguiu criar questões com este material. Tente fotos mais nítidas ou outro trecho.' };
      res.custoUSD = Math.round(usd * 10000) / 10000; res.pedidas = spec.meta.quantidade;
      return { ok: true, d: res };
    }
    const texto = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    return { ok: true, d: { resposta: texto || 'Desculpe, não consegui responder agora. Tente perguntar de outro jeito.' } };
  }
  // ---------- Banco de Atividades (conteúdo criptografado; só o servidor abre) ----------
  let _banco = null, _bancoChave = '';
  async function abrirBanco(chave) {
    if (_banco && _bancoChave === chave) return _banco;
    const b64 = io.banco ? await io.banco() : await (await fetch(new URL('./banco.enc.txt', import.meta.url))).text();
    const bin = Uint8Array.from(atob(String(b64).trim()), c => c.charCodeAt(0));
    const k = await crypto.subtle.importKey('raw', Uint8Array.from(atob(chave), c => c.charCodeAt(0)), 'AES-GCM', false, ['decrypt']);
    const gz = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bin.slice(0, 12) }, k, bin.slice(12));
    const txt = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    _banco = JSON.parse(txt); _bancoChave = chave; return _banco;
  }
  const NIVEL = { F1: 'Ensino Fundamental I', F2: 'Ensino Fundamental II', EM: 'Ensino Médio' };
  const DIF = { facil: 1, medio: 2, dificil: 3 };
  function embaralhar(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function converter(q, assunto) {
    const base = { enunciado: q[2], textoApoio: '', imagem: '', pontos: 1, permiteFoto: false, dificuldade: q[1] };
    if (/\btexto\b/i.test(q[2]) && assunto.t) base.textoApoio = assunto.t;
    if (q[0] === 'm') {
      const ordem = embaralhar([0, 1, 2, 3]);
      return Object.assign(base, { tipo: 'mc', opcoes: ordem.map(i => q[3][i]), correta: ordem.indexOf(q[4]), explicacao: q[5] });
    }
    if (q[0] === 'v') return Object.assign(base, { tipo: 'vf', correta: q[3], explicacao: q[4] });
    return Object.assign(base, { tipo: 'disc', pontos: 2, permiteFoto: true, explicacao: q[3] });
  }
  async function executarBanco(b) {
    let B;
    try { B = await abrirBanco(b.chave); }
    catch (e) { if (typeof console !== 'undefined') console.error('banco', String(e && e.message || e)); return { ok: false, erro: 'Não foi possível abrir o Banco de Atividades agora. Tente novamente em instantes.' }; }
    if (b.acao === 'indice') return { ok: true, d: { niveis: NIVEL, disciplinas: B.disciplinas.map(d => ({ id: d.id, nome: d.nome, icone: d.icone,
      assuntos: d.assuntos.map((a, i) => ({ i: i, nome: a.a, nivel: a.n, total: a.q.length,
        tipos: { mc: a.q.filter(q => q[0] === 'm').length, vf: a.q.filter(q => q[0] === 'v').length, disc: a.q.filter(q => q[0] === 'd').length } })) })) } };
    const D = B.disciplinas.find(d => d.id === b.disciplina);
    if (!D) return { ok: false, erro: 'Disciplina não encontrada no banco.' };
    if (b.acao === 'texto') {
      const a = D.assuntos[b.assunto];
      if (!a) return { ok: false, erro: 'Assunto não encontrado.' };
      return { ok: true, d: { disciplina: D.nome, assunto: a.a, nivel: NIVEL[a.n] || a.n, texto: a.t } };
    }
    if (b.acao !== 'montar') return { ok: false, erro: 'Ação inválida.' };
    const sel = b.assuntos.map(i => D.assuntos[i]).filter(Boolean);
    if (!sel.length) return { ok: false, erro: 'Assunto não encontrado.' };
    const tipoDe = { m: 'mc', v: 'vf', d: 'disc' };
    const alvo = DIF[b.dificuldade] || 0;
    // separa por assunto e sorteia, alternando entre os assuntos para equilibrar
    const filas = sel.map(a => {
      const ok = a.q.filter(q => b.tipos.indexOf(tipoDe[q[0]]) >= 0);
      const prefer = alvo ? ok.filter(q => q[1] === alvo) : ok;
      const resto = alvo ? ok.filter(q => q[1] !== alvo) : [];
      return { a: a, qs: embaralhar(prefer.slice()).concat(embaralhar(resto.slice()).sort((x, y) => Math.abs(x[1] - alvo) - Math.abs(y[1] - alvo))) };
    });
    const disponiveis = filas.reduce((s, f) => s + f.qs.length, 0);
    const escolhidas = [];
    for (let rodada = 0; escolhidas.length < b.quantidade && rodada < 100; rodada++) {
      let pegou = false;
      for (const f of filas) { if (escolhidas.length >= b.quantidade) break; const q = f.qs[rodada]; if (q) { escolhidas.push(converter(q, f.a)); pegou = true; } }
      if (!pegou) break;
    }
    if (!escolhidas.length) return { ok: false, erro: 'Não há questões com esses filtros. Marque mais tipos de questão ou outros assuntos.' };
    // questões do mesmo tipo juntas: múltipla escolha, depois V/F, depois discursivas
    const ordemTipo = { mc: 0, vf: 1, disc: 2 };
    escolhidas.sort((x, y) => ordemTipo[x.tipo] - ordemTipo[y.tipo]);
    escolhidas.forEach(q => { delete q.dificuldade; });
    const comTexto = b.incluirTexto && sel.length <= 3;
    const instr = 'Leia com atenção e responda todas as questões.' + (comTexto ? '\n\n' + sel.map(a => '📄 ' + a.a + '\n' + a.t).join('\n\n') : '');
    if (comTexto) escolhidas.forEach(q => { q.textoApoio = ''; });
    return { ok: true, d: { origem: 'banco', titulo: D.nome + ' — ' + (sel.length === 1 ? sel[0].a : sel.length + ' assuntos'), disciplina: D.nome,
      instrucoes: instr, questoes: escolhidas, pedidas: b.quantidade, disponiveis: disponiveis, custo: 0 } };
  }
  async function instalar() { const x = N.instalar(await io.carregar()); await gravar(x); return x.msgs; }
  return { processar, instalar, nucleo: N };
}
