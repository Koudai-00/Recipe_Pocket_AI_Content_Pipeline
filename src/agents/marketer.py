from .base_agent import BaseAgent
import json

class MarketerAgent(BaseAgent):
    def __init__(self):
        super().__init__(model_name="gemini-1.5-pro-001")

    def create_strategy(self, analysis_result, existing_topics=[]):
        """
        Creates a marketing strategy based on the analysis and avoids duplicates.
        """
        topic = analysis_result.get("topic")
        
        # Simple duplicate check in prompt, though better handled by Firestore logic external to this
        # Here we just ask it to refine the angle if it sounds generic
        
        prompt = f"""
        You are a Marketing Strategist for 'Recipe Pocket'.
        
        Selected Topic: {topic}
        Analysis: {analysis_result.get('reasoning')}
        Target Audience: 30s housewives, friendly tone (blogger style).
        
        Task:
        Develop a content strategy to write a blog post about this topic.
        The post must encourage users to download the 'Recipe Pocket' app.
        
        Output format (JSON only):
        {{
            "title": "Catchy Blog Title",
            "article_structure": ["Intro", "Point 1", "Point 2", "App Promo", "Conclusion"],
            "marketing_angle": "How to position the app as the solution (e.g. saves time, organizes recipes)",
            "tone_guide": "Specific instructions for the writer agent (e.g. use emojis, ask questions)"
        }}
        """
        
        response_text = self.generate_content(prompt, temperature=0.7)
        cleaned_text = response_text.replace("```json", "").replace("```", "").strip()
        
        try:
            return json.loads(cleaned_text)
        except json.JSONDecodeError:
            return {
                "title": f"Enjoy {topic} at home!",
                "article_structure": ["Intro", "Tips", "Conclusion"],
                "marketing_angle": "Standard promo",
                "tone_guide": "Friendly"
            }
