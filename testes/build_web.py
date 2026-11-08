"""Gera as telas para hospedagem web (GitHub Pages) a partir do Index.html testado."""
import sys
API = sys.argv[1] if len(sys.argv) > 1 else '/api'
h = open('/home/claude/plataforma/src/Index.html').read()
def troca(a, b):
    global h
    assert a in h, a[:80]
    h = h.replace(a, b)
troca('<base target="_top">\n', '')
troca('<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">',
      '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">\n<meta name="theme-color" content="#2f5bea">\n<meta name="description" content="Sala Digital – ambiente virtual de aprendizagem">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icone.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="icone-180.png">\n<meta name="apple-mobile-web-app-capable" content="yes">')
# chamada ao servidor: HTTPS para a função do Supabase
troca("""function api(acao,d){
  return new Promise((res,rej)=>{
    if(!window.google||!google.script){rej(new Error('Abra a plataforma pelo endereço publicado.'));return}
    google.script.run.withSuccessHandler(r=>{
      if(r&&r.ok)return res(r.d);
      if(r&&r.sessao){sairLocal();toast('Sua sessão expirou. Entre novamente.')}
      if(r&&r.trocar){S.u&&(S.u.trocarSenha=true);go('trocarSenha')}
      rej(new Error((r&&r.erro)||'Erro inesperado.'))
    }).withFailureHandler(()=>rej(new Error('Falha de conexão. Verifique a internet e tente de novo.'))).api(S.token||'',acao,d||{});
  });
}""", """const API_URL='""" + API + """';
async function api(acao,d){
  let r;
  for(let tent=0;tent<2;tent++){
    try{const resp=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:S.token||'',acao,d:d||{}})});
      r=await resp.json();break}
    catch(e){if(tent===1)throw new Error('Falha de conexão. Verifique a internet e tente de novo.');await new Promise(z=>setTimeout(z,900))}
  }
  if(r&&r.ok)return r.d;
  if(r&&r.sessao){sairLocal();toast('Sua sessão expirou. Entre novamente.')}
  if(r&&r.trocar){S.u&&(S.u.trocarSenha=true);go('trocarSenha')}
  throw new Error((r&&r.erro)||'Erro inesperado.');
}""")
# recuperação de senha: pelo professor/administrador
troca("""  else if(authModo==='recuperar')corpo=`<p class="muted" style="margin-top:0">Informe seu usuário ou e-mail. Enviaremos um código para o e-mail cadastrado (ou do responsável).</p>
    <form id="fRec"><label>Usuário ou e-mail<input name="login" autocapitalize="none" required></label><div class="err" id="err"></div><button class="btn pri full">Enviar código</button></form>
    <div class="center" style="margin-top:10px"><button class="lnk" data-a="authModo" data-m="redefinir">Já tenho o código</button></div>`;""",
"""  else if(authModo==='recuperar')corpo=`<h3 style="margin-bottom:10px">Esqueceu a senha?</h3><div class="info">🎒 <b>Aluno:</b> peça ao seu professor. Na turma, ele toca em <b>Nova senha</b> e te passa uma senha provisória.</div>
    <div class="info">👨‍🏫 <b>Professor:</b> peça ao administrador da escola (Usuários → Nova senha).</div><p class="small muted">No primeiro acesso com a senha provisória, você cria uma senha nova só sua.</p>`;""")
# exportação: baixar arquivos CSV
troca("""ACOES.exportar=async(d,b)=>{await busy(b,async()=>{try{const r=await api('exportarPlanilha');modal(`<div class="hd"><h2>Relatórios exportados ✓</h2><button class="x" data-a="fechar">✕</button></div><p>Foram atualizadas as abas <b>Rel_Turmas</b>, <b>Rel_Disciplinas</b>, <b>Rel_Alunos</b> e <b>Rel_Notas</b> na planilha da plataforma.</p><a class="btn pri full" href="${esc(r.url)}" target="_blank" rel="noopener">Abrir planilha</a>`)}catch(e){toast(e.message)}})};""",
"""ACOES.exportar=async(d,b)=>{await busy(b,async()=>{try{const r=await api('exportarPlanilha');
  modal(`<div class="hd"><h2>Baixar relatórios</h2><button class="x" data-a="fechar">✕</button></div><p>Arquivos CSV (abrem no Excel e no Google Planilhas):</p><div class="list">${r.arquivos.map(f=>`<a class="btn full" download="${esc(f.nome)}" href="${URL.createObjectURL(new Blob([f.csv],{type:'text/csv;charset=utf-8'}))}">⬇️ ${esc(f.nome)}</a>`).join('')}</div>`)}catch(e){toast(e.message)}})};""")
troca('📤 Exportar para a planilha', '⬇️ Baixar relatórios (CSV)')
troca('ou exporte para a planilha (abas Rel_Turmas, Rel_Disciplinas, Rel_Alunos e Rel_Notas).', 'ou baixe os relatórios em CSV (turmas, disciplinas, alunos e notas).')
troca('Backup automático diário (mantém 30 dias) na pasta "Sala Digital - Arquivos" do Drive do administrador.', 'Cópia de segurança automática diária no banco de dados (mantém 30 dias).')
troca('sessões que expiram, bloqueio após tentativas erradas, registro de ações importantes e cópia de segurança diária.', 'conexão criptografada (HTTPS), sessões que expiram, bloqueio após tentativas erradas, registro de ações importantes e cópia de segurança diária.')
# registro como "app" (tela inicial do celular)
troca('/* =================== INÍCIO =================== */', """/* =================== INÍCIO =================== */
if('serviceWorker' in navigator){window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{})})}""")
# não redesenha a tela de troca de senha se ela já está aberta (evita apagar o que foi digitado)
troca("if(r&&r.trocar){S.u&&(S.u.trocarSenha=true);go('trocarSenha')}", "if(r&&r.trocar){S.u&&(S.u.trocarSenha=true);if(S.view!=='trocarSenha')go('trocarSenha')}")
# ---- Inteligência Artificial ----
troca("  const u=S.u;const menu=MENUS[u.perfil]||[];", "  const u=S.u;const menu=(MENUS[u.perfil]||[]).filter(([k])=>(k!=='p_ia'||S.iaAtiva)&&(k!=='a_tutor'||S.iaTutor));")
troca("function entrou(r){S.token=r.token;", "function entrou(r){S.iaAtiva=false;setTimeout(iaVerificar,50);S.token=r.token;")
troca("  if(S.token){try{const r=await api('eu');S.u=r.usuario;S.cfg=r.cfg}catch(e){S.token=null;LS.del('sd_token')}}", "  if(S.token){try{const r=await api('eu');S.u=r.usuario;S.cfg=r.cfg;iaVerificar()}catch(e){S.token=null;LS.del('sd_token')}}")
troca("  ED={a:JSON.parse(JSON.stringify(a)),turmas,abrirApoio:{}};",
      "  if(p.ia&&S.rascunhoIA){Object.assign(a,{titulo:S.rascunhoIA.titulo,disciplina:S.rascunhoIA.disciplina||a.disciplina,instrucoes:S.rascunhoIA.instrucoes,questoes:JSON.parse(JSON.stringify(S.rascunhoIA.questoes))})}\n  ED={a:JSON.parse(JSON.stringify(a)),turmas,abrirApoio:{},ia:(p.ia&&S.rascunhoIA)||null};")
troca('''  <div class="card"><label>Título<input data-e="titulo"''','''  ${ED.ia&&ED.ia.origem==='banco'?`<div class="info">📚 <b>${ED.a.questoes.length} questões do Banco de Atividades</b>${ED.ia.pedidas>ED.a.questoes.length?` (só havia ${ED.a.questoes.length} com esses filtros)`:''}. Revise, ajuste o que quiser, escolha a turma e salve ou publique.</div>`:ED.ia?`<div class="info">✨ <b>${ED.a.questoes.length} questões geradas pela IA</b>${ED.ia.pedidas&&ED.ia.pedidas>ED.a.questoes.length?` (de ${ED.ia.pedidas} pedidas)`:''}. Revise com atenção, corrija o que precisar, escolha a turma e salve ou publique.${ED.ia.custo?` Custo desta geração: US$ ${ED.ia.custo.toFixed(3)}.`:''}</div>`:''}
  <div class="card"><label>Título<input data-e="titulo"''')
troca("  if(a.instrucoes)h+=`<div class=\"apoio\">${linkify(a.instrucoes)}</div>`;",
      "  if(a.instrucoes)h+=`<div class=\"apoio\">${linkify(a.instrucoes)}</div>`;\n  if(S.iaTutor)h+=`<button class=\"btn sm\" style=\"margin-bottom:12px\" data-go=\"a_tutor\" data-p=\"${P({atividade:a.id})}\">🤖 Pedir ajuda ao Tutor IA</button>`;")
troca('/* =================== INÍCIO =================== */', open('/home/claude/supa/web_ia.js').read() + '\n' + open('/home/claude/supa/web_banco.js').read() + '\n/* =================== INÍCIO =================== */')
open('/home/claude/supa/web/index.html', 'w').write(h)
print('ok', API)
