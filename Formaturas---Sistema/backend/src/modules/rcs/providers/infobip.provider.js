import { GenericHttpRcsProvider } from './generic-http.provider.js';

/**
 * Infobip RCS.
 * Auth: api_key_header com header `Authorization: App {apiKey}` (formato próprio).
 * Endpoint: POST {baseUrl}/rcs/2/messages
 *
 * Documentação: https://www.infobip.com/docs/api/channels/rcs
 */
export class InfobipRcsProvider extends GenericHttpRcsProvider {
  defaultSendPath() { return '/rcs/2/messages'; }

  defaultPayloadTemplate(_config) {
    return {
      messages: [
        {
          sender: '{{sender_id}}',
          destinations: [{ to: '{{to}}' }],
          content: { type: 'TEXT', text: '{{message}}' },
        },
      ],
    };
  }

  defaultResponsePaths() {
    return { messageId: 'messages.0.messageId', status: 'messages.0.status.name', error: 'messages.0.status.description' };
  }

  async _buildAuthHeaders(config) {
    if (config.authType === 'api_key_header') {
      // Infobip usa "Authorization: App <apiKey>" — não o header x-api-key padrão
      return { authorization: `App ${config.apiKey}` };
    }
    return super._buildAuthHeaders(config);
  }
}
