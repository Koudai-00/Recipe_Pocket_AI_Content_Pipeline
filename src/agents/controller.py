from .base_agent import BaseAgent
import json
import logging

class ControllerAgent(BaseAgent):
    def __init__(self):
        super().__init__(model_name="gemini-1.5-pro-001")

    def review_article(self, article_content, strategy):
        """
        Reviews the article for quality, safety, and alignment with strategy.
        """
        prompt = f"""
        You are the Editor-in-Chief for 'Recipe Pocket'.
        Review the following article draft.

        Strategy Goal: {strategy.get('marketing_angle')}
        Target Audience: 30s Housewives
        
        Draft Content:
        {article_content}

        Task:
        1. Check for Japanese grammar or unnatural phrasing.
        2. Verify the tone is friendly and appropriate.
        3. Ensure there are exactly 2 markers "[SPLIT]" (dividing the text into 3 parts) or close to it.
        4. Check for any harmful or inappropriate content.

        Output format (JSON only):
        {{
            "status": "APPROVED",  // or "REVIEW_REQUIRED"
            "score": 85,           // 0-100
            "comments": "Brief feedback explaining the decision."
        }}
        """
        
        response_text = self.generate_content(prompt, temperature=0.0)
        cleaned_text = response_text.replace("```json", "").replace("```", "").strip()
        
        try:
            return json.loads(cleaned_text)
        except json.JSONDecodeError:
            logging.error("Failed to parse controller response")
            # Fail safe to review required
            return {
                "status": "REVIEW_REQUIRED",
                "score": 0,
                "comments": "JSON Parse Error in Reviewer Response"
            }
