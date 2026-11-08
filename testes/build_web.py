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
troca('/* =================== INÍCIO =================== */', open('/home/claude/supa/web_ia.js').read() + '\n' + open('/home/claude/supa/web_banco.js').read() + '\n' + open('/home/claude/supa/web_desafio.js').read() + '\n' + open('/home/claude/supa/web_pdf.js').read() + '\n' + open('/home/claude/supa/web_tema.js').read() + '\n/* =================== INÍCIO =================== */')
# ---- Desafio diário e área única de atividades ----
troca('</style>', """.hub{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px;padding:4px;background:#eef1f7;border-radius:16px}
.hub button{flex:none;border:0;background:transparent;border-radius:12px;padding:10px 14px;font-weight:800;font-size:14px;cursor:pointer;color:var(--mut)}
.hub button.on{background:#fff;color:var(--ink);box-shadow:var(--sh)}.hub .novo{background:var(--pri);color:#fff}
.desafio{background:linear-gradient(135deg,#2f5bea,#7b4dff);color:#fff;border-radius:var(--r);padding:18px;margin-bottom:16px;box-shadow:var(--sh)}
.desafio p{margin:6px 0;opacity:.95}.desafio .small{opacity:.9}.desafio .pill{background:rgba(255,255,255,.2);color:#fff;margin-left:6px}
.desafio .btn{margin-top:10px}.desafio .btn:not(.pri){background:#fff;color:var(--ink)}.desafio .btn.pri{background:#fff;color:#2f5bea}
.desafio .bar{background:rgba(255,255,255,.3)}.desafio .bar i{background:#fff}
.dz-t{font-size:19px;font-weight:900}.dz-cd{font-size:16px;font-weight:800;margin-top:8px}.cd{font-variant-numeric:tabular-nums;font-weight:900}.cd.urg{color:#ffd166}
.dz-placar{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0;font-weight:800}.dz-placar span{background:rgba(255,255,255,.18);padding:5px 10px;border-radius:20px}
.card .dz-placar span,.modal .dz-placar span{background:#eef1f7}.ok{color:var(--ok)}.bad{color:var(--bad)}.desafio .ok,.desafio .bad{color:#fff}
.dz-barra{position:sticky;top:0;z-index:5;background:var(--warnb);color:var(--warn);border-radius:12px;padding:10px 14px;margin-bottom:12px;font-weight:800;box-shadow:var(--sh)}.dz-barra .cd.urg{color:var(--bad)}
</style>""")
troca('</style>', """.pv-folha{background:#fff;border:1px solid #d9dde8;border-radius:14px;padding:22px;margin-bottom:16px;box-shadow:0 2px 0 #e9ecf3,0 8px 24px rgba(20,30,60,.06)}
.pv-capa{border-top:6px solid var(--pri);text-align:left}.pv-tit{font-size:24px;font-weight:900;letter-spacing:.5px;color:var(--ink)}.pv-sub{color:var(--mut);font-weight:700;margin-top:2px}
.pv-cab{background:#fff;border:2px solid var(--ink);border-radius:12px;padding:16px 18px;margin-bottom:14px}
.pv-topo{display:flex;gap:12px;align-items:center;border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:10px}
.pv-logo{width:46px;height:46px;border-radius:12px;background:var(--pri);display:grid;place-items:center;font-size:24px;flex:none}
.pv-escola{font-size:12px;font-weight:800;color:var(--mut);text-transform:uppercase;letter-spacing:1px}
.pv-campos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 14px;margin-top:12px}
.pv-campos div{border-bottom:1px dashed #cdd3e0;padding-bottom:4px;min-width:0}.pv-campos span{display:block;font-size:11px;font-weight:800;color:var(--mut);text-transform:uppercase;letter-spacing:.5px}
.pv-campos b{font-size:15px;overflow-wrap:anywhere}
.pv-est{font-weight:800;margin-top:14px}.pv-cd{font-size:18px;font-weight:900;margin-top:8px;color:var(--pri)}.pv-btn{width:100%;margin-top:16px;min-height:54px;font-size:16px;letter-spacing:.5px}
.pv-vazio{text-align:center;background:#fff;border:1px dashed #cdd3e0;border-radius:14px;padding:30px 18px;margin-bottom:16px}
.pv-resumo{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:10px;color:var(--mut)}.pv-resumo b{color:var(--ink);font-size:18px}
.pv-outras{display:block;width:100%;text-align:left;background:transparent;border:1px solid var(--line);border-radius:12px;padding:14px;margin-top:18px;font-weight:700;color:var(--mut);cursor:pointer}
.pv-instr{padding-left:20px;line-height:1.6}.pv-instr li{margin-bottom:6px}
.pv-tab{width:100%;border-collapse:collapse;margin:10px 0}.pv-tab th,.pv-tab td{border:1px solid #d9dde8;padding:8px 10px;text-align:left}.pv-tab th{background:#f3f5fa;font-size:13px}
.pv-barra{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--ink);color:#fff;border-radius:12px;padding:10px 14px;margin-bottom:12px;box-shadow:var(--sh)}
.pv-relogio{font-size:20px;font-weight:900;font-variant-numeric:tabular-nums}.pv-relogio .cd.urg,.pv-relogio [data-cd].urg{color:#ffd166}.pv-cont{flex:1;font-size:14px}.pv-barra .btn{background:#fff;color:var(--ink);margin:0}
.pv-grade{display:grid;grid-template-columns:1fr;gap:14px}@media(min-width:900px){.pv-grade{grid-template-columns:1fr 290px}.pv-dir{display:block!important;position:sticky;top:76px;align-self:start}}
.pv-dir{display:none;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px}.pv-dir.aberto{display:block}
.pv-disc{background:#eef2ff;color:var(--pri);font-weight:900;letter-spacing:.5px;border-radius:10px;padding:10px 14px;margin:14px 0 10px}.pv-disc span{float:right;font-size:12px;color:var(--mut);font-weight:700;letter-spacing:0}
.pv-nav{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0}.pv-nav .btn{margin:0;min-height:48px;min-width:120px}.pv-num{font-weight:800;color:var(--mut);text-align:center}
.pv-mapa-t{font-weight:900;margin-bottom:6px}.pv-mapa-d{font-size:12px;font-weight:800;color:var(--mut);margin:10px 0 4px}
.pv-mapa-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(38px,1fr));gap:6px}
.pv-mapa-g button{height:38px;border-radius:8px;border:1.5px solid #cdd3e0;background:#fff;font-weight:800;cursor:pointer}
.pv-mapa-g button.ok{background:var(--ok);border-color:var(--ok);color:#fff}.pv-mapa-g button.at{outline:3px solid var(--pri);outline-offset:1px}
.pv-leg{font-size:12px;color:var(--mut);margin-top:10px}.pv-leg .ok{color:var(--ok)}
.pv-final{display:block;width:100%;min-height:56px;font-size:17px;font-weight:900;letter-spacing:.5px;background:var(--ok);color:#fff;border:0;margin-top:16px}
.pv-res{text-align:center}.pv-opcoes{display:grid;gap:10px;grid-template-columns:1fr;margin-top:6px}@media(min-width:700px){.pv-opcoes{grid-template-columns:1fr 1fr}}.pv-opcoes .pv-btn{margin-top:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:74px}.pv-opcoes small{font-size:12px;font-weight:600;opacity:.85;letter-spacing:0;margin-top:3px}.pv-imprimir{border:2px solid var(--ink)}.pv-mini{padding:10px 14px;font-size:14px;line-height:1.4}@media(min-width:900px){[data-a=provaMapa]{display:none}}.pv-dias{display:flex;gap:6px;flex-wrap:wrap;margin:-2px 0 12px}.pv-dias label{margin:0}.pv-dias input{display:none}
.pv-dias span{display:inline-block;padding:7px 11px;border:1.5px solid var(--line);border-radius:20px;font-weight:800;cursor:pointer}.pv-dias input:checked+span{background:var(--ink);color:#fff;border-color:var(--ink)}
</style>""")
troca('</style>', """body{background:linear-gradient(180deg,#f3f6ff 0,#f6f3ff 50%,#f2fbf7 100%) fixed}
#app{background:url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27220%27%20height%3D%27220%27%20viewBox%3D%270%200%20220%20220%27%3E%3Cg%20fill%3D%27none%27%20stroke%3D%27%232f5bea%27%20stroke-opacity%3D%27.07%27%20stroke-width%3D%272%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M20%2040%20l30%20-6%20l0%2022%20l-30%206z%20M50%2034%20l30%206%20l0%2022%20l-30%20-6%27/%3E%3Cpath%20d%3D%27M150%2030%20l40%200%20M150%2030%20l-6%204%20l6%204%20M190%2030%20l4%204%20l-4%204%27/%3E%3Ccircle%20cx%3D%27170%27%20cy%3D%27150%27%20r%3D%2716%27/%3E%3Cpath%20d%3D%27M154%20150%20h32%20M170%20134%20q10%2016%200%2032%20q-10%20-16%200%20-32%27/%3E%3Cpath%20d%3D%27M40%20160%20l6%2012%20l13%202%20l-10%209%20l3%2013%20l-12%20-7%20l-12%207%20l3%20-13%20l-10%20-9%20l13%20-2z%27/%3E%3Cpath%20d%3D%27M100%20100%20q10%20-14%2020%200%20q-10%2014%20-20%200%27/%3E%3Cpath%20d%3D%27M96%20190%20h22%20M107%20180%20v20%27/%3E%3C/g%3E%3C/svg%3E") repeat;min-height:100vh}
.top{background:rgba(255,255,255,.85)}
/* cabeçalho de cada tela: faixa colorida com ilustração */
.ph-tema{position:relative;overflow:hidden;border-radius:22px;padding:22px 190px 22px 22px;min-height:132px;align-items:center;box-shadow:0 10px 30px rgba(47,91,234,.08);border:1px solid rgba(255,255,255,.7);isolation:isolate}
.ph-tema>div:not(.ph-ilu):not(.ph-bolhas){position:relative;z-index:2}.ph-tema>.btn,.ph-tema>button,.ph-tema>a{position:relative;z-index:2}
.ph-tema h1{font-size:26px}.ph-ilu{position:absolute;right:10px;bottom:0;width:180px;height:136px;z-index:1;pointer-events:none}.ph-ilu svg{width:100%;height:100%}
.ph-bolhas{position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(circle at 92% 18%,rgba(255,255,255,.7) 0 34px,transparent 35px),radial-gradient(circle at 70% 110%,rgba(255,255,255,.5) 0 60px,transparent 61px),radial-gradient(circle at 4% 100%,rgba(255,255,255,.45) 0 28px,transparent 29px)}
.tema-azul{background:linear-gradient(120deg,#e3ebff,#d4e4ff)}.tema-azul2{background:linear-gradient(120deg,#e0f2ff,#d8f3f1)}.tema-verde{background:linear-gradient(120deg,#dcf7ea,#e6f7d9)}
.tema-laranja{background:linear-gradient(120deg,#fff0de,#ffe3dc)}.tema-amarelo{background:linear-gradient(120deg,#fff6d6,#ffeccf)}.tema-roxo{background:linear-gradient(120deg,#efe8ff,#e6e3ff)}
.tema-rosa{background:linear-gradient(120deg,#ffe8ef,#fbe7ff)}.tema-cinza{background:linear-gradient(120deg,#eef1f7,#e6ebf5)}
@media(max-width:600px){.ph-tema{padding:18px 112px 18px 16px;min-height:110px;border-radius:18px}.ph-tema h1{font-size:21px}.ph-tema p{font-size:14px}.ph-ilu{width:112px;height:92px;right:2px}}
/* ícones das matérias, turmas, provas e atividades */
.ic-tema{border-radius:14px!important;box-shadow:inset 0 -3px 0 rgba(0,0,0,.08)}
.ic-azul{background:#dbe7ff!important}.ic-azul2{background:#d6f1ff!important}.ic-verde{background:#d5f5e3!important}.ic-roxo{background:#ece4ff!important}.ic-laranja{background:#ffe6d1!important}
.ic-amarelo{background:#fff1c4!important}.ic-rosa{background:#ffe0ea!important}.ic-indigo{background:#e0e3ff!important}.ic-teal{background:#d2f4ef!important}
.it{transition:transform .15s ease,box-shadow .15s ease}.it:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(30,40,80,.1)}
.card{border-radius:18px}
/* indicadores coloridos */
.stat-tema{position:relative;overflow:hidden;border:0!important}.stat-tema::after{content:"";position:absolute;right:-18px;top:-18px;width:70px;height:70px;border-radius:50%;background:rgba(255,255,255,.55)}
.stat-azul{background:linear-gradient(135deg,#e3ebff,#f4f7ff)!important}.stat-verde{background:linear-gradient(135deg,#dcf7ea,#f3fcf7)!important}.stat-laranja{background:linear-gradient(135deg,#fff0de,#fff9f2)!important}.stat-roxo{background:linear-gradient(135deg,#efe8ff,#f8f5ff)!important}
/* estados vazios ilustrados */
.e-ilu{width:110px;height:110px;margin:0 auto 6px}.e-ilu svg{width:100%;height:100%}
.empty{background:linear-gradient(180deg,#fff,#f7f9ff)}
/* menu com ícones em bolinhas */
.nav .ni{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:10px;font-size:16px;flex:none}.nav button.on .ni{box-shadow:0 0 0 2px rgba(255,255,255,.35)}
.nav button{transition:background .15s}.nav button:not(.on):hover{background:rgba(47,91,234,.07)}
/* prova do dia */
.pv-capa{position:relative;overflow:hidden;background:linear-gradient(180deg,#fff 0,#fff 60%,#fbfcff 100%)}.pv-ilu{position:absolute;top:8px;right:6px;width:120px;height:92px;pointer-events:none;opacity:.95}.pv-ilu svg{width:100%;height:100%}
.pv-capa .pv-tit,.pv-capa .pv-sub{padding-right:118px}.pv-cab{background:linear-gradient(180deg,#fff,#fbfcff)}
/* tela de entrada */
.auth{gap:28px;align-content:center}.auth-heroi{position:relative;width:100%;max-width:460px;text-align:center}
.ah-ilu{width:100%;max-width:300px;margin:0 auto}.ah-ilu2{position:absolute;width:150px;right:-10px;bottom:46px}.ah-ilu svg,.ah-ilu2 svg{width:100%;height:auto}
.ah-txt b{display:block;font-size:24px;font-weight:900;color:var(--ink)}.ah-txt span{color:var(--mut);font-weight:700}
.flut{position:absolute;font-size:26px;animation:flutuar 4s ease-in-out infinite}.f1{left:4%;top:8%}.f2{right:8%;top:2%;animation-delay:.8s}.f3{left:0;top:52%;animation-delay:1.6s}.f4{right:2%;top:40%;animation-delay:.4s}.f5{left:22%;bottom:22%;animation-delay:2s}
@media(min-width:900px){.auth{grid-template-columns:minmax(0,480px) 440px;justify-content:center}.auth-heroi{max-width:480px}}
@media(max-width:899px){.ah-ilu{max-width:210px}.ah-ilu2{width:100px;right:4%;bottom:52px}.ah-txt b{font-size:20px}.flut{font-size:20px}}
/* mascote com dicas (só no computador, com espaço livre) */
#mascote{position:fixed;left:max(14px,calc(50vw - 606px));bottom:14px;width:190px;z-index:5;display:none;text-align:center;pointer-events:none}
#mascote svg{width:96px;height:96px}#mascote .nome{font-size:11px;font-weight:800;color:var(--mut)}
#mascote .balao{background:#fff;border:1px solid var(--line);border-radius:14px;padding:9px 11px;font-size:12.5px;font-weight:700;color:var(--ink);box-shadow:var(--sh);position:relative;margin-bottom:8px;text-align:left}
#mascote .balao::after{content:"";position:absolute;left:50%;bottom:-7px;width:12px;height:12px;background:#fff;border-right:1px solid var(--line);border-bottom:1px solid var(--line);transform:translateX(-50%) rotate(45deg)}
#mascote .balao.troca{animation:surgir .5s ease}
@media(min-width:900px) and (min-height:820px){#mascote{display:block}}
.sec-t{margin:20px 0 10px;font-size:18px}.atalhos{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}@media(min-width:900px){.atalhos{grid-template-columns:repeat(4,1fr)}}
.atalho{border:0;border-radius:20px;padding:12px 12px 14px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:2px;box-shadow:0 6px 18px rgba(30,40,80,.07);transition:transform .15s}.atalho:hover{transform:translateY(-3px)}
.at-ilu{display:block;height:84px}.at-ilu svg{width:100%;height:100%}.atalho b{font-size:15px;color:var(--ink)}.atalho small{color:var(--mut);font-weight:700}
.frase{display:flex;gap:12px;align-items:center;background:#fff;border-radius:20px;padding:12px 16px;margin-top:16px;box-shadow:0 6px 18px rgba(30,40,80,.06)}.fr-ilu{width:64px;height:64px;flex:none}.fr-ilu svg{width:100%;height:100%}.frase p{margin:2px 0 0;color:var(--mut);font-weight:700}
/* biblioteca */
.bib-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.bib-mat{border:0;border-radius:20px;padding:18px 12px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;box-shadow:0 6px 18px rgba(30,40,80,.07);transition:transform .15s}.bib-mat:hover{transform:translateY(-3px) rotate(-1deg)}
.bib-mat .bm-ic{font-size:38px;animation:flutuar 5s ease-in-out infinite}.bib-mat b{font-size:15px;color:var(--ink)}.bib-mat small{color:var(--mut);font-weight:700}.bib-mat[disabled]{opacity:.5;cursor:default}
.bib-texto{white-space:pre-wrap;font-size:16px;line-height:1.65}
/* animações leves (só transform/opacity) */
@keyframes flutuar{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes brilho{0%,100%{opacity:.25;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}
@keyframes pagina{0%,70%,100%{transform:scaleX(1)}35%{transform:scaleX(-1)}}
@keyframes lapis{0%,100%{transform:translate(0,0)}25%{transform:translate(-8px,2px)}50%{transform:translate(-16px,-1px)}75%{transform:translate(-8px,1px)}}
@keyframes piscar{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@keyframes cursor{0%,50%{opacity:1}51%,100%{opacity:0}}
@keyframes mundo{from{transform:translateX(0)}to{transform:translateX(-80px)}}
@keyframes braco{0%,100%{transform:rotate(0)}50%{transform:rotate(-14deg)}}
@keyframes barra{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.75)}}
@keyframes check{0%,15%{stroke-dashoffset:30}45%,100%{stroke-dashoffset:0}}
@keyframes girar{to{transform:rotate(360deg)}}@keyframes girar2{to{transform:rotate(-360deg)}}
@keyframes surgir{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.a-flut{animation:flutuar 4s ease-in-out infinite}
.a-brilho{transform-box:fill-box;transform-origin:center;animation:brilho 2.6s ease-in-out infinite}
.a-pag{transform-box:fill-box;transform-origin:left center;animation:pagina 5s ease-in-out infinite}
.a-lapis{animation:lapis 2.2s ease-in-out infinite}
.a-pisca{transform-box:fill-box;transform-origin:center;animation:piscar 5s infinite}
.a-cursor{animation:cursor 1s steps(1) infinite}.a-mundo{animation:mundo 9s linear infinite}
.a-braco,.a-braco2{transform-box:fill-box;transform-origin:bottom;animation:braco 2.4s ease-in-out infinite}.a-braco2{transform-origin:left bottom}
.a-barra{transform-box:fill-box;transform-origin:bottom;animation:barra 3s ease-in-out infinite}
.a-check{stroke-dasharray:30;animation:check 3.6s ease-out infinite}.a-gira{animation:girar 9s linear infinite}.a-gira2{animation:girar2 6s linear infinite}
.a-ponteiro{transform-box:view-box;transform-origin:0 0;animation:girar 12s linear infinite}
main>*:first-child{animation:surgir .35s ease}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
</style>""")
troca("const A=await api('atividades');const f=p.f||'todas';", "const A=(await api('atividades')).filter(a=>a.tipo!=='desafio');const f=p.f||'todas';")
troca("Object.entries(TIPO).map(([k,v])=>`<option value=\"${k}\" ${a.tipo===k?'selected':''}>${v}</option>`)", "Object.entries(TIPO).filter(([k])=>k!=='desafio'||a.tipo==='desafio').map(([k,v])=>`<option value=\"${k}\" ${a.tipo===k?'selected':''}>${v}</option>`)")
troca('<span class="qtag">${TIPOQ[q.tipo]}</span>', '<span class="qtag">${TIPOQ[q.tipo]}</span>${q.disciplina?`<span class="qtag">${ic(q.disciplina)} ${esc(q.disciplina)}</span>`:\'\'}')
troca("const lib=enviado&&e.status==='corrigida'&&e.correcao;", "const lib=enviado&&e.correcao&&(e.status==='corrigida'||a.tipo==='desafio');")
troca("else if(enviado)h+=`<div class=\"msg\">📨 Atividade enviada! A nota aparecerá aqui quando o professor liberar a correção.</div>`;",
      "else if(enviado)h+=a.tipo==='desafio'?`<div class=\"msg\">📨 Desafio enviado! O gabarito com as explicações aparece ${a.encerramento>Date.now()?'depois do encerramento ('+quando(a.encerramento)+')':'quando o professor liberar'}.</div>`:`<div class=\"msg\">📨 Atividade enviada! A nota aparecerá aqui quando o professor liberar a correção.</div>`;")
troca("<button class=\"btn sm\" style=\"margin-top:12px\" data-a=\"pedirRevisao\">Pedir revisão da nota</button>`}</div>`}",
      "<button class=\"btn sm\" style=\"margin-top:12px\" data-a=\"pedirRevisao\">Pedir revisão da nota</button>`}${a.tipo==='desafio'&&e.status!=='corrigida'?'<div class=\"info\" style=\"margin-top:10px\">✍️ As questões discursivas ainda serão corrigidas pelo professor. A nota final aparece depois.</div>':''}</div>`}")
troca("<h2>Atividade enviada!</h2><p class=\"muted\">Recebemos sua atividade em <b>${fdh(r.enviadoEm)}</b>.${r.atrasada?'<br>(entrega após o prazo)':''}</p>",
      "<h2>${r.resultado?'Desafio enviado!':'Atividade enviada!'}</h2><p class=\"muted\">Recebemos sua atividade em <b>${fdh(r.enviadoEm)}</b>.${r.atrasada?'<br>(entrega após o prazo)':''}</p>${resultadoDesafioHtml(r.resultado)}")

open('/home/claude/supa/web/index.html', 'w').write(h)
print('ok', API)
