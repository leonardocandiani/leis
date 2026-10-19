// Entrada e saída comuns dos hooks. Todo hook é fail-open: qualquer erro vira saída vazia e exit 0.
import { existsSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function lerEntrada() {
  const partes = [];
  for await (const p of process.stdin) partes.push(p);
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

export const nomeDoProjeto = (entrada) => basename(entrada.cwd || process.env.CLAUDE_PROJECT_DIR || '') || undefined;

// Projeto com mecanismo próprio para a mesma conferência: o plugin sai sem fazer nada para não duplicar.
export const projetoTem = (...segmentos) => !!process.env.CLAUDE_PROJECT_DIR && existsSync(join(process.env.CLAUDE_PROJECT_DIR, ...segmentos));

export function saidaContexto(evento, texto) {
  return { hookSpecificOutput: { hookEventName: evento, additionalContext: texto } };
}

export function saidaNegar(motivo) {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: motivo } };
}

export function ehPrincipal(urlDoModulo) {
  const arquivo = process.argv[1];
  return !!arquivo && pathToFileURL(realpathSync(arquivo)).href === urlDoModulo;
}

export async function principal(urlDoModulo, executar) {
  if (!ehPrincipal(urlDoModulo)) return;
  try {
    const saida = await executar(await lerEntrada());
    if (saida) process.stdout.write(JSON.stringify(saida));
  } catch {
    // fail-open: o hook nunca pode travar a sessão
  }
}
