// Telas da IA no navegador simulado (a API da IA é simulada)
import { criarAmbiente } from './ambiente.mjs'; import { JSDOM } from 'jsdom'; import fs from 'fs';
let ok = 0, falhas = 0; const t = (n, c, x) => { if (c) ok++; else { falhas++; console.log('❌ ' + n, x !== undefined ? String(x).slice(0, 300) : ''); } };
const E = await criarAmbiente(); await E.instalar();
E.ia.resposta = corpo => corpo.tools ? { status: 200, corpo: { usage: { input_tokens: 4000, output_tokens: 2500 }, content: [{ type: 'tool_use', input: { titulo: 'Rochas (IA)', disciplina: 'Ciências', resumo: 'Resumo do livro sobre rochas.', questoes: [
  { tipo: 'mc', enunciado: 'O granito é uma rocha:', opcoes: ['Sedimentar', 'Magmática', 'Metamórfica', 'Fóssil'], correta_indice: 1, explicacao: 'Vem do magma.' },
  { tipo: 'vf', enunciado: 'Fósseis aparecem em rochas sedimentares.', correta_vf: true, explicacao: 'Sim.' }] } }] } }
  : { status: 200, corpo: { usage: { input_tokens: 800, output_tokens: 120 }, content: [{ type: 'text', text: 'Boa pergunta! **Números primos** têm só dois divisores.\n- 2\n- 3' }] } };
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
// professor
const P = abrir(); await P.login('professor', 'Prof@2026');
t('menu do professor tem "Gerar com IA"', !!P.$('#nav [data-go="p_ia"]'));
P.click('#nav [data-go="p_ia"]'); await P.espera(() => P.$('[data-a="iaGerar"]'));
t('tela do gerador com foto, galeria e PDF', P.$$('[data-iaf]').length === 3 && /Usos hoje/.test(P.txt('#main')));
P.click('[data-a="iaGerar"]'); await P.espera(() => P.txt('#iaErr'));
t('exige material', /Envie pelo menos/.test(P.txt('#iaErr')));
const inp = P.$('[data-iaf="img"][multiple]'); Object.defineProperty(inp, 'files', { value: [{ name: 'pag1.jpg', type: 'image/jpeg', size: 10 }, { name: 'pag2.jpg', type: 'image/jpeg', size: 10 }] });
inp.dispatchEvent(new P.w.Event('change', { bubbles: true })); await P.espera(() => P.$$('#iaLista .ft').length === 2);
t('pré-visualiza as fotos', P.$$('#iaLista .ft').length === 2);
P.click('[data-a="iaRm"][data-i="1"]'); await P.espera(() => P.$('[data-a="iaGerar"]') && P.$$('#iaLista .ft').length === 1);
t('remove foto', P.$$('#iaLista .ft').length === 1);
P.set('#iaQtd', '5'); P.set('#iaDisc', 'Ciências'); P.set('#iaSerie', '6º ano');
P.click('[data-a="iaGerar"]'); await P.espera(() => P.$('#edw [data-e=titulo]'), 4000);
t('abre o editor com as questões geradas', P.$('#edw [data-e=titulo]') && P.$('#edw [data-e=titulo]').value === 'Rochas (IA)', P.txt('#main').slice(0, 300));
t('aviso de revisão e custo', /2 questões geradas pela IA/.test(P.txt('#main')) && /Custo desta geração/.test(P.txt('#main')));
t('gabarito carregado no editor', P.$('#edw [data-a="qCor"][data-i="0"][data-j="1"]').checked && P.$('#edw [data-qo="0"][data-j="1"]').value === 'Magmática');
P.set('#edw [data-qe="0"][data-f=enunciado]', 'O granito (rocha do magma) é:');
P.click(P.$$('#edw [data-turma]')[0]); P.$$('#edw [data-turma]')[0].checked = true; P.$$('#edw [data-turma]')[0].dispatchEvent(new P.w.Event('change', { bubbles: true }));
P.click('#edw [data-a="edSalvar"][data-s="publicada"]'); await P.espera(() => /Entregaram/.test(P.txt('#main')), 3000);
t('publica a atividade gerada (com edição)', /Rochas \(IA\)/.test(P.txt('#main')), P.txt('#edErr'));
// aluno
const A = abrir(); await A.login('aluno', 'Aluno@2026');
t('menu do aluno tem "Tutor IA"', !!A.$('#nav [data-go="a_tutor"]') && !A.$('#nav [data-go="p_ia"]'));
A.click('#nav [data-go="a_atividades"]'); await A.espera(() => /Rochas \(IA\)/.test(A.txt('#main')));
t('aluno vê a atividade gerada', /Rochas \(IA\)/.test(A.txt('#main')));
A.click(A.$$('#main .it').find(x => /Rochas \(IA\)/.test(x.textContent))); await A.espera(() => A.$('#main [data-go="a_tutor"]'));
t('atividade tem botão do tutor', !!A.$('#main [data-go="a_tutor"]'));
A.click('#main [data-go="a_tutor"]'); await A.espera(() => A.$('#tutTxt'));
t('tutor abre já na atividade', A.$('#tutAtiv').selectedOptions[0].textContent.includes('Rochas'));
A.set('#tutTxt', 'O que são números primos?'); A.click('[data-a="tutEnviar"]'); await A.espera(() => /só dois divisores/.test(A.txt('#tutChat')), 3000);
t('tutor responde no chat com formatação', /só dois divisores/.test(A.txt('#tutChat')) && !!A.$('#tutChat b'));
t('aviso de privacidade', /não ficam salvas/.test(A.txt('#main')));
// admin
const D = abrir(); await D.login('admin', 'Admin@2026'); await D.espera(() => D.$('#fTs'));
D.set('#fTs [name=atual]', 'Admin@2026'); D.set('#fTs [name=nova]', 'Adm#2026x'); D.set('#fTs [name=nova2]', 'Adm#2026x'); D.$('#fTs').dispatchEvent(new D.w.Event('submit', { bubbles: true, cancelable: true }));
await D.espera(() => D.$('#nav [data-go="ad_ia"]'));
D.click('#nav [data-go="ad_ia"]'); await D.espera(() => /Custo no mês/.test(D.txt('#main')));
t('admin vê uso e custos da IA', /Custo no mês/.test(D.txt('#main')) && /Gerador: 1/.test(D.txt('#main')) && /Tutor: 1/.test(D.txt('#main')), D.txt('#main').slice(0, 300));
const todos = [P, A, D].flatMap(b => b.erros); t('sem erros de JavaScript', !todos.length, todos.join(' | '));
console.log(`\nIA (telas): ${ok} testes OK, ${falhas} falha(s)`); process.exit(0);
