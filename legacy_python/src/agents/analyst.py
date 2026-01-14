from .base_agent import BaseAgent
import json

class AnalystAgent(BaseAgent):
    def __init__(self):
        super().__init__(model_name="gemini-2.5-pro")

    def analyze(self, ga4_report, avoid_topics=None):
        """
        Analyzes GA4 data to determine the best topic for today's article.
        avoid_topics: List of strings (topics) to exclude from suggestion.
        """
        avoid_instruction = ""
        if avoid_topics and len(avoid_topics) > 0:
            avoid_instruction = f"重要: 以下のトピックは既に作成済みのため、絶対に避けて別の視点で提案してください: {', '.join(avoid_topics)}"

        prompt = f"""
        あなたはプロのデータアナリストです。運営中の料理動画管理アプリ「レシピポケット」のGA4データを分析してください。

        目標: PV数の最大化。

        分析対象: 直近の検索キーワード、PV上位記事、週間/月間目標との乖離。
        
        GA4 Report:
        {json.dumps(ga4_report, indent=2, ensure_ascii=False, default=str)}

        {avoid_instruction}

        出力: 
        JSON形式で出力してください。
        {{
            "direction": "今日の注力すべき方向性（例：今週はロングテール記事が続いたので、今日は旬の食材を使ったトレンド記事でPVを狙う）",
            "topic": "狙うべきメインキーワードと共起語"
        }}
        """
        
        response_text = self.generate_content(prompt, temperature=0.2)
        cleaned_text = response_text.replace("```json", "").replace("```", "").strip()
        
        try:
            return json.loads(cleaned_text)
        except json.JSONDecodeError:
            return {
                "direction": "データ解析エラーのためトレンド重視",
                "topic": "時短レシピ 晩御飯"
            }
