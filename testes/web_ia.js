/* =================== INTELIGÊNCIA ARTIFICIAL =================== */
MENUS.professor.splice(3,0,['p_ia','✨','Gerar com IA']);
MENUS.admin.splice(4,0,['p_ia','✨','Gerar com IA']);
MENUS.admin.splice(MENUS.admin.length-1,0,['ad_ia','🤖','IA: uso e custos']);
MENUS.aluno.splice(4,0,['a_tutor','🤖','Tutor IA']);
function mdSimples(t){return esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/^\s*[-•]\s+/gm,'• ').replace(/\n/g,'<br>')}
function lerArquivo(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('Não foi possível ler '+f.name));r.readAsDataURL(f)})}

/* ---- PROFESSOR: gerar atividade por foto/PDF ---- */
let GER={arquivos:[]};
VIEWS.p_ia=async function(){
  const st=await api('iaStatus').catch(()=>null);
  const lista=()=>GER.arquivos.map((a,i)=>`<div class="ft" style="width:110px;height:110px">${a.tipo==='pdf'?`<div style="display:grid;place-items:center;height:100%;font-size:13px;font-weight:800;text-align:center;padding:6px">📄<br>${esc(a.nome.slice(0,28))}</div>`:`<img src="${a.url}">`}<button class="x" data-a="iaRm" data-i="${i}">✕</button></div>`).join('');
  return {html:`<div class="ph"><div><h1>✨ Gerar atividade com IA</h1><p>Fotografe páginas do livro ou envie PDFs. A IA lê o conteúdo e cria as questões com gabarito. Você revisa antes de publicar.</p></div></div>
  ${st&&!st.ativa?'<div class="note">A IA está desligada nas configurações da plataforma.</div>':''}
  ${st?`<div class="info">Usos hoje: <b>${st.usados}</b> de ${st.limite}.</div>`:''}
  <div class="card"><h3 style="margin-bottom:10px">1. Material</h3>
   <div class="fbtns" style="margin-top:0"><label class="btn" style="margin:0">📷 Tirar foto<input type="file" accept="image/*" capture="environment" data-iaf="img" hidden></label>
   <label class="btn" style="margin:0">🖼️ Fotos da galeria<input type="file" accept="image/*" multiple data-iaf="img" hidden></label>
   <label class="btn" style="margin:0">📄 PDF<input type="file" accept="application/pdf" multiple data-iaf="pdf" hidden></label></div>
   <div class="fotos" id="iaLista">${lista()}</div>
   <label style="margin-top:12px">Ou cole um texto <span class="opt">(opcional)</span><textarea id="iaTexto" rows="3" placeholder="Cole aqui um trecho do livro, resumo da aula…">${esc(GER.texto||'')}</textarea></label>
   <p class="small muted" style="margin:0">Até 12 arquivos • fotos são comprimidas automaticamente • PDF até 10 MB</p></div>
  <div class="card"><h3 style="margin-bottom:10px">2. Como devem ser as questões</h3>
   <div class="row2"><label>Quantidade<select id="iaQtd">${[5,10,15,20,30].map(n=>`<option ${n===(GER.qtd||10)?'selected':''}>${n}</option>`).join('')}</select></label>
   <label>Dificuldade<select id="iaDif"><option value="facil">Fácil</option><option value="medio" selected>Média</option><option value="dificil">Difícil</option><option value="misto">Misturada</option></select></label></div>
   <label>Tipos de questão</label><div style="display:flex;gap:14px;flex-wrap:wrap;margin:-4px 0 12px">
    <label class="chk" style="margin:0"><input type="checkbox" class="iaTipo" value="mc" checked><span>Múltipla escolha</span></label>
    <label class="chk" style="margin:0"><input type="checkbox" class="iaTipo" value="vf" checked><span>Verdadeiro ou falso</span></label>
    <label class="chk" style="margin:0"><input type="checkbox" class="iaTipo" value="disc"><span>Discursiva</span></label></div>
   <div class="row2"><label>Disciplina<input id="iaDisc" list="dlDia" placeholder="Ex.: Ciências" value="${esc(GER.disc||'')}"></label><label>Série / nível<input id="iaSerie" placeholder="Ex.: 6º ano" value="${esc(GER.serie||'')}"></label></div>
   <datalist id="dlDia">${Object.keys(DISC_IC).map(x=>`<option value="${esc(x)}">`).join('')}</datalist>
   <label>Orientações para a IA <span class="opt">(opcional)</span><input id="iaObs" placeholder="Ex.: foco no ciclo da água; linguagem simples" value="${esc(GER.obs||'')}"></label></div>
  <div class="err" id="iaErr"></div>
  <button class="btn pri full" data-a="iaGerar" style="min-height:52px;font-size:17px">✨ Gerar questões</button>
  <p class="small muted center">As questões geradas abrem no editor para você revisar, editar e então salvar ou publicar.</p>`,
  depois(){
    $$('[data-iaf]').forEach(inp=>inp.addEventListener('change',async()=>{
      for(const f of [...inp.files]){
        if(GER.arquivos.length>=12){toast('Máximo de 12 arquivos.');break}
        try{
          if(inp.dataset.iaf==='pdf'){if(f.size>10*1024*1024){toast(f.name+': PDF maior que 10 MB');continue}GER.arquivos.push({tipo:'pdf',nome:f.name,url:await lerArquivo(f)})}
          else GER.arquivos.push({tipo:'img',nome:f.name,url:await comprimir(f)})
        }catch(e){toast(e.message)}
      }
      inp.value='';$('#iaLista').innerHTML=lista();
    }));
  }};
};
ACOES.iaRm=d=>{GER.arquivos.splice(+d.i,1);render()};
ACOES.iaGerar=async(d,b)=>{
  $('#iaErr').textContent='';
  GER.texto=$('#iaTexto').value;GER.qtd=+$('#iaQtd').value;GER.disc=$('#iaDisc').value;GER.serie=$('#iaSerie').value;GER.obs=$('#iaObs').value;
  const tipos=$$('.iaTipo').filter(x=>x.checked).map(x=>x.value);
  if(!GER.arquivos.length&&!GER.texto.trim()){$('#iaErr').textContent='Envie pelo menos uma foto, um PDF ou cole um texto.';return}
  if(!tipos.length){$('#iaErr').textContent='Escolha pelo menos um tipo de questão.';return}
  modal(`<div class="center"><div class="spin" style="margin:20px auto"></div><h2>A IA está lendo o material…</h2><p class="muted">Isso costuma levar de 20 segundos a 1 minuto. Não feche esta tela.</p></div>`);
  try{
    const r=await api('iaGerarQuestoes',{arquivos:GER.arquivos.map(a=>a.url),texto:GER.texto,quantidade:GER.qtd,dificuldade:$('#iaDif').value,tipos,disciplina:GER.disc,serie:GER.serie,observacoes:GER.obs});
    fechar();
    S.rascunhoIA={titulo:r.titulo,disciplina:r.disciplina||GER.disc,instrucoes:r.resumo||'',questoes:r.questoes,custo:r.custoUSD,pedidas:r.pedidas};
    GER={arquivos:[]};toast(r.questoes.length+' questões geradas ✓');go('p_editor',{ia:1});
  }catch(e){fechar();$('#iaErr').textContent=e.message;toast(e.message)}
};

/* ---- ALUNO: tutor ---- */
let TUT={msgs:[],ativ:'',img:null};
VIEWS.a_tutor=async function(p){
  if(p&&p.atividade)TUT.ativ=p.atividade;
  const [d,st]=await Promise.all([alunoDados(),api('iaStatus').catch(()=>null)]);
  const ops=d.atividades.filter(a=>a.situacao!=='agendada');
  const bolha=m=>`<div style="display:flex;justify-content:${m.role==='user'?'flex-end':'flex-start'};margin:8px 0"><div style="max-width:86%;padding:10px 13px;border-radius:16px;line-height:1.45;font-size:15px;${m.role==='user'?'background:var(--pri);color:#fff;border-bottom-right-radius:4px':'background:#fff;border:1px solid var(--line);border-bottom-left-radius:4px'}">${m.img?`<img src="${m.img}" style="max-width:180px;border-radius:10px;display:block;margin-bottom:6px">`:''}${m.role==='user'?esc(m.texto).replace(/\n/g,'<br>'):mdSimples(m.texto)}</div></div>`;
  return {html:`<div class="ph"><div><h1>🤖 Tutor IA</h1><p>Tire dúvidas, peça explicações, exemplos e dicas para estudar.</p></div>${TUT.msgs.length?'<button class="btn sm" data-a="tutLimpar">Nova conversa</button>':''}</div>
  ${st&&!st.ativa?'<div class="note">O tutor está desligado no momento.</div>':''}
  <label style="max-width:520px">Sobre o quê? <select id="tutAtiv"><option value="">Qualquer matéria (pergunta livre)</option>${ops.map(a=>`<option value="${a.id}" ${TUT.ativ===a.id?'selected':''}>${ic(a.disciplina)} ${esc(a.titulo)}</option>`).join('')}</select></label>
  <div class="card" id="tutChat" style="min-height:240px;max-height:60vh;overflow:auto;background:#f7f8fc">
   ${TUT.msgs.length?TUT.msgs.map(bolha).join(''):`<div class="empty" style="padding:14px"><div class="e">👋</div><h3>Oi! Eu sou o seu tutor.</h3><p>Pergunte, por exemplo:<br>“Me explica o que são números primos?”<br>“Me dá uma dica para a questão 3?”<br>“Faz um exemplo de verbo no futuro?”</p></div>`}</div>
  <div id="tutPrev"></div>
  <div style="display:flex;gap:8px;align-items:flex-end"><label class="btn" style="margin:0;min-width:48px" title="Enviar foto da dúvida">📷<input type="file" accept="image/*" id="tutFoto" hidden></label>
  <textarea id="tutTxt" rows="2" style="margin:0;flex:1;min-height:48px" placeholder="Escreva sua dúvida…"></textarea><button class="btn pri" data-a="tutEnviar" style="min-height:48px">Enviar</button></div>
  <p class="small muted" style="margin-top:8px">O tutor é uma inteligência artificial e pode errar: confira com seu professor. Não escreva dados pessoais (endereço, telefone). As conversas não ficam salvas.${st?` • Perguntas hoje: ${st.usados}/${st.limite}`:''}</p>`,
  depois(){const c=$('#tutChat');c.scrollTop=c.scrollHeight;
    $('#tutAtiv').onchange=e=>{TUT.ativ=e.target.value};
    $('#tutFoto').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{TUT.img=await comprimir(f);$('#tutPrev').innerHTML=`<div class="ft" style="margin-bottom:8px"><img src="${TUT.img}"><button class="x" data-a="tutSemFoto">✕</button></div>`}catch(x){toast(x.message)}};
    $('#tutTxt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ACOES.tutEnviar({},$('[data-a="tutEnviar"]'))}});}};
};
ACOES.tutSemFoto=()=>{TUT.img=null;$('#tutPrev').innerHTML=''};
ACOES.tutLimpar=()=>{TUT.msgs=[];render()};
ACOES.tutEnviar=async(d,b)=>{
  const t=$('#tutTxt').value.trim();if(!t){toast('Escreva sua pergunta.');return}
  const hist=TUT.msgs.map(m=>({role:m.role,texto:m.texto}));
  const img=TUT.img;TUT.msgs.push({role:'user',texto:t,img});TUT.img=null;
  const c=$('#tutChat');c.innerHTML=TUT.msgs.map(m=>`<div style="text-align:${m.role==='user'?'right':'left'};margin:8px 0"><span style="display:inline-block;max-width:86%;padding:10px 13px;border-radius:16px;${m.role==='user'?'background:var(--pri);color:#fff':'background:#fff;border:1px solid var(--line)'}">${m.role==='user'?esc(m.texto):mdSimples(m.texto)}</span></div>`).join('')+'<div class="muted small" style="margin:8px 0">🤖 pensando…</div>';c.scrollTop=c.scrollHeight;
  $('#tutTxt').value='';$('#tutPrev').innerHTML='';
  await busy(b,async()=>{try{const r=await api('iaTutor',{pergunta:t,historico:hist,atividadeId:TUT.ativ||'',imagem:img||''});TUT.msgs.push({role:'assistant',texto:r.resposta})}
    catch(e){TUT.msgs.pop();toast(e.message);$('#tutTxt').value=t}});
  render();
};

/* ---- ADMIN: uso e custos da IA ---- */
VIEWS.ad_ia=async function(){
  const [u,c]=await Promise.all([api('iaUso'),api('configObter')]);
  const brl=v=>'R$ '+(v*5.6).toFixed(2).replace('.',',');
  return {html:`<div class="ph"><div><h1>🤖 Inteligência Artificial</h1><p>Uso, custos e limites</p></div></div>
  <div class="grid g3" style="margin-bottom:14px"><div class="stat"><b>${u.chamadas}</b><span>Usos em ${esc(u.mes)}</span></div><div class="stat"><b>US$ ${u.usd.toFixed(2)}</b><span>Custo no mês (≈ ${brl(u.usd)})</span></div>
  <div class="stat"><b style="font-size:16px">${u.porModo.map(m=>`${m.modo==='gerar'?'✨ Gerador':'🤖 Tutor'}: ${m.chamadas} • US$ ${m.usd.toFixed(3)}`).join('<br>')}</b><span>Por ferramenta</span></div></div>
  <div class="card"><h3 style="margin-bottom:10px">Configurações</h3><form id="fIa">
   <label class="chk"><input type="checkbox" name="iaAtiva" ${c.iaAtiva?'checked':''}><span>IA ativada (gerador para professores e tutor para alunos)</span></label>
   <div class="row2"><label>Limite por professor por dia<input type="number" name="iaLimiteProfDia" min="0" max="500" value="${esc(c.iaLimiteProfDia)}"></label><label>Limite por aluno por dia<input type="number" name="iaLimiteAlunoDia" min="0" max="500" value="${esc(c.iaLimiteAlunoDia)}"></label></div>
   <div class="err" id="err"></div><button class="btn pri">Salvar</button></form></div>
  <div class="card small"><h3 style="margin-bottom:8px">Quanto custa (estimativa)</h3>
   <p>• <b>Gerar atividade</b> (modelo Claude Sonnet 5.5): cerca de US$ 0,05 a 0,20 por geração (≈ R$ 0,30 a R$ 1,10), conforme o número de páginas e de questões.</p>
   <p>• <b>Tutor</b> (modelo Claude Haiku 5.5): cerca de US$ 0,0005 por pergunta (≈ R$ 0,003). 1.000 perguntas ≈ R$ 3.</p>
   <p class="muted">Valores em reais aproximados (US$ 1 ≈ R$ 5,60). A cobrança é feita pela Anthropic, nos créditos que você comprar no console dela. Defina um limite de gastos lá para nunca ser surpreendido.</p></div>`,
  depois(){const f=$('#fIa');f.onsubmit=async ev=>{ev.preventDefault();await busy(f.querySelector('.pri'),async()=>{try{await api('iaConfigSalvar',{iaAtiva:f.elements.iaAtiva.checked,iaLimiteProfDia:f.elements.iaLimiteProfDia.value,iaLimiteAlunoDia:f.elements.iaLimiteAlunoDia.value});toast('Configurações salvas ✓')}catch(e){$('#err').textContent=e.message}})}}};
};
