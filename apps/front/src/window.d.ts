import type { RdlcApi } from '@rdlc-designer/contracts';
import type { BenchResult } from './bench';

declare global {
  interface Window {
    api: RdlcApi;
    /** Resultado del benchmark (solo con `?bench=N`). */
    __benchResult?: BenchResult;
  }
}

export {};
