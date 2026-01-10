import requests
import logging
from config import Config

class DesignerAgent:
    def __init__(self):
        self.api_key = Config.get_seedream_api_key()
        # Placeholder endpoint, replace with actual Seedream API URL if known, 
        # otherwise assuming a generic structure or user to update.
        self.api_url = os.getenv("SEEDREAM_API_URL", "https://api.seedream.ai/v1/generate") 

    def generate_images(self, prompt_context):
        """
        Generates 4 images: 1 Thumbnail + 3 Content images.
        """
        # Since we need 4 images, we can do 1 batch request or 4 individual ones.
        # Assuming we loop for simplicity and control.
        
        images = []
        
        # 1. Thumbnail
        thumb_prompt = f"Bright, orange-themed illustration, delicious food: {prompt_context}, flat design, high quality, 4k"
        images.append(self._call_api(thumb_prompt, "thumbnail"))
        
        # 2. Content Images (3 variations)
        for i in range(1, 4):
            body_prompt = f"Cooking step or ingredients illustration, {prompt_context}, variation {i}, warm colors, orange accent"
            images.append(self._call_api(body_prompt, f"body_{i}"))
            
        return images

    def _call_api(self, prompt, tag):
        """Helper to call external Image Gen API."""
        if not self.api_key:
            logging.warning("Seedream API Key not found. Returning mock URL.")
            return f"https://via.placeholder.com/800x600.png?text=Mock+{tag}+{prompt[:10]}"

        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024",
                "style": "illustration" # Hypothesized parameter
            }
            
            # response = requests.post(self.api_url, json=payload, headers=headers)
            # response.raise_for_status()
            # result = response.json()
            # return result['data'][0]['url'] 
            
            # Mocking the actual network call to avoid blocking on unknown API spec
            logging.info(f"Generating image with prompt: {prompt}")
            return f"https://mock-image-service.local/gen?prompt={requests.utils.quote(prompt)}"

        except Exception as e:
            logging.error(f"Error generating image: {e}")
            return "https://via.placeholder.com/800x600.png?text=Error"

import os # For os.getenv above
