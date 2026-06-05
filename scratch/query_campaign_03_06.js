import { createClient } from '@supabase/supabase-js';

async function run() {
    const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';
    const supabase = createClient(url, key);

    const campaignId = 'a3a9ec7e-af4d-40a2-ba22-a2d1e189981d';

    let allQueue = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('outbound_queue')
            .select('status, error_message, sent_at')
            .eq('campaign_id', campaignId)
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error("Error querying queue statuses:", error);
            break;
        }

        allQueue = allQueue.concat(data);
        if (data.length < pageSize) {
            hasMore = false;
        } else {
            page++;
        }
    }

    console.log("Total fetched from outbound_queue:", allQueue.length);
    const statuses = {};
    let nullSentAtCount = 0;
    let sentAtCount = 0;
    
    allQueue.forEach(q => {
        statuses[q.status] = (statuses[q.status] || 0) + 1;
        if (q.sent_at) sentAtCount++;
        else nullSentAtCount++;
    });
    
    console.log("outbound_queue counts (paginated):", statuses);
    console.log(`sent_at is set: ${sentAtCount}, sent_at is null: ${nullSentAtCount}`);
}

run();
