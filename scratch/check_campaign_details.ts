import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from porteiro/.env
dotenv.config({ path: path.join(__dirname, '../porteiro/.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Error: Supabase credentials missing in porteiro/.env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runDiagnostics() {
    console.log('🔍 Connecting to Supabase...');
    
    // 1. Fetch campaigns
    const { data: campaigns, error: campError } = await supabase
        .from('campaigns')
        .select('id, name, status, created_at, reengagement_enabled, reengagement_template_id, metadata')
        .order('created_at', { ascending: false })
        .limit(10);

    if (campError) {
        console.error('❌ Error fetching campaigns:', campError);
        return;
    }

    if (!campaigns || campaigns.length === 0) {
        console.log('📭 No campaigns found.');
        return;
    }

    console.log(`\n📋 Recent Campaigns (Found: ${campaigns.length}):`);
    for (const c of campaigns) {
        const templateId = c.metadata?.template_id || 'N/A';
        console.log(`\n==================================================`);
        console.log(`🏷️ Campaign: "${c.name}"`);
        console.log(`🆔 ID: ${c.id}`);
        console.log(`⚡ Status: ${c.status} | Created: ${c.created_at}`);
        console.log(`📝 Template ID: ${templateId}`);
        console.log(`🔄 Re-engagement Enabled: ${c.reengagement_enabled || false}`);
        console.log(`🎯 Re-engagement Template: ${c.reengagement_template_id || 'N/A'}`);
        
        // 2. Fetch stats from outbound_queue
        const { data: queueStats, error: queueError } = await supabase
            .from('outbound_queue')
            .select('status, scheduled_at, metadata')
            .eq('campaign_id', c.id);

        if (queueError) {
            console.error(`❌ Error fetching queue stats for campaign ${c.id}:`, queueError);
            continue;
        }

        const total = queueStats.length;
        console.log(`📊 Total Leads in Outbound Queue: ${total}`);

        if (total > 0) {
            const statusCounts = queueStats.reduce((acc: Record<string, number>, curr: any) => {
                acc[curr.status] = (acc[curr.status] || 0) + 1;
                return acc;
            }, {});

            console.log('   Status Breakdown:');
            Object.entries(statusCounts).forEach(([status, count]) => {
                console.log(`   - ${status}: ${count}`);
            });

            // Date range
            const dates = queueStats
                .map((q: any) => q.scheduled_at)
                .filter(Boolean)
                .map((d: string) => new Date(d).getTime());

            if (dates.length > 0) {
                const minDate = new Date(Math.min(...dates));
                const maxDate = new Date(Math.max(...dates));
                console.log(`   📅 Scheduled from: ${minDate.toISOString()} to ${maxDate.toISOString()}`);
            }

            // Check metadata samples
            const missingPhones = queueStats.filter((q: any) => !q.metadata || (!q.metadata.content && !q.metadata.message)).length;
            const withTemplateId = queueStats.filter((q: any) => q.metadata?.template_id).length;

            console.log(`   🔍 Metadata Checks:`);
            console.log(`     - Leads with template_id in queue metadata: ${withTemplateId} / ${total}`);
            if (missingPhones > 0) {
                console.log(`     - ⚠️ WARNING: ${missingPhones} leads are missing message content in metadata!`);
            } else {
                console.log(`     - ✅ All leads have valid message contents in metadata.`);
            }

            if (queueStats[0]?.metadata) {
                console.log(`     - 📝 Sample Metadata fields:`, Object.keys(queueStats[0].metadata));
            }
        } else {
            console.log('   ⚠️ No leads are currently enqueued for this campaign.');
        }
    }
    console.log(`==================================================\n`);
}

runDiagnostics();
