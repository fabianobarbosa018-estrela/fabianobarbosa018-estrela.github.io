// Telas da IA no navegador simulado (a API da IA é simulada)
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
// professor
const P = abrir(); await P.login('professor', 'Prof@2026'); await P.espera(() => P.$('#nav [data-go="p_ia"]'));
t('menu do professor tem "Gerar com IA"', !!P.$('#nav [data-go="p_ia"]'));
P.click('#nav [data-go="p_ia"]'); await P.espera(() => P.$('[data-a="iaGerar"]'));
t('tela do gerador com foto, galeria e PDF', P.$$('[data-iaf]').length === 3 && /Usos hoje/.test(P.txt('#main')));
t('aviso para não enviar dados de alunos', /Não envie fotos com nomes/.test(P.txt('#main')));
P.click('[data-a="iaGerar"]'); await P.espera(() => P.txt('#iaErr'));
t('exige material', /Escreva o assunto ou envie/.test(P.txt('#iaErr')));
const inp = P.$('[data-iaf="img"][multiple]'); Object.defineProperty(inp, 'files', { value: [{ name: 'pag1.jpg', type: 'image/jpeg', size: 10 }, { name: 'pag2.jpg', type: 'image/jpeg', size: 10 }] });
inp.dispatchEvent(new P.w.Event('change', { bubbles: true })); await P.espera(() => P.$$('#iaLista .ft').length === 2);
t('pré-visualiza as fotos', P.$$('#iaLista .ft').length === 2);
P.click('[data-a="iaRm"][data-i="1"]'); await P.espera(() => P.$('[data-a="iaGerar"]') && P.$$('#iaLista .ft').length === 1);
t('remove foto', P.$$('#iaLista .ft').length === 1);
P.set('#iaQtd', '5'); P.set('#iaDisc', 'Ciências'); P.set('#iaSerie', '6º ano');
P.click('[data-a="iaGerar"]'); await P.espera(() => P.$('#edw [data-e=titulo]'), 4000);
t('abre o editor com as questões geradas', P.$('#edw [data-e=titulo]') && P.$('#edw [data-e=titulo]').value === 'Rochas (IA)', P.txt('#main').slice(0, 300));
t('aviso de revisão', /2 questões geradas pela IA/.test(P.txt('#main')));
t('gabarito carregado no editor', P.$('#edw [data-a="qCor"][data-i="0"][data-j="1"]').checked && P.$('#edw [data-qo="0"][data-j="1"]').value === 'Magmática');
P.set('#edw [data-qe="0"][data-f=enunciado]', 'O granito (rocha do magma) é:');
P.click(P.$$('#edw [data-turma]')[0]); P.$$('#edw [data-turma]')[0].checked = true; P.$$('#edw [data-turma]')[0].dispatchEvent(new P.w.Event('change', { bubbles: true }));
P.click('#edw [data-a="edSalvar"][data-s="publicada"]'); await P.espera(() => /Entregaram/.test(P.txt('#main')), 3000);
t('publica a atividade gerada (com edição)', /Rochas \(IA\)/.test(P.txt('#main')), P.txt('#edErr'));
// aluno
const A = abrir(); await A.login('aluno', 'Aluno@2026'); await A.espera(() => A.$('#nav [data-go="a_tutor"]'));
t('menu do aluno tem "Tutor IA"', !!A.$('#nav [data-go="a_tutor"]') && !A.$('#nav [data-go="p_ia"]'));
A.click('#nav [data-go="a_atividades"]'); await A.espera(() => /Rochas \(IA\)/.test(A.txt('#main')));
t('aluno vê a atividade gerada', /Rochas \(IA\)/.test(A.txt('#main')));
A.click(A.$$('#main .it').find(x => /Rochas \(IA\)/.test(x.textContent))); await A.espera(() => A.$('#main [data-go="a_tutor"]'), 3000);
t('atividade tem botão do tutor', !!A.$('#main [data-go="a_tutor"]'));
A.click('#main [data-go="a_tutor"]'); await A.espera(() => A.$('#tutTxt'));
t('tutor abre já na atividade', A.$('#tutAtiv').selectedOptions[0].textContent.includes('Rochas'));
A.set('#tutTxt', 'O que são números primos?'); A.click('[data-a="tutEnviar"]'); await A.espera(() => /só dois divisores/.test(A.txt('#tutChat')), 3000);
t('tutor responde no chat com formatação', /só dois divisores/.test(A.txt('#tutChat')) && !!A.$('#tutChat b'));
t('aviso de privacidade', /não ficam salvas/.test(A.txt('#main')) && /Google \(Gemini\)/.test(A.txt('#main')) && /Nunca escreva seu nome/.test(A.txt('#main')));
t('tutor sem botão de foto no Gemini', !A.$('#tutFoto'));
// admin
const D = abrir(); await D.login('admin', 'Admin@2026'); await D.espera(() => D.$('#fTs'));
D.set('#fTs [name=atual]', 'Admin@2026'); D.set('#fTs [name=nova]', 'Adm#2026x'); D.set('#fTs [name=nova2]', 'Adm#2026x'); D.$('#fTs').dispatchEvent(new D.w.Event('submit', { bubbles: true, cancelable: true }));
await D.espera(() => D.$('#nav [data-go="ad_ia"]'));
D.click('#nav [data-go="ad_ia"]'); await D.espera(() => /Custo no mês/.test(D.txt('#main')));
t('admin vê serviço Gemini selecionado', D.$('[name=iaProvedor]').value === 'gemini');
t('admin vê uso e custos da IA', /Custo no mês/.test(D.txt('#main')) && /Gerador: 1/.test(D.txt('#main')) && /Tutor: 1/.test(D.txt('#main')), D.txt('#main').slice(0, 300));
// IA desligada: botões somem
const tkD = D.w.localStorage.getItem('sd_token'); await E.api(tkD, 'iaConfigSalvar', { iaAtiva: false, iaLimiteProfDia: 20, iaLimiteAlunoDia: 40 });
const A2 = abrir(); await A2.login('aluno', 'Aluno@2026'); await sleep(200);
t('IA desligada: aluno não vê Tutor', !A2.$('#nav [data-go="a_tutor"]'));
A2.click('#nav [data-go="a_atividades"]'); await A2.espera(() => A2.$('#main .it')); A2.click(A2.$$('#main .it')[0]); await A2.espera(() => A2.$('.savebar'));
t('IA desligada: sem botão do tutor na atividade', !A2.$('#main [data-go="a_tutor"]'));
const P2 = abrir(); await P2.login('professor', 'Prof@2026'); await sleep(200);
t('IA desligada: professor não vê Gerar com IA', !P2.$('#nav [data-go="p_ia"]'));
t('IA desligada: admin ainda vê a tela para religar', !!D.$('#nav [data-go="ad_ia"]'));
const todos = [P, A, D, A2, P2].flatMap(b => b.erros); t('sem erros de JavaScript', !todos.length, todos.join(' | '));
console.log(`\nIA (telas): ${ok} testes OK, ${falhas} falha(s)`); process.exit(0);
