from .base_agent import BaseAgent
import json

class WriterAgent(BaseAgent):
    def __init__(self):
        super().__init__(model_name="gemini-2.5-pro")

    def write_article(self, strategy):
        """
        Writes the article based on the strategy.
        """
        prompt = f"""
        あなたは30代の女性ブロガーです。料理が大好きで、実体験を交えた共感性の高い記事を書くのが得意です。

        戦略/構成案:
        {json.dumps(strategy, indent=2, ensure_ascii=False)}

        トーン: 
        親しみやすく、少し崩した口調（「〜だよね」「〜しちゃった！」など）。硬い表現は避けてください。

        タスク: 
        1. 読者が「わかる！」と思える実体験エピソードから始めてください。 
        2. 記事全体を執筆した後、内容の区切りが良い箇所に [SPLIT] というマーカーを2つ入れ、全体を3つのセクションに分けてください。 
        3. 読後感として「レシピポケットを使えば料理がもっと楽になりそう」と思わせる構成にしてください。
        
        出力:
        Markdown形式の本文のみ
        """
        
        response_text = self.generate_content(prompt, temperature=0.7)
        return response_text
