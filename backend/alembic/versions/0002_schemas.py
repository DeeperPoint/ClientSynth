from alembic import op
import sqlalchemy as sa


revision = '0002_schemas'
down_revision = '0001_core_identity'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'schema',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenant.id', ondelete='CASCADE')),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=1024)),
        sa.Column('schema_definition', sa.JSON(), nullable=False),
        sa.Column('created_by', sa.String(length=36), sa.ForeignKey('user.id')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_schema_tenant', 'schema', ['tenant_id'])
    op.create_index('ix_schema_name_tenant', 'schema', ['tenant_id', 'name'])


def downgrade():
    op.drop_table('schema')


