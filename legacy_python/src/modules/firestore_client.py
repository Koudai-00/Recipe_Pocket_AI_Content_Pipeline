from google.cloud import firestore
import logging
from datetime import datetime

class FirestoreClient:
    def __init__(self, project_id=None):
        self.db = firestore.Client(project=project_id)
        self.collection_articles = "articles"
        self.collection_reports = "report_data"

    def save_report_data(self, report_data):
        """Saves GA4 analysis report data."""
        try:
            doc_ref = self.db.collection(self.collection_reports).document()
            report_data['created_at'] = firestore.SERVER_TIMESTAMP
            doc_ref.set(report_data)
            logging.info(f"Report data saved with ID: {doc_ref.id}")
            return doc_ref.id
        except Exception as e:
            logging.error(f"Error saving report data: {e}")
            raise

    def create_article_draft(self, analysis_report_id, topic):
        """Creates a new article draft."""
        try:
            doc_ref = self.db.collection(self.collection_articles).document()
            data = {
                'status': 'draft',
                'created_at': firestore.SERVER_TIMESTAMP,
                'updated_at': firestore.SERVER_TIMESTAMP,
                'analysis_report_id': analysis_report_id,
                'topic': topic,
                'content': {},
                'image_urls': [],
                'marketing_strategy': ""
            }
            doc_ref.set(data)
            logging.info(f"Article draft created with ID: {doc_ref.id}")
            return doc_ref.id
        except Exception as e:
            logging.error(f"Error creating article draft: {e}")
            raise

    def update_article(self, article_id, data):
        """Updates an existing article document."""
        try:
            doc_ref = self.db.collection(self.collection_articles).document(article_id)
            data['updated_at'] = firestore.SERVER_TIMESTAMP
            doc_ref.update(data)
            logging.info(f"Article {article_id} updated.")
        except Exception as e:
            logging.error(f"Error updating article {article_id}: {e}")
            raise

    def get_article(self, article_id):
        """Retrieves an article document."""
        try:
            doc_ref = self.db.collection(self.collection_articles).document(article_id)
            doc = doc_ref.get()
            if doc.exists:
                return doc.to_dict()
            else:
                logging.warning(f"Article {article_id} not found.")
                return None
        except Exception as e:
            logging.error(f"Error retrieving article {article_id}: {e}")
            raise

    def check_duplicate_topic(self, topic, days_lookback=30):
        """Checks if a topic has been covered recently to ensure idempotency/variety."""
        # Simple check: query articles with same topic in recent past
        # Note: This requires a composite index on topic + created_at potentially, 
        # or just filtering in app if volume is low.
        try:
            # Assuming 'topic' field exists and we want to avoid exact matches
            # For a more fuzzy match, we'd need vector search or similar, but exact match is a good start.
            docs = self.db.collection(self.collection_articles)\
                .where('topic', '==', topic)\
                .limit(1)\
                .stream()
            
            for doc in docs:
                return True # Found a duplicate
            return False
        except Exception as e:
            logging.error(f"Error checking duplicate topic: {e}")
            return False

    def get_recent_articles(self, limit=5):
        """Retrieves recently created articles for context."""
        try:
            docs = self.db.collection(self.collection_articles)\
                .order_by('created_at', direction=firestore.Query.DESCENDING)\
                .limit(limit)\
                .stream()
            
            articles = []
            for doc in docs:
                data = doc.to_dict()
                # Extract only relevant fields to save token space
                articles.append({
                    "date": data.get('created_at'),
                    "topic": data.get('topic'),
                    "marketing_strategy": data.get('marketing_strategy')
                })
            return articles
        except Exception as e:
            logging.error(f"Error fetching recent articles: {e}")
            return []
    def get_system_settings(self):
        """Retrieves system settings."""
        try:
            doc_ref = self.db.collection('system_settings').document('config')
            doc = doc_ref.get()
            if doc.exists:
                return doc.to_dict()
            return {}
        except Exception as e:
            logging.error(f"Error fetching system settings: {e}")
            return {}

    def save_system_settings(self, settings):
        """Saves system settings."""
        try:
            doc_ref = self.db.collection('system_settings').document('config')
            doc_ref.set(settings, merge=True)
            return True
        except Exception as e:
            logging.error(f"Error saving system settings: {e}")
            return False
