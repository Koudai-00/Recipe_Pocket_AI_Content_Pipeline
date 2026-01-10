from .base_agent import BaseAgent
import json

class WriterAgent(BaseAgent):
    def __init__(self):
        super().__init__(model_name="gemini-1.5-pro-001")

    def write_article(self, strategy):
        """
        Writes the article based on the strategy.
        Splits the body into 3 parts using [SPLIT] marker.
        """
        prompt = f"""
        You are a professional blogger (30s female, friendly, relatable tone).
        Write a blog post for the app 'Recipe Pocket' based on the following strategy.

        Strategy:
        {json.dumps(strategy, indent=2)}

        Requirements:
        1. **Tone**: Casual, empathetic, "Let's do this together!" vibe. Use emojis occasionally.
        2. **Structure**: Follow the provided structure.
        3. **Formatting**: Use Markdown.
        4. **Length**: 1500-2000 characters total.
        5. **Segmentation**: You MUST split the main body content into exactly 3 parts so we can insert images between them. 
           Insert the marker "[SPLIT]" between these parts. 
           Do NOT put [SPLIT] at the very beginning or end.
           
        Input Data (Strategy):
        Title: {strategy.get('title')}
        Angle: {strategy.get('marketing_angle')}
        
        Output:
        Return the full article text in Markdown.
        """
        
        response_text = self.generate_content(prompt, temperature=0.7)
        return response_text
