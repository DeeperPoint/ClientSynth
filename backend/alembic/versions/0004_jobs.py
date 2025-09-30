from alembic import op
import sqlalchemy as sa


revision = '0004_jobs'
down_revision = '0003_seeds'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'job',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenant.id', ondelete='CASCADE')),
        sa.Column('schema_id', sa.String(length=36), sa.ForeignKey('schema.id', ondelete='CASCADE')),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='pending'),
        sa.Column('progress', sa.Integer(), server_default='0'),
        sa.Column('total_records', sa.Integer(), nullable=False),
        sa.Column('generated_records', sa.Integer(), server_default='0'),
        sa.Column('error_message', sa.String(length=2048)),
        sa.Column('created_by', sa.String(length=36), sa.ForeignKey('user.id')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_job_tenant', 'job', ['tenant_id'])

    op.create_table(
        'generateddata',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('job_id', sa.String(length=36), sa.ForeignKey('job.id', ondelete='CASCADE')),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenant.id', ondelete='CASCADE')),
        sa.Column('record_index', sa.Integer(), nullable=False),
        sa.Column('record_data', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_generated_job_record', 'generateddata', ['job_id', 'record_index'])

    op.create_table(
        'joblog',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('job_id', sa.String(length=36), sa.ForeignKey('job.id', ondelete='CASCADE')),
        sa.Column('level', sa.String(length=20), server_default='info'),
        sa.Column('message', sa.String(length=2048), nullable=False),
        sa.Column('meta', sa.JSON(), server_default=sa.text("'{}'::json")),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )


def downgrade():
    op.drop_table('joblog')
    op.drop_table('generateddata')
    op.drop_table('job')


