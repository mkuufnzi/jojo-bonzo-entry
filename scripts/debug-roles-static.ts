
import { ROLE_PERMISSIONS, ROLES } from '../src/config/roles';

console.log('--- Debugging Roles ---');
console.log('ROLES:', ROLES);
console.log('ROLE_PERMISSIONS Keys:', Object.keys(ROLE_PERMISSIONS));
console.log('ROOT Permissions Count:', (ROLE_PERMISSIONS['ROOT'] || []).length);
console.log('ROOT Permissions Sample:', (ROLE_PERMISSIONS['ROOT'] || []).slice(0, 5));
