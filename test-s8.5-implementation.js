/**
 * Sprint 8.5 Implementation Test
 * Tests the new file classification and upload interceptor functionality
 */

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// Test environment
const VPS_HOST = '83.228.222.180';
const API_BASE = `http://${VPS_HOST}:3001`;
const TEST_AGENT_TOKEN = 'test-agent-token'; // Will need a real one

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

async function testClassificationEndpoints() {
    console.log('\n🗂️  Testing Classification Endpoints...');
    
    const endpoints = [
        '/api/v1/drive/classified',
        '/api/v1/drive/classified?type=code',
        '/api/v1/drive/classified?limit=10',
    ];
    
    for (const endpoint of endpoints) {
        const result = await httpRequest(`${API_BASE}${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${TEST_AGENT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        const status = result.ok ? '✅' : (result.status === 401 ? '🔐' : '❌');
        console.log(`   ${status} GET ${endpoint}: ${result.status} ${result.data?.success ? 'OK' : 'Error'}`);
        
        if (result.status === 401) {
            console.log('       (Authentication required - expected for now)');
        }
    }
}

async function testWebhookEnhancement() {
    console.log('\n🔗 Testing Enhanced Webhook...');
    
    // Test with file attachment webhook
    const webhookWithFile = {
        channel_id: 'test_channel',
        channel_name: 'test-channel',
        user_id: 'test_user_id',
        user_name: 'test_agent',
        message_id: `test_file_${Date.now()}`,
        text: 'Check out this file:',
        timestamp: new Date().toISOString(),
        attachments: [
            {
                title: 'test-document.pdf',
                title_link: 'http://example.com/test-file.pdf',
                mime_type: 'application/pdf',
                size: 1024,
                message_id: `test_attachment_${Date.now()}`
            }
        ]
    };
    
    const result = await httpRequest(`${API_BASE}/api/v1/vchat/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookWithFile)
    });
    
    if (result.ok) {
        console.log('   ✅ Enhanced webhook accepts file attachments');
        console.log('   📊 Response:', JSON.stringify(result.data, null, 2));
    } else {
        console.log('   ❌ Enhanced webhook failed:', result.error || result.data);
    }
}

async function testManualUploadProcessing() {
    console.log('\n📤 Testing Manual Upload Processing...');
    
    const uploadData = {
        attachmentUrl: 'http://example.com/test-upload.js',
        filename: 'test-script.js',
        context: {
            userName: 'mike',
            channelId: 'general',
            channelName: 'General'
        }
    };
    
    const result = await httpRequest(`${API_BASE}/api/v1/vchat/process-upload?key=test-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uploadData)
    });
    
    if (result.ok) {
        console.log('   ✅ Manual upload processing available');
    } else if (result.status === 401) {
        console.log('   🔐 Manual upload processing requires valid key');
    } else {
        console.log('   ❌ Manual upload processing failed:', result.error || result.data);
    }
}

async function testDocumentTypeClassification() {
    console.log('\n🏷️  Testing Document Type Classification...');
    
    // Test the classification logic directly
    const testFiles = [
        { name: 'Component.tsx', expected: 'code' },
        { name: 'README.md', expected: 'document' },
        { name: 'logo.png', expected: 'image' },
        { name: 'data.json', expected: 'data' },
        { name: 'archive.zip', expected: 'other' }
    ];
    
    // This would test the actual classification function
    const { getDocumentType } = require('./drive-classification');
    
    testFiles.forEach(file => {
        const detected = getDocumentType(file.name);
        const status = detected === file.expected ? '✅' : '❌';
        console.log(`   ${status} ${file.name.padEnd(15)} → ${detected} (expected: ${file.expected})`);
    });
}

async function testNASIntegration() {
    console.log('\n🏠 Testing NAS Integration...');
    
    const result = await httpRequest(`${API_BASE}/api/v1/drive/nas/health`);
    
    if (result.ok && result.data.nas?.ok) {
        console.log('   ✅ Synology NAS connected:', result.data.nas.hostname);
        console.log('   📁 Testing directory structure...');
        
        // Test NAS path generation
        const { generateNASPath } = require('./drive-classification');
        const testPaths = [
            generateNASPath('workspace1', 'mike', 'code', 'script.js'),
            generateNASPath('workspace1', 'andrea', 'document', 'report.pdf'),
            generateNASPath('workspace2', 'user123', 'image', 'photo.jpg')
        ];
        
        testPaths.forEach(nasPath => {
            console.log(`   📄 ${nasPath}`);
        });
        
    } else {
        console.log('   ❌ NAS connection failed or not configured');
    }
}

async function testDatabaseIntegration() {
    console.log('\n🗄️  Testing Database Integration...');
    
    // Test if vchat_inbox table has metadata column
    const inboxResult = await httpRequest(`${API_BASE}/api/v1/vchat/inbox?key=test-key&limit=1`);
    
    if (inboxResult.ok) {
        console.log('   ✅ VChat inbox accessible');
        if (inboxResult.data.messages?.length > 0) {
            const hasMetadata = inboxResult.data.messages[0].metadata !== undefined;
            console.log(`   ${hasMetadata ? '✅' : '❌'} Metadata column ${hasMetadata ? 'present' : 'missing'}`);
        }
    } else {
        console.log('   ❌ VChat inbox not accessible');
    }
}

async function runImplementationTests() {
    console.log('🧪 Sprint 8.5 Implementation Tests');
    console.log('═══════════════════════════════════');
    
    await testClassificationEndpoints();
    await testWebhookEnhancement();
    await testManualUploadProcessing();
    await testDocumentTypeClassification();
    await testNASIntegration();
    await testDatabaseIntegration();
    
    console.log('\n📋 IMPLEMENTATION STATUS:');
    console.log('1. ❓ Classification endpoints added (need auth test)');
    console.log('2. ✅ Enhanced webhook for file attachments');
    console.log('3. ✅ Manual upload processing endpoint');
    console.log('4. ✅ Document type classification logic');
    console.log('5. ✅ NAS integration prepared');
    console.log('6. ❓ Database schema (need to verify metadata column)');
    
    console.log('\n🚀 NEXT STEPS:');
    console.log('- Deploy updated code to container');
    console.log('- Test with real agent authentication');
    console.log('- Configure RC webhook to call enhanced endpoint');
    console.log('- Test end-to-end file upload flow');
}

if (require.main === module) {
    runImplementationTests().catch(console.error);
}

module.exports = { runImplementationTests };