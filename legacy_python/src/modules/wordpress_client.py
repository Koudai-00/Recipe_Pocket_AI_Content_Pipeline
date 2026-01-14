import requests
import base64
import logging
import json
from config import Config

class WordPressClient:
    def __init__(self):
        creds_json = Config.get_wp_credentials()
        # Expecting JSON: {"url": "...", "username": "...", "password": "..."} (Application Password)
        self.config = {}
        try:
            if creds_json:
                self.config = json.loads(creds_json)
        except Exception as e:
            logging.error(f"Failed to parse WP Config: {e}")

        self.base_url = self.config.get("url", "").rstrip('/')
        self.username = self.config.get("username")
        self.password = self.config.get("password")

    def create_post(self, article_data, status="draft"):
        """
        Creates a post in WordPress.
        article_data: { title, content, categories, tags, featured_media_id }
        """
        if not self.base_url or not self.username:
            logging.warning("WordPress credentials not set. Skipping post creation.")
            return None

        endpoint = f"{self.base_url}/wp-json/wp/v2/posts"
        
        # Prepare content
        # If we have split content (body_p1, body_p2, body_p3) and images (img1, img2, img3), we assemble HTML here.
        # However, the Agent output might be raw markdown or structured.
        # Assuming article_data['content'] is the final HTML or specific fields.
        # Let's assume the caller assembles the full HTML before calling this, or we do it here.
        # For flexibility, let's accept 'content' field as the HTML body.
        
        post_data = {
            "title": article_data.get("title"),
            "content": article_data.get("content"),
            "status": status,
            # "categories": [1], # Example
            # "tags": [2],
            "featured_media": article_data.get("featured_media_id")
        }
        
        # Remove None values
        post_data = {k: v for k, v in post_data.items() if v is not None}

        try:
            auth = (self.username, self.password)
            response = requests.post(endpoint, json=post_data, auth=auth)
            response.raise_for_status()
            
            result = response.json()
            logging.info(f"WordPress Post Created: ID {result['id']}")
            return result['id']
        except Exception as e:
            logging.error(f"Error creating WordPress post: {e}")
            if response:
                logging.error(f"WP Response: {response.text}")
            raise

    def upload_media(self, image_url, caption=""):
        """
        Uploads an image from a URL to WordPress Media Library.
        """
        # WordPress API requires the file binary. We need to download it first.
        try:
            image_data = requests.get(image_url).content
            filename = image_url.split("/")[-1]
            if "?" in filename:
                filename = filename.split("?")[0]
                
            endpoint = f"{self.base_url}/wp-json/wp/v2/media"
            headers = {
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Type": "image/png" # Check actual type if possible
            }
            
            auth = (self.username, self.password)
            
            response = requests.post(endpoint, data=image_data, headers=headers, auth=auth)
            response.raise_for_status()
            
            result = response.json()
            return result['id']
        except Exception as e:
            logging.error(f"Error uploading media to WP: {e}")
            return None
