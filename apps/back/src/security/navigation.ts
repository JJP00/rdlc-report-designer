/**
 * Política de navegación del renderer (T2).
 *
 * La ventana solo puede permanecer en la URL con la que se cargó (dev server
 * en desarrollo o `index.html` empaquetado). Cualquier navegación a otro
 * origen —un enlace, `window.location`, contenido del `.rdlc`— se bloquea:
 * el renderer tiene acceso al API de edición y no debe poder salir de la app.
 */

/** ¿Se permite navegar a `target` desde `appUrl`? (mismo origen/fichero). */
export function isNavigationAllowed(target: string, appUrl: string): boolean {
  let targetUrl: URL;
  let currentUrl: URL;
  try {
    targetUrl = new URL(target);
    currentUrl = new URL(appUrl);
  } catch {
    return false;
  }

  // En producción la app vive en un `file://`: solo se admite el mismo fichero
  // (un reload, por ejemplo). Otro `file://` cualquiera también se bloquea.
  if (targetUrl.protocol === 'file:' || currentUrl.protocol === 'file:') {
    return targetUrl.protocol === currentUrl.protocol && targetUrl.pathname === currentUrl.pathname;
  }

  // En dev se admite el mismo origen del dev server (HMR y recargas).
  return targetUrl.origin === currentUrl.origin;
}

/**
 * Permisos concedidos al renderer. Todo lo demás (cámara, micrófono,
 * notificaciones, geolocalización, lectura del portapapeles…) se deniega: el
 * editor solo necesita **escribir** en el portapapeles al copiar una variable.
 */
export function isPermissionAllowed(permission: string): boolean {
  return permission === 'clipboard-sanitized-write';
}
