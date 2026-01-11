from fastapi import FastAPI, Request, BackgroundTasks, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import uvicorn
import os
import logging
from pipeline import ContentPipeline
from modules.firestore_client import FirestoreClient
from config import Config
from modules.scheduler_client import SchedulerClient
import os

# Initialize App
app = FastAPI(title="Recipe Pocket AI Dashboard")
logging.basicConfig(level=logging.INFO)

# Setup Templates
templates = Jinja2Templates(directory="src/templates")

# Global Instances (Lazy Loaded)
_pipeline = None
_db_client = None
_scheduler = None

def get_db_client():
    global _db_client
    if _db_client is None:
        logging.info("Initializing FirestoreClient...")
        _db_client = FirestoreClient(project_id=Config.PROJECT_ID)
    return _db_client

def get_scheduler():
    global _scheduler
    if _scheduler is None:
        logging.info("Initializing SchedulerClient...")
        _scheduler = SchedulerClient()
    return _scheduler

def get_pipeline():
    global _pipeline
    if _pipeline is None:
        logging.info("Initializing ContentPipeline...")
        _pipeline = ContentPipeline()
    return _pipeline

# Initialize DB for Startup Check (Optional, but keeps cold start safe)
# pipeline = ContentPipeline()
# db_client = FirestoreClient(project_id=Config.PROJECT_ID)
# scheduler = SchedulerClient()

@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    """
    Dashboard Home: List recent articles and status.
    """
    # Fetch articles
    articles = []
    try:
        docs = get_db_client().db.collection('articles')\
            .order_by('created_at', direction=firestore.Query.DESCENDING)\
            .limit(20)\
            .stream()
            
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            articles.append(data)
    except Exception as e:
        logging.error(f"Error fetching articles: {e}")

    # Fetch Schedule
    current_schedule = {"hour": 9, "minute": 0} # Default
    job = get_scheduler().get_job()
    if job:
        current_schedule = get_scheduler().parse_schedule(job.schedule)

    # Fetch System Settings
    settings = get_db_client().get_system_settings()
    articles_per_run = settings.get("articles_per_run", 1)
    auto_post_supabase = settings.get("auto_post_supabase", False)

    return templates.TemplateResponse("index.html", {
        "request": request, 
        "articles": articles,
        "schedule": current_schedule,
        "articles_per_run": articles_per_run,
        "auto_post_supabase": auto_post_supabase,
        "job_found": job is not None
    })

@app.post("/settings/schedule")
async def update_schedule(hour: int = Form(...), minute: int = Form(...), articles_per_run: int = Form(1), auto_post_supabase: bool = Form(False)):
    """
    Update the daily run time and articles count.
    """
    # Update Scheduler Time
    success, msg = get_scheduler().update_schedule(hour, minute)
    
    # Update DB Settings
    # Checkbox sends 'true' if checked, nothing if unchecked. FastAPI handles bool=Form(False) properly if omitted?
    # Actually HTML checkboxes are tricky. If unchecked, they don't send anything.
    # FastAPI does not default to False easily if missing from Form unless we handle it or use Javascript to send hidden field.
    # Let's rely on standard form behavior: create a hidden input or rely on default.
    # We will assume if it's missing, it's False, but FastAPI 'Form' required param raises error if missing.
    # So we change definition to Optional or default.
    
    get_db_client().save_system_settings({
        "articles_per_run": articles_per_run,
        "auto_post_supabase": auto_post_supabase
    })

    status_msg = f"Schedule+Updated+to+{hour:02d}:{minute:02d}+(Count:{articles_per_run})" if success else f"Update+Failed:+{msg}"
    return RedirectResponse(url=f"/?msg={status_msg}", status_code=303)


@app.get("/articles/{article_id}", response_class=HTMLResponse)
async def article_detail(request: Request, article_id: str):
    """
    Article Detail Page.
    """
    article = {}
    try:
        doc = get_db_client().db.collection('articles').document(article_id).get()
        if doc.exists:
            article = doc.to_dict()
            article['id'] = doc.id
    except Exception as e:
        logging.error(f"Error fetching article {article_id}: {e}")
    
    return templates.TemplateResponse("detail.html", {
        "request": request, 
        "article": article
    })

@app.post("/run")
async def run_pipeline_manual(background_tasks: BackgroundTasks, image_model: str = Form("seedream-4.5")):
    """
    Trigger pipeline manually with selected options.
    """
    background_tasks.add_task(get_pipeline().run, image_model=image_model)
    return RedirectResponse(url=f"/?msg=Pipeline+Started+with+{image_model}", status_code=303)

@app.post("/schedule")
async def schedule_trigger(background_tasks: BackgroundTasks):
    """
    Endpoint for Cloud Scheduler.
    Executes pipeline N times based on settings.
    """
    # Fetch settings
    settings = db_client.get_system_settings()
    count = int(settings.get("articles_per_run", 1))
    image_model = settings.get("default_image_model", "seedream-4.5")
    
    logging.info(f"Schedule triggered. Generating {count} articles. Model: {image_model}")

    def run_batch(n, model):
        avoid_topics = []
        for i in range(n):
            logging.info(f"Batch execution {i+1}/{n}")
            res = get_pipeline().run(image_model=model, avoid_topics=avoid_topics)
            if res.get("topic"):
                avoid_topics.append(res.get("topic"))

    background_tasks.add_task(run_batch, count, image_model)
    return {"status": "started", "count": count}

@app.get("/progress")
async def get_progress():
    """
    Returns current pipeline progress.
    """
    pipeline_instance = get_pipeline()
    return {
        "status": getattr(pipeline_instance, "current_status", "Idle"),
        "progress": getattr(pipeline_instance, "progress", 0),
        "logs": getattr(pipeline_instance, "logs", [])
    }

@app.post("/articles/{article_id}/update_status")
async def update_status(article_id: str, status: str = Form(...)):
    """
    Update article status (e.g. force approve).
    """
    try:
        get_db_client().update_article(article_id, {'status': status})
    except Exception as e:
        logging.error(f"Error updating status: {e}")
    return RedirectResponse(url=f"/articles/{article_id}", status_code=303)

@app.post("/articles/{article_id}/post_supabase")
async def post_supabase_manual(article_id: str):
    """
    Manually trigger Supabase posting.
    """
    try:
        # Fetch article data specifically for posting logic
        # Ideally, we should add a method in Pipeline to "publish_existing_draft"
        # For now, let's reconstruct args from DB manually or use a helper
        article = get_db_client().get_article(article_id)
        if not article: raise Exception("Article not found")
        
        # Need to parse strategy string back to dict
        import ast
        try:
             strategy = ast.literal_eval(article.get('marketing_strategy', '{}'))
        except:
             strategy = {'title': 'Untitled'}

        supa_id = get_pipeline().post_to_supabase(
            article_id, 
            strategy, 
            article.get('content'), 
            article.get('image_urls', [])
        )
        
        get_db_client().update_article(article_id, {'status': 'posted', 'supabase_id': supa_id})
        get_pipeline().notifier.notify(f"Manual Post Success: {strategy.get('title')}", "SUCCESS")
        
    except Exception as e:
        logging.error(f"Manual post failed: {e}")
        # flash error via cookie or url param? For now simple log
    
    return RedirectResponse(url=f"/articles/{article_id}", status_code=303)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
