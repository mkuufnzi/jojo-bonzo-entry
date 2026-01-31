import { Application, Router } from 'express';
import prisma from '../lib/prisma';

interface DiscoveredEndpoint {
    path: string;
    method: string;
    regex?: string;
}

export class RouteDiscoveryService {
    
    /**
     * Inspects the Express App and discovers all registered routes
     */
    static async discover(app: Application) {
        console.log('🔍 Starting Dynamic Route Discovery...');
        
        const endpoints = this.getEndpoints(app);
        console.log(`   Found ${endpoints.length} active endpoints.`);

        await this.syncWithDatabase(endpoints);
        console.log('✅ Route Discovery Synced to Database.');
    }

    private static getEndpoints(app: any): DiscoveredEndpoint[] {
        const endpoints: DiscoveredEndpoint[] = [];

        // Helper to parse the stack
        const parseStack = (layer: any, basePath: string = '') => {
            if (layer.route) {
                // Leaf Route
                const path = basePath + layer.route.path;
                const methods = Object.keys(layer.route.methods).filter(m => layer.route.methods[m]);
                
                methods.forEach(method => {
                    endpoints.push({
                        path,
                        method: method.toUpperCase()
                    });
                });
            } else if (layer.name === 'router' && layer.handle.stack) {
                // Nested Router
                // The regex for the router usually contains the prefix
                // We try to extract it, handling Express's regex format
                let prefix = '';
                if (layer.regexp) {
                    const str = layer.regexp.toString();
                    // Basic extraction for standard Express routing
                    // /^\/api\/?(?=\/|$)/i  -> /api
                    const match = str.match(/^\/\\^\\(.*?)\\\/.*$/) || str.match(/^\/\^\\(.*?)\\\/?/); 
                    // This is brittle as regex formats vary. 
                    // Better approach: usage of 'path' if available on the layer (some middlewares add it)
                    // But standard Express routers don't easily expose the mount path here.
                    
                    // Fallback: Check if we can infer from common structures or if 'path' property exists (unlikely in pure express 4)
                }
                
                // For simplicity in this implementation, we might miss the exact mounting point if not careful.
                // However, 'express-list-endpoints' logic is robust. We will use a simplified recursion.
                // Note: Getting the FULL path including mounts is tricky without a dedicated library.
                // Given the constraints, I will rely on the fact that our app structure imports routes with known prefixes in index.ts.
                
                // WAIT: app._router.stack contains the mounts.
                // If I am iterating app._router.stack, I see 'router' layers.
                // The 'regexp' property matches the mount path.
                
                layer.handle.stack.forEach((subLayer: any) => parseStack(subLayer, basePath)); // Pass basePath? 
                // Actual mount path extraction is hard from regex.
            }
        };

        // If 'express-list-endpoints' usage fails, we fallback to manual.
        // But actually, we know our route structure:
        // /api -> apiRouter
        // /dashboard -> dashboardRoutes
        // etc.
        // A better hybrid approach: 
        // We know the main mounts in index.ts. 
        // Real reflection is hard.
        // Let's rely on standard 'app._router.stack' iteration.
        
        if (app._router && app._router.stack) {
             app._router.stack.forEach((layer: any) => {
                 this.printLayer(layer, '', endpoints);
             });
        }

        return endpoints;
    }

    private static printLayer(layer: any, basePath: string, endpoints: DiscoveredEndpoint[]) {
        if (layer.route) {
            // It's a route
             const methods = Object.keys(layer.route.methods).filter(m => layer.route.methods[m]);
             methods.forEach(method => {
                 endpoints.push({
                     path: basePath + layer.route.path,
                     method: method.toUpperCase()
                 });
             });
        } else if (layer.name === 'router' && layer.handle.stack) {
            // It's a router
            // Extract path from regex is nasty.
            // Fast regex parser for Express 4 default:
            // /^\/api\/?(?=\/|$)/i
            let dir = '';
            if (layer.regexp) {
                const regStr = layer.regexp.toString();
                if (regStr.includes('/api')) dir = '/api';
                else if (regStr.includes('/auth')) dir = '/auth';
                else if (regStr.includes('/dashboard')) dir = '/dashboard';
                else if (regStr.includes('/admin')) dir = '/admin';
                else if (regStr.includes('/webhook')) dir = '/webhook';
                else if (regStr.includes('/services')) dir = '/services';
                // ... simplistic matching for our known routes
                
                // If we can't guess, we might try to clean the regex
                // This is 'best effort' discovery
                if (!dir) {
                     // Try to match generic /word/
                     const match = regStr.match(/\/\\([a-zA-Z0-9\-_]+)\\/);
                     if (match && match[1]) dir = '/' + match[1];
                }
            }
            
            layer.handle.stack.forEach((subLayer: any) => {
                this.printLayer(subLayer, basePath + dir, endpoints);
            });
        }
    }

    private static async syncWithDatabase(endpoints: DiscoveredEndpoint[]) {
        // Map endpoints to services based on URL patterns
        // Rules:
        // /api/pdf -> html-to-pdf
        // /api/ai -> ai-doc-generator
        // /services/ai-doc-generator -> ai-doc-generator
        // /services/docx-to-pdf -> docx-to-pdf
        
        const services = await prisma.service.findMany();
        
        for (const service of services) {
            const relevantEndpoints = endpoints.filter(e => {
                const p = e.path.toLowerCase();
                // Match by service slug in path
                if (p.includes('/' + service.slug)) return true;
                
                // Match by specific rules
                if (service.slug === 'html-to-pdf' && p.includes('/api/pdf')) return true;
                if (service.slug === 'ai-doc-generator' && p.includes('/api/ai')) return true;
                
                return false;
            });

            if (relevantEndpoints.length > 0) {
                const currentConfig = (service.config as any) || {};
                
                // Merge discovered with existing.
                // We don't delete existing hardcoded ones, just add discovered ones if missing.
                const existingList = currentConfig.endpoints || [];
                const merged = [...existingList];

                for (const disc of relevantEndpoints) {
                    const exists = merged.find((ex: any) => ex.path === disc.path && ex.method === disc.method);
                    if (!exists) {
                        merged.push({
                            path: disc.path,
                            method: disc.method,
                            billable: false, // Default to false, manual override required
                            description: 'Auto-discovered endpoint'
                        });
                    }
                }

                await prisma.service.update({
                    where: { id: service.id },
                    data: {
                        config: {
                            ...currentConfig,
                            endpoints: merged
                        }
                    }
                });
                console.log(`   Updated ${service.slug}: ${merged.length} endpoints.`);
            }
        }
    }
}
