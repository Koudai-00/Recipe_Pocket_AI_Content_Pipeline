FROM python:3.9-slim

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
# Install uvicorn and other dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/

# Set env for python path to include src
ENV PYTHONPATH=/app/src

# Run the web service using uvicorn
# Run the web service using uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
