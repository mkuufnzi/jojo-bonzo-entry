import { RecoveryController } from '../src/modules/recovery/recovery.controller';

(async () => {
    try {
        const req = {
            body: {
                customerId: '3d05bb33-90a2-4469-b3d3-d254393d0898',
                clusterId: 'abb62075-37d8-4bdb-b747-d397979cee69'
            },
            user: { businessId: '8bc0766d-b529-4f82-808f-63d4b9c85d39', id: 'fake_user_id' },
            originalUrl: '/dashboard/recovery/clusters/move'
        } as any;

        const res = {
            locals: { user: { businessId: '8bc0766d-b529-4f82-808f-63d4b9c85d39', id: 'fake_user_id' } },
            json: (obj: any) => { console.log('JSON RESPONSE:', JSON.stringify(obj, null, 2)); return obj; },
            status: function(code: number) { console.log('STATUS:', code); return this; },
            render: (view: string, obj: any) => { console.log('RENDER:', view, obj); return obj; }
        } as any;

        console.log('Invoking moveCustomerCluster directly...');
        await RecoveryController.moveCustomerCluster(req, res);
        console.log('Complete!');
    } catch(err: any) {
        console.error('SCRIPT ERROR:', err.message, err.stack);
    }
})();
