export const EVENT_BUS_PORT = Symbol('EventBusPort');

/** Puerto de salida: publicar eventos al front (adaptador: webContents.send). */
export interface EventBusPort {
  send(channel: string, payload: unknown): void;
}
