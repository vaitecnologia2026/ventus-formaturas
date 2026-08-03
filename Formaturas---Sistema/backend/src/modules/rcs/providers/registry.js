import { GenericHttpRcsProvider } from './generic-http.provider.js';
import { ZenviaRcsProvider } from './zenvia.provider.js';
import { PontaltechRcsProvider } from './pontaltech.provider.js';
import { InfobipRcsProvider } from './infobip.provider.js';
import { TakeBlipRcsProvider } from './takeblip.provider.js';

/**
 * Registry de providers RCS.
 *
 * Para adicionar um novo provider:
 *   1. Crie um arquivo em providers/ que extenda GenericHttpRcsProvider
 *      (ou implemente a interface direto, se for muito específico)
 *   2. Importe e registre aqui via `register('meu_provider', MeuProvider)`
 *   3. Adicione o valor ao enum RcsProviderKind no schema.prisma
 *
 * Pronto. Nenhuma mudança em service/controller/routes é necessária.
 */

const _registry = new Map();

export function register(kind, ProviderClass) {
  if (_registry.has(kind)) throw new Error(`Provider já registrado: ${kind}`);
  _registry.set(kind, ProviderClass);
}

export function getProvider(kind) {
  const ProviderClass = _registry.get(kind);
  if (!ProviderClass) {
    throw new Error(`Provider não registrado: ${kind}. Registrados: ${[..._registry.keys()].join(', ')}`);
  }
  // Singleton por kind — providers são stateless (cache OAuth fica no static)
  if (!ProviderClass.__instance) ProviderClass.__instance = new ProviderClass();
  return ProviderClass.__instance;
}

export function listKinds() { return [..._registry.keys()]; }

// Bootstrap dos providers built-in
register('generic_http', GenericHttpRcsProvider);
register('zenvia',       ZenviaRcsProvider);
register('pontaltech',   PontaltechRcsProvider);
register('infobip',      InfobipRcsProvider);
register('takeblip',     TakeBlipRcsProvider);
