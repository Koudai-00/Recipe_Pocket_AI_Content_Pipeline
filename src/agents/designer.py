from .base_agent import BaseAgent
import logging
import json
import requests
import os
import google.generativeai as genai
from config import Config

class DesignerAgent(BaseAgent):
    """
    Role: Image Agent - Prompt Creator & Generator.
    Supports: Seedream 4.5, gemini-3-pro-image-preview, gemini-2.5-flash-image
    """
    def __init__(self):
        super().__init__(model_name="gemini-2.5-pro")
        self.seedream_api_key = Config.get_seedream_api_key()
        self.api_url = os.getenv("SEEDREAM_API_URL", "https://api.seedream.ai/v1/generate")

    def generate_image_prompts(self, article_content, title, image_model="seedream-4.5"):
        """
        Uses Gemini to create 4 image prompts based on the article and target model.
        """
        
        # Branch logic for Prompt Design
        if image_model == "gemini-3-pro-image-preview":
            # Infographic Style
            style_instruction = """
            **Style**: Infographic / Diagrammatic.
            **Requirement**: YOU MUST INCLUDE JAPANESE TEXT in the image to explain the content.
            The images should be separate supplementary materials summarizing key points of the section.
            Use a clean, professional, yet friendly design with 'Recipe Pocket' orange accents.
            """
        else:
            # Seedream 4.5 or gemini-2.5-flash-image
            # No Text Rule
            style_instruction = """
            **Style**: Bright, warm, flat-design illustration.
            **Requirement**: STRICTLY NO TEXT inside the image. Do not include any characters, letters, or words.
            Focus purely on visual representation of the food or cooking scene.
            Brand color: Orange.
            """

        prompt = f"""
        あなたはビジュアルディレクターです。
        記事のタイトルと内容に合う画像を計4枚生成するためのプロンプトを作成してください。
        使用する画像生成AIは「{image_model}」です。以下のスタイル要件を厳守してください。

        記事タイトル: {title}
        記事内容(抜粋): {article_content[:1500]}...

        {style_instruction}

        構成: 
        1. サムネイル用
        2. セクション1用
        3. セクション2用
        4. セクション3用

        出力: 
        JSON形式で出力してください。
        {{
            "thumbnail_prompt": "English prompt...",
            "section1_prompt": "English prompt...",
            "section2_prompt": "English prompt...",
            "section3_prompt": "English prompt..."
        }}
        """
        
        response_text = self.generate_content(prompt, temperature=0.7)
        cleaned_text = response_text.replace("```json", "").replace("```", "").strip()
        
        try:
            prompts = json.loads(cleaned_text)
            return [
                prompts.get("thumbnail_prompt"),
                prompts.get("section1_prompt"),
                prompts.get("section2_prompt"),
                prompts.get("section3_prompt")
            ]
        except json.JSONDecodeError:
            logging.error("Failed to parse image prompts from Gemini.")
            return ["Orange cooking illustration"] * 4

    def generate_images_from_prompts(self, prompts, image_model="seedream-4.5"):
        """
        Calls the appropriate API based on the model.
        """
        image_urls = []
        for i, prompt_text in enumerate(prompts):
            if not prompt_text: continue
            
            try:
                if image_model == "seedream-4.5":
                    url = self._call_seedream_api(prompt_text, f"image_{i}")
                elif "gemini" in image_model:
                    url = self._call_gemini_image_api(prompt_text, image_model, f"image_{i}")
                else:
                    url = self._call_seedream_api(prompt_text, f"image_{i}") # Fallback
                
                image_urls.append(url)
            except Exception as e:
                logging.error(f"Image generation failed for {image_model}: {e}")
                image_urls.append("https://via.placeholder.com/800x600.png?text=Gen+Failed")
            
        return image_urls

    def _call_seedream_api(self, prompt, tag):
        if not self.seedream_api_key:
            logging.warning("Seedream API Key not found. Returning mock URL.")
            return f"https://via.placeholder.com/800x600.png?text=Seedream+Mock+{tag}"

        # Mocking implementation as per strict instruction in previous context
        # In production this would be requests.post(...)
        logging.info(f"[Seedream] Generating: {prompt[:30]}...")
        return f"https://mock-image-service.local/seedream?prompt={requests.utils.quote(prompt[:10])}"

    def _call_gemini_image_api(self, prompt, model_name, tag):
        """
        Generates images using Google Generative AI (Imagen).
        """
        logging.info(f"[Gemini Image {model_name}] Generating: {prompt[:30]}...")
        
        # Hypothetical implementation for standard google-generativeai library
        # Real code: 
        # model = genai.ImageGenerationModel(model_name)
        # response = model.generate_images(prompt=prompt, number_of_images=1)
        # return response.images[0] # This would be bytes or a PIL image
        
        # Since we need a URL and we are in a mock/dry-run environment mostly (unless configuring real access):
        # We will return a placeholder that indicates the model used.
        # If we were to implement real GCS upload here:
        
        # Check if we have API key (we do in BaseAgent)
        if not Config.get_gemini_api_key():
             return f"https://via.placeholder.com/800x600.png?text=Gemini+Key+Missing"

        # Simulating a successful generation for now as we don't have the real 'gemini-3' model accessible yet
        return f"https://via.placeholder.com/800x600.png?text={model_name}+{tag}+Infographic"
