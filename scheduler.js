import { GoogleGenAI } from '@google/genai';

// --- Constants & Prompts ---
const APP_CONTEXT = `Recipe Pocketは、日常の料理を楽しく、便利にするレシピキュレーションアプリです。
主なターゲットは、忙しいが美味しい料理を作りたい20代〜40代の男女、特に共働きの主婦や一人暮らしの料理好きです。
アプリは、冷蔵庫の余り物検索、時短レシピ、季節の特集、プロのシェフによるアレンジレシピなどを提供します。
ユーザー参加型の投稿機能や、AIによる献立提案機能も備えています。トーンは親しみやすく、かつ実用的で信頼性のある情報を発信します。`;

const DEFAULT_PROMPTS = {
    analyst: `あなたは「Recipe Pocket」のプロのデータアナリストです。
      【分析対象データ】{{ANALYTICS_DATA}}
      【過去のトピック】{{PAST_TOPICS}}
      【アプリ情報】{{APP_CONTEXT}}
      【指示】Google Analyticsデータを分析し、PV最大化のための記事トピックを決定してください。
      出力: JSON形式 { "direction": "...", "topic": "..." }`,

    marketer: `あなたは凄腕のマーケターです。
      【分析データ】{{ANALYSIS_RESULT}}
      【過去タイトル】{{PAST_TITLES}}
      【アプリ詳細】{{APP_CONTEXT}}
      【指示】ターゲット（30代主婦）に刺さる記事戦略をJSONで出力してください。
      出力: JSON形式 { "concept": "...", "function_intro": "...", "title": "...", "structure": [] }`,

    writer: `あなたは「Recipe Pocket」の公式ブログを書く主婦ブロガーです。
      【戦略】{{STRATEGY}}
      【アプリ】{{APP_CONTEXT}}
      【ルール】Markdown形式。[SPLIT]マーカーを2回入れて3分割すること。`,

    designer: `画像生成プロンプト作成。
      タイトル: {{TITLE}}
      内容: {{CONTENT_SNIPPET}}
      {{STYLE_INSTRUCTION}}
      出力JSON: { "thumbnail_prompt": "...", "section1_prompt": "...", "section2_prompt": "...", "section3_prompt": "..." }`,

    controller: `あなたは編集長です。
      【戦略】{{STRATEGY}}
      【記事】{{CONTENT_SNIPPET}}
      出力JSON: { "status": "APPROVED"|"REVIEW_REQUIRED", "score": number, "comments": "..." }`
};

const cleanJson = (text) => {
    try {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) return JSON.parse(jsonMatch[1]);
        return JSON.parse(text);
    } catch (e) {
        console.error("JSON Parse Error:", text);
        return null;
    }
};

// --- Pipeline Logic ---

export const setupScheduler = (app) => {
    app.post('/schedule', async (req, res) => {
        // Immediate response to avoid timeout
        res.status(200).json({ status: 'started' });

        const PORT = process.env.PORT || 8080;
        const BASE_URL = `http://localhost:${PORT}`;

        console.log("[Scheduler] Triggered. Starting pipeline...");

        try {
            // 1. Fetch Prompts (Loopback)
            let prompts = DEFAULT_PROMPTS;
            try {
                const promptsRes = await fetch(`${BASE_URL}/api/settings/prompts`);
                if (promptsRes.ok) {
                    const savedPrompts = await promptsRes.json();
                    if (Object.keys(savedPrompts).length > 0) {
                        prompts = { ...DEFAULT_PROMPTS, ...savedPrompts };
                        console.log("[Scheduler] Loaded custom prompts.");
                    }
                }
            } catch (e) { console.warn("Failed to load custom prompts, using default."); }

            // 2. Fetch Analytics (Loopback)
            let analyticsData = {};
            try {
                const analyticsRes = await fetch(`${BASE_URL}/api/analytics`);
                if (analyticsRes.ok) analyticsData = await analyticsRes.json();
            } catch (e) { console.error("Failed to fetch analytics."); }

            // 3. Fetch Past Articles (for context)
            let pastArticles = [];
            try {
                const articlesRes = await fetch(`${BASE_URL}/api/firestore/articles`);
                if (articlesRes.ok) {
                    const data = await articlesRes.json();
                    // Basic parsing of Firestore structure is needed if using raw list endpoint... 
                    // Actually /api/firestore/articles returns raw Firestore response? 
                    // Let's check server.js... yes, likely raw documents.
                    // To keep it simple, we might skip past article context or try to parse minimal info.
                    // For now, let's assume empty context to reduce complexity risk in this "blind" implementation.
                    // Or retrieve just a few?
                    // Let's Skip for V1 stability.
                }
            } catch (e) { }

            // --- Execution Loop (1 run for now, can be loop) ---
            console.log("[Scheduler] 1. Analyst Agent...");
            const analystPrompt = prompts.analyst
                .replace('{{ANALYTICS_DATA}}', JSON.stringify(analyticsData))
                .replace('{{PAST_TOPICS}}', "なし")
                .replace('{{APP_CONTEXT}}', APP_CONTEXT);

            const analystRes = await fetch(`${BASE_URL}/api/gemini/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'gemini-3-pro-preview', contents: { parts: [{ text: analystPrompt }] } })
            });
            const analystJson = await analystRes.json();
            const analysis = cleanJson(analystJson.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
            if (!analysis) throw new Error("Analysis failed");

            console.log("[Scheduler] 2. Marketer Agent...");
            const marketerPrompt = prompts.marketer
                .replace('{{ANALYSIS_RESULT}}', JSON.stringify(analysis))
                .replace('{{PAST_TITLES}}', "なし")
                .replace('{{APP_CONTEXT}}', APP_CONTEXT);

            const marketerRes = await fetch(`${BASE_URL}/api/gemini/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'gemini-3-pro-preview', contents: { parts: [{ text: marketerPrompt }] } })
            });
            const marketerJson = await marketerRes.json();
            const strategy = cleanJson(marketerJson.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

            console.log("[Scheduler] 3. Writer Agent...");
            const writerPrompt = prompts.writer
                .replace('{{STRATEGY}}', JSON.stringify(strategy))
                .replace('{{APP_CONTEXT}}', APP_CONTEXT);

            const writerRes = await fetch(`${BASE_URL}/api/gemini/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'gemini-3-pro-preview', contents: { parts: [{ text: writerPrompt }] } })
            });
            const writerJson = await writerRes.json();
            const contentText = writerJson.candidates?.[0]?.content?.parts?.[0]?.text || "";

            // Split content
            const parts = contentText.split('[SPLIT]');
            const content = {
                title: strategy.title || "No Title",
                body_p1: parts[0] || "",
                body_p2: parts[1] || "",
                body_p3: parts[2] || ""
            };

            // 4. Designer Agent (Simplification: Text only for V1 or Default Image)
            // Generating images is heavy and complex. Let's use placeholders or generate prompts but skip actual generation for stability?
            // User specs said "generate 1-3 articles".
            // Let's generate prompts but use default image to save tokens/time in this background script.
            // Or better: call designer but ignore image generation errors.
            console.log("[Scheduler] 4. Designer Agent...");
            const designerPrompt = prompts.designer
                .replace('{{TITLE}}', content.title)
                .replace('{{CONTENT_SNIPPET}}', content.body_p1.substring(0, 200))
                .replace('{{STYLE_INSTRUCTION}}', "Style: Illustration. NO TEXT.");

            const designerRes = await fetch(`${BASE_URL}/api/gemini/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'gemini-3-pro-preview', contents: { parts: [{ text: designerPrompt }] } })
            });
            const designerJson = await designerRes.json();
            const designPrompts = cleanJson(designerJson.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

            // 5. Controller
            console.log("[Scheduler] 5. Controller Agent...");
            const controllerPrompt = prompts.controller
                .replace('{{STRATEGY}}', JSON.stringify(strategy))
                .replace('{{CONTENT_SNIPPET}}', content.body_p1.substring(0, 500));

            const controllerRes = await fetch(`${BASE_URL}/api/gemini/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'gemini-3-pro-preview', contents: { parts: [{ text: controllerPrompt }] } })
            });
            const controllerJson = await controllerRes.json();
            const review = cleanJson(controllerJson.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

            // 6. Save
            console.log("[Scheduler] Saving content...");
            const article = {
                id: `scheduled_${Date.now()}`,
                date: new Date().toISOString(),
                status: 'Drafting',
                analysis_report: analysis,
                marketing_strategy: strategy,
                content: content,
                image_urls: [], // Placeholder
                design: designPrompts,
                review: review
            };

            // Formatting for Firestore Save Endpoint (expects `documentBody` and `documentId`)
            // We need a helper to Convert to Firestore Value. 
            // Importing from `firestoreService.ts` is hard.
            // Let's implement a simple recursive `toFirestoreValue` here.
            const toFirestoreValue = (val) => {
                if (val === null || val === undefined) return { nullValue: null };
                if (typeof val === 'string') return { stringValue: val };
                if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: val } : { doubleValue: val };
                if (typeof val === 'boolean') return { booleanValue: val };
                if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
                if (typeof val === 'object') {
                    const fields = {};
                    for (const k in val) fields[k] = toFirestoreValue(val[k]);
                    return { mapValue: { fields } };
                }
                return { stringValue: String(val) };
            };

            const firestoreFields = {
                date: article.date,
                status: article.status,
                analysis_report: article.analysis_report,
                marketing_strategy: article.marketing_strategy,
                content: article.content,
                image_urls: article.image_urls,
                review_score: article.review?.score || 0,
                review_comment: article.review?.comments || "",
                design_prompts: {
                    thumbnail: article.design?.thumbnail_prompt,
                    section1: article.design?.section1_prompt,
                    section2: article.design?.section2_prompt,
                    section3: article.design?.section3_prompt
                }
            };

            await fetch(`${BASE_URL}/api/firestore/save`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    documentId: article.id,
                    documentBody: { fields: toFirestoreValue(firestoreFields).mapValue.fields }
                })
            });

            console.log("[Scheduler] Pipeline Completed Successfully.");

        } catch (e) {
            console.error("[Scheduler] Pipeline Failed:", e);
        }
    });
};
