import { checkStorageLimit } from '../middleware/storage.middleware';

// Mock Express
const mockReq = (headers: any, method: string, user: any) => ({
    headers,
    method,
    user
} as any);

const mockRes = { locals: {} } as any;

const mockNext = (err?: any) => {
    if (err) {
        throw err;
    }
};

async function main() {
    console.log('🧪 Starting Unit Test: Storage Middleware');

    // Test 1: GET Request (Should Skip)
    try {
        console.log('Test 1: GET Request (Should pass)...');
        await checkStorageLimit(mockReq({}, 'GET', null), mockRes, mockNext);
        console.log('✅ PASS: GET Request skipped');
    } catch (e) {
        console.error('❌ FAIL: GET Request blocked', e);
        process.exit(1);
    }

    // Test 2: Small POST (Guest) - Pass
    try {
        console.log('Test 2: Small POST Guest (4MB)...');
        await checkStorageLimit(mockReq({ 'content-length': String(4 * 1024 * 1024) }, 'POST', null), mockRes, mockNext);
        console.log('✅ PASS: Small Guest POST passed');
    } catch (e) {
        console.error('❌ FAIL:', e);
        process.exit(1);
    }

    // Test 3: Large POST (Guest) - Fail
    try {
        console.log('Test 3: Large POST Guest (6MB)...');
        await checkStorageLimit(mockReq({ 'content-length': String(6 * 1024 * 1024) }, 'POST', null), mockRes, mockNext);
        console.error('❌ FAIL: Large Guest POST should have failed');
        process.exit(1);
    } catch (e: any) {
        if (e.statusCode === 413) console.log('✅ PASS: Large Guest POST blocked (413)');
        else { console.error('❌ FAIL: Wrong error code', e); process.exit(1); }
    }

    // Test 4: Pro User (40MB) - Pass
    try {
        console.log('Test 4: Pro User POST (40MB)...');
        const proUser = { id: 'u1', subscription: { plan: { name: 'Pro', price: 20 } } };
        await checkStorageLimit(mockReq({ 'content-length': String(40 * 1024 * 1024) }, 'POST', proUser), mockRes, mockNext);
        console.log('✅ PASS: Pro User Large POST passed');
    } catch (e) {
        console.error('❌ FAIL:', e);
        process.exit(1);
    }

     // Test 5: Pro User (60MB) - Fail
     try {
        console.log('Test 5: Pro User POST (60MB)...');
        const proUser = { id: 'u1', subscription: { plan: { name: 'Pro', price: 20 } } };
        await checkStorageLimit(mockReq({ 'content-length': String(60 * 1024 * 1024) }, 'POST', proUser), mockRes, mockNext);
        console.error('❌ FAIL: Pro User Huge POST should have failed');
        process.exit(1);
    } catch (e: any) {
        if (e.statusCode === 413) console.log('✅ PASS: Pro User Huge POST blocked (413)');
        else { console.error('❌ FAIL: Wrong error code', e); process.exit(1); }
    }

    console.log('🏆 ALL STORAGE TESTS PASSED');
}

main();
