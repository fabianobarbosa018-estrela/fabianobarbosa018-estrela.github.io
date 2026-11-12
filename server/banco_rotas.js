/* =================== BANCO DE ATIVIDADES =================== */
// O conteúdo (textos, questões e gabaritos) fica criptografado no servidor. As rotas só validam
// permissão e filtros; quem abre o arquivo é o servidor (handler.js), com a chave guardada no banco de dados.
// Só professores e administradores acessam. O aluno recebe apenas a atividade publicada, sem gabarito.
function bancoChave_() {
  const k = PROPS().getProperty('BANCO_CHAVE');
  if (!k) erro_('O Banco de Atividades ainda não foi instalado nesta plataforma.');
  return k;
}
rota_('bancoIndice', PROF, false, () => ({ __banco: { acao: 'indice', chave: bancoChave_() } }));
rota_('bancoTexto', PROF, false, (u, d) => ({ __banco: { acao: 'texto', chave: bancoChave_(), disciplina: txt_(d.disciplina, 40), assunto: Number(d.assunto), videos: videosCfg_() } }));
rota_('bancoMontar', PROF, true, (u, d) => {
  const chave = bancoChave_();
  const disc = txt_(d.disciplina, 40);
  if (!disc) erro_('Escolha a disciplina.');
  const assuntos = (Array.isArray(d.assuntos) ? d.assuntos : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < 200);
  if (!assuntos.length) erro_('Escolha pelo menos um assunto.');
  const tipos = (Array.isArray(d.tipos) ? d.tipos : ['mc', 'vf', 'disc']).filter(t => ['mc', 'vf', 'disc'].indexOf(t) >= 0);
  if (!tipos.length) erro_('Escolha pelo menos um tipo de questão.');
  const qtd = Math.max(1, Math.min(60, Math.round(Number(d.quantidade) || 10)));
  const dif = ['facil', 'medio', 'dificil', 'misto'].indexOf(d.dificuldade) >= 0 ? d.dificuldade : 'misto';
  log_(u, 'banco_montar', disc + ': ' + assuntos.length + ' assunto(s), ' + qtd + ' questões');
  return { __banco: { acao: 'montar', chave: chave, disciplina: disc, assuntos: assuntos, tipos: tipos, quantidade: qtd, dificuldade: dif, incluirTexto: d.incluirTexto !== false } };
});
// Biblioteca de estudos do aluno: só os textos de apoio (sem questões, sem gabarito)
rota_('bibliotecaIndice', ALU, false, () => ({ __banco: { acao: 'indice', chave: bancoChave_() } }));
rota_('bibliotecaTexto', ALU, false, (u, d) => ({ __banco: { acao: 'texto', chave: bancoChave_(), disciplina: txt_(d.disciplina, 40), assunto: Number(d.assunto), videos: videosCfg_() } }));
