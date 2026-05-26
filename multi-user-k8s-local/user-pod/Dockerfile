# DeerFlow User Pod Image
#
# This Dockerfile is meant to be built from the `backend/` directory of the DeerFlow repo:
#
#   docker build -t deerflow-user-pod:latest \
#     -f multi-user-k8s-local/user-pod/Dockerfile \
#     backend/
#
# The build context must be the backend/ directory so that the DeerFlow source
# code and its requirements.txt are available.

FROM python:3.12-slim
WORKDIR /app

# Install DeerFlow backend dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY . .

RUN mkdir -p /app/.deer-flow

EXPOSE 8001
CMD ["python", "-m", "uvicorn", "app.gateway.app:app", "--host", "0.0.0.0", "--port", "8001"]