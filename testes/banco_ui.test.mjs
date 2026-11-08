// Tela do Banco de Atividades no navegador simulado
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

const P = abrir(); await P.login('professor', 'Prof@2026'); await P.espera(() => P.$('#nav [data-go="p_banco"]'));
t('menu do professor tem Banco de Atividades', !!P.$('#nav [data-go="p_banco"]'));
P.click('#nav [data-go="p_banco"]'); await P.espera(() => P.$('[data-a="banDisc"]'));
t('mostra as 8 disciplinas', P.$$('[data-a="banDisc"]').length === 8, P.$$('[data-a="banDisc"]').length);
t('mostra o total de questões', /672 questões/.test(P.txt('#main')), P.txt('.ph'));
P.click('[data-a="banDisc"][data-id="historia"]'); await P.espera(() => P.$$('.banA').length);
t('lista os 11 assuntos de História', P.$$('.banA').length === 11, P.$$('.banA').length);
P.set('#banNivel', 'EM'); await P.espera(() => P.$$('.banA').length && P.$$('.banA').length < 11);
t('filtro de nível', P.$$('.banA').length > 0 && P.$$('.banA').length < 11, P.$$('.banA').length);
P.set('#banNivel', ''); await P.espera(() => P.$$('.banA').length === 11);
P.click('[data-a="banTexto"]'); await P.espera(() => /📄/.test(P.txt('.modal, #modal, body')) && P.$('.apoio'));
t('abre o texto de apoio', P.$('.apoio') && P.$('.apoio').textContent.length > 150);
P.click('[data-a="fechar"]');
P.click('[data-a="banMontar"]'); await P.espera(() => P.txt('#banErr'));
t('exige assunto marcado', /Marque pelo menos um assunto/.test(P.txt('#banErr')));
const cb = P.$$('.banA'); cb[0].checked = true; cb[0].dispatchEvent(new P.w.Event('change', { bubbles: true })); cb[1].checked = true; cb[1].dispatchEvent(new P.w.Event('change', { bubbles: true }));
P.set('#banQtd', '8');
P.click('[data-a="banMontar"]'); await P.espera(() => /Banco de Atividades<\/b>/.test(P.$('#main').innerHTML) || /questões do Banco/.test(P.txt('#main')), 4000);
t('abre o editor com as questões do banco', /8 questões do Banco de Atividades/.test(P.txt('#main')), P.txt('#main').slice(0, 300));
t('editor recebeu título e texto de apoio', /História/.test(P.$('[data-e="titulo"]').value) && /📄/.test((P.$('[data-e="instrucoes"]') || {}).value || ''));
// volta e testa o botão de IA (IA ligada por padrão)
P.click('#nav [data-go="p_banco"]'); await P.espera(() => P.$('[data-a="banIA"]'));
t('oferece criar com IA', !!P.$('[data-a="banIA"]'));
P.click('[data-a="banIA"]'); await P.espera(() => P.txt('#banErr') || P.$('#iaAssunto'));
const marcados = P.$$('.banA').filter(x => x.checked).length;
if (marcados !== 1) { t('pede um único assunto para IA', /exatamente um/.test(P.txt('#banErr'))); P.click('[data-a="banNenhum"]'); await P.espera(() => P.$$('.banA').every(x => !x.checked)); const c = P.$$('.banA')[2]; c.checked = true; c.dispatchEvent(new P.w.Event('change', { bubbles: true })); P.click('[data-a="banIA"]'); await P.espera(() => P.$('#iaAssunto')); }
t('IA abre com assunto e nível preenchidos', P.$('#iaAssunto') && P.$('#iaAssunto').value.length > 3 && P.$('#iaNivel').value !== '', P.$('#iaAssunto') && P.$('#iaAssunto').value);
// aluno não vê
const A = abrir(); await A.login('aluno', 'Aluno@2026'); await A.espera(() => A.$('#nav'));
t('aluno não vê o Banco de Atividades', !A.$('#nav [data-go="p_banco"]'));
const D = abrir(); await D.login('admin', 'Admin@2026'); await sleep(300);
const todos = [P, A].flatMap(b => b.erros); t('sem erros de JavaScript', !todos.length, todos.join(' | '));
console.log(`\nBanco (telas): ${ok} testes OK, ${falhas} falha(s)`); process.exit(falhas ? 1 : 0);
