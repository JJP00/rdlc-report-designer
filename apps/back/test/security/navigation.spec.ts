import { describe, expect, it } from 'vitest';
import { isNavigationAllowed, isPermissionAllowed } from '../../src/security/navigation.js';

describe('isNavigationAllowed (T2)', () => {
  const devUrl = 'http://localhost:5173/';

  it('admite el mismo origen del dev server (recarga/HMR)', () => {
    expect(isNavigationAllowed('http://localhost:5173/', devUrl)).toBe(true);
    expect(isNavigationAllowed('http://localhost:5173/index.html', devUrl)).toBe(true);
  });

  it('bloquea otro puerto, otro host y otros esquemas', () => {
    expect(isNavigationAllowed('http://localhost:5174/', devUrl)).toBe(false);
    expect(isNavigationAllowed('https://localhost:5173/', devUrl)).toBe(false);
    expect(isNavigationAllowed('https://example.com/', devUrl)).toBe(false);
    expect(isNavigationAllowed('file:///C:/otro/index.html', devUrl)).toBe(false);
    expect(isNavigationAllowed('about:blank', devUrl)).toBe(false);
  });

  it('bloquea URLs malformadas', () => {
    expect(isNavigationAllowed('no-es-una-url', devUrl)).toBe(false);
    expect(isNavigationAllowed('http://localhost:5173/', 'tampoco')).toBe(false);
  });

  it('en producción (file://) solo admite el mismo fichero', () => {
    const fileUrl = 'file:///C:/app/resources/renderer/index.html';
    expect(isNavigationAllowed(fileUrl, fileUrl)).toBe(true);
    expect(isNavigationAllowed('file:///C:/otro/index.html', fileUrl)).toBe(false);
    expect(isNavigationAllowed('https://example.com/', fileUrl)).toBe(false);
    expect(isNavigationAllowed('file:///C:/app/otro.html', devUrl)).toBe(false);
  });
});

describe('isPermissionAllowed (T2)', () => {
  it('solo concede la escritura saneada del portapapeles', () => {
    expect(isPermissionAllowed('clipboard-sanitized-write')).toBe(true);
    expect(isPermissionAllowed('clipboard-read')).toBe(false);
    expect(isPermissionAllowed('media')).toBe(false);
    expect(isPermissionAllowed('notifications')).toBe(false);
    expect(isPermissionAllowed('geolocation')).toBe(false);
    expect(isPermissionAllowed('openExternal')).toBe(false);
  });
});
