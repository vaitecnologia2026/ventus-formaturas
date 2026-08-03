import { ConfigSchema, UploadConversionSchema } from '../../src/validators/google-ads.schemas.js';

describe('ConfigSchema', () => {
  test('aceita configuração válida mínima', () => {
    const data = {
      customerId: '1234567890',
      developerToken: 'dev_token_xxx',
      clientId: 'client_id_xxx',
      clientSecret: 'secret_xxx_yyy',
      refreshToken: 'refresh_xxx_yyy',
    };
    const out = ConfigSchema.parse(data);
    expect(out.uploadMode).toBe('offline_click_conversion');
    expect(out.defaultCurrency).toBe('BRL');
  });
  test('rejeita customer_id curto', () => {
    expect(() => ConfigSchema.parse({
      customerId: '123',
      developerToken: 'dev_token_xxx',
      clientId: 'client_id_xxx',
      clientSecret: 'secret_xxx_yyy',
      refreshToken: 'refresh_xxx_yyy',
    })).toThrow();
  });
  test('rejeita upload_mode desconhecido', () => {
    expect(() => ConfigSchema.parse({
      customerId: '1234567890',
      developerToken: 'd1234567890',
      clientId: 'c1234567890',
      clientSecret: 's1234567890',
      refreshToken: 'r1234567890',
      uploadMode: 'banana',
    })).toThrow();
  });
});

describe('UploadConversionSchema', () => {
  test('exige leadId ou orderId', () => {
    expect(() => UploadConversionSchema.parse({ conversionEvent: 'lead_created' })).toThrow();
  });
  test('aceita leadId + evento válido', () => {
    const out = UploadConversionSchema.parse({ leadId: 'l-1', conversionEvent: 'sale_completed' });
    expect(out.conversionEvent).toBe('sale_completed');
  });
  test('rejeita evento desconhecido', () => {
    expect(() => UploadConversionSchema.parse({ leadId: 'l-1', conversionEvent: 'banana' })).toThrow();
  });
  test('rejeita conversionValue negativo', () => {
    expect(() => UploadConversionSchema.parse({ leadId: 'l-1', conversionEvent: 'lead_created', conversionValue: -1 })).toThrow();
  });
});
