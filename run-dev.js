const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
console.log(`🚀 Starting in UNC Safe Mode from: ${projectRoot}`);

// Helper to find executable script paths
const getScriptPath = (packageName, relativePath) => {
    return path.join(projectRoot, 'node_modules', packageName, relativePath);
};

const tscPath = getScriptPath('typescript', 'bin/tsc');
const shxPath = getScriptPath('shx', 'lib/cli.js');
// Prisma CLI is complex, typically local-installation/bin. 
// We will try standard location.
const prismaPath = getScriptPath('prisma', 'build/index.js');

const runNode = (scriptPath, args, name) => {
    return new Promise((resolve, reject) => {
        console.log(`\n[${name}] Executing directly: node ${path.basename(scriptPath)} ${args.join(' ')}`);

        // Spawn NODE directly, NO SHELL.
        const proc = spawn(process.execPath, [scriptPath, ...args], {
            cwd: projectRoot,
            env: process.env,
            stdio: 'inherit',
            shell: false // <--- The magic fix. cmd.exe is NOT invited.
        });

        proc.on('close', (code) => {
            if (code === 0) {
                console.log(`✅ [${name}] Complete`);
                resolve();
            } else {
                console.error(`❌ [${name}] Failed with code ${code}`);
                reject(code);
            }
        });

        proc.on('error', (err) => {
            console.error(`❌ [${name}] Error spawning: ${err.message}`);
            reject(err);
        });
    });
};

const main = async () => {
    try {
        if (!fs.existsSync(tscPath)) {
            throw new Error(`Cannot find typescript at ${tscPath}. Run 'npm install' first.`);
        }

        // 1. Build TypeScript
        // Pass absolute path to tsconfig to be super safe
        const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
        await runNode(tscPath, ['-p', tsConfigPath], 'TypeScript Build');

        // 2. Copy Views
        await runNode(shxPath, ['cp', '-r', 'src/views', 'dist/views'], 'Copy Views');

        // 3. Prisma Generate (Try/Catch this as path varies)
        try {
            if (fs.existsSync(prismaPath)) {
                await runNode(prismaPath, ['generate', '--schema', path.join(projectRoot, 'prisma/schema.prisma')], 'Prisma Generate');
            } else {
                console.warn('⚠️  Prisma binary not found standard location, skipping generate.');
            }
        } catch (e) {
            console.warn('⚠️  Prisma generate failed, skipping (might be ok if already generated).');
        }

        // 4. Start App
        console.log('\n🟢 Starting Application...');
        const appPath = path.join(projectRoot, 'dist', 'index.js');
        await runNode(appPath, [], 'App Server');

    } catch (err) {
        console.error('\n💥 Startup Failed:', err);
        process.exit(1);
    }
};

main();
