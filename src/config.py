import os
import logging
from google.cloud import secretmanager
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()

class Config:
    PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
    REGION = os.getenv("GOOGLE_CLOUD_REGION", "asia-northeast1")
    
    # Secret Manager Secret IDs
    # These should be defined in your environment or just hardcoded if they are standard names
    SECRET_ID_GEMINI = os.getenv("SECRET_ID_GEMINI", "GEMINI_API_KEY")
    SECRET_ID_SEEDREAM = os.getenv("SECRET_ID_SEEDREAM", "SEEDREAM_API_KEY")
    SECRET_ID_GA4 = os.getenv("SECRET_ID_GA4", "GA4_CREDENTIALS_JSON")
    SECRET_ID_WP = os.getenv("SECRET_ID_WP", "WP_CREDENTIALS")
    
    _secrets = {}

    @classmethod
    def get_secret(cls, secret_id):
        """Retrieves a secret from Google Cloud Secret Manager."""
        if secret_id in cls._secrets:
            return cls._secrets[secret_id]
        
        if not cls.PROJECT_ID:
            logging.warning("GOOGLE_CLOUD_PROJECT not set, attempting to use local env var for secret")
            return os.getenv(secret_id)

        try:
            client = secretmanager.SecretManagerServiceClient()
            name = f"projects/{cls.PROJECT_ID}/secrets/{secret_id}/versions/latest"
            response = client.access_secret_version(request={"name": name})
            secret_value = response.payload.data.decode("UTF-8")
            cls._secrets[secret_id] = secret_value
            return secret_value
        except Exception as e:
            logging.error(f"Failed to access secret {secret_id}: {e}")
            # Fallback to env var for local testing if secret manager fails or is skipped
            return os.getenv(secret_id)

    @classmethod
    def get_gemini_api_key(cls):
        return cls.get_secret(cls.SECRET_ID_GEMINI)

    @classmethod
    def get_seedream_api_key(cls):
        return cls.get_secret(cls.SECRET_ID_SEEDREAM)
        
    @classmethod
    def get_ga4_credentials(cls):
        return cls.get_secret(cls.SECRET_ID_GA4)

    @classmethod
    def get_wp_credentials(cls):
        # Expected format: JSON string or similar
        return cls.get_secret(cls.SECRET_ID_WP)

    # Supabase Configuration
    SECRET_ID_SUPABASE_URL = os.getenv("SECRET_ID_SUPABASE_URL", "SUPABASE_URL")
    SECRET_ID_SUPABASE_KEY = os.getenv("SECRET_ID_SUPABASE_KEY", "SUPABASE_KEY")

    @classmethod
    def get_supabase_url(cls):
        return cls.get_secret(cls.SECRET_ID_SUPABASE_URL)

    @classmethod
    def get_supabase_key(cls):
        return cls.get_secret(cls.SECRET_ID_SUPABASE_KEY)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
