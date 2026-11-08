// gera o SQL inicial (admin, demonstração e atividades) com senhas já criptografadas
import { criarNucleo } from '../server/core.js'; import crypto from 'crypto'; import fs from 'fs';
const N = criarNucleo({ sha256b64: s => crypto.createHash('sha256').update(s, 'utf8').digest('base64'), uuid: () => crypto.randomUUID() });
const x = N.instalar({});
const lit = JSON.stringify(x.ops).replace(/'/g, "''");
fs.writeFileSync(new URL('../sql/seed.sql', import.meta.url), `-- dados iniciais da Sala Digital\nselect sd_aplicar('${lit}'::jsonb) where not exists (select 1 from sd_usuarios);\n`);
console.log(x.msgs.join('\n'), '\nops', x.ops.length);
