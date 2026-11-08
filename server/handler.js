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
  async function executarIA(spec) {
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
  async function instalar() { const x = N.instalar(await io.carregar()); await gravar(x); return x.msgs; }
  return { processar, instalar, nucleo: N };
}
