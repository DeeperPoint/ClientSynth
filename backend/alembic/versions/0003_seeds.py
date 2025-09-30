from alembic import op
import sqlalchemy as sa


revision = '0003_seeds'
down_revision = '0002_schemas'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'seed',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenant.id', ondelete='CASCADE')),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=2048)),
        sa.Column('category', sa.String(length=100)),
        sa.Column('upload_status', sa.String(length=20), server_default='pending'),
        sa.Column('total_images', sa.Integer(), server_default='0'),
        sa.Column('processed_images', sa.Integer(), server_default='0'),
        sa.Column('zip_file_path', sa.String(length=1024)),
        sa.Column('s3_prefix', sa.String(length=512)),
        sa.Column('metadata', sa.JSON(), server_default=sa.text("'{}'::json")),
        sa.Column('created_by', sa.String(length=36), sa.ForeignKey('user.id')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_seed_tenant', 'seed', ['tenant_id'])

    op.create_table(
        'seedimage',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('seed_id', sa.String(length=36), sa.ForeignKey('seed.id', ondelete='CASCADE')),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenant.id', ondelete='CASCADE')),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('s3_key', sa.String(length=1024), nullable=False),
        sa.Column('s3_url', sa.String(length=2048), nullable=False),
        sa.Column('file_size', sa.Integer()),
        sa.Column('content_type', sa.String(length=100)),
        sa.Column('width', sa.Integer()),
        sa.Column('height', sa.Integer()),
        sa.Column('metadata', sa.JSON(), server_default=sa.text("'{}'::json")),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_seedimage_seed', 'seedimage', ['seed_id'])

    op.create_table(
        'seedusage',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('seed_id', sa.String(length=36), sa.ForeignKey('seed.id', ondelete='CASCADE')),
        sa.Column('seed_image_id', sa.String(length=36), sa.ForeignKey('seedimage.id', ondelete='CASCADE')),
        sa.Column('job_id', sa.String(length=36)),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenant.id', ondelete='CASCADE')),
        sa.Column('record_id', sa.String(length=64)),
        sa.Column('field_name', sa.String(length=255)),
        sa.Column('generated_image_url', sa.String(length=2048)),
        sa.Column('usage_context', sa.JSON(), server_default=sa.text("'{}'::json")),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    op.create_table(
        'seedqualityfeedback',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('seed_id', sa.String(length=36), sa.ForeignKey('seed.id', ondelete='CASCADE')),
        sa.Column('seed_image_id', sa.String(length=36), sa.ForeignKey('seedimage.id', ondelete='CASCADE')),
        sa.Column('job_id', sa.String(length=36)),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenant.id', ondelete='CASCADE')),
        sa.Column('quality_rating', sa.Integer(), nullable=False),
        sa.Column('feedback_type', sa.String(length=50), nullable=False),
        sa.Column('feedback_data', sa.JSON(), server_default=sa.text("'{}'::json")),
        sa.Column('created_by', sa.String(length=36), sa.ForeignKey('user.id')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )


def downgrade():
    op.drop_table('seedqualityfeedback')
    op.drop_table('seedusage')
    op.drop_table('seedimage')
    op.drop_table('seed')


