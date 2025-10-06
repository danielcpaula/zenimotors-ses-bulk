import { CreateEmailTemplateCommand } from '@aws-sdk/client-sesv2';
import { ses } from './aws.js';
import { ENV } from './env.js';

const Subject = '[Alerta] Boletos em nome da Germano Zeni Veículos LTDA – verifique antes de pagar';

const Text = `Olá, {{nome}},

Alerta de segurança: boletos fraudulentos usando o nome da Germano Zeni Veículos LTDA.

- Confirme beneficiário e CNPJ
- Gere/valide boletos em: {{link_site}}
- Suporte oficial: {{canal_suporte}}

Equipe de Segurança – Zenimotors`;

const Html = `<!doctype html>
<html lang="pt-BR">
  <body style="font-family: Arial, sans-serif; line-height:1.6; color:#111;">
    <p>Olá, {{nome}},</p>
    <p>Fique atento(a)! Está circulando um golpe de boleto falso em nome da <strong>Zeni Motors</strong>.</p>
    <p>Confira abaixo como se proteger.</p>
    <p><img src="{{url_imagem}}" alt="Cuidados com boletos" style="max-width:100%; height:auto;" /></p>
    <ul>
      <li>Confirme o <strong>beneficiário</strong> e o <strong>CNPJ</strong> antes do pagamento.</li>
      <li>Em caso de dúvida, fale no canal oficial: <a href="{{canal_suporte}}">{{canal_suporte}}</a></li>
    </ul>
    <p>Departamento Financeiro – Zeni Motors</p>
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