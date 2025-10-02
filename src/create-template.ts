import { CreateEmailTemplateCommand } from '@aws-sdk/client-sesv2';
import { ses } from './aws.js';
import { ENV } from './env.js';

const Subject = '[Alerta] Boletos em nome da Zenimotors – verifique antes de pagar';

const Text = `Olá, {{nome}},

Alerta de segurança: boletos fraudulentos usando o nome da Zenimotors.

- Confirme beneficiário e CNPJ
- Gere/valide boletos em: {{link_site}}
- Suporte oficial: {{canal_suporte}}

Equipe de Segurança – Zenimotors`;

const Html = `<!doctype html>
<html lang="pt-BR">
  <body style="font-family: Arial, sans-serif; line-height:1.6; color:#111;">
    <p>Olá, {{nome}},</p>
    <p>Estamos emitindo este <strong>alerta de segurança</strong> sobre boletos fraudulentos que estão circulando em nome da <strong>Zenimotors</strong>.</p>
    <p>Confira a imagem abaixo com os cuidados necessários:</p>
    <p><img src="{{url_imagem}}" alt="Cuidados com boletos" style="max-width:100%; height:auto;" /></p>
    <ul>
      <li>Confirme o <strong>beneficiário</strong> e o <strong>CNPJ</strong> antes do pagamento.</li>
      <li>Gere/valide boletos em: <a href="{{link_site}}">{{link_site}}</a></li>
      <li>Em caso de dúvida, fale no canal oficial: <a href="{{canal_suporte}}">{{canal_suporte}}</a></li>
    </ul>
    <p>Equipe de Segurança – Zenimotors</p>
  </body>
</html>`;

async function main() {
  try {
    await ses.send(new CreateEmailTemplateCommand({
      TemplateName: ENV.TEMPLATE_NAME,
      TemplateContent: { Subject, Text, Html }
    }));
    console.log(`✅ Template criado: ${ENV.TEMPLATE_NAME}`);
  } catch (e: any) {
    if (e?.name === 'ConflictException') {
      console.log(`ℹ️ Template "${ENV.TEMPLATE_NAME}" já existe.`);
    } else {
      console.error('❌ Erro ao criar template:', e);
      process.exit(1);
    }
  }
}
main();