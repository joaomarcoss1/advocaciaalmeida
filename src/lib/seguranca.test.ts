import { describe, expect, it } from 'vitest';
import { forcaSenha, gerarPin, gerarSenha, pinFraco, validarPin, validarSenha } from './seguranca';

describe('PIN', () => {
  it('recusa formato inválido', () => {
    expect(validarPin('1234')).toMatch(/6 a 8/);
    expect(validarPin('12345')).toMatch(/6 a 8/);
    expect(validarPin('123456789')).toMatch(/6 a 8/);
    expect(validarPin('abc123')).toMatch(/6 a 8/);
  });
  it('recusa sequências e repetições', () => {
    for (const p of ['123456', '654321', '111111', '000000', '121212', '123123', '234567', '987654', '012345']) expect(pinFraco(p), p).toBe(true);
  });
  it('aceita PIN forte', () => {
    for (const p of ['482913', '739105', '90817263']) expect(validarPin(p), p).toBe('');
  });
  it('gerarPin sempre produz PIN válido', () => {
    for (let i = 0; i < 300; i++) expect(validarPin(gerarPin())).toBe('');
  });
});

describe('Senha', () => {
  it('exige 10+ caracteres com letras e números', () => {
    expect(validarSenha('curta1')).toMatch(/10/);
    expect(validarSenha('somenteletras')).toMatch(/letras e números/);
    expect(validarSenha('1234567890')).toMatch(/letras e números/);
    expect(validarSenha('Segredo2026x')).toBe('');
  });
  it('gerarSenha sempre atende a regra', () => {
    for (let i = 0; i < 200; i++) expect(validarSenha(gerarSenha())).toBe('');
  });
  it('medidor cresce com a qualidade', () => {
    expect(forcaSenha('abc')).toBeLessThan(forcaSenha('Segredo2026xyzAB!'));
  });
});
