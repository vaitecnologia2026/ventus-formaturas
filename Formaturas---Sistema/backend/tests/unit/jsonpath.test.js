import { getByPath } from '../../src/utils/jsonpath.js';

describe('getByPath', () => {
  const obj = {
    data: {
      message: { id: 'msg_123', status: 'sent' },
      items: [{ id: 'a' }, { id: 'b' }],
    },
    error: null,
  };

  test('dot path simples', () => {
    expect(getByPath(obj, 'data.message.id')).toBe('msg_123');
  });
  test('array index com ponto', () => {
    expect(getByPath(obj, 'data.items.0.id')).toBe('a');
    expect(getByPath(obj, 'data.items.1.id')).toBe('b');
  });
  test('array index com bracket', () => {
    expect(getByPath(obj, 'data.items[0].id')).toBe('a');
  });
  test('path inexistente -> undefined', () => {
    expect(getByPath(obj, 'data.nope.deep')).toBeUndefined();
    expect(getByPath(obj, 'data.message.foo')).toBeUndefined();
  });
  test('null intermediário -> undefined', () => {
    expect(getByPath(obj, 'error.message')).toBeUndefined();
  });
  test('input null/empty seguro', () => {
    expect(getByPath(null, 'a.b')).toBeUndefined();
    expect(getByPath(obj, '')).toBeUndefined();
  });
  test('uso típico em response paths de provider', () => {
    const infobipResp = { messages: [{ messageId: 'IB-1', status: { name: 'PENDING' } }] };
    expect(getByPath(infobipResp, 'messages.0.messageId')).toBe('IB-1');
    expect(getByPath(infobipResp, 'messages.0.status.name')).toBe('PENDING');
  });
});
