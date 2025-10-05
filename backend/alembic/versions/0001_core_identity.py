from alembic import op
import sqlalchemy as sa


revision = '0001_core_identity'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('full_name', sa.String(255)),
        sa.Column('avatar_url', sa.String(1024)),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('email_verified', sa.Boolean(), server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_user_email', 'user', ['email'], unique=True)

    op.create_table(
        'tenant',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('slug', sa.String(100), nullable=False, unique=True),
        sa.Column('settings', sa.JSON(), server_default=sa.text("'{}'::json")),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_tenant_slug', 'tenant', ['slug'], unique=True)

    op.create_table(
        'usertenantrole',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('user.id', ondelete='CASCADE')),
        sa.Column('tenant_id', sa.String(length=36), sa.ForeignKey('tenant.id', ondelete='CASCADE')),
        sa.Column('role', sa.String(20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )

    op.create_index('ix_utr_user', 'usertenantrole', ['user_id'])
    op.create_index('ix_utr_tenant', 'usertenantrole', ['tenant_id'])


def downgrade():
    op.drop_table('usertenantrole')
    op.drop_table('tenant')
    op.drop_table('user')



