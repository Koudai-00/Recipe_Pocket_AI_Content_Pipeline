import { AnalysisResult, StrategyResult, DesignPrompts, ReviewResult, Article, MonthlyAnalyticsMetrics, MonthlyReport, MonthlyReportAnalysis } from "../types";
import { getRealAnalyticsData, getMonthlyAnalytics } from "./analyticsService";
import { fetchMonthlyReports } from "./firestoreService";
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
const generateSeedreamImage = async (prompt: string, model: string, apiKeyFromUI?: string): Promise<string | undefined> => {
  // Determine actual model ID for BytePlus ARK
  let arkModelId = "seedream-4-5-251128";
  if (model === 'seedream-5.0-lite') {
    arkModelId = "seedream-5-0-lite-260128";
  }

  const arkKey = apiKeyFromUI;

  if (!arkKey) {
    console.warn("Seedream/ARK API Key not provided.");
    return `https://placehold.co/2560x1440/FF8C00/ffffff.png?text=Seedream+Key+Missing`;
  }

  try {
    console.log(`Calling Seedream API with model: ${arkModelId}...`);
    const res = await fetch('https://ark.ap-southeast.bytepluses.com/api/v3/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${arkKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: arkModelId,
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

const generateOpenRouterImage = async (prompt: string, model: string): Promise<string | undefined> => {
  try {
    console.log(`Calling OpenRouter Proxy with model: ${model}...`);
    const res = await fetch('/api/openrouter/generate-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ model, prompt })
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    if (data.imageUrl) return data.imageUrl;
    throw new Error("No image URL in response");
  } catch (e) {
    console.error(`OpenRouter Error (${model}):`, e);
    return undefined;
  }
};

const generateImage = async (prompt: string, model: string, apiKeys?: { seedream?: string }): Promise<string | undefined> => {
  if (model.startsWith('seedream')) {
    return generateSeedreamImage(prompt, model, apiKeys?.seedream);
  } else if (model.includes('/')) {
    return generateOpenRouterImage(prompt, model);
  } else {
    return generateGeminiImage(prompt, model);
  }
};

// Default Prompts Configuration
export const DEFAULT_PROMPTS = {
  analyst: `あなたは「Recipe Pocket」の戦略分析エージェントです。
    【インプット】
    - GA4データ（直近1ヶ月）: {{ANALYTICS_DATA}}
    - 過去記事の履歴（タイトル・キーワード・フェーズ）: {{PAST_ARTICLES_META}}
    - アプリの基本価値: {{APP_CONTEXT}}

    【指示】
    1. 過去記事の履歴を分析し、まだターゲットにできていない「具体的な悩み（ロングテールキーワード）」や、不足しているターゲット層（顕在/準顕在/潜在）を特定してください。
    2. PV最大化と新規ユーザー獲得のために、次に執筆すべき「トピック」と「狙うキーワード」を1つ決定してください。
    3. 「現在のアプリ紹介」ではなく、「ユーザーの課題解決」を主眼に置いたテーマを選定してください。

    【出力形式】
    JSON形式で出力してください。
    {
      "direction": "分析に基づく戦略的方向性（なぜこのテーマを選んだか）",
      "topic": "記事の主題（一言で）",
      "target_keywords": ["キーワード1", "キーワード2"],
      "target_phase": "顕在層 or 準顕在層 or 潜在層"
    }`,

  marketer: `あなたは凄腕のコンテンツマーケターです。分析結果に基づき、読者の共感とベネフィットを最大化する記事構成を立案してください。
    【分析結果】{{ANALYSIS_RESULT}}
    【アプリ詳細】{{APP_CONTEXT}}

    【記事構成のルール】
    1. タイトルは読者が思わずクリックしたくなる、ベネフィットが明確なものにしてください。
    2. 「機能の紹介」ではなく、「その機能によって読者の悩みがどう解決し、どんな良い変化（心にゆとりができる、等）が起きるか」をストーリー仕立てで構成してください。
    3. アプリの提案は自然な流れで行い、押し売り感を排除してください。

    【出力形式】
    JSON形式で出力してください。
    {
      "title": "読者を惹きつけるタイトル",
      "concept": "この記事が読者に提供するメインベネフィット",
      "target_keywords": ["分析結果から引き継いだキーワード"],
      "target_phase": "分析結果から引き継いだフェーズ",
      "structure": [
        "H2見出し1: 冒頭の悩み共感（2〜3つの段落）",
        "H2見出し2: 解決のヒントと具体的な日常シーンへの当てはめ（詳細に展開）",
        "H3見出し2-1: 具体的な理由や背景の深掘り",
        "H3見出し2-2: よくある失敗例や注意点",
        "H2見出し3: 解決ツールの提示（アプリの機能紹介）",
        "H3見出し3-1: フォルダ分けによる整理の魔法（具体的な使い方例）",
        "H3見出し3-2: AI抽出機能が救う忙しい夕飯作り（利用シーンの描写）",
        "H2見出し4: アプリを使った後の心境の変化（情緒的ベネフィット）",
        "H2見出し5: まとめと今日からできる小さな一歩"
      ],
      "how_to_solve_with_app": "アプリをどのように解決策として提示するかの具体案。3,000文字以上の長文を構成できるよう、各セクションの肉付け指示を含めてください。"
    }`,

  writer: `あなたは「レシピポケット」の公式ブログを書く主婦ブロガーです。
    【戦略】{{STRATEGY}}
    【アプリ】{{APP_CONTEXT}}
    【最重要：ボリューム指示】
    - **日本語の純粋な文章のみ（HTMLタグ除く）で、最低3,000文字、目標5,000文字**の長文記事を執筆してください。
    - 各見出し（H2, H3）の内容を極限まで肉付けし、読者が「これだけで悩みが解決する」と感じるほど詳細に書いてください。
    - 筆者の実体験に基づいたようなエピソードや、具体的な日常の描写を多用して文字数を稼ぐのではなく、内容を深めてください。
    【出力ルール】
    - **HTML形式**で出力すること（Markdownは使わない）
    - [SPLIT]マーカーを本文中に2回入れて3分割すること
    - 見出しは以下のHTMLで統一すること：
      - h2: <h2 style="border-left: 4px solid #FF6B35; padding-left: 12px; font-size: 1.4rem; font-weight: bold; margin: 2rem 0 1rem;">見出し</h2>
      - h3: <h3 style="font-size: 1.1rem; font-weight: bold; color: #333; border-bottom: 2px dashed #FFB347; padding-bottom: 4px; margin: 1.5rem 0 0.75rem;">見出し</h3>
    - 強調したいキーワードは: <mark style="background: linear-gradient(transparent 60%, #FFE066 60%); padding: 0 2px;">テキスト</mark>
    - 重要な言葉は: <span style="color: #FF6B35; font-weight: bold;">テキスト</span>
    - 箇条書きリストは: <ul style="list-style: none; padding-left: 0;">に<li style="padding: 6px 0 6px 24px; position: relative;">の前に<span style="position: absolute; left: 0; color: #FF6B35;">✔</span>
    - 本文の段落は <p style="line-height: 1.9; margin-bottom: 1rem; color: #444;"> で統一
    【アプリダウンロードボタンの設置（推奨）】
    - 記事の内容（アプリの機能紹介など）に合わせて、**ダウンロードへの誘導が自然だと判断される場合のみ**、以下のHTML形式のボタンを設置してください。
    - 文末に必ず置く必要はありません。アプリの利便性が具体的に語られた直後など、最も効果的で自然な場所に配置してください。
    - **設置する場合は、必ず以下のHTML構造（バッジ画像とリンクのセット）をそのまま使用してください。**

    <div style="text-align: center; margin: 2rem 0;">
      <a href="https://recipepocket.jp/download" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: linear-gradient(135deg, #FF6B35 0%, #FF8E53 100%); color: #ffffff; font-weight: bold; font-size: 1.1rem; padding: 16px 36px; border-radius: 50px; text-decoration: none; box-shadow: 0 4px 15px rgba(255, 107, 53, 0.4);">
        📱 アプリを無料でダウンロード
      </a>
    </div>`,

  designer: `画像生成プロンプト作成。
    タイトル: {{TITLE}}
    内容: {{CONTENT_SNIPPET}}
    {{STYLE_INSTRUCTION}}

    【画像スタイル統一ルール（全画像共通）】
    - カラーパレット: フルカラー・鮮やか配色。オレンジ (#FF6B35) をアクセントカラーとして使いつつ、青・緑・黄・ピンクなどカラフルな色も積極的に使用する。背景はホワイトまたは明るいグレー。
    - タッチ: モダンでクリーンなフラットイラスト。線が細く洗練された現代的なデザイン。レトロ・アニメ・古臭い表現は避ける。
    - 参考スタイル: Notion・Canva・Google のプロダクトイラストのような、2020年代のUIデザインに使われるスタイル。
    - 登場人物: シンプルで親しみやすい現代的な日本人女性（30代）。細い輪郭線、表情豊か。
    - 背景・構成: ミニマルで整理されたレイアウト。アイコンや矢印などUIパーツを組み合わせた情報整理感のあるビジュアル。
    - 雰囲気: 明るく前向き・スマート・「便利！」「解決した！」という現代的な達成感。
    - thumbnail_prompt: 記事テーマを一目で伝えるメインビジュアル（横長16:9）
    - section1_prompt: 読者の悩み・問題提起をカラフルかつわかりやすく表現したイラスト
    - section2_prompt: スマートフォンアプリ操作・解決策をモダンなUIと共に描いたイラスト
    - section3_prompt: 問題解決後の明るい生活シーン。カラフルで温かみのある雰囲気。
    出力JSON: { "thumbnail_prompt": "...", "section1_prompt": "...", "section2_prompt": "...", "section3_prompt": "..." }`,

  controller: `あなたは編集長です。
    【戦略】{{STRATEGY}}
    【記事全文】{{CONTENT_FULL}}
    {{PREVIOUS_SCORE_INSTRUCTION}}
    
    【採点基準】
    - 0-100点で採点してください。
    - **ボリュームチェック**: 日本語の文章（HTMLタグ除く）が3,000文字に満たない場合は、無条件で75点以下（REVIEW_REQUIRED）としてください。
    - 80点以上: 合格 (APPROVED)
    - 80点未満: 要修正 (REVIEW_REQUIRED)

    【重要】statusがREVIEW_REQUIREDの場合、improvement_pointsに3〜5項目の具体的な改善指示を記載してください。
    各指摘は「[セクション名] 問題点の説明。具体的な改善方向」の形式にしてください。
    例: "[セクション1] 冒頭が情報的すぎる。読者の悩みに共感する一文から始め、感情的な導入にする"

    出力JSON: { "status": "APPROVED"|"REVIEW_REQUIRED", "score": number, "comments": "...", "improvement_points": ["...", "..."] }`
};

export const analystAgent = async (pastArticles: Article[] = [], promptTemplate?: string, articleRequest?: string): Promise<AnalysisResult> => {
  console.log("Fetching Analytics Data from Backend...");
  const analyticsData = await getRealAnalyticsData();
  const pastMeta = pastArticles.map(a => `- ${a.content?.title || a.title} (Keywords: ${a.target_keywords?.join(",") || "未設定"}, Phase: ${a.target_phase || "未設定"})`).join("\n");

  let prompt = promptTemplate || DEFAULT_PROMPTS.analyst;
  prompt = prompt.replace('{{ANALYTICS_DATA}}', JSON.stringify(analyticsData))
    .replace('{{PAST_ARTICLES_META}}', pastMeta ? pastMeta : "なし")
    .replace('{{APP_CONTEXT}}', APP_CONTEXT);

  if (articleRequest && articleRequest.trim()) {
    prompt += `\n\n【特別指示】
    以下のユーザー要望を最優先で考慮し、この要望に沿った記事トピックを決定してください：
    「${articleRequest}」

    この要望を基に、データ分析結果とマッチングさせながら、最適なトピックを決定してください。`;
  }

  try {
    const response = await callGeminiApi(TEXT_MODEL, prompt, { responseMimeType: "application/json" });
    if (!response.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error("No text returned");
    return cleanJson(response.candidates[0].content.parts[0].text);
  } catch (e) {
    throw new Error(`分析エージェントエラー: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const marketerAgent = async (analysis: AnalysisResult, pastArticles: Article[] = [], promptTemplate?: string, articleRequest?: string): Promise<StrategyResult> => {
  const pastTitles = pastArticles.map(a => a.content?.title || a.title).join(", ");

  let prompt = promptTemplate || DEFAULT_PROMPTS.marketer;
  prompt = prompt.replace('{{ANALYSIS_RESULT}}', JSON.stringify(analysis))
    .replace('{{PAST_TITLES}}', pastTitles)
    .replace('{{APP_CONTEXT}}', APP_CONTEXT);

  if (articleRequest && articleRequest.trim()) {
    prompt += `\n\n【重要指示】
    ユーザーから以下のリクエストがあります。このリクエストを最優先でマーケティング戦略に反映してください：
    「${articleRequest}」

    上記リクエストに基づき、ターゲット層に響く魅力的なタイトルと構成を考えてください。`;
  }

  try {
    const response = await callGeminiApi(TEXT_MODEL, prompt, { responseMimeType: "application/json" });
    if (!response.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error("No text returned");
    const result = cleanJson(response.candidates[0].content.parts[0].text);
    // Ensure keywords and phase are carried over from analysis if somehow missing in marketer output
    return {
      ...result,
      target_keywords: result.target_keywords || analysis.target_keywords,
      target_phase: result.target_phase || analysis.target_phase
    };
  } catch (e) {
    return { 
      concept: "エラー", 
      function_intro: "", 
      title: "戦略策定エラー", 
      structure: [],
      target_keywords: analysis.target_keywords,
      target_phase: analysis.target_phase
    };
  }
};

export const writerAgent = async (strategy: StrategyResult, promptTemplate?: string, rewriteContext?: { feedback: string, currentContent: string, improvement_points?: string[] }): Promise<string> => {
  let prompt = promptTemplate || DEFAULT_PROMPTS.writer;

  if (rewriteContext) {
    const contentToInclude = rewriteContext.currentContent.substring(0, 20000);
    const improvementSection = rewriteContext.improvement_points && rewriteContext.improvement_points.length > 0
      ? `\n    ＜具体的な改善指示（必ず全て対応してください）＞\n${rewriteContext.improvement_points.map((p, i) => `    ${i + 1}. ${p}`).join('\n')}`
      : '';
    prompt += `
    
    【修正依頼】
    あなたは以前この戦略に基づいて記事を書きましたが、以下のレビュワーからの指摘を受けて修正が必要です。
    
    ＜レビュワーコメント＞
    ${rewriteContext.feedback}
    ${improvementSection}
    
    ＜現在の記事全文＞
    ${contentToInclude}
    
    【指示】
    - 上記の改善指示で指摘された箇所を修正してください。
    - 指摘されていない部分は現在の記事をそのまま維持してください。
    - ただし、HTMLタグが途中で切れている・閉じられていないなどの破損がある場合は、指摘の有無に関わらず必ず修正してください。
    - 記事の末尾まで必ず完全に出力してください。途中で切れた場合は文脈に合わせて完結させてください。
    - 全てのHTMLタグを正しく閉じてください。
    - 記事全体の長さ・ボリュームは維持してください（短縮しないこと）。
    - 出力形式は前回同様、[SPLIT]マーカーを含む形式です。
    `;
  }

  prompt = prompt.replace('{{STRATEGY}}', JSON.stringify(strategy))
    .replace('{{APP_CONTEXT}}', APP_CONTEXT);

  try {
    const response = await callGeminiApi(TEXT_MODEL, prompt);
    return response.candidates?.[0]?.content?.parts?.[0]?.text || "執筆エラー";
  } catch (e) {
    return `執筆エラー: ${e instanceof Error ? e.message : String(e)}`;
  }
};

export const designerAgent = async (title: string, content: string, imageModel: string = 'gemini-2.5-flash-image', apiKeys?: { seedream?: string }, promptTemplate?: string): Promise<DesignPrompts> => {
  let styleInstruction = imageModel === 'gemini-3-pro-image-preview'
    ? "Style: Infographic. INCLUDE JAPANESE TEXT."
    : "Style: Illustration. NO TEXT.";

  let prompt = promptTemplate || DEFAULT_PROMPTS.designer;
  prompt = prompt.replace('{{TITLE}}', title)
    .replace('{{CONTENT_SNIPPET}}', content.substring(0, 500) + '...')
    .replace('{{STYLE_INSTRUCTION}}', styleInstruction);

  let designData: DesignPrompts = { thumbnail_prompt: "", section1_prompt: "", section2_prompt: "", section3_prompt: "" };

  try {
    const response = await callGeminiApi(TEXT_MODEL, prompt, { responseMimeType: "application/json" });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) designData = cleanJson(text);
  } catch (e) {
    console.error("Designer Prompt Error:", e);
  }

  // Image generation
  try {
    const generateAndLog = async (key: string, prompt: string) => {
      try {
        console.log(`[DesignerAgent] Generating ${key}...`);

        if (imageModel === 'openrouter-auto') {
          const fallbackModels = [
            'bytedance-seed/seedream-4.5',
            'black-forest-labs/flux.2-max',
            'black-forest-labs/flux.2-pro',
            'black-forest-labs/flux.2-klein-4b'
          ];
          
          let logMessages: string[] = [];
          for (const model of fallbackModels) {
            const result = await generateImage(prompt, model, apiKeys);
            if (result) {
              logMessages.push(`${model}（このモデルにて生成）`);
              designData.image_model = logMessages.join('\n');
              return result;
            } else {
              logMessages.push(`${model}（エラー）`);
            }
          }
          
          console.warn(`[DesignerAgent] ${key}: All OpenRouter models failed. Falling back to Gemini.`);
          const result = await generateImage(prompt, 'gemini-2.5-flash-image');
          logMessages.push(`Gemini 2.5 Flash Image（このモデルにて生成）`);
          designData.image_model = logMessages.join('\n');
          return result;
        }

        const result = await generateImage(prompt, imageModel, apiKeys);
        if (!result) console.warn(`[DesignerAgent] ${key} generation returned empty result.`);
        return result;
      } catch (err) {
        console.error(`[DesignerAgent] ${key} generation failed:`, err);
        return undefined;
      }
    };

    const [thumb, s1, s2, s3] = await Promise.all([
      designData.thumbnail_prompt ? generateAndLog('thumbnail', designData.thumbnail_prompt) : undefined,
      designData.section1_prompt ? generateAndLog('section1', designData.section1_prompt) : undefined,
      designData.section2_prompt ? generateAndLog('section2', designData.section2_prompt) : undefined,
      designData.section3_prompt ? generateAndLog('section3', designData.section3_prompt) : undefined,
    ]);

    designData.thumbnail_base64 = thumb;
    designData.section1_base64 = s1;
    designData.section2_base64 = s2;
    designData.section3_base64 = s3;
    if (imageModel !== 'openrouter-auto' || (!designData.image_model)) {
        designData.image_model = imageModel;
    }
  } catch (e) {
    console.error("Critical Image Gen Error in DesignerAgent:", e);
  }

  return designData;
};

export const controllerAgent = async (strategy: StrategyResult, content: string, promptTemplate?: string, previousScore?: number): Promise<ReviewResult> => {
  let prompt = promptTemplate || DEFAULT_PROMPTS.controller;

  const contentForReview = content;

  const previousScoreInstruction = previousScore !== undefined
    ? `【前回スコア: ${previousScore}点】リライトによる改善を評価してください。改善が見られる場合は前回スコア以上を付けてください。`
    : '';

  prompt = prompt.replace('{{STRATEGY}}', JSON.stringify(strategy))
    .replace('{{CONTENT_FULL}}', contentForReview)
    .replace('{{CONTENT_SNIPPET}}', contentForReview)
    .replace('{{PREVIOUS_SCORE_INSTRUCTION}}', previousScoreInstruction);

  try {
    const response = await callGeminiApi(TEXT_MODEL, prompt, { responseMimeType: "application/json" });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No text");
    let result = cleanJson(text);
    // Guard: if AI returns an array instead of an object, extract first element
    if (Array.isArray(result)) {
      result = result[0] ?? {};
    }
    if (!result.improvement_points) {
      result.improvement_points = [];
    }
    return result;
  } catch (e) {
    return { status: "REVIEW_REQUIRED", score: 0, comments: "Error", improvement_points: [] };
  }
};

// Add to Default Prompts
const MONTHLY_REPORT_PROMPT = `あなたは「Recipe Pocket」の最高戦略責任者（CSO）です。
【当月の実績】{{CURRENT_METRICS}}
【過去のレポート（要約）】{{PAST_REPORTS}}
【指示】
1. 当月の成果を評価してください（前月比などを考慮）。
2. 次月のKPI（PV目標値と注力カテゴリ）を設定してください。
3. 具体的な戦略（記事の方向性）とアクションプランを提示してください。

出力形式 (JSON):
{
  "evaluation": "...",
  "kpis": { "pv_target": number, "focus_category": "..." },
  "strategy_focus": "...",
  "action_items": ["...", "..."]
}`;

export const monthlyReportAgent = async (): Promise<{ report: MonthlyReport, analysis: MonthlyReportAnalysis }> => {
  try {
    console.log("Fetching Monthly Analytics...");
    const metrics = await getMonthlyAnalytics();

    console.log("Fetching Past Reports...");
    const pastReports = await fetchMonthlyReports();
    const pastSummary = pastReports.slice(0, 3).map(r =>
      `[${r.month}] KPI: PV${r.analysis?.kpis?.pv_target}, Focus:${r.analysis?.kpis?.focus_category}, Eval:${r.analysis?.evaluation}`
    ).join("\n");

    console.log("Generating Strategic Analysis...");
    let prompt = MONTHLY_REPORT_PROMPT;
    prompt = prompt.replace('{{CURRENT_METRICS}}', JSON.stringify(metrics))
      .replace('{{PAST_REPORTS}}', pastSummary || "なし");

    const response = await callGeminiApi(TEXT_MODEL, prompt, { responseMimeType: "application/json" });
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("No analysis generated");

    const analysis: MonthlyReportAnalysis = cleanJson(text);

    const today = new Date();
    const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    const fullReport: MonthlyReport = {
      id: monthStr,
      month: monthStr,
      created_at: today.toISOString(),
      metrics: metrics,
      analysis: analysis
    };

    return { report: fullReport, analysis };

  } catch (e) {
    console.error("Monthly Report Agent Error:", e);
    throw e;
  }
};