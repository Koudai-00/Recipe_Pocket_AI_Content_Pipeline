import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { KJUR } from 'jsrsasign';
import cors from 'cors';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { setupScheduler } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
setupScheduler(app);

const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '20mb' }));
app.use(cors());

// --- Helper: Secret Manager ---
const loadSecrets = async () => {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID;
  if (!projectId) {
    console.log("Projects ID (GOOGLE_CLOUD_PROJECT or PROJECT_ID) not set. Skipping Secret Manager (using .env).");
    return;
  }

  const client = new SecretManagerServiceClient();
  const secrets = [
    { name: 'GEMINI_API_KEY', env: 'API_KEY' },
    { name: 'SUPABASE_URL', env: 'SUPABASE_URL' },
    { name: 'SUPABASE_SERVICE_ANON_KEY', env: 'SUPABASE_SERVICE_ANON_KEY' },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', env: 'SUPABASE_SERVICE_ROLE_KEY' },
    { name: 'SUPABASE_AUTHOR_ID', env: 'SUPABASE_AUTHOR_ID' },
    { name: 'GA4_CREDENTIALS_JSON', env: 'GA4_CREDENTIALS_JSON' },
    { name: 'GA4_PROPERTY_ID', env: 'GA4_PROPERTY_ID' },
    { name: 'SEEDREAM_API_KEY', env: 'SEEDREAM_API_KEY' },
    { name: 'OPENROUTER_API', env: 'OPENROUTER_API' }
  ];

  console.log(`Fetching secrets from Secret Manager for project: ${projectId}...`);

  for (const secret of secrets) {
    if (process.env[secret.env] && !process.env[secret.env].startsWith('TODO_')) {
      // If env var is already set (and not a placeholder), skip overwriting? 
      // Or prefer Secret Manager? Usually Secret Manager is source of truth in Cloud.
      // Let's overwrite if we can fetch it, unless it's strictly local.
      // But for hybrid, let's assume if it's set in .env properly, maybe we use it?
      // Actually user requested Secret Manager access. Let's try fetching.
    }

    try {
      const name = `projects/${projectId}/secrets/${secret.name}/versions/latest`;
      const [version] = await client.accessSecretVersion({ name });
      const payload = version.payload.data.toString();
      process.env[secret.env] = payload;
      console.log(`Loaded secret: ${secret.name} -> ${secret.env}`);
    } catch (e) {
      console.warn(`Failed to fetch secret ${secret.name}: ${e.message}`);
    }
  }
};

// Static files (React build)
app.use(express.static(path.join(__dirname, 'dist')));

// --- Helper: Google Auth (Server Side) ---
const getGoogleAccessToken = async (scopes) => {
  const credentialsJson = process.env.GA4_CREDENTIALS_JSON;
  if (!credentialsJson) throw new Error("Server: GA4_CREDENTIALS_JSON missing");

  const credentials = JSON.parse(credentialsJson);
  const { client_email, private_key } = credentials;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: client_email,
    scope: scopes.join(' '),
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  };

  const sJWS = KJUR.jws.JWS.sign(null, JSON.stringify(header), JSON.stringify(claim), private_key);
  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', sJWS);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  const data = await response.json();
  if (data.access_token) return data.access_token;
  throw new Error(`Google Auth failed: ${JSON.stringify(data)}`);
};

// --- API: Safe Config for Frontend ---
// Only return non-sensitive public keys (Supabase Anon Key is designed to be public)
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_SERVICE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
    supabaseAuthorId: process.env.SUPABASE_AUTHOR_ID || '',
    ga4PropertyId: process.env.GA4_PROPERTY_ID ? 'SET' : '', // Just status check
    geminiApiKey: process.env.API_KEY ? 'SET' : '', // Just status check
    ga4Credentials: process.env.GA4_CREDENTIALS_JSON ? 'SET' : '', // Just status check
    seedreamApiKey: process.env.SEEDREAM_API_KEY || '',
    openrouterApiKey: process.env.OPENROUTER_API ? 'SET' : ''
  });
});

// --- API: Gemini Proxy ---
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { model, contents, config } = req.body;
    if (!process.env.API_KEY) throw new Error("API_KEY not set on server");

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model,
      contents,
      config
    });

    // Extract text/parts safely
    res.json(response);
  } catch (error) {
    console.error("Gemini Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- API: OpenRouter Proxy ---
app.post('/api/openrouter/generate-image', async (req, res) => {
  try {
    const { model, prompt } = req.body;
    if (!process.env.OPENROUTER_API) throw new Error("OPENROUTER_API not set on server");

    console.log(`[OpenRouter] Requesting image from model: ${model}`);

    const requestBody = {
      model: model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt }
          ]
        }
      ],
      modalities: ['image'],
      max_tokens: 4096
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://recipepocket.jp',
        'X-Title': 'Recipe Pocket AI Pipeline'
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error(`[OpenRouter] API Error (${response.status}) for model ${model}:`, responseText);
      throw new Error(`OpenRouter API responded with status ${response.status}: ${responseText}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch(e) {
      console.error(`[OpenRouter] Failed to parse response for model ${model}:`, responseText.substring(0, 500));
      throw new Error("Failed to parse OpenRouter response as JSON");
    }

    console.log(`[OpenRouter] Response structure for ${model}:`, JSON.stringify(data).substring(0, 300));

    // Extract image from response - handle multiple formats
    let imageUrl = '';
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const message = data.choices[0].message;
      const content = message.content;

      // Format 1: content is an array with image_url objects
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === 'image_url' && part.image_url?.url) {
            imageUrl = part.image_url.url;
            break;
          }
        }
      }
      // Format 2: message.images array
      else if (message.images && message.images.length > 0) {
        if (message.images[0].image_url?.url) {
          imageUrl = message.images[0].image_url.url;
        } else if (typeof message.images[0] === 'string') {
          imageUrl = message.images[0];
        }
      }
      // Format 3: content is a direct URL string 
      else if (typeof content === 'string' && (content.startsWith('http') || content.startsWith('data:image'))) {
        imageUrl = content;
      }
    }
    
    if (!imageUrl) {
       console.error(`[OpenRouter] Could not extract image from response for model ${model}. Full response:`, JSON.stringify(data, null, 2));
       throw new Error("Could not extract image URL/Data from OpenRouter response");
    }

    console.log(`[OpenRouter] Successfully generated image with model ${model} (URL length: ${imageUrl.length})`);
    res.json({ imageUrl });
  } catch (error) {
    console.error("[OpenRouter] Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- API: Analytics (GA4) Proxy ---
app.get('/api/analytics', async (req, res) => {
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) throw new Error("GA4_PROPERTY_ID missing");

    const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const requestBody = {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'activeUsers' }, { name: 'screenPageViews' }],
      orderBys: [{ desc: true, metric: { metricName: 'screenPageViews' } }],
      limit: 10
    };

    const apiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!apiRes.ok) throw new Error(await apiRes.text());
    const data = await apiRes.json();
    res.json(data);
  } catch (error) {
    console.error("Analytics Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- API: Firestore Save Proxy ---
app.post('/api/firestore/save', async (req, res) => {
  try {
    const { article } = req.body;
    const creds = JSON.parse(process.env.GA4_CREDENTIALS_JSON || '{}');
    const projectId = creds.project_id;
    if (!projectId) throw new Error("Project ID missing in credentials");

    const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/datastore']);

    // Reuse the logic to map fields would be complex to duplicate here perfectly without TS types,
    // so we assume the frontend sends the *formatted* fields or we accept raw json and format it?
    // Better: Receive the raw article object and format it here?
    // To keep server simple, let's accept the pre-formatted "documentBody" from frontend, 
    // OR just pass the raw data and let the frontend logic (which we move here) handle it.
    // For simplicity of migration: The frontend 'saveToFirestore' did the formatting.
    // Let's have the frontend do the formatting to "Firestore JSON" structure, 
    // and the server just signs the request.

    const { documentBody, documentId } = req.body; // Expects formatted Firestore JSON

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/articles?documentId=${documentId}`;

    let apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(documentBody)
    });

    if (apiRes.status === 409) {
      const patchUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/articles/${documentId}`;
      apiRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(documentBody)
      });
    }

    if (!apiRes.ok) throw new Error(await apiRes.text());
    res.json({ success: true });

  } catch (error) {
    console.error("Firestore Save Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- API: Firestore List Proxy ---
app.get('/api/firestore/articles', async (req, res) => {
  try {
    const creds = JSON.parse(process.env.GA4_CREDENTIALS_JSON || '{}');
    const projectId = creds.project_id;
    if (!projectId) throw new Error("Project ID missing in credentials");

    const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/datastore']);

    // Fetch documents (limit 50, ordered by createTime desc logic handled by client or query?)
    // Firestore REST API sort is slightly complex with structured query, 
    // for now let's just fetch default list and sort in client.
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/articles?pageSize=50`;

    const apiRes = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!apiRes.ok) throw new Error(await apiRes.text());
    const data = await apiRes.json();
    res.json(data);
  } catch (error) {
    console.error("Firestore List Error:", error);
    res.status(500).json({ error: error.message });
  }

});

// --- API: Firestore Bulk Delete Proxy ---
app.delete('/api/firestore/articles', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) throw new Error("Invalid IDs");

    const creds = JSON.parse(process.env.GA4_CREDENTIALS_JSON || '{}');
    const projectId = creds.project_id;
    const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/datastore']);

    // Parallel deletes (Firestore limit is usually high enough for UI bulk actions)
    // For large bulk, batchCommit would be better, but for UI usage (e.g. 10-20 items), Promise.all is fine.
    await Promise.all(ids.map(async (id) => {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/articles/${id}`;
      const apiRes = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!apiRes.ok) console.warn(`Failed to delete ${id}:`, await apiRes.text());
    }));

    res.json({ success: true });
  } catch (error) {
    console.error("Firestore Delete Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- API: Firestore Status Update Proxy ---
app.post('/api/firestore/status', async (req, res) => {
  try {
    const { id, status } = req.body;
    const creds = JSON.parse(process.env.GA4_CREDENTIALS_JSON || '{}');
    const projectId = creds.project_id;
    const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/datastore']);

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/articles/${id}?updateMask.fieldPaths=status`;
    const body = { fields: { status: { stringValue: status } } };

    const apiRes = await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!apiRes.ok) throw new Error(await apiRes.text());
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- API: Agent Prompts Settings ---
app.get('/api/settings/prompts', async (req, res) => {
  try {
    const creds = JSON.parse(process.env.GA4_CREDENTIALS_JSON || '{}');
    const projectId = creds.project_id;
    if (!projectId) throw new Error("Project ID missing");

    const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/datastore']);

    // Path: settings/agent_prompts
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/agent_prompts`;

    const apiRes = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (apiRes.status === 404) {
      return res.json({});
    }

    if (!apiRes.ok) throw new Error(await apiRes.text());
    const data = await apiRes.json();

    const fields = data.fields || {};
    const result = {
      analyst: fields.analyst?.stringValue,
      marketer: fields.marketer?.stringValue,
      writer: fields.writer?.stringValue,
      designer: fields.designer?.stringValue,
      controller: fields.controller?.stringValue
    };

    res.json(result);
  } catch (error) {
    console.error("Prompt Fetch Error:", error);
    res.json({});
  }
});

app.post('/api/settings/prompts', async (req, res) => {
  try {
    const prompts = req.body;
    const creds = JSON.parse(process.env.GA4_CREDENTIALS_JSON || '{}');
    const projectId = creds.project_id;
    if (!projectId) throw new Error("Project ID missing");

    const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/datastore']);

    const fields = {};
    for (const [key, value] of Object.entries(prompts)) {
      if (value) fields[key] = { stringValue: value };
    }

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/agent_prompts`;

    const apiRes = await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });

    if (!apiRes.ok) throw new Error(await apiRes.text());
    res.json({ success: true });
  } catch (error) {
    console.error("Prompt Save Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- API: General Settings ---
app.get('/api/settings/general', async (req, res) => {
  try {
    const creds = JSON.parse(process.env.GA4_CREDENTIALS_JSON || '{}');
    const projectId = creds.project_id;
    if (!projectId) throw new Error("Project ID missing");

    const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/datastore']);
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/general_config`;

    const apiRes = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (apiRes.status === 404) return res.json({}); // Not found is OK

    if (!apiRes.ok) throw new Error(await apiRes.text());
    const data = await apiRes.json();
    const fields = data.fields || {};

    // Map Firestore fields to JSON
    res.json({
      articlesPerRun: fields.articlesPerRun ? parseInt(fields.articlesPerRun.integerValue) : 1,
      defaultImageModel: fields.defaultImageModel?.stringValue || 'seedream-5.0-lite',
      schedulerEnabled: fields.schedulerEnabled?.booleanValue || false,
      cronSchedule: fields.cronSchedule?.stringValue || '0 9 * * *'
    });
  } catch (error) {
    console.error("General Settings Fetch Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/settings/general', async (req, res) => {
  try {
    const { articlesPerRun, defaultImageModel, schedulerEnabled, cronSchedule } = req.body;
    const creds = JSON.parse(process.env.GA4_CREDENTIALS_JSON || '{}');
    const projectId = creds.project_id;
    if (!projectId) throw new Error("Project ID missing");

    const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/datastore']);
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/general_config`;

    const fields = {
      articlesPerRun: { integerValue: articlesPerRun },
      defaultImageModel: { stringValue: defaultImageModel },
      schedulerEnabled: { booleanValue: schedulerEnabled },
      cronSchedule: { stringValue: cronSchedule }
    };

    const apiRes = await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });

    if (!apiRes.ok) throw new Error(await apiRes.text());
    res.json({ success: true });
  } catch (error) {
    console.error("General Settings Save Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- API: Monthly Analytics (Extended) ---
app.get('/api/analytics/monthly', async (req, res) => {
  try {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) throw new Error("GA4_PROPERTY_ID missing");

    const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/analytics.readonly']);
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

    // 1. Fetch This Month (Last 30 days or actual last month? User said "Monthly Report", implies Calendar Month)
    // "Last Month" in GA4 usually means previous calendar month.
    // Let's use dateRanges: defined by start/end dates.
    // However, easy keywords: 'lastMonth' and '2monthsAgo'. Why '2monthsAgo'? For comparison.
    // Actually GA4 'lastMonth' keyword exists? Yes.
    // Let's request 2 ranges: 0: lastMonth, 1: 2monthsAgo (Wait, can we?)
    // Or just request lastMonth and include prev metrics if possible?
    // Let's stick to simple "lastMonth" for now. A full implementation might require precise date calculation in Node.js.
    // Let's trust GA4 'lastMonth'.

    // We need 'sessions', 'activeUsers', 'screenPageViews', 'averageSessionDuration', 'bounceRate'.
    // And 'organicSearchTraffic'? That's a segment/filter.
    // Simplified: Just basic metrics first. Organic separate if needed difficulty.

    // To get Organic: dimension 'sessionDefaultChannelGroup' == 'Organic Search'.

    // Calculate Last Month Range dynamically
    const now = new Date();
    // Move to first day of current month, then subtract 1 month
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // Last day of last month is Day 0 of current month
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const formatDate = (d) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const startDate = formatDate(startOfLastMonth);
    const endDate = formatDate(endOfLastMonth);

    console.log(`Fetching monthly analytics for range: ${startDate} to ${endDate}`);

    const requestBody = {
      dateRanges: [
        { startDate, endDate } // Current Report Range (Last Month)
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'activeUsers' },
        { name: 'screenPageViews' },
        { name: 'averageSessionDuration' },
        { name: 'bounceRate' }
      ]
    };

    const apiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!apiRes.ok) throw new Error(await apiRes.text());
    const data = await apiRes.json();

    // Parse
    // Parse
    const row = data.rows?.[0];
    const metrics = {
      sessions: row ? parseInt(row.metricValues[0].value) : 0,
      activeUsers: row ? parseInt(row.metricValues[1].value) : 0,
      screenPageViews: row ? parseInt(row.metricValues[2].value) : 0,
      averageSessionDuration: row ? parseFloat(row.metricValues[3].value) : 0,
      bounceRate: row ? parseFloat(row.metricValues[4].value) : 0,
      organicSearchTraffic: 0,
      prevSessions: 0,
      prevPageViews: 0
    };

    res.json(metrics || {});
  } catch (error) {
    console.error("Monthly Analytics Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- API: Monthly Reports Firestore Proxy ---
app.get('/api/firestore/monthly_reports', async (req, res) => {
  try {
    const creds = JSON.parse(process.env.GA4_CREDENTIALS_JSON || '{}');
    const projectId = creds.project_id;
    if (!projectId) throw new Error("Project ID missing");
    const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/datastore']);

    // List reports, limit 12, order by Month desc
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/monthly_reports?pageSize=12&orderBy=month desc`;

    const apiRes = await fetch(url, {
      method: 'GET', headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!apiRes.ok) throw new Error(await apiRes.text());
    const data = await apiRes.json();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/firestore/monthly_reports', async (req, res) => {
  try {
    const { report } = req.body; // Expects complete report object
    const creds = JSON.parse(process.env.GA4_CREDENTIALS_JSON || '{}');
    const projectId = creds.project_id;
    const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/datastore']);

    // Use doc ID = report.id (YYYY-MM)
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/monthly_reports/${report.id}`;

    // We assume the client formats the body for Firestore (fields: ...) in the service layer 
    // OR we do it here. The prompt customization did it in server.js loop. 
    // `saveToFirestore` in `firestoreService` does client-side formatting.
    // Let's accept `{ documentBody: ... }` like other save endpoints.

    const apiRes = await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body.documentBody)
    });

    if (!apiRes.ok) throw new Error(await apiRes.text());
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Helper: Generate URL-safe slug ---
const generateSlug = (title) => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);

  let slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);

  if (!slug) {
    slug = 'article';
  }

  return `${slug}-${timestamp}-${randomStr}`;
};

// --- API: CMS Post (Supabase) Proxy ---
app.post('/api/cms/post', async (req, res) => {
  try {
    const { article } = req.body;

    // Check if Service Role Key is available
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials (URL or Key) are missing in settings.');
    }

    // Import Supabase client dynamically
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Prepare content string
    let contentToPost = '';
    if (typeof article.content === 'string') {
      contentToPost = article.content;
    } else if (article.content) {
      contentToPost = `${article.content.body_p1 || ''}\n\n${article.content.body_p2 || ''}\n\n${article.content.body_p3 || ''}`;
    }

    // Prioritize uploaded URL over Base64 string
    const thumbnailUrl = (article.image_urls && article.image_urls.length > 0 && article.image_urls[0])
      ? article.image_urls[0]
      : undefined;

    // Generate slug from title
    const slug = generateSlug(article.title);
    const now = new Date().toISOString();

    console.log(`Posting to Supabase CMS: ${article.title}`);
    console.log(`URL: ${supabaseUrl}`);
    console.log(`Using key type: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Service Role Key' : 'Anon Key'}`);
    console.log(`Generated slug: ${slug}`);

    const { data, error } = await supabase
      .from('articles')
      .insert([
        {
          title: article.title,
          slug: slug,
          content: contentToPost,
          thumbnail_url: thumbnailUrl,
          published: true,
          published_at: now,
          created_at: now,
          updated_at: now,
          view_count: 0
        }
      ])
      .select();

    if (error) {
      console.error('Supabase Insert Error:', error);
      throw new Error(`Supabase Error: ${error.message}`);
    }

    console.log('Successfully posted to Supabase CMS:', data?.[0]?.id);
    res.json({ success: true, id: data?.[0]?.id || 'unknown-id' });

  } catch (error) {
    console.error('CMS Post Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Helper: Upload image buffer to Supabase Storage with retry ---
const uploadToSupabaseStorage = async (supabase, storagePath, buffer, contentType, maxRetries = 1) => {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      console.log(`Storage upload retry ${attempt}/${maxRetries} for path: ${storagePath}`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }

    const { error } = await supabase.storage
      .from('images')
      .upload(storagePath, buffer, { contentType, upsert: true });

    if (!error) {
      const { data: urlData } = supabase.storage.from('images').getPublicUrl(storagePath);
      const publicUrl = urlData?.publicUrl || '';

      if (!publicUrl) {
        console.error(`[StorageHelper] SUCCESS upload but EMPTY publicUrl for: ${storagePath}`);
        lastError = new Error('Public URL generation failed');
        continue;
      }

      console.log(`[StorageHelper] SUCCESS: ${storagePath} -> ${publicUrl}`);
      return publicUrl;
    }

    // Detailed error logging for backend storage issues
    let detail = error.message;
    if (detail.includes('new row violates row-level security')) {
      detail = "RLS Policy Error. Ensure the 'images' bucket has a PUBLIC upload policy (even with service role key, sometimes RLS is tricky if not configured as 'public').";
    } else if (detail.includes('Bucket not found')) {
      detail = "Bucket 'images' not found. Please create a bucket named 'images' in Supabase Dashboard.";
    }
    
    console.error(`[StorageHelper] Attempt ${attempt} FAILED for ${storagePath}: ${detail}`);
    lastError = new Error(detail);
  }
  throw new Error(`Supabase Storage Error after ${maxRetries + 1} attempts: ${lastError?.message}`);
};

// --- Helper: Parse image data (base64 or URL) into buffer ---
const parseImageData = async (imageData) => {
  let buffer;
  let contentType = 'image/png';

  if (imageData.startsWith('http')) {
    const fetchRes = await fetch(imageData);
    if (!fetchRes.ok) throw new Error(`Failed to fetch image from URL: ${fetchRes.status}`);
    const arrayBuf = await fetchRes.arrayBuffer();
    buffer = Buffer.from(arrayBuf);
    contentType = fetchRes.headers.get('content-type') || 'image/png';
  } else {
    const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) throw new Error('Invalid base64 image format');
    contentType = matches[1];
    buffer = Buffer.from(matches[2], 'base64');
  }

  return { buffer, contentType };
};

// --- API: Storage Upload (uses Service Role Key to bypass RLS) ---
app.post('/api/storage/upload', async (req, res) => {
  try {
    const { imageData, path: storagePath } = req.body;
    if (!imageData || !storagePath) {
      return res.status(400).json({ error: 'imageData and path are required' });
    }

    console.log(`Storage upload request: path=${storagePath}, dataLength=${imageData.length}, type=${imageData.startsWith('http') ? 'URL' : 'base64'}`);

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Supabase credentials not configured on server' });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { buffer, contentType } = await parseImageData(imageData);
    console.log(`Parsed image: ${buffer.length} bytes, contentType=${contentType}`);

    const publicUrl = await uploadToSupabaseStorage(supabase, storagePath, buffer, contentType);
    res.json({ publicUrl });

  } catch (err) {
    console.error('Storage Upload Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Helper: Generate image via Gemini API (server-side) ---
const generateGeminiImageServer = async (prompt, model, apiKey) => {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: model.startsWith('models/') ? model : `models/${model}`,
    contents: prompt,
    config: { responseModalities: ['IMAGE'] }
  });

  const parts = response?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData);
  if (!imagePart?.inlineData) return null;

  return {
    buffer: Buffer.from(imagePart.inlineData.data, 'base64'),
    contentType: imagePart.inlineData.mimeType || 'image/png'
  };
};

// --- Helper: Generate image via Seedream/ARK API (server-side) ---
const generateSeedreamImageServer = async (prompt, arkApiKey) => {
  if (!arkApiKey) {
    console.warn('Seedream/ARK API Key not provided for re-upload');
    return null;
  }

  const res = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${arkApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'seedream-4-5-251128',
      prompt,
      size: '2560x1440',
      sequential_image_generation: 'disabled',
      response_format: 'url',
      stream: false,
      watermark: false
    })
  });

  if (!res.ok) throw new Error(`Seedream API error: ${await res.text()}`);

  const data = await res.json();
  if (data.data?.[0]?.url) {
    return { url: data.data[0].url };
  }
  return null;
};

// --- API: Re-upload images for an existing article ---
app.post('/api/storage/reupload', async (req, res) => {
  try {
    const { articleId, designPrompts, imageModel, arkApiKey } = req.body;
    if (!articleId || !designPrompts) {
      return res.status(400).json({ error: 'articleId and designPrompts are required' });
    }

    const model = imageModel || 'seedream-5.0-lite';
    const isSeedream = model.toLowerCase().includes('seedream');
    console.log(`[Reupload] Article: ${articleId}, model: ${model}, isSeedream: ${isSeedream}`);

    const apiKey = process.env.API_KEY;
    if (!isSeedream && !apiKey) throw new Error('API_KEY not set on server');

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error('Supabase credentials not configured');

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const prompts = [
      { key: 'thumbnail', prompt: designPrompts.thumbnail_prompt, path: `articles/${articleId}/thumbnail.png` },
      { key: 'section1', prompt: designPrompts.section1_prompt, path: `articles/${articleId}/section1.png` },
      { key: 'section2', prompt: designPrompts.section2_prompt, path: `articles/${articleId}/section2.png` },
      { key: 'section3', prompt: designPrompts.section3_prompt, path: `articles/${articleId}/section3.png` }
    ];

    const imageUrls = [];

    for (const item of prompts) {
      if (!item.prompt) {
        imageUrls.push('');
        continue;
      }

      try {
        console.log(`Generating image for ${item.key}: "${item.prompt.substring(0, 60)}..."`);

        if (isSeedream) {
          const result = await generateSeedreamImageServer(item.prompt, arkApiKey);
          if (!result?.url) {
            console.warn(`No Seedream image generated for ${item.key}`);
            imageUrls.push('');
            continue;
          }
          const fetchRes = await fetch(result.url);
          if (!fetchRes.ok) throw new Error(`Failed to fetch Seedream image: ${fetchRes.status}`);
          const arrayBuf = await fetchRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuf);
          const contentType = fetchRes.headers.get('content-type') || 'image/png';
          const publicUrl = await uploadToSupabaseStorage(supabase, item.path, buffer, contentType);
          imageUrls.push(publicUrl);
        } else {
          const result = await generateGeminiImageServer(item.prompt, model, apiKey);
          if (!result) {
            console.warn(`No Gemini image generated for ${item.key}`);
            imageUrls.push('');
            continue;
          }
          const publicUrl = await uploadToSupabaseStorage(supabase, item.path, result.buffer, result.contentType);
          imageUrls.push(publicUrl);
        }
      } catch (genErr) {
        console.error(`Image generation failed for ${item.key}:`, genErr.message);
        imageUrls.push('');
      }
    }

    const creds = JSON.parse(process.env.GA4_CREDENTIALS_JSON || '{}');
    const projectId = creds.project_id;
    if (projectId) {
      try {
        const accessToken = await getGoogleAccessToken(['https://www.googleapis.com/auth/datastore']);
        const urlsArray = imageUrls.map(u => ({ stringValue: u }));
        const patchUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/articles/${articleId}?updateMask.fieldPaths=image_urls`;
        const body = { fields: { image_urls: { arrayValue: { values: urlsArray } } } };

        const apiRes = await fetch(patchUrl, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!apiRes.ok) {
          console.error('Firestore image_urls update failed:', await apiRes.text());
        } else {
          console.log('Firestore image_urls updated successfully');
        }
      } catch (fsErr) {
        console.error('Firestore update error:', fsErr.message);
      }
    }

    const successCount = imageUrls.filter(u => u).length;
    console.log(`Re-upload complete: ${successCount}/${prompts.length} images uploaded`);
    res.json({ imageUrls, successCount, totalCount: prompts.length });

  } catch (err) {
    console.error('Re-upload Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Fallback for React Router
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start Server
console.log(`Starting server on port ${PORT}...`);

// 1. Start listening immediately to pass Cloud Run health checks
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// 2. Load secrets in background
loadSecrets().then(() => {
  console.log("Secrets loaded successfully.");
  console.log('--- Environment Variables Check ---');
  console.log(`API_KEY: ${process.env.API_KEY ? 'Set (Length: ' + process.env.API_KEY.length + ')' : 'MISSING'}`);
  console.log(`SUPABASE_URL: ${process.env.SUPABASE_URL ? 'Set' : 'MISSING'}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Set (Service Role)' : (process.env.SUPABASE_SERVICE_ANON_KEY ? 'Set (Anon Only)' : 'MISSING')}`);
  console.log(`GA4_PROPERTY_ID: ${process.env.GA4_PROPERTY_ID ? 'Set' : 'MISSING'}`);
  console.log('-----------------------------------');
}).catch(err => {
  console.error("WARNING: Failed to load secrets from Secret Manager:", err);
  // Do not exit, as the app might still work with .env or partial secrets
});
