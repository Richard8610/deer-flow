FROM python:3.12-slim
WORKDIR /app
# Build context is multi-user-k8s-local/ (one level up from hub/)
COPY hub/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY hub/ .
RUN mkdir -p /data /app/static
# Bundle the frontend SPA
COPY frontend/src/ /app/static/
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]