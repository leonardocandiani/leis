// Mascara segredo, e-mail e telefone antes de qualquer texto ir para o registro ou para o JEV.
const REGRAS = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [segredo]'],
  [/\b(?:sk|pk|ghp|gho|xox[abp]|AKIA)[-_A-Za-z0-9]{16,}/g, '[segredo]'],
  [/((?:access_token|token|api[_-]?key|secret|password|senha|sshpass|authorization)\s*[=:]\s*)["']?[^\s"'&]{6,}/gi, '$1[segredo]'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  [/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, '[segredo]'],
  [/(?<!\d)(?:\+?\d{1,3}[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}(?!\d)/g, '[telefone]'],
];

export function mascarar(texto) {
  let saida = String(texto ?? '');
  for (const [regra, troca] of REGRAS) saida = saida.replace(regra, troca);
  return saida;
}

export function trecho(texto, limite = 200) {
  const limpo = mascarar(texto).replace(/\s+/g, ' ').trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo;
}
