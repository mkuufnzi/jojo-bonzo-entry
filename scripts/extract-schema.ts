
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const dirPath = path.join(process.cwd(), 'n8n', 'xls');

if (!fs.existsSync(dirPath)) {
    console.error(`Directory not found: ${dirPath}`);
    process.exit(1);
}

const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.xlsx'));
const allSchemas: any = {};

files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const workbook = XLSX.readFile(filePath);
    console.log(`\n📄 PROCESSING: ${file}`);
    
    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        if (jsonData.length > 0) {
            const headers = jsonData[0] as string[];
            const firstRow = jsonData.length > 1 ? jsonData[1] : null;
            
            // console.log(`   Running Sheet: ${sheetName}`);
            allSchemas[`${file}::${sheetName}`] = { headers, example: firstRow };
        }
    });
});

const outputPath = path.join(process.cwd(), 'n8n_schema_dump.json');
fs.writeFileSync(outputPath, JSON.stringify(allSchemas, null, 2));
console.log(`\n✅ Schema dumped to: ${outputPath}`);
