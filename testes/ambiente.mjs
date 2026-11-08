// Ambiente de teste: PostgreSQL real (PGlite) + armazenamento em memória
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs'; import crypto from 'crypto';
import { criarServidor } from '../server/handler.js';
export async function criarAmbiente(opcoes = {}) {
  const ia = { urls: [], chamadas: [], resposta: () => ({ status: 200, corpo: { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 10, output_tokens: 5 } } }) };
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role;");
  await db.exec(fs.readFileSync(new URL('../sql/schema.sql', import.meta.url), 'utf8'));
  if (!opcoes.semBanco) await db.query("insert into sd_kv(k, v) values ('p:BANCO_CHAVE', $1)", [fs.readFileSync('/home/claude/segredo/banco_chave.txt', 'utf8').trim()]);
  const storage = {}; const erros = [];
  const S = criarServidor({
    carregar: async () => (await db.query('select sd_carregar() as d')).rows[0].d,
    aplicar: async ops => { await db.query('select sd_aplicar($1::jsonb)', [JSON.stringify(ops)]); },
    rpc: async (f, a) => { const ks = Object.keys(a || {}); await db.query('select ' + f + '(' + ks.map((k, i) => k + ' => $' + (i + 1)).join(', ') + ')', ks.map(k => a[k])); },
    chaveIA: opcoes.chaveIA === undefined ? 'chave-teste' : opcoes.chaveIA,
    chaveGemini: opcoes.chaveGemini === undefined ? 'chave-gemini-teste' : opcoes.chaveGemini,
    fetch: async (url, op) => { ia.urls.push(url); ia.chamadas.push(JSON.parse(op.body)); const r = ia.resposta(JSON.parse(op.body), url); return { ok: r.status === 200, status: r.status, json: async () => r.corpo }; },
    enviar: async u => { if (storage[u.caminho]) throw new Error('existe'); storage[u.caminho] = u; },
    remover: async c => { delete storage[c]; },
    assinar: async c => { const u = storage[c]; if (!u) throw new Error('nf'); return 'data:' + u.mime + ';base64,' + u.b64; },
    sha256b64: s => crypto.createHash('sha256').update(s, 'utf8').digest('base64'),
    uuid: () => crypto.randomUUID(),
    banco: async () => fs.readFileSync(new URL('../server/banco.enc.txt', import.meta.url), 'utf8')
  });
  const origErr = console.error; console.error = (...a) => erros.push(a.join(' '));
  const api = async (tk, acao, d) => JSON.parse(JSON.stringify(await S.processar({ token: tk, acao, d: d || {} })));
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  return { ia, db, api, q, storage, erros, instalar: S.instalar, restaurarConsole: () => { console.error = origErr; } };
}
