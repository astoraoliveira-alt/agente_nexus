const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const viteUrlMatch = envFile.match(/VITE_SUPABASE_URL=(.*)/);
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5Zm15aXBidm9nZ3VzY2x3ZGhqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTM3NzA0OSwiZXhwIjoyMDg2OTUzMDQ5fQ.Q6bb7A6ZqPyxf-rIjPRu5rJlfmOhmJyusnOtpjy9GMU';

const supabase = createClient(viteUrlMatch[1].trim(), serviceKey);

async function checkLinkTermo() {
  const { data: agents, error } = await supabase.from('agents').select('id, name, brain_config, workflow_blueprint');
  if (error) {
    console.error('Error fetching agents:', error);
    return;
  }
  for (const a of agents) {
    const str = JSON.stringify(a);
    if (str.includes('LINK_TERMO_FISERV') || str.includes('Termo completo')) {
      console.log(`Agent ${a.name} (${a.id}) has Termo/LINK_TERMO_FISERV!`);
      if (a.workflow_blueprint && a.workflow_blueprint.steps) {
        for (const [stepName, stepData] of Object.entries(a.workflow_blueprint.steps)) {
          const stepStr = JSON.stringify(stepData);
          if (stepStr.includes('LINK_TERMO_FISERV') || stepStr.includes('Termo completo')) {
            console.log(`  Step [${stepName}]:`, stepData.rules);
          }
        }
      }
      if (a.brain_config) {
        const brainStr = JSON.stringify(a.brain_config);
        if (brainStr.includes('LINK_TERMO_FISERV') || brainStr.includes('Termo completo')) {
          console.log(`  Brain config contains string!`);
        }
      }
    }
  }
}

checkLinkTermo();
