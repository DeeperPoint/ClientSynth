"""
Quick bootstrap to create all DB tables from SQLAlchemy models.

Use this when running locally with docker-compose and you haven't set up Alembic env yet.

Run inside the app container:
  docker compose -f backend/docker-compose.yml exec app python -m app.bootstrap_db
"""

from app.database import engine
from app.models.base import Base

# Import models to ensure they're registered with Base.metadata
from app.models import identity, schema, jobs, exports, seeds  # noqa: F401


def main() -> None:
    print(f"Creating tables on: {engine.url}")
    Base.metadata.create_all(bind=engine)
    print("Done creating tables.")


if __name__ == "__main__":
    main()
