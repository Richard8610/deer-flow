from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    namespace: str = "deerflow"
    deerflow_image: str = "deerflow-user-pod:latest"
    deerflow_port: int = 8001
    hub_port: int = 8080
    db_path: str = "/data/users.db"


settings = Settings()