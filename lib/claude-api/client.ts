import { Anthropic } from '@anthropic-ai/sdk';

// Initialize Claude client
const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY || '',
});

// Basic Claude API client
export const claudeApi = {
    /**
     * Get a response from Claude API
     * @param question User's question
     * @param fplContext FPL data context to provide to Claude
     */
    async getResponse(question: string, fplContext: string): Promise<string> {
        try {
            const response = await anthropic.messages.create({
                model: 'claude-3-sonnet-20240229',
                max_tokens: 1000,
                messages: [
                    {
                        role: 'user',
                        content: `Fantasy Premier League Question: ${question}\n\nHere's the relevant FPL data:\n\n${fplContext}`,
                    },
                ],
            });

            // Check if content block is a text block
            const firstBlock = response.content[0];
            if (firstBlock.type === 'text') {
                return firstBlock.text;
            } else {
                // Handle other content types or return empty string
                console.warn(
                    'Unexpected content type from Claude API:',
                    firstBlock.type
                );
                return '';
            }
        } catch (error) {
            console.error('Error querying Claude API:', error);
            throw error;
        }
    },
};
