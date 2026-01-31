export enum ServiceFeature {
    AI_DOC_GENERATOR = 'ai-doc-generator',
    HTML_TO_PDF = 'html-to-pdf',
    TRANSACTIONAL_CORE = 'transactional-core'
}

export const RESTRICTED_SERVICES = [
    ServiceFeature.AI_DOC_GENERATOR,
    ServiceFeature.HTML_TO_PDF
];

export const IMPLEMENTED_SERVICES = [
    ServiceFeature.AI_DOC_GENERATOR,
    ServiceFeature.HTML_TO_PDF,
    ServiceFeature.TRANSACTIONAL_CORE,
    'transactional-branding'
];
