export const ThermalReceiptManifest = {
    id: "receipt_thermal",
    name: "Thermal Receipt",
    type: "RECEIPT",
    description: "Compact POS-style layout optimized for thermal printers and email snippets.",
    version: "1.0.0",
    features: [
        {
            id: "barcode",
            name: "Order Barcode",
            type: "toggle",
            defaultEnabled: true
        },
        {
            id: "loyalty_points",
            name: "Loyalty Points Balance",
            type: "toggle",
            defaultEnabled: true
        }
    ]
};
