/* =================== DESAFIO DIÁRIO =================== */
// Todos os dias o servidor prepara um desafio de 50 questões para cada nível de ensino (Fundamental I,
// Fundamental II e Médio). As questões vêm da IA (com revisão) e, se a IA falhar, do Banco de Atividades.
// Cada professor recebe a sua cópia (tipo 'desafio') para as turmas dele daquele nível, e o desafio usa
// todo o fluxo que já existe: rascunho, envio, correção automática, correção das discursivas e notas.
TAB.DesafioHist = ['id', 'alunoId', 'professorId', 'atividadeId', 'dia', 'nivel', 'status', 'nota', 'notaMax', 'acertos', 'erros', 'objetivas', 'discursivas', 'enviadoEm'];
Object.assign(CFG_PADRAO, { desafioAtivo: true, desafioIA: true, desafioAbertura: '06:00', desafioEncerramento: '23:00', desafioDiasPrazo: 0,
  desafioLiberar: 'encerramento', desafioDiscursivas: 3, desafioNivelPadrao: 'F2', desafioPlacar: true, desafioDuracaoMin: 0, desafioDiasSemana: [0, 1, 2, 3, 4, 5, 6] });
const DESAFIO_N = 50;
const DESAFIO_NIVEIS = { F1I: 'Anos iniciais (1º ao 3º ano)', F1: 'Ensino Fundamental I', F2: 'Ensino Fundamental II', EM: 'Ensino Médio' };
const DESAFIO_CURTO = { F1I: 'Anos iniciais', F1: 'Fund. I', F2: 'Fund. II', EM: 'Médio' };
const DESAFIO_DISC = ['Português', 'Matemática', 'História', 'Geografia', 'Educação Física', 'Física', 'Química', 'Biologia'];

function diaLocal_(t) { return new Date((t || agora_()) - 3 * 3600e3).toISOString().slice(0, 10); }
function tsLocal_(dia, hhmm, maisDias) {
  const p = String(dia).split('-').map(Number); const h = String(hhmm || '00:00').split(':').map(Number);
  return Date.UTC(p[0], p[1] - 1, p[2] + (Number(maisDias) || 0), (h[0] || 0) + 3, h[1] || 0);
}
function hhmm_(x, padrao) { const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(x || '').trim()); return m ? (m[1].length === 1 ? '0' + m[1] : m[1]) + ':' + m[2] : padrao; }
// descobre o nível pela série da turma ("6º ano" → F2, "2º ano do Ensino Médio" → EM, "3º ano" → F1...)
function nivelSerie_(serie) {
  const s = String(serie || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!s.trim()) return '';
  if (/infantil|pre-?escola|maternal|creche|jardim/.test(s)) return 'INF';
  if (/medio|\bem\b|\be\.m\b/.test(s)) return 'EM';
  const n = Number((/(\d{1,2})/.exec(s) || [])[1]);
  if (!n) return '';
  if (/serie/.test(s)) return n <= 2 ? 'F1I' : n <= 4 ? 'F1' : n <= 8 ? 'F2' : '';
  if (n >= 1 && n <= 3) return 'F1I';
  if (n >= 4 && n <= 5) return 'F1';
  if (n >= 6 && n <= 9) return 'F2';
  return '';
}
function turmaNivel_(t) { return t.nivelDesafio || nivelSerie_(t.serie) || cfg_().desafioNivelPadrao || 'F2'; }
function desafioCfgProf_(profId) {
  const c = cfg_();
  const o = { ativo: !!c.desafioAtivo, abertura: hhmm_(c.desafioAbertura, '06:00'), encerramento: hhmm_(c.desafioEncerramento, '23:00'),
    diasPrazo: Math.max(0, Math.min(6, Number(c.desafioDiasPrazo) || 0)), liberar: c.desafioLiberar === 'manual' ? 'manual' : 'encerramento',
    duracaoMin: duracao_(c.desafioDuracaoMin), diasSemana: diasSemana_(c.desafioDiasSemana) };
  const p = profId ? c['desafioProf_' + profId] : null;
  if (p && typeof p === 'object') {
    if (p.ativo === false) o.ativo = false;
    if (p.abertura) o.abertura = hhmm_(p.abertura, o.abertura);
    if (p.encerramento) o.encerramento = hhmm_(p.encerramento, o.encerramento);
    if (p.diasPrazo !== undefined && p.diasPrazo !== null && p.diasPrazo !== '') o.diasPrazo = Math.max(0, Math.min(6, Number(p.diasPrazo) || 0));
    if (p.liberar) o.liberar = p.liberar === 'manual' ? 'manual' : 'encerramento';
    if (p.duracaoMin !== undefined && p.duracaoMin !== null && p.duracaoMin !== '') o.duracaoMin = duracao_(p.duracaoMin);
    if (Array.isArray(p.diasSemana)) o.diasSemana = diasSemana_(p.diasSemana);
  }
  return o;
}
function duracao_(x) { return Math.max(0, Math.min(1440, Math.round(Number(x) || 0))); }
function diasSemana_(x) { const L = (Array.isArray(x) ? x : [0, 1, 2, 3, 4, 5, 6]).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6); return L.filter((n, i) => L.indexOf(n) === i).sort(); }
function diaSemana_(dia) { return new Date(String(dia) + 'T12:00:00Z').getUTCDay(); }
// fim do tempo da prova para este aluno: o encerramento ou o tempo disponível desde o início, o que vier primeiro
function provaFim_(a, e) {
  let fim = a.encerramento || 9e15; const dur = a.desafio && Number(a.desafio.duracaoMin);
  if (dur && e && e.iniciadoEm) fim = Math.min(fim, e.iniciadoEm + dur * 60000);
  return fim;
}
function desafioPrazo_(dia, cf) {
  const ab = tsLocal_(dia, cf.abertura); let en = tsLocal_(dia, cf.encerramento, cf.diasPrazo);
  if (en <= ab) en = tsLocal_(dia, cf.encerramento, cf.diasPrazo + 1);
  return { abertura: ab, encerramento: en };
}
// turmas que recebem desafio, agrupadas por professor e nível
function desafioAlvos_(dia) {
  const ds = dia ? diaSemana_(dia) : null;
  const grupos = {};
  all_('Turmas').filter(t => !t.arquivada).forEach(t => {
    const nv = turmaNivel_(t); if (!DESAFIO_NIVEIS[nv]) return;
    if (!all_('Matriculas').some(m => m.turmaId === t.id && m.status === 'aprovado')) return;
    const cfp = desafioCfgProf_(t.professorId); if (!cfp.ativo || (ds !== null && cfp.diasSemana.indexOf(ds) < 0)) return;
    const k = t.professorId + '|' + nv;
    (grupos[k] = grupos[k] || { professorId: t.professorId, nivel: nv, turmas: [] }).turmas.push(t.id);
  });
  return Object.keys(grupos).map(k => grupos[k]);
}
function desafiosDoDia_(dia) { return all_('Atividades').filter(a => a.tipo === 'desafio' && a.desafio && a.desafio.dia === dia); }
function desafioPendentes_(dia) {
  const feitos = desafiosDoDia_(dia); const out = [];
  desafioAlvos_(dia).forEach(x => {
    const ja = feitos.find(a => a.professorId === x.professorId && a.desafio.nivel === x.nivel);
    if ((!ja || x.turmas.some(t => ja.turmas.indexOf(t) < 0)) && out.indexOf(x.nivel) < 0) out.push(x.nivel);
  });
  return out;
}
function hashQ_(txt) {
  const s = String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
function desafioUso_(nivel) { try { return JSON.parse(PROPS().getProperty('DESAFIO_USO_' + nivel) || '{}'); } catch (e) { return {}; } }
function desafioAssuntosRecentes_(nivel) { try { return JSON.parse(PROPS().getProperty('DESAFIO_ASSUNTOS_' + nivel) || '[]'); } catch (e) { return []; } }
function dataBR_(dia) { const p = String(dia).split('-'); return p[2] + '/' + p[1]; }
// cria (ou completa) os desafios do dia para um nível, a partir das questões prontas
function desafioCriar_(dia, nivel, questoes, origem, assuntos) {
  if (!DESAFIO_NIVEIS[nivel] || !Array.isArray(questoes) || !questoes.length) return 0;
  const qs = limpaQuestoes_(questoes).map((q, i) => { q.disciplina = txt_(questoes[i].disciplina, 40); return q; });
  const feitos = desafiosDoDia_(dia).filter(a => a.desafio.nivel === nivel);
  let n = 0;
  desafioAlvos_(dia).filter(x => x.nivel === nivel).forEach(x => {
    const ja = feitos.find(a => a.professorId === x.professorId);
    if (ja) {
      const novas = x.turmas.filter(t => ja.turmas.indexOf(t) < 0);
      if (novas.length) { ja.turmas = ja.turmas.concat(novas); ja.atualizadoEm = agora_(); upd_('Atividades', ja); n++; }
      return;
    }
    const cf = desafioCfgProf_(x.professorId); const pz = desafioPrazo_(dia, cf);
    ins_('Atividades', { id: uid_('a'), professorId: x.professorId, titulo: 'Prova do dia — ' + dataBR_(dia) + ' · ' + DESAFIO_CURTO[nivel],
      tipo: 'desafio', disciplina: 'Multidisciplinar',
      instrucoes: 'Prova com ' + qs.length + ' questões de Português, Matemática, História, Geografia, Educação Física, Física, Química e Biologia. Leia com atenção, responda todas as questões e clique em FINALIZAR E ENVIAR PROVA antes do horário limite. Suas respostas são salvas automaticamente.',
      turmas: x.turmas.slice(), alunos: [], abertura: pz.abertura, encerramento: pz.encerramento, aceitaAtraso: false,
      questoes: JSON.parse(JSON.stringify(qs)), status: 'publicada', notasLiberadas: false, criadoEm: agora_(), atualizadoEm: agora_(),
      desafio: { dia: dia, nivel: nivel, origem: origem, liberar: cf.liberar, duracaoMin: cf.duracaoMin } });
    n++;
  });
  if (n && !feitos.length) {
    // memória de questões e assuntos usados (para não repetir nos próximos dias)
    const uso = desafioUso_(nivel); qs.forEach(q => { uso[hashQ_(q.enunciado)] = dia; });
    const limite = diaLocal_(agora_() - 60 * 864e5); Object.keys(uso).forEach(k => { if (uso[k] < limite) delete uso[k]; });
    PROPS().setProperty('DESAFIO_USO_' + nivel, JSON.stringify(uso));
    if (Array.isArray(assuntos) && assuntos.length) PROPS().setProperty('DESAFIO_ASSUNTOS_' + nivel, JSON.stringify(assuntos.concat(desafioAssuntosRecentes_(nivel)).slice(0, 160)));
    PROPS().setProperty('DESAFIO_ORIGEM_' + dia + '_' + nivel, origem);
  }
  return n;
}
function desafioResultado_(a, e) {
  const qs = a.questoes || []; const c = (e && e.correcao) || { pontos: [] }; const r = { objetivas: 0, acertos: 0, erros: 0, discursivas: 0, discPendentes: 0, porDisciplina: {} };
  qs.forEach((q, i) => {
    const p = c.pontos ? c.pontos[i] : null; const d = q.disciplina || 'Geral';
    const pd = r.porDisciplina[d] = r.porDisciplina[d] || { acertos: 0, total: 0 };
    if (q.tipo === 'disc') { r.discursivas++; if (p === null || p === undefined) r.discPendentes++; return; }
    r.objetivas++; pd.total++;
    if (Number(p) > 0) { r.acertos++; pd.acertos++; } else r.erros++;
  });
  return r;
}
// ---- correção automática das discursivas (nota na hora; o professor pode revisar depois) ----
const DISC_STOP = ['para','pela','pelo','pelas','pelos','como','porque','quando','qual','quais','isso','esse','essa','este','esta','isto','mais','muito','muita','muitos','muitas','com','sem','que','uma','umas','uns','dos','das','nos','nas','seu','sua','seus','suas','ele','ela','eles','elas','tem','ter','foi','ser','sao','estao','pois','mas','tambem','sobre','entre','depois','antes','ainda','cada','todo','toda','todos','todas','onde','resposta','pessoal','explique','exemplo','justificativa','voce','porque','assim','entao','aqui','nao','sim'];
function palavrasDisc_(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) || []; }
function notaDiscAuto_(q, r, temFoto) {
  const max = Number(q.pontos) || 0; const w = palavrasDisc_(r); const meio = Math.round(max) / 2;
  if (!w.length) return temFoto ? { p: meio, c: 'Resposta enviada por foto: nota automática provisória. O professor pode revisar.' } : { p: 0, c: 'Questão sem resposta.' };
  const txt = w.join(' ');
  if (/^(nao sei|sei la|nao lembro|nada|nao|sim|n sei)$/.test(txt)) return { p: 0, c: 'A resposta não explica a questão. Releia o enunciado e o gabarito comentado.' };
  const uteis = w.filter(x => x.length >= 3);
  const doEnunciado = {}; palavrasDisc_(q.enunciado).forEach(x => { doEnunciado[x.slice(0, 5)] = 1; });
  const ref = {}; palavrasDisc_((q.explicacao || '') + ' ' + (q.textoApoio || '')).filter(x => x.length >= 4 && DISC_STOP.indexOf(x) < 0).forEach(x => { ref[x.slice(0, 5)] = 1; });
  const toque = {}; let novo = 0;
  uteis.filter(x => x.length >= 4 && DISC_STOP.indexOf(x) < 0 && ref[x.slice(0, 5)]).forEach(x => { const k = x.slice(0, 5); if (!toque[k]) { toque[k] = 1; if (!doEnunciado[k]) novo++; } });
  const nt = Object.keys(toque).length; const pessoal = /resposta pessoal|resposta livre|opini/i.test(q.explicacao || '');
  let f;
  if (uteis.length < 3) f = 0;
  else if (uteis.length >= 5 && ((nt >= 2 && novo >= 1) || (pessoal && nt >= 1))) f = 1;
  else if (uteis.length >= 5 && (nt >= 1 || pessoal)) f = 0.75;
  else f = 0.5;
  const p = Math.round(max * f * 2) / 2;
  const c = f === 1 ? 'Boa resposta! (correção automática)' : f === 0 ? 'Resposta muito curta ou incompleta. (correção automática)'
    : 'Resposta parcial: compare com o gabarito comentado para completar sua explicação. (correção automática)';
  return { p: p, c: c };
}
// dá nota às discursivas ainda sem nota; devolve true se alguma foi corrigida aqui
function desafioCorrigeDisc_(a, e) {
  const qs = a.questoes || []; const c = e.correcao || (e.correcao = { pontos: [], comentarios: [] });
  c.pontos = c.pontos || []; c.comentarios = c.comentarios || []; let mudou = false;
  qs.forEach((q, i) => {
    if (q.tipo !== 'disc' || (c.pontos[i] !== null && c.pontos[i] !== undefined)) return;
    const fotos = (e.fotos || {})[i] || (e.fotos || {})[String(i)];
    const n = notaDiscAuto_(q, (e.respostas || [])[i], !!(fotos && (fotos.length || Object.keys(fotos).length)));
    c.pontos[i] = n.p; if (!c.comentarios[i]) c.comentarios[i] = n.c; mudou = true;
  });
  if (mudou) { c.autoDisc = true; e.nota = c.pontos.reduce((s, p) => s + (Number(p) || 0), 0); e.notaMax = notaMax_(a); }
  return mudou;
}
// corrige tudo (objetivas + discursivas) e marca a entrega como corrigida
function desafioCorrigir_(a, e, t) {
  autoCorrige_(a, e); desafioCorrigeDisc_(a, e);
  e.status = 'corrigida'; e.corrigidoEm = t;
}
// nota da IA para as discursivas (aplicada pelo servidor quando há chave de IA)
function desafioNotaIA_(x) {
  const e = get_('Entregas', x.entregaId); if (!e) return false; const a = get_('Atividades', e.atividadeId); if (!a) return false;
  const c = e.correcao || { pontos: [], comentarios: [] }; let mudou = false;
  (x.notas || []).forEach(n => {
    const q = (a.questoes || [])[n.i]; if (!q || q.tipo !== 'disc') return;
    const max = Number(q.pontos) || 0; const p = Math.max(0, Math.min(max, Math.round(Number(n.pontos) * 2) / 2));
    if (!isFinite(p)) return;
    c.pontos[n.i] = p; c.comentarios[n.i] = txt_(n.comentario, 600) + ' (correção automática)'; mudou = true;
  });
  if (!mudou) return false;
  c.autoDisc = true; c.ia = true; e.correcao = c; e.nota = c.pontos.reduce((s, p) => s + (Number(p) || 0), 0); upd_('Entregas', e); return true;
}
// pedido de correção para a IA: só das discursivas corrigidas automaticamente
function desafioPedidoIA_(x) {
  const e = get_('Entregas', x.entregaId); if (!e || !e.correcao || !e.correcao.autoDisc || e.correcao.ia) return null;
  const a = get_('Atividades', e.atividadeId); if (!a || a.tipo !== 'desafio') return null;
  const itens = []; (a.questoes || []).forEach((q, i) => { const r = String((e.respostas || [])[i] || '').trim(); if (q.tipo === 'disc' && r) itens.push({ i: i, pontos: Number(q.pontos) || 0, enunciado: q.enunciado, texto: (q.textoApoio || '').slice(0, 1500), esperado: q.explicacao || '', resposta: r.slice(0, 2000) }); });
  if (!itens.length) return null;
  return { entregaId: e.id, nivel: a.desafio && a.desafio.nivel, itens: itens, provedor: cfg_().iaProvedor || 'gemini' };
}
// tarefas periódicas: liberar gabaritos no encerramento e guardar o histórico resumido
function desafioManutencao_() {
  const t = agora_(); let lib = 0, hist = 0, auto = 0;
  all_('Atividades').filter(a => a.tipo === 'desafio' && a.desafio).forEach(a => {
    if (!a.notasLiberadas && a.desafio.liberar !== 'manual' && a.encerramento && a.encerramento < t) { a.notasLiberadas = true; upd_('Atividades', a); lib++; }
    all_('Entregas').filter(e => e.atividadeId === a.id && e.status === 'rascunho' && t > provaFim_(a, e) + 120000).forEach(e => {
      const fim = provaFim_(a, e); desafioCorrigir_(a, e, t);
      e.enviadoEm = Math.min(t, fim); e.atualizadoEm = t; e.atrasada = false; e.autoEnviada = true;
      upd_('Entregas', e); auto++;
    });
    // provas enviadas com discursivas esperando correção: corrige automaticamente
    all_('Entregas').filter(e => e.atividadeId === a.id && e.status === 'enviada').forEach(e => { desafioCorrigir_(a, e, t); e.atualizadoEm = t; upd_('Entregas', e); auto++; });
    all_('Entregas').filter(e => e.atividadeId === a.id && (e.status === 'enviada' || e.status === 'corrigida')).forEach(e => {
      const r = desafioResultado_(a, e);
      const o = { id: 'h' + e.id, alunoId: e.alunoId, professorId: a.professorId, atividadeId: a.id, dia: a.desafio.dia, nivel: a.desafio.nivel, status: e.status,
        nota: e.nota, notaMax: e.notaMax, acertos: r.acertos, erros: r.erros, objetivas: r.objetivas, discursivas: r.discursivas, enviadoEm: e.enviadoEm };
      const ant = get_('DesafioHist', o.id);
      if (ant && ['status', 'nota', 'acertos'].every(k => ant[k] === o[k])) return;
      if (ant) { Object.assign(ant, o); upd_('DesafioHist', ant); } else ins_('DesafioHist', o);
      hist++;
    });
  });
  return { liberados: lib, historico: hist, autoEnviadas: auto };
}
function desafioEstado_(dia) {
  const pend = desafioPendentes_(dia); const c = cfg_();
  const prim = {}; desafioAlvos_(dia).forEach(x => { const ab = desafioPrazo_(dia, desafioCfgProf_(x.professorId)).abertura; if (!prim[x.nivel] || ab < prim[x.nivel]) prim[x.nivel] = ab; });
  const existentes = {}; desafiosDoDia_(dia).forEach(a => { existentes[a.desafio.nivel] = a.questoes; });
  return { dia: dia, pendentes: pend, abertura: prim, existentes: existentes, ia: !!c.desafioIA, provedor: c.iaProvedor, discursivas: Math.max(0, Math.min(10, Number(c.desafioDiscursivas) || 0)),
    uso: pend.reduce((o, nv) => { o[nv] = desafioUso_(nv); return o; }, {}), assuntos: pend.reduce((o, nv) => { o[nv] = desafioAssuntosRecentes_(nv).slice(0, 80); return o; }, {}) };
}

/* ---- rotas ---- */
function desafioVisao_(a, u, t) {
  const e = entregaDe_(a.id, u.id);
  const o = { id: a.id, titulo: a.titulo, nivel: a.desafio.nivel, nivelNome: DESAFIO_NIVEIS[a.desafio.nivel], dia: a.desafio.dia, qtd: (a.questoes || []).length,
    abertura: a.abertura, encerramento: a.encerramento, situacao: situacao_(a, e, t), podeEnviar: podeEnviar_(a, t), rascunho: !!(e && e.status === 'rascunho'),
    respondidas: e ? (e.respostas || []).filter(x => x !== null && x !== undefined && x !== '').length : 0, liberado: !!a.notasLiberadas,
    duracaoMin: Number(a.desafio.duracaoMin) || 0, iniciadoEm: e && e.iniciadoEm || null, fim: provaFim_(a, e && e.status === 'rascunho' ? e : null),
    turmas: (a.turmas || []).filter(id => turmasAluno_(u.id).indexOf(id) >= 0).map(id => { const tt = get_('Turmas', id); return tt ? { nome: tt.nome, serie: tt.serie || '' } : null; }).filter(Boolean) };
  if (e && e.status === 'rascunho') { o.fim = provaFim_(a, e); if (t > o.fim + 120000) o.podeEnviar = false; }
  if (e && (e.status === 'enviada' || e.status === 'corrigida')) {
    o.enviadoEm = e.enviadoEm;
    const r = desafioResultado_(a, e); o.acertos = r.acertos; o.erros = r.erros; o.objetivas = r.objetivas; o.discPendentes = r.discPendentes;
    o.nota = e.nota; o.notaMax = e.notaMax;
  }
  return o;
}
rota_('desafioHoje', ALU, false, u => {
  const t = agora_(); const minhas = turmasAluno_(u.id); const dia = diaLocal_(t);
  const meus = all_('Atividades').filter(a => a.tipo === 'desafio' && a.desafio && alvo_(a, u.id, minhas));
  const hoje = meus.filter(a => a.desafio.dia === dia || (a.abertura <= t && a.encerramento >= t)).sort((x, y) => x.abertura - y.abertura);
  const vis = hoje.map(a => desafioVisao_(a, u, t));
  // previsão do próximo desafio, para a contagem regressiva
  let proximo = null;
  const niveis = minhas.map(id => get_('Turmas', id)).filter(Boolean).map(tt => ({ t: tt, nv: turmaNivel_(tt) })).filter(x => DESAFIO_NIVEIS[x.nv] && desafioCfgProf_(x.t.professorId).ativo);
  if (niveis.length) {
    const cf = desafioCfgProf_(niveis[0].t.professorId);
    const hojeAb = desafioPrazo_(dia, cf).abertura;
    if (hojeAb > t && cf.diasSemana.indexOf(diaSemana_(dia)) >= 0) proximo = hojeAb;
    else for (let k = 1; k <= 7 && !proximo; k++) { const dd = diaLocal_(t + k * 864e5); if (cf.diasSemana.indexOf(diaSemana_(dd)) >= 0) proximo = desafioPrazo_(dd, cf).abertura; }
  }
  return { agora: t, dia: dia, desafios: vis, proximo: proximo, temDesafio: niveis.length > 0, ativo: !!cfg_().desafioAtivo };
});
rota_('desafioHistorico', ALU, false, u => {
  const t = agora_(); const minhas = turmasAluno_(u.id); const vistos = {}; const L = [];
  all_('Atividades').filter(a => a.tipo === 'desafio' && a.desafio && alvo_(a, u.id, minhas) && a.abertura <= t).forEach(a => {
    const v = desafioVisao_(a, u, t); vistos[a.id] = 1; L.push(v);
  });
  all_('DesafioHist').filter(h => h.alunoId === u.id && !vistos[h.atividadeId]).forEach(h => {
    L.push({ id: h.atividadeId, antigo: true, dia: h.dia, nivel: h.nivel, nivelNome: DESAFIO_NIVEIS[h.nivel], situacao: h.status === 'corrigida' ? 'corrigida' : 'enviada', acertos: h.acertos, erros: h.erros, objetivas: h.objetivas, nota: h.nota, notaMax: h.notaMax, enviadoEm: h.enviadoEm });
  });
  L.sort((x, y) => (y.dia > x.dia ? 1 : y.dia < x.dia ? -1 : 0));
  // sequência de dias seguidos com desafio enviado
  const feitos = {}; L.filter(x => x.enviadoEm).forEach(x => { feitos[x.dia] = 1; });
  let seq = 0; let d = diaLocal_(t); if (!feitos[d]) d = diaLocal_(t - 864e5);
  while (feitos[d]) { seq++; d = diaLocal_(tsLocal_(d, '12:00') - 864e5); }
  const env = L.filter(x => x.objetivas); const ac = env.reduce((s, x) => s + (x.acertos || 0), 0), ob = env.reduce((s, x) => s + (x.objetivas || 0), 0);
  return { lista: L, sequencia: seq, feitos: L.filter(x => x.enviadoEm).length, aproveitamento: ob ? Math.round(1000 * ac / ob) / 10 : null };
});
rota_('desafioPainel', PROF, false, u => {
  const adm = u.perfil === 'admin'; const c = cfg_(); const t = agora_(); const dia = diaLocal_(t);
  const turmas = all_('Turmas').filter(x => !x.arquivada && (adm || x.professorId === u.id)).map(x => ({ id: x.id, nome: x.nome, serie: x.serie || '', nivel: turmaNivel_(x), nivelAuto: nivelSerie_(x.serie), fixo: x.nivelDesafio || '',
    alunos: all_('Matriculas').filter(m => m.turmaId === x.id && m.status === 'aprovado').length, professor: adm ? nomeU_(x.professorId) : '' }));
  const recentes = all_('Atividades').filter(a => a.tipo === 'desafio' && a.desafio && (adm || a.professorId === u.id)).sort((x, y) => (y.desafio.dia > x.desafio.dia ? 1 : -1)).slice(0, 30).map(a => {
    const ents = all_('Entregas').filter(e => e.atividadeId === a.id && e.status !== 'rascunho');
    const rs = ents.map(e => desafioResultado_(a, e)); const ob = rs.reduce((s, r) => s + r.objetivas, 0), ac = rs.reduce((s, r) => s + r.acertos, 0);
    return { id: a.id, titulo: a.titulo, dia: a.desafio.dia, nivel: a.desafio.nivel, origem: a.desafio.origem, abertura: a.abertura, encerramento: a.encerramento,
      alunos: alunosAlvo_(a).length, entregues: ents.length, aCorrigir: ents.filter(e => e.status === 'enviada').length, aproveitamento: ob ? Math.round(1000 * ac / ob) / 10 : null,
      liberado: !!a.notasLiberadas, professor: adm ? nomeU_(a.professorId) : '' };
  });
  return { dia: dia, agora: t, global: { ativo: !!c.desafioAtivo, ia: !!c.desafioIA, abertura: hhmm_(c.desafioAbertura, '06:00'), encerramento: hhmm_(c.desafioEncerramento, '23:00'),
      diasPrazo: Number(c.desafioDiasPrazo) || 0, liberar: c.desafioLiberar, discursivas: Number(c.desafioDiscursivas), nivelPadrao: c.desafioNivelPadrao, placar: !!c.desafioPlacar,
      duracaoMin: duracao_(c.desafioDuracaoMin), diasSemana: diasSemana_(c.desafioDiasSemana) },
    meu: desafioCfgProf_(u.id), proprio: c['desafioProf_' + u.id] || null, turmas: turmas, recentes: recentes, pendentes: desafioPendentes_(dia), niveis: DESAFIO_NIVEIS,
    iaChave: true, admin: adm };
});
rota_('desafioConfigSalvar', PROF, true, (u, d) => {
  const t = agora_(); const dia = diaLocal_(t);
  if (d.global) {
    if (u.perfil !== 'admin') erro_('Só o administrador altera as configurações gerais.');
    const g = d.global;
    setCfg_('desafioAtivo', !!g.ativo); setCfg_('desafioIA', !!g.ia); setCfg_('desafioPlacar', g.placar !== false);
    setCfg_('desafioAbertura', hhmm_(g.abertura, '06:00')); setCfg_('desafioEncerramento', hhmm_(g.encerramento, '23:00'));
    setCfg_('desafioDiasPrazo', Math.max(0, Math.min(6, Number(g.diasPrazo) || 0))); setCfg_('desafioLiberar', g.liberar === 'manual' ? 'manual' : 'encerramento');
    setCfg_('desafioDiscursivas', Math.max(0, Math.min(10, Math.round(Number(g.discursivas) || 0))));
    if (DESAFIO_NIVEIS[g.nivelPadrao]) setCfg_('desafioNivelPadrao', g.nivelPadrao);
    if (g.duracaoMin !== undefined) setCfg_('desafioDuracaoMin', duracao_(g.duracaoMin));
    if (Array.isArray(g.diasSemana)) { if (!diasSemana_(g.diasSemana).length) erro_('Escolha pelo menos um dia da semana para a prova.'); setCfg_('desafioDiasSemana', diasSemana_(g.diasSemana)); }
  }
  if (d.meu) {
    const m = d.meu;
    setCfg_('desafioProf_' + u.id, { ativo: m.ativo !== false, abertura: hhmm_(m.abertura, ''), encerramento: hhmm_(m.encerramento, ''),
      diasPrazo: m.diasPrazo === '' || m.diasPrazo === undefined ? '' : Math.max(0, Math.min(6, Number(m.diasPrazo) || 0)), liberar: m.liberar === 'manual' ? 'manual' : m.liberar === 'encerramento' ? 'encerramento' : '',
      duracaoMin: m.duracaoMin === '' || m.duracaoMin === undefined ? '' : duracao_(m.duracaoMin), diasSemana: Array.isArray(m.diasSemana) ? diasSemana_(m.diasSemana) : undefined });
    if (Array.isArray(m.diasSemana) && !diasSemana_(m.diasSemana).length) erro_('Escolha pelo menos um dia da semana para a prova.');
  }
  // aplica o novo prazo aos desafios de hoje e de amanhã que ainda não encerraram
  let ajustados = 0;
  all_('Atividades').filter(a => a.tipo === 'desafio' && a.desafio && a.desafio.dia >= dia && (a.professorId === u.id || (d.global && u.perfil === 'admin'))).forEach(a => {
    const cf = desafioCfgProf_(a.professorId); const pz = desafioPrazo_(a.desafio.dia, cf);
    if (a.encerramento < t) return;
    a.abertura = pz.abertura; a.encerramento = pz.encerramento; a.desafio.liberar = cf.liberar; a.desafio.duracaoMin = cf.duracaoMin; a.atualizadoEm = t; upd_('Atividades', a); ajustados++;
  });
  log_(u, 'desafio_config', JSON.stringify(d).slice(0, 250));
  return { ajustados: ajustados, meu: desafioCfgProf_(u.id) };
});
rota_('desafioTurmaNivel', PROF, true, (u, d) => {
  const t = minhaTurma_(u, d.id);
  t.nivelDesafio = DESAFIO_NIVEIS[d.nivel] || d.nivel === 'INF' ? d.nivel : ''; upd_('Turmas', t);
  return { nivel: turmaNivel_(t) };
});
// prepara agora os desafios que faltam hoje (IA, se disponível; senão, banco)
rota_('desafioGerarAgora', PROF, true, u => {
  if (!cfg_().desafioAtivo) erro_('O desafio diário está desligado nas configurações.');
  const dia = diaLocal_(agora_()); const pend = desafioPendentes_(dia);
  if (!pend.length) erro_('Os desafios de hoje já estão prontos para todas as turmas.');
  log_(u, 'desafio_gerar', pend.join(','));
  return { __desafio: { acao: 'preparar', dia: dia, chave: PROPS().getProperty('BANCO_CHAVE') || '' } };
});
rota_('desafioIniciar', ALU, true, (u, d) => {
  const a = ativAluno_(u, d.id); if (a.tipo !== 'desafio') erro_('Esta não é uma prova do dia.');
  const e = rascunho_(u, a); if (!e.respostas || !e.respostas.length) { e.respostas = (a.questoes || []).map(() => null); }
  e.atualizadoEm = agora_(); upd_('Entregas', e);
  return { iniciadoEm: e.iniciadoEm, fim: provaFim_(a, e), agora: agora_() };
});
const DESAFIO_SIS = {
  estado: a => desafioEstado_(a.dia),
  criar: a => desafioCriar_(a.dia, a.nivel, a.questoes, a.origem, a.assuntos),
  manutencao: () => desafioManutencao_(),
  bancoChave: () => PROPS().getProperty('BANCO_CHAVE') || '',
  segredo: () => PROPS().getProperty('CRON_SEGREDO') || '',
  dia: () => diaLocal_(agora_()),
  pedidoIA: x => desafioPedidoIA_(x),
  notaIA: x => desafioNotaIA_(x)
};

// ================== FALTAS NA PROVA DO DIA (alerta + mensagem para o responsável) ==================
const FALTA_JANELA_DIAS = 14;
function normNome_(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }
function desafioFaltas_(u) {
  const adm = u.perfil === 'admin'; const t = agora_(); const corte = diaLocal_(t - FALTA_JANELA_DIAS * 864e5);
  const turmas = {}; all_('Turmas').filter(x => !x.arquivada && (adm || x.professorId === u.id)).forEach(x => { turmas[x.id] = x; });
  const provas = all_('Atividades').filter(a => a.tipo === 'desafio' && a.desafio && !a.desafio.extra && a.status === 'publicada' && a.encerramento && a.encerramento < t && a.desafio.dia >= corte && (a.turmas || []).some(id => turmas[id]))
    .sort((x, y) => (x.desafio.dia < y.desafio.dia ? -1 : 1));
  const mats = all_('Matriculas').filter(m => m.status === 'aprovado' && turmas[m.turmaId]);
  const ents = {}; all_('Entregas').forEach(e => { if (e.status === 'enviada' || e.status === 'corrigida') ents[e.atividadeId + '|' + e.alunoId] = 1; });
  const porAluno = {};
  provas.forEach(a => {
    mats.filter(m => (a.turmas || []).indexOf(m.turmaId) >= 0).forEach(m => {
      if ((m.decididoEm || m.criadoEm || 0) > a.encerramento) return;       // entrou na turma depois da prova
      if (ents[a.id + '|' + m.alunoId]) return;
      const al = get_('Usuarios', m.alunoId); if (!al || al.perfil !== 'aluno' || al.status !== 'ativo') return;
      const x = porAluno[al.id] || (porAluno[al.id] = { alunoId: al.id, nome: al.nome, turma: turmas[m.turmaId].nome, responsavel: al.responsavelNome || '', telefone: al.responsavelTelefone || '',
        ignorar: !!al.faltaIgnorar, avisadoAte: al.faltaAvisadoAte || '', faltas: [] });
      if (!x.faltas.some(f => f.dia === a.desafio.dia)) x.faltas.push({ dia: a.desafio.dia, titulo: a.titulo });
    });
  });
  const alunos = Object.keys(porAluno).map(k => porAluno[k]);
  alunos.forEach(x => { x.novas = x.faltas.filter(f => f.dia > x.avisadoAte).length; });
  // agrupa irmãos com o mesmo responsável numa única mensagem
  const grupos = {};
  alunos.filter(x => !x.ignorar).forEach(x => {
    const k = x.responsavel ? 'r:' + normNome_(x.responsavel) : 'a:' + x.alunoId;
    const g = grupos[k] || (grupos[k] = { chave: k, responsavel: x.responsavel, telefone: '', alunos: [], novas: 0 });
    g.alunos.push(x); g.novas += x.novas; if (!g.telefone && x.telefone) g.telefone = x.telefone;
  });
  const lista = Object.keys(grupos).map(k => grupos[k]).sort((p, q) => (q.novas - p.novas) || (p.alunos[0].nome < q.alunos[0].nome ? -1 : 1));
  return { agora: t, janelaDias: FALTA_JANELA_DIAS, grupos: lista, ignorados: alunos.filter(x => x.ignorar).map(x => ({ alunoId: x.alunoId, nome: x.nome, faltas: x.faltas.length })),
    novas: lista.reduce((s, g) => s + (g.novas ? 1 : 0), 0),
    abertura: hhmm_(desafioCfgProf_(u.id).abertura || cfg_().desafioAbertura, '06:00'), encerramento: hhmm_(desafioCfgProf_(u.id).encerramento || cfg_().desafioEncerramento, '23:00') };
}
function alunoDoProf_(u, alunoId) {
  const al = get_('Usuarios', alunoId); if (!al || al.perfil !== 'aluno') throw new Error('Aluno não encontrado.');
  if (u.perfil !== 'admin') {
    const minhas = all_('Turmas').filter(x => x.professorId === u.id).map(x => x.id);
    if (!all_('Matriculas').some(m => m.alunoId === al.id && minhas.indexOf(m.turmaId) >= 0)) throw new Error('Este aluno não está nas suas turmas.');
  }
  return al;
}
rota_('desafioFaltas', PROF, false, u => desafioFaltas_(u));
rota_('desafioFaltasResumo', PROF, false, u => { const f = desafioFaltas_(u); return { novas: f.novas }; });
// marca como avisado: o alerta some até o aluno faltar de novo
rota_('desafioFaltaAvisado', PROF, true, (u, d) => {
  const ids = Array.isArray(d.alunos) ? d.alunos.slice(0, 20) : []; const ate = String(d.ate || diaLocal_(agora_())).slice(0, 10);
  ids.forEach(id => { const al = alunoDoProf_(u, id); al.faltaAvisadoAte = ate; upd_('Usuarios', al); });
  return { ok: true };
});
rota_('desafioResponsavelSalvar', PROF, true, (u, d) => {
  const al = alunoDoProf_(u, d.alunoId);
  if (d.responsavel !== undefined) al.responsavelNome = txt_(d.responsavel, 100);
  if (d.telefone !== undefined) al.responsavelTelefone = String(d.telefone || '').replace(/\D/g, '').slice(0, 15);
  if (d.ignorar !== undefined) al.faltaIgnorar = !!d.ignorar;
  upd_('Usuarios', al); return { ok: true };
});
// quadro de notas: quem fez cada prova do dia e a nota (por turma, últimos dias)
rota_('desafioQuadro', PROF, false, u => {
  const adm = u.perfil === 'admin'; const t = agora_(); const corte = diaLocal_(t - FALTA_JANELA_DIAS * 864e5);
  const turmas = all_('Turmas').filter(x => !x.arquivada && (adm || x.professorId === u.id));
  return { agora: t, turmas: turmas.map(tu => {
    const provas = all_('Atividades').filter(a => a.tipo === 'desafio' && a.desafio && a.status === 'publicada' && a.desafio.dia >= corte && (a.turmas || []).indexOf(tu.id) >= 0 && a.abertura <= t)
      .sort((x, y) => (x.desafio.dia < y.desafio.dia ? 1 : x.desafio.dia > y.desafio.dia ? -1 : (y.criadoEm || 0) - (x.criadoEm || 0))).slice(0, 10);
    const mats = all_('Matriculas').filter(m => m.turmaId === tu.id && m.status === 'aprovado');
    const alunos = mats.map(m => get_('Usuarios', m.alunoId)).filter(al => al && al.perfil === 'aluno' && al.status === 'ativo').sort((a, b) => (a.nome < b.nome ? -1 : 1));
    return { id: tu.id, nome: tu.nome, serie: tu.serie || '',
      provas: provas.map(a => ({ id: a.id, dia: a.desafio.dia, extra: !!a.desafio.extra, encerrada: a.encerramento < t, encerramento: a.encerramento, notaMax: notaMax_(a) })),
      alunos: alunos.map(al => {
        const m = mats.find(x => x.alunoId === al.id);
        return { id: al.id, nome: al.nome, ignorar: !!al.faltaIgnorar, avisos: Array.isArray(al.pushSubs) && al.pushSubs.length > 0, provas: provas.map(a => {
          const e = all_('Entregas').find(x => x.atividadeId === a.id && x.alunoId === al.id);
          if ((m.decididoEm || m.criadoEm || 0) > a.encerramento) return { s: 'nova' };
          if (!e) return { s: a.encerramento < t ? (a.desafio.extra ? 'extra' : 'faltou') : 'aberta' };
          if (e.status === 'rascunho') return { s: a.encerramento < t ? (a.desafio.extra ? 'extra' : 'faltou') : 'fazendo', inicio: e.iniciadoEm || null };
          return { s: e.status === 'corrigida' ? 'corrigida' : 'enviada', nota: e.nota, notaMax: e.notaMax || notaMax_(a), em: e.enviadoEm, entregaId: e.id, auto: !!e.autoEnviada };
        }) };
      }) };
  }) };
});

// ================== AVISOS NO CELULAR (Web Push) ==================
const PUSH_LEMBRETE_ANTES = 4 * 3600e3;   // lembrete para quem ainda não fez: 4 h antes do encerramento
function pushSubs_(ids) {
  const out = []; (ids || []).forEach(id => { const u = get_('Usuarios', id); (u && Array.isArray(u.pushSubs) ? u.pushSubs : []).forEach(s => out.push({ userId: id, endpoint: s.endpoint, keys: s.keys })); }); return out;
}
function provaPendentesDe_(a, t) {
  const feitos = {}; all_('Entregas').forEach(e => { if (e.atividadeId === a.id && (e.status === 'enviada' || e.status === 'corrigida')) feitos[e.alunoId] = 1; });
  return alunosAlvo_(a).filter(id => !feitos[id]);
}
function provasAbertas_(t, filtro) {
  return all_('Atividades').filter(a => a.tipo === 'desafio' && a.desafio && a.status === 'publicada' && a.abertura <= t && a.encerramento > t && (!filtro || filtro(a)));
}
function msgProva_(a, tipo) {
  const hora = new Date(a.encerramento - 3 * 3600e3).toISOString().slice(11, 16);
  return tipo === 'lembrete'
    ? { titulo: '⏰ Ainda dá tempo!', corpo: 'Você ainda não fez a Prova do dia. Ela fecha às ' + hora + '. Bora?', url: './', tag: 'prova-' + a.id }
    : { titulo: '📝 Prova do dia liberada!', corpo: a.titulo.replace(/^Prova do dia — /, '') + ' · ' + (a.questoes || []).length + ' questões. Disponível até as ' + hora + '.', url: './', tag: 'prova-' + a.id };
}
// cron: aviso de abertura e lembrete; marca na prova para não repetir
function pushPendentes_() {
  const t = agora_(); const envios = []; const h = Number(new Date(t - 3 * 3600e3).toISOString().slice(11, 13));
  if (h < 6 || h >= 22) return envios;   // não acorda ninguém de madrugada
  provasAbertas_(t).forEach(a => {
    const d = a.desafio; let tipo = null;
    if (!d.avisoAbertura) { tipo = 'abertura'; d.avisoAbertura = t; }
    else if (!d.avisoLembrete && a.encerramento - t <= PUSH_LEMBRETE_ANTES && t - d.avisoAbertura > 3600e3) { tipo = 'lembrete'; d.avisoLembrete = t; }
    if (!tipo) return;
    upd_('Atividades', a);
    const subs = pushSubs_(provaPendentesDe_(a, t)); if (subs.length) envios.push({ msg: msgProva_(a, tipo), subs: subs });
  });
  return envios;
}
function pushRemover_(x) {
  const mortos = (x && x.endpoints) || []; if (!mortos.length) return 0; let n = 0;
  all_('Usuarios').forEach(u => { if (!Array.isArray(u.pushSubs)) return; const antes = u.pushSubs.length; u.pushSubs = u.pushSubs.filter(s => mortos.indexOf(s.endpoint) < 0); if (u.pushSubs.length !== antes) { n += antes - u.pushSubs.length; upd_('Usuarios', u); } });
  return n;
}
function pushChaves_() { const j = PROPS().getProperty('VAPID_JWK'), p = PROPS().getProperty('VAPID_PUB'); return j && p ? { jwk: JSON.parse(j), pub: p } : null; }
DESAFIO_SIS.pushPendentes = () => pushPendentes_();
DESAFIO_SIS.pushRemover = x => pushRemover_(x);
DESAFIO_SIS.pushChaves = () => pushChaves_();
DESAFIO_SIS.pushSalvarChaves = x => { PROPS().setProperty('VAPID_JWK', JSON.stringify(x.jwk)); PROPS().setProperty('VAPID_PUB', x.pub); return true; };
DESAFIO_SIS.pushAlvos = x => pushSubs_(x.ids);
rota_('pushChave', [ 'aluno', 'professor', 'admin' ], false, () => ({ __push: { acao: 'chave' } }));
rota_('pushInscrever', [ 'aluno', 'professor', 'admin' ], true, (u, d) => {
  const ep = String(d.endpoint || ''); const k = d.keys || {};
  if (!/^https:\/\/[^\s]{10,800}$/.test(ep) || !/^[\w-]{40,120}$/.test(String(k.p256dh || '')) || !/^[\w-]{10,40}$/.test(String(k.auth || ''))) erro_('Inscrição de aviso inválida.');
  const subs = (Array.isArray(u.pushSubs) ? u.pushSubs : []).filter(s => s.endpoint !== ep);
  subs.unshift({ endpoint: ep, keys: { p256dh: String(k.p256dh), auth: String(k.auth) }, criadoEm: agora_() });
  u.pushSubs = subs.slice(0, 5); upd_('Usuarios', u);
  return { __push: { acao: 'enviar', envios: [{ msg: { titulo: '🔔 Avisos ativados!', corpo: 'Pronto! Você vai receber um aviso aqui quando a Prova do dia abrir.', url: './', tag: 'teste' }, subs: [{ userId: u.id, endpoint: ep, keys: k }] }] } };
});
rota_('pushCancelar', [ 'aluno', 'professor', 'admin' ], true, (u, d) => {
  u.pushSubs = (Array.isArray(u.pushSubs) ? u.pushSubs : []).filter(s => s.endpoint !== String(d.endpoint || '')); upd_('Usuarios', u); return { ok: true };
});
rota_('pushStatus', [ 'aluno', 'professor', 'admin' ], false, (u, d) => ({ ativo: (Array.isArray(u.pushSubs) ? u.pushSubs : []).some(s => s.endpoint === String(d.endpoint || '')), aparelhos: (u.pushSubs || []).length }));
// professor: avisar agora quem ainda não fez a prova aberta
rota_('pushAvisarAgora', PROF, false, u => {
  const adm = u.perfil === 'admin'; const t = agora_(); const minhas = all_('Turmas').filter(x => adm || x.professorId === u.id).map(x => x.id);
  const envios = []; let alunos = 0;
  provasAbertas_(t, a => (a.turmas || []).some(id => minhas.indexOf(id) >= 0)).forEach(a => {
    const ids = provaPendentesDe_(a, t).filter(id => all_('Matriculas').some(m => m.alunoId === id && m.status === 'aprovado' && minhas.indexOf(m.turmaId) >= 0 && (a.turmas || []).indexOf(m.turmaId) >= 0));
    alunos += ids.length; const subs = pushSubs_(ids); if (subs.length) envios.push({ msg: msgProva_(a, a.encerramento - t <= PUSH_LEMBRETE_ANTES ? 'lembrete' : 'abertura'), subs: subs });
  });
  return { __push: { acao: 'enviar', envios: envios, alunos: alunos } };
});
// quantos alunos têm avisos ligados (para o professor)
function pushAtivo_(id) { const u = get_('Usuarios', id); return !!(u && Array.isArray(u.pushSubs) && u.pushSubs.length); }
