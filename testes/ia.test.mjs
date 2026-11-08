// Testes da Inteligência Artificial (a API da IA é simulada aqui; o teste real é feito no servidor publicado)
import { criarAmbiente } from './ambiente.mjs';
let ok = 0, falhas = 0;
const t = (n, c, x) => { if (c) ok++; else { falhas++; console.log('❌ ' + n, x !== undefined ? JSON.stringify(x).slice(0, 300) : ''); } };
const E = await criarAmbiente(); await E.instalar(); const { api, ia } = E;
const jpg = 'data:image/jpeg;base64,' + Buffer.from('foto-do-livro').toString('base64');
const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 teste').toString('base64');
const P = (await api('', 'entrar', { login: 'professor', senha: 'Prof@2026' })).d.token;
const A = (await api('', 'entrar', { login: 'aluno', senha: 'Aluno@2026' })).d.token;
const ADM0 = (await api('', 'entrar', { login: 'admin', senha: 'Admin@2026' })).d.token; await api(ADM0, 'trocarSenha', { atual: 'Admin@2026', nova: 'Adm#2026x' });
const AD = ADM0;

// ---- gerador ----
ia.resposta = corpo => ({ status: 200, corpo: { usage: { input_tokens: 5000, output_tokens: 3000 }, content: [{ type: 'tool_use', name: 'salvar_questoes', input: {
  titulo: 'Ciclo da água', disciplina: 'Ciências', resumo: 'O texto explica o ciclo da água.',
  questoes: [
    { tipo: 'mc', enunciado: 'O que é evaporação?', opcoes: ['Água vira vapor', 'Vapor vira água', 'Gelo derrete', 'Chuva cai'], correta_indice: 0, explicacao: 'Evaporação: líquido para vapor.' },
    { tipo: 'vf', enunciado: 'A condensação forma as nuvens.', correta_vf: true, explicacao: 'Sim.' },
    { tipo: 'disc', enunciado: 'Explique o ciclo da água.', explicacao: 'Evaporação, condensação, precipitação.' },
    { tipo: 'mc', enunciado: 'Inválida', opcoes: ['a', 'b'], correta_indice: 7, explicacao: 'x' },
    { tipo: 'vf', enunciado: 'Sem gabarito', explicacao: 'x' } ] } }] } });
let r = await api(A, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('aluno não usa o gerador', !r.ok && /permissão/.test(r.erro));
r = await api(P, 'iaGerarQuestoes', {}); t('exige material', !r.ok);
r = await api(P, 'iaGerarQuestoes', { arquivos: ['data:text/html;base64,PGI+'], quantidade: 5 }); t('recusa formato inválido', !r.ok && /formato/.test(r.erro));
r = await api(P, 'iaGerarQuestoes', { arquivos: [jpg, pdf], quantidade: 5, dificuldade: 'facil', tipos: ['mc', 'vf', 'disc'], disciplina: 'Ciências', serie: '6º ano', observacoes: 'foco no ciclo da água' });
t('gera questões', r.ok && r.d.questoes.length === 3, r);
t('descarta questões defeituosas', r.ok && r.d.questoes.every(q => q.enunciado !== 'Inválida' && q.enunciado !== 'Sem gabarito'));
t('converte gabaritos', r.ok && r.d.questoes[0].correta === 0 && r.d.questoes[1].correta === true && r.d.questoes[2].permiteFoto);
t('calcula custo', r.ok && r.d.custoUSD === 0.04, r.d && r.d.custoUSD);
const ch = ia.chamadas[ia.chamadas.length - 1];
t('envia imagem e PDF à IA', ch.messages[0].content[0].type === 'image' && ch.messages[0].content[1].type === 'document');
t('usa modelo Sonnet com ferramenta estruturada', ch.model === 'claude-sonnet-5-5' && ch.tool_choice.name === 'salvar_questoes');
t('pedido inclui quantidade, nível e série', /EXATAMENTE 5/.test(ch.messages[0].content[2].text) && /fácil/.test(ch.messages[0].content[2].text) && /6º ano/.test(ch.messages[0].content[2].text));
// salvar como atividade usando a rota já existente
const turma = (await api(P, 'turmas')).d[0];
r = await api(P, 'atividadeSalvar', { atividade: { titulo: 'Ciclo da água (IA)', tipo: 'exercicio', disciplina: 'Ciências', turmas: [turma.id], questoes: (await api(P, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5, tipos: ['mc', 'vf', 'disc'] })).d.questoes, status: 'publicada' } });
t('atividade gerada salva e publicada', r.ok, r);
t('aparece no painel do professor', (await api(P, 'atividades')).d.some(a => a.titulo === 'Ciclo da água (IA)'));
t('aparece para o aluno', (await api(A, 'alunoDados')).d.atividades.some(a => a.titulo === 'Ciclo da água (IA)'));
// erros da IA
ia.resposta = () => ({ status: 401, corpo: { error: { message: 'invalid x-api-key' } } });
r = await api(P, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('chave inválida tratada', !r.ok && /chave/.test(r.erro));
ia.resposta = () => ({ status: 400, corpo: { error: { message: 'Your credit balance is too low' } } });
r = await api(P, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('sem créditos tratado', !r.ok && /créditos/.test(r.erro));
ia.resposta = () => ({ status: 529, corpo: { error: { message: 'overloaded' } } });
r = await api(P, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('serviço ocupado tratado', !r.ok && /ocupado/.test(r.erro));
ia.resposta = () => ({ status: 200, corpo: { usage: {}, content: [{ type: 'tool_use', input: { titulo: 'x', questoes: [] } }] } });
r = await api(P, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('material ilegível tratado', !r.ok && /nítidas/.test(r.erro));

// ---- tutor ----
let ultimo = null;
ia.resposta = corpo => { ultimo = corpo; return { status: 200, corpo: { usage: { input_tokens: 1000, output_tokens: 200 }, content: [{ type: 'text', text: 'Vamos pensar juntos! 😊' }] } }; };
r = await api(P, 'iaTutor', { pergunta: 'oi' }); t('professor não usa tutor de aluno', !r.ok);
r = await api(A, 'iaTutor', { pergunta: 'O que é fotossíntese?', historico: [{ role: 'assistant', texto: 'Olá!' }, { role: 'user', texto: 'oi' }, { role: 'assistant', texto: 'Oi! Em que posso ajudar?' }] });
t('tutor responde', r.ok && /pensar juntos/.test(r.d.resposta), r);
t('tutor usa Haiku', ultimo.model === 'claude-haiku-5-5');
t('conversa começa pelo aluno e alterna', ultimo.messages[0].role === 'user' && ultimo.messages.every((m, i) => i === 0 || m.role !== ultimo.messages[i - 1].role));
t('não envia nome do aluno à IA', !JSON.stringify(ultimo).includes('Aluno Demonstração'));
t('instruções de segurança e idade', /CVV/.test(ultimo.system) && /Adapte a linguagem/.test(ultimo.system));
const ativ = (await api(A, 'alunoDados')).d.atividades.find(a => a.titulo === 'Mesopotâmia');
r = await api(A, 'iaTutor', { pergunta: 'Me ajuda na questão 1?', atividadeId: ativ.id });
t('atividade pendente: só dicas, sem gabarito', r.ok && /NUNCA dê a resposta final/.test(ultimo.system) && !/Resposta correta/.test(ultimo.system));
const outra = (await api(P, 'atividades')).d.find(a => a.titulo === 'Ciclo da água (IA)');
await api(P, 'atividadeSalvar', { atividade: Object.assign((await api(P, 'atividadeObter', { id: outra.id })).d.atividade, { alunos: ['ninguem'] }) });
r = await api(A, 'iaTutor', { pergunta: 'e essa?', atividadeId: outra.id }); t('não acessa atividade de que não participa', !r.ok);
r = await api(A, 'iaTutor', { pergunta: 'veja a foto', imagem: jpg }); t('tutor aceita foto da dúvida', r.ok && ultimo.messages[ultimo.messages.length - 1].content[0].type === 'image');
// limites e configuração
r = await api(AD, 'iaConfigSalvar', { iaAtiva: true, iaLimiteProfDia: 20, iaLimiteAlunoDia: 3 }); t('admin configura limites', r.ok);
r = await api(A, 'iaStatus'); t('status mostra uso do dia', r.ok && r.d.usados >= 3 && r.d.restantes === 0, r.d);
r = await api(A, 'iaTutor', { pergunta: 'mais uma' }); t('limite diário respeitado', !r.ok && /limite/.test(r.erro));
await api(AD, 'iaConfigSalvar', { iaAtiva: false, iaLimiteProfDia: 20, iaLimiteAlunoDia: 40 });
r = await api(P, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('IA desligada pelo admin', !r.ok && /desligada/.test(r.erro));
await api(AD, 'iaConfigSalvar', { iaAtiva: true, iaLimiteProfDia: 20, iaLimiteAlunoDia: 40 });
r = await api(AD, 'iaUso'); t('admin vê custo do mês', r.ok && r.d.chamadas >= 5 && r.d.usd > 0, r.d);
r = await api(P, 'iaUso'); t('professor não vê custos', !r.ok);
// sem chave configurada
const E2 = await criarAmbiente({ chaveIA: '' }); await E2.instalar();
const P2 = (await E2.api('', 'entrar', { login: 'professor', senha: 'Prof@2026' })).d.token;
r = await E2.api(P2, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('sem chave: mensagem clara', !r.ok && /ainda não foi ativada/.test(r.erro));
t('sem erros internos', E.erros.filter(x => !/^IA /.test(x)).length === 0, E.erros);
console.log(`\nIA: ${ok} testes OK, ${falhas} falha(s)`);
