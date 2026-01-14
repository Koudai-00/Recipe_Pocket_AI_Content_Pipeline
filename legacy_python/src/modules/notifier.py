import requests
import logging
import os

class Notifier:
    def __init__(self):
        self.slack_webhook_url = os.getenv("SLACK_WEBHOOK_URL")

    def notify(self, message, status="INFO"):
        """Sends a notification to Slack."""
        if not self.slack_webhook_url:
            logging.info(f"Notification (succeeded locally, no Webhook): {status} - {message}")
            return

        color = "#36a64f" if status == "SUCCESS" else "#ff0000" if status == "ERROR" else "#e8e8e8"
        
        payload = {
            "attachments": [
                {
                    "color": color,
                    "title": f"Recipe Pocket AI Pipeline: {status}",
                    "text": message,
                    "footer": "GCP Cloud Run"
                }
            ]
        }

        try:
            requests.post(self.slack_webhook_url, json=payload)
        except Exception as e:
            logging.error(f"Failed to send Slack notification: {e}")
