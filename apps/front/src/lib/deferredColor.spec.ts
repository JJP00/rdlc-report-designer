import { describe, expect, it, vi } from 'vitest';
import { createDeferredCommit } from './deferredColor';

describe('createDeferredCommit', () => {
  it('agrupa una ráfaga en un solo commit con el último valor', () => {
    vi.useFakeTimers();
    try {
      const commit = vi.fn();
      const deferred = createDeferredCommit(250, commit);

      deferred.schedule('#111111');
      deferred.schedule('#222222');
      deferred.schedule('#333333');
      expect(commit).not.toHaveBeenCalled();

      vi.advanceTimersByTime(249);
      expect(commit).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit).toHaveBeenCalledWith('#333333');
    } finally {
      vi.useRealTimers();
    }
  });

  it('flush entrega el pendiente al momento y cancel lo descarta', () => {
    vi.useFakeTimers();
    try {
      const commit = vi.fn();
      const deferred = createDeferredCommit(250, commit);

      deferred.schedule('#abcdef');
      deferred.flush();
      expect(commit).toHaveBeenCalledTimes(1);
      expect(commit).toHaveBeenCalledWith('#abcdef');

      deferred.schedule('#000000');
      deferred.cancel();
      vi.advanceTimersByTime(500);
      expect(commit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
