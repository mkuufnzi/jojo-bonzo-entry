const { execSync } = require('child_process');

try {
    const psqlCommand = `psql -U postgres -d floovioo -p 5432 -c "
        SELECT 
            (SELECT COUNT(*) FROM \\"Integration\\" WHERE \\"businessId\\" = (SELECT id FROM \\"Business\\" WHERE id IN (SELECT \\"businessId\\" FROM \\"User\\" WHERE name LIKE '%AFS Tools%') LIMIT 1)) as integrations,
            (SELECT COUNT(*) FROM \\"UnifiedInvoice\\" WHERE \\"businessId\\" = (SELECT id FROM \\"Business\\" WHERE id IN (SELECT \\"businessId\\" FROM \\"User\\" WHERE name LIKE '%AFS Tools%') LIMIT 1)) as unified_invoices,
            (SELECT COUNT(*) FROM \\"ProcessedDocument\\" WHERE \\"businessId\\" = (SELECT id FROM \\"Business\\" WHERE id IN (SELECT \\"businessId\\" FROM \\"User\\" WHERE name LIKE '%AFS Tools%') LIMIT 1)) as processed_docs
    "`;
    console.log(execSync(psqlCommand).toString());
} catch (error) {
    console.error("Failed to execute raw SQL.");
    console.error(error.message);
}
