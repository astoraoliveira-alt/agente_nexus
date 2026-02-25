// ==== 1️⃣ Gather token usage from the AI Agent node ==================
let agentTokens = {
    prompt: 0,
    completion: 0,
    total: 0,
};

try {
    const agentNode = $('AI Agent').first();

    // 1️⃣ Try LangChain's responseMetadata.tokenUsage
    const lcMeta = agentNode.json?.responseMetadata?.tokenUsage;
    if (lcMeta) {
        agentTokens = {
            prompt: lcMeta.promptTokens ?? 0,
            completion: lcMeta.completionTokens ?? 0,
            total: lcMeta.totalTokens ?? 0,
        };
    } else {
        // 2️⃣ Try raw OpenAI usage object (common in n8n OpenAI node)
        const usage = agentNode.json?.usage;
        if (usage) {
            agentTokens = {
                prompt: usage.prompt_tokens ?? 0,
                completion: usage.completion_tokens ?? 0,
                total: usage.total_tokens ?? 0,
            };
        } else {
            // 3️⃣ Fallback: look inside choices[0].message?.usage
            const altUsage = agentNode.json?.choices?.[0]?.message?.usage;
            if (altUsage) {
                agentTokens = {
                    prompt: altUsage.prompt_tokens ?? 0,
                    completion: altUsage.completion_tokens ?? 0,
                    total: altUsage.total_tokens ?? 0,
                };
            }
        }
    }
} catch (e) {
    // If anything goes wrong we keep the zeros
}

// ==== 2️⃣ Gather token usage from the Embedding (RAG) node ==============
let embeddingTokens = 0;
try {
    embeddingTokens = $('HTTP Request - Embedings (msg usr)').first().json?.usage?.total_tokens ?? 0;
} catch (e) {
    // keep 0
}

// ==== 3️⃣ Consolidate everything =======================================
const totalPromptTokens = agentTokens.prompt + embeddingTokens;
const totalCompletionTokens = agentTokens.completion;
const totalTokens = totalPromptTokens + totalCompletionTokens;

// ==== 4️⃣ Price Calculation =======================================
const PRICES = {
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 5.0, output: 15.0 },
};

const modelUsed = $('AI Agent').first().json?.model ?? 'gpt-4o-mini';
const price = PRICES[modelUsed] || PRICES['gpt-4o-mini'];

const costUSD = (totalPromptTokens / 1_000_000) * price.input +
    (totalCompletionTokens / 1_000_000) * price.output;
const BRL_RATE = 6.0;
const costBRL = costUSD * BRL_RATE;

// ==== 5️⃣ Return consolidated metrics =================================
return [{
    json: {
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        total_tokens: totalTokens,
        cost_usd: Number(costUSD.toFixed(6)),
        cost_brl: Number(costBRL.toFixed(6)),
        model: modelUsed,
        is_revenue_unit: true,
    },
}];
