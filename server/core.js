// SALA DIGITAL — núcleo do servidor (gerado a partir do Code.gs testado)
// Roda igual no Supabase (Deno) e nos testes locais (Node).
export function criarNucleo(deps) {
  const { sha256b64, uuid } = deps; const _senhasAleatorias = !!deps.senhasAleatorias;
  let _kv = {}, _upl = [], _rm = [], _rpc = [];
  const kvOp = (k, v, s) => { _ops.push({ op: 'kv', k: k, v: v === null ? null : String(v), s: s === undefined ? null : s }); };
  const Utilities = { getUuid: uuid, DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
    computeDigest: (a, s) => ({ __b64: sha256b64(s) }), base64Encode: b => b.__b64 };
  const CacheService = { getScriptCache: () => ({
    get: k => { const x = _kv['c:' + k]; return x === undefined ? null : x; },
    restante: k => { const e = _kv['e:' + k]; return e ? (e - Date.now()) / 1000 : 0; },
    put: (k, v, s) => { _kv['c:' + k] = String(v); _kv['e:' + k] = Date.now() + s * 1000; kvOp('c:' + k, v, s); },
    remove: k => { delete _kv['c:' + k]; kvOp('c:' + k, null); } }) };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: k => { const x = _kv['p:' + k]; return x === undefined ? null : x; }, setProperty: (k, v) => { _kv['p:' + k] = String(v); kvOp('p:' + k, v); } }) };
/* =================== CONFIGURAÇÃO INICIAL =================== */
const INICIAL = {
  nomePlataforma: 'Sala Digital',
  adminLogin: 'admin',
  adminSenha: 'Admin@2026',      // o sistema obriga a trocar no 1º acesso
  criarDemonstracao: true        // cria professor/aluno/turma de demonstração
};

/* =================== ESTRUTURA DO BANCO =================== */
const TAB = {
  Usuarios:   ['id','perfil','nome','login','email','senhaHash','salt','status','nascimento','responsavelNome','responsavelEmail','consentimento','trocarSenha','criadoEm','ultimoAcesso'],
  Turmas:     ['id','professorId','nome','disciplina','serie','codigo','descricao','arquivada','criadoEm'],
  Matriculas: ['id','turmaId','alunoId','status','criadoEm','decididoEm'],
  Atividades: ['id','professorId','titulo','tipo','disciplina','instrucoes','turmas','alunos','abertura','encerramento','aceitaAtraso','questoes','status','notasLiberadas','criadoEm','atualizadoEm'],
  Entregas:   ['id','atividadeId','alunoId','respostas','fotos','status','iniciadoEm','enviadoEm','atrasada','nota','notaMax','correcao','comentario','corrigidoEm','historico','revisaoPedida','revisaoMsg','atualizadoEm'],
  Config:     ['chave','valor'],
  Arquivos:   ['id','tipo','alunoId','atividadeId','entregaId','professorId','mime','tamanho','criadoEm'],
  Log:        ['id','data','usuarioId','acao','detalhe']
};
const JSONF = { Atividades:['turmas','alunos','questoes'], Entregas:['respostas','fotos','correcao','historico'], Config:['valor'] };
const BOOLF = { Usuarios:['consentimento','trocarSenha'], Turmas:['arquivada'], Atividades:['aceitaAtraso','notasLiberadas'], Entregas:['atrasada','revisaoPedida'] };
const NUMF  = { Usuarios:['criadoEm','ultimoAcesso'], Turmas:['criadoEm'], Matriculas:['criadoEm','decididoEm'],
  Atividades:['abertura','encerramento','criadoEm','atualizadoEm'],
  Entregas:['iniciadoEm','enviadoEm','nota','notaMax','corrigidoEm','atualizadoEm'], Log:['data'] };
const CFG_PADRAO = { nomePlataforma: INICIAL.nomePlataforma, cadastroAlunos: true, cadastroProfessores: true,
  aprovarProfessores: true, fotoMaxMB: 3, fotosPorQuestao: 5, escalaNota: 10, emailContato: '' };
const TIPOS_ATIV = ['atividade','exercicio','prova','simulado'];
const SESSAO_SEG = 21600; // 6 horas (renovada a cada uso)

/* =================== PÁGINA =================== */


/* =================== UTILITÁRIOS =================== */
const PROPS = () => PropertiesService.getScriptProperties();
let _cache = {}; let _ops = [];

function agora_() { return Date.now(); }
function uid_(p) { return (p || '') + Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function erro_(m) { const e = new Error(m); e.publico = true; throw e; }
function txt_(s, max) { return String(s == null ? '' : s).trim().slice(0, max || 500); }
function limpa_(o) { if (!o) return o; const c = Object.assign({}, o); delete c._row; return c; }





/* ---- tabelas ---- */
function tab_(t) { if (!_cache[t]) _cache[t] = []; return _cache[t]; }
function all_(t) { return tab_(t); }
function get_(t, id) { return id ? (all_(t).find(r => r.id === id) || null) : null; }
function ins_(t, o) { tab_(t).push(o); _ops.push({ op: 'set', t: t, o: o }); return o; }
function upd_(t, o) { _ops.push({ op: 'set', t: t, o: o }); return o; }
function del_(t, lista) {
  (Array.isArray(lista) ? lista : [lista]).filter(Boolean).forEach(o => {
    const id = o.id || o.chave; _ops.push({ op: 'del', t: t, id: id });
    const a = tab_(t); const i = a.indexOf(o); if (i >= 0) a.splice(i, 1);
  });
}

/* ---- configurações ---- */
function cfg_() {
  const o = Object.assign({}, CFG_PADRAO);
  try { all_('Config').forEach(r => { if (r.valor !== null) o[r.chave] = r.valor; }); } catch (e) { }
  return o;
}
function setCfg_(k, v) {
  const r = all_('Config').find(x => x.chave === k);
  if (r) { r.valor = v; upd_('Config', r); } else ins_('Config', { chave: k, valor: v });
}

/* ---- pastas no Drive ---- */


/* ---- log de auditoria ---- */
function log_(u, acao, detalhe) {
  try { ins_('Log', { id: uid_('l'), data: agora_(), usuarioId: u ? u.id : '', acao: acao, detalhe: txt_(detalhe, 300) }); } catch (e) { }
}

/* =================== SEGURANÇA =================== */
function hash_(senha, salt) {
  let h = String(senha);
  for (let i = 0; i < 300; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + h, Utilities.Charset.UTF_8));
  return h;
}
function confere_(u, senha) { return !!u && hash_(senha, u.salt) === u.senhaHash; }
function defineSenha_(u, senha) { u.salt = Utilities.getUuid(); u.senhaHash = hash_(senha, u.salt); }
function validaSenha_(s) {
  s = String(s || '');
  if (s.length < 6) erro_('A senha precisa ter pelo menos 6 caracteres.');
  if (s.length > 100) erro_('Senha muito longa.');
}
function senhaTemp_() {
  const c = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = '';
  for (let i = 0; i < 8; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}
function normLogin_(s) { return String(s || '').trim().toLowerCase(); }
function validaLogin_(l) {
  if (!/^[a-z0-9._@-]{3,60}$/.test(l)) erro_('Usuário inválido: use de 3 a 60 caracteres (letras sem acento, números, ponto, hífen ou @).');
}
function validaEmail_(e) { if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) erro_('E-mail inválido.'); }
function idade_(nasc) {
  if (!nasc || !/^\d{4}-\d{2}-\d{2}$/.test(nasc)) return null;
  const p = nasc.split('-').map(Number); const n = new Date();
  let a = n.getFullYear() - p[0]; const m = n.getMonth() + 1 - p[1];
  if (m < 0 || (m === 0 && n.getDate() < p[2])) a--; return a;
}
function sessao_(tk) {
  if (!tk) return null;
  const c = CacheService.getScriptCache(); const id = c.get('s_' + tk);
  if (!id) return null;
  const u = get_('Usuarios', id);
  if (!u || u.status !== 'ativo') { c.remove('s_' + tk); return null; }
  if (c.restante('s_' + tk) < SESSAO_SEG - 3600) c.put('s_' + tk, id, SESSAO_SEG);
  return u;
}
function novaSessao_(u) {
  const tk = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('s_' + tk, u.id, SESSAO_SEG); return tk;
}
function pubU_(u) {
  return u ? { id: u.id, perfil: u.perfil, nome: u.nome, login: u.login, email: u.email || '', status: u.status,
    nascimento: u.nascimento || '', criadoEm: u.criadoEm, ultimoAcesso: u.ultimoAcesso, trocarSenha: !!u.trocarSenha } : null;
}
function nomeU_(id) { const u = get_('Usuarios', id); return u ? u.nome : '(usuário removido)'; }

/* =================== ENTRADA DA API =================== */
function api(token, acao, d) {
  d = d || {};
  const r = ROTAS[acao];
  if (!r) return { ok: false, erro: 'Ação desconhecida.' };
  let lock = null;
  try {
    let u = null;
    if (r.perfis) {
      u = sessao_(token);
      if (!u) return { ok: false, erro: 'Sua sessão expirou. Entre novamente.', sessao: true };
      if (r.perfis.indexOf(u.perfil) < 0) return { ok: false, erro: 'Você não tem permissão para isso.' };
      if (u.trocarSenha && ['trocarSenha', 'eu', 'sair'].indexOf(acao) < 0) return { ok: false, erro: 'Defina uma nova senha para continuar.', trocar: true };
    }
    
    const res = r.fn(u, d, token);
    return { ok: true, d: res === undefined ? null : res };
  } catch (e) {
    if (e && e.publico) return { ok: false, erro: e.message };
    if (typeof console !== 'undefined') console.error(acao, e && e.stack ? e.stack : e);
    return { ok: false, erro: 'Não foi possível concluir. Tente novamente em instantes.' };
  } finally { if (lock) try { lock.releaseLock(); } catch (e) { } }
}
const TODOS = ['admin', 'professor', 'aluno'], PROF = ['admin', 'professor'], ALU = ['aluno'], ADM = ['admin'];
const ROTAS = {};
function rota_(nome, perfis, grava, fn) { ROTAS[nome] = { perfis: perfis, grava: grava, fn: fn }; }

/* =================== ACESSO (público) =================== */
rota_('info', null, false, () => {
  const c = cfg_();
  return { nome: c.nomePlataforma, cadastroAlunos: !!c.cadastroAlunos, cadastroProfessores: !!c.cadastroProfessores, emailContato: c.emailContato || '' };
});

rota_('entrar', null, true, (_, d) => {
  const login = normLogin_(d.login); const c = CacheService.getScriptCache();
  const k = 'f_' + login; const falhas = Number(c.get(k) || 0);
  if (falhas >= 5) erro_('Muitas tentativas. Aguarde 15 minutos ou use "Esqueci minha senha".');
  const u = all_('Usuarios').find(x => x.login === login || (x.email && x.email.toLowerCase() === login));
  if (!u || !confere_(u, d.senha)) {
    c.put(k, String(falhas + 1), 900); log_(u, 'login_falhou', login);
    erro_('Usuário ou senha incorretos.');
  }
  if (u.status === 'pendente') erro_('Seu cadastro de professor aguarda aprovação do administrador.');
  if (u.status !== 'ativo') erro_('Esta conta está bloqueada. Fale com a escola/administrador.');
  c.remove(k); u.ultimoAcesso = agora_(); upd_('Usuarios', u); log_(u, 'login', '');
  return { token: novaSessao_(u), usuario: pubU_(u) };
});

rota_('cadastrar', null, true, (_, d) => {
  const c = cfg_(); const perfil = d.perfil === 'professor' ? 'professor' : 'aluno';
  if (perfil === 'aluno' && !c.cadastroAlunos) erro_('O cadastro de alunos está fechado. Peça ao professor para criar sua conta.');
  if (perfil === 'professor' && !c.cadastroProfessores) erro_('O cadastro de professores está fechado.');
  if (!d.aceite) erro_('É preciso aceitar a Política de Privacidade.');
  const pendente = perfil === 'professor' && !!c.aprovarProfessores;
  const u = criarUsuario_({ perfil: perfil, nome: d.nome, login: d.login, email: d.email, senha: d.senha,
    nascimento: d.nascimento, responsavelNome: d.responsavelNome, responsavelEmail: d.responsavelEmail,
    consentimento: true, status: pendente ? 'pendente' : 'ativo' });
  log_(u, 'cadastro', perfil);
  if (pendente) return { pendente: true };
  return { token: novaSessao_(u), usuario: pubU_(u) };
});

function criarUsuario_(o) {
  const nome = txt_(o.nome, 100); if (nome.length < 3) erro_('Informe o nome completo.');
  const login = normLogin_(o.login); validaLogin_(login);
  const email = normLogin_(o.email); validaEmail_(email);
  validaSenha_(o.senha);
  const us = all_('Usuarios');
  if (us.some(x => x.login === login || (x.email && x.email === login))) erro_('Este usuário já está em uso. Escolha outro.');
  if (email && us.some(x => x.email === email || x.login === email)) erro_('Este e-mail já está cadastrado.');
  let resp = '', respEmail = '';
  if (o.perfil === 'aluno') {
    if (o.nascimento && idade_(o.nascimento) === null) erro_('Data de nascimento inválida.');
    const id = idade_(o.nascimento);
    if (id !== null && id < 18 && !o.semResponsavel) {
      resp = txt_(o.responsavelNome, 100); respEmail = normLogin_(o.responsavelEmail);
      if (resp.length < 3) erro_('Aluno menor de 18 anos: informe o nome do responsável.');
      validaEmail_(respEmail);
      if (!respEmail) erro_('Aluno menor de 18 anos: informe o e-mail do responsável.');
    }
  }
  const u = { id: uid_('u'), perfil: o.perfil, nome: nome, login: login, email: email, status: o.status || 'ativo',
    nascimento: o.nascimento || '', responsavelNome: resp, responsavelEmail: respEmail,
    consentimento: !!o.consentimento, trocarSenha: !!o.trocarSenha, criadoEm: agora_(), ultimoAcesso: null };
  defineSenha_(u, o.senha);
  return ins_('Usuarios', u);
}

rota_('recuperar', null, false, () => ({ msg: 'Para criar uma nova senha, fale com seu professor (alunos) ou com o administrador da escola: eles geram uma senha provisória na hora, e você cria a sua no primeiro acesso.' }));

rota_('redefinir', null, true, (_, d) => {
  const login = normLogin_(d.login);
  const u = all_('Usuarios').find(x => x.login === login || (x.email && x.email === login));
  const c = CacheService.getScriptCache();
  const k = 'rf_' + login; const f = Number(c.get(k) || 0);
  if (f >= 5) erro_('Muitas tentativas. Peça um novo código daqui a 15 minutos.');
  if (!u || !d.codigo || c.get('r_' + u.id) !== String(d.codigo).trim()) { c.put(k, String(f + 1), 900); erro_('Código inválido ou expirado.'); }
  validaSenha_(d.senha); defineSenha_(u, d.senha); u.trocarSenha = false; upd_('Usuarios', u);
  c.remove('r_' + u.id); c.remove('f_' + u.login); log_(u, 'senha_redefinida', '');
  return { ok: true };
});

/* =================== CONTA (todos) =================== */
rota_('eu', TODOS, false, u => ({ usuario: pubU_(u), cfg: { escalaNota: cfg_().escalaNota, fotoMaxMB: cfg_().fotoMaxMB, fotosPorQuestao: cfg_().fotosPorQuestao } }));
rota_('sair', TODOS, false, (u, d, tk) => { CacheService.getScriptCache().remove('s_' + tk); return true; });
rota_('trocarSenha', TODOS, true, (u, d) => {
  if (!confere_(u, d.atual)) erro_('A senha atual está incorreta.');
  validaSenha_(d.nova); if (d.nova === d.atual) erro_('A nova senha deve ser diferente da atual.');
  defineSenha_(u, d.nova); u.trocarSenha = false; upd_('Usuarios', u); log_(u, 'troca_senha', '');
  return { usuario: pubU_(u) };
});
rota_('perfilSalvar', TODOS, true, (u, d) => {
  const nome = txt_(d.nome, 100); if (nome.length < 3) erro_('Informe o nome completo.');
  const email = normLogin_(d.email); validaEmail_(email);
  if (email && all_('Usuarios').some(x => x.id !== u.id && (x.email === email || x.login === email))) erro_('Este e-mail já está em uso.');
  u.nome = nome; u.email = email; upd_('Usuarios', u); return { usuario: pubU_(u) };
});
rota_('excluirConta', ALU, true, (u, d) => {
  if (!confere_(u, d.senha)) erro_('Senha incorreta.');
  apagarAluno_(u); log_(null, 'conta_excluida_pelo_aluno', u.login); return true;
});
function apagarAluno_(u) {
  const ents = all_('Entregas').filter(e => e.alunoId === u.id);
  ents.forEach(e => apagarFotos_(e.fotos));
  del_('Entregas', ents);
  del_('Matriculas', all_('Matriculas').filter(m => m.alunoId === u.id));
  all_('Atividades').forEach(a => { if (a.alunos && a.alunos.indexOf(u.id) >= 0) { a.alunos = a.alunos.filter(x => x !== u.id); upd_('Atividades', a); } });
  del_('Usuarios', get_('Usuarios', u.id));
}
function apagarFotos_(fotos) {
  if (!fotos) return;
  Object.keys(fotos).forEach(q => (fotos[q] || []).forEach(id => apagaArquivo_(id)));
}
function apagaArquivo_(id) {
  const a = get_('Arquivos', id); if (!a) return;
  _rm.push((a.tipo === 'foto' ? 'fotos/' : 'questoes/') + id); del_('Arquivos', a);
}

/* =================== REGRAS DE NEGÓCIO =================== */
function turmasAluno_(alunoId) { return all_('Matriculas').filter(m => m.alunoId === alunoId && m.status === 'aprovado').map(m => m.turmaId); }
function alvo_(a, alunoId, minhas) {
  if (a.status !== 'publicada') return false;
  const ts = (a.turmas || []).filter(t => minhas.indexOf(t) >= 0);
  if (!ts.length) return false;
  if (a.alunos && a.alunos.length) return a.alunos.indexOf(alunoId) >= 0;
  return true;
}
function alunosAlvo_(a) {
  const ts = a.turmas || [];
  let ids = all_('Matriculas').filter(m => ts.indexOf(m.turmaId) >= 0 && m.status === 'aprovado').map(m => m.alunoId);
  ids = ids.filter((x, i) => ids.indexOf(x) === i);
  if (a.alunos && a.alunos.length) ids = ids.filter(x => a.alunos.indexOf(x) >= 0);
  return ids.filter(id => get_('Usuarios', id));
}
function notaMax_(a) { return (a.questoes || []).reduce((s, q) => s + (Number(q.pontos) || 0), 0); }
function entregaDe_(aId, alunoId) { return all_('Entregas').find(e => e.atividadeId === aId && e.alunoId === alunoId) || null; }
function situacao_(a, e, t) {
  if (a.abertura && a.abertura > t) return 'agendada';
  if (e && (e.status === 'enviada' || e.status === 'corrigida')) return (e.status === 'corrigida' && a.notasLiberadas) ? 'corrigida' : 'enviada';
  if (a.encerramento && a.encerramento < t) return 'atrasada';
  return 'pendente';
}
function podeEnviar_(a, t) { return !(a.abertura && a.abertura > t) && (!a.encerramento || a.encerramento >= t || a.aceitaAtraso); }
function autoCorrige_(a, e) {
  const qs = a.questoes || []; const c = e.correcao || { pontos: [], comentarios: [] };
  c.pontos = c.pontos || []; c.comentarios = c.comentarios || [];
  qs.forEach((q, i) => {
    const r = (e.respostas || [])[i];
    if (q.tipo === 'mc') c.pontos[i] = (r === q.correta) ? Number(q.pontos) || 0 : 0;
    else if (q.tipo === 'vf') c.pontos[i] = (r === q.correta) ? Number(q.pontos) || 0 : 0;
    else if (c.pontos[i] === undefined) c.pontos[i] = null;
  });
  e.correcao = c; e.notaMax = notaMax_(a);
  e.nota = c.pontos.reduce((s, p) => s + (Number(p) || 0), 0);
  return qs.some((q, i) => q.tipo === 'disc' && (c.pontos[i] === null || c.pontos[i] === undefined));
}
function podeProf_(u, profId) { return u.perfil === 'admin' || u.id === profId; }
function minhaTurma_(u, id) { const t = get_('Turmas', id); if (!t || !podeProf_(u, t.professorId)) erro_('Turma não encontrada.'); return t; }
function minhaAtiv_(u, id) { const a = get_('Atividades', id); if (!a || !podeProf_(u, a.professorId)) erro_('Atividade não encontrada.'); return a; }
function codigoTurma_() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const usados = all_('Turmas').map(t => t.codigo); let s;
  do { s = ''; for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)]; } while (usados.indexOf(s) >= 0);
  return s;
}
function resumoAtiv_(a) {
  return { id: a.id, titulo: a.titulo, tipo: a.tipo, disciplina: a.disciplina, abertura: a.abertura, encerramento: a.encerramento,
    status: a.status, notasLiberadas: !!a.notasLiberadas, qtd: (a.questoes || []).length, notaMax: notaMax_(a),
    turmas: (a.turmas || []).map(id => { const t = get_('Turmas', id); return t ? { id: t.id, nome: t.nome } : null; }).filter(Boolean),
    individual: !!(a.alunos && a.alunos.length), professorId: a.professorId, atualizadoEm: a.atualizadoEm, criadoEm: a.criadoEm };
}
function semGabarito_(a) {
  const c = JSON.parse(JSON.stringify(limpa_(a)));
  c.questoes = (c.questoes || []).map(q => { const x = Object.assign({}, q); delete x.correta; delete x.explicacao; return x; });
  delete c.alunos; return c;
}

/* =================== ALUNO =================== */
rota_('alunoDados', ALU, false, u => {
  const t = agora_(); const mat = all_('Matriculas').filter(m => m.alunoId === u.id);
  const minhas = mat.filter(m => m.status === 'aprovado').map(m => m.turmaId);
  const turmas = mat.map(m => { const tt = get_('Turmas', m.turmaId); if (!tt) return null;
    return { id: tt.id, nome: tt.nome, disciplina: tt.disciplina, serie: tt.serie, professor: nomeU_(tt.professorId), status: m.status, matriculaId: m.id }; }).filter(Boolean);
  const ativs = all_('Atividades').filter(a => alvo_(a, u.id, minhas)).map(a => {
    const e = entregaDe_(a.id, u.id); const r = resumoAtiv_(a);
    r.turmas = r.turmas.filter(x => minhas.indexOf(x.id) >= 0);
    r.situacao = situacao_(a, e, t); r.podeEnviar = podeEnviar_(a, t);
    r.rascunho = !!(e && e.status === 'rascunho');
    r.enviadoEm = e ? e.enviadoEm : null; r.atrasada = !!(e && e.atrasada);
    if (e && e.status === 'corrigida' && a.notasLiberadas) { r.nota = e.nota; r.comentario = e.comentario || ''; }
    delete r.professorId; return r;
  });
  return { turmas: turmas, atividades: ativs, agora: t };
});
rota_('entrarTurma', ALU, true, (u, d) => {
  const cod = String(d.codigo || '').trim().toUpperCase().replace(/\s/g, '');
  const t = all_('Turmas').find(x => x.codigo === cod && !x.arquivada);
  if (!t) erro_('Código não encontrado. Confira com o professor.');
  const m = all_('Matriculas').find(x => x.turmaId === t.id && x.alunoId === u.id);
  if (m && m.status === 'aprovado') erro_('Você já participa desta turma.');
  if (m && m.status === 'pendente') erro_('Seu pedido já foi enviado. Aguarde a aprovação do professor.');
  if (m) { m.status = 'pendente'; m.criadoEm = agora_(); m.decididoEm = null; upd_('Matriculas', m); }
  else ins_('Matriculas', { id: uid_('m'), turmaId: t.id, alunoId: u.id, status: 'pendente', criadoEm: agora_(), decididoEm: null });
  return { turma: t.nome };
});
rota_('sairTurma', ALU, true, (u, d) => {
  const m = all_('Matriculas').find(x => x.id === d.id && x.alunoId === u.id);
  if (!m) erro_('Matrícula não encontrada.');
  del_('Matriculas', m); return true;
});
function ativAluno_(u, id) {
  const a = get_('Atividades', id);
  if (!a || !alvo_(a, u.id, turmasAluno_(u.id))) erro_('Atividade não encontrada ou não disponível para você.');
  if (a.abertura && a.abertura > agora_()) erro_('Esta atividade ainda não foi aberta.');
  return a;
}
function entregaVisAluno_(a, e) {
  if (!e) return null;
  const c = limpa_(e); const lib = a.notasLiberadas && e.status === 'corrigida';
  if (!lib) { delete c.nota; delete c.correcao; delete c.comentario; delete c.historico; }
  return c;
}
rota_('abrirAtividade', ALU, false, (u, d) => {
  const a = ativAluno_(u, d.id); const e = entregaDe_(a.id, u.id); const t = agora_();
  const lib = a.notasLiberadas && e && e.status === 'corrigida';
  return { atividade: lib ? limpa_(a) : semGabarito_(a), entrega: entregaVisAluno_(a, e), situacao: situacao_(a, e, t), podeEnviar: podeEnviar_(a, t), agora: t };
});
function rascunho_(u, a) {
  let e = entregaDe_(a.id, u.id);
  if (e && (e.status === 'enviada' || e.status === 'corrigida')) erro_('Esta atividade já foi enviada.');
  if (!podeEnviar_(a, agora_())) erro_('O prazo desta atividade terminou.');
  if (!e) e = ins_('Entregas', { id: uid_('e'), atividadeId: a.id, alunoId: u.id, respostas: [], fotos: {}, status: 'rascunho', iniciadoEm: agora_(), atualizadoEm: agora_() });
  return e;
}
function limpaRespostas_(a, rs) {
  const qs = a.questoes || []; rs = Array.isArray(rs) ? rs : [];
  return qs.map((q, i) => {
    const r = rs[i];
    if (q.tipo === 'mc') return (typeof r === 'number' && r >= 0 && r < (q.opcoes || []).length) ? r : null;
    if (q.tipo === 'vf') return (r === true || r === false) ? r : null;
    return txt_(r, 20000);
  });
}
rota_('salvarRascunho', ALU, true, (u, d) => {
  const a = ativAluno_(u, d.id); const e = rascunho_(u, a);
  e.respostas = limpaRespostas_(a, d.respostas); e.atualizadoEm = agora_(); upd_('Entregas', e);
  return { atualizadoEm: e.atualizadoEm };
});
function salvaImagem_(dataUrl, pastaTipo, meta) {
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) erro_('Formato de imagem não permitido. Use JPG, PNG ou WEBP.');
  const tam = Math.floor(m[3].length * 3 / 4); const max = (Number(cfg_().fotoMaxMB) || 3) * 1024 * 1024;
  if (tam > max) erro_('Imagem muito grande (máximo ' + cfg_().fotoMaxMB + ' MB).');
  const id = uid_('img') + '.' + (m[2] === 'jpeg' ? 'jpg' : m[2]);
  _upl.push({ caminho: (pastaTipo === 'FOTOS' ? 'fotos/' : 'questoes/') + id, mime: m[1], b64: m[3] });
  ins_('Arquivos', Object.assign({ id: id, mime: m[1], tamanho: tam, criadoEm: agora_() }, meta));
  return id;
}
rota_('enviarFoto', ALU, true, (u, d) => {
  const a = ativAluno_(u, d.id); const q = Number(d.q); const qq = (a.questoes || [])[q];
  if (!qq || !qq.permiteFoto) erro_('Esta questão não aceita fotos.');
  const e = rascunho_(u, a); e.fotos = e.fotos || {}; const lista = e.fotos[q] || [];
  const lim = Number(cfg_().fotosPorQuestao) || 5;
  if (lista.length >= lim) erro_('Limite de ' + lim + ' fotos por questão.');
  const id = salvaImagem_(d.dataUrl, 'FOTOS', { tipo: 'foto', alunoId: u.id, atividadeId: a.id, entregaId: e.id });
  lista.push(id); e.fotos[q] = lista; e.atualizadoEm = agora_(); upd_('Entregas', e);
  return { fotos: e.fotos };
});
rota_('removerFoto', ALU, true, (u, d) => {
  const a = ativAluno_(u, d.id); const e = rascunho_(u, a); const q = Number(d.q);
  const lista = (e.fotos || {})[q] || []; const i = lista.indexOf(d.fileId);
  if (i < 0) erro_('Foto não encontrada.');
  lista.splice(i, 1); e.fotos[q] = lista; upd_('Entregas', e);
  apagaArquivo_(d.fileId);
  return { fotos: e.fotos };
});
rota_('enviarAtividade', ALU, true, (u, d) => {
  const a = ativAluno_(u, d.id); const e = rascunho_(u, a); const t = agora_();
  e.respostas = limpaRespostas_(a, d.respostas);
  const pend = autoCorrige_(a, e);
  e.status = pend ? 'enviada' : 'corrigida'; e.enviadoEm = t; e.atualizadoEm = t;
  e.atrasada = !!(a.encerramento && a.encerramento < t);
  if (!pend) e.corrigidoEm = t;
  upd_('Entregas', e); log_(u, 'entrega', a.id);
  return { enviadoEm: t, protocolo: e.id.toUpperCase(), atrasada: e.atrasada };
});
rota_('pedirRevisao', ALU, true, (u, d) => {
  const a = ativAluno_(u, d.id); const e = entregaDe_(a.id, u.id);
  if (!e || e.status !== 'corrigida' || !a.notasLiberadas) erro_('A revisão só pode ser pedida depois que a nota for liberada.');
  const msg = txt_(d.msg, 1000); if (msg.length < 5) erro_('Explique o motivo do pedido de revisão.');
  e.revisaoPedida = true; e.revisaoMsg = msg; upd_('Entregas', e); return true;
});

/* ---- imagens (fotos e imagens de questões), sempre com verificação de permissão ---- */
rota_('imagem', TODOS, false, (u, d) => {
  const meta = get_('Arquivos', String(d.id || '')); if (!meta) erro_('Imagem não encontrada.');
  let ok = u.perfil === 'admin';
  if (!ok && meta.tipo === 'foto') {
    if (u.perfil === 'aluno') ok = meta.alunoId === u.id;
    else { const a = get_('Atividades', meta.atividadeId); ok = !!a && a.professorId === u.id; }
  }
  if (!ok && meta.tipo === 'questao') {
    if (u.perfil === 'professor') ok = meta.professorId === u.id || all_('Atividades').some(a => a.professorId === u.id && (a.questoes || []).some(q => q.imagem === d.id));
    else { const minhas = turmasAluno_(u.id); ok = all_('Atividades').some(a => alvo_(a, u.id, minhas) && (a.questoes || []).some(q => q.imagem === d.id)); }
  }
  if (!ok) erro_('Você não tem permissão para ver esta imagem.');
  return { __assinar: (meta.tipo === 'foto' ? 'fotos/' : 'questoes/') + meta.id };
});

/* =================== PROFESSOR =================== */
rota_('profPainel', PROF, false, u => {
  const adm = u.perfil === 'admin';
  const turmas = all_('Turmas').filter(t => adm || t.professorId === u.id);
  const tids = turmas.map(t => t.id);
  const ativs = all_('Atividades').filter(a => adm || a.professorId === u.id);
  const aids = ativs.map(a => a.id);
  const ents = all_('Entregas').filter(e => aids.indexOf(e.atividadeId) >= 0);
  return {
    turmas: turmas.filter(t => !t.arquivada).length,
    alunos: all_('Matriculas').filter(m => tids.indexOf(m.turmaId) >= 0 && m.status === 'aprovado').map(m => m.alunoId).filter((x, i, s) => s.indexOf(x) === i).length,
    atividades: ativs.filter(a => a.status === 'publicada').length,
    rascunhos: ativs.filter(a => a.status !== 'publicada').length,
    pedidos: all_('Matriculas').filter(m => tids.indexOf(m.turmaId) >= 0 && m.status === 'pendente').length,
    corrigir: ents.filter(e => e.status === 'enviada').length,
    revisoes: ents.filter(e => e.revisaoPedida).length,
    recentes: ents.filter(e => e.status !== 'rascunho').sort((a, b) => (b.enviadoEm || 0) - (a.enviadoEm || 0)).slice(0, 8).map(e => {
      const a = get_('Atividades', e.atividadeId); return { id: e.id, aluno: nomeU_(e.alunoId), atividade: a ? a.titulo : '', status: e.status, enviadoEm: e.enviadoEm, nota: e.nota, notaMax: e.notaMax };
    })
  };
});
rota_('turmas', PROF, false, u => {
  const adm = u.perfil === 'admin';
  return all_('Turmas').filter(t => adm || t.professorId === u.id).map(t => {
    const ms = all_('Matriculas').filter(m => m.turmaId === t.id);
    return Object.assign(limpa_(t), { professor: nomeU_(t.professorId), alunos: ms.filter(m => m.status === 'aprovado').length,
      pendentes: ms.filter(m => m.status === 'pendente').length,
      atividades: all_('Atividades').filter(a => (a.turmas || []).indexOf(t.id) >= 0).length });
  }).sort((a, b) => (a.arquivada - b.arquivada) || a.nome.localeCompare(b.nome));
});
rota_('turmaSalvar', PROF, true, (u, d) => {
  const nome = txt_(d.nome, 80); if (nome.length < 2) erro_('Dê um nome para a turma.');
  let t;
  if (d.id) { t = minhaTurma_(u, d.id); }
  else t = { id: uid_('t'), professorId: u.id, codigo: codigoTurma_(), arquivada: false, criadoEm: agora_() };
  t.nome = nome; t.disciplina = txt_(d.disciplina, 60); t.serie = txt_(d.serie, 60); t.descricao = txt_(d.descricao, 500);
  if (d.id) upd_('Turmas', t); else ins_('Turmas', t);
  return limpa_(t);
});
rota_('turmaDetalhe', PROF, false, (u, d) => {
  const t = minhaTurma_(u, d.id);
  const ms = all_('Matriculas').filter(m => m.turmaId === t.id);
  const al = m => { const x = get_('Usuarios', m.alunoId); return x ? { matriculaId: m.id, id: x.id, nome: x.nome, login: x.login, desde: m.decididoEm || m.criadoEm, pedidoEm: m.criadoEm } : null; };
  return { turma: Object.assign(limpa_(t), { professor: nomeU_(t.professorId) }),
    alunos: ms.filter(m => m.status === 'aprovado').map(al).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome)),
    pendentes: ms.filter(m => m.status === 'pendente').map(al).filter(Boolean),
    recusados: ms.filter(m => m.status === 'recusado').length,
    atividades: all_('Atividades').filter(a => (a.turmas || []).indexOf(t.id) >= 0).map(resumoAtiv_) };
});
rota_('turmaArquivar', PROF, true, (u, d) => { const t = minhaTurma_(u, d.id); t.arquivada = !!d.arquivada; upd_('Turmas', t); return true; });
rota_('turmaNovoCodigo', PROF, true, (u, d) => { const t = minhaTurma_(u, d.id); t.codigo = codigoTurma_(); upd_('Turmas', t); return t.codigo; });
rota_('turmaExcluir', PROF, true, (u, d) => {
  const t = minhaTurma_(u, d.id);
  del_('Matriculas', all_('Matriculas').filter(m => m.turmaId === t.id));
  all_('Atividades').forEach(a => { if ((a.turmas || []).indexOf(t.id) >= 0) { a.turmas = a.turmas.filter(x => x !== t.id); if (!a.turmas.length) a.status = 'rascunho'; upd_('Atividades', a); } });
  del_('Turmas', get_('Turmas', t.id)); log_(u, 'turma_excluida', t.nome); return true;
});
rota_('matriculaDecidir', PROF, true, (u, d) => {
  const m = all_('Matriculas').find(x => x.id === d.id); if (!m) erro_('Pedido não encontrado.');
  minhaTurma_(u, m.turmaId); m.status = d.aprovar ? 'aprovado' : 'recusado'; m.decididoEm = agora_(); upd_('Matriculas', m); return true;
});
rota_('matriculaRemover', PROF, true, (u, d) => {
  const m = all_('Matriculas').find(x => x.id === d.id); if (!m) erro_('Aluno não encontrado na turma.');
  minhaTurma_(u, m.turmaId); del_('Matriculas', m); return true;
});
rota_('alunoCriar', PROF, true, (u, d) => {
  const t = minhaTurma_(u, d.turmaId);
  if (!d.autorizacao) erro_('Confirme que a escola/responsável autorizou o cadastro.');
  const senha = d.senha ? String(d.senha) : senhaTemp_();
  const a = criarUsuario_({ perfil: 'aluno', nome: d.nome, login: d.login, email: d.email, senha: senha, nascimento: d.nascimento,
    consentimento: true, trocarSenha: true, semResponsavel: true });
  ins_('Matriculas', { id: uid_('m'), turmaId: t.id, alunoId: a.id, status: 'aprovado', criadoEm: agora_(), decididoEm: agora_() });
  log_(u, 'aluno_criado', a.login);
  return { login: a.login, senha: senha };
});
rota_('alunoSenha', PROF, true, (u, d) => {
  const a = get_('Usuarios', d.alunoId); if (!a || a.perfil !== 'aluno') erro_('Aluno não encontrado.');
  if (u.perfil !== 'admin') {
    const minhas = all_('Turmas').filter(t => t.professorId === u.id).map(t => t.id);
    if (!all_('Matriculas').some(m => m.alunoId === a.id && minhas.indexOf(m.turmaId) >= 0 && m.status === 'aprovado')) erro_('Este aluno não está em nenhuma turma sua.');
  }
  const s = senhaTemp_(); defineSenha_(a, s); a.trocarSenha = true; upd_('Usuarios', a); log_(u, 'senha_resetada', a.login);
  return { login: a.login, senha: s };
});

/* ---- atividades ---- */
rota_('atividades', PROF, false, u => {
  const adm = u.perfil === 'admin';
  return all_('Atividades').filter(a => adm || a.professorId === u.id).map(a => {
    const r = resumoAtiv_(a); const alvo = alunosAlvo_(a); const ents = all_('Entregas').filter(e => e.atividadeId === a.id && e.status !== 'rascunho');
    r.totalAlunos = alvo.length; r.entregues = ents.length; r.aCorrigir = ents.filter(e => e.status === 'enviada').length;
    r.revisoes = ents.filter(e => e.revisaoPedida).length; r.professor = nomeU_(a.professorId);
    return r;
  }).sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
});
rota_('atividadeObter', PROF, false, (u, d) => {
  const a = minhaAtiv_(u, d.id); const ts = all_('Turmas').filter(t => u.perfil === 'admin' ? t.professorId === a.professorId : t.professorId === u.id);
  return { atividade: limpa_(a), turmas: ts.map(t => ({ id: t.id, nome: t.nome })) };
});
rota_('opcoesAtividade', PROF, false, (u, d) => {
  const ts = all_('Turmas').filter(t => t.professorId === (d.professorId && u.perfil === 'admin' ? d.professorId : u.id) && !t.arquivada);
  return ts.map(t => ({ id: t.id, nome: t.nome, disciplina: t.disciplina,
    alunos: all_('Matriculas').filter(m => m.turmaId === t.id && m.status === 'aprovado').map(m => ({ id: m.alunoId, nome: nomeU_(m.alunoId) })).sort((a, b) => a.nome.localeCompare(b.nome)) }));
});
function limpaQuestoes_(qs) {
  if (!Array.isArray(qs) || !qs.length) erro_('Adicione pelo menos uma questão.');
  if (qs.length > 300) erro_('Máximo de 300 questões por atividade.');
  return qs.map((q, i) => {
    const n = i + 1; const tipo = ['mc', 'vf', 'disc'].indexOf(q.tipo) >= 0 ? q.tipo : 'disc';
    const o = { tipo: tipo, enunciado: txt_(q.enunciado, 5000), textoApoio: txt_(q.textoApoio, 20000), imagem: txt_(q.imagem, 100),
      pontos: Math.max(0, Math.min(1000, Number(q.pontos) || 0)), permiteFoto: !!q.permiteFoto, explicacao: txt_(q.explicacao, 5000) };
    if (!o.enunciado) erro_('Questão ' + n + ': escreva o enunciado.');
    if (tipo === 'mc') {
      o.opcoes = (q.opcoes || []).map(x => txt_(x, 1000));
      if (o.opcoes.length < 2) erro_('Questão ' + n + ': coloque pelo menos 2 alternativas.');
      if (o.opcoes.some(x => !x)) erro_('Questão ' + n + ': preencha ou remova as alternativas vazias.');
      o.correta = (q.correta === null || q.correta === undefined || q.correta === '') ? -1 : Number(q.correta);
      if (!(Number.isInteger(o.correta) && o.correta >= 0 && o.correta < o.opcoes.length)) erro_('Questão ' + n + ': marque a alternativa correta.');
    }
    if (tipo === 'vf') { if (q.correta !== true && q.correta !== false) erro_('Questão ' + n + ': marque se a afirmação é Verdadeira ou Falsa.'); o.correta = q.correta; }
    return o;
  });
}
rota_('atividadeSalvar', PROF, true, (u, d) => {
  const x = d.atividade || {};
  let a;
  if (x.id) a = minhaAtiv_(u, x.id);
  else a = { id: uid_('a'), professorId: u.id, criadoEm: agora_(), notasLiberadas: false };
  const titulo = txt_(x.titulo, 150); if (titulo.length < 2) erro_('Dê um título para a atividade.');
  const publicar = x.status === 'publicada';
  const minhasT = all_('Turmas').filter(t => t.professorId === a.professorId).map(t => t.id);
  const turmas = (x.turmas || []).filter(id => minhasT.indexOf(id) >= 0);
  if (publicar && !turmas.length) erro_('Escolha pelo menos uma turma para publicar.');
  const abertura = x.abertura ? Number(x.abertura) : null, encerramento = x.encerramento ? Number(x.encerramento) : null;
  if (abertura && encerramento && encerramento <= abertura) erro_('O encerramento precisa ser depois da abertura.');
  const qs = limpaQuestoes_(x.questoes);
  const temEntrega = all_('Entregas').some(e => e.atividadeId === a.id && e.status !== 'rascunho');
  if (temEntrega && a.questoes && a.questoes.length !== qs.length) erro_('Esta atividade já tem entregas: não é possível adicionar ou remover questões (você pode editar textos, prazos e pontuação, ou duplicar a atividade).');
  Object.assign(a, { titulo: titulo, tipo: TIPOS_ATIV.indexOf(x.tipo) >= 0 ? x.tipo : 'atividade', disciplina: txt_(x.disciplina, 60),
    instrucoes: txt_(x.instrucoes, 20000), turmas: turmas, alunos: (x.alunos || []).map(String), abertura: abertura, encerramento: encerramento,
    aceitaAtraso: !!x.aceitaAtraso, questoes: qs, status: publicar ? 'publicada' : 'rascunho', atualizadoEm: agora_() });
  if (x.id) upd_('Atividades', a); else ins_('Atividades', a);
  if (temEntrega) all_('Entregas').filter(e => e.atividadeId === a.id && e.status !== 'rascunho').forEach(e => {
    const pend = autoCorrige_(a, e); if (e.status === 'corrigida' && pend) e.status = 'enviada'; upd_('Entregas', e); });
  log_(u, 'atividade_salva', a.titulo);
  return { id: a.id };
});
rota_('atividadeDuplicar', PROF, true, (u, d) => {
  const a = minhaAtiv_(u, d.id);
  const n = JSON.parse(JSON.stringify(limpa_(a)));
  Object.assign(n, { id: uid_('a'), titulo: (a.titulo + ' (cópia)').slice(0, 150), status: 'rascunho', notasLiberadas: false, criadoEm: agora_(), atualizadoEm: agora_() });
  ins_('Atividades', n); return { id: n.id };
});
rota_('atividadeExcluir', PROF, true, (u, d) => {
  const a = minhaAtiv_(u, d.id); const ents = all_('Entregas').filter(e => e.atividadeId === a.id);
  ents.forEach(e => apagarFotos_(e.fotos)); del_('Entregas', ents);
  del_('Atividades', get_('Atividades', a.id)); log_(u, 'atividade_excluida', a.titulo); return true;
});
rota_('notasLiberar', PROF, true, (u, d) => { const a = minhaAtiv_(u, d.id); a.notasLiberadas = !!d.liberar; upd_('Atividades', a); return true; });
rota_('uploadImagem', PROF, true, (u, d) => ({ id: salvaImagem_(d.dataUrl, 'IMAGENS', { tipo: 'questao', professorId: u.id }) }));

rota_('atividadeEntregas', PROF, false, (u, d) => {
  const a = minhaAtiv_(u, d.id); const t = agora_();
  const linhas = alunosAlvo_(a).map(id => {
    const e = entregaDe_(a.id, id); const al = get_('Usuarios', id);
    return { alunoId: id, nome: al.nome, login: al.login, entregaId: e ? e.id : null,
      status: e ? e.status : 'nao_iniciada', enviadoEm: e ? e.enviadoEm : null, atrasada: !!(e && e.atrasada),
      nota: e && e.status !== 'rascunho' ? e.nota : null, revisao: !!(e && e.revisaoPedida) };
  });
  // entregas de alunos que saíram da turma continuam visíveis
  all_('Entregas').filter(e => e.atividadeId === a.id && e.status !== 'rascunho' && !linhas.some(l => l.alunoId === e.alunoId)).forEach(e => {
    const al = get_('Usuarios', e.alunoId); if (!al) return;
    linhas.push({ alunoId: al.id, nome: al.nome + ' (fora da turma)', login: al.login, entregaId: e.id, status: e.status, enviadoEm: e.enviadoEm, atrasada: !!e.atrasada, nota: e.nota, revisao: !!e.revisaoPedida });
  });
  linhas.sort((x, y) => x.nome.localeCompare(y.nome));
  return { atividade: resumoAtiv_(a), linhas: linhas, encerrada: !!(a.encerramento && a.encerramento < t) };
});
rota_('entregaObter', PROF, false, (u, d) => {
  const e = get_('Entregas', d.id); if (!e) erro_('Entrega não encontrada.');
  const a = minhaAtiv_(u, e.atividadeId); const al = get_('Usuarios', e.alunoId);
  const irmas = all_('Entregas').filter(x => x.atividadeId === a.id && x.status !== 'rascunho').map(x => ({ id: x.id, nome: nomeU_(x.alunoId) })).sort((x, y) => x.nome.localeCompare(y.nome));
  return { entrega: limpa_(e), atividade: limpa_(a), aluno: pubU_(al), irmas: irmas };
});
rota_('entregaCorrigir', PROF, true, (u, d) => {
  const e = get_('Entregas', d.id); if (!e) erro_('Entrega não encontrada.');
  const a = minhaAtiv_(u, e.atividadeId);
  if (e.status === 'rascunho') erro_('O aluno ainda não enviou esta atividade.');
  const qs = a.questoes || []; const pts = d.pontos || []; const coms = d.comentarios || [];
  const c = { pontos: [], comentarios: [] };
  qs.forEach((q, i) => {
    const p = pts[i];
    if (p === null || p === '' || p === undefined || isNaN(Number(p))) erro_('Questão ' + (i + 1) + ': informe a pontuação.');
    const v = Number(p); if (v < 0 || v > Number(q.pontos)) erro_('Questão ' + (i + 1) + ': a pontuação deve ficar entre 0 e ' + q.pontos + '.');
    c.pontos[i] = Math.round(v * 100) / 100; c.comentarios[i] = txt_(coms[i], 2000);
  });
  const anterior = e.status === 'corrigida' ? e.nota : null;
  e.correcao = c; e.nota = c.pontos.reduce((s, p) => s + p, 0); e.notaMax = notaMax_(a);
  e.comentario = txt_(d.comentario, 3000); e.status = 'corrigida'; e.corrigidoEm = agora_(); e.revisaoPedida = false;
  e.historico = (e.historico || []).concat([{ em: agora_(), nota: e.nota, anterior: anterior, por: u.nome }]);
  upd_('Entregas', e);
  if (d.liberar && !a.notasLiberadas) { a.notasLiberadas = true; upd_('Atividades', a); }
  log_(u, 'correcao', a.titulo + ' / ' + nomeU_(e.alunoId));
  return { nota: e.nota };
});
rota_('correcoesPendentes', PROF, false, u => {
  const adm = u.perfil === 'admin';
  const ativs = all_('Atividades').filter(a => adm || a.professorId === u.id);
  const out = [];
  ativs.forEach(a => all_('Entregas').filter(e => e.atividadeId === a.id && (e.status === 'enviada' || e.revisaoPedida)).forEach(e => {
    out.push({ id: e.id, atividade: a.titulo, atividadeId: a.id, aluno: nomeU_(e.alunoId), enviadoEm: e.enviadoEm, revisao: !!e.revisaoPedida, atrasada: !!e.atrasada });
  }));
  return out.sort((x, y) => (y.revisao - x.revisao) || ((x.enviadoEm || 0) - (y.enviadoEm || 0)));
});

/* ---- relatórios ---- */
function pct_(n, m) { return m ? Math.round(1000 * n / m) / 10 : null; }
rota_('relatorioTurma', PROF, false, (u, d) => {
  const t = minhaTurma_(u, d.id);
  const alunos = all_('Matriculas').filter(m => m.turmaId === t.id && m.status === 'aprovado').map(m => get_('Usuarios', m.alunoId)).filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome));
  const ativs = all_('Atividades').filter(a => a.status === 'publicada' && (a.turmas || []).indexOf(t.id) >= 0).sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
  const tt = agora_();
  const linhas = alunos.map(al => {
    let soma = 0, max = 0;
    const cel = ativs.map(a => {
      const alvo = !(a.alunos && a.alunos.length) || a.alunos.indexOf(al.id) >= 0;
      if (!alvo) return { s: 'na' };
      const e = entregaDe_(a.id, al.id);
      if (e && e.status === 'corrigida') { soma += e.nota; max += e.notaMax; return { s: 'corrigida', n: e.nota, m: e.notaMax }; }
      if (e && e.status === 'enviada') return { s: 'enviada' };
      return { s: (a.encerramento && a.encerramento < tt) ? 'atrasada' : 'pendente' };
    });
    return { id: al.id, nome: al.nome, cel: cel, pct: pct_(soma, max) };
  });
  const medias = ativs.map((a, j) => { let s = 0, m = 0, n = 0; linhas.forEach(l => { const c = l.cel[j]; if (c.s === 'corrigida') { s += c.n; m += c.m; n++; } }); return { pct: pct_(s, m), entregues: linhas.filter(l => ['corrigida', 'enviada'].indexOf(l.cel[j].s) >= 0).length }; });
  const porDisc = {};
  ativs.forEach((a, j) => { const k = a.disciplina || t.disciplina || 'Geral'; porDisc[k] = porDisc[k] || { s: 0, m: 0 }; linhas.forEach(l => { const c = l.cel[j]; if (c.s === 'corrigida') { porDisc[k].s += c.n; porDisc[k].m += c.m; } }); });
  return { turma: limpa_(t), atividades: ativs.map(a => ({ id: a.id, titulo: a.titulo, disciplina: a.disciplina, notaMax: notaMax_(a) })), linhas: linhas, medias: medias,
    disciplinas: Object.keys(porDisc).sort().map(k => ({ nome: k, pct: pct_(porDisc[k].s, porDisc[k].m) })) };
});
rota_('relatorioAluno', PROF, false, (u, d) => {
  const al = get_('Usuarios', d.id); if (!al || al.perfil !== 'aluno') erro_('Aluno não encontrado.');
  const adm = u.perfil === 'admin';
  const minhasT = all_('Turmas').filter(t => adm || t.professorId === u.id).map(t => t.id);
  if (!adm && !all_('Matriculas').some(m => m.alunoId === al.id && minhasT.indexOf(m.turmaId) >= 0)) erro_('Este aluno não está em suas turmas.');
  const t = agora_(); const tAl = turmasAluno_(al.id);
  const lista = all_('Atividades').filter(a => (adm || a.professorId === u.id) && alvo_(a, al.id, tAl)).map(a => {
    const e = entregaDe_(a.id, al.id);
    return { id: a.id, titulo: a.titulo, disciplina: a.disciplina, encerramento: a.encerramento, entregaId: e ? e.id : null,
      status: e ? e.status : (a.encerramento && a.encerramento < t ? 'atrasada' : 'pendente'), nota: e && e.status === 'corrigida' ? e.nota : null, notaMax: notaMax_(a), atrasada: !!(e && e.atrasada) };
  });
  return { aluno: pubU_(al), atividades: lista };
});

/* =================== ADMINISTRAÇÃO =================== */
rota_('adminPainel', ADM, false, () => {
  const us = all_('Usuarios'); const ents = all_('Entregas');
  return { alunos: us.filter(x => x.perfil === 'aluno').length, professores: us.filter(x => x.perfil === 'professor' && x.status === 'ativo').length,
    professoresPendentes: us.filter(x => x.perfil === 'professor' && x.status === 'pendente').map(pubU_),
    bloqueados: us.filter(x => x.status === 'bloqueado').length,
    turmas: all_('Turmas').filter(t => !t.arquivada).length, atividades: all_('Atividades').filter(a => a.status === 'publicada').length,
    entregas: ents.filter(e => e.status !== 'rascunho').length, corrigir: ents.filter(e => e.status === 'enviada').length,
    ultimoBackup: PROPS().getProperty('ULTIMO_BACKUP') || '' };
});
rota_('usuarios', ADM, false, (u, d) => {
  const b = normLogin_(d.busca); const p = d.perfil || '';
  return all_('Usuarios').filter(x => (!p || x.perfil === p) && (!b || x.nome.toLowerCase().indexOf(b) >= 0 || x.login.indexOf(b) >= 0 || (x.email || '').indexOf(b) >= 0))
    .map(x => Object.assign(pubU_(x), { responsavelNome: x.responsavelNome, responsavelEmail: x.responsavelEmail, menor: (idade_(x.nascimento) !== null && idade_(x.nascimento) < 18) }))
    .sort((a, b2) => a.nome.localeCompare(b2.nome));
});
rota_('usuarioCriar', ADM, true, (u, d) => {
  const perfil = ['admin', 'professor', 'aluno'].indexOf(d.perfil) >= 0 ? d.perfil : 'aluno';
  const senha = d.senha ? String(d.senha) : senhaTemp_();
  const n = criarUsuario_({ perfil: perfil, nome: d.nome, login: d.login, email: d.email, senha: senha, nascimento: d.nascimento, consentimento: true, trocarSenha: true, semResponsavel: true });
  log_(u, 'usuario_criado', n.login + ' (' + perfil + ')'); return { login: n.login, senha: senha };
});
rota_('usuarioSalvar', ADM, true, (u, d) => {
  const x = get_('Usuarios', d.id); if (!x) erro_('Usuário não encontrado.');
  if (x.id === u.id && (d.perfil !== 'admin' || d.status !== 'ativo')) erro_('Você não pode remover seu próprio acesso de administrador.');
  const nome = txt_(d.nome, 100); if (nome.length < 3) erro_('Informe o nome completo.');
  const email = normLogin_(d.email); validaEmail_(email);
  if (email && all_('Usuarios').some(y => y.id !== x.id && (y.email === email || y.login === email))) erro_('Este e-mail já está em uso.');
  if (x.perfil === 'professor' && d.perfil === 'aluno' && all_('Turmas').some(t => t.professorId === x.id)) erro_('Este professor tem turmas. Transfira-as antes de mudar o perfil.');
  x.nome = nome; x.email = email;
  if (['admin', 'professor', 'aluno'].indexOf(d.perfil) >= 0) x.perfil = d.perfil;
  if (['ativo', 'bloqueado', 'pendente'].indexOf(d.status) >= 0) x.status = d.status;
  upd_('Usuarios', x); log_(u, 'usuario_editado', x.login + ' ' + x.perfil + ' ' + x.status); return pubU_(x);
});
rota_('usuarioSenha', ADM, true, (u, d) => {
  const x = get_('Usuarios', d.id); if (!x) erro_('Usuário não encontrado.');
  const s = senhaTemp_(); defineSenha_(x, s); x.trocarSenha = true; upd_('Usuarios', x); log_(u, 'senha_resetada', x.login);
  return { login: x.login, senha: s };
});
rota_('usuarioExcluir', ADM, true, (u, d) => {
  const x = get_('Usuarios', d.id); if (!x) erro_('Usuário não encontrado.');
  if (x.id === u.id) erro_('Você não pode excluir a própria conta.');
  if (x.perfil !== 'aluno' && all_('Turmas').some(t => t.professorId === x.id)) erro_('Este professor possui turmas. Transfira ou exclua as turmas antes.');
  if (x.perfil !== 'aluno' && all_('Atividades').some(a => a.professorId === x.id)) erro_('Este professor possui atividades. Exclua-as antes.');
  if (x.perfil === 'aluno') apagarAluno_(x); else del_('Usuarios', x);
  log_(u, 'usuario_excluido', x.login); return true;
});
rota_('turmaTransferir', ADM, true, (u, d) => {
  const t = get_('Turmas', d.id); if (!t) erro_('Turma não encontrada.');
  const p = get_('Usuarios', d.professorId); if (!p || p.perfil === 'aluno') erro_('Professor inválido.');
  const antigo = t.professorId; t.professorId = p.id; upd_('Turmas', t);
  all_('Atividades').forEach(a => { if (a.professorId === antigo && (a.turmas || []).length && a.turmas.every(id => id === t.id)) { a.professorId = p.id; upd_('Atividades', a); } });
  return true;
});
rota_('professores', ADM, false, () => all_('Usuarios').filter(x => x.perfil !== 'aluno' && x.status === 'ativo').map(x => ({ id: x.id, nome: x.nome })));
rota_('configObter', ADM, false, () => cfg_());
rota_('configSalvar', ADM, true, (u, d) => {
  const c = d.config || {};
  setCfg_('nomePlataforma', txt_(c.nomePlataforma, 60) || 'Sala Digital');
  ['cadastroAlunos', 'cadastroProfessores', 'aprovarProfessores'].forEach(k => setCfg_(k, !!c[k]));
  setCfg_('fotoMaxMB', Math.max(1, Math.min(10, Number(c.fotoMaxMB) || 4)));
  setCfg_('fotosPorQuestao', Math.max(1, Math.min(20, Number(c.fotosPorQuestao) || 5)));
  setCfg_('escalaNota', [10, 100].indexOf(Number(c.escalaNota)) >= 0 ? Number(c.escalaNota) : 10);
  const em = normLogin_(c.emailContato); validaEmail_(em); setCfg_('emailContato', em);
  log_(u, 'config', ''); return cfg_();
});
rota_('relatorioGeral', ADM, false, () => {
  const us = all_('Usuarios'); const ents = all_('Entregas').filter(e => e.status !== 'rascunho');
  const turmas = all_('Turmas').map(t => {
    const al = all_('Matriculas').filter(m => m.turmaId === t.id && m.status === 'aprovado').map(m => m.alunoId);
    const at = all_('Atividades').filter(a => a.status === 'publicada' && (a.turmas || []).indexOf(t.id) >= 0);
    let s = 0, m = 0, entregues = 0, esperadas = 0;
    at.forEach(a => { const alvo = alunosAlvo_(a).filter(x => al.indexOf(x) >= 0); esperadas += alvo.length;
      alvo.forEach(x => { const e = entregaDe_(a.id, x); if (e && e.status !== 'rascunho') entregues++; if (e && e.status === 'corrigida') { s += e.nota; m += e.notaMax; } }); });
    return { id: t.id, nome: t.nome, professor: nomeU_(t.professorId), disciplina: t.disciplina, serie: t.serie, alunos: al.length, atividades: at.length, entregues: entregues, pendentes: esperadas - entregues, pct: pct_(s, m), arquivada: !!t.arquivada };
  });
  const disc = {};
  ents.filter(e => e.status === 'corrigida').forEach(e => { const a = get_('Atividades', e.atividadeId); if (!a) return; const k = a.disciplina || 'Geral'; disc[k] = disc[k] || { s: 0, m: 0, n: 0 }; disc[k].s += e.nota; disc[k].m += e.notaMax; disc[k].n++; });
  return {
    totais: { alunos: us.filter(x => x.perfil === 'aluno').length, alunosMenores: us.filter(x => x.perfil === 'aluno' && idade_(x.nascimento) !== null && idade_(x.nascimento) < 18).length,
      professores: us.filter(x => x.perfil === 'professor').length, turmas: all_('Turmas').length,
      publicadas: all_('Atividades').filter(a => a.status === 'publicada').length, rascunhos: all_('Atividades').filter(a => a.status !== 'publicada').length,
      respondidas: ents.length, corrigidas: ents.filter(e => e.status === 'corrigida').length, aguardando: ents.filter(e => e.status === 'enviada').length,
      pendentes: turmas.reduce((s, t) => s + t.pendentes, 0) },
    turmas: turmas, disciplinas: Object.keys(disc).sort().map(k => ({ nome: k, pct: pct_(disc[k].s, disc[k].m), correcoes: disc[k].n }))
  };
});
rota_('exportarPlanilha', ADM, false, u => {
  const r = ROTAS.relatorioGeral.fn(u, {});
  const csv = (cab, linhas) => '\ufeff' + [cab].concat(linhas).map(l => l.map(v => { v = v === null || v === undefined ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';')).join('\n');
  const dt = ms => ms ? new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Recife' }) : '';
  const notas = [];
  all_('Entregas').filter(e => e.status !== 'rascunho').forEach(e => { const a = get_('Atividades', e.atividadeId); const al = get_('Usuarios', e.alunoId); if (!a || !al) return;
    notas.push([al.nome, a.titulo, a.disciplina, e.status === 'corrigida' ? 'Corrigida' : 'Aguardando correção', dt(e.enviadoEm), e.status === 'corrigida' ? e.nota : '', e.notaMax, e.atrasada ? 'Sim' : 'Não']); });
  return { arquivos: [
    { nome: 'turmas.csv', csv: csv(['Turma', 'Professor', 'Disciplina', 'Série', 'Alunos', 'Atividades', 'Entregues', 'Pendentes', '% acertos'], r.turmas.map(t => [t.nome, t.professor, t.disciplina, t.serie, t.alunos, t.atividades, t.entregues, t.pendentes, t.pct === null ? '' : t.pct])) },
    { nome: 'disciplinas.csv', csv: csv(['Disciplina', '% acertos', 'Correções'], r.disciplinas.map(x => [x.nome, x.pct === null ? '' : x.pct, x.correcoes])) },
    { nome: 'alunos.csv', csv: csv(['Nome', 'Usuário', 'Situação', 'Cadastro', 'Turmas'], all_('Usuarios').filter(x => x.perfil === 'aluno').map(x => [x.nome, x.login, x.status, dt(x.criadoEm),
      all_('Matriculas').filter(m => m.alunoId === x.id && m.status === 'aprovado').map(m => { const t = get_('Turmas', m.turmaId); return t ? t.nome : ''; }).join(', ')])) },
    { nome: 'notas.csv', csv: csv(['Aluno', 'Atividade', 'Disciplina', 'Situação', 'Enviada em', 'Pontos', 'Máximo', 'Atrasada'], notas) } ] };
});
rota_('backupAgora', ADM, true, u => { _rpc.push('sd_backup'); log_(u, 'backup_manual', ''); return String(agora_()); });
rota_('logs', ADM, false, () => all_('Log').slice().sort((a, b) => b.data - a.data).slice(0, 200).map(l => ({ data: l.data, usuario: l.usuarioId ? nomeU_(l.usuarioId) : '—', acao: l.acao, detalhe: l.detalhe })));

function instalar() {
  const _senhas = {};
  const S_ = (k, padrao) => (_senhas[k] = _senhasAleatorias ? senhaForte_() : padrao);
  function senhaForte_() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; const h = (uuid() + uuid()).replace(/-/g, ''); let x = ''; for (let i = 0; i < 12; i++) x += c[parseInt(h.substr(i * 2, 2), 16) % c.length]; return x + '#' + (10 + parseInt(h.substr(26, 2), 16) % 90); }
  Object.keys(CFG_PADRAO).forEach(k => { if (!all_('Config').some(r => r.chave === k)) setCfg_(k, CFG_PADRAO[k]); });

  const msgs = [];
  if (!all_('Usuarios').some(u => u.perfil === 'admin')) {
    criarUsuario_({ perfil: 'admin', nome: 'Administrador', login: INICIAL.adminLogin, senha: S_('admin', INICIAL.adminSenha), consentimento: true, trocarSenha: true });
    msgs.push('ADMIN  -> usuário: ' + INICIAL.adminLogin + '  senha: ' + _senhas.admin + ' (trocar no 1º acesso)');
  }
  if (INICIAL.criarDemonstracao && !all_('Usuarios').some(u => u.login === 'professor')) {
    const prof = criarUsuario_({ perfil: 'professor', nome: 'Professor Demonstração', login: 'professor', senha: S_('professor', 'Prof@2026'), consentimento: true });
    const al = criarUsuario_({ perfil: 'aluno', nome: 'Aluno Demonstração', login: 'aluno', senha: S_('aluno', 'Aluno@2026'), consentimento: true, semResponsavel: true });
    const al2 = criarUsuario_({ perfil: 'aluno', nome: 'Maria Exemplo', login: 'maria', senha: S_('maria', 'Maria@2026'), consentimento: true, semResponsavel: true });
    const t = ins_('Turmas', { id: uid_('t'), professorId: prof.id, nome: '6º Ano A – Revisão II Trimestre', disciplina: 'Multidisciplinar', serie: '6º ano', codigo: codigoTurma_(), descricao: 'Turma de demonstração com as revisões para as avaliações do II trimestre.', arquivada: false, criadoEm: agora_() });
    ins_('Matriculas', { id: uid_('m'), turmaId: t.id, alunoId: al.id, status: 'aprovado', criadoEm: agora_(), decididoEm: agora_() });
    ins_('Matriculas', { id: uid_('m'), turmaId: t.id, alunoId: al2.id, status: 'pendente', criadoEm: agora_(), decididoEm: null });
    const ab = agora_(), en = agora_() + 14 * 864e5;
    SEED.forEach((x, i) => {
      ins_('Atividades', { id: uid_('a'), professorId: prof.id, titulo: x.title, tipo: x.tipo || 'exercicio', disciplina: x.subject, instrucoes: x.notes || '',
        turmas: [t.id], alunos: [], abertura: ab, encerramento: en, aceitaAtraso: true, status: 'publicada', notasLiberadas: true,
        criadoEm: ab + i, atualizadoEm: ab + i,
        questoes: x.questions.map(q => q.type === 'mc' ? { tipo: 'mc', enunciado: q.text, textoApoio: '', imagem: '', opcoes: q.options, correta: q.correct, pontos: 1, permiteFoto: false, explicacao: q.exp || '' }
          : q.type === 'vf' ? { tipo: 'vf', enunciado: q.text, textoApoio: '', imagem: '', correta: q.correct, pontos: 1, permiteFoto: false, explicacao: q.exp || '' }
          : { tipo: 'disc', enunciado: q.text, textoApoio: '', imagem: '', pontos: 2, permiteFoto: true, explicacao: q.exp || '' }) });
    });
    msgs.push('PROFESSOR -> usuário: professor  senha: ' + _senhas.professor + '');
    msgs.push('ALUNO     -> usuário: aluno      senha: ' + _senhas.aluno + '');
    msgs.push('Código da turma de demonstração: ' + t.codigo);
  }
  if (_senhasAleatorias) PROPS().setProperty('SENHAS_INICIAIS', JSON.stringify(_senhas));
  return msgs;
}

/* =================== CONTEÚDO DE DEMONSTRAÇÃO =================== */
const SEED = [{"title": "Mesopotâmia", "subject": "História", "notes": "Conteúdo da avaliação: Mesopotâmia (localização, rios Tigre e Eufrates, sumérios, escrita cuneiforme, zigurates, Código de Hamurábi).", "questions": [{"type": "mc", "text": "A Mesopotâmia ficava entre quais rios?", "options": ["Nilo e Jordão", "Tigre e Eufrates", "Amazonas e Paraná", "Ganges e Indo"], "correct": 1, "exp": "Mesopotâmia significa “terra entre rios”. Fica entre o Tigre e o Eufrates, onde hoje é principalmente o Iraque."}, {"type": "mc", "text": "Qual foi o tipo de escrita criado pelos sumérios?", "options": ["Hieróglifos", "Alfabeto latino", "Escrita cuneiforme", "Ideogramas chineses"], "correct": 2, "exp": "A escrita cuneiforme tinha forma de cunha e era feita em tábuas de argila molhada."}, {"type": "mc", "text": "O Código de Hamurábi era:", "options": ["Um conjunto de leis escritas do Império Babilônico, baseado na ideia de “olho por olho, dente por dente”", "Um livro religioso dos egípcios", "Um calendário criado pelos maias", "Um acordo de paz entre os gregos"], "correct": 0, "exp": "Foi um dos primeiros conjuntos de leis escritas da história, criado pelo rei Hamurábi, da Babilônia."}, {"type": "mc", "text": "Os zigurates eram:", "options": ["Barcos usados no comércio", "Templos em forma de pirâmide com degraus", "Moedas de ouro", "Muralhas de proteção"], "correct": 1, "exp": "Os zigurates eram templos altos, em degraus, dedicados aos deuses."}, {"type": "open", "text": "Por que os rios Tigre e Eufrates foram tão importantes para os povos da Mesopotâmia?", "exp": "Forneciam água; as cheias deixavam a terra fértil para a agricultura; permitiram construir canais de irrigação; serviam para transporte e comércio."}], "tipo": "exercicio"}, {"title": "Astecas, Maias e Incas", "subject": "História", "notes": "Conteúdo da avaliação: Astecas, Maias e Incas (onde viviam, cidades, agricultura, conhecimentos e cultura).", "questions": [{"type": "mc", "text": "Qual era a capital do Império Asteca?", "options": ["Cusco", "Tenochtitlán", "Machu Picchu", "Chichén Itzá"], "correct": 1, "exp": "Tenochtitlán foi construída sobre o lago Texcoco, onde hoje fica a Cidade do México."}, {"type": "mc", "text": "Os incas viviam principalmente em qual região da América do Sul?", "options": ["Cordilheira dos Andes", "Península de Yucatán", "Floresta Amazônica", "Ilhas do Caribe"], "correct": 0, "exp": "O Império Inca se estendia pelos Andes, com capital em Cusco (atual Peru)."}, {"type": "mc", "text": "Para plantar nas montanhas, os incas criaram:", "options": ["Chinampas (ilhas flutuantes)", "Terraços em degraus nas encostas", "Estufas de vidro", "Máquinas de irrigação"], "correct": 1, "exp": "Os terraços (socalcos) evitavam que a terra escorresse. Já as chinampas eram uma técnica dos astecas."}, {"type": "mc", "text": "Os maias se destacaram principalmente em:", "options": ["Fabricação de armas de ferro", "Astronomia, calendário e matemática (usavam o zero)", "Navegação pelo Oceano Atlântico", "Escrita cuneiforme"], "correct": 1, "exp": "Os maias observavam os astros, criaram calendários muito precisos e usavam o zero na matemática."}, {"type": "mc", "text": "O quipu, usado pelos incas, era:", "options": ["Um conjunto de cordões com nós usado para registrar números e informações", "Um templo em forma de pirâmide", "Uma arma de guerra", "Um tipo de moeda"], "correct": 0, "exp": "Com os nós dos quipus os incas registravam quantidades, como colheitas e impostos."}, {"type": "open", "text": "Cite uma semelhança entre astecas, maias e incas.", "exp": "Exemplos: praticavam agricultura (principalmente milho); eram politeístas; construíram grandes cidades e templos; tinham sociedade dividida em camadas; foram conquistados pelos espanhóis."}], "tipo": "exercicio"}, {"title": "Verb To Be – afirmativa, negativa e interrogativa", "subject": "Inglês", "notes": "Lembrete:\nI → am | He / She / It → is | You / We / They → are\nNegativa: coloque NOT depois do verbo (I am not / She is not = isn't / They are not = aren't).\nInterrogativa: o verbo vem antes do sujeito (Are you…? Is she…?).", "questions": [{"type": "mc", "text": "I ___ a student.", "options": ["is", "am", "are"], "correct": 1, "exp": "Com I usamos sempre AM."}, {"type": "mc", "text": "She ___ my sister.", "options": ["am", "are", "is"], "correct": 2, "exp": "Com he, she e it usamos IS."}, {"type": "mc", "text": "They ___ from Brazil.", "options": ["are", "is", "am"], "correct": 0, "exp": "Com you, we e they usamos ARE."}, {"type": "mc", "text": "Qual é a forma NEGATIVA de “He is a teacher”?", "options": ["He not is a teacher.", "He is not a teacher.", "He are not a teacher.", "Not he is a teacher."], "correct": 1, "exp": "Na negativa, o NOT vem depois do verbo to be: He is not (isn't) a teacher."}, {"type": "mc", "text": "Qual é a forma INTERROGATIVA de “You are 12 years old”?", "options": ["You are 12 years old?", "Are you 12 years old?", "Is you 12 years old?", "Am you 12 years old?"], "correct": 1, "exp": "Na pergunta, o verbo to be vai para antes do sujeito: Are you…?"}, {"type": "mc", "text": "“Is Ana your friend?” Qual é a resposta curta afirmativa correta?", "options": ["Yes, she is.", "Yes, she are.", "Yes, Ana am.", "Yes, she isn't."], "correct": 0, "exp": "Ana = she, e com she usamos is: Yes, she is."}, {"type": "open", "text": "Escreva duas frases em inglês sobre você usando o verbo to be: uma afirmativa e uma negativa.", "exp": "Exemplo: I am eleven years old. I am not tall."}], "tipo": "exercicio"}, {"title": "Possessive Adjectives, família e leitura de perfil", "subject": "Inglês", "notes": "Possessive adjectives: I → my | you → your | he → his | she → her | it → its | we → our | they → their\n\nLeia o perfil para as questões 5 a 7:\n“Hi! My name is Lucas. I am 11 years old and I am from Recife. My father is a doctor and my mother is a teacher. I have a sister. Her name is Bia and she is 8. Our dog is Thor. His favorite hobby is playing with a ball. My hobbies are playing soccer and drawing.”", "questions": [{"type": "mc", "text": "This is Pedro. ___ bike is blue.", "options": ["Her", "His", "Their", "My"], "correct": 1, "exp": "Pedro é ele (he), então usamos HIS."}, {"type": "mc", "text": "Maria and Ana are sisters. ___ house is big.", "options": ["Their", "Our", "His", "Her"], "correct": 0, "exp": "Maria e Ana = elas (they), então usamos THEIR."}, {"type": "mc", "text": "O que significa “brother”?", "options": ["Irmã", "Irmão", "Pai", "Avô"], "correct": 1, "exp": "Brother = irmão; sister = irmã; father = pai; grandfather = avô."}, {"type": "mc", "text": "O que significa “grandmother”?", "options": ["Tia", "Avó", "Mãe", "Prima"], "correct": 1, "exp": "Grandmother = avó; aunt = tia; mother = mãe; cousin = primo(a)."}, {"type": "mc", "text": "How old is Lucas?", "options": ["8 years old", "11 years old", "12 years old", "10 years old"], "correct": 1, "exp": "No texto: “I am 11 years old.”"}, {"type": "mc", "text": "What is Lucas's mother's job?", "options": ["Doctor", "Teacher", "Nurse", "Student"], "correct": 1, "exp": "No texto: “my mother is a teacher” (professora). O pai é doctor (médico)."}, {"type": "mc", "text": "Who is Thor?", "options": ["Lucas's brother", "Lucas's dog", "Lucas's father", "Lucas's friend"], "correct": 1, "exp": "No texto: “Our dog is Thor.”"}, {"type": "open", "text": "Escreva em inglês sobre uma pessoa da sua família: quem é, o nome e a idade. Use HIS ou HER.", "exp": "Exemplo: This is my mother. Her name is Carla. She is 38 years old."}], "tipo": "exercicio"}, {"title": "Jogo × Esporte, invasão, rede divisória, inclusão e valores", "subject": "Educação Física", "notes": "Conteúdos: 1) Jogo × Esporte; 2) Esportes de invasão (futebol e basquete); 3) Esportes com rede divisória (vôlei); 4) Inclusão no esporte; 5) Valores no esporte.\nEstude também pelo caderno, pesquisas e seminários.\n\nVídeos – Voleibol 🏐\nhttps://youtu.be/HHG11sJPchs?si=1xpVSlfpLb8tmjm4\nhttps://youtu.be/qV-IIOmGuR0?si=CCyESVwtK1da_ix8\nhttps://youtu.be/y3uM-WjwO6w?si=-w3EOyxyuzdhoRLo\n\nVídeos – Futebol ⚽\nhttps://youtu.be/J11nST5GXic?si=QYai2r_hYvgIWq7i\nhttps://youtu.be/Tgnv6fr1glU?si=-CWLUzYJh3x28PMP\nhttps://youtu.be/DF9Cn0uIWEE?si=3F8TUD6iMraHubB9", "questions": [{"type": "mc", "text": "Qual é a principal diferença entre jogo e esporte?", "options": ["No jogo as regras são flexíveis e combinadas pelos participantes; no esporte as regras são oficiais e organizadas por federações", "O jogo não tem nenhuma regra", "O esporte só pode ser praticado por profissionais", "Não existe diferença"], "correct": 0, "exp": "O jogo é mais livre (as regras podem mudar). O esporte tem regras fixas, competições oficiais e instituições que o organizam."}, {"type": "mc", "text": "Qual destes é um esporte de invasão?", "options": ["Voleibol", "Basquetebol", "Tênis", "Natação"], "correct": 1, "exp": "No basquete (e no futebol) o time invade o campo do adversário para marcar pontos."}, {"type": "mc", "text": "Nos esportes de invasão, o objetivo é:", "options": ["Passar a bola por cima da rede", "Invadir o espaço do adversário para marcar gol ou cesta, e ao mesmo tempo defender o próprio", "Chegar primeiro ao final da pista", "Acertar um alvo distante"], "correct": 1, "exp": "Ataque e defesa acontecem no mesmo espaço, com contato entre os jogadores."}, {"type": "mc", "text": "Quantos jogadores de cada time ficam em quadra no basquete?", "options": ["5", "6", "11", "7"], "correct": 0, "exp": "Basquete: 5 em quadra. Futebol de campo: 11. Vôlei: 6."}, {"type": "mc", "text": "Por que o voleibol é um esporte com rede divisória?", "options": ["Porque os times dividem o mesmo espaço e há contato", "Porque a rede separa as quadras e não há contato físico entre os adversários", "Porque se joga com os pés", "Porque não tem pontuação"], "correct": 1, "exp": "Cada time fica do seu lado da rede e tenta fazer a bola cair na quadra adversária."}, {"type": "mc", "text": "No vôlei, cada equipe pode tocar na bola no máximo quantas vezes antes de passá-la (sem contar o bloqueio)?", "options": ["2", "3", "4", "5"], "correct": 1, "exp": "São no máximo 3 toques por equipe, e o mesmo jogador não pode tocar duas vezes seguidas."}, {"type": "mc", "text": "Quais são fundamentos do voleibol?", "options": ["Saque, manchete, toque, cortada e bloqueio", "Drible, arremesso e bandeja", "Chute, cabeceio e escanteio", "Largada, virada e chegada"], "correct": 0, "exp": "Drible e arremesso são do basquete; chute e cabeceio são do futebol."}, {"type": "mc", "text": "O que significa inclusão no esporte?", "options": ["Deixar de fora quem tem dificuldade", "Adaptar regras, materiais e espaços para que todos possam participar", "Jogar só com os melhores", "Permitir só atletas profissionais"], "correct": 1, "exp": "Exemplos: vôlei sentado, basquete em cadeira de rodas, futebol de cegos com bola de guizo."}, {"type": "mc", "text": "Um jogador percebe que foi ele quem tocou a bola por último antes de ela sair, mas o árbitro não viu. Qual é a atitude ética?", "options": ["Ficar quieto para levar vantagem", "Avisar o árbitro, agindo com honestidade", "Reclamar com o árbitro", "Culpar o adversário"], "correct": 1, "exp": "Respeito, ética e honestidade são valores do esporte, mesmo quando ninguém está vendo."}, {"type": "open", "text": "Dê um exemplo de esporte adaptado ou de uma adaptação que permita incluir todos os colegas na aula.", "exp": "Exemplos: vôlei sentado; basquete em cadeira de rodas; futebol de 5 (para cegos, com bola de guizo); goalball; usar bola mais leve ou rede mais baixa."}], "tipo": "exercicio"}, {"title": "Máquinas simples e o corpo humano", "subject": "Ciências", "notes": "Máquinas simples: alavanca, roldana, plano inclinado, cunha, parafuso, roda e eixo. Elas facilitam o trabalho. No corpo humano, ossos, músculos e articulações funcionam como alavancas.", "questions": [{"type": "mc", "text": "Para que servem as máquinas simples?", "options": ["Para facilitar o trabalho, diminuindo a força necessária ou mudando a direção da força", "Para produzir energia elétrica", "Para funcionar sem nenhuma força", "Para deixar o trabalho mais difícil"], "correct": 0, "exp": "Elas não criam energia, mas facilitam: com menos força conseguimos mover algo pesado."}, {"type": "mc", "text": "A tesoura é um exemplo de:", "options": ["Alavanca", "Roldana", "Plano inclinado", "Parafuso"], "correct": 0, "exp": "A tesoura tem um ponto de apoio (o parafuso no meio) e funciona como duas alavancas."}, {"type": "mc", "text": "Uma rampa para cadeira de rodas é um exemplo de:", "options": ["Alavanca", "Roldana", "Plano inclinado", "Cunha"], "correct": 2, "exp": "O plano inclinado permite subir com menos força, percorrendo um caminho maior."}, {"type": "mc", "text": "Quais são as partes de uma alavanca?", "options": ["Ponto de apoio, força potente e força resistente", "Corda, roda e eixo", "Rosca, cabeça e ponta", "Lâmina e cabo"], "correct": 0, "exp": "Ponto de apoio (fulcro), força potente (a que aplicamos) e força resistente (o peso que queremos mover)."}, {"type": "mc", "text": "No corpo humano, ossos, músculos e articulações funcionam como:", "options": ["Roldanas", "Alavancas", "Planos inclinados", "Parafusos"], "correct": 1, "exp": "Ao dobrar o braço, o cotovelo é o ponto de apoio, o bíceps faz a força potente e o objeto na mão é a resistência."}, {"type": "mc", "text": "Os dentes incisivos, que cortam os alimentos, funcionam como qual máquina simples?", "options": ["Cunha", "Roldana", "Roda e eixo", "Plano inclinado"], "correct": 0, "exp": "A cunha tem forma afiada e serve para cortar ou separar, como o machado, a faca e os dentes da frente."}, {"type": "open", "text": "Cite uma máquina simples que você usa no dia a dia e explique como ela ajuda.", "exp": "Exemplos: abridor de garrafa (alavanca); rampa (plano inclinado); faca (cunha); polia do poço (roldana); maçaneta (roda e eixo)."}], "tipo": "exercicio"}, {"title": "Rochas e fósseis", "subject": "Ciências", "notes": "Tipos de rochas: magmáticas (ígneas), sedimentares e metamórficas. Fósseis são restos ou vestígios de seres vivos antigos preservados, principalmente em rochas sedimentares.", "questions": [{"type": "mc", "text": "Quais são os três tipos de rochas?", "options": ["Magmáticas (ígneas), sedimentares e metamórficas", "Duras, moles e médias", "Vulcânicas, marinhas e terrestres", "Pedras, areia e argila"], "correct": 0, "exp": "Elas se diferenciam pela forma como foram formadas."}, {"type": "mc", "text": "O granito se forma pelo resfriamento do magma. Ele é uma rocha:", "options": ["Sedimentar", "Metamórfica", "Magmática", "Fóssil"], "correct": 2, "exp": "Rochas magmáticas (ou ígneas) vêm do magma que esfriou e endureceu. O basalto também é magmático."}, {"type": "mc", "text": "Em qual tipo de rocha os fósseis são encontrados com mais frequência?", "options": ["Magmática", "Sedimentar", "Metamórfica", "Em nenhuma"], "correct": 1, "exp": "As rochas sedimentares se formam em camadas de sedimentos que podem cobrir e preservar restos de seres vivos."}, {"type": "mc", "text": "O mármore se forma quando o calcário sofre muita pressão e calor. Ele é uma rocha:", "options": ["Metamórfica", "Sedimentar", "Magmática", "Fóssil"], "correct": 0, "exp": "Rochas metamórficas são transformações de outras rochas por calor e pressão."}, {"type": "mc", "text": "O que é um fóssil?", "options": ["Restos ou vestígios de seres vivos que viveram há muito tempo, preservados na natureza", "Qualquer pedra antiga", "Um mineral brilhante", "Uma planta viva muito velha"], "correct": 0, "exp": "Podem ser ossos, conchas, folhas, pegadas ou marcas deixadas por seres do passado."}, {"type": "mc", "text": "Qual destes pode ser considerado um fóssil?", "options": ["Pegada de dinossauro preservada na rocha", "Concha encontrada hoje na praia", "Osso de galinha do almoço", "Areia da praia"], "correct": 0, "exp": "Fósseis têm milhares ou milhões de anos. A pegada é um vestígio preservado."}, {"type": "open", "text": "Por que os fósseis são importantes para a ciência?", "exp": "Mostram como eram os seres vivos e os ambientes do passado, ajudam a entender a evolução da vida e a estimar a idade das rochas."}], "tipo": "exercicio"}, {"title": "Lendas indígenas, marcadores temporais e verbos", "subject": "Português", "notes": "Leia a lenda (versão recontada):\n\nA lenda da mandioca\nHá muito tempo, numa aldeia tupi, nasceu uma menina de pele muito clara chamada Mani. Todos ficaram encantados com ela. Certo dia, porém, Mani adoeceu e, pouco tempo depois, morreu. A família a enterrou dentro da própria oca e, todos os dias, regava o lugar com água e lágrimas. Depois de algumas semanas, nasceu ali uma planta diferente. Quando os indígenas cavaram a terra, encontraram uma raiz branca por dentro, como a pele da menina. Desde então, chamaram a raiz de mandioca, que quer dizer “casa de Mani” (Mani + oca).", "questions": [{"type": "mc", "text": "A lenda explica a origem:", "options": ["Do milho", "Da mandioca", "Do guaraná", "Dos rios"], "correct": 1, "exp": "O nome mandioca viria de Mani + oca, a “casa de Mani”."}, {"type": "mc", "text": "O que é uma lenda?", "options": ["Uma narrativa tradicional, passada de geração em geração, que explica fatos com elementos fantásticos", "Uma notícia de jornal", "Um texto científico", "Uma receita culinária"], "correct": 0, "exp": "As lendas indígenas costumam explicar a origem de plantas, animais e elementos da natureza."}, {"type": "mc", "text": "Quais expressões do texto são marcadores temporais?", "options": ["“Há muito tempo”, “Certo dia”, “Depois de algumas semanas”", "“aldeia”, “oca”, “raiz”", "“branca”, “clara”, “diferente”", "“Mani”, “família”, “indígenas”"], "correct": 0, "exp": "Marcadores temporais indicam QUANDO os fatos acontecem e organizam a sequência da história."}, {"type": "mc", "text": "Em “Certo dia, Mani adoeceu”, o verbo “adoeceu” está no:", "options": ["Presente", "Pretérito (passado)", "Futuro", "Não é verbo"], "correct": 1, "exp": "Adoeceu indica algo que já aconteceu. As lendas normalmente são contadas no passado."}, {"type": "mc", "text": "Qual destas palavras é um verbo?", "options": ["menina", "branca", "cavaram", "aldeia"], "correct": 2, "exp": "Verbo indica ação, estado ou fenômeno. “Cavaram” é a ação de cavar."}, {"type": "mc", "text": "Complete: “Amanhã a aldeia ___ uma festa.”", "options": ["fez", "faz", "fará", "fazia"], "correct": 2, "exp": "“Amanhã” indica futuro, por isso: fará."}, {"type": "open", "text": "Reescreva a frase no futuro: “Os indígenas cavaram a terra.”", "exp": "Os indígenas cavarão a terra. (ou: Os indígenas vão cavar a terra.)"}, {"type": "open", "text": "Qual elemento fantástico (que não acontece na vida real) aparece nessa lenda?", "exp": "Uma planta nasce do lugar onde a menina foi enterrada, com a raiz branca como a pele dela."}], "tipo": "exercicio"}, {"title": "Primos, plano cartesiano, triângulos e polígonos", "subject": "Matemática", "notes": "Conteúdos: números primos e Crivo de Eratóstenes; plano cartesiano e coordenadas; classificação dos triângulos quanto aos ângulos; polígonos.\nDica: no ponto (x, y), o primeiro número anda na horizontal e o segundo na vertical.", "questions": [{"type": "mc", "text": "Qual destes números é primo?", "options": ["9", "15", "13", "21"], "correct": 2, "exp": "13 só é divisível por 1 e por 13. 9 = 3×3; 15 = 3×5; 21 = 3×7."}, {"type": "mc", "text": "Um número primo é aquele que:", "options": ["Tem exatamente dois divisores: 1 e ele mesmo", "É sempre par", "Termina em 1", "Tem muitos divisores"], "correct": 0, "exp": "O único primo par é o 2."}, {"type": "mc", "text": "O número 1 é:", "options": ["Primo", "Nem primo nem composto", "Composto"], "correct": 1, "exp": "O 1 tem só um divisor (ele mesmo), então não é primo nem composto."}, {"type": "mc", "text": "Usando o Crivo de Eratóstenes, quantos números primos existem de 1 a 20?", "options": ["6", "7", "8", "9"], "correct": 2, "exp": "São eles: 2, 3, 5, 7, 11, 13, 17 e 19. No crivo riscamos o 1 e os múltiplos de 2, 3, 5… e sobram os primos."}, {"type": "mc", "text": "Para marcar o ponto (3, 5) no plano cartesiano, partimos da origem e andamos:", "options": ["3 para a direita (eixo x) e 5 para cima (eixo y)", "3 para cima e 5 para a direita", "3 para a esquerda e 5 para baixo", "5 para a direita e 3 para cima"], "correct": 0, "exp": "Primeiro a coordenada x (horizontal), depois a y (vertical)."}, {"type": "mc", "text": "Quais são as coordenadas da origem do plano cartesiano?", "options": ["(1, 1)", "(0, 0)", "(0, 1)", "(1, 0)"], "correct": 1, "exp": "A origem é o ponto onde os eixos x e y se cruzam."}, {"type": "mc", "text": "Um triângulo que tem um ângulo de 90° é chamado de:", "options": ["Acutângulo", "Retângulo", "Obtusângulo", "Equilátero"], "correct": 1, "exp": "Retângulo = tem um ângulo reto (90°). Equilátero é classificação pelos lados, não pelos ângulos."}, {"type": "mc", "text": "Um triângulo com ângulos de 40°, 30° e 110° é:", "options": ["Acutângulo", "Retângulo", "Obtusângulo", "Equilátero"], "correct": 2, "exp": "Tem um ângulo maior que 90° (110°), então é obtusângulo."}, {"type": "mc", "text": "Um triângulo com ângulos de 60°, 70° e 50° é:", "options": ["Acutângulo", "Retângulo", "Obtusângulo", "Escaleno-reto"], "correct": 0, "exp": "Todos os ângulos são menores que 90°, então é acutângulo."}, {"type": "mc", "text": "Um polígono com 6 lados se chama:", "options": ["Pentágono", "Hexágono", "Octógono", "Heptágono"], "correct": 1, "exp": "5 lados = pentágono; 6 = hexágono; 7 = heptágono; 8 = octógono."}, {"type": "mc", "text": "Qual destas figuras NÃO é um polígono?", "options": ["Quadrado", "Triângulo", "Círculo", "Pentágono"], "correct": 2, "exp": "Polígonos são figuras fechadas formadas só por segmentos de reta. O círculo tem contorno curvo."}, {"type": "open", "text": "Quantos lados, vértices e ângulos tem um pentágono?", "exp": "5 lados, 5 vértices e 5 ângulos."}], "tipo": "exercicio"}, {"title": "Simulado – Verdadeiro ou Falso (revisão geral)", "subject": "Multidisciplinar", "tipo": "simulado", "notes": "Simulado rápido com conteúdos de várias disciplinas. Marque V ou F.", "questions": [{"type": "vf", "text": "A Mesopotâmia ficava entre os rios Tigre e Eufrates.", "correct": true, "exp": "Mesopotâmia significa “terra entre rios”."}, {"type": "vf", "text": "O número 1 é um número primo.", "correct": false, "exp": "O 1 tem um só divisor; não é primo nem composto."}, {"type": "vf", "text": "No voleibol há contato físico entre os adversários durante a jogada.", "correct": false, "exp": "A rede separa as equipes; não há contato entre adversários."}, {"type": "vf", "text": "Os fósseis são encontrados principalmente em rochas sedimentares.", "correct": true, "exp": "As camadas de sedimentos cobrem e preservam os restos."}, {"type": "vf", "text": "A frase “She are my friend” está correta.", "correct": false, "exp": "Com she usamos is: She is my friend."}, {"type": "vf", "text": "Um triângulo retângulo possui um ângulo de 90°.", "correct": true, "exp": "Retângulo = tem um ângulo reto."}, {"type": "vf", "text": "Em uma lenda, os marcadores temporais indicam quando os fatos acontecem.", "correct": true, "exp": "Ex.: “Há muito tempo”, “Certo dia”."}, {"type": "vf", "text": "A tesoura é um exemplo de plano inclinado.", "correct": false, "exp": "A tesoura é uma alavanca."}]}];

  function preparar(dados) {
    _cache = {}; _ops = []; _upl = []; _rm = []; _rpc = []; _kv = {};
    Object.keys(TAB).forEach(t => { _cache[t] = (dados[t] || []).map(x => Object.assign({}, x)); });
    const kv = dados.kv || {}; Object.keys(kv).forEach(k => { _kv[k] = kv[k]; if (k.indexOf('c:s_') === 0 && dados.kvExp && dados.kvExp[k]) _kv['e:' + k.slice(2)] = dados.kvExp[k]; });
  }
  function coletar() {
    // última versão de cada registro gravado
    const vistos = {}; const ops = [];
    for (let i = _ops.length - 1; i >= 0; i--) {
      const o = _ops[i]; const ch = o.op === 'kv' ? 'kv:' + o.k : o.t + ':' + (o.op === 'set' ? (o.o.id || o.o.chave) : o.id);
      if (vistos[ch]) continue; vistos[ch] = 1;
      if (o.op === 'set') { const c = Object.assign({}, o.o); delete c._row; ops.unshift({ op: 'set', t: o.t, id: o.o.id || o.o.chave, o: c }); }
      else ops.unshift(o);
    }
    return { ops: ops, uploads: _upl, remover: _rm, rpc: _rpc };
  }
  return {
    executar(dados, token, acao, d) { preparar(dados); const r = api(token, acao, d); return Object.assign({ resposta: r }, coletar()); },
    instalar(dados) { preparar(dados); const msgs = instalar(); return Object.assign({ msgs: msgs }, coletar()); }
  };
}
