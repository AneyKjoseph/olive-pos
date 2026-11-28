ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS sales_channel TEXT NOT NULL DEFAULT 'shop_pos';

UPDATE public.bills
SET sales_channel = 'shop_pos'
WHERE sales_channel IS NULL;

ALTER TABLE public.bills
  ALTER COLUMN sales_channel SET DEFAULT 'shop_pos',
  ALTER COLUMN sales_channel SET NOT NULL;

ALTER TABLE public.bills
  DROP CONSTRAINT IF EXISTS bills_payment_method_check;

ALTER TABLE public.bills
  ADD CONSTRAINT bills_payment_method_check
  CHECK (payment_method IN ('Cash', 'UPI', 'Split', 'Online'));

ALTER TABLE public.bills
  DROP CONSTRAINT IF EXISTS bills_sales_channel_check;

ALTER TABLE public.bills
  ADD CONSTRAINT bills_sales_channel_check
  CHECK (sales_channel IN ('shop_pos', 'zomato', 'swiggy'));
