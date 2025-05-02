import { Anthropic } from '@anthropic-ai/sdk';
import { fplApiService } from '../fpl-api/service';
import { ExtractedEntities } from '../fpl-api/entity-extractor';
import {
    Message,
    MessageParam,
    ToolUseBlock,
    Tool,
    ToolResult,
} from '@anthropic-ai/sdk/resources';

// Get environment
const appEnv = process.env.APP_ENV || 'development';
const isDevMode = appEnv === 'development';

// Claude model configuration
const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';
const MAX_TOKENS = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

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
11. You have access to tools to get more specific information. Use these tools when appropriate to provide the most accurate and helpful answers.
`.trim();

// FPL-specific tools definitions
const FPL_TOOLS: Tool[] = [
    {
        name: 'get_player_stats',
        description:
            "Get detailed statistics for a specific player. Use this tool when the user asks about a player's form, stats, or performance. The tool provides comprehensive statistics including goals, assists, minutes played, and other FPL-relevant metrics for the current season.",
        input_schema: {
            type: 'object',
            properties: {
                player_name: {
                    type: 'string',
                    description:
                        'The full name of the player to get statistics for',
                },
                season: {
                    type: 'string',
                    description:
                        "The season to get statistics for (e.g., '2023-24'). If not provided, defaults to current season.",
                },
            },
            required: ['player_name'],
        },
    },
    {
        name: 'get_team_fixtures',
        description:
            "Get upcoming fixtures for a specific team. Use this tool when the user asks about a team's upcoming matches, fixture difficulty, or schedule. The tool returns the next several fixtures with opponent names, home/away status, and difficulty ratings.",
        input_schema: {
            type: 'object',
            properties: {
                team_name: {
                    type: 'string',
                    description:
                        'The name of the Premier League team to get fixtures for',
                },
                number_of_fixtures: {
                    type: 'integer',
                    description:
                        'Number of upcoming fixtures to return. Defaults to 5 if not specified.',
                },
            },
            required: ['team_name'],
        },
    },
    {
        name: 'get_gameweek_deadline',
        description:
            'Get the deadline for a specific gameweek. Use this tool when the user asks about when they need to make transfers or when a gameweek starts. Returns the exact date and time of the gameweek deadline.',
        input_schema: {
            type: 'object',
            properties: {
                gameweek: {
                    type: 'integer',
                    description:
                        'The gameweek number to get the deadline for. If not provided, defaults to the next gameweek.',
                },
            },
        },
    },
    {
        name: 'get_current_gameweek',
        description:
            'Get information about the current active gameweek including its number, status, and when it started or will start. Use this when users ask about the current gameweek or want to know which gameweek is active now.',
        input_schema: {
            type: 'object',
            properties: {},
        },
    },
];

// Interface for tool implementation
export interface ToolImplementation {
    (input: any): Promise<string>;
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retries
 * @param baseDelay Base delay in milliseconds
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = MAX_RETRIES,
    baseDelay: number = RETRY_DELAY_MS
): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt === maxRetries) {
                break;
            }

            // Calculate delay with exponential backoff and jitter
            const delay =
                baseDelay * Math.pow(2, attempt) * (0.5 + Math.random() / 2);
            console.log(
                `Retrying after ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

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
                const { context } =
                    await fplApiService.processQuestion(question);
                fplContext = context;
            } else {
                fplContext = manualContext;
            }

            // Add default context if processed context is too short
            if (fplContext.length < 50) {
                const currentGameweek =
                    await fplApiService.getCurrentGameweek();
                fplContext += `\nCurrent gameweek: ${
                    currentGameweek?.name || 'Unknown'
                }\n`;
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

            // Send the request to Claude with retry logic
            const response = await withRetry(() =>
                anthropic.messages.create({
                    model: CLAUDE_MODEL,
                    max_tokens: MAX_TOKENS,
                    system: FPL_SYSTEM_PROMPT,
                    messages: [
                        {
                            role: 'user',
                            content: `Fantasy Premier League Question: ${question}\n\nHere's the relevant FPL data:\n\n${fplContext}`,
                        },
                    ],
                    tools: FPL_TOOLS,
                })
            );

            // Check if content block is a text block
            const textBlock = response.content.find(
                (block) => block.type === 'text'
            );

            if (textBlock?.type === 'text') {
                // Log the response in development mode
                if (isDevMode) {
                    const previewText =
                        textBlock.text.substring(0, 100) +
                        (textBlock.text.length > 100 ? '...' : '');
                    console.log(
                        '[DEV] Claude API response preview:',
                        previewText
                    );
                }
                return textBlock.text;
            } else {
                // Handle tool use request which wasn't expected in simple mode
                const toolUseBlock = response.content.find(
                    (block): block is ToolUseBlock => block.type === 'tool_use'
                );

                if (toolUseBlock) {
                    return `I need to use the "${toolUseBlock.name}" tool to answer your question better. Please use the full tool-assisted response method.`;
                }

                // Handle other unexpected content types
                console.warn(
                    `Unexpected content type from Claude API (${appEnv}):`,
                    response.content
                );
                return 'Unable to process response from Claude. Please try again with a more specific question.';
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
     * Get a full response from Claude with tool-assisted capabilities
     * Tool implementations are provided to handle Claude's tool requests
     * @param question User's question
     * @param toolImplementations Functions to handle tool requests
     */
    async getToolAssistedResponse(
        question: string,
        toolImplementations: Record<string, ToolImplementation>
    ): Promise<string> {
        try {
            // Validate tool implementations against defined tools
            this.validateToolImplementations(toolImplementations);

            // Process the question to extract relevant FPL context
            const { context } = await fplApiService.processQuestion(question);
            let fplContext = context;

            // Add default context if processed context is too short
            if (fplContext.length < 50) {
                const currentGameweek =
                    await fplApiService.getCurrentGameweek();
                fplContext += `\nCurrent gameweek: ${currentGameweek?.name || 'Unknown'}\n`;
            }

            // Initialize conversation
            const messages: MessageParam[] = [
                {
                    role: 'user',
                    content: `Fantasy Premier League Question: ${question}\n\nHere's the relevant FPL data:\n\n${fplContext}`,
                },
            ];

            let isConversationComplete = false;
            let maxTurns = 5; // Safety limit to prevent infinite loops
            let currentTurn = 0;
            let toolUseHistory = new Set<string>(); // Track tool usage to detect loops

            // Log initial request in development mode
            if (isDevMode) {
                console.log('[DEV] Starting tool-assisted conversation:', {
                    question,
                    contextLength: fplContext.length,
                });
            }

            while (!isConversationComplete && currentTurn < maxTurns) {
                currentTurn++;

                // Create request with current conversation state
                const response = await withRetry(() =>
                    anthropic.messages.create({
                        model: CLAUDE_MODEL,
                        max_tokens: MAX_TOKENS,
                        system: FPL_SYSTEM_PROMPT,
                        messages,
                        tools: FPL_TOOLS,
                    })
                );

                // Check if response contains a tool use request
                const toolUseBlock = response.content.find(
                    (block): block is ToolUseBlock => block.type === 'tool_use'
                );

                if (toolUseBlock) {
                    const { id, name, input } = toolUseBlock;

                    // Check for tool request loop
                    const toolRequestKey = `${name}:${JSON.stringify(input)}`;
                    if (toolUseHistory.has(toolRequestKey)) {
                        if (isDevMode) {
                            console.warn(
                                `[DEV] Detected tool request loop for ${name}`
                            );
                        }

                        // Add detection of loop to conversation
                        messages.push({
                            role: 'assistant',
                            content: response.content,
                        });

                        // Add tool result indicating the loop
                        messages.push({
                            role: 'user',
                            content: [
                                {
                                    type: 'tool_result',
                                    tool_use_id: id,
                                    content: `Detected a loop in tool usage. Please provide your best answer with the information available so far.`,
                                } as ToolResult,
                            ],
                        });

                        // Force conversation to end on next iteration
                        currentTurn = maxTurns - 1;
                        continue;
                    }

                    // Record tool use to detect loops
                    toolUseHistory.add(toolRequestKey);

                    if (isDevMode) {
                        console.log(`[DEV] Tool use requested: ${name}`, input);
                    }

                    // Add Claude's response with tool request to conversation
                    messages.push({
                        role: 'assistant',
                        content: response.content,
                    });

                    // Check if tool is implemented
                    if (toolImplementations[name]) {
                        try {
                            // Execute the tool with Claude's input with timeout
                            const result = await Promise.race([
                                toolImplementations[name](input),
                                new Promise<string>((_, reject) =>
                                    setTimeout(
                                        () =>
                                            reject(
                                                new Error(
                                                    'Tool execution timed out'
                                                )
                                            ),
                                        30000
                                    )
                                ),
                            ]);

                            // Add tool result back to conversation
                            messages.push({
                                role: 'user',
                                content: [
                                    {
                                        type: 'tool_result',
                                        tool_use_id: id,
                                        content: result,
                                    } as ToolResult,
                                ],
                            });

                            if (isDevMode) {
                                console.log(
                                    `[DEV] Tool result for ${name}:`,
                                    result.substring(0, 100) +
                                        (result.length > 100 ? '...' : '')
                                );
                            }
                        } catch (error) {
                            // Handle tool execution error
                            console.error(
                                `[ERROR] Tool execution failed for ${name}:`,
                                error
                            );

                            messages.push({
                                role: 'user',
                                content: [
                                    {
                                        type: 'tool_result',
                                        tool_use_id: id,
                                        content: `Error executing tool: ${error.message}`,
                                    } as ToolResult,
                                ],
                            });
                        }
                    } else {
                        // Tool not implemented
                        if (isDevMode) {
                            console.warn(`[DEV] Tool not implemented: ${name}`);
                        }

                        messages.push({
                            role: 'user',
                            content: [
                                {
                                    type: 'tool_result',
                                    tool_use_id: id,
                                    content: `Tool "${name}" is not available in this system. Please provide your best answer without this tool.`,
                                } as ToolResult,
                            ],
                        });
                    }
                } else {
                    // Claude has completed its response
                    isConversationComplete = true;

                    // Extract final text response
                    const textBlock = response.content.find(
                        (block) => block.type === 'text'
                    );

                    if (textBlock?.type === 'text') {
                        if (isDevMode) {
                            console.log(
                                '[DEV] Final response:',
                                textBlock.text.substring(0, 100) +
                                    (textBlock.text.length > 100 ? '...' : '')
                            );
                        }
                        return textBlock.text;
                    } else {
                        console.warn(
                            `[WARN] Unexpected final response format:`,
                            response.content
                        );
                        return 'Unable to generate a proper response. Please try again.';
                    }
                }
            }

            // If we reach max turns without completion
            if (!isConversationComplete) {
                // Make one final call to get Claude's best answer with what we have
                const finalResponse = await withRetry(() =>
                    anthropic.messages.create({
                        model: CLAUDE_MODEL,
                        max_tokens: MAX_TOKENS,
                        system: `${FPL_SYSTEM_PROMPT}\nIMPORTANT: You have used the maximum allowed number of tool calls. Please provide your best answer with the information you have gathered so far.`,
                        messages,
                    })
                );

                const textBlock = finalResponse.content.find(
                    (block) => block.type === 'text'
                );

                if (textBlock?.type === 'text') {
                    return textBlock.text;
                }

                return "I apologize, but I wasn't able to fully answer your question within the allowed number of interactions. Please try asking a more specific question.";
            }

            // This should not be reached if normal flow completes
            return 'Response processing completed but no final answer was generated.';
        } catch (error) {
            console.error(
                `Error in tool-assisted conversation (${appEnv}):`,
                error
            );

            if (isDevMode) {
                return `Error in tool-assisted conversation: ${error.message}`;
            }

            throw error;
        }
    },

    /**
     * Validate that all required tool implementations are provided
     * @param toolImplementations Tool implementation functions
     */
    validateToolImplementations(
        toolImplementations: Record<string, ToolImplementation>
    ): void {
        const definedTools = FPL_TOOLS.map((tool) => tool.name);
        const implementedTools = Object.keys(toolImplementations);

        // Check for missing implementations
        const missingTools = definedTools.filter(
            (tool) => !implementedTools.includes(tool)
        );

        if (missingTools.length > 0) {
            console.warn(
                `[WARN] Missing tool implementations: ${missingTools.join(', ')}`
            );
        }

        // Check for extra implementations
        const extraTools = implementedTools.filter(
            (tool) => !definedTools.includes(tool)
        );

        if (extraTools.length > 0) {
            console.warn(
                `[WARN] Extra tool implementations: ${extraTools.join(', ')}`
            );
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
                await fplApiService.processQuestion(question);

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
