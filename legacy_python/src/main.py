import logging
import os
import sys
from datetime import datetime
from config import Config
from modules.firestore_client import FirestoreClient
from modules.ga4_client import GA4Client
from modules.wordpress_client import WordPressClient
from modules.notifier import Notifier
from modules.storage_client import StorageClient

from agents.analyst import AnalystAgent
from agents.marketer import MarketerAgent
from agents.writer import WriterAgent
from agents.designer import DesignerAgent
from agents.controller import ControllerAgent

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def main():
    logging.info("Starting Recipe Pocket AI Pipeline...")
    
    # Initialize Clients
    firestore_client = FirestoreClient(project_id=Config.PROJECT_ID)
    ga4_client = GA4Client()
    wp_client = WordPressClient()
    notifier = Notifier()
    storage_client = StorageClient(project_id=Config.PROJECT_ID)
    
    # Initialize Agents
    analyst = AnalystAgent()
    marketer = MarketerAgent()
    writer = WriterAgent()
    designer = DesignerAgent()
    controller = ControllerAgent()

    try:
        # Step 1: Data Acquisition
        logging.info("Step 1: Fetching GA4 Data...")
        ga4_report = ga4_client.fetch_daily_report(days_ago=1)
        report_id = firestore_client.save_report_data(ga4_report)
        
        # Step 2: Analysis
        logging.info("Step 2: Analyzing Data...")
        analysis_result = analyst.analyze(ga4_report)
        topic = analysis_result.get('topic')
        
        # Idempotency / History Context
        if firestore_client.check_duplicate_topic(topic):
            logging.info(f"Topic '{topic}' already covered recently. Skipping.")
            notifier.notify(f"Skipped execution: Topic '{topic}' is a duplicate.", "WARNING")
            return

        # Fetch recent history for Marketer
        recent_history = firestore_client.get_recent_articles(limit=5)
        history_text = json.dumps(recent_history, indent=2, ensure_ascii=False, default=str)

        # Step 3: Marketing Strategy
        logging.info("Step 3: Creating Marketing Strategy...")
        strategy = marketer.create_strategy(analysis_result, past_reports_context=history_text)
        
        # Create Draft in DB
        article_id = firestore_client.create_article_draft(report_id, topic)
        
        # Step 4: Writing
        logging.info("Step 4: Writing Article...")
        article_content = writer.write_article(strategy)
        
        # Step 5: Design (Prompts + Images)
        logging.info("Step 5: Generating Images...")
        # 5-1: Create Prompts using Gemini
        image_prompts = designer.generate_image_prompts(article_content, strategy.get('title'))
        # 5-2: Generate Images using Seedream
        image_urls = designer.generate_images_from_prompts(image_prompts)
        
        # Upload images to GCS
        stored_image_urls = []
        import requests
        for idx, url in enumerate(image_urls):
             # ... (existing upload logic) ...
             try:
                 if "mock" in url or "via.placeholder" in url:
                     stored_image_urls.append(url)
                     continue
                     
                 img_data = requests.get(url).content
                 filename = storage_client.generate_filename(prefix=f"articles/{article_id}", extension="png")
                 gcs_url = storage_client.upload_image_from_bytes(img_data, filename)
                 stored_image_urls.append(gcs_url)
             except Exception as e:
                 logging.error(f"Failed to upload image {idx}: {e}")
                 stored_image_urls.append(url)

        # Update Draft
        firestore_client.update_article(article_id, {
            'content': article_content,
            'image_urls': stored_image_urls,
            'marketing_strategy': str(strategy),
            'image_prompts': image_prompts 
        })

        # Step 6: Review
        logging.info("Step 6: Reviewing...")
        review_result = controller.review_article(article_content, strategy)
        firestore_client.update_article(article_id, {
            'review_score': review_result.get('score'),
            'review_comment': review_result.get('comments'),
            'status': 'reviewed' # Intermediate status
        })

        if review_result.get('status') == "APPROVED":
            logging.info("Article APPROVED.")
            
            # Check if WordPress is configured
            if wp_client.base_url and wp_client.username:
                logging.info("Posting to WordPress...")
                
                # Prepare WP Content
                # Split article by [SPLIT]
                parts = article_content.split("[SPLIT]")
                
                final_html = ""
                if len(parts) >= 1:
                    final_html += parts[0]
                if len(stored_image_urls) > 1: # thumb is 0
                    wp_img_id = wp_client.upload_media(stored_image_urls[1]) # Image 1
                    if wp_img_id:
                         final_html += f"\n\n<!-- wp:image {{\"id\":{wp_img_id}}} --><figure class=\"wp-block-image\"><img src=\"{stored_image_urls[1]}\" /></figure><!-- /wp:image -->\n\n"
                    
                if len(parts) >= 2:
                    final_html += parts[1]
                if len(stored_image_urls) > 2:
                    wp_img_id = wp_client.upload_media(stored_image_urls[2]) # Image 2
                    if wp_img_id:
                         final_html += f"\n\n<!-- wp:image {{\"id\":{wp_img_id}}} --><figure class=\"wp-block-image\"><img src=\"{stored_image_urls[2]}\" /></figure><!-- /wp:image -->\n\n"
    
                if len(parts) >= 3:
                    final_html += parts[2]
                if len(stored_image_urls) > 3:
                     wp_img_id = wp_client.upload_media(stored_image_urls[3]) # Image 3
                     if wp_img_id:
                         final_html += f"\n\n<!-- wp:image {{\"id\":{wp_img_id}}} --><figure class=\"wp-block-image\"><img src=\"{stored_image_urls[3]}\" /></figure><!-- /wp:image -->\n\n"
                
                # Featured Image
                feat_img_id = None
                if len(stored_image_urls) > 0:
                    feat_img_id = wp_client.upload_media(stored_image_urls[0])
    
                wp_post_id = wp_client.create_post({
                    "title": strategy.get("title"),
                    "content": final_html, 
                    "featured_media_id": feat_img_id
                }, status="publish")
                
                firestore_client.update_article(article_id, {'status': 'posted', 'wp_post_id': wp_post_id})
                notifier.notify(f"Success! Article '{strategy.get('title')}' posted. (ID: {wp_post_id})", "SUCCESS")
                
            else:
                logging.info("WordPress credentials not found. Skipping post.")
                firestore_client.update_article(article_id, {'status': 'approved'})
                notifier.notify(f"Success! Article '{strategy.get('title')}' approved and saved to Firestore.", "SUCCESS")

        else:
            logging.info("Article NOT APPROVED.")
            firestore_client.update_article(article_id, {'status': 'review_required'})
            notifier.notify(f"Article '{strategy.get('title')}' requires review. Score: {review_result.get('score')}", "WARNING")

    except Exception as e:
        logging.error(f"Pipeline Failed: {e}", exc_info=True)
        notifier.notify(f"Pipeline Failed: {e}", "ERROR")
        sys.exit(1)

if __name__ == "__main__":
    main()
