from supabase import create_client, Client
import logging
import requests
import time
import os
from config import Config

class SupabaseClientWrapper:
    def __init__(self):
        self.url = Config.get_supabase_url()
        self.key = Config.get_supabase_key()
        self.client: Client = None
        
        if self.url and self.key:
            try:
                self.client = create_client(self.url, self.key)
            except Exception as e:
                logging.error(f"Failed to initialize Supabase client: {e}")
        else:
            logging.warning("Supabase credentials not found.")

    def upload_image(self, image_url, filename):
        """
        Downloads image from URL and uploads to Supabase Storage 'article-images'.
        Returns public URL.
        """
        if not self.client: return None

        try:
            # Download image logic
            if "http" in image_url:
                img_data = requests.get(image_url).content
            else:
                # Local file path not supported in this context usually
                return None
            
            # Content Type detection (basic)
            content_type = "image/png"
            if ".jpg" in filename or ".jpeg" in filename: content_type = "image/jpeg"
            if ".webp" in filename: content_type = "image/webp"

            bucket_name = "article-images"
            
            # Remove existing file if overwrite needed? Supabase doesn't overwrite by default usually, returns error.
            # Using upsert=True if supported or specific logic. 
            # library 'storage-py' supports upsert.
            
            res = self.client.storage.from_(bucket_name).upload(
                file=img_data,
                path=filename,
                file_options={"content-type": content_type, "upsert": "true"}
            )
            
            # Get Public URL
            public_url = self.client.storage.from_(bucket_name).get_public_url(filename)
            return public_url

        except Exception as e:
            logging.error(f"Failed to upload image to Supabase: {e}")
            return None

    def create_article(self, article_data):
        """
        Inserts article record into 'articles' table.
        article_data: { title, content, thumbnail_url, ... }
        """
        if not self.client: return None

        try:
            # Prepare data strictly matching schema
            payload = {
                "title": article_data.get("title"),
                "content": article_data.get("content"),
                "thumbnail_url": article_data.get("thumbnail_url"),
                "published": article_data.get("published", False),
                "slug": article_data.get("slug"), # Using article_id usually
                # "view_count": 0 # Default in DB usually
            }
            
            # Remove None
            payload = {k: v for k, v in payload.items() if v is not None}

            response = self.client.table("articles").insert(payload).execute()
            
            if response.data:
                return response.data[0].get("id")
            return None
        except Exception as e:
            logging.error(f"Failed to create article in Supabase: {e}")
            raise
