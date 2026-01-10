from google.cloud import storage
import logging
import uuid
import os

class StorageClient:
    def __init__(self, bucket_name=None, project_id=None):
        self.client = storage.Client(project=project_id)
        # If bucket_name is not provided, try to get it from env
        self.bucket_name = bucket_name or os.getenv("GCS_BUCKET_NAME")
        if not self.bucket_name:
            logging.warning("GCS_BUCKET_NAME not set. Storage operations may fail if bucket_name not passed explicitly.")

    def upload_image_from_bytes(self, image_data, destination_blob_name, content_type="image/png"):
        """Uploads an image (bytes) to GCS and returns the public URL."""
        try:
            if not self.bucket_name:
                raise ValueError("Bucket name is not configured.")
            
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(destination_blob_name)
            
            blob.upload_from_string(image_data, content_type=content_type)
            
            # Note: For public access, the bucket/object needs to be public or we use signed URLs.
            # Assuming the requirement implies public URLs for the WordPress post.
            # We can make the specific object public or use a signed URL with long expiration.
            # For simplicity/scalability in CMS, making it public or assuming bucket is public-read is common.
            # Here I will NOT set ACL to public-read automatically to be safe, 
            # but usually for CMS usage passing a public link is required.
            
            # blob.make_public() # Uncomment if suitable for security posture
            
            logging.info(f"File uploaded to {destination_blob_name}.")
            return blob.public_url
        except Exception as e:
            logging.error(f"Error uploading image to GCS: {e}")
            raise

    def generate_filename(self, prefix="images", extension="png"):
        """Generates a unique filename."""
        unique_id = uuid.uuid4()
        return f"{prefix}/{unique_id}.{extension}"
