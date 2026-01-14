import logging
import sys
import json
import time
from config import Config
from modules.firestore_client import FirestoreClient
from modules.ga4_client import GA4Client
from modules.wordpress_client import WordPressClient
from modules.supabase_client import SupabaseClientWrapper
from modules.notifier import Notifier
from modules.storage_client import StorageClient

from agents.analyst import AnalystAgent
from agents.marketer import MarketerAgent
from agents.writer import WriterAgent
from agents.designer import DesignerAgent
from agents.controller import ControllerAgent

class ContentPipeline:
    def __init__(self):
        # Initialize Clients
        self.firestore = FirestoreClient(project_id=Config.PROJECT_ID)
        self.ga4 = GA4Client()
        self.wp = WordPressClient()
        self.supabase = SupabaseClientWrapper()
        self.notifier = Notifier()
        self.storage = StorageClient(project_id=Config.PROJECT_ID)

        # Initialize Agents
        self.analyst = AnalystAgent()
        self.marketer = MarketerAgent()
        self.writer = WriterAgent()
        self.designer = DesignerAgent()
        self.controller = ControllerAgent()

        # Initialize progress tracking
        self.current_status = "Idle"
        self.progress = 0
        self.logs = []

    def _log(self, message, level="INFO"):
        """Adds a log message to the memory buffer and standard logging."""
        from datetime import datetime
        timestamp = datetime.now().strftime("%H:%M:%S")
        formatted_message = f"[{timestamp}] [{level}] {message}"
        self.logs.append(formatted_message)
        if level == "ERROR":
            logging.error(message)
        elif level == "WARNING":
            logging.warning(message)
        else:
            logging.info(message)

    def run(self, image_model="seedream-4.5", avoid_topics=None):
        """
        Executes the content generation pipeline.
        Returns a dict with execution result.
        """
        self._log("Starting Recipe Pocket AI Pipeline...")
        self.current_status = "Starting Pipeline..."
        self.progress = 5
        self.logs = []  # Reset logs
        self._log(f"Config: Image Model = {image_model}")
        
        result = {"status": "success", "message": "Pipeline completed successfully", "topic": None}
        
        try:
            # Step 1: Data Acquisition
            self._log("Step 1: Fetching GA4 Data...")
            self.current_status = "Step 1/6: Fetching GA4 Data..."
            self.progress = 10
            ga4_report = self.ga4.fetch_daily_report(days_ago=1)
            self._log("GA4 Data Fetched successfully.")
            report_id = self.firestore.save_report_data(ga4_report)
            
            # Step 2: Analysis
            self._log("Step 2: Analyzing Data with Gemini...")
            self.current_status = "Step 2/6: Analyzing Data with Gemini..."
            self.progress = 25
            analysis_result = self.analyst.analyze(ga4_report, avoid_topics=avoid_topics)
            topic = analysis_result.get('topic')
            self._log(f"Topic Decided: {topic}")
            result["topic"] = topic
            
            # Idempotency / History Context
            if self.firestore.check_duplicate_topic(topic):
                msg = f"Topic '{topic}' already covered recently. Skipping."
                self._log(msg, "WARNING")
                self.notifier.notify(f"Skipped: {msg}", "WARNING")
                self.current_status = f"Skipped: {msg}"
                self.progress = 100
                return {"status": "skipped", "message": msg}

            # Fetch recent history
            recent_history = self.firestore.get_recent_articles(limit=5)
            history_text = json.dumps(recent_history, indent=2, ensure_ascii=False, default=str)

            # Step 3: Marketing Strategy
            self._log("Step 3: Creating Marketing Strategy...")
            self.current_status = "Step 3/6: Creating Marketing Strategy..."
            self.progress = 40
            strategy = self.marketer.create_strategy(analysis_result, past_reports_context=history_text)
            self._log("Strategy Created.")
            
            # Create Draft
            article_id = self.firestore.create_article_draft(report_id, topic)
            self._log(f"Draft Article Created: {article_id}")
            
            # Step 4: Writing
            self._log("Step 4: Writing Article...")
            self.current_status = "Step 4/6: Writing Article Content..."
            self.progress = 55
            article_content = self.writer.write_article(strategy)
            self._log(f"Article Content Written ({len(article_content)} chars).")
            
            # Step 5: Design
            self._log(f"Step 5: Generating Images using {image_model}...")
            self.current_status = f"Step 5/6: Generating Images ({image_model})..."
            self.progress = 70
            image_prompts = self.designer.generate_image_prompts(article_content, strategy.get('title'), image_model=image_model)
            self._log(f"Image Prompts Generated: {len(image_prompts)}")
            image_urls = self.designer.generate_images_from_prompts(image_prompts, image_model=image_model)
            self._log(f"Images Generated: {len(image_urls)}")
            
            # Upload images
            self.current_status = "Step 5/6: Uploading Images to Storage..."
            self.progress = 75
            stored_image_urls = []
            import requests
            for idx, url in enumerate(image_urls):
                try:
                    if "mock" in url or "via.placeholder" in url:
                        stored_image_urls.append(url)
                        continue
                        
                    img_data = requests.get(url).content
                    filename = self.storage.generate_filename(prefix=f"articles/{article_id}", extension="png")
                    gcs_url = self.storage.upload_image_from_bytes(img_data, filename)
                    stored_image_urls.append(gcs_url)
                    self._log(f"Image {idx+1} uploaded: {gcs_url}")
                except Exception as e:
                    self._log(f"Failed to upload image {idx}: {e}", "ERROR")
                    stored_image_urls.append(url)

            # Update Draft with structured data
            self.firestore.update_article(article_id, {
                'content': article_content,
                'image_urls': stored_image_urls,
                'marketing_strategy': strategy, # Save as object/map, not string
                'analysis_report': analysis_result, # Save analyst report
                'image_prompts': image_prompts,
                'image_model': image_model
            })
            self._log("Article Draft Updated with Content and Images.")

            # Step 6: Review
            self._log("Step 6: Reviewing...")
            self.current_status = "Step 6/6: Reviewing & Finalizing..."
            self.progress = 90
            review_result = self.controller.review_article(article_content, strategy)
            self._log(f"Review Score: {review_result.get('score')}")
            
            self.firestore.update_article(article_id, {
                'review_score': review_result.get('score'),
                'review_comment': review_result.get('comments'),
                'review_report': review_result, # Save full review report
                'status': 'reviewed'
            })

            if review_result.get('status') == "APPROVED":
                self._log("Article APPROVED.")
                logging.info("Article APPROVED.")
                
                # Check Auto Post Setting
                system_settings = self.firestore.get_system_settings()
                auto_post_supabase = system_settings.get("auto_post_supabase", False)

                if auto_post_supabase:
                    self._log("Auto-posting to Supabase...")
                    logging.info("Auto-posting to Supabase...")
                    self.current_status = "Publishing to Supabase..."
                    self.progress = 95
                    try:
                        supa_id = self.post_to_supabase(article_id, strategy, article_content, stored_image_urls)
                        self.firestore.update_article(article_id, {'status': 'posted', 'supabase_id': supa_id})
                        self.notifier.notify(f"Success! Posted to Supabase: {strategy.get('title')}", "SUCCESS")
                        self._log(f"Posted to Supabase (ID: {supa_id})", "SUCCESS")
                        result["message"] = f"Article posted to Supabase (ID: {supa_id})"
                    except Exception as e:
                         self._log(f"Auto-post failed: {e}", "ERROR")
                         logging.error(f"Auto-post failed: {e}")
                         self.firestore.update_article(article_id, {'status': 'approved'}) # Fallback
                         self.notifier.notify(f"Auto-post failed: {e}", "ERROR")
                else:
                    self._log("Auto-post OFF. Saved as Approved.", "SUCCESS")
                    logging.info("Auto-post OFF. Saved as Approved.")
                    self.firestore.update_article(article_id, {'status': 'approved'})
                    self.notifier.notify(f"Success! Approved: {strategy.get('title')} (Ready to Post)", "SUCCESS")
                    result["message"] = "Article approved (Auto-post OFF)"
            else:
                self._log("Article REJECTED (Review Required).", "WARNING")
                logging.info("Article REJECTED.")
                self.firestore.update_article(article_id, {'status': 'review_required'})
                self.notifier.notify(f"Review Required: {strategy.get('title')}", "WARNING")
                result["message"] = "Article requires review"

            self.current_status = "Completed"
            self.progress = 100
            self._log("Pipeline Completed Successfully.", "SUCCESS")
            return result

        except Exception as e:
            self._log(f"Pipeline Failed: {e}", "ERROR")
            if 'traceback' in globals():
                import traceback
                self._log(traceback.format_exc(), "ERROR")
            
            logging.error(f"Pipeline Failed: {e}", exc_info=True)
            self.notifier.notify(f"Pipeline Failed: {e}", "ERROR")
            self.current_status = f"Error: {str(e)}"
            self.progress = 0
            return {"status": "error", "message": str(e)}

    def post_to_supabase(self, article_id, strategy, content, source_image_urls):
        """
        Handles image transfer and article creation in Supabase.
        """
        if not self.supabase.client:
            raise Exception("Supabase client not initialized")

        # 1. Transfer Images
        # We assume image order: [Thumbnail, Sec1, Sec2, Sec3]
        supabase_img_urls = []
        for i, url in enumerate(source_image_urls):
            ts = int(time.time() * 1000)
            filename = f"{ts}-{article_id}-{i}.png"
            
            supa_url = self.supabase.upload_image(url, filename)
            if supa_url:
                supabase_img_urls.append(supa_url)
            else:
                supabase_img_urls.append(url) # Fallback to GCS/Source

        # 2. Replace URLs in Content
        # Split [SPLIT] and re-assemble with new images in Markdown
        parts = content.split("[SPLIT]")
        
        final_content = ""
        # Part 1
        if len(parts) >= 1: final_content += parts[0] + "\n\n"
        if len(supabase_img_urls) > 1: # Image 1
            final_content += f"![Section Image 1]({supabase_img_urls[1]})\n\n"
        
        # Part 2
        if len(parts) >= 2: final_content += parts[1] + "\n\n"
        if len(supabase_img_urls) > 2: # Image 2
             final_content += f"![Section Image 2]({supabase_img_urls[2]})\n\n"
            
        # Part 3
        if len(parts) >= 3: final_content += parts[2] + "\n\n"
        if len(supabase_img_urls) > 3: # Image 3
             final_content += f"![Section Image 3]({supabase_img_urls[3]})\n\n"

        # 3. Create Record
        thumb_url = supabase_img_urls[0] if len(supabase_img_urls) > 0 else None
        
        return self.supabase.create_article({
            "title": strategy.get("title"),
            "content": final_content,
            "thumbnail_url": thumb_url,
            "slug": article_id,
            "published": True
        })
