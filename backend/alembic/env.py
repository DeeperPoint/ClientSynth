import os
import sys
from pathlib import Path
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# This Alembic Config object provides access to values within the .ini file
config = context.config

# Ensure the backend directory is on sys.path so 'app' package can be imported
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import the SQLAlchemy metadata from the application
# Ensure we import all model modules so tables are registered
from app.models.base import Base  # type: ignore  # noqa: E402
from app.models import identity as _identity  # noqa: F401, E402
from app.models import schema as _schema  # noqa: F401, E402
from app.models import jobs as _jobs  # noqa: F401, E402
from app.models import exports as _exports  # noqa: F401, E402
from app.models import seeds as _seeds  # noqa: F401, E402
from app.models import documents as _documents  # noqa: F401, E402

target_metadata = Base.metadata


def get_url() -> str:
    # Prefer DATABASE_URL env var; fallback to alembic.ini's sqlalchemy.url
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    return config.get_main_option("sqlalchemy.url")


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        future=True,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
