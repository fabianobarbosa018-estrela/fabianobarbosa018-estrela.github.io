# Desafio diário em navegador real (Chrome): aluno vê o cartão com contagem regressiva, responde as 50 e vê o resultado
import asyncio
from playwright.async_api import async_playwright
U='http://localhost:8770/'; erros=[]
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
        c=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2)
        p=await c.new_page(); p.on('pageerror',lambda e:erros.append(str(e)))
        async def login(u,s):
            await p.wait_for_selector('#fLogin'); await p.fill('#fLogin [name=login]',u); await p.fill('#fLogin [name=senha]',s); await p.click('#fLogin button'); await p.wait_for_selector('#main h1')
        await p.goto(U); await login('aluno','Aluno@2026')
        await p.wait_for_selector('.desafio'); await p.wait_for_timeout(1200); await p.screenshot(path='/tmp/dz1.png')
        print('cartão:', (await p.inner_text('.desafio')).replace('\n',' | ')[:200])
        await p.click('.desafio [data-go=a_fazer]'); await p.wait_for_selector('.dz-barra'); print('questões:', await p.locator('.q').count())
        await p.screenshot(path='/tmp/dz2.png')
        n=await p.locator('.q').count()
        for i in range(n):
            q=p.locator('.q').nth(i)
            if await q.locator('input[type=radio]').count(): await q.locator('input[type=radio]').first.check()
            elif await q.locator('textarea').count(): await q.locator('textarea').fill('Minha resposta com explicação.')
        await p.click('[data-a=enviarAtiv]'); await p.click('#cOk'); await p.wait_for_selector('#sheet >> text=Desafio enviado!')
        print('resultado:', (await p.inner_text('#sheet')).replace('\n',' | ')[:200]); await p.screenshot(path='/tmp/dz3.png')
        await p.click('[data-a=fecharEnvio]'); await p.wait_for_timeout(600)
        await p.click('#nav [data-go=a_atividades]'); await p.click('.tabs button:has-text("Desafios")'); await p.wait_for_selector('text=Meus desafios'); await p.screenshot(path='/tmp/dz4.png')
        await p.click('#nav [data-go=perfil]'); await p.click('[data-a=sair]'); await login('professor','Prof@2026')
        await p.click('#nav [data-go=p_atividades]'); await p.click('.hub [data-go=p_desafio]'); await p.wait_for_selector('text=Meu prazo'); await p.screenshot(path='/tmp/dz5.png', full_page=True)
        print('professor:', 'enviaram' in await p.inner_text('#main'))
        print('ERROS JS:', erros)
asyncio.run(main())
