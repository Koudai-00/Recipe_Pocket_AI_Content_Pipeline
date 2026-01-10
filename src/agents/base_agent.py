import logging
import google.generativeai as genai
from config import Config

class BaseAgent:
    def __init__(self, model_name="gemini-2.5-pro"):
        # Initialize Google AI Studio (API Key)
        api_key = Config.get_gemini_api_key()
        if not api_key:
            logging.warning("GEMINI_API_KEY not found. Helper agents may fail.")
        else:
            genai.configure(api_key=api_key)
        
        self.model = genai.GenerativeModel(model_name)
        self.generation_config = genai.types.GenerationConfig(
            candidate_count=1,
            max_output_tokens=8192,
            temperature=0.7,
        )
        
    def generate_content(self, prompt, temperature=None):
        try:
            # Override temperature if provided
            config = self.generation_config
            if temperature is not None:
                config.temperature = temperature

            response = self.model.generate_content(
                prompt,
                generation_config=config
            )
            return response.text
        except Exception as e:
            logging.error(f"Error generating content: {e}")
            raise
