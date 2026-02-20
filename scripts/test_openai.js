
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const apiKey = process.env.VITE_OPENAI_API_KEY;

if (!apiKey) {
    console.error('❌ Error: VITE_OPENAI_API_KEY not found in .env.local');
    process.exit(1);
}

console.log('--- OpenAI Key Diagnostic ---');
console.log(`Key Length: ${apiKey.length}`);
console.log(`Key Prefix: ${apiKey.substring(0, 15)}...`);
console.log(`Key Suffix: ...${apiKey.substring(apiKey.length - 4)}`);

async function testKey() {
    console.log('\nTesting Chat Completions API...');
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: 'Hello, are you there?' }],
                max_tokens: 5
            })
        });

        const data = await response.json();

        if (response.ok) {
            console.log('✅ Success! API Key is valid and working.');
            console.log('Response:', data.choices[0].message.content);
        } else {
            console.log(`❌ Failed. Status: ${response.status}`);
            console.log('Error Data:', JSON.stringify(data, null, 2));

            if (response.status === 401) {
                console.log('\nPossible reasons for 401:');
                console.log('1. The key has been revoked.');
                console.log('2. The key is from a different organization/project than expected.');
                console.log('3. There is an extra character or missing part in the .env.local file.');
            }
        }
    } catch (error) {
        console.error('❌ Network error:', error.message);
    }
}

testKey();
