import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

if context.config.config_file_name:
    fileConfig(context.config.config_file_name)

# Migrações rodam com o dono do esquema, nunca com o papel da aplicação.
url = context.config.get_main_option("sqlalchemy.url") or os.environ["MIGRATION_DATABASE_URL"]

engine = create_engine(url)
with engine.begin() as conn:
    context.configure(connection=conn, target_metadata=None, transaction_per_migration=False)
    with context.begin_transaction():
        context.run_migrations()
