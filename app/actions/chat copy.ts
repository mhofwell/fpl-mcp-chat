// app/actions/chat.ts
'use server';

import { Anthropic } from '@anthropic-ai/sdk';
import { TextBlock } from '@anthropic-ai/sdk/resources';
// we will need to use the supabase client to store the chat history lets do this later
//
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';
//
import { callMcpTool } from './mcp-tools';

const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY || '',
});

export async function processUserMessage(
    chatId: string | null,
    message: string
) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Create or get chat ID
    if (!chatId) {
        if (user) {
            // Authenticated user: Create chat in database
            const { data, error } = await supabase
                .from('chats')
                .insert({
                    user_id: user.id,
                    title: `Chat ${new Date().toLocaleDateString()}`,
                })
                .select()
                .single();

            if (error) throw error;
            chatId = data.id;
        } else {
            // Anonymous user: Generate client-side ID
            chatId = `anon-${uuidv4()}`;
        }
    }

    // Store message
    if (user) {
        await supabase.from('messages').insert({
            chat_id: chatId,
            content: message,
            role: 'user',
        });
    }

    try {
        // Call Claude with tools enabled
        const response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1000,
            system: `You are a Fantasy Premier League (FPL) assistant. You have access to tools for retrieving FPL data.
               When asked about players, teams, fixtures, or gameweeks, use the appropriate tools to get accurate data.
               Keep responses concise but informative.`,
            messages: [{ role: 'user', content: message }],
            tools: [
                {
                    name: 'get-player',
                    description: 'Get information about an FPL player',
                    input_schema: {
                        type: 'object',
                        properties: {
                            playerId: {
                                type: 'number',
                                description: 'ID of the player',
                            },
                            playerName: {
                                type: 'string',
                                description: 'Name of the player to search for',
                            },
                            includeRawData: {
                                type: 'boolean',
                                description: 'Whether to include raw JSON data',
                            },
                        },
                        required: [],
                    },
                },
                {
                    name: 'get-team',
                    description: 'Get information about an FPL team',
                    input_schema: {
                        type: 'object',
                        properties: {
                            teamId: {
                                type: 'number',
                                description: 'ID of the team',
                            },
                        },
                        required: ['teamId'],
                    },
                },
                {
                    name: 'get-gameweek',
                    description: 'Get information about an FPL gameweek',
                    input_schema: {
                        type: 'object',
                        properties: {
                            gameweekId: {
                                type: 'number',
                                description: 'ID of the gameweek',
                            },
                            getCurrent: {
                                type: 'boolean',
                                description: 'Get current gameweek',
                            },
                            getNext: {
                                type: 'boolean',
                                description: 'Get next gameweek',
                            },
                            includeFixtures: {
                                type: 'boolean',
                                description: 'Include fixtures in response',
                            },
                        },
                        required: [],
                    },
                },
                {
                    name: 'get-gameweek-fixtures',
                    description: 'Get fixtures for a specific gameweek',
                    input_schema: {
                        type: 'object',
                        properties: {
                            gameweekId: {
                                type: 'number',
                                description: 'ID of the gameweek',
                            },
                        },
                        required: ['gameweekId'],
                    },
                },
            ],
            tool_choice: { type: 'auto' },
        });

        // Handle tool calls if any were made
        const toolUses = response.content.filter(
            (item) => item.type === 'tool_use'
        );

        if (toolUses.length > 0) {
            // Create an array to store message content items
            const messageContent = [...response.content];

            // Process each tool call and add tool results
            for (const toolUse of toolUses) {
                if (toolUse.type === 'tool_use') {
                    // Call the MCP tool
                    const result = await callMcpTool(
                        toolUse.name,
                        toolUse.input as Record<string, any>
                    );

                    // Add the tool result to the messages array
                    messageContent.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: result.success
                            ? JSON.stringify(result.result)
                            : JSON.stringify({ error: result.error }),
                    });
                }
            }

            // Call Claude again with tool results
            const finalResponse = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1000,
                system: `You are a Fantasy Premier League (FPL) assistant.`,
                messages: [
                    { role: 'user', content: message },
                    { role: 'assistant', content: messageContent },
                ],
            });

            // Extract and return Claude's final response
            const answer =
                finalResponse.content[0].type === 'text'
                    ? finalResponse.content[0].text
                    : '';

            // Store Claude's response for authenticated user
            if (user && answer) {
                await supabase.from('messages').insert({
                    chat_id: chatId,
                    content: answer,
                    role: 'assistant',
                });
            }

            return {
                success: true,
                answer,
            };
        }

        // If no tool calls were made, just return the original response
        const answer =
            response.content[0].type === 'text' ? response.content[0].text : '';
        return { success: true, chatId, answer };
        
    } catch (error) {
        console.error('Error processing message with Claude:', error);
        return {
            success: false,
            answer: 'Sorry, I encountered an error while processing your question.',
        };
    }
}
