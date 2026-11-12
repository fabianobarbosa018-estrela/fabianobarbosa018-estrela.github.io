// Testes do Banco de Atividades (conteúdo real, criptografado)
import { criarAmbiente } from './ambiente.mjs';
import fs from 'fs';
let ok = 0, falhas = 0;
const t = (n, c, x) => { if (c) ok++; else { falhas++; console.log('❌ ' + n, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } };
const E = await criarAmbiente({ semBanco: true }); await E.instalar(); const { api, q } = E;
const P = (await api('', 'entrar', { login: 'professor', senha: 'Prof@2026' })).d.token;
const A = (await api('', 'entrar', { login: 'aluno', senha: 'Aluno@2026' })).d.token;
const AD = (await api('', 'entrar', { login: 'admin', senha: 'Admin@2026' })).d.token; await api(AD, 'trocarSenha', { atual: 'Admin@2026', nova: 'Adm#2026x' });
let r = await api(P, 'bancoIndice'); t('sem chave: avisa que não foi instalado', !r.ok && /instalado/.test(r.erro), r);
await q("insert into sd_kv(k, v) values ('p:BANCO_CHAVE', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')");
r = await api(P, 'bancoIndice'); t('chave errada: erro amigável, sem travar', !r.ok && /Não foi possível abrir/.test(r.erro), r);
const chave = fs.readFileSync('/home/claude/segredo/banco_chave.txt', 'utf8').trim();
await q("update sd_kv set v = $1 where k = 'p:BANCO_CHAVE'", [chave]);
r = await api(A, 'bancoIndice'); t('aluno não acessa o banco', !r.ok && /permissão/.test(r.erro), r);
r = await api(A, 'bancoMontar', { disciplina: 'matematica', assuntos: [0], quantidade: 5 }); t('aluno não monta atividade (gabarito protegido)', !r.ok, r);
r = await api(P, 'bancoIndice'); t('professor vê o índice', r.ok, r);
const I = r.d;
const esperado = { portugues: 12, matematica: 35, historia: 12, geografia: 11, ciencias_biologia: 15, fisica: 17, quimica: 14, educacao_fisica: 12 };
t('8 disciplinas', I.disciplinas.length === 8, I.disciplinas.map(d => d.id));
for (const [id, n] of Object.entries(esperado)) { const d = I.disciplinas.find(x => x.id === id); t('assuntos de ' + id, d && d.assuntos.length === n, d && d.assuntos.length); }
t('índice não traz gabaritos nem textos', !JSON.stringify(I).includes('"q"') && !JSON.stringify(I).includes('correta'));
t('todo assunto tem os 3 tipos', I.disciplinas.every(d => d.assuntos.every(a => a.tipos.mc && a.tipos.vf && a.tipos.disc)));
r = await api(AD, 'bancoIndice'); t('admin também acessa', r.ok);
r = await api(P, 'bancoTexto', { disciplina: 'historia', assunto: 0 }); t('texto de apoio', r.ok && r.d.texto.length > 150 && r.d.assunto, r);
r = await api(P, 'bancoTexto', { disciplina: 'xx', assunto: 0 }); t('disciplina inexistente', !r.ok);
r = await api(P, 'bancoMontar', { disciplina: 'matematica', assuntos: [], quantidade: 5 }); t('exige assunto', !r.ok);
r = await api(P, 'bancoMontar', { disciplina: 'matematica', assuntos: [0], tipos: [], quantidade: 5 }); t('exige tipo', !r.ok);
// monta e verifica cada questão de cada disciplina
let totalQ = 0, gabOk = true;
for (const d of I.disciplinas) {
  r = await api(P, 'bancoMontar', { disciplina: d.id, assuntos: d.assuntos.map(a => a.i), quantidade: 60, dificuldade: 'misto', tipos: ['mc', 'vf', 'disc'] });
  t('monta ' + d.id, r.ok && r.d.questoes.length === Math.min(60, d.assuntos.reduce((s, a) => s + a.total, 0)), r.ok ? r.d.questoes.length : r);
  if (!r.ok) continue;
  totalQ += r.d.questoes.length;
  for (const x of r.d.questoes) {
    if (x.tipo === 'mc' && !(x.opcoes.length === 4 && Number.isInteger(x.correta) && x.correta >= 0 && x.correta < 4 && x.explicacao)) gabOk = false;
    if (x.tipo === 'vf' && typeof x.correta !== 'boolean') gabOk = false;
    if (x.tipo === 'disc' && !(x.explicacao && x.permiteFoto && x.pontos === 2)) gabOk = false;
  }
  t('equilibra assuntos em ' + d.id, new Set(r.d.questoes.map(x => x.enunciado)).size === r.d.questoes.length);
}
t('todas as questões com gabarito válido', gabOk);
// filtros
r = await api(P, 'bancoMontar', { disciplina: 'fisica', assuntos: [2], quantidade: 10, tipos: ['vf'] });
t('filtro de tipo', r.ok && r.d.questoes.length === 2 && r.d.questoes.every(x => x.tipo === 'vf'), r.d);
r = await api(P, 'bancoMontar', { disciplina: 'fisica', assuntos: [2], quantidade: 2, tipos: ['mc', 'vf', 'disc'], dificuldade: 'dificil' });
t('prioriza a dificuldade escolhida', r.ok && r.d.questoes.length === 2);
r = await api(P, 'bancoMontar', { disciplina: 'portugues', assuntos: [0], quantidade: 6 });
t('inclui o texto de apoio nas instruções', r.ok && r.d.instrucoes.includes('A formiga e o gafanhoto'), r.d && r.d.instrucoes);
// embaralha alternativas (gabarito acompanha)
const pos = new Set(); for (let k = 0; k < 8; k++) { const x = (await api(P, 'bancoMontar', { disciplina: 'matematica', assuntos: [1], quantidade: 1, tipos: ['mc'] })).d.questoes[0]; pos.add(x.correta); t('gabarito acompanha o embaralhamento', x.opcoes[x.correta] && ['56', '54', '144'].includes(x.opcoes[x.correta]), x); }
t('alternativa correta muda de posição', pos.size > 1);
// ciclo completo: salvar, publicar, aluno responde, correção automática
r = await api(P, 'bancoMontar', { disciplina: 'matematica', assuntos: [0, 1], quantidade: 4, tipos: ['mc', 'vf'] });
const montada = r.d;
const tr = (await api(P, 'turmas')).d; const lista = Array.isArray(tr) ? tr : (tr.turmas || tr.lista || []);
r = await api(P, 'atividadeSalvar', { atividade: { titulo: montada.titulo, tipo: 'atividade', disciplina: montada.disciplina, instrucoes: montada.instrucoes, turmas: [lista[0].id], questoes: montada.questoes, status: 'publicada', aceitaAtraso: true } });
t('salva e publica atividade do banco', r.ok, r);
const atv = r.d && r.d.id;
r = await api(A, 'abrirAtividade', { id: atv });
t('aluno abre sem ver gabarito', r.ok && r.d.atividade.questoes.every(x => x.correta === undefined && x.explicacao === undefined), r);
r = await api(A, 'enviarAtividade', { id: atv, respostas: montada.questoes.map(x => x.correta) });
t('aluno envia', r.ok, r);
r = await api(P, 'atividadeEntregas', { id: atv }); const lin = r.d && r.d.linhas.find(l => l.status === 'corrigida');
t('correção automática dá nota máxima com o gabarito do banco', lin && lin.nota === 4, r.d && r.d.linhas);
// IA por assunto e nível, sem arquivos (Gemini simulado)
E.ia.resposta = () => ({ status: 200, corpo: { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200 }, candidates: [{ content: { parts: [{ text: JSON.stringify({ titulo: 'Frações', questoes: [
  { tipo: 'mc', enunciado: 'Quanto é 1/2 + 1/4?', textoApoio: 'Texto original.', opcoes: ['3/4', '2/6', '1/8', '2/4'], correta_indice: 0, explicacao: '2/4 + 1/4 = 3/4' },
  { tipo: 'vf', enunciado: '1/2 = 2/4', correta_vf: true, explicacao: 'Equivalentes.' }] }) }] } }] } });
r = await api(P, 'iaGerarQuestoes', { quantidade: 5 }); t('IA exige assunto ou material', !r.ok && /assunto/.test(r.erro), r);
r = await api(P, 'iaGerarQuestoes', { assunto: 'Frações', nivelEnsino: 'f1', disciplina: 'Matemática', quantidade: 5, tipos: ['mc', 'vf'], dificuldade: 'misto' });
t('IA gera só com assunto e nível', r.ok && r.d.questoes.length === 2, r);
const pedido = JSON.stringify(E.ia.chamadas[E.ia.chamadas.length - 1]);
t('pedido leva assunto, nível e regra de texto original', /Frações/.test(pedido) && /Fundamental I/.test(pedido) && /ORIGINAL/.test(pedido), pedido.slice(0, 300));
r = await api(P, 'iaGerarQuestoes', { assunto: 'Cores e formas', nivelEnsino: 'infantil', quantidade: 5, tipos: ['mc'] });
t('IA atende Educação Infantil', r.ok && /Educação Infantil/.test(JSON.stringify(E.ia.chamadas[E.ia.chamadas.length - 1])), r);
// Biblioteca de estudos do aluno: só textos, nunca questões nem gabarito
r = await api(A, 'bibliotecaIndice'); t('aluno abre a biblioteca', r.ok && r.d.disciplinas.length === 8, r);
t('biblioteca sem questões nem gabarito', !/correta|explicacao|"q"/.test(JSON.stringify(r.d)));
r = await api(A, 'bibliotecaTexto', { disciplina: 'geografia', assunto: 2 }); t('aluno lê um texto', r.ok && r.d.texto.length > 150 && !('q' in r.d), r);
r = await api(P, 'bibliotecaTexto', { disciplina: 'geografia', assunto: 2 }); t('rota da biblioteca é do aluno', !r.ok);
console.log(`Banco: ${ok} ok, ${falhas} falhas — ${totalQ} questões conferidas`);
E.restaurarConsole(); process.exit(falhas ? 1 : 0);
