FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY s2s_events.py .
COPY s2s_session_manager.py .
COPY protocol.py .
COPY server.py .

# Expose the port uvicorn listens on
EXPOSE 8080

# Run the FastAPI server
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
