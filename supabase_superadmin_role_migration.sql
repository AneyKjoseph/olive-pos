ALTER TABLE public.app_users
  ALTER COLUMN role SET DEFAULT 'superadmin';

ALTER TABLE public.app_users
  DROP CONSTRAINT IF EXISTS app_users_role_check;

ALTER TABLE public.app_users
  ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('admin', 'superadmin', 'shop-admin', 'staff'));

-- Existing admin rows were Super Admin accounts before the roles were split.
UPDATE public.app_users
SET role = 'superadmin'
WHERE role = 'admin';
