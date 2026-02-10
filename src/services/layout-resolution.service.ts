/**
 * Layout Resolution Service v1.0
 * 
 * Single source of truth for widget layoutOrder resolution.
 * Used by both the Brand Editor sidebar and document preview to ensure
 * deterministic, synchronized widget ordering.
 * 
 * Architecture: Floovioo Transactional Branding Module
 */

import { logger } from '../lib/logger';
import { SmartTemplateManifest, TemplateFeature } from './template-registry.service';

/**
 * Resolved layout configuration passed to both sidebar and preview views.
 */
export interface ResolvedLayout {
    /** Ordered array of widget IDs to render */
    layoutOrder: string[];
    
    /** State of each widget (enabled, value for spacers, etc.) */
    widgetStates: Record<string, WidgetState>;
    
    /** Source of the resolved order for debugging */
    resolvedFrom: 'manifest' | 'database' | 'merged';
}

export interface WidgetState {
    enabled: boolean;
    value?: number | string; // For spacers: height in px
    required?: boolean;
    type?: string;
}

/**
 * Widget Registry: Maps widget IDs to their include paths.
 * Centralized here to ensure consistency between EJS rendering and configuration.
 */
export const WIDGET_REGISTRY: Record<string, string | null> = {
    'header': './components/header',
    'spacer_1': null, // Spacers render inline
    'spacer_2': null,
    'customer_info': './components/customer_info',
    'marketing_banner': '../../../components/smart-widgets/banner',
    'line_items': './components/line_items',
    'totals': './components/totals',
    'product_recommendations': '../../../components/smart-widgets/product-recommendations',
    'product_support': '../../../components/smart-widgets/tutorials',
    'payment_details': '../../../components/smart-widgets/payment-details',
    'customer_support': '../../../components/smart-widgets/support-card',
    'footer': './components/footer'
};

/**
 * Resolves the final layoutOrder and widget states from manifest and user profile.
 * 
 * Priority:
 * 1. User's saved layoutOrder (from profile.components.layoutOrder) if valid
 * 2. Manifest's default layoutOrder as fallback
 * 
 * Validation:
 * - User order must contain all required widget IDs
 * - Unknown IDs are filtered out
 * - Missing manifest IDs are appended to preserve all widgets
 * 
 * @param manifest - The template manifest with default layoutOrder and features
 * @param profileComponents - User's saved component configuration (may be null/undefined)
 * @returns Unified ResolvedLayout for both sidebar and preview rendering
 */
/**
 * Resolves the final layoutOrder and widget states from manifest and user profile.
 * 
 * V3.0 Self-Healing Algorithm:
 * 1. Sanitization: Filters out IDs from DB that are no longer valid.
 * 2. Reconciliation: Ensures all widgets from manifest (default + features) are present.
 * 3. Healing: Intelligently inserts missing mandatory widgets at their relative manifest positions.
 * 4. Preservation: Respects existing user order for widgets that are still valid.
 */
export function resolveLayout(
    manifest: SmartTemplateManifest,
    profileComponents?: Record<string, any> | null
): ResolvedLayout {
    const manifestOrder = manifest.layoutOrder || [];
    const manifestFeatures = manifest.features || [];
    
    // 1. Define Valid Widget IDs
    // Included items from manifestOrder, features, and the hardcoded registry
    const validIds = new Set([
        ...manifestOrder,
        ...manifestFeatures.map(f => f.id),
        ...Object.keys(WIDGET_REGISTRY)
    ]);
    
    // 2. Identify Mandatory IDs
    const requiredIds = new Set(
        manifestFeatures.filter(f => f.required).map(f => f.id)
    );

    // 3. Start with User Order (if exists)
    const savedOrder = (profileComponents?.layoutOrder as string[]) || [];
    let finalOrder: string[];
    let resolvedFrom: 'manifest' | 'database' | 'merged';

    if (savedOrder.length === 0) {
        // No saved order, use manifest defaults
        finalOrder = [...manifestOrder];
        resolvedFrom = 'manifest';
    } else {
        // 4. SANITIZATION: Filter out IDs that are no longer in the manifest or registry
        let reconciled = savedOrder.filter(id => validIds.has(id));
        
        // 5. HEALING: Ensure all IDs defined in the manifest exist in the order
        // We iterate manifestOrder to find items missing from the reconciled list
        const missingFromSaved = manifestOrder.filter(id => !reconciled.includes(id));
        
        if (missingFromSaved.length > 0) {
            resolvedFrom = 'merged';
            const healingActions: string[] = [];

            for (const id of missingFromSaved) {
                // Determine best insertion index based on manifest relative position
                const manifestIdx = manifestOrder.indexOf(id);
                
                if (manifestIdx === 0) {
                    // It's the first item in manifest, unshift it
                    reconciled.unshift(id);
                    healingActions.push(`Prepend ${id}`);
                } else {
                    // Find the predecessor from manifest that IS in our reconciled list
                    const predecessor = manifestOrder[manifestIdx - 1];
                    const predIdx = reconciled.indexOf(predecessor);
                    
                    if (predIdx !== -1) {
                        // Insert immediately after predecessor to maintain relative order
                        reconciled.splice(predIdx + 1, 0, id);
                        healingActions.push(`Insert ${id} after ${predecessor}`);
                    } else {
                        // Fallback: append
                        reconciled.push(id);
                        healingActions.push(`Append ${id}`);
                    }
                }
            }
            
            logger.warn({ 
                healingActions, 
                originalCount: savedOrder.length, 
                reconciledCount: reconciled.length 
            }, '[LayoutResolution] Self-healing performed for layoutOrder');
        } else {
            resolvedFrom = 'database';
        }
        
        finalOrder = reconciled;
    }

    // 6. Build widget states from profile and manifest defaults
    const widgetStates: Record<string, WidgetState> = {};
    
    // We iterate the finalOrder to ensure every widget that will be rendered has a resolved state
    for (const widgetId of finalOrder) {
        const feature = manifestFeatures.find(f => f.id === widgetId);
        const savedState = profileComponents?.[widgetId];
        
        // Determine enabled state
        let enabled: boolean;
        if (feature?.required) {
            enabled = true; // Required widgets are always enabled
        } else if (savedState !== undefined && savedState.enabled !== undefined) {
            enabled = savedState.enabled === true || savedState.enabled === 'true';
        } else if (feature?.defaultEnabled !== undefined) {
            enabled = feature.defaultEnabled;
        } else {
            enabled = true; // Default to enabled for unknown items
        }
        
        widgetStates[widgetId] = {
            enabled,
            value: savedState?.value ?? feature?.defaultValue,
            required: feature?.required,
            type: feature?.type
        };
    }
    
    logger.info({ 
        orderLength: finalOrder.length,
        resolvedFrom,
        firstFive: finalOrder.slice(0, 5) 
    }, '[LayoutResolution] Layout resolved');
    
    return {
        layoutOrder: finalOrder,
        widgetStates,
        resolvedFrom
    };
}

/**
 * Convenience function to get the include path for a widget ID.
 * Returns null for spacers (which render inline).
 */
export function getWidgetIncludePath(widgetId: string): string | null {
    return WIDGET_REGISTRY[widgetId] ?? null;
}

/**
 * Checks if a widget ID is a spacer (should render inline, not via include).
 */
export function isSpacer(widgetId: string): boolean {
    return widgetId.startsWith('spacer_');
}

/**
 * Checks if a widget ID is a landmark (header/footer - pinned position).
 */
export function isLandmark(widgetId: string): boolean {
    return widgetId === 'header' || widgetId === 'footer';
}
