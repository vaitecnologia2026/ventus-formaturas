import { GenericHttpRcsProvider } from './generic-http.provider.js';

/**
 * Pontaltech RCS — provider brasileiro.
 * Auth: bearer_token (token JWT no header Authorization).
 * Endpoint padrão: POST {baseUrl}/v3/rcs/send
 *
 * Documentação: https://pontaltech.gitbook.io/api-pontaltech-rcs/
 *
 * Os campos exatos do payload variam por tipo (text/template/rich card) — para
 * casos não-text, recomenda-se sobrescrever payloadTemplate por provider.
 */
export class PontaltechRcsProvider extends GenericHttpRcsProvider {
  defaultSendPath() { return '/v3/rcs/send'; }

  defaultPayloadTemplate(_config) {
    return {
      account: '{{account_id}}',
      from: '{{sender_id}}',
      to: '{{to}}',
      message: { type: 'text', text: '{{message}}' },
    };
  }

  defaultResponsePaths() {
    return { messageId: 'id', status: 'status', error: 'message' };
  }
}
