import { GenericHttpRcsProvider } from './generic-http.provider.js';

/**
 * Zenvia RCS — defaults baseados na API pública do Zenvia.
 * Endpoint: POST {baseUrl}/v2/channels/rcs/messages
 * Auth: api_key_header com header `X-API-Token` (ajustável via customHeaders)
 *
 * Documentação oficial: https://zenvia.github.io/zenvia-openapi-spec/
 *
 * Quando o usuário cadastrar um provider com providerKind='zenvia':
 *   - Não precisa preencher payloadTemplate/responsePaths se for envio simples (text)
 *   - Pode sobrescrever caso queira tipos ricos
 */
export class ZenviaRcsProvider extends GenericHttpRcsProvider {
  defaultSendPath() { return '/v2/channels/rcs/messages'; }

  defaultPayloadTemplate(_config) {
    return {
      from: '{{sender_id}}',
      to: '{{to}}',
      contents: [
        { type: 'text', text: '{{message}}' },
      ],
    };
  }

  defaultResponsePaths() {
    return { messageId: 'id', status: 'channel', error: 'message' };
  }

  async _buildAuthHeaders(config) {
    // Zenvia usa header próprio: X-API-Token. Sobrescrevemos o api_key_header default.
    if (config.authType === 'api_key_header') {
      return { 'x-api-token': config.apiKey };
    }
    return super._buildAuthHeaders(config);
  }
}
