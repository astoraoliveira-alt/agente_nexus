import { createClient } from '@supabase/supabase-js';

const url = 'https://wyfmyipbvoggusclwdhj.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzcwNDksImV4cCI6MjA4Njk1MzA0OX0.ALSvuPPm7QZd7rlmOMRkmBlzGE9-yjCgureTqDc2Yns';
const supabase = createClient(url, key);

async function check() {
    const { data, error } = await supabase.rpc('get_campaign_metrics_v2', {
        p_campaign_id: '04aa659f-db7a-4aab-8cb0-2ae78cb8d582',
        p_tenant_id: 'd290f1ee-6c54-4b01-90e6-d701748f0851'
    });
    
    console.log("Error:", error);
    console.log("Result:", data);
}
check();
