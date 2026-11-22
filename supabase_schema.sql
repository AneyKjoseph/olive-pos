-- Run this entire script in your Supabase Dashboard -> SQL Editor

-- 1. Categories Table (Stores category names & Admin-configured expense percentages)
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  expense_percentage NUMERIC(5,2) DEFAULT 15.00 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Items / Inventory Table
CREATE TABLE IF NOT EXISTS items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bills Table (Stores generated bills with timestamp)
CREATE TABLE IF NOT EXISTS bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_number TEXT UNIQUE NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Bill Items Table (Line items for category-wise daily/weekly analytics)
CREATE TABLE IF NOT EXISTS bill_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  category_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) with open policies for POS terminals
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on items" ON items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on bills" ON bills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on bill_items" ON bill_items FOR ALL USING (true) WITH CHECK (true);

-- Seed Initial Categories
INSERT INTO categories (name, expense_percentage) VALUES
  ('Beverages', 18.00),
  ('Snacks & Bakery', 22.50),
  ('Groceries', 12.00),
  ('Dairy & Fresh', 25.00)
ON CONFLICT (name) DO NOTHING;

-- Seed Initial Sample Items
INSERT INTO items (name, category_id, price, stock)
SELECT 'Artisan Cold Brew Coffee', id, 140.00, 45 FROM categories WHERE name = 'Beverages'
UNION ALL
SELECT 'Fresh Valencia Orange Juice', id, 95.00, 30 FROM categories WHERE name = 'Beverages'
UNION ALL
SELECT 'Sourdough Garlic Croissant', id, 110.00, 18 FROM categories WHERE name = 'Snacks & Bakery'
UNION ALL
SELECT 'Organic Basmati Rice (1kg)', id, 165.00, 60 FROM categories WHERE name = 'Groceries'
UNION ALL
SELECT 'Greek Yogurt Natural (400g)', id, 120.00, 25 FROM categories WHERE name = 'Dairy & Fresh';