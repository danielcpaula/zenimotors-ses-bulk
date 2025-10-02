// src/send-bulk.ts
import type { BulkEmailEntryResult } from '@aws-sdk/client-sesv2';
import { SendBulkEmailCommand } from '@aws-sdk/client-sesv2';
import { ses } from './aws.js';
import { ENV } from './env.js';
import { chunk, loadCsv, sleep, writeReport } from './utils.js';
import type { Contact, SendRow } from './types.js';

function buildEntries(batch: Contact[]) {
  return batch.map((r) => ({
    Destination: { ToAddresses: [r.email] },
    ReplacementEmailContent: {
      ReplacementTemplate: {
        ReplacementTemplateData: JSON.stringify({
          nome: r.nome || 'cliente',
          url_imagem: ENV.DEFAULT_URL_IMAGEM,
          link_site: ENV.DEFAULT_LINK_SITE,
          canal_suporte: ENV.DEFAULT_CANAL_SUPORTE
        })
      }
    }
  }));
}

/**
 * Envia um lote. Em DRY_RUN, retorna objetos parciais (apenas Status).
 * Em envio real, retorna os resultados reais do SES (compatível com Partial).
 */
async function sendBatch(
  batch: Contact[],
  idx: number
): Promise<Array<Partial<BulkEmailEntryResult>>> {
  const input: {
    FromEmailAddress: string;
    DefaultContent: {
      Template: {
        TemplateName: string;
        TemplateData: string;
      };
    };
    BulkEmailEntries: ReturnType<typeof buildEntries>;
    ConfigurationSetName?: string;
  } = {
    FromEmailAddress: `${ENV.SENDER_NAME} <${ENV.SENDER_ADDRESS}>`,
    DefaultContent: {
      Template: {
        TemplateName: ENV.TEMPLATE_NAME,
        TemplateData: JSON.stringify({
          nome: 'cliente',
          url_imagem: ENV.DEFAULT_URL_IMAGEM,
          link_site: ENV.DEFAULT_LINK_SITE,
          canal_suporte: ENV.DEFAULT_CANAL_SUPORTE
        })
      }
    },
    BulkEmailEntries: buildEntries(batch)
  };

  if (ENV.CONFIG_SET) input.ConfigurationSetName = ENV.CONFIG_SET;

  if (ENV.DRY_RUN) {
    console.log(`🧪 [Dry Run] Lote ${idx}: ${batch.length} destinatários (não enviado)`);
    return batch.map(() => ({ Status: 'DRY_RUN' } as unknown as Partial<BulkEmailEntryResult>));
  }

  const res = await ses.send(new SendBulkEmailCommand(input));
  const results = (res?.BulkEmailEntryResults ?? []) as Array<Partial<BulkEmailEntryResult>>;
  const ok = results.filter(r => r.Status === 'SUCCESS').length;
  console.log(`📨 Lote ${idx} enviado. OK=${ok}/${batch.length}`);
  return results;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Uso: tsx src/send-bulk.ts data/arquivo.csv');
    process.exit(1);
  }

  const list = await loadCsv(csvPath);
  if (!list.length) {
    console.error('❌ CSV sem e-mails válidos.');
    process.exit(1);
  }
  console.log(`📚 Destinatários válidos: ${list.length}`);

  const batches = chunk(list, ENV.BATCH_SIZE);
  const rows: SendRow[] = [];

  let i = 0;
  for (const batch of batches) {
    i++;
    try {
      const results = await sendBatch(batch, i); // Array<Partial<BulkEmailEntryResult>>
      for (let k = 0; k < batch.length; k++) {
        const r = batch[k];
        const out = results[k] ?? {};
        rows.push({
          email: r.email,
          nome: r.nome,
          status: String(out.Status ?? 'UNKNOWN'),
          messageId: typeof out.MessageId === 'string' ? out.MessageId : '',
          error:
            out.Error && typeof (out as any).Error?.Message === 'string'
              ? (out as any).Error.Message
              : ''
        });
      }
    } catch (e: any) {
      console.error(`❌ Erro no lote ${i}:`, e?.message || e);
      for (const r of batch) {
        rows.push({
          email: r.email,
          nome: r.nome,
          status: 'ERROR',
          messageId: '',
          error: String(e?.message || e)
        });
      }
      await sleep(3000);
    }

    // pacing para respeitar seu throughput (msgs/s)
    const pauseMs = Math.ceil((batch.length / Math.max(1, ENV.RATE_PER_SECOND)) * 1000);
    await sleep(pauseMs);
  }

  const report = await writeReport(rows);
  console.log(`🧾 Relatório salvo em: ${report}`);
  console.log('✅ Concluído.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});