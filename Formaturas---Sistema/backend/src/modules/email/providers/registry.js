import { SmtpEmailProvider } from './smtp.provider.js';
import { SendGridEmailProvider } from './sendgrid.provider.js';
import { AmazonSesEmailProvider } from './amazon-ses.provider.js';
import { GenericHttpEmailProvider } from './generic-http.provider.js';

const _registry = new Map();

export function register(type, ProviderClass) {
  if (_registry.has(type)) throw new Error(`Email provider já registrado: ${type}`);
  _registry.set(type, ProviderClass);
}

export function getProvider(type) {
  const C = _registry.get(type);
  if (!C) throw new Error(`Email provider não registrado: ${type}. Registrados: ${[..._registry.keys()].join(', ')}`);
  if (!C.__instance) C.__instance = new C();
  return C.__instance;
}

export function listTypes() { return [..._registry.keys()]; }

register('smtp',         SmtpEmailProvider);
register('sendgrid',     SendGridEmailProvider);
register('amazon_ses',   AmazonSesEmailProvider);
register('generic_http', GenericHttpEmailProvider);
