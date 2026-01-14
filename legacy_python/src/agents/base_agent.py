import logging
import google.generativeai as genai
import vertexai
from vertexai.generative_models import GenerativeModel as VertexGenerativeModel
from vertexai.generative_models import GenerationConfig as VertexGenerationConfig
from config import Config

class BaseAgent:
    def __init__(self, model_name="gemini-2.5-pro"):
        self.use_vertex = False
        self.model_name = model_name
        
        # Try to get API Key first
        api_key = Config.get_gemini_api_key()
        
        if api_key:
            # Mode A: Use Google AI Studio with API Key
            logging.info("Initializing Agent with Google AI Studio (API Key)...")
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel(model_name)
            self.generation_config = genai.types.GenerationConfig(
                candidate_count=1,
                max_output_tokens=8192,
                temperature=0.7,
            )
        else:
            # Mode B: Use Vertex AI with IAM (Cloud Run / Local ADC)
            logging.info("Initializing Agent with Vertex AI (IAM)...")
            try:
                vertexai.init(project=Config.PROJECT_ID, location=Config.REGION)
                self.use_vertex = True
                
                # Adjust model name for Vertex AI if needed (sometimes schemas differ, but usually similar)
                # Vertex often prefers 'gemini-1.5-pro-preview-0409' etc, but 'gemini-1.5-pro' aliases usually work.
                # For 'gemini-2.5-pro', ensure it maps correctly or use 'gemini-1.5-pro' as fallback if needed.
                self.model = VertexGenerativeModel(model_name)
                
                self.generation_config = VertexGenerationConfig(
                    candidate_count=1,
                    max_output_tokens=8192,
                    temperature=0.7,
                )
            except Exception as e:
                logging.error(f"Failed to initialize Vertex AI: {e}")
                raise ValueError("Neither GEMINI_API_KEY nor Vertex AI credentials could be initialized.")

    def generate_content(self, prompt, temperature=None):
        try:
            # Override temperature if provided
            config = self.generation_config
            if temperature is not None:
                # Create new config with overridden temperature to avoid mutating shared state
                if self.use_vertex:
                    config = VertexGenerationConfig(
                        candidate_count=1,
                        max_output_tokens=8192,
                        temperature=temperature,
                    )
                else:
                    config = genai.types.GenerationConfig(
                        candidate_count=1,
                        max_output_tokens=8192,
                        temperature=temperature,
                    )

            if self.use_vertex:
                # Vertex AI call
                response = self.model.generate_content(
                    prompt,
                    generation_config=config
                )
            else:
                # AI Studio call
                response = self.model.generate_content(
                    prompt,
                    generation_config=config
                )
                
            return response.text
        except Exception as e:
            logging.error(f"Error generating content (Vertex={self.use_vertex}): {e}")
            raise
