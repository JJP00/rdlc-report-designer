import 'reflect-metadata';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './createServer.js';
import { createHeadlessContext } from './headlessContext.js';

/**
 * Punto de entrada stdio: `node out/mcp/server.mjs`. En stdio **stdout es el
 * canal del protocolo**: todo diagnóstico va a stderr.
 */
async function main(): Promise<void> {
  const ctx = createHeadlessContext();
  const server = createMcpServer(ctx);

  let closing = false;
  const shutdown = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    // Cerrar las sesiones suelta los watchers (si no, el proceso no termina).
    // Las ediciones sin guardar se pierden: el agente debe llamar a rdlc_save.
    for (const session of ctx.sessions.listSessions()) {
      await ctx.sessions.close(session.sessionId, { force: true });
    }
    await server.close();
    process.exit(0);
  };

  process.stdin.on('end', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
  process.on('uncaughtException', (error) => console.error('[rdlc-mcp] uncaughtException', error));
  process.on('unhandledRejection', (error) =>
    console.error('[rdlc-mcp] unhandledRejection', error),
  );

  await server.connect(new StdioServerTransport());
  console.error('[rdlc-mcp] listening on stdio');
}

main().catch((error) => {
  console.error('[rdlc-mcp] failed to start', error);
  process.exit(1);
});
