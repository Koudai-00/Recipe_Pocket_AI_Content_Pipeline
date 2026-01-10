from .base_agent import BaseAgent
import json

class MarketerAgent(BaseAgent):
    def __init__(self):
        super().__init__(model_name="gemini-2.5-pro")

    def create_strategy(self, analysis_result, past_reports_context=""):
        """
        Creates a marketing strategy based on the analysis and past context.
        """
        prompt = f"""
        あなたは凄腕のマーケターです。データ分析結果と過去のレポートを基に、
        30代の主婦を中心とした料理好きの方々に「レシピポケット」をダウンロードしてもらうための戦略を立案してください。

        データ分析結果:
        {json.dumps(analysis_result, indent=2, ensure_ascii=False)}

        過去のレポート/記事（重複防止と文脈用）:
        {past_reports_context}

        戦略の軸: 
        読者の「献立に悩む」「動画が散らばって見つからない」という悩みに共感し、アプリの利便性を解決策として提示する。

        出力: 
        JSON形式で出力してください。
        {{
            "concept": "記事のコンセプト（ターゲットのどんな悩みに寄り添うか）",
            "function_intro": "アプリのどの機能（YouTube/TikTok一元管理など）をどう紹介するか",
            "title": "記事タイトル案",
            "structure": ["導入", "セクション1", "セクション2", "セクション3", "まとめ"]
        }}
        """
        
        response_text = self.generate_content(prompt, temperature=0.7)
        cleaned_text = response_text.replace("```json", "").replace("```", "").strip()
        
        try:
            return json.loads(cleaned_text)
        except json.JSONDecodeError:
            return {
                "concept": "分析結果に基づく提案",
                "function_intro": "動画管理機能の紹介",
                "title": f"{analysis_result.get('topic', 'レシピ')}の活用法",
                "structure": ["導入", "レシピ紹介", "アプリ紹介", "まとめ"]
            }
