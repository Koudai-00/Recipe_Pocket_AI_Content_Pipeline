from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    Metric,
    RunReportRequest,
)
import logging
from datetime import datetime, timedelta
import json
import os
from config import Config

class GA4Client:
    def __init__(self, property_id=None):
        credentials_json = Config.get_ga4_credentials()
        if credentials_json:
            # Assuming credentials_json is a file path or dict. 
            # If it's a JSON string, we might need to parse it or write to temp file
            # Client library usually expects a file path or credentials object
            from google.oauth2 import service_account
            try:
                if isinstance(credentials_json, str) and credentials_json.startswith('{'):
                    info = json.loads(credentials_json)
                    creds = service_account.Credentials.from_service_account_info(info)
                    self.client = BetaAnalyticsDataClient(credentials=creds)
                elif isinstance(credentials_json, str) and os.path.exists(credentials_json):
                     self.client = BetaAnalyticsDataClient.from_service_account_json(credentials_json)
                else: 
                     # Fallback or assumption it's handled by environment (ADC)
                     self.client = BetaAnalyticsDataClient()
            except Exception as e:
                logging.warning(f"Failed to initialize GA4 client with secret: {e}. Using default.")
                self.client = BetaAnalyticsDataClient()
        else:
            logging.warning("No GA4 credentials found in config. Using Application Default Credentials.")
            self.client = BetaAnalyticsDataClient()
            
        self.property_id = property_id or os.getenv("GA4_PROPERTY_ID")

    def fetch_daily_report(self, days_ago=1):
        """Fetches standard report: Top pages by PV for the defined date."""
        if not self.property_id:
            logging.error("GA4 Property ID is not set.")
            return {}

        try:
            # Calculate date
            target_date = (datetime.now() - timedelta(days=days_ago)).strftime('%Y-%m-%d')
            
            request = RunReportRequest(
                property=f"properties/{self.property_id}",
                dimensions=[Dimension(name="pageTitle"), Dimension(name="pagePath")],
                metrics=[Metric(name="screenPageViews")],
                date_ranges=[DateRange(start_date=target_date, end_date=target_date)],
                limit=10
            )
            
            response = self.client.run_report(request=request)

            report_data = {
                "date": target_date,
                "top_pages": []
            }

            for row in response.rows:
                report_data["top_pages"].append({
                    "title": row.dimension_values[0].value,
                    "path": row.dimension_values[1].value,
                    "views": int(row.metric_values[0].value)
                })
                
            return report_data
        except Exception as e:
            logging.error(f"Error fetching GA4 report: {e}")
            return {"error": str(e)}

    def fetch_search_keywords(self, days_ago=7):
        """Fetches internal site search keywords (if configured) or organic search terms."""
        # Note: 'eventName' == 'view_search_results' needed usually, or 'organicGoogleSearchQuery' if console linked
        # Here assuming a basic page/event report for simplicity or placeholder
        return []
