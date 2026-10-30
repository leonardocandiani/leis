// Confere se um valor está guardado no cofre do keyfence, só pelas funções dele e por impressão digital com sal:
// o cofre nunca é aberto nem lido, e o valor nunca é impresso. Sem keyfence ou com qualquer erro, a resposta é não.
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function noCofre(valor, deps = {}) {
  try {
    const raiz = process.env.KEYFENCE_HOME || join(homedir(), '.local', 'share', 'keyfence');
    const vault = deps.vault ?? createRequire(import.meta.url)(join(raiz, 'src', 'vault.js'));
    const { salt, list } = vault.fingerprints();
    if (!salt || !Array.isArray(list)) return false;
    const marca = vault.fingerprint(salt, valor);
    return list.some((x) => x.fp === marca);
  } catch {
    return false;
  }
}
