// Testes do módulo Orçamentos: cálculos, validação, filtros e resumo do painel (funções puras).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'escalas', 'orcamentos.js'), 'utf8');
const ctx = { window: {}, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx, { filename: 'orcamentos.js' });
const C = ctx.window.OrcCalc;
assert.ok(C, 'OrcCalc deve ser exportado');

let ok = 0, falhas = 0;
const t = (nome, fn) => {
  try { fn(); ok++; } catch (e) { falhas++; console.log('❌ ' + nome + '\n   ' + e.message); }
};

const item = (o) => Object.assign({ id: Math.random().toString(36).slice(2), nome: 'x', qtd: 1, unidade: 'unidade', vu: 0, categoria: 'material' }, o);

t('número com vírgula (pt-BR) e ponto (en) são lidos', () => {
  assert.equal(C.num('1.250,50'), 1250.5);
  assert.equal(C.num('1250.5'), 1250.5);
  assert.equal(C.num('1.000'), 1000);
  assert.equal(C.num('12,5'), 12.5);
  assert.equal(C.num(''), 0);
  assert.equal(C.num('abc'), 0);
});

t('total do item: quantidade x valor unitário', () => {
  assert.equal(C.totalItem(item({ qtd: 12, vu: 35.5 })), 426);
  assert.equal(C.totalItem(item({ qtd: 3, vu: 0.1 })), 0.3); // sem erro de ponto flutuante
});

t('limpeza de quartos: valores diferentes por quarto somam corretamente', () => {
  const orc = { itens: [
    item({ nome: 'Quarto 101', qtd: 1, vu: 80, categoria: 'mao_obra', unidade: 'quarto' }),
    item({ nome: 'Quarto 102', qtd: 1, vu: 95, categoria: 'mao_obra', unidade: 'quarto' }),
    item({ nome: 'Produtos', qtd: 2, vu: 15.9, categoria: 'material' }),
    item({ nome: 'Taxa lavanderia', qtd: 1, vu: 40, categoria: 'despesa' }),
  ] };
  const t2 = C.totais(orc);
  assert.equal(t2.maoObra, 175);
  assert.equal(t2.materiais, 31.8);
  assert.equal(t2.despesas, 40);
  assert.equal(t2.subtotal, 246.8);
  assert.equal(t2.desconto, 0);
  assert.equal(t2.final, 246.8);
});

t('desconto em R$ não passa do subtotal e é descontado do valor final', () => {
  const orc = { descontoTipo: 'valor', desconto: 50, itens: [item({ qtd: 2, vu: 100 })] };
  assert.equal(C.totais(orc).final, 150);
  orc.desconto = 999;
  assert.equal(C.totais(orc).desconto, 200);
  assert.equal(C.totais(orc).final, 0);
});

t('desconto em % sobre o subtotal', () => {
  const orc = { descontoTipo: 'pct', desconto: 10, itens: [item({ qtd: 1, vu: 1000 })] };
  const r = C.totais(orc);
  assert.equal(r.desconto, 100);
  assert.equal(r.final, 900);
});

t('lista vazia gera totais zerados', () => {
  const r = C.totais({ itens: [] });
  assert.deepEqual(Array.from([r.subtotal, r.final, r.desconto]), [0, 0, 0]);
});

t('validação aponta campos obrigatórios e itens inválidos', () => {
  const erros = C.validar({ servico: '', data: '', responsavel: '', itens: [item({ nome: '', qtd: 0, vu: -1, unidade: '' })], desconto: 0 });
  assert.ok(erros.some(e => /nome do serviço/.test(e)));
  assert.ok(erros.some(e => /data/.test(e)));
  assert.ok(erros.some(e => /responsável/.test(e)));
  assert.ok(erros.some(e => /Item 1: informe o nome/.test(e)));
  assert.ok(erros.some(e => /quantidade/.test(e)));
  assert.ok(erros.some(e => /negativo/.test(e)));
  assert.ok(erros.some(e => /unidade/.test(e)));
});

t('validação aceita orçamento completo', () => {
  const erros = C.validar({ servico: 'Limpeza', data: '2026-11-16', responsavel: 'Gerente', itens: [item({ nome: 'Quarto', qtd: 3, vu: 50, unidade: 'quarto' })], desconto: 0, descontoTipo: 'valor' });
  assert.equal(erros.length, 0);
});

t('validação recusa desconto maior que o subtotal e % acima de 100', () => {
  const base = { servico: 'a', data: '2026-01-01', responsavel: 'b', itens: [item({ nome: 'i', qtd: 1, vu: 10, unidade: 'hora' })] };
  assert.ok(C.validar({ ...base, descontoTipo: 'valor', desconto: 11 }).some(e => /maior que o subtotal/.test(e)));
  assert.ok(C.validar({ ...base, descontoTipo: 'pct', desconto: 120 }).some(e => /100%/.test(e)));
});

t('número sequencial por ano, sem pular nem repetir', () => {
  const lista = [{ numero: 'ORC-2026-0007' }, { numero: 'ORC-2026-0003' }, { numero: 'ORC-2025-0040' }];
  assert.equal(C.proximoNumero(lista, '2026'), 'ORC-2026-0008');
  assert.equal(C.proximoNumero([], '2026'), 'ORC-2026-0001');
});

t('filtro por texto, situação, período e valor', () => {
  const lista = [
    { id: 'a', servico: 'Pintura do bar', status: 'aprovado', data: '2026-10-01', local: 'Bar', responsavel: 'Ana', itens: [item({ qtd: 1, vu: 500 })] },
    { id: 'b', servico: 'Limpeza de piscina', status: 'aguardando', data: '2026-11-05', local: 'Piscina', responsavel: 'Carlos', itens: [item({ qtd: 1, vu: 200 })] },
    { id: 'c', servico: 'Reforma da cozinha', status: 'recusado', data: '2026-11-10', local: 'Cozinha', responsavel: 'Ana', itens: [item({ qtd: 1, vu: 9000 })] },
  ];
  assert.deepEqual(Array.from(C.filtrar(lista, { texto: 'ana' }).map(o => o.id)), ['c', 'a']);
  assert.deepEqual(Array.from(C.filtrar(lista, { status: 'aguardando' }).map(o => o.id)), ['b']);
  assert.deepEqual(Array.from(C.filtrar(lista, { de: '2026-11-01', ate: '2026-11-30' }).map(o => o.id)), ['c', 'b']);
  assert.deepEqual(Array.from(C.filtrar(lista, { vmin: '1.000' }).map(o => o.id)), ['c']);
  assert.deepEqual(Array.from(C.filtrar(lista, { vmax: '600' }).map(o => o.id)), ['b', 'a']);
  assert.equal(C.filtrar(lista, {}).length, 3);
});

t('painel: contagens e valores (aprovado inclui em execução e concluído)', () => {
  const lista = [
    { status: 'aguardando', itens: [item({ qtd: 1, vu: 100 })] },
    { status: 'aprovado', itens: [item({ qtd: 1, vu: 200 })] },
    { status: 'em_execucao', itens: [item({ qtd: 1, vu: 300 })] },
    { status: 'concluido', itens: [item({ qtd: 1, vu: 50 })] },
    { status: 'recusado', itens: [item({ qtd: 1, vu: 10 })] },
    { status: 'em_elaboracao', itens: [item({ qtd: 1, vu: 5 })] },
  ];
  const r = C.resumo(lista);
  assert.equal(r.total, 6);
  assert.equal(r.aguardando, 1);
  assert.equal(r.aprovados, 3);
  assert.equal(r.recusados, 1);
  assert.equal(r.valorOrcado, 665);
  assert.equal(r.valorAprovado, 550);
});

console.log(`orçamentos: ${ok} ok, ${falhas} falha(s)`);
if (falhas) process.exit(1);
