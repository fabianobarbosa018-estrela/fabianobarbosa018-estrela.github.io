import { criarAmbiente } from './ambiente.mjs';
const E = await criarAmbiente(); const msgs = await E.instalar(); console.log(msgs);
let r = await E.api('', 'entrar', { login: 'professor', senha: 'Prof@2026' }); console.log(r.ok, Object.keys(r.d||r));
r = await E.api(r.d.token, 'turmas'); console.log(r.ok, r.d && r.d[0].nome, r.d && r.d[0].atividades);
console.log((await E.q('select count(*) from sd_atividades'))[0], E.erros);
