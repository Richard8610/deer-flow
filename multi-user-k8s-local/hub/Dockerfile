FROM python:3.12-slim
WORKDIR /app
# Build context is multi-user-k8s-local/ (one level up from hub/)
COPY hub/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY hub/ .
RUN mkdir -p /data /app/static /app/skills
# Bundle the pre-built React frontend (dist/ built by build.sh before docker build)
COPY workflow_frontend_dist/ /app/static/
# Bundle skills so the hub can serve /api/skills without hitting the DeerFlow pod
COPY skills_snapshot/ /app/skills/
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]