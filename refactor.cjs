const { Project, SyntaxKind } = require('ts-morph');
const fs = require('fs');

const project = new Project();
const sourceFile = project.addSourceFileAtPath('src/services/api.ts');

const apiVariable = sourceFile.getVariableDeclarationOrThrow('api');
const initializer = apiVariable.getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression);
const properties = initializer.getProperties();

const domains = {
    auth: ['signIn', 'signUp', 'signOut', 'resetPasswordForEmail', 'updatePassword', 'getCurrentSession', 'generateDeveloperKey'],
    users: ['getTenant', 'getUserById', 'getUsers', 'getUserByEmail', 'createUser', 'updateUserStatus', 'updateUserRole', 'updateUser', 'uploadUserAvatar', 'deleteUser', 'deleteTenant'],
    dashboard: ['getDashboardSummary', 'getTenantUsage'],
    plans: ['getPlans', 'updatePlan', 'createPlan', 'applyPlanToCompany', 'getDavosCosts', 'updateDavosCost'],
    agents: ['getAgents', 'createAgent', 'updateAgent', 'deleteAgent', 'getAgentTools', 'generateAvatar', 'updateAgentGovernance'],
    tools: ['getToolsList', 'getToolConfig', 'updateToolConfig', 'getKnowledgeBase', 'updateKnowledgeBase', 'uploadKnowledgeFile', 'deleteKnowledgeFile'],
    conversations: [
        'subscribeToConversations', 'getConversations', 'getConversationMessages', 'sendMessage', 'addInternalNote', 'resolveConversation',
        'transcribeAudioFromUrl', 'getConversationEvaluation', 'subscribeToMessages', 'triggerAudit', 'getConversationCost'
    ],
    capabilities: [
        'getResolvers', 'createResolver', 'updateResolver', 'deleteResolver', 'testResolver',
        'getPolicies', 'createPolicy', 'generatePolicySuggestions', 'deletePolicy',
        'getProtectedIntents', 'addProtectedIntent', 'removeProtectedIntent',
        'evaluateConversationSecurity'
    ],
    incidents: [
        'getIncidents', 'createIncident', 'deleteIncident', 'resolveIncident', 'uploadIncidentAttachment'
    ],
    campaigns: [
        'getOutboundQueue', 'addToOutboundQueue', 'getCampaigns', 'createCampaign', 'updateCampaign', 'deleteCampaign'
    ],
    financial: [
        'getFinancialReport'
    ]
};

// Also let's extract imports needed.
const existingImports = sourceFile.getImportDeclarations().map(i => i.getText()).join('\n');

const modules = {};

for (const prop of properties) {
    if (prop.getKind() === SyntaxKind.PropertyAssignment) {
        modules['base'] = modules['base'] || [];
        modules['base'].push(prop.getText());
    } else if (prop.getKind() === SyntaxKind.MethodDeclaration) {
        const name = prop.getName();
        let assignedDomain = 'core';
        for (const [domain, methods] of Object.entries(domains)) {
            if (methods.includes(name)) {
                assignedDomain = domain;
                break;
            }
        }
        modules[assignedDomain] = modules[assignedDomain] || [];
        modules[assignedDomain].push(prop.getText());
    }
}

// Generate the sub-service files
for (const [domain, content] of Object.entries(modules)) {
    if (domain === 'base') continue; // Skip persistent flags etc, leave in core

    let fileContent = existingImports + '\n\n';
    fileContent += `export const ${domain}Service = {\n`;
    fileContent += content.join(',\n\n');
    fileContent += '\n};\n';

    fs.writeFileSync(`src/services/${domain}.service.ts`, fileContent);
}

// Now replace api.ts to aggregate them
let newApiTs = existingImports + '\n\n';
const importedDomains = Object.keys(modules).filter(d => d !== 'base');
for (const d of importedDomains) {
    newApiTs += `import { ${d}Service } from './${d}.service';\n`;
}

newApiTs += `\nexport const api = {\n`;
if (modules['base']) newApiTs += modules['base'].join(',\n') + ',\n';
for (const d of importedDomains) {
    newApiTs += `...${d}Service,\n`;
}
newApiTs += `};\n`;

fs.writeFileSync('src/services/api.ts.new', newApiTs);
console.log('Done refactoring!');
