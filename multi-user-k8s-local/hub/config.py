from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HUB_CFG_")

    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    namespace: str = "deerflow"
    deerflow_image: str = "deerflow-user-pod:latest"
    deerflow_port: int = 8001
    db_path: str = "/data/users.db"


settings = Settings()