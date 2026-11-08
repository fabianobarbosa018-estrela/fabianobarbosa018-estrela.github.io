// SALA DIGITAL — camada de servidor: liga o núcleo ao banco (PostgreSQL) e ao armazenamento de fotos
import { criarNucleo } from './core.js';
export function criarServidor(io) {
  const N = criarNucleo({ sha256b64: io.sha256b64, uuid: io.uuid, senhasAleatorias: !!io.senhasAleatorias });
  async function gravar(x) {
    for (const u of x.uploads) await io.enviar(u);
    if (x.ops.length) await io.aplicar(x.ops);
    for (const f of x.rpc) await io.rpc(f);
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
    } else {
      // em caso de erro nada é gravado, exceto contadores de segurança (tentativas) e o registro de auditoria
      const seg = x.ops.filter(o => o.op === 'kv' || o.t === 'Log');
      if (seg.length) { try { await io.aplicar(seg); } catch (e) { } }
    }
    return resp;
  }
  async function instalar() { const x = N.instalar(await io.carregar()); await gravar(x); return x.msgs; }
  return { processar, instalar, nucleo: N };
}
