import { Router } from 'express';
import { AdminController } from '../../controllers/admin';
import { requireAuth } from '../../middleware/session.middleware';
import { requireRole, ROLES, auditLog, injectPermissions } from '../../middleware/rbac.middleware';

const router = Router();

// Public Admin Routes
router.get('/login', AdminController.loginPage);
router.post('/login', AdminController.login);

// --- PROTECTED AREA ---
router.use(requireAuth);
router.use(injectPermissions); // Inject permissions for UI rendering

// Base Admin Access (Any Admin Role)
const ALL_ADMINS = [
    ROLES.ROOT, ROLES.CEO, ROLES.COO, ROLES.DEVOPS, ROLES.MARKETING, ROLES.SUPPORT
];
router.use(requireRole(ALL_ADMINS));

// Dashboard
router.get('/', requireRole(ALL_ADMINS), AdminController.index);
router.post('/verification/send', requireRole(ALL_ADMINS), AdminController.sendActionVerification);

// Features (CEO, COO, Marketing, Root)
const FEATURE_ROLES = [ROLES.ROOT, ROLES.CEO, ROLES.COO, ROLES.MARKETING];
router.get('/features', requireRole(FEATURE_ROLES), AdminController.listFeatures);
router.post('/features', requireRole(FEATURE_ROLES), auditLog('CREATE_FEATURE'), AdminController.createFeature);
router.get('/features/:id/edit', requireRole(FEATURE_ROLES), AdminController.editFeature);
router.post('/features/:id/update', requireRole(FEATURE_ROLES), auditLog('UPDATE_FEATURE'), AdminController.updateFeature);
router.post('/features/:id/toggle', requireRole(FEATURE_ROLES), auditLog('TOGGLE_FEATURE'), AdminController.toggleFeature);
router.post('/features/:id/delete', requireRole([ROLES.ROOT]), auditLog('DELETE_FEATURE'), AdminController.deleteFeature);

// Plans & Plan Features (CEO, Marketing, Root)
const PLAN_ROLES = [ROLES.ROOT, ROLES.CEO, ROLES.MARKETING];
router.get('/plan-features', requireRole(PLAN_ROLES), AdminController.managePlanFeatures);
router.post('/plan-features/toggle', requireRole(PLAN_ROLES), auditLog('TOGGLE_PLAN_FEATURE'), AdminController.togglePlanFeature);
router.get('/plans', requireRole(PLAN_ROLES), AdminController.listPlans);
router.get('/plans/:id/edit', requireRole([ROLES.ROOT]), AdminController.editPlan);
router.post('/plans/:id/update', requireRole([ROLES.ROOT]), auditLog('UPDATE_PLAN'), AdminController.updatePlan);
router.post('/plans/sync', requireRole(PLAN_ROLES), auditLog('SYNC_PLANS'), AdminController.syncPrices);


// Users (All admins + specific permissions for actions)
router.get('/users', requireRole(ALL_ADMINS), AdminController.listUsers);
router.post('/users/:id/ban', requireRole([ROLES.ROOT, ROLES.DEVOPS]), auditLog('BAN_USER'), AdminController.banUser);
router.post('/users/:id/unban', requireRole([ROLES.ROOT, ROLES.DEVOPS]), auditLog('UNBAN_USER'), AdminController.unbanUser);
router.get('/users/:id/ips', requireRole(ALL_ADMINS), AdminController.getUserIpHistory);
router.post('/users/:id/role', requireRole([ROLES.ROOT]), auditLog('UPDATE_USER_ROLE'), AdminController.updateUserRole);

// IP Bans (Root, DevOps only)
router.post('/ip-bans', requireRole([ROLES.ROOT, ROLES.DEVOPS]), auditLog('BAN_IP'), AdminController.banIp);
router.delete('/ip-bans/:id', requireRole([ROLES.ROOT, ROLES.DEVOPS]), auditLog('UNBAN_IP'), AdminController.unbanIp);

// Services (DevOps, Root)
const SERVICE_ROLES = [ROLES.ROOT, ROLES.DEVOPS];
router.get('/services', requireRole(SERVICE_ROLES), AdminController.listServices);
router.post('/services/sync', requireRole(SERVICE_ROLES), auditLog('SYNC_SERVICES'), AdminController.syncServices);
router.get('/services/:id/edit', requireRole(SERVICE_ROLES), AdminController.editService);
router.post('/services/:id/update', requireRole(SERVICE_ROLES), auditLog('UPDATE_SERVICE'), AdminController.updateService);
router.post('/services/:id/config', requireRole(SERVICE_ROLES), auditLog('UPDATE_SERVICE_CONFIG'), AdminController.updateServiceConfig);
router.post('/services/:id/rollback/:versionId', requireRole(SERVICE_ROLES), auditLog('ROLLBACK_SERVICE'), AdminController.rollbackService);

// Analytics Routes (Permission-based access)
router.get('/billing', requireRole([ROLES.ROOT, ROLES.CEO]), AdminController.listBilling);
router.get('/subscriptions', requireRole([ROLES.ROOT, ROLES.CEO, ROLES.COO]), AdminController.listSubscriptions);
router.post('/billing/sync-invoices', requireRole([ROLES.ROOT, ROLES.CEO]), auditLog('SYNC_INVOICES'), AdminController.syncInvoices);
router.get('/analytics', requireRole([ROLES.ROOT, ROLES.CEO, ROLES.COO, ROLES.DEVOPS, ROLES.MARKETING]), AdminController.listAnalytics);

export default router;
