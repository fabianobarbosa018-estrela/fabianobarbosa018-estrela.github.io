// Testes do Desafio Diário (servidor + banco de dados real em PGlite; a IA é simulada)
import { criarAmbiente } from './ambiente.mjs';
let ok = 0, falhas = 0;
const t = (n, c, x) => { if (c) ok++; else { falhas++; console.log('❌ ' + n, x !== undefined ? JSON.stringify(x).slice(0, 500) : ''); } };
const COTAS = { 'Português': 7, 'Matemática': 7, 'História': 6, 'Geografia': 6, 'Educação Física': 6, 'Física': 6, 'Química': 6, 'Biologia': 6 };
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
const E = await criarAmbiente(); await E.instalar(); const { api, q } = E;
E.ia.resposta = iaSimulada;
const P = (await api('', 'entrar', { login: 'professor', senha: 'Prof@2026' })).d.token;
const A = (await api('', 'entrar', { login: 'aluno', senha: 'Aluno@2026' })).d.token;
const AD = (await api('', 'entrar', { login: 'admin', senha: 'Admin@2026' })).d.token; await api(AD, 'trocarSenha', { atual: 'Admin@2026', nova: 'Adm#2026x' });
// abertura no fim do dia, para a IA ter tempo (antes da abertura o servidor usa a IA; depois, a reserva)
let r = await api(AD, 'desafioConfigSalvar', { global: { ativo: true, ia: true, abertura: '23:58', encerramento: '23:59', diasPrazo: 1, liberar: 'encerramento', discursivas: 3, nivelPadrao: 'F2', placar: true } });
t('admin salva configuração geral', r.ok, r);
r = await api(P, 'desafioConfigSalvar', { global: { ativo: false } }); t('professor não muda a configuração geral', !r.ok);
r = await api(P, 'desafioPainel'); t('painel do professor', r.ok && r.d.turmas.length === 1 && r.d.turmas[0].nivel === 'F2' && r.d.pendentes.includes('F2'), r);
t('nível descoberto pela série (6º ano → Fund. II)', r.d.turmas[0].nivelAuto === 'F2');
r = await api(A, 'desafioGerarAgora'); t('aluno não gera desafio', !r.ok);
// ---- geração com IA ----
r = await api(P, 'desafioGerarAgora'); t('professor gera o desafio de hoje', r.ok && r.d.preparados.length === 1, r);
const prep = r.d.preparados[0];
t('50 questões', prep.questoes === 50, prep); t('origem IA (com revisão)', prep.origem === 'ia' && prep.deIA === 48, prep);
const pedidos = E.ia.chamadas.map(c => c.contents[0].parts[0].text);
t('pedido traz o nível e as regras', pedidos.some(p => /Fundamental II/.test(p) && /raciocínio lógico/.test(p) && /interpretação/.test(p)));
t('houve revisão de qualidade', pedidos.filter(p => /reprovadas/.test(p)).length === 2);
let [atv] = await q("select data from sd_atividades where data->>'tipo' = 'desafio'"); let D = atv.data;
t('desafio salvo no banco de dados', !!D && D.status === 'publicada' && D.desafio.nivel === 'F2' && D.desafio.origem === 'ia');
const porD = {}; D.questoes.forEach(x => { porD[x.disciplina] = (porD[x.disciplina] || 0) + 1; });
t('distribuição equilibrada entre as 8 disciplinas', Object.keys(COTAS).every(k => porD[k] === COTAS[k]), porD);
t('3 discursivas', D.questoes.filter(x => x.tipo === 'disc').length === 3);
t('tem múltipla escolha e V/F', D.questoes.some(x => x.tipo === 'mc') && D.questoes.some(x => x.tipo === 'vf'));
t('nenhuma questão repetida', new Set(D.questoes.map(x => x.enunciado)).size === 50);
t('questão defeituosa e reprovadas foram descartadas', !D.questoes.some(x => /defeituosa/.test(x.enunciado)) && !D.questoes.some(x => x.enunciado === 'Pergunta número 1 de Português?'));
t('gabaritos válidos', D.questoes.every(x => x.tipo === 'disc' || (x.tipo === 'vf' ? typeof x.correta === 'boolean' : x.correta >= 0 && x.correta < 4 && x.opcoes.length === 4)));
t('alternativa correta embaralhada', new Set(D.questoes.filter(x => x.tipo === 'mc').map(x => x.correta)).size > 1);
t('prazo com data e hora configuradas', new Date(D.abertura - 3 * 3600e3).toISOString().slice(11, 16) === '23:58' && new Date(D.encerramento - 3 * 3600e3).toISOString().slice(11, 16) === '23:59' && D.encerramento - D.abertura > 864e5 - 60e3);
r = await api(P, 'desafioGerarAgora'); t('não duplica o desafio do dia', !r.ok && /já estão prontos/.test(r.erro));
// ---- aluno: antes da abertura vê contagem regressiva; depois responde ----
r = await api(A, 'desafioHoje'); t('aluno vê o desafio agendado', r.ok && r.d.desafios.length === 1 && r.d.desafios[0].situacao === 'agendada' && r.d.desafios[0].qtd === 50, r);
r = await api(A, 'abrirAtividade', { id: D.id }); t('bloqueado antes da abertura', !r.ok && /ainda não foi aberta/.test(r.erro));
// abre agora (simula a chegada do horário)
await q("update sd_atividades set data = jsonb_set(jsonb_set(data, '{abertura}', to_jsonb((extract(epoch from now()) * 1000)::bigint - 60000)), '{encerramento}', to_jsonb((extract(epoch from now()) * 1000)::bigint + 3600000)) where id = $1", [D.id]);
r = await api(A, 'desafioHoje'); t('desafio aberto com encerramento para a contagem regressiva', r.d.desafios[0].situacao === 'pendente' && r.d.desafios[0].encerramento > Date.now(), r.d);
r = await api(A, 'abrirAtividade', { id: D.id }); t('aluno abre sem gabarito', r.ok && r.d.atividade.questoes.length === 50 && r.d.atividade.questoes.every(x => x.correta === undefined && x.explicacao === undefined));
t('questões trazem a disciplina', r.d.atividade.questoes.every(x => x.disciplina));
const resp = D.questoes.map((x, i) => x.tipo === 'disc' ? 'Minha explicação' : i % 5 === 0 ? (x.tipo === 'mc' ? (x.correta + 1) % 4 : !x.correta) : x.correta);
const errosEsperados = D.questoes.filter((x, i) => x.tipo !== 'disc' && i % 5 === 0).length;
r = await api(A, 'salvarRascunho', { id: D.id, respostas: resp.slice(0, 10) }); t('rascunho salvo', r.ok);
r = await api(A, 'desafioHoje'); t('mostra progresso do rascunho', r.d.desafios[0].rascunho && r.d.desafios[0].respondidas === 10, r.d.desafios[0]);
r = await api(A, 'enviarAtividade', { id: D.id, respostas: resp });
t('envio com correção automática', r.ok && r.d.resultado && r.d.resultado.objetivas === 47 && r.d.resultado.erros === errosEsperados && r.d.resultado.acertos === 47 - errosEsperados && r.d.resultado.discPendentes === 3, r.d);
r = await api(A, 'enviarAtividade', { id: D.id, respostas: resp }); t('não envia duas vezes', !r.ok);
r = await api(A, 'desafioHoje'); t('placar após o envio', r.d.desafios[0].acertos === 47 - errosEsperados && r.d.desafios[0].erros === errosEsperados && r.d.desafios[0].nota === undefined, r.d.desafios[0]);
r = await api(A, 'abrirAtividade', { id: D.id }); t('gabarito ainda oculto antes da liberação', r.d.atividade.questoes.every(x => x.correta === undefined));
// ---- professor corrige as discursivas ----
r = await api(P, 'atividadeEntregas', { id: D.id }); const lin = r.d.linhas[0];
t('professor vê a entrega aguardando correção das discursivas', lin.status === 'enviada');
r = await api(P, 'correcoesPendentes'); t('aparece em Correções', r.d.some(x => x.atividadeId === D.id));
const ent = (await api(P, 'entregaObter', { id: lin.entregaId })).d.entrega;
const pts = ent.correcao.pontos.map((p, i) => D.questoes[i].tipo === 'disc' ? 2 : p);
r = await api(P, 'entregaCorrigir', { id: lin.entregaId, pontos: pts, comentarios: [], comentario: 'Muito bem!' }); t('professor corrige', r.ok && r.d.nota === 47 - errosEsperados + 6, r);
// ---- encerramento: bloqueio e liberação automática do gabarito ----
const Al2 = await api(AD, 'usuarioCriar', { perfil: 'aluno', nome: 'Bia Teste', login: 'bia.teste' });
const tur = (await q("select id from sd_turmas"))[0].id;
await q("insert into sd_matriculas(id, data) values ('mbia', jsonb_build_object('id','mbia','turmaId',$1::text,'alunoId',$2::text,'status','aprovado','criadoEm',1))", [tur, (await q("select id from sd_usuarios where data->>'login' = 'bia.teste'"))[0].id]);
const senhaBia = Al2.d.senha; let B = (await api('', 'entrar', { login: 'bia.teste', senha: senhaBia })).d; if (B.usuario.trocarSenha) await api(B.token, 'trocarSenha', { atual: senhaBia, nova: 'Bia#2026xx' }); B = B.token;
await q("update sd_atividades set data = jsonb_set(data, '{encerramento}', to_jsonb((extract(epoch from now()) * 1000)::bigint - 1000)) where id = $1", [D.id]);
r = await api(B, 'enviarAtividade', { id: D.id, respostas: resp }); t('bloqueio automático após o encerramento', !r.ok && /prazo/.test(r.erro), r);
await q("insert into sd_kv(k, v) values ('p:CRON_SEGREDO', 'segredo-teste')");
r = await api('', 'desafioCron'); t('agendamento exige segredo', !r.ok);
r = JSON.parse(JSON.stringify(await E.processar({ acao: 'desafioCron', segredo: 'errado' }))); t('segredo errado recusado', !r.ok);
r = JSON.parse(JSON.stringify(await E.processar({ acao: 'desafioCron', segredo: 'segredo-teste' }))); t('agendamento roda a manutenção', r.ok && r.d.manutencao.liberados === 1 && r.d.manutencao.historico === 1, r);
r = await api(A, 'abrirAtividade', { id: D.id }); t('gabarito e explicações liberados após o encerramento', r.d.atividade.questoes.every(x => x.tipo === 'disc' || x.correta !== undefined) && r.d.atividade.questoes.every(x => x.explicacao));
t('aluno vê a nota', r.d.entrega.nota === 47 - errosEsperados + 6);
r = await api(A, 'desafioHistorico'); t('histórico de desempenho', r.ok && r.d.lista.length === 1 && r.d.lista[0].acertos === 47 - errosEsperados && r.d.feitos === 1 && r.d.aproveitamento > 0, r.d);
t('histórico guardado no banco de dados', (await q("select count(*)::int n from sd_desafiohist"))[0].n === 1);
// ---- desafios antigos saem da carga diária, mas o histórico continua ----
await q("update sd_atividades set data = jsonb_set(data, '{encerramento}', to_jsonb((extract(epoch from now() - interval '30 days') * 1000)::bigint)) where id = $1", [D.id]);
r = await api(A, 'desafioHistorico'); t('histórico antigo continua visível', r.d.lista.length === 1 && r.d.lista[0].antigo && r.d.lista[0].acertos === 47 - errosEsperados, r.d);
t('desafio antigo não pesa no carregamento', !(await q("select sd_carregar() d"))[0].d.Atividades.some(a => a.id === D.id));
// ---- personalização por nível e reserva (sem IA) ----
await q("delete from sd_atividades where data->>'tipo' = 'desafio'");
const novaTurma = async (nome, serie) => { const x = (await api(P, 'turmaSalvar', { nome, serie })).d; await q("insert into sd_matriculas(id, data) values ($1, jsonb_build_object('id',$1::text,'turmaId',$2::text,'alunoId',$3::text,'status','aprovado','criadoEm',1))", ['m' + x.id, x.id, (await api(A, 'eu')).d.usuario.id]); return x; };
const tF1 = await novaTurma('3º ano B', '3º ano'); const tEM = await novaTurma('2º ano Médio', '2º ano do Ensino Médio'); const tInf = await novaTurma('Infantil', 'Educação Infantil');
r = await api(P, 'desafioPainel'); t('níveis por série: F1, EM e Infantil sem desafio', r.d.turmas.find(x => x.id === tF1.id).nivel === 'F1' && r.d.turmas.find(x => x.id === tEM.id).nivel === 'EM' && r.d.turmas.find(x => x.id === tInf.id).nivel === 'INF', r.d.turmas);
const E2iaAntes = E.ia.chamadas.length;
E.ia.resposta = () => ({ status: 429, corpo: { error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } } });
r = await api(P, 'desafioGerarAgora'); t('IA falhou: usa a reserva do banco e ninguém fica sem desafio', r.ok && r.d.preparados.length === 3 && r.d.preparados.every(p => p.questoes === 50 && p.origem === 'banco'), r.d);
const ds = (await q("select data from sd_atividades where data->>'tipo' = 'desafio'")).map(x => x.data);
const F1 = ds.find(a => a.desafio.nivel === 'F1'), F2 = ds.find(a => a.desafio.nivel === 'F2'), EM = ds.find(a => a.desafio.nivel === 'EM');
t('um desafio para cada nível', F1 && F2 && EM && F1.turmas.includes(tF1.id) && EM.turmas.includes(tEM.id));
const fs = await import('fs'); const crypto = await import('crypto');
// confere os níveis das questões da reserva com o banco original
const banco = {}; for (const f of fs.readdirSync('/home/claude/supa/banco')) { const L = JSON.parse(fs.readFileSync('/home/claude/supa/banco/' + f, 'utf8')); L.forEach(a => a.q.forEach(x => { banco[x[2]] = a.n; })); }
t('Fund. I recebe só questões do Fund. I', F1.questoes.every(x => banco[x.enunciado] === 'F1'), F1.questoes.map(x => banco[x.enunciado]));
t('Fund. II não recebe questões do Ensino Médio', F2.questoes.every(x => banco[x.enunciado] !== 'EM'));
t('Ensino Médio não recebe questões do Fund. I', EM.questoes.every(x => banco[x.enunciado] !== 'F1'));
t('reserva também tem as 8 disciplinas', ['F1', 'F2', 'EM'].every(n => new Set(ds.find(a => a.desafio.nivel === n).questoes.map(x => x.disciplina)).size === 8));
t('reserva com discursivas', F2.questoes.filter(x => x.tipo === 'disc').length === 3);
// não repete: simula o dia seguinte
const usadosOntem = new Set(F2.questoes.map(x => x.enunciado));
await q("delete from sd_atividades where data->>'tipo' = 'desafio'");
r = await api(P, 'desafioGerarAgora'); const F2b = (await q("select data from sd_atividades where data->>'tipo' = 'desafio' and data->'desafio'->>'nivel' = 'F2'"))[0].data;
t('dia seguinte: nenhuma questão repetida do dia anterior', F2b.questoes.every(x => !usadosOntem.has(x.enunciado)), F2b.questoes.filter(x => usadosOntem.has(x.enunciado)).length);
// prazo configurável pelo professor (aplicado ao desafio de hoje)
r = await api(P, 'desafioConfigSalvar', { meu: { ativo: true, abertura: '07:30', encerramento: '21:15', diasPrazo: 0, liberar: 'manual' } });
t('professor configura o próprio prazo', r.ok && r.d.ajustados === 3 && r.d.meu.abertura === '07:30', r);
const F2c = (await q("select data from sd_atividades where id = $1", [F2b.id]))[0].data;
t('prazo aplicado ao desafio de hoje', new Date(F2c.abertura - 3 * 3600e3).toISOString().slice(11, 16) === '07:30' && new Date(F2c.encerramento - 3 * 3600e3).toISOString().slice(11, 16) === '21:15' && F2c.desafio.liberar === 'manual');
r = await api(P, 'desafioTurmaNivel', { id: tF1.id, nivel: 'F2' }); t('professor ajusta o nível da turma', r.ok && r.d.nivel === 'F2');
// reserva automática ao acessar (se o agendamento não rodou)
await q("delete from sd_atividades where data->>'tipo' = 'desafio'");
await api(P, 'desafioConfigSalvar', { meu: { ativo: true, abertura: '00:00', encerramento: '23:59', diasPrazo: 0, liberar: 'encerramento' } });
r = await api(A, 'desafioHoje'); t('acesso do aluno cria o desafio na hora, se faltar', r.ok && r.d.desafios.length >= 1 && r.d.desafios.every(d => d.qtd === 50), r.d);
// professor desliga o desafio para as turmas dele
await q("delete from sd_atividades where data->>'tipo' = 'desafio'");
await api(P, 'desafioConfigSalvar', { meu: { ativo: false } });
r = await api(A, 'desafioHoje'); t('professor pode desligar o desafio', r.d.desafios.length === 0 && !r.d.temDesafio, r.d);
console.log(`Desafio: ${ok} ok, ${falhas} falhas`);
E.restaurarConsole(); process.exit(falhas ? 1 : 0);
