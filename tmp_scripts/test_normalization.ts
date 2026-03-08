import { NormalizationEngine } from '../src/modules/unified-data/normalization.engine';

const mockQboInvoice = {
    Id: "145",
    DocNumber: "1038",
    TxnDate: "2024-03-01",
    DueDate: "2024-03-31",
    TotalAmt: 1540.25,
    Balance: 1540.25,
    CustomerRef: {
        value: "67",
        name: "Acme Corp"
    }
};

const mockQboCustomer = {
    Id: "67",
    DisplayName: "Acme Corp",
    PrimaryEmailAddr: {
        Address: "billing@acme.com"
    },
    PrimaryPhone: {
        FreeFormNumber: "555-1234"
    }
};

console.log("Testing Normalization Engine...");

console.log("\n--- QuickBooks Customer ---");
const customer = NormalizationEngine.normalizeCustomer('quickbooks', mockQboCustomer);
console.log(JSON.stringify(customer, null, 2));

console.log("\n--- QuickBooks Invoice ---");
const invoice = NormalizationEngine.normalizeInvoice('quickbooks', mockQboInvoice);
console.log(JSON.stringify(invoice, null, 2));

console.log("\nLooks good! Next step: Verify end-to-end sync using UI or API trigger.");
