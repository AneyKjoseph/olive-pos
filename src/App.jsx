import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingCart,
  Package,
  BarChart3,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Database,
  UserCheck,
  ShieldCheck,
  Receipt,
  Calendar,
  TrendingUp,
  Percent,
  Search,
  RefreshCw,
  Copy,
  Check,
  Layers,
  IndianRupee,
  Lock,
  LogOut,
  KeyRound,
  Banknote,
  QrCode
} from 'lucide-react';

const SUPABASE_SQL_SCHEMA = `-- 1. Categories Table (Stores category names & Admin-configured expense percentages)
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

-- 3. Bills Table (Stores generated bills with timestamp & payment method)
CREATE TABLE IF NOT EXISTS bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_number TEXT UNIQUE NOT NULL,
  total_amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'UPI')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'Cash';

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
CREATE POLICY "Allow all operations on bill_items" ON bill_items FOR ALL USING (true) WITH CHECK (true);`;

class SupabaseService {
  constructor(url, anonKey) {
    this.url = url?.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
    this.key = anonKey?.trim();
  }

  isConfigured() {
    return Boolean(this.url && this.key && this.url.startsWith('http'));
  }

  async request(path, options = {}) {
    if (!this.isConfigured()) throw new Error('Supabase credentials not configured');
    const cleanPath = path.replace(/^\/+/, '');
    const res = await fetch(`${this.url}/rest/v1/${cleanPath}`, {
      ...options,
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        Prefer: options.prefer || 'return=representation',
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase Error (${res.status}): ${errText}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }
}

export default function App() {
  // Navigation & Admin Authentication State
  const [activeRole, setActiveRole] = useState('sales');
  const [adminTab, setAdminTab] = useState('analytics');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [loginUserInput, setLoginUserInput] = useState('');
  const [loginPassInput, setLoginPassInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const envAdminUser = useMemo(() => {
    try {
      return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_USER) || 'admin';
    } catch {
      return 'admin';
    }
  }, []);

  const envAdminPass = useMemo(() => {
    try {
      return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ADMIN_PASSWORD) || 'admin123';
    } catch {
      return 'admin123';
    }
  }, []);

  const [adminUsername, setAdminUsername] = useState(() => localStorage.getItem('olive_pos_admin_user') || envAdminUser);
  const [adminPassword, setAdminPassword] = useState(() => localStorage.getItem('olive_pos_admin_pass') || envAdminPass);
  const [newAdminPassInput, setNewAdminPassInput] = useState('');

  // Supabase Connection State
  const [sbUrl, setSbUrl] = useState(() => {
    try {
      return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || localStorage.getItem('olive_pos_sb_url') || '';
    } catch {
      return localStorage.getItem('olive_pos_sb_url') || '';
    }
  });
  const [sbKey, setSbKey] = useState(() => {
    try {
      return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || localStorage.getItem('olive_pos_sb_key') || '';
    } catch {
      return localStorage.getItem('olive_pos_sb_key') || '';
    }
  });

  const supabase = useMemo(() => new SupabaseService(sbUrl, sbKey), [sbUrl, sbKey]);
  const [isLiveSupabase, setIsLiveSupabase] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Core Application Data States (Clean initial state — no dummy data)
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [bills, setBills] = useState([]);

  // Sales POS Cart State
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [latestGeneratedBill, setLatestGeneratedBill] = useState(null);

  // Admin Inventory Form States
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemStock, setNewItemStock] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryExpense, setNewCategoryExpense] = useState('15');

  // Admin Sales Analytics Filter: 'daily' | 'weekly'
  const [salesReportPeriod, setSalesReportPeriod] = useState('daily');

  // UI Feedback & Setup Guide Modal
  const [toast, setToast] = useState(null);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch Data from Supabase if configured
  const syncFromSupabase = async (silent = false) => {
    if (!supabase.isConfigured()) {
      setIsLiveSupabase(false);
      return;
    }
    setIsSyncing(true);
    try {
      const [catsData, itemsData, billsData, billItemsData] = await Promise.all([
        supabase.request('categories?select=*&order=name.asc'),
        supabase.request('items?select=*&order=name.asc'),
        supabase.request('bills?select=*&order=created_at.desc&limit=200'),
        supabase.request('bill_items?select=*&order=created_at.desc&limit=1000')
      ]);

      const billsWithItems = (billsData || []).map((b) => ({
        ...b,
        items: (billItemsData || []).filter((bi) => bi.bill_id === b.id)
      }));

      setCategories(catsData || []);
      setItems(itemsData || []);
      setBills(billsWithItems);
      setIsLiveSupabase(true);

      if (catsData?.length > 0 && !catsData.some((c) => c.id === newItemCategory)) {
        setNewItemCategory(catsData[0].id);
      }
      if (!silent) showToast('Synced live data from Supabase!');
    } catch (err) {
      console.error(err);
      setIsLiveSupabase(false);
      if (!silent) showToast(`Supabase sync failed: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (supabase.isConfigured()) {
      syncFromSupabase(true);
    }
  }, [supabase]);

  useEffect(() => {
    if (categories.length > 0 && !categories.some((c) => c.id === newItemCategory)) {
      setNewItemCategory(categories[0].id);
    }
  }, [categories, newItemCategory]);

  // Save Supabase Credentials locally
  const handleSaveSupabaseConfig = (e) => {
    e.preventDefault();
    const cleanedUrl = sbUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');
    setSbUrl(cleanedUrl);
    localStorage.setItem('olive_pos_sb_url', cleanedUrl);
    localStorage.setItem('olive_pos_sb_key', sbKey.trim());
    syncFromSupabase(false);
  };

  // ============================================================================
  // ADMIN AUTHENTICATION HANDLERS
  // ============================================================================
  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (
      loginUserInput.trim() === adminUsername &&
      loginPassInput === adminPassword
    ) {
      setIsAdminAuthenticated(true);
      setShowAdminLoginModal(false);
      setActiveRole('admin');
      setLoginUserInput('');
      setLoginPassInput('');
      setLoginError('');
      showToast('Admin authenticated successfully!');
    } else {
      setLoginError('Invalid admin username or passcode.');
    }
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    setActiveRole('sales');
    showToast('Admin logged out.');
  };

  const handleUpdateAdminPassword = (e) => {
    e.preventDefault();
    if (!newAdminPassInput.trim() || newAdminPassInput.trim().length < 4) {
      showToast('Passcode must be at least 4 characters.', 'error');
      return;
    }
    const updated = newAdminPassInput.trim();
    setAdminPassword(updated);
    localStorage.setItem('olive_pos_admin_pass', updated);
    setNewAdminPassInput('');
    showToast('Admin passcode updated!');
  };

  // ============================================================================
  // SALES USER OPERATIONS (CART ADD, INLINE EDIT, DELETE, CHECKOUT)
  // ============================================================================
  const addToCart = (item) => {
    if (item.stock <= 0) {
      showToast(`"${item.name}" is out of stock!`, 'error');
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        if (existing.quantity + 1 > item.stock) {
          showToast(`Only ${item.stock} units of "${item.name}" available in stock.`, 'error');
          return prev;
        }
        return prev.map((c) =>
          c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const updateCartQty = (itemId, delta) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.item.id !== itemId) return c;
          const nextQty = c.quantity + delta;
          if (nextQty > c.item.stock) {
            showToast(`Max available stock (${c.item.stock}) reached.`, 'error');
            return c;
          }
          return { ...c, quantity: nextQty };
        })
        .filter((c) => c.quantity > 0)
    );
  };

  const setExactCartQty = (itemId, rawValue) => {
    const parsed = parseInt(rawValue, 10);
    if (isNaN(parsed) || parsed <= 0) {
      removeFromCart(itemId);
      return;
    }
    setCart((prev) =>
      prev.map((c) => {
        if (c.item.id !== itemId) return c;
        if (parsed > c.item.stock) {
          showToast(`Only ${c.item.stock} units available in stock.`, 'error');
          return { ...c, quantity: c.item.stock };
        }
        return { ...c, quantity: parsed };
      })
    );
  };

  const removeFromCart = (itemId) => {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  };

  const cartSubtotal = useMemo(
    () => cart.reduce((sum, entry) => sum + entry.item.price * entry.quantity, 0),
    [cart]
  );

  // Generate Live Digital Bill (No Printing) & Deduct Item Stock
  const handleGenerateBill = async () => {
    if (cart.length === 0) return;

    const timestamp = new Date().toISOString();
    const billNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const totalAmount = cartSubtotal;

    const lineItemsPayload = cart.map((entry) => {
      const cat = categories.find((c) => c.id === entry.item.category_id);
      return {
        item_id: entry.item.id,
        item_name: entry.item.name,
        category_name: cat ? cat.name : 'Uncategorized',
        quantity: entry.quantity,
        unit_price: Number(entry.item.price),
        subtotal: Number(entry.item.price) * entry.quantity
      };
    });

    try {
      if (isLiveSupabase) {
        const [insertedBill] = await supabase.request('bills', {
          method: 'POST',
          body: JSON.stringify({
            bill_number: billNumber,
            total_amount: totalAmount,
            payment_method: paymentMethod,
            created_at: timestamp
          })
        });

        await supabase.request('bill_items', {
          method: 'POST',
          body: JSON.stringify(
            lineItemsPayload.map((li) => ({
              ...li,
              bill_id: insertedBill.id,
              created_at: timestamp
            }))
          )
        });

        await Promise.all(
          cart.map((entry) =>
            supabase.request(`items?id=eq.${entry.item.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                stock: Math.max(0, entry.item.stock - entry.quantity),
                updated_at: timestamp
              })
            })
          )
        );

        await syncFromSupabase(true);
        setLatestGeneratedBill({
          ...insertedBill,
          payment_method: paymentMethod,
          items: lineItemsPayload
        });
      } else {
        const newBill = {
          id: `bill-${Date.now()}`,
          bill_number: billNumber,
          total_amount: totalAmount,
          payment_method: paymentMethod,
          created_at: timestamp,
          items: lineItemsPayload
        };

        setBills((prev) => [newBill, ...prev]);
        setItems((prevItems) =>
          prevItems.map((it) => {
            const sold = cart.find((c) => c.item.id === it.id);
            return sold ? { ...it, stock: Math.max(0, it.stock - sold.quantity) } : it;
          })
        );
        setLatestGeneratedBill(newBill);
      }

      setCart([]);
      showToast(`Live Bill ${billNumber} (${paymentMethod}) generated & inventory updated!`);
    } catch (err) {
      showToast(`Failed to generate bill: ${err.message}`, 'error');
    }
  };

  // ============================================================================
  // ADMIN OPERATIONS (STOCK, PRICE, CATEGORY CRUD & SAFE DELETE)
  // ============================================================================
  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!newItemCategory) {
      showToast('Please create and select a category first.', 'error');
      return;
    }
    const price = parseFloat(newItemPrice);
    const stock = parseInt(newItemStock, 10);
    if (!newItemName.trim() || isNaN(price) || price < 0 || isNaN(stock) || stock < 0) {
      showToast('Please enter valid item name, price, and stock quantity.', 'error');
      return;
    }

    try {
      if (isLiveSupabase) {
        await supabase.request('items', {
          method: 'POST',
          body: JSON.stringify({
            name: newItemName.trim(),
            category_id: newItemCategory,
            price,
            stock
          })
        });
        await syncFromSupabase(true);
      } else {
        const created = {
          id: `item-${Date.now()}`,
          name: newItemName.trim(),
          category_id: newItemCategory,
          price,
          stock
        };
        setItems((prev) => [...prev, created]);
      }

      setNewItemName('');
      setNewItemPrice('');
      setNewItemStock('');
      showToast('New item added to inventory!');
    } catch (err) {
      showToast(`Error adding item: ${err.message}`, 'error');
    }
  };

  const handleUpdateItemStockAndPrice = async (itemId, newPrice, newStock) => {
    const parsedPrice = Math.max(0, Number(newPrice) || 0);
    const parsedStock = Math.max(0, parseInt(newStock, 10) || 0);

    try {
      if (isLiveSupabase) {
        await supabase.request(`items?id=eq.${itemId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            price: parsedPrice,
            stock: parsedStock,
            updated_at: new Date().toISOString()
          })
        });
        await syncFromSupabase(true);
      } else {
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId ? { ...it, price: parsedPrice, stock: parsedStock } : it
          )
        );
      }
      showToast('Item price & stock updated!');
    } catch (err) {
      showToast(`Update failed: ${err.message}`, 'error');
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    const expPct = parseFloat(newCategoryExpense);
    if (!newCategoryName.trim() || isNaN(expPct) || expPct < 0 || expPct > 100) {
      showToast('Enter valid category name and expense % (0-100).', 'error');
      return;
    }

    try {
      if (isLiveSupabase) {
        await supabase.request('categories', {
          method: 'POST',
          body: JSON.stringify({
            name: newCategoryName.trim(),
            expense_percentage: expPct
          })
        });
        await syncFromSupabase(true);
      } else {
        const created = {
          id: `cat-${Date.now()}`,
          name: newCategoryName.trim(),
          expense_percentage: expPct
        };
        setCategories((prev) => [...prev, created]);
        if (!newItemCategory) setNewItemCategory(created.id);
      }
      setNewCategoryName('');
      setNewCategoryExpense('15');
      showToast('Category added!');
    } catch (err) {
      showToast(`Error creating category: ${err.message}`, 'error');
    }
  };

  // Safe Category Deletion: Deletes category & unbilled items, blocks if any billed items exist
  const handleDeleteCategory = async (category) => {
    const categoryItemIds = new Set(
      items.filter((it) => it.category_id === category.id).map((it) => it.id)
    );

    const hasBilledItems = bills.some((bill) =>
      (bill.items || []).some(
        (line) =>
          line.category_name?.toLowerCase() === category.name.toLowerCase() ||
          (line.item_id && categoryItemIds.has(line.item_id))
      )
    );

    if (hasBilledItems) {
      showToast(
        `Warning: Cannot delete "${category.name}" because billed items exist in sales records. Billed items were preserved.`,
        'error'
      );
      return;
    }

    try {
      if (isLiveSupabase) {
        await supabase.request(`items?category_id=eq.${category.id}`, {
          method: 'DELETE'
        });
        await supabase.request(`categories?id=eq.${category.id}`, {
          method: 'DELETE'
        });
        await syncFromSupabase(true);
      } else {
        setItems((prev) => prev.filter((it) => it.category_id !== category.id));
        setCategories((prev) => prev.filter((c) => c.id !== category.id));
      }

      setCart((prev) => prev.filter((c) => c.item.category_id !== category.id));
      if (selectedCategoryFilter === category.id) {
        setSelectedCategoryFilter('ALL');
      }
      showToast(`Category "${category.name}" and its unbilled items were deleted.`);
    } catch (err) {
      showToast(`Failed to delete category: ${err.message}`, 'error');
    }
  };

  const handleUpdateCategoryExpense = async (categoryId, newPercentage) => {
    const clamped = Math.min(100, Math.max(0, Number(newPercentage) || 0));
    try {
      if (isLiveSupabase) {
        await supabase.request(`categories?id=eq.${categoryId}`, {
          method: 'PATCH',
          body: JSON.stringify({ expense_percentage: clamped })
        });
        await syncFromSupabase(true);
      } else {
        setCategories((prev) =>
          prev.map((c) =>
            c.id === categoryId ? { ...c, expense_percentage: clamped } : c
          )
        );
      }
      showToast('Category expense percentage updated!');
    } catch (err) {
      showToast(`Failed to update expense %: ${err.message}`, 'error');
    }
  };

  // ============================================================================
  // DAILY & WEEKLY CATEGORY-WISE SALES + EXPENSE HIGHLIGHT CALCULATIONS
  // ============================================================================
  const analyticsData = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(startOfToday.getDate() - 6);

    const filteredBills = bills.filter((bill) => {
      const billDate = new Date(bill.created_at);
      if (salesReportPeriod === 'daily') {
        return billDate >= startOfToday;
      }
      return billDate >= sevenDaysAgo;
    });

    const categoryStatsMap = {};
    categories.forEach((cat) => {
      categoryStatsMap[cat.name] = {
        categoryId: cat.id,
        categoryName: cat.name,
        expensePercentage: Number(cat.expense_percentage) || 0,
        totalSales: 0,
        unitsSold: 0,
        expenseAmount: 0,
        netAfterExpense: 0
      };
    });

    filteredBills.forEach((bill) => {
      (bill.items || []).forEach((line) => {
        const catName = line.category_name || 'Uncategorized';
        if (!categoryStatsMap[catName]) {
          categoryStatsMap[catName] = {
            categoryId: null,
            categoryName: catName,
            expensePercentage: 0,
            totalSales: 0,
            unitsSold: 0,
            expenseAmount: 0,
            netAfterExpense: 0
          };
        }
        categoryStatsMap[catName].totalSales += Number(line.subtotal) || 0;
        categoryStatsMap[catName].unitsSold += Number(line.quantity) || 0;
      });
    });

    const categoryRows = Object.values(categoryStatsMap).map((row) => {
      const expenseAmount = (row.totalSales * row.expensePercentage) / 100;
      return {
        ...row,
        expenseAmount,
        netAfterExpense: row.totalSales - expenseAmount
      };
    });

    const grandTotalSales = categoryRows.reduce((s, r) => s + r.totalSales, 0);
    const grandTotalExpense = categoryRows.reduce((s, r) => s + r.expenseAmount, 0);

    return {
      filteredBills,
      categoryRows,
      grandTotalSales,
      grandTotalExpense,
      grandNetRevenue: grandTotalSales - grandTotalExpense
    };
  }, [bills, categories, salesReportPeriod]);

  // Filtered items for Sales POS grid
  const visiblePosItems = useMemo(() => {
    return items.filter((it) => {
      const matchesCat =
        selectedCategoryFilter === 'ALL' || it.category_id === selectedCategoryFilter;
      const matchesSearch = it.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [items, selectedCategoryFilter, searchQuery]);

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-900 font-sans selection:bg-purple-500/20">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md max-w-md transition-all ${
            toast.type === 'error'
              ? 'bg-rose-50/95 border-rose-300 text-rose-800'
              : 'bg-purple-950/95 border-purple-700 text-white'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-purple-300 shrink-0" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-purple-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-violet-700 flex items-center justify-center shadow-md shadow-purple-600/20">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base sm:text-lg tracking-tight text-purple-950 flex items-center gap-2">
                Olive Cakes
              </h1>
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    isLiveSupabase ? 'bg-purple-600 animate-pulse' : 'bg-amber-500'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Role Switcher — Admin Panel is ONLY shown after Admin Login */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isAdminAuthenticated ? (
              <>
                <div className="bg-[#FAF8F5] p-1 rounded-xl border border-purple-100 flex items-center">
                  <button
                    onClick={() => setActiveRole('sales')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      activeRole === 'sales'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-purple-900'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Sales Terminal</span>
                  </button>
                  <button
                    onClick={() => setActiveRole('admin')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      activeRole === 'admin'
                        ? 'bg-purple-800 text-white shadow-sm'
                        : 'text-slate-600 hover:text-purple-900'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Admin Panel</span>
                  </button>
                </div>

                <button
                  onClick={handleAdminLogout}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs sm:text-sm font-semibold border border-rose-200 transition-colors"
                  title="Logout Admin"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setLoginError('');
                  setShowAdminLoginModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FAF8F5] hover:bg-purple-50 text-slate-600 hover:text-purple-900 text-xs font-medium border border-purple-100 transition-colors"
              >
                <Lock className="w-3.5 h-3.5 text-purple-600" />
                <span>Admin Sign In</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ========================================================================
          ROLE 1: SALES USER TERMINAL (LIVE BILLING WITHOUT PRINTING)
      ======================================================================== */}
      {activeRole === 'sales' && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Product Catalog */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            {/* Search & Category Filter Bar */}
            <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search items to add to bill..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:bg-white transition-colors"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setSelectedCategoryFilter('ALL')}
                  className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedCategoryFilter === 'ALL'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                  }`}
                >
                  All Items
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryFilter(cat.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                      selectedCategoryFilter === cat.id
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Grid */}
            {visiblePosItems.length === 0 ? (
              <div className="bg-white border border-dashed border-purple-200 rounded-2xl p-12 text-center">
                <Package className="w-10 h-10 text-purple-300 mx-auto mb-2" />
                <h3 className="text-base font-bold text-purple-950">No items available</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Sign in as Admin to create categories and add inventory items.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {visiblePosItems.map((item) => {
                  const cat = categories.find((c) => c.id === item.category_id);
                  const inCart = cart.find((c) => c.item.id === item.id);
                  const isOutOfStock = item.stock <= 0;

                  return (
                    <div
                      key={item.id}
                      onClick={() => !isOutOfStock && addToCart(item)}
                      className={`group relative rounded-2xl border p-4 transition-all flex flex-col justify-between ${
                        isOutOfStock
                          ? 'bg-white/60 border-slate-200 opacity-60 cursor-not-allowed'
                          : 'bg-white border-purple-100 hover:border-purple-400 hover:shadow-md hover:shadow-purple-900/5 cursor-pointer active:scale-[0.99]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#FAF8F5] text-purple-800 border border-purple-100">
                            {cat?.name || 'General'}
                          </span>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              item.stock === 0
                                ? 'bg-rose-100 text-rose-700'
                                : item.stock <= 5
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-purple-100 text-purple-800'
                            }`}
                          >
                            {item.stock === 0 ? 'Out of Stock' : `${item.stock} in stock`}
                          </span>
                        </div>
                        <h3 className="font-semibold text-slate-900 text-sm sm:text-base leading-snug mb-3">
                          {item.name}
                        </h3>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-purple-50">
                        <span className="text-lg font-bold text-purple-950 flex items-center">
                          <IndianRupee className="w-4 h-4 text-purple-600" />
                          {Number(item.price).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          disabled={isOutOfStock}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors ${
                            inCart
                              ? 'bg-purple-700 text-white shadow-xs'
                              : 'bg-purple-50 text-purple-700 group-hover:bg-purple-600 group-hover:text-white'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {inCart ? `In Cart (${inCart.quantity})` : 'Add'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Live Cart (with Edit & Delete) & Instant Paperless Bill */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-5">
            {/* Active Cart Panel */}
            <div className="bg-white border border-purple-100 shadow-sm rounded-2xl p-5 flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-purple-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-purple-950 text-base">Current Cart</h2>
                    <p className="text-xs text-slate-500">
                      {cart.reduce((s, c) => s + c.quantity, 0)} items selected
                    </p>
                  </div>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={() => setCart([])}
                    className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Cart Items List with Direct Quantity Edit & Delete */}
              <div className="py-4 space-y-3 max-h-[340px] overflow-y-auto">
                {cart.length === 0 ? (
                  <div className="text-center py-10 px-4 bg-[#FAF8F5] rounded-xl border border-dashed border-purple-200">
                    <ShoppingCart className="w-10 h-10 text-purple-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-600">Your cart is empty.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Tap items on the left to add them to the live bill.
                    </p>
                  </div>
                ) : (
                  cart.map(({ item, quantity }) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2.5 bg-[#FAF8F5] border border-purple-100 rounded-xl p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-semibold text-slate-900 truncate">
                          {item.name}
                        </h4>
                        <p className="text-xs text-slate-500">
                          ₹{Number(item.price).toFixed(2)} × {quantity} ={' '}
                          <span className="text-purple-700 font-bold">
                            ₹{(item.price * quantity).toFixed(2)}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.id, -1)}
                          title="Decrease quantity"
                          className="w-7 h-7 rounded-lg bg-white border border-purple-200 hover:bg-purple-50 flex items-center justify-center text-purple-900"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={item.stock}
                          value={quantity}
                          onChange={(e) => setExactCartQty(item.id, e.target.value)}
                          title="Edit item quantity"
                          className="w-12 h-7 text-center text-xs font-bold text-purple-950 bg-white border border-purple-200 rounded-lg focus:outline-none focus:border-purple-600"
                        />
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.id, 1)}
                          title="Increase quantity"
                          className="w-7 h-7 rounded-lg bg-white border border-purple-200 hover:bg-purple-50 flex items-center justify-center text-purple-900"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          title="Delete item from cart"
                          className="w-7 h-7 rounded-lg bg-white border border-rose-200 hover:bg-rose-100 text-rose-600 flex items-center justify-center ml-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Cart Subtotal, Payment Method & Generate Live Bill CTA */}
              <div className="pt-4 border-t border-purple-100 space-y-3.5">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Items Subtotal</span>
                    <span>₹{cartSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-purple-950">
                    <span>Total Payable</span>
                    <span className="text-purple-700">₹{cartSubtotal.toFixed(2)}</span>
                  </div>
                </div>

                {/* Compact Pill Payment Method Selector: Cash or UPI */}
                <div className="flex items-center justify-between bg-[#FAF8F5] border border-purple-100 rounded-xl px-3 py-2">
                  <span className="text-xs font-semibold text-slate-600">
                    Payment Mode
                  </span>
                  <div className="inline-flex items-center bg-white p-0.5 rounded-lg border border-purple-200/80 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('Cash')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        paymentMethod === 'Cash'
                          ? 'bg-gradient-to-r from-purple-600 to-violet-700 text-white shadow-xs'
                          : 'text-slate-600 hover:text-purple-900'
                      }`}
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      <span>Cash</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('UPI')}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        paymentMethod === 'UPI'
                          ? 'bg-gradient-to-r from-purple-600 to-violet-700 text-white shadow-xs'
                          : 'text-slate-600 hover:text-purple-900'
                      }`}
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>UPI</span>
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleGenerateBill}
                  disabled={cart.length === 0}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white font-bold text-sm shadow-lg shadow-purple-600/20 disabled:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Generate Live Bill ({paymentMethod})
                </button>
              </div>
            </div>

            {/* Live Digital Bill Display (Paperless Confirmation with Timestamp) */}
            {latestGeneratedBill && (
              <div className="bg-gradient-to-b from-purple-50 to-white border border-purple-300 rounded-2xl p-5 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-600 text-white">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Live Bill Generated (No Print)
                  </span>
                  <span className="text-xs font-mono font-semibold text-purple-800">
                    {latestGeneratedBill.bill_number}
                  </span>
                </div>

                <div className="text-xs text-slate-600 mb-3 pb-3 border-b border-purple-100 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span>Timestamp:</span>
                    <span className="font-mono font-medium text-purple-900">
                      {new Date(latestGeneratedBill.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Payment Mode:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 font-semibold">
                      {latestGeneratedBill.payment_method === 'UPI' ? (
                        <QrCode className="w-3 h-3" />
                      ) : (
                        <Banknote className="w-3 h-3" />
                      )}
                      {latestGeneratedBill.payment_method || 'Cash'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
                  {latestGeneratedBill.items?.map((li, idx) => (
                    <div key={idx} className="flex justify-between text-xs text-slate-700">
                      <span>
                        {li.item_name} <span className="text-slate-400">×{li.quantity}</span>
                      </span>
                      <span className="font-semibold">₹{Number(li.subtotal).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="pt-2.5 border-t border-purple-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">Total Settled</span>
                  <span className="text-xl font-extrabold text-purple-700">
                    ₹{Number(latestGeneratedBill.total_amount).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {/* ========================================================================
          ROLE 2: ADMIN PANEL (ONLY ACCESSIBLE AFTER LOGIN)
      ======================================================================== */}
      {activeRole === 'admin' && isAdminAuthenticated && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Admin Sub-Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-purple-100 shadow-xs p-4 rounded-2xl">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAdminTab('analytics')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  adminTab === 'analytics'
                    ? 'bg-purple-700 text-white shadow-sm'
                    : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                Sales & Category Expenses
              </button>
              <button
                onClick={() => setAdminTab('inventory')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  adminTab === 'inventory'
                    ? 'bg-purple-700 text-white shadow-sm'
                    : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                }`}
              >
                <Package className="w-4 h-4" />
                Stock, Price & Categories
              </button>
            </div>
          </div>

          {/* ADMIN TAB 1: DAILY & WEEKLY SALES + CATEGORY EXPENSE HIGHLIGHT */}
          {adminTab === 'analytics' && (
            <div className="space-y-6">
              {/* Period Toggle & Summary KPI Cards */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-purple-950">
                    Category Sales & Expense Allocation
                  </h2>
                  <p className="text-sm text-slate-500">
                    {salesReportPeriod === 'daily'
                      ? 'Today’s live sales breakdown with highlighted category expense deductions'
                      : 'Last 7 days cumulative category performance'}
                  </p>
                </div>

                <div className="inline-flex bg-white p-1 rounded-xl border border-purple-100 shadow-xs self-start">
                  <button
                    onClick={() => setSalesReportPeriod('daily')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                      salesReportPeriod === 'daily'
                        ? 'bg-purple-700 text-white'
                        : 'text-slate-600 hover:text-purple-900'
                    }`}
                  >
                    <Calendar className="w-4 h-4" />
                    Daily View (Today)
                  </button>
                  <button
                    onClick={() => setSalesReportPeriod('weekly')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                      salesReportPeriod === 'weekly'
                        ? 'bg-purple-700 text-white'
                        : 'text-slate-600 hover:text-purple-900'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    Weekly View (7 Days)
                  </button>
                </div>
              </div>

              {/* Top Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {salesReportPeriod === 'daily' ? 'Today’s Gross Sales' : '7-Day Gross Sales'}
                  </span>
                  <div className="text-3xl font-extrabold text-purple-950 mt-2">
                    ₹{analyticsData.grandTotalSales.toFixed(2)}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Across {analyticsData.filteredBills.length} generated bills
                  </p>
                </div>

                <div className="bg-purple-50 border border-purple-300 shadow-xs rounded-2xl p-5">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-800 flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5" />
                    Highlighted Category Expense
                  </span>
                  <div className="text-3xl font-extrabold text-purple-700 mt-2">
                    ₹{analyticsData.grandTotalExpense.toFixed(2)}
                  </div>
                  <p className="text-xs text-purple-700/80 mt-1">
                    Calculated dynamically from Admin category % rates
                  </p>
                </div>

                <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Net Revenue (After Expense)
                  </span>
                  <div className="text-3xl font-extrabold text-slate-900 mt-2">
                    ₹{analyticsData.grandNetRevenue.toFixed(2)}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Gross Sales minus Category Expenses
                  </p>
                </div>
              </div>

              {/* Category Breakdown Table with Admin Expense % Inline Control */}
              <div className="bg-white border border-purple-100 shadow-xs rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-purple-950 text-base">
                      Category-Wise Sales & Highlighted Expense Breakdown
                    </h3>
                    <p className="text-xs text-slate-500">
                      Adjust the expense percentage for any category below to immediately recalculate highlighted expense amounts.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#FAF8F5] border-b border-purple-100 text-xs uppercase tracking-wider text-slate-500">
                        <th className="py-3.5 px-5">Category</th>
                        <th className="py-3.5 px-4 text-right">Units Sold</th>
                        <th className="py-3.5 px-4 text-right">Total Category Sale</th>
                        <th className="py-3.5 px-4 text-center">Admin Expense %</th>
                        <th className="py-3.5 px-5 text-right bg-purple-100/70 text-purple-900">
                          Highlighted Expense Amount
                        </th>
                        <th className="py-3.5 px-5 text-right">Net Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50 text-sm">
                      {analyticsData.categoryRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                            No categories or sales recorded yet.
                          </td>
                        </tr>
                      ) : (
                        analyticsData.categoryRows.map((row) => (
                          <tr key={row.categoryName} className="hover:bg-[#FAF8F5]/80">
                            <td className="py-4 px-5 font-semibold text-slate-900">
                              {row.categoryName}
                            </td>
                            <td className="py-4 px-4 text-right text-slate-600">
                              {row.unitsSold}
                            </td>
                            <td className="py-4 px-4 text-right font-bold text-slate-900">
                              ₹{row.totalSales.toFixed(2)}
                            </td>
                            <td className="py-4 px-4">
                              {row.categoryId ? (
                                <div className="flex items-center justify-center gap-1">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="100"
                                    value={row.expensePercentage}
                                    onChange={(e) =>
                                      handleUpdateCategoryExpense(
                                        row.categoryId,
                                        e.target.value
                                      )
                                    }
                                    className="w-20 bg-[#FAF8F5] border border-purple-200 rounded-lg px-2.5 py-1 text-center text-sm font-bold text-purple-800 focus:outline-none focus:border-purple-600 focus:bg-white"
                                  />
                                  <span className="text-slate-400 text-xs">%</span>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs block text-center">
                                  N/A
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-5 text-right bg-purple-50/90 border-x border-purple-200/70">
                              <span className="inline-flex items-center px-3 py-1 rounded-lg bg-purple-600 text-white font-bold shadow-xs">
                                ₹{row.expenseAmount.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-right font-semibold text-slate-800">
                              ₹{row.netAfterExpense.toFixed(2)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Generated Bills Ledger with Timestamps */}
              <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5">
                <h3 className="font-bold text-purple-950 text-base mb-4">
                  Generated Bills Ledger ({salesReportPeriod === 'daily' ? 'Today' : 'Last 7 Days'})
                </h3>
                {analyticsData.filteredBills.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4">
                    No bills recorded in this time window yet.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto">
                    {analyticsData.filteredBills.map((bill) => (
                      <div
                        key={bill.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#FAF8F5] border border-purple-100 rounded-xl px-4 py-3"
                      >
                        <div>
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono text-xs font-bold text-purple-700">
                              {bill.bill_number}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-800">
                              {bill.payment_method === 'UPI' ? (
                                <QrCode className="w-3 h-3" />
                              ) : (
                                <Banknote className="w-3 h-3" />
                              )}
                              {bill.payment_method || 'Cash'}
                            </span>
                            <span className="text-xs text-slate-500">
                              {new Date(bill.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            {(bill.items || [])
                              .map((i) => `${i.item_name} (×${i.quantity})`)
                              .join(', ')}
                          </p>
                        </div>
                        <div className="text-base font-bold text-purple-950">
                          ₹{Number(bill.total_amount).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ADMIN TAB 2: INVENTORY CREATION, STOCK/PRICE UPDATES & CATEGORY MANAGEMENT */}
          {adminTab === 'inventory' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Add Item, Add/Delete Category, Security */}
              <div className="lg:col-span-4 space-y-6">
                {/* Create Category with Default Expense Percentage */}
                <form
                  onSubmit={handleAddCategory}
                  className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center gap-2 text-purple-950 font-bold">
                    <Layers className="w-5 h-5 text-purple-600" />
                    <h3>Manage Categories & Expense %</h3>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Category Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Beverages"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Expense Highlight Percentage (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      required
                      value={newCategoryExpense}
                      onChange={(e) => setNewCategoryExpense(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-200 font-semibold text-sm transition-colors"
                  >
                    Create Category
                  </button>

                  {/* Existing Categories List with Safe Delete Option */}
                  {categories.length > 0 && (
                    <div className="pt-3 border-t border-purple-100 space-y-2">
                      <span className="block text-xs font-semibold text-slate-500">
                        Existing Categories ({categories.length})
                      </span>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {categories.map((cat) => {
                          const itemCount = items.filter((i) => i.category_id === cat.id).length;
                          return (
                            <div
                              key={cat.id}
                              className="flex items-center justify-between gap-2 bg-[#FAF8F5] border border-purple-100 rounded-xl px-3 py-2 text-xs"
                            >
                              <div>
                                <span className="font-semibold text-slate-900">{cat.name}</span>
                                <span className="text-slate-500 ml-1.5">
                                  ({cat.expense_percentage}% exp • {itemCount} items)
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(cat)}
                                title="Delete category (blocks if billed items exist)"
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </form>

                {/* Create New Inventory Item */}
                <form
                  onSubmit={handleCreateItem}
                  className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center gap-2 text-purple-950 font-bold">
                    <Plus className="w-5 h-5 text-purple-600" />
                    <h3>Create New Item</h3>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Item Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Cold Brew Coffee"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                    <select
                      value={newItemCategory}
                      onChange={(e) => setNewItemCategory(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    >
                      {categories.length === 0 && (
                        <option value="">Create a category first</option>
                      )}
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Unit Price (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="150"
                        value={newItemPrice}
                        onChange={(e) => setNewItemPrice(e.target.value)}
                        className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Initial Stock</label>
                      <input
                        type="number"
                        min="0"
                        required
                        placeholder="25"
                        value={newItemStock}
                        onChange={(e) => setNewItemStock(e.target.value)}
                        className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={categories.length === 0}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm shadow-sm transition-colors"
                  >
                    Add Item to Stock
                  </button>
                </form>

                {/* Update Admin Passcode */}
                <form
                  onSubmit={handleUpdateAdminPassword}
                  className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-3"
                >
                  <div className="flex items-center gap-2 text-purple-950 font-bold text-sm">
                    <KeyRound className="w-4 h-4 text-purple-600" />
                    <h3>Change Admin Passcode</h3>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="New passcode (min 4 chars)"
                      value={newAdminPassInput}
                      onChange={(e) => setNewAdminPassInput(e.target.value)}
                      className="flex-1 bg-[#FAF8F5] border border-purple-100 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-purple-500"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-2 rounded-xl bg-purple-800 hover:bg-purple-700 text-white text-xs font-semibold"
                    >
                      Update
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column: Live Stock & Price Editor Table */}
              <div className="lg:col-span-8 bg-white border border-purple-100 shadow-xs rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-purple-100">
                  <h3 className="font-bold text-purple-950 text-base">
                    Manage Item Stock & Pricing
                  </h3>
                  <p className="text-xs text-slate-500">
                    Edit price or restock quantities directly. Changes immediately sync to the Sales Terminal.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#FAF8F5] border-b border-purple-100 text-xs uppercase tracking-wider text-slate-500">
                        <th className="py-3.5 px-5">Item Name</th>
                        <th className="py-3.5 px-4">Category</th>
                        <th className="py-3.5 px-4">Price (₹)</th>
                        <th className="py-3.5 px-4">Stock Qty</th>
                        <th className="py-3.5 px-5 text-right">Quick Restock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50 text-sm">
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-slate-400 text-xs">
                            No inventory items added yet. Use the form on the left to add items.
                          </td>
                        </tr>
                      ) : (
                        items.map((item) => {
                          const cat = categories.find((c) => c.id === item.category_id);
                          return (
                            <InventoryRow
                              key={item.id}
                              item={item}
                              categoryName={cat?.name || 'General'}
                              onSave={handleUpdateItemStockAndPrice}
                            />
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ========================================================================
          ADMIN LOGIN MODAL
      ======================================================================== */}
      {showAdminLoginModal && (
        <div className="fixed inset-0 z-50 bg-purple-950/40 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAdminLogin}
            className="bg-white border border-purple-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-purple-950">Admin Access</h2>
                  <p className="text-xs text-slate-500">Sign in to reveal Admin Panel</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminLoginModal(false)}
                className="text-xs font-semibold text-slate-500 hover:text-purple-900 px-2 py-1"
              >
                Close
              </button>
            </div>

            {loginError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Admin Username
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="admin"
                value={loginUserInput}
                onChange={(e) => setLoginUserInput(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Admin Passcode
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={loginPassInput}
                onChange={(e) => setLoginPassInput(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm shadow-sm transition-colors"
            >
              Unlock Admin Panel
            </button>
          </form>
        </div>
      )}

      {/* ========================================================================
          LOCAL VITE + SUPABASE SETUP MODAL
      ======================================================================== */}
      {showSetupModal && (
        <div className="fixed inset-0 z-50 bg-purple-950/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-purple-200 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-purple-100 pb-4">
              <div className="flex items-center gap-2.5">
                <Database className="w-6 h-6 text-purple-600" />
                <div>
                  <h2 className="text-lg font-bold text-purple-950">
                    olive-pos — Vite + Supabase Setup
                  </h2>
                  <p className="text-xs text-slate-500">
                    Connect your live Supabase PostgreSQL project or run locally on your machine
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSetupModal(false)}
                className="px-3 py-1.5 rounded-lg bg-[#FAF8F5] hover:bg-purple-100 border border-purple-200 text-xs font-semibold text-purple-900"
              >
                Close
              </button>
            </div>

            {/* Step 1: Connect Live Supabase Credentials Right Here */}
            <form
              onSubmit={handleSaveSupabaseConfig}
              className="bg-[#FAF8F5] border border-purple-100 rounded-xl p-4 space-y-3"
            >
              <h3 className="text-sm font-bold text-purple-800">
                1. Connect Your Supabase Project (Instant Live Sync)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    VITE_SUPABASE_URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://xyzcompany.supabase.co"
                    value={sbUrl}
                    onChange={(e) => setSbUrl(e.target.value)}
                    className="w-full bg-white border border-purple-200 rounded-lg px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    VITE_SUPABASE_ANON_KEY
                  </label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    value={sbKey}
                    onChange={(e) => setSbKey(e.target.value)}
                    className="w-full bg-white border border-purple-200 rounded-lg px-3 py-2 text-xs text-slate-900"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-500">
                  Leave empty to use Local Mode.
                </span>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold"
                >
                  Save & Connect Supabase
                </button>
              </div>
            </form>

            {/* Step 2: Supabase SQL Editor Schema */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-purple-950">
                  2. Supabase SQL Schema (Paste in Supabase SQL Editor)
                </h3>
                <button
                  type="button"
                  onClick={copySqlToClipboard}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-xs text-purple-900 font-semibold"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSql ? 'Copied SQL!' : 'Copy SQL'}
                </button>
              </div>
              <pre className="bg-purple-950 border border-purple-900 rounded-xl p-3.5 text-xs text-purple-100 overflow-x-auto max-h-56 font-mono leading-relaxed">
                {SUPABASE_SQL_SCHEMA}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Component for Inline Inventory Editing
function InventoryRow({ item, categoryName, onSave }) {
  const [price, setPrice] = useState(item.price);
  const [stock, setStock] = useState(item.stock);
  const isDirty = Number(price) !== Number(item.price) || Number(stock) !== Number(item.stock);

  useEffect(() => {
    setPrice(item.price);
    setStock(item.stock);
  }, [item.price, item.stock]);

  return (
    <tr className="hover:bg-[#FAF8F5]/80">
      <td className="py-3.5 px-5 font-semibold text-slate-900">{item.name}</td>
      <td className="py-3.5 px-4">
        <span className="px-2.5 py-1 rounded-md bg-[#FAF8F5] border border-purple-100 text-purple-800 text-xs font-medium">
          {categoryName}
        </span>
      </td>
      <td className="py-3.5 px-4">
        <input
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-24 bg-[#FAF8F5] border border-purple-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
        />
      </td>
      <td className="py-3.5 px-4">
        <input
          type="number"
          min="0"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className={`w-20 bg-[#FAF8F5] border rounded-lg px-2.5 py-1.5 text-sm font-semibold focus:outline-none focus:bg-white ${
            Number(stock) <= 5
              ? 'border-amber-400 text-amber-800'
              : 'border-purple-200 text-slate-900'
          }`}
        />
      </td>
      <td className="py-3.5 px-5 text-right">
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSave(item.id, price, Number(stock) + 10)}
            className="px-2.5 py-1.5 rounded-lg bg-[#FAF8F5] hover:bg-purple-100 border border-purple-200 text-xs font-semibold text-purple-900"
            title="Add 10 units to stock"
          >
            +10 Stock
          </button>
          <button
            type="button"
            disabled={!isDirty}
            onClick={() => onSave(item.id, price, stock)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isDirty
                ? 'bg-purple-700 hover:bg-purple-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            Save
          </button>
        </div>
      </td>
    </tr>
  );
}