# Development Workflow

This document outlines the workflow for developing and deploying the FPL Chat Assistant.

## Local Development

### Prerequisites

1. Node.js (v18+)
2. Redis installed locally
3. Supabase account with a project set up
4. Claude API key

### Environment Setup

1. Create a `.env.local` file in the project root with the following variables:
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
REDIS_URL=redis://localhost:6379
APP_ENV=development
NODE_ENV=development
CLAUDE_API_KEY=your_claude_api_key

### Starting the Development Server

There are two ways to start the development server:

#### Option 1: Start Redis manually and then Next.js

1. Start Redis in a separate terminal:
```bash
redis-server

