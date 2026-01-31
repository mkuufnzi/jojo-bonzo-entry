#!/usr/bin/env bash
# Run all E2E tests with proper environment

echo "🧪 Running E2E Test Suite"
echo "========================="
echo ""

TESTS=(
    "test-auth-session"
    "test-subscription-limits"
    "test-app-management"
    "test-pdf-billing"
    "test-ai-billing"
)

PASSED=0
FAILED=0

for TEST in "${TESTS[@]}"; do
    echo "▶️  Running $TEST..."
    if npx dotenv -e .env.test -- npx ts-node "src/scripts/e2e/${TEST}.ts" 2>&1 | tail -5; then
        ((PASSED++))
    else
        ((FAILED++))
        echo "❌ $TEST failed"
    fi
    echo ""
done

echo "========================="
echo "📊 Results: $PASSED passed, $FAILED failed"
