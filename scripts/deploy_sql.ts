import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

// Load env vars if needed, but we expect DATABASE_URL passed in command line
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('Error: DATABASE_URL environment variable is required.');
    console.error('Usage: DATABASE_URL="postgresql://..." npx tsx scripts/deploy_sql.ts');
    process.exit(1);
}

// Default to data_dump.sql if no arg provided
const fileName = process.argv[2] || 'database/data_dump.sql';
const filePath = path.resolve(process.cwd(), fileName);

if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`);
    console.error(`Usage: DATABASE_URL="..." npx tsx scripts/deploy_sql.ts [path/to/script.sql]`);
    process.exit(1);
}

async function deploy() {
    console.log(`Connecting to database...`);
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false } // Required for Supabase/AWS
    });

    try {
        await client.connect();
        console.log('Connected successfully.');

        console.log(`Reading SQL file: ${filePath}`);
        const sqlContent = fs.readFileSync(filePath, 'utf-8');

        console.log('Executing SQL...');
        const startTime = Date.now();

        // Execute the entire file as a single query/transaction block
        await client.query(sqlContent);

        const duration = (Date.now() - startTime) / 1000;
        console.log(`✅ Success! Data deployed in ${duration.toFixed(2)} seconds.`);

    } catch (err) {
        console.error('❌ Error executing SQL:', err);
    } finally {
        await client.end();
    }
}

deploy();
