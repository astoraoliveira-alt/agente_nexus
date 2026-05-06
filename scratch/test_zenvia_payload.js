const testCtaLink = "https://fiservcapital.moneymoneyinvest.com.br/ticket/solicite-agora?t=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbnBqIjoiOTg1ODkwOTYwMDA1MDEiLCJjbnBqX3Nhbml0YXplIjoiOTg1ODkwOTYwMDA1MDEiLCJlbWFpbCI6IlNVUEVSTEVOWkBURVJSQS5DT00uQlIiLCJub21lTG9qYSI6IkxFTlogJiBDSUEgTFREQSIsInBob25lIjpudWxsLCJyb290X2NucGoiOiI5ODU4OTA5NiJ9.qpNnQgD3o6KRnRFcCPeaNhL9rFnTmTudL2OrLX4hi4A&c=2";
const message = "Olá Cliente!";
const templateId = "7365e4db-a380-40ed-87ed-d29141c2360a";

function buildZenviaPayload(templateId, ctaLink, message) {
    let contents;
    if (templateId) {
        let linkSuffix = '';
        if (ctaLink && ctaLink.includes('?t=')) {
            linkSuffix = ctaLink.split('?t=')[1];
        } else if (ctaLink) {
            linkSuffix = ctaLink;
        }

        contents = [{
            type: 'template',
            templateId: templateId,
            fields: {
                body: {
                    "1": message
                },
                ...(linkSuffix ? {
                    button: {
                        "1": linkSuffix
                    }
                } : {})
            }
        }];
    } else {
        contents = [{ type: 'text', text: message }];
    }
    return contents;
}

const payload = buildZenviaPayload(templateId, testCtaLink, message);
console.log("Generated Payload:");
console.log(JSON.stringify(payload, null, 2));

const suffix = testCtaLink.split('?t=')[1];
console.log("\nExtracted Suffix (JWT):");
console.log(suffix);

if (suffix === "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbnBqIjoiOTg1ODkwOTYwMDA1MDEiLCJjbnBqX3Nhbml0YXplIjoiOTg1ODkwOTYwMDA1MDEiLCJlbWFpbCI6IlNVUEVSTEVOWkBURVJSQS5DT00uQlIiLCJub21lTG9qYSI6IkxFTlogJiBDSUEgTFREQSIsInBob25lIjpudWxsLCJyb290X2NucGoiOiI5ODU4OTA5NiJ9.qpNnQgD3o6KRnRFcCPeaNhL9rFnTmTudL2OrLX4hi4A&c=2") {
    console.log("\n✅ SUCCESS: Suffix extraction is correct.");
} else {
    console.log("\n❌ FAILURE: Suffix extraction is incorrect.");
}
