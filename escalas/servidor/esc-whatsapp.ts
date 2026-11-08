// Envio da escala pelo WhatsApp (API oficial da Meta — WhatsApp Business Cloud API)
// - POST {acao:'status'|'enviar'|'teste', token, ...} vindo do sistema de escalas (senha/sessão do sistema)
// - GET/POST do webhook da Meta (verificação e status de entrega/leitura)
const SB = Deno.env.get('SUPABASE_URL')!;
const SK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GRAPH = 'https://graph.facebook.com/v21.0';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const t = await r.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { /* */ }
  if (!r.ok) throw new Error((j && j.message) || `HTTP ${r.status}`);
  return j;
}
// parâmetros de modelo não aceitam quebra de linha, tab ou mais de 4 espaços seguidos
const limpar = (s: unknown) => String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 1000) || '-';
const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');

async function enviarModelo(cfg: any, para: string, params: string[]) {
  const r = await fetch(`${GRAPH}/${cfg.phone_id}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'template', template: { name: cfg.template, language: { code: cfg.idioma }, components: [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: limpar(p) })) }] } })
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) { const e = j.error || {}; throw new Error(traduzir(e) + (e.code ? ` (código ${e.code})` : '')); }
  return j.messages?.[0]?.id as string;
}
function traduzir(e: any) {
  const c = e.code, m = e.error_data?.details || e.message || 'erro desconhecido';
  if (c === 190) return 'Token de acesso inválido ou vencido';
  if (c === 131026) return 'Número não tem WhatsApp ou não pode receber mensagens';
  if (c === 132001) return 'Modelo de mensagem não encontrado ou não aprovado';
  if (c === 132000) return 'Quantidade de variáveis do modelo não confere';
  if (c === 131047) return 'Fora da janela de 24 horas (use um modelo aprovado)';
  if (c === 131030) return 'Número não está na lista de destinatários permitidos do número de teste';
  if (c === 100) return 'Parâmetro inválido: ' + m;
  return m;
}
async function hmac(secret: string, body: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)));
  return 'sha256=' + [...s].map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  try {
    // ---- verificação do webhook pela Meta
    if (req.method === 'GET') {
      if (url.searchParams.get('hub.mode') === 'subscribe') {
        const cfg = await rpc('esc_wa_interno', { p_token: null });
        if (url.searchParams.get('hub.verify_token') === cfg.verify_token) return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 });
        return new Response('token de verificação incorreto', { status: 403 });
      }
      return json({ ok: true, servico: 'escalas-whatsapp' });
    }
    const corpo = await req.text();
    let b: any = {}; try { b = JSON.parse(corpo || '{}'); } catch { return json({ erro: 'JSON inválido' }, 400); }

    // ---- eventos do webhook (status das mensagens)
    if (b.object === 'whatsapp_business_account') {
      const cfg = await rpc('esc_wa_interno', { p_token: null });
      if (cfg.app_secret) { const sig = req.headers.get('x-hub-signature-256') || ''; if (sig !== await hmac(cfg.app_secret, corpo)) return new Response('assinatura inválida', { status: 401 }); }
      for (const en of b.entry || []) for (const ch of en.changes || []) for (const st of ch.value?.statuses || []) {
        const err = st.errors?.[0]; await rpc('esc_wa_status', { p_wamid: st.id, p_status: st.status, p_erro: err ? traduzir(err) + (err.code ? ` (código ${err.code})` : '') : null });
      }
      return json({ ok: true });
    }

    // ---- chamadas do sistema
    let cfg: any;
    try { cfg = await rpc('esc_wa_interno', { p_token: b.token ?? '' }); }
    catch (e) { return json({ erro: String((e as Error).message).includes('SESSAO_INVALIDA') ? 'SESSAO_INVALIDA' : String((e as Error).message) }, 401); }
    const configurado = !!(cfg.phone_id && cfg.token);

    if (b.acao === 'status') {
      if (!configurado) return json({ configurado: false });
      const r = await fetch(`${GRAPH}/${cfg.phone_id}?fields=display_phone_number,verified_name,quality_rating,code_verification_status`, { headers: { Authorization: `Bearer ${cfg.token}` } });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) return json({ configurado: true, ok: false, erro: traduzir(j.error || {}) });
      return json({ configurado: true, ok: true, numero: j.display_phone_number, nome: j.verified_name, qualidade: j.quality_rating, modelo: cfg.template, idioma: cfg.idioma });
    }
    if (!configurado) return json({ erro: 'API_NAO_CONFIGURADA' }, 400);

    if (b.acao === 'teste') {
      const para = soDigitos(b.para); if (para.length < 12) return json({ erro: 'Número do administrador inválido' }, 400);
      try { const id = await enviarModelo(cfg, para, b.params || []); return json({ ok: true, wamid: id }); }
      catch (e) { return json({ ok: false, erro: (e as Error).message }); }
    }

    if (b.acao === 'enviar') {
      const itens = Array.isArray(b.itens) ? b.itens.slice(0, 60) : [];
      const res: any[] = [];
      for (const it of itens) {
        const para = soDigitos(it.telefone);
        if (para.length < 12) { res.push({ id: it.id, status: 'erro', erro: 'Número inválido' }); continue; }
        const dados = { chave: it.id, tipo: it.tipo, periodo: it.periodo, rotulo: it.rotulo, fid: it.fid, nome: it.nome, setor: it.setor, telefone: para, hash: it.hash, texto: it.texto };
        const reserva = await rpc('esc_wa_reservar', { p_id: it.id, p_dados: dados, p_forcar: !!it.forcar });
        if (reserva !== 'OK') { res.push({ id: it.id, status: reserva === 'DUPLICADO' ? 'duplicado' : 'em_andamento' }); continue; }
        try {
          const wamid = await enviarModelo(cfg, para, it.params || []);
          await rpc('esc_wa_registrar', { p_id: it.id, p_status: 'enviado', p_wamid: wamid, p_erro: null });
          res.push({ id: it.id, status: 'enviado', wamid });
        } catch (e) {
          await rpc('esc_wa_registrar', { p_id: it.id, p_status: 'erro', p_wamid: null, p_erro: (e as Error).message });
          res.push({ id: it.id, status: 'erro', erro: (e as Error).message });
        }
      }
      return json({ ok: true, resultados: res });
    }
    return json({ erro: 'Ação desconhecida' }, 400);
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});
