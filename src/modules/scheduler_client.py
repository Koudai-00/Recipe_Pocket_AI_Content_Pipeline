from google.cloud import scheduler_v1
from google.protobuf import field_mask_pb2
import logging
from config import Config

class SchedulerClient:
    def __init__(self, location="asia-northeast1", job_name="recipe-pocket-scheduler"):
        self.project_id = Config.PROJECT_ID
        self.location = location
        self.job_name = job_name
        self.client = scheduler_v1.CloudSchedulerClient()
        self.parent = f"projects/{self.project_id}/locations/{self.location}"
        self.job_path = f"{self.parent}/jobs/{self.job_name}"

    def get_job(self):
        """
        Retrieves the current job details.
        """
        try:
            job = self.client.get_job(name=self.job_path)
            return job
        except Exception as e:
            logging.error(f"Failed to get scheduler job: {e}")
            return None

    def update_schedule(self, hour, minute):
        """
        Updates the schedule of the job.
        Format: 'minute hour * * *' (Daily)
        """
        cron_schedule = f"{minute} {hour} * * *"
        
        try:
            # First, check if job exists, if not, we can't update it easily via this simple UI without more info (target URI etc).
            # We assume the job is created by Terraform or Setup script initially.
            job = self.client.get_job(name=self.job_path)
            
            job.schedule = cron_schedule
            update_mask = field_mask_pb2.FieldMask(paths=["schedule"])
            
            response = self.client.update_job(job=job, update_mask=update_mask)
            logging.info(f"Updated schedule to: {cron_schedule}")
            return True, cron_schedule
        except Exception as e:
            logging.error(f"Failed to update schedule: {e}")
            return False, str(e)

    def parse_schedule(self, cron_string):
        """
        Parses '5 9 * * *' to {'hour': 9, 'minute': 5}
        """
        try:
            parts = cron_string.split()
            if len(parts) >= 2:
                return {"minute": int(parts[0]), "hour": int(parts[1])}
        except:
            pass
        return {"minute": 0, "hour": 9}
