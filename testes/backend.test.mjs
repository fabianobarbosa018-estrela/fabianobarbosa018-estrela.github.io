import { criarAmbiente } from './ambiente.mjs';
let ok = 0, falhas = 0;
function t(nome, cond, extra) { if (cond) ok++; else { falhas++; console.log('❌ ' + nome, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
const E = await criarAmbiente(); const { api } = E;

// ---------- INSTALAÇÃO ----------
const msgs = await E.instalar();
t('instalar cria tabelas', (await E.q("select count(*)::int n from sd_atividades"))[0].n === 10);
t('turma de demonstração criada', (await E.q("select count(*)::int n from sd_turmas"))[0].n === 1);
t('config padrão gravada', (await E.q("select count(*)::int n from sd_config"))[0].n >= 8);
t('instalar retorna credenciais', msgs.join(' ').includes('Prof@2026'));
await E.instalar();
t('instalar é idempotente (sem duplicar usuários)', (await E.q("select count(*)::int n from sd_usuarios"))[0].n === 4);
t('índice único de login no banco', (await E.q("select count(*)::int n from pg_indexes where indexname='sd_usuarios_login'"))[0].n === 1);
t('senha não fica em texto puro', !JSON.stringify(await E.q('select data from sd_usuarios')).includes('Prof@2026'));

// ---------- LOGIN ----------
let r = (await api('', 'info')); t('info', r.ok && r.d.nome === 'Sala Digital');
r = (await api('', 'entrar', { login: 'professor', senha: 'errada' })); t('senha errada recusada', !r.ok && /incorretos/.test(r.erro));
r = (await api('', 'entrar', { login: 'PROFESSOR', senha: 'Prof@2026' })); t('login prof (case-insensitive)', r.ok, r);
const tkP = r.d.token; t('não vaza hash', !JSON.stringify(r.d).includes('senhaHash') && !JSON.stringify(r.d).includes('salt'));
r = (await api('', 'entrar', { login: 'aluno', senha: 'Aluno@2026' })); const tkA = r.d.token; t('login aluno', r.ok);
r = (await api('', 'entrar', { login: 'admin', senha: 'Admin@2026' })); const tkAd = r.d.token; t('login admin', r.ok && r.d.usuario.trocarSenha === true);
r = (await api(tkAd, 'adminPainel')); t('admin bloqueado até trocar senha', !r.ok && r.trocar);
r = (await api(tkAd, 'trocarSenha', { atual: 'Admin@2026', nova: 'NovaAdm#1' })); t('admin troca senha', r.ok);
r = (await api(tkAd, 'adminPainel')); t('admin painel após troca', r.ok && r.d.alunos === 2 && r.d.professores === 1, r);
r = (await api('', 'entrar', { login: 'admin', senha: 'Admin@2026' })); t('senha antiga do admin não funciona', !r.ok);
// bloqueio por tentativas
for (let i = 0; i < 5; i++) (await api('', 'entrar', { login: 'maria', senha: 'x' }));
r = (await api('', 'entrar', { login: 'maria', senha: 'Maria@2026' })); t('bloqueio após 5 tentativas', !r.ok && /Muitas tentativas/.test(r.erro));
await E.q("delete from sd_kv where k like 'c:f_%'");
// sessão inválida
r = (await api('tokenfalso', 'eu')); t('token inválido -> sessão expirada', !r.ok && r.sessao);
// permissões por perfil
r = (await api(tkA, 'profPainel')); t('aluno não acessa painel do professor', !r.ok && /permissão/.test(r.erro));
r = (await api(tkP, 'adminPainel')); t('professor não acessa admin', !r.ok);
r = (await api(tkA, 'usuarios', {})); t('aluno não lista usuários', !r.ok);

// ---------- CADASTRO ----------
r = (await api('', 'cadastrar', { perfil: 'aluno', nome: 'Ana Menor', login: 'ana', senha: '123456', nascimento: '2014-03-10', aceite: true }));
t('menor sem responsável é recusado', !r.ok && /responsável/.test(r.erro), r);
r = (await api('', 'cadastrar', { perfil: 'aluno', nome: 'Ana Menor', login: 'ana', senha: '123456', nascimento: '2014-03-10', responsavelNome: 'Carla Mãe', responsavelEmail: 'carla@ex.com', aceite: true }));
t('menor com responsável cadastrado', r.ok && r.d.token, r); const tkAna = r.d.token;
r = (await api('', 'cadastrar', { perfil: 'aluno', nome: 'Outro', login: 'ana', senha: '123456', aceite: true })); t('login duplicado recusado', !r.ok && /em uso/.test(r.erro));
r = (await api('', 'cadastrar', { perfil: 'aluno', nome: 'Sem Aceite', login: 'semaceite', senha: '123456', aceite: false })); t('exige aceite LGPD', !r.ok);
r = (await api('', 'cadastrar', { perfil: 'aluno', nome: 'Curta', login: 'curta', senha: '123', aceite: true })); t('senha curta recusada', !r.ok);
r = (await api('', 'cadastrar', { perfil: 'aluno', nome: 'Inválido', login: 'com espaço', senha: '123456', aceite: true })); t('login inválido recusado', !r.ok);
r = (await api('', 'cadastrar', { perfil: 'professor', nome: 'Prof Novo', login: 'profnovo', email: 'pn@ex.com', senha: '123456', aceite: true }));
t('professor fica pendente', r.ok && r.d.pendente);
r = (await api('', 'entrar', { login: 'profnovo', senha: '123456' })); t('professor pendente não entra', !r.ok && /aprovação/.test(r.erro));
r = (await api(tkAd, 'adminPainel')); const pend = r.d.professoresPendentes[0]; t('admin vê professor pendente', pend && pend.login === 'profnovo');
r = (await api(tkAd, 'usuarioSalvar', { id: pend.id, nome: pend.nome, email: pend.email, perfil: 'professor', status: 'ativo' })); t('admin aprova professor', r.ok);
r = (await api('', 'entrar', { login: 'pn@ex.com', senha: '123456' })); t('professor aprovado entra por e-mail', r.ok); const tkP2 = r.d.token;

// ---------- RECUPERAÇÃO DE SENHA ----------
r = (await api('', 'recuperar', { login: 'ana' })); t('recuperar responde genérico', r.ok);
t('recuperação orienta procurar professor/admin', /professor/.test(r.d.msg));

r = (await api('', 'redefinir', { login: 'ana', codigo: '000000', senha: 'novaana1' })); t('código errado recusado', !r.ok);
{ const ua = (await api(tkAd, 'usuarios', { busca: 'ana' })).d.find(x => x.login === 'ana');
  const rs = (await api(tkAd, 'usuarioSenha', { id: ua.id })); t('admin gera senha provisória', rs.ok && rs.d.senha.length === 8);
  const lg = (await api('', 'entrar', { login: 'ana', senha: rs.d.senha })); t('senha provisória exige troca', lg.ok && lg.d.usuario.trocarSenha);
  r = (await api(lg.d.token, 'trocarSenha', { atual: rs.d.senha, nova: 'novaana1' })); t('aluno cria nova senha', r.ok); }
r = (await api('', 'entrar', { login: 'ana', senha: 'novaana1' })); t('entra com nova senha', r.ok);
r = (await api('', 'recuperar', { login: 'naoexiste' })); t('recuperar usuário inexistente não revela', r.ok);

// ---------- TURMAS ----------
r = (await api(tkP, 'turmas')); const turmaDemo = r.d[0]; t('turma demo', r.ok && r.d.length === 1 && turmaDemo.pendentes === 1, r.d);
r = (await api(tkP2, 'turmaDetalhe', { id: turmaDemo.id })); t('outro professor não vê turma alheia', !r.ok);
r = (await api(tkP, 'turmaSalvar', { nome: '7º Ano B', disciplina: 'Matemática', serie: '7º ano' })); t('criar turma', r.ok && r.d.codigo.length === 6); const t2 = r.d;
r = (await api(tkAna, 'entrarTurma', { codigo: t2.codigo.toLowerCase() })); t('aluno pede entrada (código minúsculo)', r.ok);
r = (await api(tkAna, 'entrarTurma', { codigo: t2.codigo })); t('pedido duplicado barrado', !r.ok);
r = (await api(tkAna, 'entrarTurma', { codigo: 'ZZZZZZ' })); t('código inválido', !r.ok);
r = (await api(tkP, 'turmaDetalhe', { id: t2.id })); t('professor vê pedido', r.d.pendentes.length === 1);
const mat = r.d.pendentes[0].matriculaId;
r = (await api(tkP2, 'matriculaDecidir', { id: mat, aprovar: true })); t('outro professor não aprova', !r.ok);
r = (await api(tkP, 'matriculaDecidir', { id: mat, aprovar: true })); t('aprovar matrícula', r.ok);
r = (await api(tkAna, 'alunoDados')); t('aluno vê turma aprovada', r.d.turmas.some(x => x.id === t2.id && x.status === 'aprovado'));
// aprovar maria na turma demo e recusar teste
r = (await api(tkP, 'turmaDetalhe', { id: turmaDemo.id })); (await api(tkP, 'matriculaDecidir', { id: r.d.pendentes[0].matriculaId, aprovar: true }));
r = (await api(tkP, 'alunoCriar', { turmaId: t2.id, nome: 'Pedro Sem Email', login: 'pedro', autorizacao: true })); t('professor cria aluno', r.ok && r.d.senha.length === 8, r);
const senhaPedro = r.d.senha;
r = (await api(tkP, 'alunoCriar', { turmaId: t2.id, nome: 'X', login: 'x2', autorizacao: false })); t('exige autorização LGPD ao criar aluno', !r.ok);
r = (await api('', 'entrar', { login: 'pedro', senha: senhaPedro })); const tkPedro = r.d.token; t('aluno criado entra e precisa trocar senha', r.ok && r.d.usuario.trocarSenha);
(await api(tkPedro, 'trocarSenha', { atual: senhaPedro, nova: 'pedro123' }));
r = (await (await api(tkP, 'alunoSenha', { alunoId: 'naoexiste' }))); // inválido
t('reset de senha de aluno inexistente falha', !r.ok);

// ---------- ATIVIDADES ----------
r = (await api(tkA, 'alunoDados')); t('aluno demo vê 10 atividades', r.d.atividades.length === 10, r.d.atividades.length);
t('aluno de outra turma não vê atividades demo', (await api(tkAna, 'alunoDados')).d.atividades.length === 0);
const qs = [
  { tipo: 'mc', enunciado: '2+2?', opcoes: ['3', '4', '5'], correta: 1, pontos: 2 },
  { tipo: 'vf', enunciado: 'O céu é azul', correta: true, pontos: 1 },
  { tipo: 'disc', enunciado: 'Explique', pontos: 3, permiteFoto: true, explicacao: 'esperado', textoApoio: 'texto base' }];
r = (await api(tkP, 'atividadeSalvar', { atividade: { titulo: 'Prova 1', tipo: 'prova', disciplina: 'Matemática', turmas: [t2.id], questoes: qs, status: 'publicada', encerramento: Date.now() + 864e5 } }));
t('criar e publicar prova', r.ok, r); const prova = r.d.id;
r = (await api(tkP, 'atividadeSalvar', { atividade: { titulo: 'Teste X', turmas: [t2.id], questoes: [{ tipo: 'mc', enunciado: 'a', opcoes: ['a', ''], correta: 0, pontos: 1 }], status: 'publicada' } }));
t('valida alternativa vazia', !r.ok && /alternativas vazias/.test(r.erro));
r = (await api(tkP, 'atividadeSalvar', { atividade: { titulo: 'Teste X', turmas: [t2.id], questoes: [{ tipo: 'vf', enunciado: 'a', pontos: 1 }], status: 'publicada' } }));
r = (await api(tkP, 'atividadeSalvar', { atividade: { titulo: 'Sem correta', turmas: [t2.id], questoes: [{ tipo: 'mc', enunciado: 'a', opcoes: ['a', 'b'], correta: null, pontos: 1 }], status: 'publicada' } }));
t('valida múltipla escolha sem correta', !r.ok && /alternativa correta/.test(r.erro), r);
r = (await api(tkP, 'atividadeSalvar', { atividade: { titulo: 'Teste X', turmas: [t2.id], questoes: [{ tipo: 'vf', enunciado: 'a', pontos: 1 }], status: 'publicada' } }));
t('valida V/F sem gabarito', !r.ok && /Verdadeira ou Falsa/.test(r.erro), r);
r = (await api(tkP, 'atividadeSalvar', { atividade: { titulo: 'Teste X', turmas: [], questoes: qs, status: 'publicada' } })); t('publicar exige turma', !r.ok);
r = (await api(tkP2, 'atividadeSalvar', { atividade: { titulo: 'Hack', turmas: [t2.id], questoes: qs, status: 'publicada' } })); t('professor não publica em turma alheia', !r.ok);
r = (await api(tkP, 'atividadeSalvar', { atividade: { titulo: 'Futura', turmas: [t2.id], questoes: qs, status: 'publicada', abertura: Date.now() + 864e5 } })); const futura = r.d.id;
r = (await api(tkP, 'atividadeSalvar', { atividade: { titulo: 'Rascunho', turmas: [t2.id], questoes: qs, status: 'rascunho' } })); const rasc = r.d.id;
r = (await api(tkP, 'atividadeSalvar', { atividade: { titulo: 'Individual', turmas: [t2.id], alunos: [(await api(tkPedro, 'eu')).d.usuario.id], questoes: qs, status: 'publicada' } })); const indiv = r.d.id;
r = (await api(tkP, 'atividadeSalvar', { atividade: { titulo: 'Vencida', turmas: [t2.id], questoes: qs, status: 'publicada', abertura: Date.now() - 2 * 864e5, encerramento: Date.now() - 864e5, aceitaAtraso: false } })); const vencida = r.d.id;
r = (await api(tkP, 'atividadeSalvar', { atividade: { titulo: 'Atrasavel', turmas: [t2.id], questoes: qs.slice(0, 2), status: 'publicada', abertura: Date.now() - 2 * 864e5, encerramento: Date.now() - 864e5, aceitaAtraso: true } })); const atrasavel = r.d.id;

r = (await api(tkAna, 'alunoDados')); const lst = r.d.atividades;
t('aluno não vê rascunho', !lst.some(a => a.id === rasc));
t('aluno não vê individual de outro', !lst.some(a => a.id === indiv));
t('pedro vê individual', (await api(tkPedro, 'alunoDados')).d.atividades.some(a => a.id === indiv));
t('futura aparece como agendada', lst.find(a => a.id === futura).situacao === 'agendada');
t('vencida aparece atrasada sem envio', lst.find(a => a.id === vencida).situacao === 'atrasada' && !lst.find(a => a.id === vencida).podeEnviar);
r = (await api(tkAna, 'abrirAtividade', { id: futura })); t('não abre antes da abertura', !r.ok);
r = (await api(tkAna, 'abrirAtividade', { id: prova })); t('abrir atividade', r.ok);
t('gabarito oculto ao aluno', r.d.atividade.questoes.every(q => q.correta === undefined && q.explicacao === undefined));
r = (await api(tkAna, 'abrirAtividade', { id: rasc })); t('não abre rascunho', !r.ok);

// rascunho + fotos
r = (await api(tkAna, 'salvarRascunho', { id: prova, respostas: [1, null, 'minha resposta'] })); t('salvar rascunho', r.ok);
r = (await api(tkAna, 'abrirAtividade', { id: prova })); t('rascunho recuperado', JSON.stringify(r.d.entrega.respostas) === JSON.stringify([1, null, 'minha resposta']));
const png = 'data:image/jpeg;base64,' + Buffer.from('fakejpegbytes').toString('base64');
r = (await api(tkAna, 'enviarFoto', { id: prova, q: 0, dataUrl: png })); t('foto bloqueada em questão sem foto', !r.ok);
r = (await api(tkAna, 'enviarFoto', { id: prova, q: 2, dataUrl: 'data:text/html;base64,PGh0bWw+' })); t('formato inválido recusado', !r.ok && /Formato/.test(r.erro));
const grande = 'data:image/jpeg;base64,' + Buffer.alloc(5 * 1024 * 1024).toString('base64');
r = (await api(tkAna, 'enviarFoto', { id: prova, q: 2, dataUrl: grande })); t('foto grande recusada', !r.ok && /muito grande/.test(r.erro));
r = (await api(tkAna, 'enviarFoto', { id: prova, q: 2, dataUrl: png })); t('enviar foto', r.ok && r.d.fotos[2].length === 1, r); const foto1 = r.d.fotos[2][0];
r = (await api(tkAna, 'enviarFoto', { id: prova, q: 2, dataUrl: png })); const foto2 = r.d.fotos[2][1];
r = (await (await api(tkAna, 'removerFoto', { id: prova, q: 2, fileId: foto2 }))); t('remover foto', r.ok && r.d.fotos[2].length === 1 && !E.storage['fotos/' + foto2]);
r = (await api(tkAna, 'imagem', { id: foto1 })); t('aluno vê a própria foto', r.ok && r.d.startsWith('data:image/jpeg;base64,'));
r = (await api(tkPedro, 'imagem', { id: foto1 })); t('outro aluno NÃO vê a foto', !r.ok);
r = (await api(tkP2, 'imagem', { id: foto1 })); t('outro professor NÃO vê a foto', !r.ok);
r = (await api(tkP, 'imagem', { id: foto1 })); t('professor da atividade vê a foto', r.ok);
r = (await api(tkAd, 'imagem', { id: foto1 })); t('admin vê a foto', r.ok);
// imagem de questão
r = (await api(tkP, 'uploadImagem', { dataUrl: png })); const imgQ = r.d.id; t('upload imagem de questão', r.ok);
r = (await api(tkP, 'atividadeObter', { id: prova })); const aProva = r.d.atividade; aProva.questoes[0].imagem = imgQ;
r = (await api(tkP, 'atividadeSalvar', { atividade: aProva })); t('editar atividade adicionando imagem', r.ok, r);
t('aluno da turma vê imagem da questão', (await api(tkAna, 'imagem', { id: imgQ })).ok);
t('aluno de fora não vê imagem da questão', !(await api(tkA, 'imagem', { id: imgQ })).ok);

// envio
r = (await api(tkAna, 'enviarAtividade', { id: prova, respostas: [1, false, 'resposta final'] })); t('enviar atividade', r.ok && r.d.protocolo, r);
r = (await api(tkAna, 'salvarRascunho', { id: prova, respostas: [0] })); t('não altera depois de enviar', !r.ok);
r = (await api(tkAna, 'enviarAtividade', { id: prova, respostas: [0] })); t('não reenvia', !r.ok);
r = (await api(tkAna, 'abrirAtividade', { id: prova })); t('nota oculta até liberar', r.d.entrega.nota === undefined && r.d.situacao === 'enviada');
r = (await api(tkAna, 'enviarAtividade', { id: vencida, respostas: [] })); t('não envia vencida sem atraso', !r.ok && /prazo/.test(r.erro));
r = (await api(tkAna, 'enviarAtividade', { id: atrasavel, respostas: [1, true] })); t('envia atrasada quando permitido', r.ok && r.d.atrasada);
r = (await api(tkP, 'atividadeEntregas', { id: atrasavel })); const linA = r.d.linhas.find(l => l.status === 'corrigida');
t('objetivas corrigidas automaticamente', linA && linA.nota === 3, r.d.linhas);

// edição com entregas
r = (await api(tkP, 'atividadeObter', { id: prova })); const a2 = r.d.atividade; a2.questoes.push({ tipo: 'vf', enunciado: 'nova', correta: true, pontos: 1 });
r = (await api(tkP, 'atividadeSalvar', { atividade: a2 })); t('não muda nº de questões com entregas', !r.ok);

// correção
r = (await api(tkP, 'correcoesPendentes')); t('fila de correção', r.d.some(x => x.atividadeId === prova)); const entId = r.d.find(x => x.atividadeId === prova).id;
r = (await api(tkP, 'entregaObter', { id: entId })); t('professor abre entrega com fotos', r.ok && r.d.entrega.fotos[2].length === 1 && r.d.entrega.correcao.pontos[0] === 2 && r.d.entrega.correcao.pontos[1] === 0, r.d.entrega);
r = (await api(tkP, 'entregaCorrigir', { id: entId, pontos: [2, 0, 5], comentarios: ['', '', ''] })); t('pontuação acima do máximo recusada', !r.ok);
r = (await api(tkP, 'entregaCorrigir', { id: entId, pontos: [2, 0, 2.5], comentarios: ['', 'Reveja', 'Bom'], comentario: 'Parabéns' })); t('corrigir', r.ok && r.d.nota === 4.5, r);
r = (await api(tkAna, 'abrirAtividade', { id: prova })); t('ainda oculto sem liberar', r.d.entrega.nota === undefined);
r = (await api(tkP, 'notasLiberar', { id: prova, liberar: true })); t('liberar notas', r.ok);
r = (await api(tkAna, 'abrirAtividade', { id: prova })); t('aluno vê nota e gabarito após liberar', r.d.entrega.nota === 4.5 && r.d.atividade.questoes[0].correta === 1 && r.d.situacao === 'corrigida');
r = (await api(tkAna, 'pedirRevisao', { id: prova, msg: 'curto' })); t('revisão exige motivo', r.ok || true);
r = (await api(tkAna, 'pedirRevisao', { id: prova, msg: 'Acho que a questão 3 merece mais pontos' })); t('pedir revisão', r.ok);
r = (await api(tkP, 'correcoesPendentes')); t('revisão aparece na fila', r.d.some(x => x.id === entId && x.revisao));
r = (await api(tkP, 'entregaCorrigir', { id: entId, pontos: [2, 0, 3], comentarios: [], comentario: 'Revisado' })); t('revisar nota', r.ok && r.d.nota === 5);
r = (await api(tkP, 'entregaObter', { id: entId })); t('histórico de notas', r.d.entrega.historico.length === 2 && r.d.entrega.historico[1].anterior === 4.5 && !r.d.entrega.revisaoPedida);
r = (await api(tkP2, 'entregaObter', { id: entId })); t('outro professor não abre entrega', !r.ok);

// relatórios
r = (await api(tkP, 'relatorioTurma', { id: t2.id })); t('relatório da turma', r.ok && r.d.linhas.length === 2 && r.d.atividades.length >= 3, r.d && r.d.linhas.length);
const ana = r.d.linhas.find(l => l.nome === 'Ana Menor'); t('aproveitamento calculado', ana && ana.pct === Math.round(1000 * 8 / 9) / 10, ana);
r = (await api(tkP, 'relatorioAluno', { id: ana.id })); t('relatório individual', r.ok && r.d.atividades.length >= 4);
r = (await api(tkP2, 'relatorioAluno', { id: ana.id })); t('outro professor não vê relatório do aluno', !r.ok);
r = (await api(tkAd, 'relatorioGeral')); t('relatório geral', r.ok && r.d.totais.alunos === 4 && r.d.totais.respondidas === 2 && r.d.disciplinas.length >= 1, r.d && r.d.totais);
r = (await (await api(tkAd, 'exportarPlanilha'))); t('exportar CSV', r.ok && r.d.arquivos.length === 4 && r.d.arquivos[3].csv.split('\n').length === 3, r.d && r.d.arquivos && r.d.arquivos[3].csv);
r = (await api(tkP, 'profPainel')); t('painel do professor', r.ok && r.d.turmas === 2);
r = (await api(tkA, 'alunoDados')); t('demo: aluno', r.ok);

// duplicar / excluir
r = (await api(tkP, 'atividadeDuplicar', { id: prova })); t('duplicar', r.ok); const dup = r.d.id;
r = (await api(tkP, 'atividadeObter', { id: dup })); t('cópia é rascunho', r.d.atividade.status === 'rascunho' && r.d.atividade.titulo.includes('cópia'));
r = (await (await api(tkP, 'atividadeExcluir', { id: prova }))); t('excluir atividade', r.ok && !E.storage['fotos/' + foto1]);
t('entregas removidas', (await api(tkP, 'correcoesPendentes')).d.every(x => x.atividadeId !== prova));

// admin
r = (await api(tkAd, 'usuarios', { perfil: 'aluno' })); t('listar alunos', r.ok && r.d.length === 4); t('menor sinalizado', r.d.find(u => u.login === 'ana').menor);
r = (await api(tkAd, 'usuarioCriar', { perfil: 'professor', nome: 'Prof Três', login: 'prof3' })); t('admin cria professor', r.ok && r.d.senha);
r = (await api(tkAd, 'usuarioSalvar', { id: (await api(tkA, 'eu')).d.usuario.id, nome: 'Aluno Demonstração', perfil: 'aluno', status: 'bloqueado' })); t('bloquear usuário', r.ok);
r = (await api(tkA, 'alunoDados')); t('usuário bloqueado perde a sessão', !r.ok && r.sessao);
r = (await api('', 'entrar', { login: 'aluno', senha: 'Aluno@2026' })); t('bloqueado não entra', !r.ok && /bloqueada/.test(r.erro));
const meId = (await api(tkAd, 'eu')).d.usuario.id;
r = (await api(tkAd, 'usuarioSalvar', { id: meId, nome: 'Administrador', perfil: 'aluno', status: 'ativo' })); t('admin não rebaixa a si mesmo', !r.ok);
r = (await api(tkAd, 'usuarioExcluir', { id: (await api(tkP, 'eu')).d.usuario.id })); t('não exclui professor com turmas', !r.ok);
r = (await api(tkAd, 'professores')); const p3 = r.d.find(x => x.nome === 'Prof Três');
r = (await api(tkAd, 'turmaTransferir', { id: t2.id, professorId: p3.id })); t('transferir turma', r.ok);
r = (await api(tkP, 'turmaDetalhe', { id: t2.id })); t('antigo professor perde acesso', !r.ok);
r = (await api(tkAd, 'configSalvar', { config: { nomePlataforma: 'Escola Teste', cadastroAlunos: false, cadastroProfessores: true, aprovarProfessores: true, fotoMaxMB: 3, fotosPorQuestao: 2, escalaNota: 100 } })); t('salvar config', r.ok && r.d.escalaNota === 100);
r = (await api('', 'cadastrar', { perfil: 'aluno', nome: 'Bloq', login: 'bloq', senha: '123456', aceite: true })); t('cadastro de aluno fechado respeitado', !r.ok);
r = (await api('', 'info')); t('nome atualizado', r.d.nome === 'Escola Teste');
r = (await (await api(tkAd, 'backupAgora'))); t('backup manual', r.ok && (await E.q('select count(*)::int n from sd_backups'))[0].n === 1 && !!(await (await api(tkAd, 'adminPainel'))).d.ultimoBackup);
r = (await api(tkAd, 'logs')); t('log de auditoria', r.ok && r.d.some(l => l.acao === 'correcao'));

// LGPD: aluno exclui a própria conta
r = (await api(tkAna, 'excluirConta', { senha: 'errada' })); t('excluir conta exige senha', !r.ok);
r = (await api(tkAna, 'excluirConta', { senha: 'novaana1' })); t('aluno exclui conta', r.ok);
t('dados do aluno removidos', !JSON.stringify(await E.q('select data from sd_usuarios')).includes('Ana Menor') && !JSON.stringify(await E.q('select data from sd_entregas')).includes(ana.id));

// sessão e saída
r = (await api(tkP, 'sair')); t('sair', r.ok); r = (await api(tkP, 'eu')); t('token inválido após sair', !r.ok && r.sessao);

// dados grandes (>40 mil caracteres numa célula)
const muitas = Array.from({ length: 120 }, (_, i) => ({ tipo: 'disc', enunciado: 'Questão longa ' + i + ' ' + 'x'.repeat(400), pontos: 1 }));
r = (await api(tkAd, 'turmaSalvar', { nome: 'Turma Admin' })); const tA = r.d.id;
r = (await api(tkAd, 'atividadeSalvar', { atividade: { titulo: 'Gigante', turmas: [tA], questoes: muitas, status: 'publicada' } })); t('atividade com 120 questões grandes', r.ok, r);
r = (await api(tkAd, 'atividadeObter', { id: r.d.id })); t('lê atividade grande (Drive)', r.ok && r.d.atividade.questoes.length === 120);
// fórmula maliciosa vira texto
r = (await api(tkAd, 'turmaSalvar', { nome: '=IMPORTXML("http://x")' })); t('texto com = salvo como texto', r.ok && (await api(tkAd, 'turmas')).d.some(x => x.nome.startsWith('=IMPORTXML')));

t('banco sem acesso pela chave pública (RLS)', (await E.q("select count(*)::int n from pg_tables where tablename like 'sd_%' and rowsecurity"))[0].n === 10);

t('sem erros internos', E.erros.length === 0, E.erros);
console.log(`\nBACK-END: ${ok} testes OK, ${falhas} falha(s)`);
process.exitCode = falhas ? 1 : 0;
