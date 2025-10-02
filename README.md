# 🚀 SES Bulk Email Sender (TypeScript)

Ferramenta em **TypeScript** para envio de e-mails em massa usando **Amazon SES v2**.  
Desenvolvida para a **Zenimotors**, mas pode ser usada por qualquer empresa que precise de um disparador confiável, com suporte a:

✅ Templates de e-mail no SES  
✅ Leitura de contatos via CSV  
✅ Envio em lotes com controle de taxa (`rate limiting`)  
✅ Relatórios em CSV por disparo  
✅ Testes no **sandbox** usando os *simulators* do SES  
✅ Configuração via `.env` simples e segura  

---

## 📂 Estrutura do Projeto
zenimotors-ses-ts/
├── .env                  # Configurações de ambiente <br>
├── .gitignore<br>
├── package.json<br>
├── tsconfig.json<br>
│
├── data/                 # CSVs de entrada<br>
│   ├── contatos.csv      # Lista real de clientes/fornecedores<br>
│   └── sandbox.csv       # Lista de teste com simuladores SES<br>
│<br>
├── reports/              # Relatórios gerados automaticamente<br>
│<br>
└── src/<br>
├── aws.ts            # Cliente SES<br>
├── env.ts            # Variáveis de ambiente tipadas<br>
├── types.ts          # Tipos auxiliares<br>
├── utils.ts          # Funções utilitárias (CSV, chunk, report)<br>
├── create-template.ts# Script para criar template no SES<br>
└── send-bulk.ts      # Script principal de envio em massa<br>

---

## ⚙️ Configuração

### 1. Clonar o repositório
```bash
git clone https://github.com/seuusuario/zenimotors-ses-ts.git
cd zenimotors-ses-ts
```

### 2. Instalar dependências
```bash
npm install
```
### 3. Criar o .env
AWS_REGION=sa-east-1
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxx

SENDER_NAME=Titulo do Email
SENDER_ADDRESS=email@example.com

TEMPLATE_NAME=AlertaBoletosV1
CONFIG_SET=

DEFAULT_URL_IMAGEM=https://dominio.com/alerta.jpg
DEFAULT_LINK_SITE=https://dominio.com/boletos
DEFAULT_CANAL_SUPORTE=https://wa.me/55XXXXXXXXXXX

BATCH_SIZE=50
RATE_PER_SECOND=20

## 📊 CSV de Contatos
Formato Esperado
email,nome
maria@example.com,Maria
joao@example.com,João

No sandbox, use simulators:
email,nome
success@simulator.amazonses.com,Sucesso
bounce@simulator.amazonses.com,Bounce
complaint@simulator.amazonses.com,Complaint

## 🚀 Como usar
Criar Template no SES
```bash

npm run dev:create-template
```

Testar sem enviar (dry run)
```bash
npm run dev:send-bulk:dry
```

Testar no Sandbox (usando simulators)
```bash
npm run dev:send-bulk:sandbox
```
Enviar de verdade (produção)
Só funciona após sua conta SES sair do sandbox.
```bash
npm run dev:send-bulk
```

## 📈 Relatórios

Cada envio gera um relatório em reports/:
```csv
email,nome,status,messageId,error
maria@example.com,Maria,SUCCESS,01030199a5e49...,,
joao@example.com,João,BOUNCE,01030199a5e49...,User complaint
```

## 🛡️ Boas práticas
	•	Verifique domínio e remetente no SES antes de enviar.
	•	Use Configuration Sets para capturar eventos (bounces, complaints).
	•	Sempre higienize o CSV antes do disparo.
	•	Se possível, hospede as imagens em um S3 público ou CloudFront CDN.
	•	Monitore sua reputação de envio para não cair em bloqueios de provedores.

## 🧑‍💻 Tecnologias
	•	TypeScript
	•	AWS SDK v3
	•	Amazon SES v2
	•	csv-parse

📜 Licença

MIT © [Daniel de Paula]

💡 Projeto criado para apoiar a Zenimotors no envio seguro de alertas antifraude, mas reutilizável por qualquer empresa que precise de disparos em massa com Amazon SES.