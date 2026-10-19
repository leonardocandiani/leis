// Estado por sessão em ~/.claude/leis/estado/<sessao>.json: teto do bloqueio e pendência da resposta anterior.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { casaDoUsuario } from './leis.mjs';

const arquivo = (sessao) => join(casaDoUsuario(), 'estado', `${String(sessao).replace(/[^\w-]/g, '_')}.json`);

export function lerEstado(sessao) {
  try {
    return { bloqueios_seguidos: 0, ...JSON.parse(readFileSync(arquivo(sessao), 'utf8')) };
  } catch {
    return { bloqueios_seguidos: 0 };
  }
}

export function atualizarEstado(sessao, mudancas) {
  try {
    mkdirSync(join(casaDoUsuario(), 'estado'), { recursive: true });
    const novo = { ...lerEstado(sessao), ...mudancas };
    for (const [k, v] of Object.entries(novo)) if (v === undefined || v === null) delete novo[k];
    writeFileSync(arquivo(sessao), JSON.stringify(novo));
    return true;
  } catch {
    return false;
  }
}
