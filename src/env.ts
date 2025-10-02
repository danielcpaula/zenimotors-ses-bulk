import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

export const ENV = {
  AWS_REGION: req('AWS_REGION'),
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID, // opcional se usar Role/PROFILE
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,

  SENDER_NAME: req('SENDER_NAME'),
  SENDER_ADDRESS: req('SENDER_ADDRESS'),

  TEMPLATE_NAME: process.env.TEMPLATE_NAME?.trim() || 'AlertaBoletosV1',
  CONFIG_SET: process.env.CONFIG_SET?.trim() || '',

  DEFAULT_URL_IMAGEM: req('DEFAULT_URL_IMAGEM'),
  DEFAULT_LINK_SITE: req('DEFAULT_LINK_SITE'),
  DEFAULT_CANAL_SUPORTE: req('DEFAULT_CANAL_SUPORTE'),

  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '50', 10),
  RATE_PER_SECOND: parseInt(process.env.RATE_PER_SECOND || '20', 10),

  DRY_RUN: !!process.env.DRY_RUN
};