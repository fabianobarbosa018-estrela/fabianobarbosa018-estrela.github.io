# Banco de Atividades em navegador real (Chrome): professor monta e publica; aluno responde; correção automática
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
        await p.goto(U); await login('professor','Prof@2026')
        await p.click('#nav [data-go=p_banco]'); await p.wait_for_selector('[data-a=banDisc]'); await p.screenshot(path='/tmp/banco1.png')
        await p.click('[data-a=banDisc][data-id=matematica]'); await p.wait_for_selector('.banA')
        print('assuntos de matemática:', await p.locator('.banA').count())
        await p.check('.banA[value="4"]'); await p.check('.banA[value="5"]')   # porcentagem e regra de três
        await p.fill('#banQtd','6'); await p.uncheck('.banTipo[value=disc]')
        await p.screenshot(path='/tmp/banco2.png', full_page=True)
        await p.click('[data-a=banMontar]'); await p.wait_for_selector('text=questões do Banco de Atividades')
        print('editor:', await p.input_value('[data-e=titulo]'))
        await p.screenshot(path='/tmp/banco3.png', full_page=False)
        await p.check('[data-turma]'); await p.click('[data-a=edSalvar][data-s=publicada]')
        await p.wait_for_timeout(1500)
        ok=await p.locator('#cOk').count()
        if ok: await p.click('#cOk'); await p.wait_for_timeout(1000)
        print('publicada:', 'Banco' not in (await p.inner_text('#main h1')))
        await p.click('#nav [data-go=perfil]'); await p.click('[data-a=sair]'); await login('aluno','Aluno@2026')
        await p.click('#nav [data-go=a_atividades]'); await p.wait_for_selector('#main .it')
        await p.click('#main .it >> text=Matemática — 2 assuntos'); await p.wait_for_selector('.savebar')
        await p.screenshot(path='/tmp/banco4.png')
        n=await p.locator('input[name^="r"]').evaluate_all("els=>[...new Set(els.map(e=>e.name))].length")
        for i in range(n): await p.locator(f'input[name="r{i}"]').first.check()
        await p.click('[data-a=enviarAtiv]'); await p.click('#cOk'); await p.wait_for_selector('text=Atividade enviada!'); print('aluno enviou', n, 'respostas')
        print('ERROS JS:', erros)
asyncio.run(main())
