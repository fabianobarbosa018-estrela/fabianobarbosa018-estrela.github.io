// Telas do Desafio Diário e da área única de atividades (navegador simulado; IA simulada)
import { criarAmbiente } from './ambiente.mjs'; import { JSDOM } from 'jsdom'; import fs from 'fs';
let ok = 0, falhas = 0; const t = (n, c, x) => { if (c) ok++; else { falhas++; console.log('❌ ' + n, x !== undefined ? String(x).slice(0, 300) : ''); } };
const E = await criarAmbiente(); await E.instalar();
const _orig = corpo => corpo.tools ? { status: 200, corpo: { usage: { input_tokens: 4000, output_tokens: 2500 }, content: [{ type: 'tool_use', input: { titulo: 'Rochas (IA)', disciplina: 'Ciências', resumo: 'Resumo do livro sobre rochas.', questoes: [
  { tipo: 'mc', enunciado: 'O granito é uma rocha:', opcoes: ['Sedimentar', 'Magmática', 'Metamórfica', 'Fóssil'], correta_indice: 1, explicacao: 'Vem do magma.' },
  { tipo: 'vf', enunciado: 'Fósseis aparecem em rochas sedimentares.', correta_vf: true, explicacao: 'Sim.' }] } }] } }
  : { status: 200, corpo: { usage: { input_tokens: 800, output_tokens: 120 }, content: [{ type: 'text', text: 'Boa pergunta! **Números primos** têm só dois divisores.\n- 2\n- 3' }] } };
E.ia.resposta = (corpo, url) => {
  if (!/generativelanguage/.test(url)) return _orig(corpo);
  if (corpo.generationConfig && corpo.generationConfig.responseMimeType) { const r = _orig({ tools: 1 }); return { status: 200, corpo: { candidates: [{ content: { parts: [{ text: JSON.stringify(r.corpo.content[0].input) }] } }] } }; }
  const r = _orig({}); return { status: 200, corpo: { candidates: [{ content: { parts: [{ text: r.corpo.content[0].text }] } }] } };
};
const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8'); const sleep = ms => new Promise(r => setTimeout(r, ms));
function abrir() { const erros = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://sala.test/', beforeParse(w) {
    w.scrollTo = () => { }; w.Element.prototype.scrollIntoView = function () { }; w.addEventListener('error', e => erros.push(e.message));
    w.fetch = async (u, op) => { const b = JSON.parse(op.body); const r = await E.api(b.token, b.acao, b.d); return { json: async () => r }; }; } });
  const w = dom.window, d = w.document; w.comprimir = async () => 'data:image/jpeg;base64,' + Buffer.from('foto').toString('base64');
  const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)], txt = s => ($(s) || {}).textContent || '';
  const click = el => { if (typeof el === 'string') el = $(el); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const set = (s, v) => { const el = $(s); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const espera = async (fn, ms = 2000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { } await sleep(10); } return false; };
  const login = async (u, s) => { await espera(() => $('#fLogin')); set('#fLogin [name=login]', u); set('#fLogin [name=senha]', s); $('#fLogin').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await espera(() => $('#main') && !$('#main .spin')); };
  return { w, d, $, $$, txt, click, set, espera, login, erros }; }
let serial = 0;
// IA simulada: gera as questões pedidas e, na revisão, reprova a primeira de cada lote
function iaSimulada(corpo) {
  const txt = corpo.contents[0].parts[0].text;
  if (/reprovadas/.test(txt)) return { status: 200, corpo: { usageMetadata: {}, candidates: [{ content: { parts: [{ text: JSON.stringify({ reprovadas: [{ i: 0, motivo: 'gabarito duvidoso' }] }) }] } }] } };
  const qtd = /Quantidade por disciplina: ([^\n]+)\./.exec(txt)[1].split('; ');
  const qs = [];
  qtd.forEach(p => { const m = /^(.+?) (\d+) \((sendo (\d+) discursiva|todas objetivas)\)/.exec(p); const disc = m[1], n = +m[2], nd = +(m[4] || 0);
    for (let i = 0; i < n; i++) { serial++;
      if (i < nd) qs.push({ disciplina: disc, assunto: 'Assunto ' + i, tipo: 'disc', dificuldade: 2, enunciado: `Questão discursiva número ${serial} de ${disc}: explique o conceito.`, explicacao: 'Resposta esperada.' });
      else if (i % 3 === 2) qs.push({ disciplina: disc, assunto: 'Assunto ' + i, tipo: 'vf', dificuldade: 1, enunciado: `Afirmação número ${serial} de ${disc} para julgar.`, correta_vf: i % 2 === 0, explicacao: 'Porque sim.' });
      else qs.push({ disciplina: disc, assunto: 'Assunto ' + i, tipo: 'mc', dificuldade: 2, enunciado: `Pergunta número ${serial} de ${disc}?`, opcoes: ['Certa ' + serial, 'Errada A', 'Errada B', 'Errada C'], correta_indice: 0, explicacao: 'A primeira é a certa.' });
    } });
  qs.push({ disciplina: 'Português', tipo: 'mc', enunciado: 'Questão defeituosa sem gabarito', opcoes: ['a', 'b'], explicacao: 'x' });
  return { status: 200, corpo: { usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 5000 }, candidates: [{ content: { parts: [{ text: JSON.stringify({ questoes: qs }) }] } }] } };
}

E.ia.resposta = iaSimulada;
const AD0 = (await E.api('', 'entrar', { login: 'admin', senha: 'Admin@2026' })).d.token; await E.api(AD0, 'trocarSenha', { atual: 'Admin@2026', nova: 'Adm#2026x' });
await E.api(AD0, 'desafioConfigSalvar', { global: { ativo: true, ia: true, abertura: '23:58', encerramento: '23:59', diasPrazo: 1, liberar: 'encerramento', discursivas: 3, nivelPadrao: 'F2', placar: true } });
const P = abrir(); await P.login('professor', 'Prof@2026'); await P.espera(() => P.$('#nav [data-go="p_atividades"]'));
t('menu enxuto: Banco e IA saíram do menu', !P.$('#nav [data-go="p_banco"]') && !P.$('#nav [data-go="p_ia"]'));
P.click('#nav [data-go="p_atividades"]'); await P.espera(() => P.$('.hub [data-go="p_ia"]'));
t('área única com as abas', ['p_atividades', 'p_desafio', 'p_banco', 'p_ia'].every(k => P.$(`.hub [data-go="${k}"]`)), P.$$('.hub button').map(b => b.textContent));
P.click('.hub [data-go="p_desafio"]'); await P.espera(() => P.$('[data-a="dzGerar"]'));
t('painel do desafio: falta preparar', /Falta preparar/.test(P.txt('#main')) && P.$('[data-tniv]'));
t('aba ativa continua marcada no menu', P.$('#nav [data-go="p_atividades"]').classList.contains('on'));
P.click('[data-a="dzGerar"]'); await P.espera(() => !/Falta preparar/.test(P.txt('#main')) && /Desafio do dia/.test(P.txt('#main')), 5000);
t('prepara o desafio com IA', /IA \(revisada\)/.test(P.txt('#main')), P.txt('#main').slice(0, 400));
P.set('#dzMAb', '23:50'); P.click('[data-a="dzSalvarMeu"]'); await P.espera(() => /abre hoje às 23:50|abre amanhã às 23:50/.test(P.txt('#main')), 3000);
t('professor muda o horário de abertura', /às 23:50/.test(P.txt('#main')));
// aluno: cartão com contagem regressiva
const A = abrir(); await A.login('aluno', 'Aluno@2026'); await A.espera(() => A.$('.desafio'));
t('início mostra o desafio do dia', /Desafio do dia/.test(A.txt('.desafio')) && /Abre em/.test(A.txt('.desafio')));
const c1 = A.txt('.desafio .cd'); await new Promise(r => setTimeout(r, 1300)); const c2 = A.txt('.desafio .cd');
t('contagem regressiva andando', c1 && c2 && c1 !== c2, [c1, c2]);
const id = (await E.q("select id from sd_atividades where data->>'tipo' = 'desafio'"))[0].id;
await E.q("update sd_atividades set data = jsonb_set(jsonb_set(data, '{abertura}', to_jsonb((extract(epoch from now()) * 1000)::bigint - 60000)), '{encerramento}', to_jsonb((extract(epoch from now()) * 1000)::bigint + 3600000)) where id = $1", [id]);
A.click('#nav [data-go="a_atividades"]'); await A.espera(() => A.$('.desafio [data-go="a_fazer"]'));
t('atividades: desafio aberto com tempo restante', /Tempo restante/.test(A.txt('.desafio')) && /0 de 50 respondidas/.test(A.txt('.desafio')));
t('listas normais não misturam o desafio', !A.$$('.list .it').some(x => /Desafio do dia/.test(x.textContent)));
t('aba Desafios', A.$$('.tabs button').some(b => /Desafios/.test(b.textContent)));
A.click('.desafio [data-go="a_fazer"]'); await A.espera(() => A.$('.dz-barra') && A.$$('.q').length === 50);
t('tela do desafio com barra do tempo e 50 questões', /Tempo restante/.test(A.txt('.dz-barra')));
t('questões mostram a disciplina', A.$$('.q .qtag').some(x => /Geografia/.test(x.textContent)));
// responde tudo
A.$$('.q').forEach((q, i) => { const r = q.querySelector('input[type=radio]'); if (r) { r.checked = true; r.dispatchEvent(new A.w.Event('change', { bubbles: true })); } const ta = q.querySelector('textarea'); if (ta) { ta.value = 'Minha resposta'; ta.dispatchEvent(new A.w.Event('input', { bubbles: true })); } });
A.click('[data-a="enviarAtiv"]'); await A.espera(() => A.$('#cOk')); A.click('#cOk');
await A.espera(() => /Desafio enviado/.test(A.txt('#sheet')), 6000); if (!/Desafio enviado/.test(A.txt('#sheet'))) console.log('SHEET', A.txt('#sheet'), A.txt('#main').slice(-300));
t('resultado na hora: acertos e erros', /acertos/.test(A.txt('#sheet')) && /erros/.test(A.txt('#sheet')), A.txt('#sheet'));
A.click('[data-a="fecharEnvio"]'); await A.espera(() => /Desafio enviado!/.test(A.txt('#main')));
t('gabarito oculto até a liberação', /depois do encerramento/.test(A.txt('#main')));
A.click('#nav [data-go="a_atividades"]'); await A.espera(() => A.$$('.tabs button').some(b => /Desafios/.test(b.textContent)));
A.click(A.$$('.tabs button').find(b => /Desafios/.test(b.textContent))); await A.espera(() => /Meus desafios/.test(A.txt('#main')));
t('histórico do aluno', /Dias seguidos/.test(A.txt('#main')) && /Desafio de/.test(A.txt('#main')) && /1\s*Desafios enviados/.test(A.txt('#main').replace(/\s+/g, ' ')), A.txt('#main').slice(0, 300));
// encerra e libera o gabarito pela manutenção automática
await E.q("update sd_atividades set data = jsonb_set(data, '{encerramento}', to_jsonb((extract(epoch from now()) * 1000)::bigint - 1000)) where id = $1", [id]);
await E.q("insert into sd_kv(k, v) values ('p:CRON_SEGREDO', 's1')"); await E.processar({ acao: 'desafioCron', segredo: 's1' });
A.click('[data-go="a_fazer"]'); await A.espera(() => A.$('.q .fb'), 3000);
t('depois do encerramento: correção e explicações', A.$$('.q.ok, .q.bad').length > 0 && /💡/.test(A.txt('#main')));
const todos = [P, A].flatMap(b => b.erros); t('sem erros de JavaScript', !todos.length, todos.join(' | '));
console.log(`\nDesafio (telas): ${ok} testes OK, ${falhas} falha(s)`); process.exit(falhas ? 1 : 0);
