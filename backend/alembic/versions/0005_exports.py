from alembic import op
import sqlalchemy as sa


revision = '0005_exports'
down_revision = '0004_jobs'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'export',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenant.id', ondelete='CASCADE')),
        sa.Column('job_id', sa.String(length=36), sa.ForeignKey('job.id', ondelete='CASCADE')),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('format', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='pending'),
        sa.Column('file_path', sa.String(length=2048)),
        sa.Column('file_size', sa.Integer()),
        sa.Column('filters', sa.JSON(), server_default=sa.text("'{}'::json")),
        sa.Column('created_by', sa.String(length=36), sa.ForeignKey('user.id')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_export_tenant', 'export', ['tenant_id'])


def downgrade():
    op.drop_table('export')


