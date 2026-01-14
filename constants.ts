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
  { value: 'seedream-4.5', label: 'Seedream 4.5 (文字なし・高品質)' }
];

export const APP_CONTEXT = `
◆アプリ名
Recipe Pocket (レシピポケット)

◆アプリの概要
YouTube・Instagram・TikTokなどに散らばった料理動画を「保存・整理・閲覧」できる一元管理アプリ。
bolt.new（React Nativeベース）で開発、Supabase使用。
自分だけの「レシピライブラリ」を作成可能。

◆主なターゲット（ペルソナ）
30代〜40代の主婦層、料理好きな女性。
「あの動画どこだっけ？」とSNS内で探す手間を省きたい、献立に悩む時間を減らしたい人。

◆トーン＆マナー
30代の女性が書いたような親しみやすい感じ。実体験を含めた共感性の高い文章。
口調は硬すぎず、少し崩したフレンドリーな感じ（「〜だよね」「〜しちゃおう！」など）。

◆主な機能とメリット（記事での訴求ポイント）
1. 【動画一元管理】
   - YouTube/Instagram/TikTokの動画を1つのアプリにまとめられる。
   - 1行2列のビデオカード形式で見やすい。
2. 【アプリ内再生】
   - 外部アプリに飛ばずにRecipe Pocket内で再生可能。広告に邪魔されにくい。
3. 【フォルダ管理】
   - 「お弁当」「夕飯」「パーティ」など自由にフォルダ分けして整理。
4. 【簡単登録 (自動取得)】
   - URLを入力するだけで、サムネイル・タイトル・投稿者名を自動取得して保存。
5. 【レシピ検索】
   - 保存した動画の中からタイトルやメモで検索可能。
   - フォルダ別、SNS媒体別での絞り込みもOK。

◆サイトの最終目的（CV）
アプリのダウンロード。
記事を通じて読者の課題（献立悩み、動画整理の煩わしさ）を解決し、「これなら便利そう！」と思わせてDLへ誘導する。
`;