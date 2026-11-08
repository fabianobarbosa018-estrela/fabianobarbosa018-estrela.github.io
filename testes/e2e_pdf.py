# IMPRIMIR PROVA: gera o PDF de verdade no Chrome (celular e computador) e confere o conteúdo
import asyncio, json, re, io, unicodedata, urllib.request
from playwright.async_api import async_playwright
from pypdf import PdfReader
U='http://localhost:8770/'; erros=[]; ok=0; falhas=0
def t(n,c,x=''):
    global ok,falhas
    if c: ok+=1
    else: falhas+=1; print('❌',n,str(x)[:300])
def api(tok,acao,d=None):
    r=urllib.request.urlopen(urllib.request.Request(U+'api',data=json.dumps({'token':tok,'acao':acao,'d':d or {}}).encode(),headers={'content-type':'application/json'})); return json.loads(r.read())
norm=lambda s: re.sub(r'\s+','',unicodedata.normalize('NFC',s))
async def main():
    tp=api('', 'entrar', {'login':'professor','senha':'Prof@2026'})['d']['token']
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        for nome,vp in [('cel',{'width':390,'height':844}),('pc',{'width':1366,'height':860})]:
            c=await b.new_context(viewport=vp,accept_downloads=True,device_scale_factor=2 if nome=='cel' else 1)
            p=await c.new_page(); p.on('pageerror',lambda e:erros.append(str(e)))
            await p.goto(U); await p.wait_for_selector('#fLogin'); await p.fill('#fLogin [name=login]','aluno'); await p.fill('#fLogin [name=senha]','Aluno@2026'); await p.click('#fLogin button'); await p.wait_for_selector('#main h1')
            tok=await p.evaluate('S.token')
            await p.click('#nav [data-go=a_atividades]'); await p.wait_for_selector('.pv-capa [data-a=provaImprimir]')
            t(nome+': no cartão da prova: INICIAR e IMPRIMIR', await p.locator('.pv-capa [data-go=a_prova]').count()==1 and await p.locator('.pv-capa [data-a=provaImprimir]').count()==1)
            await p.click('.pv-capa [data-go=a_prova]'); await p.wait_for_selector('[data-a=provaImprimir]')
            if nome=='cel': t(nome+': as duas opções aparecem antes de iniciar', await p.locator('[data-a=provaIniciar]').count()==1 and await p.locator('[data-a=provaImprimir]').count()==1)
            await p.screenshot(path=f'/tmp/pdf_{nome}_opcoes.png', full_page=True)
            hoje=api(tok,'desafioHoje')['d']['desafios'][0]
            async with p.expect_download(timeout=60000) as dl:
                await p.click('[data-a=provaImprimir]')
            d=await dl.value; caminho=f'/tmp/prova_{nome}.pdf'; await d.save_as(caminho)
            await p.wait_for_selector('#sheet >> text=Prova em PDF pronta'); await p.screenshot(path=f'/tmp/pdf_{nome}_modal.png')
            t(nome+': nome do arquivo', d.suggested_filename.startswith('Prova-do-dia-') and d.suggested_filename.endswith('.pdf'), d.suggested_filename)
            R=PdfReader(caminho); txt='\n'.join(pg.extract_text() for pg in R.pages); N=norm(txt)
            t(nome+': PDF válido com várias páginas', len(R.pages)>=5, len(R.pages))
            for k in ['SALA DIGITAL','PROVA DO DIA','Aluno Demonstração','6º Ano A','6º ano','08/11/2026','FOLHA DE RESPOSTAS']: t(nome+': PDF tem '+k, norm(k) in N, k)
            A=api(tp,'atividadeObter',{'id':hoje['id']})['d']['atividade']; qs=A['questoes']
            t(nome+': 50 questões numeradas', all(norm('Questão %d'%(i+1)) in N for i in range(len(qs))) and len(qs)==50)
            faltam=[i+1 for i,q in enumerate(qs) if norm(q['enunciado'])[:40] not in N]
            t(nome+': mesmas questões, na mesma ordem', not faltam and all(N.index(norm(qs[i]['enunciado'])[:40])<N.index(norm(qs[i+1]['enunciado'])[:40]) for i in range(len(qs)-1)), faltam)
            alts=[(i+1,o) for i,q in enumerate(qs) if q['tipo']=='mc' for o in q['opcoes'] if norm(o)[:30] not in N]
            t(nome+': todas as alternativas', not alts, alts[:5])
            expl=[i+1 for i,q in enumerate(qs) if len(norm(q.get('explicacao','')))>25 and norm(q['explicacao'])[:40] in N]
            t(nome+': sem gabarito nem explicações', not expl and not re.search(r'gabarito', txt, re.I), expl)
            ordem=[N.index(norm(q['enunciado'])[:40]) for q in qs]
            depois=api(tok,'desafioHoje')['d']['desafios'][0]
            t(nome+': imprimir não iniciou a prova digital', depois['rascunho']==hoje['rascunho'] and depois.get('enviadoEm')==hoje.get('enviadoEm') and depois['situacao']==hoje['situacao'], [hoje,depois])
            # durante a prova (já iniciada) o botão continua disponível
            await p.click('#sheet [data-a=fechar]')
            if await p.locator('[data-a=provaIniciar]').count(): await p.click('[data-a=provaIniciar]')
            await p.wait_for_selector('#pvQ .q')
            t(nome+': imprimir durante a prova', await p.locator('.pv-barra [data-a=provaImprimir]').count()==1)
            async with p.expect_download(timeout=60000) as dl2: await p.click('.pv-barra [data-a=provaImprimir]')
            d2=await dl2.value; await d2.save_as(f'/tmp/prova_{nome}_2.pdf'); t(nome+': PDF durante a prova', len(PdfReader(f'/tmp/prova_{nome}_2.pdf').pages)>=5)
            await p.click('#sheet [data-a=fechar]'); await p.click('#nav [data-go=a_atividades]'); await p.wait_for_selector('.pv-capa [data-a=provaImprimir]')
            t(nome+': imprimir no cartão da prova em andamento', 'CONTINUAR' in await p.inner_text('.pv-capa'))
            async with p.expect_download(timeout=60000) as dl3: await p.click('.pv-capa [data-a=provaImprimir]')
            d3=await dl3.value; await d3.save_as(f'/tmp/prova_{nome}_3.pdf'); t(nome+': PDF pelo cartão', len(PdfReader(f'/tmp/prova_{nome}_3.pdf').pages)>=5)
            await p.click('#sheet [data-a=fechar]'); await p.click('#nav [data-go=a_inicio]'); await p.wait_for_selector('#main [data-a=provaImprimir]'); t(nome+': imprimir no Início', True)
            await p.screenshot(path=f'/tmp/pdf_{nome}_cartao.png')
            await c.close()
        # professor imprime para a turma (nome em branco)
        c=await b.new_context(viewport={'width':1366,'height':860},accept_downloads=True); p=await c.new_page(); p.on('pageerror',lambda e:erros.append(str(e)))
        await p.goto(U); await p.wait_for_selector('#fLogin'); await p.fill('#fLogin [name=login]','professor'); await p.fill('#fLogin [name=senha]','Prof@2026'); await p.click('#fLogin button'); await p.wait_for_selector('#main h1')
        await p.click('#nav [data-go=p_atividades]'); await p.click('.hub [data-go=p_desafio]'); await p.wait_for_selector('[data-a=provaImprimir]')
        async with p.expect_download(timeout=60000) as dl4: await p.click('[data-a=provaImprimir]')
        d4=await dl4.value; await d4.save_as('/tmp/prova_prof.pdf'); R=PdfReader('/tmp/prova_prof.pdf'); txt='\n'.join(pg.extract_text() for pg in R.pages)
        A=api(tp,'atividadeObter',{'id':hoje['id']})['d']['atividade']
        t('professor imprime para a turma, sem gabarito', len(R.pages)>=5 and '____' in txt and not any(len(q.get('explicacao',''))>25 and norm(q['explicacao'])[:40] in norm(txt) for q in A['questoes']))
        await c.close()
        print('ERROS JS:', erros); print(f'PDF: {ok} ok, {falhas} falhas')
asyncio.run(main())
