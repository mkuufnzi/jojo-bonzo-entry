/**
 * PREFLIGHT CHECK SCRIPT (Windows/Cross-platform)
 * =============================================================================
 * This script MUST pass before any Docker build.
 * Run: npm run preflight OR node scripts/preflight.js
 * =============================================================================
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let failed = false;

function log(step, message, status) {
    const icon = status === 'pass' ? `${GREEN}✓${RESET}` 
                : status === 'fail' ? `${RED}✗${RESET}` 
                : `${YELLOW}⚠${RESET}`;
    console.log(`${step}. ${message} ${icon}`);
}

function run(cmd, silent = true) {
    try {
        execSync(cmd, { 
            stdio: silent ? 'pipe' : 'inherit',
            encoding: 'utf8'
        });
        return true;
    } catch (e) {
        return false;
    }
}

console.log('\n==========================================');
console.log('  🚀 PREFLIGHT CHECKS');
console.log('==========================================\n');

// Step 1: Check node_modules
process.stdout.write('1. Checking dependencies... ');
if (!fs.existsSync('node_modules')) {
    console.log(`${YELLOW}Installing...${RESET}`);
    if (!run('npm ci')) {
        log('1', 'npm ci failed', 'fail');
        failed = true;
    }
}
console.log(`${GREEN}✓${RESET}`);

// Step 2: Check Prisma Client Exists
process.stdout.write('2. Checking Prisma client... ');
const prismaClientPath = path.join('node_modules', '.prisma', 'client', 'index.js');
if (fs.existsSync(prismaClientPath)) {
    console.log(`${GREEN}✓${RESET}`);
} else {
    // Try to generate
    console.log(`${YELLOW}Generating...${RESET}`);
    if (run('npx prisma generate')) {
        console.log(`   ${GREEN}✓ Generated${RESET}`);
    } else {
        console.log(`   ${RED}✗ Prisma generate failed${RESET}`);
        console.log('   Run: npx prisma generate manually');
        failed = true;
    }
}

// Step 3: TypeScript Type Check
process.stdout.write('3. Type checking... ');
if (run('npx tsc --noEmit')) {
    console.log(`${GREEN}✓${RESET}`);
} else {
    console.log(`${RED}✗ TypeScript errors found${RESET}`);
    console.log('   Run: npx tsc --noEmit to see details');
    failed = true;
}

// Step 4: Build
process.stdout.write('4. Building project... ');
if (run('npm run build')) {
    console.log(`${GREEN}✓${RESET}`);
} else {
    console.log(`${RED}✗ Build failed${RESET}`);
    failed = true;
}

// Step 5: Verify dist exists
process.stdout.write('5. Verifying build output... ');
if (fs.existsSync('dist/index.js')) {
    console.log(`${GREEN}✓${RESET}`);
} else {
    console.log(`${RED}✗ dist/index.js not found${RESET}`);
    failed = true;
}

// Step 6: Verify views copied
process.stdout.write('6. Verifying views... ');
if (fs.existsSync('dist/views')) {
    console.log(`${GREEN}✓${RESET}`);
} else {
    console.log(`${RED}✗ dist/views not found${RESET}`);
    failed = true;
}

// Step 7: Environment file check
const envFile = process.argv[2] || '.env.development';
process.stdout.write(`7. Checking environment file... `);
if (fs.existsSync(envFile)) {
    console.log(`${GREEN}✓ (${envFile})${RESET}`);
} else {
    console.log(`${YELLOW}⚠ ${envFile} not found${RESET}`);
}

console.log('\n==========================================');

if (!failed) {
    console.log(`${GREEN}  ✅ ALL PREFLIGHT CHECKS PASSED${RESET}`);
    console.log('==========================================\n');
    console.log('Ready for Docker build!');
    process.exit(0);
} else {
    console.log(`${RED}  ❌ PREFLIGHT CHECKS FAILED${RESET}`);
    console.log('==========================================\n');
    console.log('Fix the errors above before proceeding.');
    process.exit(1);
}
