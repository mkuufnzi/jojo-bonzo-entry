#!/bin/bash
# =============================================================================
# PREFLIGHT CHECK SCRIPT
# =============================================================================
# This script MUST pass before any Docker build. It validates:
# 1. Dependencies are installed
# 2. Prisma client is generated
# 3. TypeScript compiles without errors
# 4. Build succeeds
# 5. Environment variables are valid
# =============================================================================
# Usage: npm run preflight OR ./scripts/preflight.sh
# =============================================================================

set -e  # Exit on any error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "=========================================="
echo "  🚀 PREFLIGHT CHECKS"
echo "=========================================="
echo ""

# Track failures
FAILED=0

# Step 1: Check node_modules
echo -n "1. Checking dependencies... "
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing...${NC}"
    npm ci --silent
fi
echo -e "${GREEN}✓${NC}"

# Step 2: Prisma Generate
echo -n "2. Generating Prisma client... "
npx prisma generate --schema=prisma/schema.prisma > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Prisma generate failed${NC}"
    FAILED=1
fi

# Step 3: TypeScript Type Check
echo -n "3. Type checking... "
npx tsc --noEmit > /tmp/tsc_output.txt 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ TypeScript errors:${NC}"
    cat /tmp/tsc_output.txt | head -20
    FAILED=1
fi

# Step 4: Build
echo -n "4. Building project... "
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    FAILED=1
fi

# Step 5: Verify dist exists
echo -n "5. Verifying build output... "
if [ -d "dist" ] && [ -f "dist/index.js" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ dist/index.js not found${NC}"
    FAILED=1
fi

# Step 6: Verify views copied
echo -n "6. Verifying views... "
if [ -d "dist/views" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ dist/views not found${NC}"
    FAILED=1
fi

# Step 7: Environment file check
echo -n "7. Checking environment file... "
ENV_FILE=${1:-.env.development}
if [ -f "$ENV_FILE" ]; then
    echo -e "${GREEN}✓ ($ENV_FILE)${NC}"
else
    echo -e "${YELLOW}⚠ $ENV_FILE not found${NC}"
fi

echo ""
echo "=========================================="

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}  ✅ ALL PREFLIGHT CHECKS PASSED${NC}"
    echo "=========================================="
    echo ""
    echo "Ready for Docker build!"
    exit 0
else
    echo -e "${RED}  ❌ PREFLIGHT CHECKS FAILED${NC}"
    echo "=========================================="
    echo ""
    echo "Fix the errors above before proceeding."
    exit 1
fi
