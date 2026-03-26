import { AgentType } from './types';

export const AGENTS = [
  {
    id: AgentType.ANALYST,
    name: 'Analyst Agent',
    role: 'データ分析',
    icon: 'fa-chart-line',
    color: 'text-blue-500',
    bg: 'bg-blue-100',
    description: 'GA4データと過去の記事を分析し、未開拓の需要を特定します。'
  },
  {
    id: AgentType.MARKETER,
    name: 'Marketer Agent',
    role: '戦略立案',
    icon: 'fa-bullseye',
    color: 'text-purple-500',
    bg: 'bg-purple-100',
    description: 'アプリの強みを活かしたターゲット戦略と記事構成を定義します。'
  },
  {
    id: AgentType.WRITER,
    name: 'Writer Agent',
    role: '記事執筆',
    icon: 'fa-pen-nib',
    color: 'text-emerald-500',
    bg: 'bg-emerald-100',
    description: '親しみやすい主婦トーンで、アプリDLにつながる記事を執筆します。'
  },
  {
    id: AgentType.DESIGNER,
    name: 'Designer Agent',
    role: '画像設計',
    icon: 'fa-palette',
    color: 'text-pink-500',
    bg: 'bg-pink-100',
    description: '記事用の画像プロンプトを生成します。'
  },
  {
    id: AgentType.CONTROLLER,
    name: 'Controller Agent',
    role: '品質管理',
    icon: 'fa-clipboard-check',
    color: 'text-orange-500',
    bg: 'bg-orange-100',
    description: '戦略と品質基準に基づいてコンテンツをレビューします。'
  }
];

export const IMAGE_MODELS = [
  { value: 'gemini-2.5-flash-image', label: 'Gemini 2.5 Flash Image (文字なし・高速)' },
  { value: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro (文字あり・インフォグラフィック)' },
  { value: 'seedream-4.5', label: 'Seedream 4.5 (文字なし・高品質)' },
  { value: 'seedream-5.0-lite', label: 'Seedream 5.0 Lite (最新・高品質・高速)' },
  { value: 'openrouter-auto', label: 'OpenRouter (自動フォールバック)' }
];

export const APP_CONTEXT = `
◆アプリ名
レシピポケット

◆アプリの概要
YouTube・Instagram・TikTokなどに散らばった料理動画を、自分だけの「デジタルレシピ帳」として一元管理できるアプリ。
「あの動画、どこだっけ？」というストレスをゼロにし、料理をもっと楽しく、スムーズにすることを目指しています。

◆主なターゲット（ペルソナ）
- 20代〜50代の、日常的に料理をする女性。
- SNSで見つけた美味しそうなレシピを保存しているが、いざ作る時に見つけられず困っている人。
- 忙しい日々の中で、献立を考える時間やレシピを探す手間を減らし、少しでも心にゆとりを持ちたい人。

◆トーン＆マナー
30代の等身大の女性が、友人に教えるような感覚。「大変だよね」「これならできそう！」といった共感をベースにした、温かく前向きな表現。

◆アプリが提供する「価値」（記事での訴求ポイント）
1. 【心のゆとりを生む整理術】
   - SNSの垣根を超えて動画を1箇所に。探す手間が省けるから、調理前のイライラが解消されます。
2. 【「自分専用」の百科事典】
   - 好きなフォルダ（「絶品お肉」「5分副菜」など）に分けることで、開くたびにワクワクするマイレシピ帳が完成。
3. 【動画からレシピを「魔法」のように抽出】
   - 動画を見返さなくてもテキストで作り方を確認できるから、作業効率が劇的にアップ。

◆サイトの最終目的（CV）
アプリのダウンロード。
「このアプリがあれば、私の料理生活がもっとラクに、楽しくなりそう！」と感じてもらい、以下のリンクからアプリストアへ誘導してください。

◆アプリダウンロードURL
・ダウンロード専用ページ: https://recipepocket.jp/download
※ユーザーの端末情報を判定し、自動的にApp StoreまたはGoogle Playへ遷移する仕組みになっています。
・公式サイト: https://recipepocket.jp

◆注意事項（AIへの指示）
・「bulk-move」や「dashboard」などのURLパスや管理画面用語を記事内で使用しないでください。
・ユーザーには「一括整理機能」や「まとめて保存」などの自然な言葉で機能を紹介してください。
`;