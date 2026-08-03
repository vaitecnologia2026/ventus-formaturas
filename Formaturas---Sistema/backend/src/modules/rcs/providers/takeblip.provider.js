import crypto from 'crypto';
import { GenericHttpRcsProvider } from './generic-http.provider.js';

/**
 * Take Blip RCS — auth via API Key no header `Authorization: Key <apiKey>`.
 * Endpoint padrão: POST {baseUrl}/messages
 *
 * Documentação: https://docs.blip.ai/
 *
 * Take usa o protocolo Lime/BLiP — o body real é uma "Message" do BLiP.
 * Defaults aqui cobrem text simples; payloads ricos exigem template próprio.
 */
export class TakeBlipRcsProvider extends GenericHttpRcsProvider {
  defaultSendPath() { return '/messages'; }

  defaultPayloadTemplate(_config) {
    return {
      id: '{{message_id}}',
      to: '{{to}}@msging.net',
      type: 'text/plain',
      content: '{{message}}',
    };
  }

  defaultResponsePaths() {
    return { messageId: 'id', status: 'status', error: 'reason.description' };
  }

  async _buildAuthHeaders(config) {
    if (config.authType === 'api_key_header') {
      return { authorization: `Key ${config.apiKey}` };
    }
    return super._buildAuthHeaders(config);
  }

  _buildVars(config, input) {
    // Take exige um message_id idempotente; geramos UUID se não vier
    return {
      ...super._buildVars(config, input),
      message_id: input.vars?.message_id || crypto.randomUUID(),
    };
  }
}
