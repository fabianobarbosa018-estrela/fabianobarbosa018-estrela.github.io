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
await api(AD, 'iaConfigSalvar', { iaAtiva: true, iaProvedor: 'claude', iaLimiteProfDia: 20, iaLimiteAlunoDia: 40 });

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
await api(AD, 'iaConfigSalvar', { iaAtiva: false, iaProvedor: 'claude', iaLimiteProfDia: 20, iaLimiteAlunoDia: 40 });
r = await api(P, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('IA desligada pelo admin', !r.ok && /desligada/.test(r.erro));
await api(AD, 'iaConfigSalvar', { iaAtiva: true, iaLimiteProfDia: 20, iaLimiteAlunoDia: 40 });
r = await api(AD, 'iaUso'); t('admin vê custo do mês', r.ok && r.d.chamadas >= 5 && r.d.usd > 0, r.d);
r = await api(P, 'iaUso'); t('professor não vê custos', !r.ok);
// ---- GOOGLE GEMINI (cota gratuita) ----
await api(AD, 'iaConfigSalvar', { iaAtiva: true, iaProvedor: 'gemini', iaLimiteProfDia: 50, iaLimiteAlunoDia: 50 });
const respGemini = (texto) => ({ status: 200, corpo: { usageMetadata: { promptTokenCount: 3000, candidatesTokenCount: 1500 }, candidates: [{ content: { parts: [{ text: texto }] } }] } });
const jsonQs = JSON.stringify({ titulo: 'Frações', disciplina: 'Matemática', resumo: 'Frações simples.', questoes: [
  { tipo: 'mc', enunciado: 'Quanto é 1/2 + 1/2?', opcoes: ['1', '2', '1/4', '0'], correta_indice: 0, explicacao: 'Metade mais metade é um inteiro.' },
  { tipo: 'vf', enunciado: '1/4 é maior que 1/2.', correta_vf: false, explicacao: 'Um quarto é menor.' }] });
ia.urls.length = 0;
ia.resposta = (c, url) => /gemini-2\.5-flash:/.test(url) ? { status: 404, corpo: { error: { message: 'not found', status: 'NOT_FOUND' } } } : respGemini('```json\n' + jsonQs + '\n```');
r = await api(P, 'iaGerarQuestoes', { arquivos: [jpg, pdf], quantidade: 5, tipos: ['mc', 'vf'] });
t('Gemini gera questões', r.ok && r.d.questoes.length === 2 && r.d.custoUSD === 0, r);
t('Gemini: tenta outro modelo se o primeiro não existir', ia.urls.length === 2 && /gemini-3\.5-flash/.test(ia.urls[1]), ia.urls);
const cg = ia.chamadas[ia.chamadas.length - 1];
t('Gemini recebe foto e PDF', cg.contents[0].parts[0].inline_data.mime_type === 'image/jpeg' && cg.contents[0].parts[1].inline_data.mime_type === 'application/pdf');
t('Gemini pede resposta em JSON', cg.generationConfig.responseMimeType === 'application/json' && /SOMENTE com um objeto JSON/.test(cg.contents[0].parts[2].text));
ia.resposta = () => ({ status: 429, corpo: { error: { message: 'Quota exceeded', status: 'RESOURCE_EXHAUSTED' } } });
r = await api(P, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('Gemini: cota do dia esgotada tratada', !r.ok && /cota gratuita/.test(r.erro));
ia.resposta = () => ({ status: 400, corpo: { error: { message: 'API key not valid', status: 'INVALID_ARGUMENT' } } });
r = await api(P, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('Gemini: chave inválida tratada', !r.ok && /Gemini é inválida/.test(r.erro));
ia.resposta = () => respGemini('isto não é json');
r = await api(P, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('Gemini: resposta estranha tratada', !r.ok && /nítidas/.test(r.erro));
// tutor no Gemini
let ug = null; ia.resposta = (c) => { ug = c; return respGemini('Ótima pergunta! Pense nas fatias de uma pizza 🍕'); };
r = await api(A, 'iaTutor', { pergunta: 'Me explica frações? meu email é joao@gmail.com e meu zap (81) 99999-1234 cpf 123.456.789-00', historico: [{ role: 'user', texto: 'oi' }, { role: 'assistant', texto: 'Olá!' }] });
t('Tutor Gemini responde', r.ok && /pizza/.test(r.d.resposta), r);
t('Tutor Gemini: papéis user/model', ug.contents.map(x => x.role).join(',') === 'user,model,user', ug.contents.map(x => x.role));
const enviado = JSON.stringify(ug.contents);
t('Tutor Gemini: e-mail, telefone e CPF removidos', !/joao@gmail|99999-1234|123\.456\.789/.test(enviado) && /e-mail removido/.test(enviado) && /telefone removido/.test(enviado) && /CPF removido/.test(enviado), enviado);
t('Tutor Gemini: nome do aluno não enviado', !/Aluno Demonstração/.test(JSON.stringify(ug)));
r = await api(A, 'iaTutor', { pergunta: 'veja', imagem: jpg }); t('Tutor Gemini: foto bloqueada', !r.ok && /fotos/.test(r.erro));
r = await api(A, 'iaStatus'); t('status informa tutor ligado e sem foto', r.d.tutor === true && r.d.fotoTutor === false && r.d.provedor === 'gemini');
const E3 = await criarAmbiente({ chaveGemini: '' }); await E3.instalar();
const P3 = (await E3.api('', 'entrar', { login: 'professor', senha: 'Prof@2026' })).d.token;
r = await E3.api(P3, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('Gemini sem chave: mensagem clara', !r.ok && /chave do Google Gemini/.test(r.erro));

// sem chave configurada
const E2 = await criarAmbiente({ chaveIA: '' }); await E2.instalar();
{ const a2 = (await E2.api('', 'entrar', { login: 'admin', senha: 'Admin@2026' })).d.token; await E2.api(a2, 'trocarSenha', { atual: 'Admin@2026', nova: 'Adm#2026x' }); await E2.api(a2, 'iaConfigSalvar', { iaAtiva: true, iaProvedor: 'claude', iaLimiteProfDia: 20, iaLimiteAlunoDia: 40 }); }
const P2 = (await E2.api('', 'entrar', { login: 'professor', senha: 'Prof@2026' })).d.token;
r = await E2.api(P2, 'iaGerarQuestoes', { arquivos: [jpg], quantidade: 5 }); t('sem chave: mensagem clara', !r.ok && /ainda não foi ativada/.test(r.erro));
t('sem erros internos', E.erros.filter(x => !/^(IA|Gemini) /.test(x)).length === 0, E.erros);
console.log(`\nIA: ${ok} testes OK, ${falhas} falha(s)`);
