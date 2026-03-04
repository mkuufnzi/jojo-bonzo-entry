import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.join(__dirname, '..', 'src');

const replacements = [
    { from: /dunningSequence/g, to: 'debtCollectionSequence' },
    { from: /DunningSequence/g, to: 'DebtCollectionSequence' },
    { from: /recoverySession/g, to: 'debtCollectionSession' },
    { from: /RecoverySession/g, to: 'DebtCollectionSession' },
    { from: /dunningAction/g, to: 'debtCollectionAction' },
    { from: /DunningAction/g, to: 'DebtCollectionAction' },
    { from: /DunningActions/g, to: 'DebtCollectionActions' },
    { from: /recoverySessions/g, to: 'debtCollectionSessions' },
    { from: /dunningSequences/g, to: 'debtCollectionSequences' },
];

function processDirectory(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;
            for (const r of replacements) {
                content = content.replace(r.from, r.to);
            }
            if (original !== content) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated: ${fullPath}`);
            }
        }
    }
}

console.log("Starting massive DebtCollection codebase namespace migration...");
processDirectory(SRC_DIR);
console.log("Complete!");
