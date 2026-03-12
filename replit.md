# Recipe Pocket AI Pipeline

## Project Overview
An AI-powered content pipeline for the "Recipe Pocket" app (Japanese recipe management app). It uses multiple AI agents (Analyst, Marketer, Writer, Designer, Controller) powered by Google Gemini to generate and publish blog articles automatically.

## Architecture
- **Frontend**: React + TypeScript, built with Vite, running on port 5000
- **Backend**: Express.js (Node.js), running on port 8080
- **Frontend proxies `/api` requests** to the backend during development
- **In production**: Express serves the built React app from `dist/`

## Key Technologies
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (via CDN in dev)
- Express.js backend
- Google Gemini AI (`@google/genai`)
- Supabase (article storage and CMS posting)
- Google Analytics 4 (GA4) for analytics data
- Google Cloud Secret Manager (for production secrets)

## Services
- `services/geminiService.ts` - AI agent calls (proxied through backend)
- `services/analyticsService.ts` - GA4 analytics data
- `services/firestoreService.ts` - Article CRUD via backend API
- `services/storageService.ts` - Supabase image/file uploads
- `services/supabaseService.ts` - Direct Supabase CMS posting
- `services/googleAuthService.ts` - Google OAuth/JWT for server-side auth

## Environment Variables Required
- `API_KEY` / `GEMINI_API_KEY` - Google Gemini API key
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ANON_KEY` - Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `SUPABASE_AUTHOR_ID` - Author ID for posts
- `GA4_CREDENTIALS_JSON` - Google service account JSON for GA4
- `GA4_PROPERTY_ID` - GA4 property ID
- `GOOGLE_CLOUD_PROJECT` / `PROJECT_ID` - GCP project (for Secret Manager)

## Workflows
- **Start application**: `npm run dev` on port 5000 (Vite frontend, webview)
- **Backend API**: `node server.js` on port 8080 (Express backend, console)

## Deployment
- Target: autoscale
- Build: `npm run build` (compiles TypeScript + Vite bundle to `dist/`)
- Run: `node server.js` (Express serves static `dist/` + API routes)
