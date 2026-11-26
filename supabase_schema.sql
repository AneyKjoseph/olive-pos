-- ============================================================================
-- OLIVE CAKES POS — UPDATED MULTI-SHOP & CATEGORY -> FLAVOUR / ITEM -> TYPE SCHEMA
-- Paste and run this entire script in your Supabase SQL Editor.
-- ============================================================================

-- 1. Categories Table (Step 1: Shared Categories across all shops, e.g., Cake, Pastry)
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  expense_percentage NUMERIC(5,2) DEFAULT 0.00 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Flavours / Items Table (Step 2: Shared Flavours / Items per Category, e.g., Chocolate Truffle, Croissant)
CREATE TABLE IF NOT EXISTS subcategories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (category_id, name)
);

-- 3. Product Types / Items Table (Step 3: Shared Types under Category -> Flavour / Item, e.g., Medium, Large)
CREATE TABLE IF NOT EXISTS items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
  image_url TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_displayed BOOLEAN NOT NULL DEFAULT TRUE,
  available_shop_ids UUID[] DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE items ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL;
ALTER TABLE items ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_displayed BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS available_shop_ids UUID[] DEFAULT NULL;

-- 4. Shops Table (Each shop has exactly 1 dedicated Sales Profile)
CREATE TABLE IF NOT EXISTS shops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  sales_profile_name TEXT UNIQUE NOT NULL,
  location TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Bills Table (Tracks Shop ID, Payment Method [Cash/UPI], & Timestamp)
CREATE TABLE IF NOT EXISTS bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_number TEXT UNIQUE NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'UPI')),
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'Cash';
ALTER TABLE bills ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE SET NULL;

-- 6. Bill Items Table (Stores Product Type, Category, and Flavour snapshot per bill line)
CREATE TABLE IF NOT EXISTS bill_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  category_name TEXT NOT NULL,
  subcategory_name TEXT DEFAULT '',
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS subcategory_name TEXT DEFAULT '';

-- 7. Shop Stocks Table (Tracks live available count per Product Type for each Shop)
CREATE TABLE IF NOT EXISTS shop_stocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (shop_id, item_id)
);

-- 8. Shop-Wise Category Expense % Table (Custom expense deduction rate per Shop & Category)
CREATE TABLE IF NOT EXISTS shop_category_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  expense_percentage NUMERIC(5,2) NOT NULL DEFAULT 15.00 CHECK (expense_percentage >= 0 AND expense_percentage <= 100),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (shop_id, category_id)
);

-- 9. Application Users Table (Super Admin, Shop Admin, and Staff/Cashier accounts)
CREATE TABLE IF NOT EXISTS app_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'superadmin' CHECK (role IN ('admin', 'superadmin', 'shop-admin', 'staff')),
  shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES shops(id) ON DELETE SET NULL;

-- 10. Clear All Existing Data Safely (Comment out this block if you want to keep existing records)
TRUNCATE TABLE
  bill_items,
  bills,
  shop_stocks,
  shop_category_expenses,
  items,
  subcategories,
  categories,
  app_users,
  shops
RESTART IDENTITY CASCADE;

-- 11. Enable Row Level Security (RLS) & Open POS Policies
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_category_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on categories" ON categories;
CREATE POLICY "Allow all operations on categories" ON categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on subcategories" ON subcategories;
CREATE POLICY "Allow all operations on subcategories" ON subcategories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on items" ON items;
CREATE POLICY "Allow all operations on items" ON items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on bills" ON bills;
CREATE POLICY "Allow all operations on bills" ON bills FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on bill_items" ON bill_items;
CREATE POLICY "Allow all operations on bill_items" ON bill_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on shops" ON shops;
CREATE POLICY "Allow all operations on shops" ON shops FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on shop_stocks" ON shop_stocks;
CREATE POLICY "Allow all operations on shop_stocks" ON shop_stocks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on shop_category_expenses" ON shop_category_expenses;
CREATE POLICY "Allow all operations on shop_category_expenses" ON shop_category_expenses FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on app_users" ON app_users;
CREATE POLICY "Allow all operations on app_users" ON app_users FOR ALL USING (true) WITH CHECK (true);

-- 12. Seed Default Super Admin Account
INSERT INTO app_users (username, password, role, shop_id)
VALUES ('admin', 'admin123', 'superadmin', NULL)
ON CONFLICT (username) DO NOTHING;



ALTER TABLE public.bills
DROP CONSTRAINT IF EXISTS bills_payment_method_check;

ALTER TABLE public.bills
ADD CONSTRAINT bills_payment_method_check
CHECK (payment_method IN ('Cash', 'UPI', 'Split'));

ALTER TABLE public.bills
ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS upi_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- Backfill existing Cash and UPI bills so historical cash & UPI totals stay in sync
UPDATE public.bills
SET
  cash_amount = CASE WHEN payment_method = 'Cash' THEN total_amount ELSE cash_amount END,
  upi_amount = CASE WHEN payment_method = 'UPI' THEN total_amount ELSE upi_amount END
WHERE cash_amount = 0 AND upi_amount = 0;