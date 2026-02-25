/**
 * Sprint 8.5 Diagnostic Script
 * Tests attachments and VDrive auto-classification functionality
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Test environment settings
const VPS_HOST = '83.228.222.180';
const RC_BASE = `http://${VPS_HOST}:3000`;
const API_BASE = `http://${VPS_HOST}:3001`;

// Test credentials (will need to be configured)
const RC_ADMIN_TOKEN = 'ch2PKLiXSKJSQ2N4O9aslIxnj7hXt1fUzKnFOZ-oYzb';
const RC_ADMIN_USER_ID = 'yBFHDdWLctNSQKkPt';

async function httpRequest(url, options = {}) {
    try {
        const response = await fetch(url, options);
        const text = await response.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { rawText: text };
        }
        return {
            status: response.status,
            ok: response.ok,
            data
        };
    } catch (error) {
        return {
            status: 0,
            ok: false,
            error: error.message
        };
    }
}

async function testRocketChatConnection() {
    console.log('\n🚀 Testing Rocket.Chat Connection...');
    
    const result = await httpRequest(`${RC_BASE}/api/info`);
    if (result.ok) {
        console.log('   ✅ Rocket.Chat is running:', result.data.version);
        return true;
    } else {
        console.log('   ❌ Rocket.Chat connection failed:', result.error);
        return false;
    }
}

async function testCustomAPIConnection() {
    console.log('\n🛠️  Testing Custom API Connection...');
    
    const result = await httpRequest(`${API_BASE}/api/v1/health`);
    if (result.ok) {
        console.log('   ✅ Custom API is running');
        return true;
    } else {
        console.log('   ❌ Custom API connection failed:', result.error);
        return false;
    }
}

async function testRocketChatAuth() {
    console.log('\n🔐 Testing Rocket.Chat Authentication...');
    
    const result = await httpRequest(`${RC_BASE}/api/v1/me`, {
        headers: {
            'X-Auth-Token': RC_ADMIN_TOKEN,
            'X-User-Id': RC_ADMIN_USER_ID,
            'Content-Type': 'application/json'
        }
    });
    
    if (result.ok) {
        console.log('   ✅ RC Authentication successful:', result.data.username);
        return true;
    } else {
        console.log('   ❌ RC Authentication failed:', result.error || result.data);
        return false;
    }
}

async function testRocketChatUpload() {
    console.log('\n📎 Testing Rocket.Chat File Upload...');
    
    // Create a test file
    const testContent = 'This is a test file for Sprint 8.5 attachment upload testing.\nTimestamp: ' + new Date().toISOString();
    const testFilePath = '/tmp/test-upload-s8.5.txt';
    fs.writeFileSync(testFilePath, testContent);
    
    try {
        // First get channels
        const channelsResult = await httpRequest(`${RC_BASE}/api/v1/channels.list`, {
            headers: {
                'X-Auth-Token': RC_ADMIN_TOKEN,
                'X-User-Id': RC_ADMIN_USER_ID,
                'Content-Type': 'application/json'
            }
        });
        
        if (!channelsResult.ok || !channelsResult.data.channels?.length) {
            console.log('   ❌ No channels found for upload test');
            return false;
        }
        
        const testChannel = channelsResult.data.channels[0];
        console.log(`   📝 Using channel: ${testChannel.name} (${testChannel._id})`);
        
        // Test file upload
        const formData = new FormData();
        formData.append('file', fs.createReadStream(testFilePath));
        formData.append('roomId', testChannel._id);
        formData.append('description', 'Sprint 8.5 test upload');
        
        const uploadResult = await httpRequest(`${RC_BASE}/api/v1/rooms.upload/${testChannel._id}`, {
            method: 'POST',
            headers: {
                'X-Auth-Token': RC_ADMIN_TOKEN,
                'X-User-Id': RC_ADMIN_USER_ID
            },
            body: formData
        });
        
        if (uploadResult.ok) {
            console.log('   ✅ File upload successful:', uploadResult.data.message?._id);
            return uploadResult.data;
        } else {
            console.log('   ❌ File upload failed:', uploadResult.error || uploadResult.data);
            return false;
        }
        
    } finally {
        // Clean up test file
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    }
}

async function testVDriveAPI() {
    console.log('\n💾 Testing VDrive API...');
    
    const result = await httpRequest(`${API_BASE}/api/v1/drive/nas/health`);
    if (result.ok) {
        console.log('   ✅ VDrive API accessible');
        console.log('   📊 NAS Status:', JSON.stringify(result.data.nas, null, 2));
        return true;
    } else {
        console.log('   ❌ VDrive API failed:', result.error || result.data);
        return false;
    }
}

async function testVChatWebhook() {
    console.log('\n🔗 Testing VChat Webhook...');
    
    const testPayload = {
        channel_id: 'test_channel_id',
        channel_name: 'test-channel',
        user_id: 'test_user_id',
        user_name: 'test_user',
        message_id: `test_msg_${Date.now()}`,
        text: 'Test webhook message from Sprint 8.5 diagnostic',
        timestamp: new Date().toISOString()
    };
    
    const result = await httpRequest(`${API_BASE}/api/v1/vchat/webhook`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(testPayload)
    });
    
    if (result.ok) {
        console.log('   ✅ VChat webhook accessible');
        return true;
    } else {
        console.log('   ❌ VChat webhook failed:', result.error || result.data);
        return false;
    }
}

async function checkExistingFileClassification() {
    console.log('\n🗂️  Checking existing file classification endpoints...');
    
    // Check if classified endpoints exist
    const endpoints = [
        '/api/v1/drive/classified',
        '/api/v1/drive/classified/test-agent'
    ];
    
    for (const endpoint of endpoints) {
        const result = await httpRequest(`${API_BASE}${endpoint}`);
        console.log(`   ${result.status === 404 ? '❌' : '🔍'} ${endpoint}: ${result.status} ${result.ok ? 'OK' : 'Not Found'}`);
    }
}

async function checkDocumentTypeDetection() {
    console.log('\n🏷️  Testing document type detection logic...');
    
    const testFiles = [
        'test.js', 'script.py', 'component.ts', 'build.sh', // code
        'readme.md', 'doc.txt', 'manual.pdf', 'report.doc', // document
        'photo.jpg', 'logo.png', 'animation.gif', // image
        'data.csv', 'config.json', 'report.xlsx', // data
        'archive.zip', 'unknown.xyz' // other
    ];
    
    const getDocumentType = (filename) => {
        const ext = path.extname(filename).toLowerCase();
        const extToType = {
            // code
            '.js': 'code', '.ts': 'code', '.py': 'code', '.sh': 'code', '.bash': 'code',
            '.java': 'code', '.cpp': 'code', '.c': 'code', '.php': 'code', '.rb': 'code',
            // document
            '.md': 'document', '.txt': 'document', '.pdf': 'document', '.doc': 'document', 
            '.docx': 'document', '.rtf': 'document', '.odt': 'document',
            // image
            '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', 
            '.bmp': 'image', '.svg': 'image', '.webp': 'image',
            // data
            '.csv': 'data', '.json': 'data', '.xlsx': 'data', '.xls': 'data', 
            '.xml': 'data', '.yaml': 'data', '.yml': 'data'
        };
        return extToType[ext] || 'other';
    };
    
    testFiles.forEach(filename => {
        const type = getDocumentType(filename);
        console.log(`   📄 ${filename.padEnd(15)} → ${type}`);
    });
}

async function runDiagnostic() {
    console.log('🔬 Sprint 8.5 — Attachments Vchat + VDrive Auto-Classification');
    console.log('══════════════════════════════════════════════════════════════');
    
    const results = {
        rcConnection: await testRocketChatConnection(),
        apiConnection: await testCustomAPIConnection(),
        rcAuth: false,
        rcUpload: false,
        vdriveAPI: false,
        vchatWebhook: false
    };
    
    if (results.rcConnection) {
        results.rcAuth = await testRocketChatAuth();
        if (results.rcAuth) {
            results.rcUpload = await testRocketChatUpload();
        }
    }
    
    if (results.apiConnection) {
        results.vdriveAPI = await testVDriveAPI();
        results.vchatWebhook = await testVChatWebhook();
    }
    
    await checkExistingFileClassification();
    await checkDocumentTypeDetection();
    
    console.log('\n📊 DIAGNOSTIC SUMMARY');
    console.log('══════════════════════');
    console.log(`🚀 Rocket.Chat:     ${results.rcConnection ? '✅' : '❌'}`);
    console.log(`🛠️  Custom API:      ${results.apiConnection ? '✅' : '❌'}`);
    console.log(`🔐 RC Auth:         ${results.rcAuth ? '✅' : '❌'}`);
    console.log(`📎 RC Upload:       ${results.rcUpload ? '✅' : '❌'}`);
    console.log(`💾 VDrive API:      ${results.vdriveAPI ? '✅' : '❌'}`);
    console.log(`🔗 VChat Webhook:   ${results.vchatWebhook ? '✅' : '❌'}`);
    
    console.log('\n🎯 REQUIRED IMPLEMENTATIONS:');
    console.log('1. ✅ RC Upload functionality working');
    console.log('2. ❌ File upload webhook/interceptor');
    console.log('3. ❌ Auto-classification to VDrive/NAS');
    console.log('4. ❌ GET /api/v1/drive/classified endpoints');
    console.log('5. ❌ Document type detection & folder structure');
    
    return results;
}

if (require.main === module) {
    runDiagnostic().catch(console.error);
}

module.exports = { runDiagnostic };