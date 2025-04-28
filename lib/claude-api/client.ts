import { Anthropic } from '@anthropic-ai/sdk';

// Get environment
const appEnv = process.env.APP_ENV || 'development';
const isDevMode = appEnv === 'development';

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
            // Log the request in development mode
            if (isDevMode) {
                console.log('[DEV] Claude API request:', {
                    question,
                    contextLength: fplContext.length,
                });
            }

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
                // Log the response in development mode
                if (isDevMode) {
                    const previewText =
                        firstBlock.text.substring(0, 100) +
                        (firstBlock.text.length > 100 ? '...' : '');
                    console.log(
                        '[DEV] Claude API response preview:',
                        previewText
                    );
                }
                return firstBlock.text;
            } else {
                // Handle other content types or return empty string
                console.warn(
                    `Unexpected content type from Claude API (${appEnv}):`,
                    firstBlock.type
                );
                return '';
            }
        } catch (error) {
            console.error(`Error querying Claude API (${appEnv}):`, error);

            // In development mode, return a mock response if API fails
            if (isDevMode) {
                console.log('[DEV] Returning mock response due to API error');
                return 'This is a development mode mock response. The Claude API request failed.';
            }

            throw error;
        }
    },
};
