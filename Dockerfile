FROM python:3.9-slim

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/

# Set env for python path to include src
ENV PYTHONPATH=/app/src

# Run the job
CMD ["python", "src/main.py"]
