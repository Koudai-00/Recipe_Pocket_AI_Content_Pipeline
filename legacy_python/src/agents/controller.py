from .base_agent import BaseAgent
import json
import logging

class ControllerAgent(BaseAgent):
    def __init__(self):
        super().__init__(model_name="gemini-2.5-pro")

    def review_article(self, article_content, strategy):
        """
        Reviews the article for quality.
        """
        prompt = f"""
        あなたは編集長兼品質管理責任者です。作成された全てのデータをチェックし、以下の基準で判定してください。

        戦略の意図: {strategy.get('concept')}
        
        Draft Content:
        {article_content}

        合格基準:
        - 日本語のミスや文章構成の破綻がないか。
        - セクションの区切り（[SPLIT]）が文脈として自然か。
        - 戦略レポートの意図（アプリ訴求やキーワード）が記事に反映されているか。

        出力: 
        JSON形式で出力してください。
        {{
            "status": "APPROVED",  // APPROVED（公開） または REVIEW_REQUIRED（保留）
            "score": 85,           // 0-100
            "comments": "判定理由（保留の場合は具体的な修正指示）"
        }}
        """
        
        response_text = self.generate_content(prompt, temperature=0.0)
        cleaned_text = response_text.replace("```json", "").replace("```", "").strip()
        
        try:
            return json.loads(cleaned_text)
        except json.JSONDecodeError:
            logging.error("Failed to parse controller response")
            return {
                "status": "REVIEW_REQUIRED",
                "score": 0,
                "comments": "JSON Parse Error in Reviewer Response"
            }
