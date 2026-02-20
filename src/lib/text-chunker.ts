/**
 * Splitting text into meaningful semantic chunks for RAG pipelines.
 * This chunker attempts to split by paragraphs first, then sentences, 
 * to preserve semantic meaning within a specific token/character limit.
 */
export function chunkText(text: string, maxChars: number = 2000, overlapChars: number = 300): string[] {
    if (!text || text.trim() === '') return [];

    // Clean up excessive whitespace
    const normalizedText = text.replace(/\\n{3,}/g, '\\n\\n').trim();

    // If the text is small enough, return as a single chunk
    if (normalizedText.length <= maxChars) {
        return [normalizedText];
    }

    const chunks: string[] = [];
    let currentChunk = '';

    // Split by paragraphs
    const paragraphs = normalizedText.split('\\n\\n');

    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i].trim();
        if (!paragraph) continue;

        // If a single paragraph is larger than our max chars, we need to split it by sentences
        if (paragraph.length > maxChars) {
            // If we already have something in the current chunk, push it first
            if (currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }

            // Split giant paragraph by punctuation (. ! ?)
            const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
            let sentenceChunk = '';

            for (let j = 0; j < sentences.length; j++) {
                const sentence = sentences[j].trim();
                if (!sentence) continue;

                if (sentenceChunk.length + sentence.length > maxChars) {
                    if (sentenceChunk) {
                        chunks.push(sentenceChunk.trim());
                        // Maintain overlap from previous sentence chunk
                        const overlapStart = Math.max(0, sentenceChunk.length - overlapChars);
                        sentenceChunk = sentenceChunk.substring(overlapStart) + ' ' + sentence;
                    } else {
                        // The sentence itself is bigger than maxChars (edge case)
                        chunks.push(sentence);
                        sentenceChunk = '';
                    }
                } else {
                    sentenceChunk += (sentenceChunk ? ' ' : '') + sentence;
                }
            }
            if (sentenceChunk) {
                currentChunk = sentenceChunk; // Carry over remainder
            }

        } else {
            // Normal paragraph processing
            if (currentChunk.length + paragraph.length > maxChars) {
                chunks.push(currentChunk.trim());
                // Grab overlap from the end of the previous chunk
                const overlapStart = Math.max(0, currentChunk.length - overlapChars);
                currentChunk = currentChunk.substring(overlapStart) + '\\n\\n' + paragraph;
            } else {
                currentChunk += (currentChunk ? '\\n\\n' : '') + paragraph;
            }
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}
