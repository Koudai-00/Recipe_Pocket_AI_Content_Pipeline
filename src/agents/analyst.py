from .base_agent import BaseAgent
import json

class AnalystAgent(BaseAgent):
    def __init__(self):
        super().__init__(model_name="gemini-1.5-pro-001") # Using 1.5 Pro as 2.5 is not yet available/standard

    def analyze(self, ga4_report):
        """
        Analyzes GA4 data to determine the best topic for today's article.
        """
        prompt = f"""
        You are an expert Data Analyst for a cooking app 'Recipe Pocket'.
        Based on the following Google Analytics 4 report (Top Pages yesterday), 
        identify the most promising topic for a new article to maximize App Downloads (CV) and User Engagement.

        GA4 Report:
        {json.dumps(ga4_report, indent=2)}

        Goal:
        - Select a specific cooking theme or recipe category that is trending or has high engagement.
        - The target audience is 30s housewives and cooking enthusiasts.

        Output format (JSON only):
        {{
            "topic": "Selected Topic Name",
            "reasoning": "Why this topic was chosen based on data",
            "target_keywords": ["keyword1", "keyword2"]
        }}
        """
        
        response_text = self.generate_content(prompt, temperature=0.2)
        
        # Clean up code blocks if Present
        cleaned_text = response_text.replace("```json", "").replace("```", "").strip()
        
        try:
            return json.loads(cleaned_text)
        except json.JSONDecodeError:
            return {
                "topic": "Seasonal Easy Recipes",
                "reasoning": "Fallback due to parse error. Seasonal recipes are always popular.",
                "target_keywords": ["easy recipe", "dinner ideas"]
            }
