import { Prisma } from '@prisma/client';
import fs from 'fs';

async function main() {
    const fields = Object.values(Prisma.ServiceScalarFieldEnum);
    fs.writeFileSync('prisma_fields.txt', fields.join(', '));
    console.log('Fields written to prisma_fields.txt');
}

main().catch(e => {
    fs.writeFileSync('prisma_fields.txt', 'ERROR: ' + e.message);
});
