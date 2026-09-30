import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '@/data/db';
import { criarSelo, lerPayloadDoSelo, sincronizarSelos } from './selo';

// Navegador simulado
const mem = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) },
  location: { origin: 'https://exemplo.test' },
});

function fakeDb(disponivel: () => boolean) {
  const gravados: { codigo?: string; hash: string }[] = [];
  const db = {
    documentos: {
      async registrar(d: { codigo?: string; hash: string }) {
        if (!disponivel()) throw new Error('Could not find the function public.registrar_documento');
        if (!gravados.some(x => x.codigo === d.codigo)) gravados.push(d);
        return d.codigo ?? 'X';
      },
    },
  } as unknown as Db;
  return { db, gravados };
}
const base = { tipo: 'folha' as const, titulo: 'Folha', periodo: 'setembro', resumo: { funcionarios: 8, total_liquido: 27921.69 }, conteudo: [1, 2, 3] };
const fila = () => JSON.parse(mem.get('almeida.selos.pendentes') ?? '[]') as unknown[];

describe('selo dos PDFs', () => {
  beforeEach(() => mem.clear());

  it('banco pronto: registra na hora e o QR aponta só para o código', async () => {
    const { db, gravados } = fakeDb(() => true);
    const s = await criarSelo(db, base);
    expect(s.codigo).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    expect(gravados).toHaveLength(1);
    expect(gravados[0].codigo).toBe(s.codigo);
    expect(s.urlQr).toBe(`https://exemplo.test/verificar/${s.codigo}`);
    expect(s.qr.startsWith('data:image/png')).toBe(true);
    expect(fila()).toHaveLength(0);
  });

  it('banco sem a atualização: o PDF sai com selo mesmo assim, entra na fila e o QR leva os dados', async () => {
    let pronto = false;
    const { db, gravados } = fakeDb(() => pronto);
    const s = await criarSelo(db, base);
    expect(s.qr.startsWith('data:image/png')).toBe(true);
    expect(gravados).toHaveLength(0);
    expect(fila()).toHaveLength(1);
    const d = new URL(s.urlQr).searchParams.get('d');
    const p = lerPayloadDoSelo(d);
    expect(p?.periodo).toBe('setembro');
    expect(p?.resumo.total_liquido).toBe(27921.69);
    expect(p?.hash).toMatch(/^[0-9a-f]{64}$/);

    // ainda sem banco: nada é enviado e o selo continua na fila
    expect(await sincronizarSelos(db)).toBe(0);
    expect(fila()).toHaveLength(1);

    // banco atualizado: a fila é enviada sozinha, com o MESMO código impresso no PDF
    pronto = true;
    expect(await sincronizarSelos(db)).toBe(1);
    expect(fila()).toHaveLength(0);
    expect(gravados[0].codigo).toBe(s.codigo);
    expect(await sincronizarSelos(db)).toBe(0);
  });

  it('payload inválido ou adulterado é ignorado', () => {
    expect(lerPayloadDoSelo(null)).toBeNull();
    expect(lerPayloadDoSelo('%%%')).toBeNull();
    expect(lerPayloadDoSelo(btoa(JSON.stringify({ t: 'folha', p: 'x', h: 'curto' })))).toBeNull();
  });
});
