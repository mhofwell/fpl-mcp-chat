'use server'

import { claudeApi } from '@/lib/claude-api/client';

export async function processUserMessage(message: string) {
  try {
    // Use the existing Claude client with detailed response
    const response = await claudeApi.getResponseWithDetails(message);
    
    return {
      success: true,
      answer: response.answer,
      entities: response.entities,
      context: response.context
    };
  } catch (error) {
    console.error('Error processing message with Claude:', error);
    return {
      success: false,
      answer: 'Sorry, I encountered an error while processing your question.',
      entities: {},
      context: ''
    };
  }
}
