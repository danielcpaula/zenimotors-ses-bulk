export type Contact = { email: string; nome: string };
export type SendRow = {
  email: string;
  nome: string;
  status: string;
  messageId?: string;
  error?: string;
};