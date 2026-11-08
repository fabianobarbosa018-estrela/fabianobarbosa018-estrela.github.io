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
// tarefas periódicas: liberar gabaritos no encerramento e guardar o histórico resumido
function desafioManutencao_() {
  const t = agora_(); let lib = 0, hist = 0, auto = 0;
  all_('Atividades').filter(a => a.tipo === 'desafio' && a.desafio).forEach(a => {
    if (!a.notasLiberadas && a.desafio.liberar !== 'manual' && a.encerramento && a.encerramento < t) { a.notasLiberadas = true; upd_('Atividades', a); lib++; }
    all_('Entregas').filter(e => e.atividadeId === a.id && e.status === 'rascunho' && t > provaFim_(a, e) + 120000).forEach(e => {
      const pend = autoCorrige_(a, e); const fim = provaFim_(a, e);
      e.status = pend ? 'enviada' : 'corrigida'; e.enviadoEm = Math.min(t, fim); e.atualizadoEm = t; e.atrasada = false; e.autoEnviada = true;
      if (!pend) e.corrigidoEm = t;
      upd_('Entregas', e); auto++;
    });
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
    if (cfg_().desafioPlacar || gabaritoLiberado_(a, e)) { const r = desafioResultado_(a, e); o.acertos = r.acertos; o.erros = r.erros; o.objetivas = r.objetivas; o.discPendentes = r.discPendentes; }
    if (gabaritoLiberado_(a, e)) { o.nota = e.nota; o.notaMax = e.notaMax; }
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
  dia: () => diaLocal_(agora_())
};
