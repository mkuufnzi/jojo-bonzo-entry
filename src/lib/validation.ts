/**
 * Centralized Validation Library
 * Contains shared validation logic for the entire platform.
 */

// RFC 4122 compliant UUID v4 Regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates if the provided string is a valid UUID.
 * Throws an error if invalid, to enforce strict data integrity.
 * 
 * @param id The ID string to check
 * @param label The label of the field (e.g. 'floovioo_id') for error messaging
 */
export function validateUuid(id: string, label: string): void {
    if (!id || typeof id !== 'string') {
        throw new Error(`Invalid UUID for ${label}: ID is missing or not a string.`);
    }

    if (id === 'unknown' || id === 'system') {
        return; // Allow placeholders for early onboarding/system actions
    }

    if (!UUID_REGEX.test(id)) {
        throw new Error(`Invalid UUID for ${label}: '${id}' is not a valid UUID.`);
    }
}
