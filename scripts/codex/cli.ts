
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';

// --- Interfaces ---
interface Feature {
    name: string;
    description: string;
    files: string[];
    associated_constraints: string[];
    last_updated?: string;
}

interface Constraint {
    description: string;
    technical_detail: string;
    severity: 'WARNING' | 'CRITICAL' | 'INFO';
    created_at?: string;
}

// --- Logic ---
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    // Default to local if no env var
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    const redis = new Redis(redisUrl);

    redis.on('error', (err) => {
        console.error('Redis Error:', err.message);
        process.exit(1);
    });

    try {
        if (!command || command === 'help') {
            printHelp();
            return;
        }

        if (command === 'save-feature') {
            const name = args[1];
            const jsonPath = args[2];
            if (!name || !jsonPath) throw new Error('Usage: save-feature <name> <json-file-path>');
            
            const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            content.last_updated = new Date().toISOString();
            
            const key = `codex:feature:${name}`;
            await redis.set(key, JSON.stringify(content));
            console.log(`✅ Feature saved: ${key}`);
            return;
        }

        if (command === 'save-constraint') {
            const name = args[1];
            const jsonPath = args[2];
            if (!name || !jsonPath) throw new Error('Usage: save-constraint <name> <json-file-path>');
            
            const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            content.created_at = content.created_at || new Date().toISOString();
            
            const key = `codex:constraint:${name}`;
            await redis.set(key, JSON.stringify(content));
            console.log(`✅ Constraint saved: ${key}`);
            return;
        }

        if (command === 'save-file-context') {
            const filePath = args[1];
            const jsonPath = args[2];
            if (!filePath || !jsonPath) throw new Error('Usage: save-file-context <relative-path> <json-file-path>');
            
            const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            content.last_updated = new Date().toISOString();
            
            const key = `codex:file:${filePath}`;
            await redis.set(key, JSON.stringify(content));
            console.log(`✅ File Context saved: ${key}`);
            return;
        }

        if (command === 'get-context') {
            const featureName = args[1];
            if (!featureName) throw new Error('Usage: get-context <feature-name>');
            
            const featureKey = `codex:feature:${featureName}`;
            const featureRaw = await redis.get(featureKey);
            
            if (!featureRaw) {
                console.error(`❌ Feature not found: ${featureName}`);
                return;
            }

            const feature = JSON.parse(featureRaw) as Feature;
            console.log(`\n📘 FEATURE: ${feature.name}`);
            console.log(`   ${feature.description}`);
            console.log(`   Files: ${feature.files.length}, Constraints: ${feature.associated_constraints?.length || 0}`);

            // Fetch Constraints
            if (feature.associated_constraints && feature.associated_constraints.length) {
                console.log('\n🔒 CONSTRAINTS:');
                const constraintKeys = feature.associated_constraints.map(c => `codex:constraint:${c}`);
                if (constraintKeys.length > 0) {
                     const constraints = await redis.mget(constraintKeys);
                     constraints.forEach((c, idx) => {
                         if (c) {
                             const parsed = JSON.parse(c) as Constraint;
                             console.log(`   [${parsed.severity}] ${feature.associated_constraints[idx]}: ${parsed.description}`);
                         } else {
                             console.log(`   [MISSING] ${feature.associated_constraints[idx]}`);
                         }
                     });
                }
            }

            // Fetch File Contexts
            if (feature.files && feature.files.length) {
                console.log('\n📂 FILES:');
                const fileKeys = feature.files.map(f => `codex:file:${f}`);
                if (fileKeys.length > 0) {
                    const files = await redis.mget(fileKeys);
                    files.forEach((f, idx) => {
                        if (f) {
                            const parsed = JSON.parse(f);
                            if (parsed.fragility_score) {
                                console.log(`   📄 ${feature.files[idx]} (Fragility: ${parsed.fragility_score})`);
                            } else {
                                console.log(`   📄 ${feature.files[idx]}`);
                            }
                        } else {
                             console.log(`   📄 ${feature.files[idx]}`);
                        }
                    });
                }
            }
            return;
        }

        // Generic Scan
        if (command === 'scan') {
             const keys = await redis.keys('codex:*');
             console.log(`Found ${keys.length} Codex entries.`);
             keys.forEach(k => console.log(` - ${k}`));
             return;
        }

        console.error('Unknown command:', command);
        printHelp();

    } catch (e: any) {
        console.error('❌ Error:', e.message);
    } finally {
        await redis.quit();
    }
}

function printHelp() {
    console.log(`
Codex CLI - Manage Agentic Knowledge Graph

Usage:
  ts-node scripts/codex/cli.ts save-feature <name> <json-file>
  ts-node scripts/codex/cli.ts save-constraint <name> <json-file>
  ts-node scripts/codex/cli.ts save-file-context <path> <json-file>
  ts-node scripts/codex/cli.ts get-context <feature-name>
  ts-node scripts/codex/cli.ts scan
    `);
}

main();
