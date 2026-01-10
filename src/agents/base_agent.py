import logging
import vertexai
from vertexai.generative_models import GenerativeModel, SafetySetting
from config import Config

class BaseAgent:
    def __init__(self, model_name="gemini-1.5-pro-001"):
        # Initialize Vertex AI
        project_id = Config.PROJECT_ID
        location = Config.REGION
        vertexai.init(project=project_id, location=location)
        
        self.model = GenerativeModel(model_name)
        
    def generate_content(self, prompt, temperature=0.7):
        try:
            response = self.model.generate_content(
                prompt,
                generation_config={
                    "max_output_tokens": 8192,
                    "temperature": temperature,
                    "top_p": 0.95,
                }
            )
            return response.text
        except Exception as e:
            logging.error(f"Error generating content: {e}")
            raise
