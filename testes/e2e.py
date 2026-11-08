import asyncio
from playwright.async_api import async_playwright
U='http://localhost:8770/'
erros=[]
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        c=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
        p=await c.new_page(); p.on('pageerror',lambda e:erros.append(str(e))); p.on('console',lambda m: erros.append(m.text) if m.type=='error' else None)
        async def login(u,s):
            await p.wait_for_selector('#fLogin'); await p.fill('#fLogin [name=login]',u); await p.fill('#fLogin [name=senha]',s); await p.click('#fLogin button'); await p.wait_for_selector('#main h1')
        async def sair():
            await p.click('#nav [data-go=perfil]'); await p.click('[data-a=sair]'); await p.wait_for_selector('#fLogin')
        await p.goto(U); await p.wait_for_selector('#fLogin'); await p.screenshot(path='/tmp/t1.png')
        await login('aluno','Aluno@2026'); print('aluno:', (await p.inner_text('#main h1')))
        await p.click('#nav [data-go=a_atividades]'); await p.click('[data-go=a_lista]'); await p.wait_for_selector('#main .list .it')
        await p.click('#main .it >> text=Mesopotâmia'); await p.wait_for_selector('.savebar')
        for i,v in enumerate([1,2,0,1]): await p.check(f'input[name="r{i}"][value="{v}"]')
        await p.fill('textarea[data-q="4"]','Davam água para plantar, irrigação e transporte.')
        await p.set_input_files('input[data-foto="4"][multiple]','/tmp/caderno.jpg')
        await p.wait_for_selector('#fotos4 [data-a=rmFoto]',timeout=15000); print('foto ok')
        await p.click('[data-a=enviarAtiv]'); await p.click('#cOk'); await p.wait_for_selector('text=Atividade enviada!'); print('enviada')
        await p.click('[data-a=fecharEnvio]'); await p.wait_for_timeout(500)
        await sair(); await login('professor','Prof@2026'); print('prof:', await p.inner_text('#main h1'))
        await p.click('#nav [data-go=p_correcoes]'); await p.click('#main .it >> nth=0'); await p.wait_for_selector('[data-cp="4"]')
        await p.wait_for_function("document.querySelector('#main .ft img') && document.querySelector('#main .ft img').src.startsWith('data:')"); print('prof vê foto')
        await p.click('[data-a=cpSet][data-i="4"][data-v="2"]'); await p.fill('#coG','Excelente!'); await p.click('[data-a=coSalvar]'); await p.wait_for_selector('text=Entregaram'); print('corrigida:', 'Liberadas' in await p.inner_text('#main'))
        await p.screenshot(path='/tmp/t2.png')
        # persistência após recarregar
        await p.reload(); await p.wait_for_selector('#main h1'); print('após recarregar:', await p.inner_text('#main h1'))
        await sair(); await login('aluno','Aluno@2026'); await p.click('#nav [data-go=a_notas]'); await p.wait_for_selector('#main table'); print('nota aluno:', (await p.inner_text('#main table')).split('\n')[1][:120])
        await sair()
        await p.click('[data-a=authModo][data-m=recuperar]'); await p.wait_for_selector('text=Esqueceu a senha?'); print('tela recuperar ok')
        d=await b.new_context(viewport={'width':1366,'height':860}); q=await d.new_page(); q.on('pageerror',lambda e:erros.append(str(e)))
        await q.goto(U); await q.wait_for_selector('#fLogin'); await q.fill('#fLogin [name=login]','admin'); await q.fill('#fLogin [name=senha]','Admin@2026'); await q.click('#fLogin button')
        await q.wait_for_selector('#fTs'); await q.fill('#fTs [name=atual]','Admin@2026'); await q.fill('#fTs [name=nova]','Adm#2026x'); await q.fill('#fTs [name=nova2]','Adm#2026x'); await q.click('#fTs button')
        await q.wait_for_selector('text=Painel administrativo'); print('admin computador ok')
        await q.click('#nav [data-go=ad_relatorios]'); await q.wait_for_selector('text=Desempenho por turma'); await q.screenshot(path='/tmp/w_admin.png'); print('relatórios ok')
        await b.close()
asyncio.run(main()); print('ERROS:', erros)
