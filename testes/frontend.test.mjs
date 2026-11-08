import { criarAmbiente } from './ambiente.mjs';
import { JSDOM } from 'jsdom';
import fs from 'fs';
let ok = 0, falhas = 0;
function t(nome, cond, extra) { if (cond) ok++; else { falhas++; console.log('❌ ' + nome, extra !== undefined ? String(extra).slice(0, 400) : ''); } }
const E = await criarAmbiente(); await E.instalar();
const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function abrir(localToken) {
  const erros = [];
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://script.googleusercontent.com/',
    beforeParse(w) {
      if (localToken) w.localStorage.setItem('sd_token', localToken);
      w.scrollTo = () => { }; w.Element.prototype.scrollIntoView = function () { };
      w.addEventListener('error', e => erros.push(e.message));
      w.fetch = async (url, op) => { const b = JSON.parse(op.body); const r = await E.api(b.token, b.acao, b.d); return { json: async () => r }; };
      w.URL.createObjectURL = () => 'blob:teste';
    } });
  const w = dom.window, d = w.document;
  w.comprimir = async () => 'data:image/jpeg;base64,' + Buffer.from('foto-teste').toString('base64');
  const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
  const txt = s => ($(s) || {}).textContent || '';
  const click = el => { if (typeof el === 'string') el = $(el); if (!el) throw new Error('elemento não encontrado'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const set = (el, v) => { if (typeof el === 'string') el = $(el); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const check = (el, v = true) => { if (typeof el === 'string') el = $(el); el.checked = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const submit = f => { if (typeof f === 'string') f = $(f); f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); };
  const byText = (sel, re) => $$(sel).find(e => re.test(e.textContent));
  const espera = async (fn, ms = 1500) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { } await sleep(10); } return false; };
  return { w, d, $, $$, txt, click, set, check, submit, byText, espera, erros };
}
async function login(B, u, s) {
  await B.espera(() => B.$('#fLogin'));
  B.set('#fLogin [name=login]', u); B.set('#fLogin [name=senha]', s); B.submit('#fLogin');
  await B.espera(() => B.$('#main') && !B.$('#main .spin'));
}
async function navegarTudo(B, nome) {
  const itens = B.$$('#nav button').map(b => b.dataset.go);
  for (const v of itens) {
    B.click(`#nav [data-go="${v}"]`);
    await B.espera(() => !B.$('#main .spin'));
    t(`${nome}: tela ${v} sem erro`, !/Algo deu errado/.test(B.txt('#main')), B.txt('#main').slice(0, 200));
  }
}

(async () => {
  // tela de recuperação de senha
  { const R = abrir(); await R.espera(() => R.$('#fLogin')); R.click('[data-a="authModo"][data-m="recuperar"]'); await R.espera(() => /Esqueceu a senha/.test(R.txt('#root'))); t('recuperação orienta professor/admin', /Nova senha/.test(R.txt('#root'))); }
  // ---------- LOGIN ----------
  let B = abrir();
  await B.espera(() => B.$('#fLogin'));
  t('tela de login', /Entrar/.test(B.txt('#root')) && /Sala Digital/.test(B.txt('#root')));
  B.set('#fLogin [name=login]', 'professor'); B.set('#fLogin [name=senha]', 'errada'); B.submit('#fLogin');
  await B.espera(() => B.txt('#err'));
  t('erro de senha exibido', /incorretos/.test(B.txt('#err')));
  B.click('[data-a="authModo"][data-m="cadastro"]'); await sleep(10);
  t('tela de cadastro com opção aluno/professor', B.$('#fCad') && /Sou professor/.test(B.txt('#root')));
  B.set('#fCad [name=nascimento]', '2013-05-05');
  t('menor mostra campos do responsável', !B.$('#resp').classList.contains('hidden'));
  B.set('#fCad [name=nome]', 'Lia Estudante'); B.set('#fCad [name=login]', 'lia'); B.set('#fCad [name=senha]', 'lia123'); B.set('#fCad [name=senha2]', 'lia123');
  B.set('#fCad [name=responsavelNome]', 'Rosa Mãe'); B.set('#fCad [name=responsavelEmail]', 'rosa@ex.com');
  B.submit('#fCad'); await B.espera(() => B.txt('#err'));
  t('exige aceite da política', /Política/.test(B.txt('#err')));
  B.check('#fCad [name=aceite]'); B.submit('#fCad');
  await B.espera(() => B.$('#main') && /Olá, Lia/.test(B.txt('#main')));
  t('cadastro de aluno entra direto no painel', /Olá, Lia/.test(B.txt('#main')), B.txt('#root').slice(0, 300));
  t('menu do aluno sem área do professor', !B.$('#nav [data-go="p_turmas"]') && B.$('#nav [data-go="a_turmas"]'));
  await navegarTudo(B, 'aluno novo');
  const tokLia = B.w.localStorage.getItem('sd_token');

  // ---------- PROFESSOR ----------
  const P = abrir(); await login(P, 'professor', 'Prof@2026');
  t('professor no painel', /Turmas ativas/.test(P.txt('#main')), P.txt('#root').slice(0, 300));
  t('menu do professor', P.$('#nav [data-go="p_correcoes"]') && !P.$('#nav [data-go="ad_usuarios"]'));
  await navegarTudo(P, 'professor');
  P.click('#nav [data-go="p_turmas"]'); await P.espera(() => P.$('[data-a="turmaForm"]'));
  P.click('[data-a="turmaForm"]'); await P.espera(() => P.$('#fT'));
  P.set('#fT [name=nome]', '8º Ano – Ciências'); P.set('#fT [name=disciplina]', 'Ciências'); P.submit('#fT');
  await P.espera(() => /CÓDIGO PARA OS ALUNOS/.test(P.txt('#main')));
  const codigo = P.txt('#main .code'); t('turma criada com código', /^[A-Z0-9]{6}$/.test(codigo), codigo);

  // aluno pede entrada
  B.click('#nav [data-go="a_turmas"]'); await B.espera(() => B.$('#fCod'));
  B.set('#fCod [name=c]', codigo); B.submit('#fCod');
  await B.espera(() => /Aguardando aprovação/.test(B.txt('#main')));
  t('aluno vê pedido aguardando', /Aguardando aprovação/.test(B.txt('#main')));

  // professor aprova
  P.click('#nav [data-go="p_turmas"]'); await P.espera(() => /8º Ano/.test(P.txt('#main')));
  P.click(P.byText('#main .it', /8º Ano/)); await P.espera(() => P.$('[data-a="matDec"]'));
  t('pedido aparece para o professor', /Lia Estudante/.test(P.txt('#main')));
  P.click('[data-a="matDec"][data-v="1"]'); await P.espera(() => /Alunos \(1\)/.test(P.txt('#main')));
  t('aluno aprovado na turma', /Alunos \(1\)/.test(P.txt('#main')));
  // cadastrar aluno pelo professor
  P.click('[data-a="alunoForm"]'); await P.espera(() => P.$('#fA'));
  P.set('#fA [name=nome]', 'Caio Sem Email'); P.set('#fA [name=login]', 'caio'); P.check('#fA [name=aut]'); P.submit('#fA');
  await P.espera(() => P.$('#sheet .code'));
  const senhaCaio = P.$$('#sheet .code')[0].textContent; t('professor recebe senha provisória', senhaCaio.length === 8);
  P.click('#sheet [data-a="fechar"]');

  // nova atividade pelo editor
  P.click('#nav [data-go="p_atividades"]'); await P.espera(() => P.byText('#main .btn', /Nova atividade/));
  P.click(P.byText('#main .btn', /Nova atividade/)); await P.espera(() => P.$('#edw [data-e=titulo]'));
  P.set('#edw [data-e=titulo]', 'Prova de Ciências'); P.set('#edw [data-e=disciplina]', 'Ciências');
  P.set('#edw [data-e=tipo]', 'prova');
  const cbTurma = P.$$('#edw [data-turma]').find(x => /8º Ano/.test(x.parentNode.textContent)); P.check(cbTurma);
  P.set('#edw [data-qe="0"][data-f=enunciado]', 'Qual órgão bombeia o sangue?');
  ['Pulmão', 'Coração', 'Fígado', 'Rim'].forEach((v, j) => P.set(`#edw [data-qo="0"][data-j="${j}"]`, v));
  P.click('#edw [data-a="edSalvar"][data-s="publicada"]'); await P.espera(() => P.txt('#edErr'));
  t('editor valida alternativa correta', /marque a alternativa correta/.test(P.txt('#edErr')), P.txt('#edErr'));
  P.click('#edw [data-a="qCor"][data-i="0"][data-j="1"]');
  P.click('#edw [data-a="qAdd"][data-t="vf"]'); await sleep(10);
  P.set('#edw [data-qe="1"][data-f=enunciado]', 'Rochas sedimentares podem conter fósseis.');
  P.click('#edw [data-a="qVf"][data-i="1"][data-v="1"]'); await sleep(10);
  P.click('#edw [data-a="qAdd"][data-t="disc"]'); await sleep(10);
  P.set('#edw [data-qe="2"][data-f=enunciado]', 'Desenhe o ciclo da água no caderno e envie a foto.');
  P.click('#edw [data-a="qApoio"][data-i="2"]'); await sleep(10);
  P.set('#edw [data-qe="2"][data-f=textoApoio]', 'Texto de apoio: a água evapora, condensa e precipita.');
  t('valores preservados após redesenhar', P.$('#edw [data-e=titulo]').value === 'Prova de Ciências' && P.$('#edw [data-qo="0"][data-j="1"]').value === 'Coração');
  P.click('#edw [data-a="edSalvar"][data-s="publicada"]');
  await P.espera(() => /Entregaram/.test(P.txt('#main')), 3000);
  t('atividade publicada e tela de entregas', /Prova de Ciências/.test(P.txt('#main')) && /0\/2/.test(P.txt('#main')), P.txt('#main').slice(0, 300) + P.txt('#edErr'));

  // ---------- ALUNO RESPONDE ----------
  B.click('#nav [data-go="a_atividades"]'); await B.espera(() => B.$('[data-go="a_lista"]')); B.click('[data-go="a_lista"]'); await B.espera(() => /Prova de Ciências/.test(B.txt('#main')));
  t('aluno vê a nova prova', /Prova de Ciências/.test(B.txt('#main')));
  B.click(B.byText('#main .it', /Prova de Ciências/)); await B.espera(() => B.$('.savebar'));
  t('texto de apoio exibido', /a água evapora/.test(B.txt('#main')));
  B.check(B.$('input[name="r0"][value="1"]')); B.check(B.$('input[name="r1"][value="true"]'));
  B.set('textarea[data-q="2"]', 'Evaporação, condensação e precipitação.');
  B.click('[data-a="salvarAgora"]'); await B.espera(() => /Rascunho salvo/.test(B.txt('#svst')));
  t('rascunho salvo', /Rascunho salvo/.test(B.txt('#svst')), B.txt('#svst'));
  // foto
  const inp = B.$('input[data-foto="2"][multiple]');
  Object.defineProperty(inp, 'files', { value: [{ name: 'caderno.jpg', type: 'image/jpeg', size: 1000 }] });
  inp.dispatchEvent(new B.w.Event('change', { bubbles: true }));
  await B.espera(() => B.$('#fotos2 [data-a="rmFoto"]'));
  t('foto enviada e com pré-visualização', !!B.$('#fotos2 img') && !!B.$('#fotos2 [data-a="rmFoto"]'));
  // reabrir mantém rascunho
  B.click('#nav [data-go="a_inicio"]'); await B.espera(() => B.$('[data-go="a_lista"]'));
  t('início mostra as pendências do professor num único link', /Atividades do professor/.test(B.txt('#main')) && !B.$$('#main .list .it').length);
  B.click('[data-go="a_lista"]'); await B.espera(() => /Em andamento/.test(B.txt('#main')));
  t('lista do professor mostra em andamento', /Em andamento/.test(B.txt('#main')));
  B.click(B.byText('#main .it', /Prova de Ciências/)); await B.espera(() => B.$('.savebar'));
  t('respostas recuperadas', B.$('input[name="r0"][value="1"]').checked && /Evaporação/.test(B.$('textarea[data-q="2"]').value) && B.$$('#fotos2 .ft').length === 1);
  B.click('[data-a="enviarAtiv"]'); await B.espera(() => B.$('#cOk'));
  B.click('#cOk'); await B.espera(() => /Atividade enviada!/.test(B.txt('#sheet')));
  t('confirmação de envio com protocolo', /Protocolo/.test(B.txt('#sheet')));
  B.click('[data-a="fecharEnvio"]'); await B.espera(() => /Atividade enviada! A nota/.test(B.txt('#main')));
  t('após envio fica somente leitura', !B.$('textarea[data-q="2"]') && !B.$('.savebar'));

  // ---------- PROFESSOR CORRIGE ----------
  P.click('#nav [data-go="p_correcoes"]'); await P.espera(() => /Lia Estudante/.test(P.txt('#main')));
  t('fila de correções', /Lia Estudante/.test(P.txt('#main')));
  P.click(P.byText('#main .it', /Lia Estudante/)); await P.espera(() => P.$('[data-cp="2"]'));
  t('objetivas já pontuadas', P.$('[data-cp="0"]').value === '1' && P.$('[data-cp="1"]').value === '1', P.$('[data-cp="0"]').value + '/' + P.$('[data-cp="1"]').value);
  t('foto do aluno visível ao professor', P.$$('#main .ft img').length === 1);
  await P.espera(() => P.$('#main .ft img').src.startsWith('data:image'));
  t('foto carregada com permissão', P.$('#main .ft img').src.startsWith('data:image'));
  P.click('[data-a="cpSet"][data-i="2"][data-v="2"]');
  P.set('#coG', 'Ótimo trabalho!'); P.check('#coL');
  P.click('[data-a="coSalvar"]'); await P.espera(() => /Entregaram/.test(P.txt('#main')));
  t('correção salva', /1\/2/.test(P.txt('#main')) && /Liberadas/.test(P.txt('#main')), P.txt('#main').slice(0, 400));

  // ---------- ALUNO VÊ NOTA ----------
  B.click('#nav [data-go="a_notas"]'); await B.espera(() => /Prova de Ciências/.test(B.txt('#main')));
  t('nota no histórico', /10/.test(B.txt('#main table')), B.txt('#main'));
  B.click(B.byText('#main tr', /Prova de Ciências/)); await B.espera(() => B.$('.score'));
  t('aluno vê nota, comentário e gabarito', /Ótimo trabalho/.test(B.txt('#main')) && B.$$('.ch.right').length >= 2);
  B.click('[data-a="pedirRevisao"]'); await B.espera(() => B.$('#rvM'));
  B.set('#rvM', 'Gostaria de entender a correção da questão 3.'); B.click('#rvB');
  await B.espera(() => /Pedido de revisão enviado/.test(B.txt('#main')));
  t('pedido de revisão', /Pedido de revisão enviado/.test(B.txt('#main')));

  // relatórios do professor
  P.click('#nav [data-go="p_relatorios"]'); await P.espera(() => P.$('#selT'));
  P.set('#selT', P.$$('#selT option').find(o => /8º Ano/.test(o.textContent)).value);
  await P.espera(() => /Lia Estudante/.test(P.txt('#main')));
  t('relatório da turma com aluno e nota', /Lia Estudante/.test(P.txt('#main')) && /100%/.test(P.txt('#main')), P.txt('#main').slice(0, 500));
  P.click(P.byText('#main .lnk', /Lia Estudante/)); await P.espera(() => /desempenho individual/.test(P.txt('#main')));
  t('relatório individual do aluno', /Prova de Ciências/.test(P.txt('#main')));

  // duplicar e excluir
  P.click('#nav [data-go="p_atividades"]'); await P.espera(() => /Prova de Ciências/.test(P.txt('#main')));
  P.click(P.byText('#main .it', /Prova de Ciências/)); await P.espera(() => P.$('[data-a="duplicar"]'));
  P.click('[data-a="duplicar"]'); await P.espera(() => P.$('#edw [data-e=titulo]') && /cópia/.test(P.$('#edw [data-e=titulo]').value));
  t('duplicar abre editor da cópia', /cópia/.test(P.$('#edw [data-e=titulo]').value));
  P.click('#edw [data-a="edSalvar"][data-s="rascunho"]'); await P.espera(() => /rascunho/.test(P.txt('#main')));
  P.click('[data-a="ativDel"]'); await P.espera(() => P.$('#cOk')); P.click('#cOk');
  await P.espera(() => /Atividades/.test(P.txt('#main h1')) && !/cópia/.test(P.txt('#main')));
  t('excluir cópia', !/cópia/.test(P.txt('#main')));

  // ---------- ALUNO CRIADO PELO PROFESSOR: troca de senha obrigatória ----------
  const C = abrir(); await login(C, 'caio', senhaCaio);
  await C.espera(() => C.$('#fTs'));
  t('troca de senha obrigatória', !!C.$('#fTs'));
  C.set('#fTs [name=atual]', senhaCaio); C.set('#fTs [name=nova]', 'caio123'); C.set('#fTs [name=nova2]', 'caio123'); C.submit('#fTs');
  await C.espera(() => /Olá, Caio/.test(C.txt('#main')));
  t('após trocar senha entra no painel', /Olá, Caio/.test(C.txt('#main')));
  await C.espera(() => /pendente/.test(C.txt('#main [data-go="a_lista"]'))); t('caio vê a prova da turma', /1 pendente/.test(C.txt('#main [data-go="a_lista"]')), C.txt('#main'));

  // ---------- ADMIN ----------
  const A = abrir(); await login(A, 'admin', 'Admin@2026');
  await A.espera(() => A.$('#fTs'));
  A.set('#fTs [name=atual]', 'Admin@2026'); A.set('#fTs [name=nova]', 'Adm#2026x'); A.set('#fTs [name=nova2]', 'Adm#2026x'); A.submit('#fTs');
  await A.espera(() => /Painel administrativo/.test(A.txt('#main')));
  t('admin no painel', /Painel administrativo/.test(A.txt('#main')));
  await navegarTudo(A, 'admin');
  A.click('#nav [data-go="ad_usuarios"]'); await A.espera(() => /Lia Estudante/.test(A.txt('#main')));
  t('admin lista usuários com menor sinalizado', /menor/.test(A.txt('#main')));
  A.click('[data-a="usNovo"]'); await A.espera(() => A.$('#fU'));
  A.set('#fU [name=perfil]', 'professor'); A.set('#fU [name=nome]', 'Joana Professora'); A.set('#fU [name=login]', 'joana'); A.submit('#fU');
  await A.espera(() => /Usuário criado/.test(A.txt('#sheet')));
  t('admin cria professor', /joana/.test(A.txt('#sheet')));
  A.click('#sheet [data-a="fechar"]');
  A.click('#nav [data-go="ad_config"]'); await A.espera(() => A.$('#fC'));
  A.set('#fC [name=nomePlataforma]', 'Colégio Exemplo'); A.submit('#fC'); await A.espera(() => A.txt('#pnome') === 'Colégio Exemplo');
  t('config altera nome', A.txt('#pnome') === 'Colégio Exemplo');
  A.click('#nav [data-go="ad_relatorios"]'); await A.espera(() => /Desempenho por turma/.test(A.txt('#main')));
  t('relatório geral', /8º Ano/.test(A.txt('#main')) && /Atividades respondidas/.test(A.txt('#main')));
  A.click('[data-a="exportar"]'); await A.espera(() => /notas\.csv/.test(A.txt('#sheet')));
  t('baixar relatórios CSV', /notas\.csv/.test(A.txt('#sheet')) && A.$$('#sheet a[download]').length === 4);
  A.click('#sheet [data-a="fechar"]');
  A.click('#nav [data-go="p_turmas"]'); await A.espera(() => /Prof\. Professor/.test(A.txt('#main')));
  t('admin vê turmas de todos os professores', /Prof\. Professor Demonstração/.test(A.txt('#main')));

  // sair
  B.click('#nav [data-go="perfil"]'); await B.espera(() => B.$('[data-a="sair"]'));
  B.click('[data-a="sair"]'); await B.espera(() => B.$('#fLogin'), 3000);
  t('sair volta ao login', !!B.$('#fLogin') && !B.w.localStorage.getItem('sd_token'));
  // sessão persistida
  const P2 = abrir(P.w.localStorage.getItem('sd_token')); await P2.espera(() => P2.$('#main') && !P2.$('#main .spin'));
  t('sessão lembrada ao reabrir', /Olá, Professor/.test(P2.txt('#main')));
  // XSS
  const X = abrir(); await login(X, 'professor', 'Prof@2026');
  await E.api(P.w.localStorage.getItem('sd_token'), 'turmaSalvar', { nome: '<img src=x onerror=alert(1)>Turma XSS' });
  X.click('#nav [data-go="p_turmas"]'); await X.espera(() => /Turma XSS/.test(X.txt('#main')));
  t('nomes são escapados (sem XSS)', !X.$('#main img[src="x"]'));

  const todosErros = [B, P, C, A, P2, X].flatMap(b => b.erros);
  t('nenhum erro de JavaScript nas telas', todosErros.length === 0, todosErros.join(' | '));
  t('nenhum erro interno no servidor', E.erros.length === 0, E.erros.join(' | '));
  console.log(`\nFRONT-END: ${ok} testes OK, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.log('FALHA GERAL', e.stack); process.exit(1); });
