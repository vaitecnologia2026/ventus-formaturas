#!/usr/bin/env node
// Gera um novo token de acesso e adiciona em tokens.json
// Uso: node scripts/gerar-token.js "Nome do destinatário" 90
//   (90 = dias até expirar; padrão = 30)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Uso: node scripts/gerar-token.js "Nome do destinatário" [dias=30]');
  process.exit(1);
}

const para = args[0];
const dias = parseInt(args[1], 10) || 30;

// Gera id legível: prefixo do nome + sufixo aleatório
const slug = para
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 16);
const sufixo = crypto.randomBytes(3).toString('hex');
const id = `${slug}-${sufixo}`;

const hoje = new Date();
const expira = new Date(hoje.getTime() + dias * 86400000);

const tokensPath = path.join(__dirname, '..', 'tokens.json');
const data = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));

const novo = {
  id,
  para,
  criadoEm: hoje.toISOString().slice(0, 10),
  expiraEm: expira.toISOString().slice(0, 10),
  ativo: true,
  nota: ''
};

data.tokens.push(novo);
fs.writeFileSync(tokensPath, JSON.stringify(data, null, 2) + '\n');

console.log('');
console.log('  Token gerado:');
console.log('  ─────────────────────────────────────');
console.log('  ID:        ' + id);
console.log('  Para:      ' + para);
console.log('  Expira:    ' + novo.expiraEm + ' (' + dias + ' dias)');
console.log('');
console.log('  Link:');
console.log('  https://formatura.vai-sistema.com/?t=' + id);
console.log('');
console.log('  Próximo passo: vercel --prod (no diretório novo-sistema-html)');
console.log('');
