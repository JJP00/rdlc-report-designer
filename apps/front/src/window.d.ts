import type { RdlcApi } from '@rdlc-designer/contracts';

declare global {
  interface Window {
    api: RdlcApi;
  }
}

export {};
