/* =================== INTELIGÊNCIA ARTIFICIAL EDUCACIONAL =================== */
// As rotas validam permissões e limites; a chamada à IA é feita pelo servidor (handler.js),
// com a chave guardada em segredo no Supabase. Nada da chave chega ao navegador.
const IA_MODELO_GERAR = 'claude-sonnet-5-5';
const IA_MODELO_TUTOR = 'claude-haiku-5-5';
const IA_PRECO = { 'claude-sonnet-5-5': { in: 2, out: 10 }, 'claude-haiku-5-5': { in: 0.10, out: 0.50 } }; // US$ por milhão de tokens
CFG_PADRAO.iaAtiva = true; CFG_PADRAO.iaLimiteProfDia = 20; CFG_PADRAO.iaLimiteAlunoDia = 40;

function hojeChave_() { const d = new Date(Date.now() - 3 * 3600e3); return d.toISOString().slice(0, 10); }
function iaContar_(u, limite) {
  const c = CacheService.getScriptCache(); const k = 'ia_' + hojeChave_() + '_' + u.id;
  const n = Number(c.get(k) || 0);
  if (n >= limite) erro_('Você atingiu o limite de ' + limite + ' usos da IA por hoje. Tente amanhã ou fale com o administrador.');
  c.put(k, String(n + 1), 172800); return n + 1;
}
function iaLigada_() { if (!cfg_().iaAtiva) erro_('A Inteligência Artificial está desligada nas configurações da plataforma.'); }

rota_('iaStatus', TODOS, false, u => {
  const c = cfg_(); const lim = u.perfil === 'aluno' ? Number(c.iaLimiteAlunoDia) : Number(c.iaLimiteProfDia);
  const usados = Number(CacheService.getScriptCache().get('ia_' + hojeChave_() + '_' + u.id) || 0);
  return { ativa: !!c.iaAtiva, limite: lim, usados: usados, restantes: Math.max(0, lim - usados) };
});

const IA_SCHEMA_QUESTOES = {
  type: 'object',
  properties: {
    titulo: { type: 'string', description: 'Título curto para a atividade' },
    disciplina: { type: 'string' },
    resumo: { type: 'string', description: 'Resumo de 1 a 3 frases do conteúdo lido' },
    questoes: { type: 'array', items: { type: 'object', properties: {
      tipo: { type: 'string', enum: ['mc', 'vf', 'disc'] },
      enunciado: { type: 'string' },
      textoApoio: { type: 'string', description: 'Trecho do material necessário para responder (opcional)' },
      opcoes: { type: 'array', items: { type: 'string' }, description: 'Somente para mc: 4 alternativas' },
      correta_indice: { type: 'integer', description: 'Somente para mc: índice (0 a 3) da alternativa correta' },
      correta_vf: { type: 'boolean', description: 'Somente para vf: true se a afirmação é verdadeira' },
      explicacao: { type: 'string', description: 'Explicação da resposta correta (para disc: resposta esperada e critérios)' }
    }, required: ['tipo', 'enunciado', 'explicacao'] } }
  },
  required: ['titulo', 'questoes']
};

rota_('iaGerarQuestoes', PROF, true, (u, d) => {
  iaLigada_();
  const arqs = Array.isArray(d.arquivos) ? d.arquivos : [];
  if (!arqs.length && !txt_(d.texto, 20000)) erro_('Envie pelo menos uma foto, um PDF ou cole um texto.');
  if (arqs.length > 12) erro_('Envie no máximo 12 arquivos por vez.');
  let total = 0; const blocos = [];
  arqs.forEach((a, i) => {
    const m = /^data:(image\/(jpeg|png|webp|gif)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(String(a || ''));
    if (!m) erro_('Arquivo ' + (i + 1) + ': formato não aceito. Use foto (JPG/PNG) ou PDF.');
    const tam = Math.floor(m[3].length * 3 / 4); total += tam;
    if (m[1] === 'application/pdf') { if (tam > 10 * 1024 * 1024) erro_('Arquivo ' + (i + 1) + ': PDF maior que 10 MB.'); blocos.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: m[3] } }); }
    else { if (tam > 5 * 1024 * 1024) erro_('Arquivo ' + (i + 1) + ': imagem maior que 5 MB.'); blocos.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[3] } }); }
  });
  if (total > 18 * 1024 * 1024) erro_('Os arquivos somam mais de 18 MB. Envie menos páginas por vez.');
  const qtd = [5, 10, 15, 20, 30].indexOf(Number(d.quantidade)) >= 0 ? Number(d.quantidade) : 10;
  const nivel = ({ facil: 'fácil', medio: 'médio', dificil: 'difícil', misto: 'misto (fácil, médio e difícil)' })[d.dificuldade] || 'médio';
  const tipos = (Array.isArray(d.tipos) ? d.tipos : ['mc']).filter(t => ['mc', 'vf', 'disc'].indexOf(t) >= 0);
  if (!tipos.length) erro_('Escolha pelo menos um tipo de questão.');
  const nomeTipo = { mc: 'múltipla escolha (4 alternativas, 1 correta)', vf: 'verdadeiro ou falso', disc: 'discursiva (resposta escrita)' };
  iaContar_(u, Number(cfg_().iaLimiteProfDia) || 20);
  log_(u, 'ia_gerar', qtd + ' questões, ' + arqs.length + ' arquivo(s)');
  const pedido = 'Gere EXATAMENTE ' + qtd + ' questões em português do Brasil, baseadas SOMENTE no material enviado.\n' +
    'Tipos permitidos (distribua de forma equilibrada): ' + tipos.map(t => nomeTipo[t]).join('; ') + '.\n' +
    'Nível de dificuldade: ' + nivel + '.\n' +
    'Público: ' + (txt_(d.serie, 60) || 'Ensino Fundamental') + (txt_(d.disciplina, 60) ? ' — disciplina: ' + txt_(d.disciplina, 60) : '') + '.\n' +
    (txt_(d.observacoes, 1000) ? 'Orientações do professor: ' + txt_(d.observacoes, 1000) + '\n' : '') +
    (txt_(d.texto, 20000) ? '\nTexto colado pelo professor:\n"""' + txt_(d.texto, 20000) + '"""\n' : '') +
    'Regras: enunciados claros e adequados à idade; alternativas plausíveis; apenas uma correta; sem pegadinhas injustas; ' +
    'para cada questão escreva uma explicação curta e didática. Se o material estiver ilegível ou sem conteúdo escolar, gere questões só sobre o que for possível ler e explique no resumo. ' +
    'Responda chamando a ferramenta salvar_questoes.';
  blocos.push({ type: 'text', text: pedido });
  return { __ia: { modo: 'gerar', usuarioId: u.id, modelo: IA_MODELO_GERAR, max_tokens: Math.min(20000, 1500 + qtd * 600),
    sistema: 'Você é um assistente pedagógico de professores brasileiros. Lê fotos de livros, cadernos e PDFs e cria questões de avaliação de alta qualidade, fiéis ao conteúdo, com gabarito e explicação. Nunca invente fatos que não estejam no material ou no conhecimento escolar consolidado.',
    conteudo: blocos, ferramenta: { name: 'salvar_questoes', description: 'Salva as questões geradas', input_schema: IA_SCHEMA_QUESTOES },
    meta: { quantidade: qtd, disciplina: txt_(d.disciplina, 60), tipos: tipos } } };
});

// valida e limpa as questões que a IA devolveu (descarta as defeituosas)
function iaLimparQuestoes_(saida, meta) {
  const qs = (saida && Array.isArray(saida.questoes)) ? saida.questoes : [];
  const ok = [];
  qs.forEach(q => {
    const tipo = ['mc', 'vf', 'disc'].indexOf(q.tipo) >= 0 ? q.tipo : null;
    const en = txt_(q.enunciado, 5000);
    if (!tipo || !en) return;
    if (meta.tipos.indexOf(tipo) < 0) return;
    const o = { tipo: tipo, enunciado: en, textoApoio: txt_(q.textoApoio, 20000), imagem: '', pontos: tipo === 'disc' ? 2 : 1, permiteFoto: tipo === 'disc', explicacao: txt_(q.explicacao, 5000) };
    if (tipo === 'mc') {
      const op = (Array.isArray(q.opcoes) ? q.opcoes : []).map(x => txt_(x, 1000)).filter(Boolean).slice(0, 8);
      const c = Number(q.correta_indice);
      if (op.length < 2 || !(Number.isInteger(c) && c >= 0 && c < op.length)) return;
      o.opcoes = op; o.correta = c;
    }
    if (tipo === 'vf') { if (q.correta_vf !== true && q.correta_vf !== false) return; o.correta = q.correta_vf; }
    ok.push(o);
  });
  return { titulo: txt_(saida && saida.titulo, 150) || 'Atividade gerada com IA', disciplina: meta.disciplina || txt_(saida && saida.disciplina, 60),
    resumo: txt_(saida && saida.resumo, 1000), questoes: ok.slice(0, meta.quantidade) };
}

rota_('iaTutor', ALU, true, (u, d) => {
  iaLigada_();
  const pergunta = txt_(d.pergunta, 2000);
  if (pergunta.length < 2) erro_('Escreva sua pergunta.');
  const hist = (Array.isArray(d.historico) ? d.historico : []).slice(-10).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: txt_(m.texto, 4000) })).filter(m => m.content);
  // contexto escolar do próprio aluno (sem nome, sem dados pessoais)
  const idade = idade_(u.nascimento);
  const minhas = turmasAluno_(u.id);
  const series = minhas.map(id => get_('Turmas', id)).filter(Boolean).map(t => t.serie).filter(Boolean);
  let ctxAtiv = '';
  if (d.atividadeId) {
    const a = get_('Atividades', d.atividadeId);
    if (!a || !alvo_(a, u.id, minhas)) erro_('Atividade não encontrada.');
    const e = entregaDe_(a.id, u.id);
    const liberada = a.notasLiberadas && e && e.status === 'corrigida';
    ctxAtiv = '\n\nO aluno está estudando a atividade "' + a.titulo + '" (' + (a.disciplina || '') + ').' +
      (liberada ? ' Ela JÁ FOI CORRIGIDA: você pode explicar as respostas corretas para ele aprender com os erros.' :
        ' Ela AINDA NÃO FOI ENTREGUE/CORRIGIDA: NUNCA dê a resposta final nem diga qual alternativa é a correta; ajude apenas com dicas, perguntas que guiem o raciocínio e explicação do conteúdo.') +
      '\nQuestões da atividade:\n' + (a.questoes || []).map((q, i) => (i + 1) + ') ' + q.enunciado + (q.opcoes ? ' | Alternativas: ' + q.opcoes.map((x, j) => String.fromCharCode(65 + j) + ') ' + x).join(' ') : '') +
        (liberada ? ' | Resposta correta: ' + (q.tipo === 'mc' ? String.fromCharCode(65 + q.correta) : q.tipo === 'vf' ? (q.correta ? 'Verdadeiro' : 'Falso') : (q.explicacao || '')) : '')).join('\n').slice(0, 12000);
  }
  const conteudo = [];
  const img = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(d.imagem || ''));
  if (d.imagem && !img) erro_('Imagem inválida. Use JPG ou PNG.');
  if (img) { if (img[3].length * 3 / 4 > 4 * 1024 * 1024) erro_('Imagem muito grande.'); conteudo.push({ type: 'image', source: { type: 'base64', media_type: img[1], data: img[3] } }); }
  conteudo.push({ type: 'text', text: pergunta });
  iaContar_(u, Number(cfg_().iaLimiteAlunoDia) || 40);
  const sistema = 'Você é o Tutor da Sala Digital, um professor particular paciente, gentil e encorajador para estudantes brasileiros.' +
    ' Perfil do aluno: ' + (idade !== null ? idade + ' anos' : 'idade não informada') + (series.length ? ', ' + series.join(', ') : '') + '.' +
    ' Adapte a linguagem à idade: frases curtas, exemplos do dia a dia, sem termos difíceis sem explicar.' +
    ' Responda em português do Brasil, de forma curta (até uns 150 palavras), usando listas quando ajudar.' +
    ' Seu foco é o estudo: matérias escolares, explicações, exemplos, dicas e organização dos estudos.' +
    ' Ao ajudar com exercícios, prefira guiar o raciocínio com dicas e perguntas em vez de entregar a resposta pronta, a menos que a atividade já tenha sido corrigida.' +
    ' Não peça nem guarde dados pessoais (nome completo, endereço, telefone, fotos do rosto). Não fale de assuntos impróprios para a idade.' +
    ' Se o aluno falar de algo pessoal sério (tristeza profunda, violência, abuso, vontade de se machucar), responda com acolhimento, incentive a conversar com um adulto de confiança (família, professor, coordenação) e informe o CVV pelo telefone 188 (ligação gratuita, 24 horas).' +
    ' Se não souber algo, diga que não tem certeza e sugira confirmar com o professor.' + ctxAtiv;
  return { __ia: { modo: 'tutor', usuarioId: u.id, modelo: IA_MODELO_TUTOR, max_tokens: 800, sistema: sistema, historico: hist, conteudo: conteudo } };
});

rota_('iaUso', ADM, false, () => {
  const mes = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7);
  const L = all_('IaUso');
  const doMes = L.filter(x => String(x.mes) === mes);
  const soma = (arr, k) => arr.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  return { mes: mes, chamadas: soma(doMes, 'chamadas'), usd: Math.round(soma(doMes, 'usd') * 10000) / 10000,
    porModo: ['gerar', 'tutor'].map(m => { const a = doMes.filter(x => x.modo === m); return { modo: m, chamadas: soma(a, 'chamadas'), usd: Math.round(soma(a, 'usd') * 10000) / 10000 }; }) };
});

rota_('iaConfigSalvar', ADM, true, (u, d) => {
  setCfg_('iaAtiva', !!d.iaAtiva);
  setCfg_('iaLimiteProfDia', Math.max(0, Math.min(500, Number(d.iaLimiteProfDia) || 0)));
  setCfg_('iaLimiteAlunoDia', Math.max(0, Math.min(500, Number(d.iaLimiteAlunoDia) || 0)));
  log_(u, 'ia_config', JSON.stringify(d).slice(0, 200)); return cfg_();
});
