import { AnalysisResult, StrategyResult, DesignPrompts, ReviewResult, Article } from "../types";
import { getRealAnalyticsData } from "./analyticsService";
import { APP_CONTEXT } from "../constants";

// Helper to call Backend API
const callGeminiApi = async (model: string, contents: any, config?: any) => {
  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, contents, config })
  });
  
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Gemini API call failed');
  }
  return await response.json();
};

// Helper to handle JSON extraction
const cleanJson = (text: string) => {
  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1]);
    }
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse JSON", text);
    throw new Error("Invalid JSON response from Agent");
  }
};

const TEXT_MODEL = "gemini-3-pro-preview";

// Helper: Generate Image using Gemini (via Backend)
const generateGeminiImage = async (prompt: string, model: string): Promise<string | undefined> => {
  try {
    const response = await callGeminiApi(model, { parts: [{ text: prompt }] }, {
      imageConfig: { aspectRatio: "16:9" }
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    return undefined;
  } catch (error) {
    console.error(`Gemini Image generation failed:`, error);
    return undefined;
  }
};

// Helper: Generate Image using Seedream API (Client side is fine if key is provided by user, 
// OR we could move this to backend too, but sticking to existing logic for Seedream specific API key from UI)
const generateSeedreamImage = async (prompt: string, apiKeyFromUI?: string): Promise<string | undefined> => {
    // Note: process.env is removed. We rely on UI input for Seedream for now or backend proxy if we wanted.
    // Keeping UI input logic for now as requested by previous implementation style.
    const arkKey = apiKeyFromUI; 
    
    if (!arkKey) {
        console.warn("Seedream/ARK API Key not provided.");
        return `https://placehold.co/2560x1440/FF8C00/ffffff.png?text=Seedream+Key+Missing`;
    }

    try {
        console.log("Calling Seedream API...");
        const res = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/images/generations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${arkKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "seedream-4-5-251128", 
                prompt: prompt,
                size: "2560x1440", 
                sequential_image_generation: "disabled",
                response_format: "url",
                stream: false,
                watermark: false
            })
        });
        
        if (!res.ok) throw new Error(await res.text());
        
        const data = await res.json();
        if (data.data && data.data.length > 0 && data.data[0].url) {
            return data.data[0].url;
        }
        return `https://placehold.co/2560x1440/e11d48/ffffff.png?text=Invalid+Response`;

    } catch (e) {
         console.error("Seedream Error:", e);
         return `https://placehold.co/2560x1440/e11d48/ffffff.png?text=Generation+Error`;
    }
};

const generateImage = async (prompt: string, model: string, apiKeys?: { seedream?: string }): Promise<string | undefined> => {
    if (model === 'seedream-4.5') {
        return generateSeedreamImage(prompt, apiKeys?.seedream);
    } else {
        return generateGeminiImage(prompt, model);
    }
};

export const analystAgent = async (pastArticles: Article[] = []): Promise<AnalysisResult> => {
  console.log("Fetching Analytics Data from Backend...");
  const analyticsData = await getRealAnalyticsData();
  const pastTopics = pastArticles.map(a => a.topic || a.content.title).join(", ");

  const prompt = `
    あなたは「Recipe Pocket」のプロのデータアナリストです。
    【分析対象データ】${JSON.stringify(analyticsData)}
    【過去のトピック】${pastTopics ? pastTopics : "なし"}
    【アプリ情報】${APP_CONTEXT}
    【指示】Google Analyticsデータを分析し、PV最大化のための記事トピックを決定してください。
    出力: JSON形式 { "direction": "...", "topic": "..." }
  `;

  try {
    const response = await callGeminiApi(TEXT_MODEL, prompt, { responseMimeType: "application/json" });
    if (!response.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error("No text returned");
    return cleanJson(response.candidates[0].content.parts[0].text);
  } catch (e) {
    throw new Error(`分析エージェントエラー: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const marketerAgent = async (analysis: AnalysisResult, pastArticles: Article[] = []): Promise<StrategyResult> => {
  const pastTitles = pastArticles.map(a => a.content?.title || a.title).join(", ");
  const prompt = `
    あなたは凄腕のマーケターです。
    【分析データ】${JSON.stringify(analysis)}
    【過去タイトル】${pastTitles}
    【アプリ詳細】${APP_CONTEXT}
    【指示】ターゲット（30代主婦）に刺さる記事戦略をJSONで出力してください。
    出力: JSON形式 { "concept": "...", "function_intro": "...", "title": "...", "structure": [] }
  `;

  try {
    const response = await callGeminiApi(TEXT_MODEL, prompt, { responseMimeType: "application/json" });
    if (!response.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error("No text returned");
    return cleanJson(response.candidates[0].content.parts[0].text);
  } catch (e) {
    return { concept: "エラー", function_intro: "", title: "戦略策定エラー", structure: [] };
  }
};

export const writerAgent = async (strategy: StrategyResult): Promise<string> => {
  const prompt = `
    あなたは「Recipe Pocket」の公式ブログを書く主婦ブロガーです。
    【戦略】${JSON.stringify(strategy)}
    【アプリ】${APP_CONTEXT}
    【ルール】Markdown形式。[SPLIT]マーカーを2回入れて3分割すること。
  `;

  try {
    const response = await callGeminiApi(TEXT_MODEL, prompt);
    return response.candidates?.[0]?.content?.parts?.[0]?.text || "執筆エラー";
  } catch (e) {
    return `執筆エラー: ${e instanceof Error ? e.message : String(e)}`;
  }
};

export const designerAgent = async (title: string, content: string, imageModel: string = 'gemini-2.5-flash-image', apiKeys?: { seedream?: string }): Promise<DesignPrompts> => {
  // Logic simplified for brevity, utilizing same backend call structure
  let styleInstruction = imageModel === 'gemini-3-pro-image-preview' 
    ? "Style: Infographic. INCLUDE JAPANESE TEXT." 
    : "Style: Illustration. NO TEXT.";

  const prompt = `
    画像生成プロンプト作成。
    タイトル: ${title}
    内容: ${content.substring(0, 500)}...
    ${styleInstruction}
    出力JSON: { "thumbnail_prompt": "...", "section1_prompt": "...", "section2_prompt": "...", "section3_prompt": "..." }
  `;

  let designData: DesignPrompts = { thumbnail_prompt: "", section1_prompt: "", section2_prompt: "", section3_prompt: "" };

  try {
    const response = await callGeminiApi(TEXT_MODEL, prompt, { responseMimeType: "application/json" });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) designData = cleanJson(text);
  } catch (e) {
    console.error("Designer Prompt Error:", e);
  }

  try {
    const [thumb, s1, s2, s3] = await Promise.all([
      designData.thumbnail_prompt ? generateImage(designData.thumbnail_prompt, imageModel, apiKeys) : undefined,
      designData.section1_prompt ? generateImage(designData.section1_prompt, imageModel, apiKeys) : undefined,
      designData.section2_prompt ? generateImage(designData.section2_prompt, imageModel, apiKeys) : undefined,
      designData.section3_prompt ? generateImage(designData.section3_prompt, imageModel, apiKeys) : undefined,
    ]);
    designData.thumbnail_base64 = thumb;
    designData.section1_base64 = s1;
    designData.section2_base64 = s2;
    designData.section3_base64 = s3;
  } catch (e) { console.error("Image Gen Error:", e); }

  return designData;
};

export const controllerAgent = async (strategy: StrategyResult, content: string): Promise<ReviewResult> => {
  const prompt = `
    あなたは編集長です。
    【戦略】${JSON.stringify(strategy)}
    【記事】${content.substring(0, 1000)}...
    出力JSON: { "status": "APPROVED"|"REVIEW_REQUIRED", "score": number, "comments": "..." }
  `;
  try {
    const response = await callGeminiApi(TEXT_MODEL, prompt, { responseMimeType: "application/json" });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No text");
    return cleanJson(text);
  } catch (e) {
    return { status: "REVIEW_REQUIRED", score: 0, comments: "Error" };
  }
};