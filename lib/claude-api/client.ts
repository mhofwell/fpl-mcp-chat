import { Anthropic } from '@anthropic-ai/sdk';
import { fplService } from '../fpl-api/service';
import { ExtractedEntities } from '../fpl-api/entity-extractor';

// Get environment
const appEnv = process.env.APP_ENV || 'development';
const isDevMode = appEnv === 'development';

// Claude model configuration
const CLAUDE_MODEL = 'claude-3-sonnet-20240229';
const MAX_TOKENS = 1000;

// Initialize Claude client
const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY || '',
});

// System prompt to guide Claude's responses about FPL
const FPL_SYSTEM_PROMPT = `
You are a Fantasy Premier League (FPL) assistant. You provide helpful, accurate, and insightful information about the Fantasy Premier League game.

Important guidelines:
1. Focus on answering FPL-specific questions and providing advice based on data.
2. For player and team recommendations, explain your reasoning based on form, fixtures, and statistics.
3. Keep responses concise but informative.
4. When asked about strategies, explain common approaches with their pros and cons.
5. If data is missing or outdated, acknowledge it and provide the best answer with available information.
6. For "who should I captain" or similar choice questions, provide your recommendation and explain your reasoning.
7. Be helpful to both beginners and experienced FPL players.
8. If a question is unclear or has multiple interpretations in the FPL context, ask for clarification.
9. If asked something outside FPL, politely redirect to FPL topics.
10. Current gameweek data and upcoming fixtures are especially relevant to include in responses.
`.trim();

// Basic Claude API client
export const claudeApi = {
    /**
     * Get a response from Claude API for an FPL question
     * @param question User's question
     * @param manualContext Optional manual context to provide (otherwise will be generated)
     */
    async getResponse(
        question: string,
        manualContext?: string
    ): Promise<string> {
        try {
            let fplContext: string;

            // Process the question to extract relevant FPL context if not provided
            if (!manualContext) {
                const { context } = await fplService.processQuestion(question);
                fplContext = context;
            } else {
                fplContext = manualContext;
            }

            // Add default context if processed context is too short
            if (fplContext.length < 50) {
                const currentGameweek = await fplService.getCurrentGameweek();
                fplContext += `\nCurrent gameweek: ${currentGameweek?.name || 'Unknown'}\n`;
            }

            // Log the request in development mode
            if (isDevMode) {
                console.log('[DEV] Claude API request:', {
                    question,
                    contextLength: fplContext.length,
                });
                // Print a preview of the context in dev mode
                console.log(
                    '[DEV] Context preview:',
                    fplContext.substring(0, 500) +
                        (fplContext.length > 500 ? '...' : '')
                );
            }

            // Send the request to Claude
            const response = await anthropic.messages.create({
                model: CLAUDE_MODEL,
                max_tokens: MAX_TOKENS,
                system: FPL_SYSTEM_PROMPT,
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
                return 'This is a development mode mock response. The Claude API request failed. Check your API keys and request format.';
            }

            throw error;
        }
    },

    /**
     * Enhanced method that returns not just the response but also extracted entities and context
     * Useful for debugging and improving the system
     */
    async getResponseWithDetails(question: string): Promise<{
        answer: string;
        entities: ExtractedEntities;
        context: string;
    }> {
        try {
            // Process the question to extract entities and build context
            const { context, entities } =
                await fplService.processQuestion(question);

            // Get response from Claude
            const answer = await this.getResponse(question, context);

            return {
                answer,
                entities,
                context,
            };
        } catch (error) {
            console.error('Error getting detailed response:', error);
            throw error;
        }
    },
};
