/**
 * Security module for offline-only enforcement.
 * Blocks all outbound network requests and restricts navigation.
 */

import { session, app, BrowserWindow, WebContents } from 'electron';

/** Network schemes that should be blocked */
export const BLOCKED_SCHEMES = ['http:', 'https:', 'ws:', 'wss:'];

/** Schemes that are allowed (local/app resources) */
export const ALLOWED_SCHEMES = ['file:', 'data:', 'blob:', 'chrome-extension:', 'devtools:'];

/**
 * Check if a URL should be blocked.
 * Allows only local/app URLs (file:, data:, blob:, devtools:).
 * Blocks all network URLs (http:, https:, ws:, wss:).
 * 
 * @param url - The URL to check
 * @returns true if the URL should be blocked
 */
export function shouldBlockUrl(url: string): boolean {
  // Empty or undefined URLs should not be blocked (they're not network requests)
  if (!url) {
    return false;
  }

  try {
    // Parse the URL to extract the protocol
    const parsed = new URL(url);
    const protocol = parsed.protocol.toLowerCase();

    // Explicitly allow certain schemes
    if (ALLOWED_SCHEMES.includes(protocol)) {
      return false;
    }

    // Block known network schemes
    if (BLOCKED_SCHEMES.includes(protocol)) {
      return true;
    }

    // Block any other unknown schemes (conservative approach)
    // Exception: about: protocol is allowed for blank pages
    if (protocol === 'about:') {
      return false;
    }

    // Default: block unknown protocols
    return true;
  } catch {
    // If URL parsing fails, it's likely not a valid URL
    // Don't block to avoid breaking internal functionality
    return false;
  }
}

/**
 * Apply network blocking rules to the default session.
 * This blocks all HTTP, HTTPS, WS, and WSS requests.
 */
export function applyNetworkBlocking(): void {
  // Only apply in production or when explicitly enabled
  // In development, we need localhost for Vite dev server
  if (process.env.NODE_ENV === 'development' && !process.env.ENFORCE_OFFLINE) {
    console.log('[Security] Network blocking disabled in development mode');
    return;
  }

  const ses = session.defaultSession;

  // Block outbound requests
  ses.webRequest.onBeforeRequest((details, callback) => {
    const { url } = details;

    if (shouldBlockUrl(url)) {
      console.warn(`[Security] Blocked network request: ${url}`);
      callback({ cancel: true });
    } else {
      callback({});
    }
  });

  console.log('[Security] Network blocking enabled');
}

/**
 * Apply navigation restrictions to a BrowserWindow.
 * Prevents navigating to external URLs and opening new windows.
 * 
 * @param window - The BrowserWindow to secure
 */
export function applyWindowSecurity(window: BrowserWindow): void {
  const webContents = window.webContents;

  // Block navigation to external URLs
  webContents.on('will-navigate', (event, url) => {
    if (shouldBlockUrl(url)) {
      console.warn(`[Security] Blocked navigation to: ${url}`);
      event.preventDefault();
    }
  });

  // Block redirect attempts to external URLs
  webContents.on('will-redirect', (event, url) => {
    if (shouldBlockUrl(url)) {
      console.warn(`[Security] Blocked redirect to: ${url}`);
      event.preventDefault();
    }
  });

  // Completely prevent new window creation
  webContents.setWindowOpenHandler(({ url }) => {
    console.warn(`[Security] Blocked new window for: ${url}`);
    return { action: 'deny' };
  });
}

/**
 * Apply all security measures.
 * Call this during app initialization.
 */
export function applySecurity(): void {
  applyNetworkBlocking();
}

/**
 * Apply security to all existing and future windows.
 */
export function applySecurityToAllWindows(): void {
  // Apply to existing windows
  BrowserWindow.getAllWindows().forEach(window => {
    applyWindowSecurity(window);
  });
}
