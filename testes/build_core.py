"""Gera o núcleo do servidor (core.js) a partir do Code.gs testado,
trocando a camada Google (Planilhas/Drive/Cache) por PostgreSQL + Storage."""
import re, json
src = open('/home/claude/plataforma/src/Code.tpl.gs').read()

def bloco(s, inicio):
    """retorna (ini, fim) do bloco que começa em `inicio` (balanceando chaves/parênteses)"""
    i = s.index(inicio); j = i; prof = 0; vis = False; q = None; esc = False
    while True:
        c = s[j]
        if q:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == q: q = None
        elif c in '\'"`': q = c
        elif c in '({': prof += 1; vis = True
        elif c in ')}':
            prof -= 1
            if vis and prof == 0:
                j += 1
                if s[j:j+1] == ';': j += 1
                return i, j
        j += 1
def fim_chaves(s, k):
    prof = 0; q = None; esc = False; j = k
    while True:
        c = s[j]
        if q:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == q: q = None
        elif c in '\'"`': q = c
        elif c == '{': prof += 1
        elif c == '}':
            prof -= 1
            if prof == 0: return j + 1
        j += 1
def troca_func(nome, novo):
    global src
    i = src.index('\nfunction ' + nome + '(')
    k = src.index('{', src.index(')', i))
    _, j = bloco(src[:i] + ' ' * (k - i) + src[k:], ' ' * (k - i) + '{') if False else (0, 0)
    j = fim_chaves(src, k)
    src = src[:i] + '\n' + novo.strip() + src[j:]
def troca_rota(nome, novo):
    global src
    i, j = bloco(src, "\nrota_('" + nome + "'")
    src = src[:i] + '\n' + novo.strip() + src[j:]
def remove_func(nome): troca_func(nome, '')

# ---- cabeçalho / página ----
src = src.replace(src[src.index('/*****'):src.index('/* =================== CONFIGURAÇÃO INICIAL')], '')
src = src.replace("Config:     ['chave','valor'],", "Config:     ['chave','valor'],\n  Arquivos:   ['id','tipo','alunoId','atividadeId','entregaId','professorId','mime','tamanho','criadoEm'],")
src = src.replace("Log:        ['data','usuarioId','acao','detalhe']", "Log:        ['id','data','usuarioId','acao','detalhe']")
src = src.replace("fotoMaxMB: 4,", "fotoMaxMB: 3,")
remove_func('doGet')
# ---- camada de dados ----
src = src.replace("let _ss = null; const _cache = {};", "let _cache = {}; let _ops = [];")
remove_func('ss_'); remove_func('salvarGrande_'); remove_func('enc_'); remove_func('dec_'); remove_func('pasta_')
troca_func('tab_', "function tab_(t) { if (!_cache[t]) _cache[t] = []; return _cache[t]; }")
troca_func('all_', "function all_(t) { return tab_(t); }")
troca_func('ins_', "function ins_(t, o) { tab_(t).push(o); _ops.push({ op: 'set', t: t, o: o }); return o; }")
troca_func('upd_', "function upd_(t, o) { _ops.push({ op: 'set', t: t, o: o }); return o; }")
troca_func('del_', """function del_(t, lista) {
  (Array.isArray(lista) ? lista : [lista]).filter(Boolean).forEach(o => {
    const id = o.id || o.chave; _ops.push({ op: 'del', t: t, id: id });
    const a = tab_(t); const i = a.indexOf(o); if (i >= 0) a.splice(i, 1);
  });
}""")
troca_func('log_', """function log_(u, acao, detalhe) {
  try { ins_('Log', { id: uid_('l'), data: agora_(), usuarioId: u ? u.id : '', acao: acao, detalhe: txt_(detalhe, 300) }); } catch (e) { }
}""")
# ---- api: sem lock (o banco garante atomicidade) ----
src = src.replace("if (r.grava) { lock = LockService.getScriptLock(); lock.waitLock(25000); }", "")
src = src.replace("    console.error(acao, e && e.stack ? e.stack : e);", "    if (typeof console !== 'undefined') console.error(acao, e && e.stack ? e.stack : e);")
# ---- recuperação de senha: sem servidor de e-mail ----
troca_rota('recuperar', """rota_('recuperar', null, false, () => ({ msg: 'Para criar uma nova senha, fale com seu professor (alunos) ou com o administrador da escola: eles geram uma senha provisória na hora, e você cria a sua no primeiro acesso.' }));""")
# ---- imagens: Storage privado ----
troca_func('salvaImagem_', """function salvaImagem_(dataUrl, pastaTipo, meta) {
  const m = /^data:(image\\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) erro_('Formato de imagem não permitido. Use JPG, PNG ou WEBP.');
  const tam = Math.floor(m[3].length * 3 / 4); const max = (Number(cfg_().fotoMaxMB) || 3) * 1024 * 1024;
  if (tam > max) erro_('Imagem muito grande (máximo ' + cfg_().fotoMaxMB + ' MB).');
  const id = uid_('img') + '.' + (m[2] === 'jpeg' ? 'jpg' : m[2]);
  _upl.push({ caminho: (pastaTipo === 'FOTOS' ? 'fotos/' : 'questoes/') + id, mime: m[1], b64: m[3] });
  ins_('Arquivos', Object.assign({ id: id, mime: m[1], tamanho: tam, criadoEm: agora_() }, meta));
  return id;
}""")
troca_func('apagarFotos_', """function apagarFotos_(fotos) {
  if (!fotos) return;
  Object.keys(fotos).forEach(q => (fotos[q] || []).forEach(id => apagaArquivo_(id)));
}
function apagaArquivo_(id) {
  const a = get_('Arquivos', id); if (!a) return;
  _rm.push((a.tipo === 'foto' ? 'fotos/' : 'questoes/') + id); del_('Arquivos', a);
}""")
src = src.replace("try { DriveApp.getFileById(d.fileId).setTrashed(true); } catch (x) { }", "apagaArquivo_(d.fileId);")
troca_rota('imagem', """rota_('imagem', TODOS, false, (u, d) => {
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
});""")
# ---- exportação: arquivos CSV para baixar ----
troca_rota('exportarPlanilha', """rota_('exportarPlanilha', ADM, false, u => {
  const r = ROTAS.relatorioGeral.fn(u, {});
  const csv = (cab, linhas) => '\\ufeff' + [cab].concat(linhas).map(l => l.map(v => { v = v === null || v === undefined ? '' : String(v); return /[";\\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';')).join('\\n');
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
});""")
troca_rota('backupAgora', """rota_('backupAgora', ADM, true, u => { _rpc.push('sd_backup'); log_(u, 'backup_manual', ''); return String(agora_()); });""")
troca_rota('logs', """rota_('logs', ADM, false, () => all_('Log').slice().sort((a, b) => b.data - a.data).slice(0, 200).map(l => ({ data: l.data, usuario: l.usuarioId ? nomeU_(l.usuarioId) : '—', acao: l.acao, detalhe: l.detalhe })));""")
# ---- backup e instalação (feitos no banco / pelo script de implantação) ----
i = src.index('/* =================== BACKUP'); j = src.index('/* =================== CONTEÚDO DE DEMONSTRAÇÃO')
instalar = src[src.index('function instalar()'):j]
src = src[:i] + src[j:]
instalar = instalar.replace("""  soDono_();
  const s = SpreadsheetApp.getActiveSpreadsheet();
  if (!s) throw new Error('Abra o Apps Script a partir da planilha (Extensões > Apps Script).');
  PROPS().setProperty('PLANILHA', s.getId()); _ss = s;
  Object.keys(TAB).forEach(tab_);
  const p1 = s.getSheetByName('Página1') || s.getSheetByName('Sheet1'); if (p1 && s.getSheets().length > 1) s.deleteSheet(p1);
  ['FOTOS', 'IMAGENS', 'DADOS', 'BACKUP'].forEach(pasta_);
""", "")
instalar = instalar[:instalar.index("  ScriptApp.getProjectTriggers()")] + "  if (_senhasAleatorias) PROPS().setProperty('SENHAS_INICIAIS', JSON.stringify(_senhas));\n  return msgs;\n}\n"
for a, b in [("senha: INICIAL.adminSenha,", "senha: S_('admin', INICIAL.adminSenha),"), ("' + INICIAL.adminSenha + '", "' + _senhas.admin + '"),
             ("senha: 'Prof@2026'", "senha: S_('professor', 'Prof@2026')"), ("senha: 'Aluno@2026'", "senha: S_('aluno', 'Aluno@2026')"), ("senha: 'Maria@2026'", "senha: S_('maria', 'Maria@2026')"),
             ("senha: Prof@2026", "senha: ' + _senhas.professor + '"), ("senha: Aluno@2026", "senha: ' + _senhas.aluno + '")]:
    assert a in instalar, a
    instalar = instalar.replace(a, b)
instalar = instalar.replace("function instalar() {", "function instalar() {\n  const _senhas = {};\n  const S_ = (k, padrao) => (_senhas[k] = _senhasAleatorias ? senhaForte_() : padrao);\n  function senhaForte_() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; const h = (uuid() + uuid()).replace(/-/g, ''); let x = ''; for (let i = 0; i < 12; i++) x += c[parseInt(h.substr(i * 2, 2), 16) % c.length]; return x + '#' + (10 + parseInt(h.substr(26, 2), 16) % 90); }")
src = src.replace('/* =================== CONTEÚDO DE DEMONSTRAÇÃO', instalar + '\n/* =================== CONTEÚDO DE DEMONSTRAÇÃO')
# sessão: só renova a validade quando passou mais de 1 hora (menos gravações)
src = src.replace("  c.put('s_' + tk, id, SESSAO_SEG); return u;", "  if (c.restante('s_' + tk) < SESSAO_SEG - 3600) c.put('s_' + tk, id, SESSAO_SEG);\n  return u;")

seed = json.load(open('/home/claude/fora/seed.json'))
exec(open('/home/claude/plataforma/build.py').read().split("src=open")[0].replace("seed=json.load(open('/home/claude/fora/seed.json'))", ""))
src = src.replace('__SEED__', json.dumps(seed, ensure_ascii=False))

wrapper = """// SALA DIGITAL — núcleo do servidor (gerado a partir do Code.gs testado)
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
/*CODIGO*/
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
"""
# Utilities.base64Encode(computeDigest(...)) já é usado em hash_ -> funciona com o objeto acima
assert 'Utilities.base64Encode(Utilities.computeDigest(' in src
src = src.replace("Utilities.getUuid()", "Utilities.getUuid()")
for proib in ['SpreadsheetApp', 'DriveApp', 'MailApp', 'LockService', 'ScriptApp', 'HtmlService', 'Session.']:
    if proib in src: print('ATENÇÃO resta', proib, [m.start() for m in re.finditer(re.escape(proib), src)][:3])
ia = open('/home/claude/supa/server/ia_rotas.js').read()
ia = "TAB.IaUso = ['mes', 'modo', 'chamadas', 'usd'];\n" + ia
wrapper = wrapper.replace("    instalar(dados) {", "    limparIA(saida, meta) { return iaLimparQuestoes_(saida, meta); },\n    sistema(dados, nome, args) { preparar(dados); let r; try { r = DESAFIO_SIS[nome](args || {}); } catch (e) { if (typeof console !== 'undefined') console.error('sistema', nome, e && e.stack || e); throw e; } return Object.assign({ resultado: r }, coletar()); },\n    instalar(dados) {")
banco = open('/home/claude/supa/server/banco_rotas.js').read() + '\n' + open('/home/claude/supa/server/desafio_rotas.js').read()
open('/home/claude/supa/server/core.js', 'w').write(wrapper.replace('/*CODIGO*/', src + '\n' + ia + '\n' + banco))
print('core.js', len(src))
