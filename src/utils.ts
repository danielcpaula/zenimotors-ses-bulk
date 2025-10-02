import fs from 'fs';
import { parse } from 'csv-parse';
import { Contact, SendRow } from './types.js';

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function isValidEmail(email = ''): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function loadCsv(filePath: string): Promise<Contact[]> {
  return new Promise((resolve, reject) => {
    const out: Contact[] = [];
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true, skip_empty_lines: true, trim: true }))
      .on('data', (row: any) => {
        const email = String(row.email || row.Email || '').trim();
        const nome = String(row.nome || row.Nome || row.name || 'cliente').trim();
        if (email && isValidEmail(email)) out.push({ email, nome: nome || 'cliente' });
      })
      .on('end', () => resolve(out))
      .on('error', reject);
  });
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

export async function writeReport(rows: SendRow[], baseName = 'send_results'): Promise<string> {
  await fs.promises.mkdir('reports', { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `reports/${baseName}_${ts}.csv`;
  const header = 'email,nome,status,messageId,error\n';
  const body = rows
    .map(r => [r.email, r.nome, r.status, r.messageId || '', (r.error || '').replace(/[\r\n]+/g, ' ')].join(','))
    .join('\n');
  await fs.promises.writeFile(file, header + body + '\n', 'utf8');
  return file;
}