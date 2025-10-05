from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_ignore_empty=True, extra="ignore")

    # Core
    LOG_LEVEL: str = "info"
    PORT: int = 8000

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/clientsynth"

    # Auth
    SECRET_KEY: str = "change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    JWT_ALGORITHM: str = "HS256"

    # Providers
    OPENROUTER_API_KEY: str | None = None
    FAL_KEY: str | None = None

    # AWS
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    AWS_S3_BUCKET: str | None = None
    AWS_REGION: str | None = "us-east-1"

    # Cache/Queue
    REDIS_URL: str | None = None

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


settings = Settings()


