import { Express } from 'express';

/**
 * Route Inspector Utility
 * Scans Express app at runtime to discover all registered routes
 */

export interface DiscoveredEndpoint {
    path: string;
    method: string;
    requiresAuth: boolean;
    middlewares: string[];
}

export interface ServiceEndpoint {
    path: string;
    method: string;
    billable: boolean;
    description: string;
    requiresAuth: boolean;
}

// Map route prefixes to service slugs
const ROUTE_PREFIX_TO_SERVICE: Record<string, string> = {
    '/api/ai': 'ai-doc-generator',
    '/api/pdf': 'html-to-pdf',
    '/api/jobs': 'html-to-pdf',
};

/**
 * Recursively extract routes from Express router stack
 */
function extractRoutesFromStack(stack: any[], basePath: string, routes: DiscoveredEndpoint[], depth: number = 0): void {
    if (!stack || !Array.isArray(stack)) return;
    
    const indent = '  '.repeat(depth);
    
    for (const layer of stack) {
        if (!layer) continue;
        
        // Layer with a route (actual endpoint)
        if (layer.route) {
            const routePath = basePath + layer.route.path;
            const methods = Object.keys(layer.route.methods).filter(m => m !== '_all');
            const middlewareNames = (layer.route.stack || [])
                .map((l: any) => l?.name)
                .filter((n: any) => n && n !== '<anonymous>');
            
            for (const method of methods) {
                routes.push({
                    path: routePath,
                    method: method.toUpperCase(),
                    requiresAuth: middlewareNames.some((m: string) => 
                        m.includes('auth') || m.includes('quota') || m.includes('requireServiceAccess')
                    ),
                    middlewares: middlewareNames
                });
            }
        }
        // Layer with nested router
        else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
            let nestedPath = '';
            
            // Extract path from regexp
            if (layer.regexp) {
                const regexStr = layer.regexp.source || layer.regexp.toString();
                // Match path from regex like: ^\/api\/?(?=\/|$)
                const match = regexStr.match(/\^\\?([^(?$]+)/);
                if (match) {
                    nestedPath = match[1]
                        .replace(/\\\//g, '/')
                        .replace(/\?$/g, '')
                        .replace(/\/\?$/g, '');
                }
            }
            
            extractRoutesFromStack(layer.handle.stack, basePath + nestedPath, routes, depth + 1);
        }
        // Mounted middleware that could be a router
        else if (layer.handle && layer.handle.stack && layer.regexp) {
            let nestedPath = '';
            
            if (layer.regexp) {
                const regexStr = layer.regexp.source || layer.regexp.toString();
                const match = regexStr.match(/\^\\?([^(?$]+)/);
                if (match) {
                    nestedPath = match[1]
                        .replace(/\\\//g, '/')
                        .replace(/\?$/g, '')
                        .replace(/\/\?$/g, '');
                }
            }
            
            extractRoutesFromStack(layer.handle.stack, basePath + nestedPath, routes, depth + 1);
        }
    }
}

/**
 * Main function to inspect all routes in Express app
 */
export function inspectRoutes(app: Express): DiscoveredEndpoint[] {
    const routes: DiscoveredEndpoint[] = [];
    
    if (app._router && app._router.stack) {
        console.log('      [Route Inspector] Starting route extraction...');
        console.log(`      [Route Inspector] Top-level stack has ${app._router.stack.length} items`);
        
        extractRoutesFromStack(app._router.stack, '', routes, 0);
        
        console.log(`      [Route Inspector] Extracted ${routes.length} routes total`);
    } else {
        console.log('      [Route Inspector] WARNING: app._router or app._router.stack not found');
    }
    
    return routes;
}

/**
 * Get all API routes
 */
export function getAllApiRoutes(app: Express): DiscoveredEndpoint[] {
    const allRoutes = inspectRoutes(app);
    return allRoutes.filter(route => route.path.startsWith('/api'));
}

/**
 * Get routes for a specific service
 */
export function getServiceRoutes(app: Express, serviceSlug: string): DiscoveredEndpoint[] {
    const allRoutes = getAllApiRoutes(app);
    
    // Find prefixes that map to this service
    const prefixes = Object.entries(ROUTE_PREFIX_TO_SERVICE)
        .filter(([_, slug]) => slug === serviceSlug)
        .map(([prefix, _]) => prefix);
    
    if (prefixes.length > 0) {
        return allRoutes.filter(route => 
            prefixes.some(prefix => route.path.startsWith(prefix))
        );
    }
    
    // Fallback: no mapping found
    return [];
}

/**
 * Format routes as service endpoints
 */
export function formatAsServiceEndpoints(routes: DiscoveredEndpoint[]): ServiceEndpoint[] {
    return routes.map(route => ({
        path: route.path,
        method: route.method,
        billable: true,
        description: '',
        requiresAuth: route.requiresAuth
    }));
}
