import { templateRegistry } from './src/services/template-registry.service';

async function verify() {
    console.log('--- Template Registry Verification ---');
    const all = templateRegistry.getAll();
    all.forEach(t => {
        console.log(`ID: ${t.id}`);
        console.log(`Name: ${t.name}`);
        console.log(`View Path: ${t.viewPath}`);
        console.log('---');
    });
    
    const revMachine = templateRegistry.getById('invoice_revenue_machine_v1');
    if (!revMachine) {
        console.error('CRITICAL: invoice_revenue_machine_v1 NOT FOUND in registry');
    } else {
        console.log('Found revenue machine manifest.');
    }
}

verify().catch(console.error);
