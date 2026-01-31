
/**
 * Security Utilities
 * Common helper functions for security best practices.
 */

/**
 * Escapes HTML special characters to prevent XSS/Injection.
 * @param str The string to escape
 * @returns Escaped string safe for HTML interpolation
 */
export function escapeHtml(str: string | null | undefined): string {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Validates a redirect URL to prevent Open Redirect vulnerabilities.
 * Ensures the URL is relative (starts with /) and is not a protocol-relative URL (//).
 * @param url The candidate redirect URL
 * @param defaultUrl Fallback URL if validation fails
 * @returns A safe relative URL
 */
export function getSafeRedirectUrl(url: any, defaultUrl: string = '/dashboard'): string {
    if (typeof url !== 'string') {
        return defaultUrl;
    }

    const trimmedUrl = url.trim();

    // Must start with /
    if (!trimmedUrl.startsWith('/')) {
        return defaultUrl;
    }

    // Must NOT start with // (Protocol relative, e.g. //malicious.com)
    if (trimmedUrl.startsWith('//')) {
        return defaultUrl;
    }

    // Prevent /\\ (Backslash tricks)
    if (trimmedUrl.includes('\\')) {
        return defaultUrl;
    }

    return trimmedUrl;
}
