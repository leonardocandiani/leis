#!/usr/bin/env node
// SessionStart: injeta uma linha com as siglas das leis e o teste de cada uma.
import { saidaContexto, principal } from './entrada.mjs';
import { carregarConfig, resumoSessao } from './leis.mjs';

export function executar(_entrada, deps = {}) {
  const { config, aviso } = deps.config ?? carregarConfig();
  return saidaContexto('SessionStart', resumoSessao(config, aviso));
}

await principal(import.meta.url, executar);
