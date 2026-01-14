import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { KJUR } from 'jsrsasign';
import cors from 'cors';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '10mb' }));
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
    { name: 'GA4_CREDENTIALS_JSON', env: 'GA4_CREDENTIALS_JSON' },
    { name: 'GA4_PROPERTY_ID', env: 'GA4_PROPERTY_ID' }
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
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    supabaseAuthorId: process.env.SUPABASE_AUTHOR_ID || '',
    ga4PropertyId: process.env.GA4_PROPERTY_ID ? 'SET' : '', // Just status check
    geminiApiKey: process.env.API_KEY ? 'SET' : '', // Just status check
    ga4Credentials: process.env.GA4_CREDENTIALS_JSON ? 'SET' : '' // Just status check
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

// Fallback for React Router
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start Server
loadSecrets().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("--- Environment Variables Check ---");
    console.log(`API_KEY: ${process.env.API_KEY ? 'Set (Length: ' + process.env.API_KEY.length + ')' : 'MISSING'}`);
    console.log(`GA4_PROPERTY_ID: ${process.env.GA4_PROPERTY_ID ? 'Set' : 'MISSING'}`);
    console.log(`GA4_CREDENTIALS_JSON: ${process.env.GA4_CREDENTIALS_JSON ? 'Set' : 'MISSING'}`);
    console.log(`SUPABASE_URL: ${process.env.SUPABASE_URL ? 'Set' : 'MISSING'}`);
    console.log("-----------------------------------");
  });
});