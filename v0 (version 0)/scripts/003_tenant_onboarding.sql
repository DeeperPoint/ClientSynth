-- Additional functions and triggers for tenant onboarding

-- Function to create a default tenant for new users
CREATE OR REPLACE FUNCTION public.create_default_tenant_for_user(user_id UUID, user_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id UUID;
  tenant_name TEXT;
BEGIN
  -- Extract company name from email domain (fallback to "My Organization")
  tenant_name := COALESCE(
    CASE 
      WHEN user_email LIKE '%@gmail.com' OR user_email LIKE '%@yahoo.com' OR user_email LIKE '%@hotmail.com' 
      THEN 'My Organization'
      ELSE INITCAP(SPLIT_PART(SPLIT_PART(user_email, '@', 2), '.', 1))
    END,
    'My Organization'
  );

  -- Create tenant
  INSERT INTO public.tenants (name, slug)
  VALUES (tenant_name, LOWER(REPLACE(tenant_name || '-' || SUBSTRING(user_id::TEXT, 1, 8), ' ', '-')))
  RETURNING id INTO new_tenant_id;

  -- Add user as owner
  INSERT INTO public.user_tenant_roles (user_id, tenant_id, role)
  VALUES (user_id, new_tenant_id, 'owner');

  RETURN new_tenant_id;
END;
$$;
