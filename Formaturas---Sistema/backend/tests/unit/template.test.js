import { renderTemplate } from '../../src/utils/template.js';

describe('renderTemplate — strings simples', () => {
  test('substitui {{var}} em string', () => {
    const { rendered, missing } = renderTemplate('Olá {{nome}}', { nome: 'Bruno' });
    expect(rendered).toBe('Olá Bruno');
    expect(missing).toEqual([]);
  });
  test('múltiplas variáveis na mesma string', () => {
    const { rendered } = renderTemplate('{{a}} e {{b}}', { a: 'X', b: 'Y' });
    expect(rendered).toBe('X e Y');
  });
  test('preserva tipo se string inteira é UM placeholder', () => {
    const { rendered } = renderTemplate('{{n}}', { n: 42 });
    expect(rendered).toBe(42);
    expect(typeof rendered).toBe('number');
  });
  test('coage para string em interpolação inline', () => {
    const { rendered } = renderTemplate('val:{{n}}', { n: 42 });
    expect(rendered).toBe('val:42');
  });
});

describe('renderTemplate — objetos e arrays', () => {
  test('walk recursivo em objeto', () => {
    const { rendered } = renderTemplate(
      { to: '{{to}}', body: { text: '{{message}}' } },
      { to: '+5538', message: 'oi' },
    );
    expect(rendered).toEqual({ to: '+5538', body: { text: 'oi' } });
  });
  test('walk em array', () => {
    const { rendered } = renderTemplate(['{{a}}', '{{b}}'], { a: 1, b: 2 });
    expect(rendered).toEqual([1, 2]);
  });
  test('payload RCS realista', () => {
    const { rendered } = renderTemplate(
      { messages: [{ to: '{{to}}', content: { type: 'text', text: '{{message}}' } }] },
      { to: '+5538', message: 'olá!' },
    );
    expect(rendered).toEqual({ messages: [{ to: '+5538', content: { type: 'text', text: 'olá!' } }] });
  });
});

describe('renderTemplate — paths aninhados', () => {
  test('{{user.name}} resolve', () => {
    const { rendered } = renderTemplate('Oi {{user.name}}', { user: { name: 'Ana' } });
    expect(rendered).toBe('Oi Ana');
  });
});

describe('renderTemplate — variáveis ausentes', () => {
  test('reporta missing[]', () => {
    const { rendered, missing } = renderTemplate('{{a}} {{b}}', { a: 'x' });
    expect(rendered).toBe('x ');
    expect(missing).toEqual(['b']);
  });
  test('missing dedupado', () => {
    const { missing } = renderTemplate('{{a}} {{a}} {{b}}', {});
    expect(missing.sort()).toEqual(['a', 'b']);
  });
  test('missing em path aninhado', () => {
    const { missing } = renderTemplate({ x: '{{user.email}}' }, { user: {} });
    expect(missing).toEqual(['user.email']);
  });
});
