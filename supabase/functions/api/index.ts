// SALA DIGITAL — Edge Function "api" (Supabase)
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { criarServidor } from "./handler.js";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BUCKET = "sala-digital";
const S = criarServidor({
  carregar: async () => { const { data, error } = await sb.rpc("sd_carregar"); if (error) throw new Error(error.message); return data; },
  aplicar: async (ops: unknown) => { const { error } = await sb.rpc("sd_aplicar", { ops }); if (error) throw new Error(error.message); },
  rpc: async (f: string) => { const { error } = await sb.rpc(f); if (error) throw new Error(error.message); },
  enviar: async (u: { caminho: string; mime: string; b64: string }) => {
    const { error } = await sb.storage.from(BUCKET).upload(u.caminho, Buffer.from(u.b64, "base64"), { contentType: u.mime, upsert: false });
    if (error) throw new Error(error.message);
  },
  remover: async (c: string) => { await sb.storage.from(BUCKET).remove([c]); },
  assinar: async (c: string) => { const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(c, 3600); if (error) throw new Error(error.message); return data.signedUrl; },
  sha256b64: (s: string) => createHash("sha256").update(s, "utf8").digest("base64"),
  uuid: () => randomUUID(),
  senhasAleatorias: true,
});
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info" };
const json = (o: unknown, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") return json({ ok: true, servico: "Sala Digital", hora: Date.now() });
  try {
    const body = await req.json();
    return json(await S.processar(body));
  } catch (e) {
    console.error("erro", e);
    return json({ ok: false, erro: "Servidor indisponível no momento. Tente novamente em instantes." });
  }
});
