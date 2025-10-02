import { SESv2Client } from '@aws-sdk/client-sesv2';
import { ENV } from './env.js';

export const ses = new SESv2Client({ region: ENV.AWS_REGION });
// Credenciais: o SDK lê do .env (vars), profile (AWS_PROFILE) ou Role automaticamente.