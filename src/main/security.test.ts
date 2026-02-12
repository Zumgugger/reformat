/**
 * Unit tests for security module.
 * Tests URL blocking predicate logic.
 */

import { describe, it, expect } from 'vitest';
import {
  shouldBlockUrl,
  BLOCKED_SCHEMES,
  ALLOWED_SCHEMES,
} from './security';

describe('security', () => {
  describe('shouldBlockUrl', () => {
    describe('blocked schemes (network requests)', () => {
      it('should block HTTP URLs', () => {
        expect(shouldBlockUrl('http://example.com')).toBe(true);
        expect(shouldBlockUrl('http://localhost:3000')).toBe(true);
        expect(shouldBlockUrl('http://127.0.0.1')).toBe(true);
        expect(shouldBlockUrl('http://192.168.1.1')).toBe(true);
      });

      it('should block HTTPS URLs', () => {
        expect(shouldBlockUrl('https://example.com')).toBe(true);
        expect(shouldBlockUrl('https://google.com/search?q=test')).toBe(true);
        expect(shouldBlockUrl('https://api.github.com/repos')).toBe(true);
      });

      it('should block WebSocket URLs', () => {
        expect(shouldBlockUrl('ws://example.com/socket')).toBe(true);
        expect(shouldBlockUrl('ws://localhost:8080')).toBe(true);
      });

      it('should block secure WebSocket URLs', () => {
        expect(shouldBlockUrl('wss://example.com/socket')).toBe(true);
        expect(shouldBlockUrl('wss://secure.example.com:443/ws')).toBe(true);
      });

      it('should block URLs with ports', () => {
        expect(shouldBlockUrl('http://localhost:5173')).toBe(true);
        expect(shouldBlockUrl('https://example.com:8443')).toBe(true);
      });

      it('should block URLs with paths and query strings', () => {
        expect(shouldBlockUrl('https://example.com/api/data?key=value')).toBe(true);
        expect(shouldBlockUrl('http://example.com/path/to/resource#anchor')).toBe(true);
      });

      it('should block URLs with authentication', () => {
        expect(shouldBlockUrl('https://user:pass@example.com')).toBe(true);
        expect(shouldBlockUrl('http://admin@localhost')).toBe(true);
      });
    });

    describe('allowed schemes (local/app resources)', () => {
      it('should allow file:// URLs', () => {
        expect(shouldBlockUrl('file:///C:/path/to/file.html')).toBe(false);
        expect(shouldBlockUrl('file:///Users/test/app/index.html')).toBe(false);
        expect(shouldBlockUrl('file:///home/user/document.pdf')).toBe(false);
      });

      it('should allow data: URLs', () => {
        expect(shouldBlockUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(false);
        expect(shouldBlockUrl('data:text/html,<h1>Hello</h1>')).toBe(false);
        expect(shouldBlockUrl('data:application/json,{"key":"value"}')).toBe(false);
      });

      it('should allow blob: URLs', () => {
        expect(shouldBlockUrl('blob:file:///abc123')).toBe(false);
        expect(shouldBlockUrl('blob:null/abc-def-123')).toBe(false);
      });

      it('should allow devtools: URLs', () => {
        expect(shouldBlockUrl('devtools://devtools/bundled/inspector.html')).toBe(false);
      });

      it('should allow about: URLs', () => {
        expect(shouldBlockUrl('about:blank')).toBe(false);
        expect(shouldBlockUrl('about:srcdoc')).toBe(false);
      });

      it('should allow chrome-extension: URLs', () => {
        expect(shouldBlockUrl('chrome-extension://abcdef123/popup.html')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should not block empty URLs', () => {
        expect(shouldBlockUrl('')).toBe(false);
      });

      it('should not block undefined/null-like values', () => {
        expect(shouldBlockUrl(undefined as unknown as string)).toBe(false);
        expect(shouldBlockUrl(null as unknown as string)).toBe(false);
      });

      it('should not block invalid URLs', () => {
        // Invalid URLs that fail parsing should not be blocked
        expect(shouldBlockUrl('not-a-valid-url')).toBe(false);
        expect(shouldBlockUrl(':::invalid:::')).toBe(false);
      });

      it('should handle case-insensitive protocols', () => {
        expect(shouldBlockUrl('HTTP://example.com')).toBe(true);
        expect(shouldBlockUrl('HTTPS://example.com')).toBe(true);
        expect(shouldBlockUrl('FILE:///path/to/file')).toBe(false);
        expect(shouldBlockUrl('DATA:text/plain,hello')).toBe(false);
      });

      it('should block FTP URLs', () => {
        expect(shouldBlockUrl('ftp://ftp.example.com/file.txt')).toBe(true);
      });

      it('should block mailto: URLs', () => {
        expect(shouldBlockUrl('mailto:user@example.com')).toBe(true);
      });

      it('should block tel: URLs', () => {
        expect(shouldBlockUrl('tel:+1234567890')).toBe(true);
      });

      it('should block unknown/custom protocols', () => {
        expect(shouldBlockUrl('custom-protocol://something')).toBe(true);
        expect(shouldBlockUrl('myapp://action')).toBe(true);
      });
    });

    describe('constants', () => {
      it('should have correct blocked schemes', () => {
        expect(BLOCKED_SCHEMES).toContain('http:');
        expect(BLOCKED_SCHEMES).toContain('https:');
        expect(BLOCKED_SCHEMES).toContain('ws:');
        expect(BLOCKED_SCHEMES).toContain('wss:');
      });

      it('should have correct allowed schemes', () => {
        expect(ALLOWED_SCHEMES).toContain('file:');
        expect(ALLOWED_SCHEMES).toContain('data:');
        expect(ALLOWED_SCHEMES).toContain('blob:');
        expect(ALLOWED_SCHEMES).toContain('devtools:');
      });
    });
  });
});
