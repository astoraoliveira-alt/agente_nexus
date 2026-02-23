const context = { tenantId: '123', agentId: '456' };
const conversationId = "789";
console.log(JSON.stringify({ record: { id: conversationId, ...context } }));

const a2 = "abc";
console.log(JSON.stringify({ record: { id: a2 } }));
