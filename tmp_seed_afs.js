const { Client } = require('pg');

async function seed() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/floovioo'
    });

    try {
        await client.connect();
        
        console.log("Looking up user 'AFS Tools Test'...");
        const userRes = await client.query("SELECT * FROM \"User\" WHERE name LIKE '%AFS Tools%' LIMIT 1");
        if (userRes.rows.length === 0) {
            console.log("No user found");
            return;
        }
        const user = userRes.rows[0];
        let businessId = user.businessId;

        if (!businessId) {
            console.log("No direct business ID, looking for membership...");
            const memRes = await client.query("SELECT \"A\" as b_id FROM \"_BusinessToUser\" WHERE \"B\" = $1 LIMIT 1", [user.id]);
            if (memRes.rows.length > 0) {
                businessId = memRes.rows[0].b_id;
            } else {
                console.log("No business resolved.");
                return;
            }
        }
        
        console.log("Found Business ID: ", businessId);

        console.log("Checking integration...");
        const intgRes = await client.query("SELECT id FROM \"Integration\" WHERE \"businessId\" = $1 AND provider='mock_qb'", [businessId]);
        if (intgRes.rows.length === 0) {
            await client.query(`
                INSERT INTO "Integration" (id, "businessId", provider, "accessToken", status, "createdAt", "updatedAt") 
                VALUES (gen_random_uuid(), $1, 'mock_qb', 'mock', 'connected', NOW(), NOW())
            `, [businessId]);
        }

        console.log("Seeding customers...");
        for (let i = 1; i <= 5; i++) {
            await client.query(`
                INSERT INTO "UnifiedCustomer" (id, "businessId", "externalId", source, name, email, "totalSpent", "createdAt", "updatedAt")
                VALUES (gen_random_uuid(), $1, $2, 'mock_qb', $3, $4, $5, NOW(), NOW())
                ON CONFLICT DO NOTHING
            `, [businessId, 'CUST-' + i, 'Acme Corp ' + i, 'contact' + i + '@acme.com', Math.floor(Math.random() * 5000) + 1000]);
        }

        console.log("Seeding invoices...");
        for (let i = 1; i <= 30; i++) {
            const date = new Date();
            date.setDate(date.getDate() - Math.floor(Math.random() * 30));
            const amount = Math.floor(Math.random() * 900) + 100;
            const status = i % 4 === 0 ? 'overdue' : 'paid';
            const source = i % 2 === 0 ? 'mock_qb' : 'mock_zoho';

            await client.query(`
                INSERT INTO "UnifiedInvoice" (id, "businessId", "externalId", source, "customerId", amount, status, "issuedAt", "dueDate", "createdAt", "updatedAt")
                VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                ON CONFLICT DO NOTHING
            `, [businessId, 'INV-' + Date.now() + '-' + i, source, 'CUST-' + ((i%5)+1), amount, status, date, date]);
        }
        
        console.log("Success! Refresh dashboard.");
    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
        process.exit(0);
    }
}

seed();
