import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HeadlessContext } from './headlessContext.js';
import { registerRdlcTools, SERVER_INSTRUCTIONS } from './tools.js';

/** Servidor MCP con todas las herramientas `rdlc_*`; el transporte lo elige quien lo llama. */
export function createMcpServer(ctx: HeadlessContext, version = '0.1.0'): McpServer {
  const server = new McpServer(
    { name: 'rdlc-designer', version },
    { instructions: SERVER_INSTRUCTIONS },
  );
  registerRdlcTools(server, ctx);
  return server;
}
