import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShoppingCart,
  Package,
  BarChart3,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  ShieldCheck,
  Receipt,
  Calendar,
  TrendingUp,
  Percent,
  Search,
  Layers,
  IndianRupee,
  Lock,
  LogOut,
  Banknote,
  QrCode,
  Users,
  UserPlus,
  Store,
  ArrowRightLeft,
  ImagePlus,
  FolderTree,
  ChevronDown,
  X
} from 'lucide-react';

// Resize uploaded image to a compact JPEG data URL so it saves cleanly in Supabase & loads fast
const compressImageToDataUrl = (file, maxDimension = 280) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = reject;
      img.src = event.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

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
      cache: 'no-store',
      ...options,
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
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

const AUTH_SESSION_STORAGE_KEY = 'olive_pos_auth_session';
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

const loadActiveSession = () => {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.user && parsed?.expiresAt && Date.now() < parsed.expiresAt) {
      return parsed;
    }
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  } catch {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
};

export default function App() {
  const initialSession = useMemo(() => loadActiveSession(), []);

  // Navigation & Authentication State
  const [activeRole, setActiveRole] = useState('sales');
  const [adminTab, setAdminTab] = useState('analytics');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => Boolean(initialSession?.user));
  const [loginUserInput, setLoginUserInput] = useState('');
  const [loginPassInput, setLoginPassInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [currentLoggedInUser, setCurrentLoggedInUser] = useState(() => initialSession?.user || null);
  const [dbUsers, setDbUsers] = useState([]);
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('shop-admin');
  const [newUserShopId, setNewUserShopId] = useState('');

  // Multi-Shop & Shop Stock States
  const [shops, setShops] = useState([]);
  const [shopStocks, setShopStocks] = useState([]);
  const [shopCategoryExpenses, setShopCategoryExpenses] = useState([]);
  const [activeShopId, setActiveShopId] = useState(() => initialSession?.user?.shop_id || '');
  const [adminSelectedShopFilter, setAdminSelectedShopFilter] = useState('ALL');
  const [newShopName, setNewShopName] = useState('');
  const [newShopSalesProfile, setNewShopSalesProfile] = useState('');
  const [newShopLocation, setNewShopLocation] = useState('');

  // Stock Assignment Cascading Dropdown States (Shop -> Category -> Flavour -> Item Type -> Count)
  const [assignShopId, setAssignShopId] = useState('');
  const [assignCategoryId, setAssignCategoryId] = useState('');
  const [assignSubcategoryId, setAssignSubcategoryId] = useState('');
  const [assignItemId, setAssignItemId] = useState('');
  const [assignStockQty, setAssignStockQty] = useState('');

  // Stock Alerts Tab Filters
  const [stockAlertStatusFilter, setStockAlertStatusFilter] = useState('ALL');
  const [stockAlertShopFilter, setStockAlertShopFilter] = useState('ALL');
  const [stockAlertSearchQuery, setStockAlertSearchQuery] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState(2);

  // Stock Update Shop Filter & Category-Level Draft Stock Maps
  const [stockUpdateShopFilter, setStockUpdateShopFilter] = useState('ALL');
  const [stockUpdateSearchQuery, setStockUpdateSearchQuery] = useState('');
  const [menuEditorSearchQuery, setMenuEditorSearchQuery] = useState('');
  const [stockDrafts, setStockDrafts] = useState({});
  const [alertStockDrafts, setAlertStockDrafts] = useState({});

  // Supabase Connection State
  const [sbUrl] = useState(() => {
    try {
      return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) || localStorage.getItem('olive_pos_sb_url') || '';
    } catch {
      return localStorage.getItem('olive_pos_sb_url') || '';
    }
  });
  const [sbKey] = useState(() => {
    try {
      return (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) || localStorage.getItem('olive_pos_sb_key') || '';
    } catch {
      return localStorage.getItem('olive_pos_sb_key') || '';
    }
  });

  const supabase = useMemo(() => new SupabaseService(sbUrl, sbKey), [sbUrl, sbKey]);
  const [isLiveSupabase, setIsLiveSupabase] = useState(false);

  // Core Shared Catalog Data States (Common to all shops)
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [items, setItems] = useState([]);
  const [bills, setBills] = useState([]);

  // Sales POS Cart State
  const [cart, setCart] = useState([]);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [splitCashAmount, setSplitCashAmount] = useState('');
  const [splitUpiAmount, setSplitUpiAmount] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL');
  const [selectedSubcategoryFilter, setSelectedSubcategoryFilter] = useState('ALL');
  const [latestGeneratedBill, setLatestGeneratedBill] = useState(null);

  // Admin Shared Catalog Form States
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemSubcategory, setNewItemSubcategory] = useState('');
  const [newItemImageUrl, setNewItemImageUrl] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryParentId, setNewSubcategoryParentId] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [expenseConfigShopId, setExpenseConfigShopId] = useState('');
  const [expenseConfigCategoryId, setExpenseConfigCategoryId] = useState('');
  const [expenseConfigRate, setExpenseConfigRate] = useState('15');

  // Admin Sales Analytics & Generated Bills Tab Filters
  const [salesReportPeriod, setSalesReportPeriod] = useState('daily');
  const [analyticsDate, setAnalyticsDate] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [billDateFilter, setBillDateFilter] = useState(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [billSearchQuery, setBillSearchQuery] = useState('');
  const [billPaymentFilter, setBillPaymentFilter] = useState('ALL');
  const [billShopFilter, setBillShopFilter] = useState('ALL');

  // Public folder logo fallback flag (/logo.png)
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  // UI Feedback State
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Keep active session valid for 2 hours across reloads and auto-expire when elapsed
  useEffect(() => {
    if (!isAdminAuthenticated) return;

    const checkSessionValidity = () => {
      const activeSession = loadActiveSession();
      if (!activeSession) {
        setIsAdminAuthenticated(false);
        setCurrentLoggedInUser(null);
        setActiveRole('sales');
        setCart([]);
        setLatestGeneratedBill(null);
        showToast('Your 2-hour session has expired. Please sign in again.', 'error');
      }
    };

    const intervalId = setInterval(checkSessionValidity, 60 * 1000);
    return () => clearInterval(intervalId);
  }, [isAdminAuthenticated]);

  // Fetch Data from Supabase if configured
  const syncFromSupabase = async (silent = false) => {
    if (!supabase.isConfigured()) {
      setIsLiveSupabase(false);
      return;
    }
    try {
      const [catsData, itemsData, billsData, billItemsData] = await Promise.all([
        supabase.request('categories?select=*&order=name.asc'),
        supabase.request('items?select=*&order=name.asc'),
        supabase.request('bills?select=*&order=created_at.desc&limit=500'),
        supabase.request('bill_items?select=*&order=created_at.desc&limit=2500')
      ]);

      const billsWithItems = (billsData || []).map((b) => ({
        ...b,
        items: (billItemsData || []).filter((bi) => bi.bill_id === b.id)
      }));

      setCategories(catsData || []);
      setItems(itemsData || []);
      setBills(billsWithItems);
      setIsLiveSupabase(true);

      if (!itemsData || itemsData.length === 0) {
        setCart([]);
        setLatestGeneratedBill(null);
        setAssignItemId('');
      }

      try {
        const subcatsData = await supabase.request('subcategories?select=*&order=name.asc');
        setSubcategories(subcatsData || []);
      } catch {
        setSubcategories([]);
      }

      try {
        const [shopsData, shopStocksData, shopCatExpData, usersData] = await Promise.all([
          supabase.request('shops?select=*&order=name.asc'),
          supabase.request('shop_stocks?select=*'),
          supabase.request('shop_category_expenses?select=*'),
          supabase.request('app_users?select=*&order=created_at.asc')
        ]);
        setShops(shopsData || []);
        setShopStocks(shopStocksData || []);
        setShopCategoryExpenses(shopCatExpData || []);
        setDbUsers(usersData || []);

        if (!shopsData || shopsData.length === 0) {
          setActiveShopId('');
          setAssignShopId('');
          setNewUserShopId('');
          setExpenseConfigShopId('');
        }
      } catch {
        setShops([]);
        setShopStocks([]);
        setShopCategoryExpenses([]);
        setDbUsers([]);
      }

      if (!catsData || catsData.length === 0) {
        setNewItemCategory('');
        setNewSubcategoryParentId('');
        setExpenseConfigCategoryId('');
        setAssignCategoryId('');
      } else {
        setNewItemCategory((prev) =>
          catsData.some((c) => String(c.id) === String(prev)) ? prev : catsData[0].id
        );
        setNewSubcategoryParentId((prev) =>
          catsData.some((c) => String(c.id) === String(prev)) ? prev : catsData[0].id
        );
      }
      if (!silent) showToast('Synced live data from Supabase!');
    } catch (err) {
      console.error(err);
      setIsLiveSupabase(false);
      if (!silent) showToast(`Supabase sync failed: ${err.message}`, 'error');
    }
  };

  const syncFromSupabaseRef = useRef(syncFromSupabase);
  syncFromSupabaseRef.current = syncFromSupabase;

  useEffect(() => {
    if (!supabase.isConfigured()) return;
    syncFromSupabaseRef.current(true);

    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        syncFromSupabaseRef.current(true);
      }
    };

    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        syncFromSupabaseRef.current(true);
      }
    }, 30000);

    return () => {
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      clearInterval(pollInterval);
    };
  }, [supabase]);

  useEffect(() => {
    if (supabase.isConfigured() && isAdminAuthenticated) {
      syncFromSupabase(true);
    }
  }, [activeRole, adminTab, isAdminAuthenticated]);

  useEffect(() => {
    if (categories.length > 0) {
      if (!categories.some((c) => c.id === newItemCategory)) {
        setNewItemCategory(categories[0].id);
      }
      if (!categories.some((c) => c.id === newSubcategoryParentId)) {
        setNewSubcategoryParentId(categories[0].id);
      }
      if (!categories.some((c) => c.id === expenseConfigCategoryId)) {
        setExpenseConfigCategoryId(categories[0].id);
      }
      if (!categories.some((c) => c.id === assignCategoryId)) {
        setAssignCategoryId(categories[0].id);
      }
    }
  }, [categories, newItemCategory, newSubcategoryParentId, expenseConfigCategoryId, assignCategoryId]);

  useEffect(() => {
    if (shops.length > 0) {
      if ((currentLoggedInUser?.role === 'shop-admin' || currentLoggedInUser?.role === 'staff') && currentLoggedInUser.shop_id) {
        setActiveShopId(currentLoggedInUser.shop_id);
      } else if (!activeShopId || !shops.some((s) => s.id === activeShopId)) {
        setActiveShopId(shops[0].id);
      }
      if (!assignShopId || !shops.some((s) => s.id === assignShopId)) {
        setAssignShopId(shops[0].id);
      }
      if (!newUserShopId || !shops.some((s) => s.id === newUserShopId)) {
        setNewUserShopId(shops[0].id);
      }
      if (!expenseConfigShopId || !shops.some((s) => s.id === expenseConfigShopId)) {
        setExpenseConfigShopId(shops[0].id);
      }
    }
  }, [shops, currentLoggedInUser, activeShopId, assignShopId, newUserShopId, expenseConfigShopId]);

  // Keep Stock Assignment cascading dropdowns (Category -> Flavour -> Item Type) synchronized
  const assignCategorySubcategories = useMemo(() => {
    if (!assignCategoryId) return [];
    return subcategories.filter((sc) => sc.category_id === assignCategoryId);
  }, [subcategories, assignCategoryId]);

  const assignFilteredItems = useMemo(() => {
    if (!assignCategoryId) return items;
    return items.filter((it) => {
      if (it.category_id !== assignCategoryId) return false;
      if (assignSubcategoryId === 'GENERAL') {
        return !it.subcategory_id;
      }
      if (assignSubcategoryId) {
        return it.subcategory_id === assignSubcategoryId;
      }
      return true;
    });
  }, [items, assignCategoryId, assignSubcategoryId]);

  useEffect(() => {
    if (assignFilteredItems.length > 0) {
      if (!assignFilteredItems.some((i) => i.id === assignItemId)) {
        setAssignItemId(assignFilteredItems[0].id);
      }
    } else {
      setAssignItemId('');
    }
  }, [assignFilteredItems, assignItemId]);

  const isSuperAdmin = currentLoggedInUser?.role === 'admin';
  const isShopAdmin = currentLoggedInUser?.role === 'shop-admin';
  const currentActiveShop = useMemo(
    () => shops.find((s) => s.id === activeShopId) || null,
    [shops, activeShopId]
  );

  // ============================================================================
  // AUTHENTICATION & DATABASE USER MANAGEMENT HANDLERS
  // ============================================================================
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    const enteredUser = loginUserInput.trim();
    if (!enteredUser || !loginPassInput) {
      setLoginError('Please enter both username and password.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');
    try {
      let usersList = dbUsers;
      if (supabase.isConfigured()) {
        const freshUsers = await supabase.request('app_users?select=*&order=created_at.asc');
        if (freshUsers) {
          usersList = freshUsers;
          setDbUsers(freshUsers);
        }
      }

      const matchedDbUser = usersList.find(
        (u) => u.username.toLowerCase() === enteredUser.toLowerCase() && u.password === loginPassInput
      );

      if (matchedDbUser) {
        if ((matchedDbUser.role === 'shop-admin' || matchedDbUser.role === 'staff') && !matchedDbUser.shop_id && shops.length > 0) {
          setLoginError('This account has no shop assigned yet. Contact Admin.');
          setIsLoggingIn(false);
          return;
        }
        setIsAdminAuthenticated(true);
        setCurrentLoggedInUser(matchedDbUser);
        try {
          localStorage.setItem(
            AUTH_SESSION_STORAGE_KEY,
            JSON.stringify({
              user: matchedDbUser,
              expiresAt: Date.now() + SESSION_DURATION_MS
            })
          );
        } catch {
          // Ignore storage quota errors
        }
        if (matchedDbUser.shop_id) {
          setActiveShopId(matchedDbUser.shop_id);
        }
        setActiveRole('sales');
        setAdminTab('analytics');
        setLoginUserInput('');
        setLoginPassInput('');
        setLoginError('');
        setCart([]);
        showToast(`Welcome, ${matchedDbUser.username} (${matchedDbUser.role})!`);
      } else {
        setLoginError('Invalid database username or password.');
      }
    } catch (err) {
      setLoginError(`Authentication error: ${err.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminLogout = () => {
    try {
      localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage access errors
    }
    setIsAdminAuthenticated(false);
    setCurrentLoggedInUser(null);
    setActiveRole('sales');
    setCart([]);
    setLatestGeneratedBill(null);
    showToast('Logged out successfully.');
  };

  const handleAddDbUser = async (e) => {
    e.preventDefault();
    const cleanUser = newUserUsername.trim();
    const cleanPass = newUserPassword.trim();
    if (!cleanUser || cleanPass.length < 4) {
      showToast('Enter a username and a password with at least 4 characters.', 'error');
      return;
    }
    if ((newUserRole === 'shop-admin' || newUserRole === 'staff') && !newUserShopId) {
      showToast('Please select a shop to assign this user to.', 'error');
      return;
    }

    const assignedShop = newUserRole === 'shop-admin' || newUserRole === 'staff' ? newUserShopId : null;

    try {
      if (isLiveSupabase) {
        await supabase.request('app_users', {
          method: 'POST',
          body: JSON.stringify({
            username: cleanUser,
            password: cleanPass,
            role: newUserRole,
            shop_id: assignedShop
          })
        });
        await syncFromSupabase(true);
      } else {
        if (dbUsers.some((u) => u.username.toLowerCase() === cleanUser.toLowerCase())) {
          showToast('Username already exists.', 'error');
          return;
        }
        setDbUsers((prev) => [
          ...prev,
          {
            id: `user-${Date.now()}`,
            username: cleanUser,
            password: cleanPass,
            role: newUserRole,
            shop_id: assignedShop
          }
        ]);
      }
      setNewUserUsername('');
      setNewUserPassword('');
      setNewUserRole('shop-admin');
      showToast(`User "${cleanUser}" (${newUserRole}) saved to database!`);
    } catch (err) {
      showToast(`Failed to save user: ${err.message}`, 'error');
    }
  };

  const handleUpdateDbUserPassword = async (userId, updatedPass) => {
    if (!updatedPass || updatedPass.trim().length < 4) {
      showToast('Password must be at least 4 characters.', 'error');
      return;
    }
    try {
      if (isLiveSupabase) {
        await supabase.request(`app_users?id=eq.${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ password: updatedPass.trim() })
        });
        await syncFromSupabase(true);
      } else {
        setDbUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, password: updatedPass.trim() } : u))
        );
      }
      showToast('User password updated in database!');
    } catch (err) {
      showToast(`Failed to update password: ${err.message}`, 'error');
    }
  };

  const handleDeleteDbUser = async (user) => {
    try {
      if (isLiveSupabase) {
        await supabase.request(`app_users?id=eq.${user.id}`, {
          method: 'DELETE'
        });
        await syncFromSupabase(true);
      } else {
        setDbUsers((prev) => prev.filter((u) => u.id !== user.id));
      }
      showToast(`User "${user.username}" removed.`);
    } catch (err) {
      showToast(`Failed to delete user: ${err.message}`, 'error');
    }
  };

  // ============================================================================
  // SHOP CREATION & STOCK ALLOCATION HANDLERS (ADMIN)
  // ============================================================================
  const handleCreateShop = async (e) => {
    e.preventDefault();
    const cleanShop = newShopName.trim();
    const cleanProfile = newShopSalesProfile.trim();
    if (!cleanShop || !cleanProfile) {
      showToast('Please enter both Shop Name and its unique Sales Profile Name.', 'error');
      return;
    }

    if (
      shops.some(
        (s) =>
          s.name.toLowerCase() === cleanShop.toLowerCase() ||
          s.sales_profile_name.toLowerCase() === cleanProfile.toLowerCase()
      )
    ) {
      showToast('Shop Name and Sales Profile Name must be unique (1 profile per shop).', 'error');
      return;
    }

    try {
      if (isLiveSupabase) {
        await supabase.request('shops', {
          method: 'POST',
          body: JSON.stringify({
            name: cleanShop,
            sales_profile_name: cleanProfile,
            location: newShopLocation.trim()
          })
        });
        await syncFromSupabase(true);
      } else {
        const created = {
          id: `shop-${Date.now()}`,
          name: cleanShop,
          sales_profile_name: cleanProfile,
          location: newShopLocation.trim()
        };
        setShops((prev) => [...prev, created]);
        if (!activeShopId) setActiveShopId(created.id);
      }
      setNewShopName('');
      setNewShopSalesProfile('');
      setNewShopLocation('');
      showToast(`Shop "${cleanShop}" created with Sales Profile "${cleanProfile}"!`);
    } catch (err) {
      showToast(`Failed to create shop: ${err.message}`, 'error');
    }
  };

  const handleAssignStockToShop = async (e) => {
    e.preventDefault();
    if (!assignShopId || !assignItemId) {
      showToast('Select Shop, Flavour / Item, and Item Type.', 'error');
      return;
    }
    const qtyToAdd = parseInt(assignStockQty, 10);
    if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
      showToast('Enter a valid stock quantity greater than 0.', 'error');
      return;
    }

    const masterItem = items.find((i) => i.id === assignItemId);
    if (!masterItem) return;

    const existingAllocation = shopStocks.find(
      (ss) => ss.shop_id === assignShopId && ss.item_id === assignItemId
    );
    const nextShopStock = (existingAllocation ? Number(existingAllocation.stock) : 0) + qtyToAdd;

    try {
      if (isLiveSupabase) {
        if (existingAllocation) {
          await supabase.request(`shop_stocks?id=eq.${existingAllocation.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              stock: nextShopStock,
              updated_at: new Date().toISOString()
            })
          });
        } else {
          await supabase.request('shop_stocks', {
            method: 'POST',
            body: JSON.stringify({
              shop_id: assignShopId,
              item_id: assignItemId,
              stock: nextShopStock
            })
          });
        }
        await syncFromSupabase(true);
      } else {
        if (existingAllocation) {
          setShopStocks((prev) =>
            prev.map((ss) =>
              ss.id === existingAllocation.id ? { ...ss, stock: nextShopStock } : ss
            )
          );
        } else {
          setShopStocks((prev) => [
            ...prev,
            {
              id: `ss-${Date.now()}`,
              shop_id: assignShopId,
              item_id: assignItemId,
              stock: nextShopStock
            }
          ]);
        }
      }
      setAssignStockQty('');
      const targetShop = shops.find((s) => s.id === assignShopId);
      showToast(`Assigned +${qtyToAdd} units of "${masterItem.name}" to ${targetShop?.name || 'Shop'}!`);
    } catch (err) {
      showToast(`Stock assignment failed: ${err.message}`, 'error');
    }
  };

  const handleUpdateShopStockDirect = async (shopId, itemId, exactStock) => {
    const parsed = Math.max(0, parseInt(exactStock, 10) || 0);
    const existing = shopStocks.find((ss) => ss.shop_id === shopId && ss.item_id === itemId);

    try {
      if (isLiveSupabase) {
        if (existing) {
          await supabase.request(`shop_stocks?id=eq.${existing.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              stock: parsed,
              updated_at: new Date().toISOString()
            })
          });
        } else {
          await supabase.request('shop_stocks', {
            method: 'POST',
            body: JSON.stringify({
              shop_id: shopId,
              item_id: itemId,
              stock: parsed
            })
          });
        }
        await syncFromSupabase(true);
      } else {
        if (existing) {
          setShopStocks((prev) =>
            prev.map((ss) => (ss.id === existing.id ? { ...ss, stock: parsed } : ss))
          );
        } else {
          setShopStocks((prev) => [
            ...prev,
            { id: `ss-${Date.now()}`, shop_id: shopId, item_id: itemId, stock: parsed }
          ]);
        }
      }
      showToast('Shop stock updated!');
    } catch (err) {
      showToast(`Failed to update shop stock: ${err.message}`, 'error');
    }
  };

  const handleBatchUpdateShopStock = async (updates, draftTarget = 'stock') => {
    if (!updates || updates.length === 0) return;

    const timestamp = new Date().toISOString();
    try {
      if (isLiveSupabase) {
        await Promise.all(
          updates.map(({ shopId, itemId, stock }) => {
            const parsed = Math.max(0, parseInt(stock, 10) || 0);
            const existing = shopStocks.find(
              (ss) => ss.shop_id === shopId && ss.item_id === itemId
            );
            if (existing) {
              return supabase.request(`shop_stocks?id=eq.${existing.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  stock: parsed,
                  updated_at: timestamp
                })
              });
            }
            return supabase.request('shop_stocks', {
              method: 'POST',
              body: JSON.stringify({
                shop_id: shopId,
                item_id: itemId,
                stock: parsed
              })
            });
          })
        );
        await syncFromSupabase(true);
      } else {
        setShopStocks((prev) => {
          const next = [...prev];
          updates.forEach(({ shopId, itemId, stock }) => {
            const parsed = Math.max(0, parseInt(stock, 10) || 0);
            const idx = next.findIndex(
              (ss) => ss.shop_id === shopId && ss.item_id === itemId
            );
            if (idx >= 0) {
              next[idx] = { ...next[idx], stock: parsed };
            } else {
              next.push({
                id: `ss-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                shop_id: shopId,
                item_id: itemId,
                stock: parsed
              });
            }
          });
          return next;
        });
      }

      const clearDrafts = (prev) => {
        const next = { ...prev };
        updates.forEach(({ shopId, itemId }) => {
          delete next[`${shopId}::${itemId}`];
        });
        return next;
      };
      if (draftTarget === 'alerts') {
        setAlertStockDrafts(clearDrafts);
      } else {
        setStockDrafts(clearDrafts);
      }

      showToast(
        `Updated stock for ${updates.length} ${updates.length === 1 ? 'item' : 'items'}!`
      );
    } catch (err) {
      showToast(`Failed to update category stock: ${err.message}`, 'error');
    }
  };

  // ============================================================================
  // SALES USER OPERATIONS (SHOP-SCOPED STOCK, CART EDIT, DELETE, CHECKOUT)
  // ============================================================================
  const shopCatalogItems = useMemo(() => {
    if (!activeShopId) return items;
    return items.map((it) => {
      const alloc = shopStocks.find((ss) => ss.shop_id === activeShopId && ss.item_id === it.id);
      return {
        ...it,
        stock: alloc ? Number(alloc.stock) : 0,
        shop_stock_id: alloc?.id || null
      };
    });
  }, [items, shopStocks, activeShopId]);

  const addToCart = (item) => {
    if (shops.length > 0 && !activeShopId) {
      showToast('Please select a Shop Sales Profile first.', 'error');
      return;
    }
    if (item.stock <= 0) {
      showToast(`"${item.name}" is out of stock in this shop!`, 'error');
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        if (existing.quantity + 1 > item.stock) {
          showToast(`Only ${item.stock} units of "${item.name}" available in this shop.`, 'error');
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
            showToast(`Max available stock (${c.item.stock}) reached in this shop.`, 'error');
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
          showToast(`Only ${c.item.stock} units available in this shop.`, 'error');
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

  const handleSplitCashChange = (val) => {
    setSplitCashAmount(val);
    if (val === '') {
      setSplitUpiAmount('');
      return;
    }
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= cartSubtotal) {
      setSplitUpiAmount(Math.max(0, cartSubtotal - parsed).toFixed(2));
    }
  };

  const handleSplitUpiChange = (val) => {
    setSplitUpiAmount(val);
    if (val === '') {
      setSplitCashAmount('');
      return;
    }
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= cartSubtotal) {
      setSplitCashAmount(Math.max(0, cartSubtotal - parsed).toFixed(2));
    }
  };

  // Generate Live Digital Bill (No Printing) & Deduct Active Shop's Stock
  const handleGenerateBill = async () => {
    if (cart.length === 0) return;

    const timestamp = new Date().toISOString();
    const billNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const totalAmount = cartSubtotal;
    const targetShopId = activeShopId || null;

    let finalPaymentMethod = paymentMethod;
    let cashAmount = paymentMethod === 'Cash' ? Number(totalAmount.toFixed(2)) : 0;
    let upiAmount = paymentMethod === 'UPI' ? Number(totalAmount.toFixed(2)) : 0;

    if (paymentMethod === 'Split') {
      const cashAmt = parseFloat(splitCashAmount);
      const upiAmt = parseFloat(splitUpiAmount);
      if (
        isNaN(cashAmt) ||
        isNaN(upiAmt) ||
        cashAmt <= 0 ||
        upiAmt <= 0 ||
        Math.abs(cashAmt + upiAmt - totalAmount) > 0.01
      ) {
        showToast(
          `Split amounts (Cash + UPI) must both be greater than ₹0 and equal ₹${totalAmount.toFixed(2)}.`,
          'error'
        );
        return;
      }
      finalPaymentMethod = 'Split';
      cashAmount = Number(cashAmt.toFixed(2));
      upiAmount = Number(upiAmt.toFixed(2));
    }

    const lineItemsPayload = cart.map((entry) => {
      const cat = categories.find((c) => c.id === entry.item.category_id);
      const subcat = subcategories.find((sc) => sc.id === entry.item.subcategory_id);
      return {
        item_id: entry.item.id,
        item_name: entry.item.name,
        category_name: cat ? cat.name : 'Uncategorized',
        subcategory_name: subcat ? subcat.name : '',
        image_url: entry.item.image_url || '',
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
            payment_method: finalPaymentMethod,
            cash_amount: cashAmount,
            upi_amount: upiAmount,
            shop_id: targetShopId,
            created_at: timestamp
          })
        });

        await supabase.request('bill_items', {
          method: 'POST',
          body: JSON.stringify(
            lineItemsPayload.map(({ image_url, ...dbFields }) => ({
              ...dbFields,
              bill_id: insertedBill.id,
              created_at: timestamp
            }))
          )
        });

        if (targetShopId) {
          await Promise.all(
            cart.map((entry) => {
              const alloc = shopStocks.find(
                (ss) => ss.shop_id === targetShopId && ss.item_id === entry.item.id
              );
              const nextQty = Math.max(0, (alloc ? Number(alloc.stock) : entry.item.stock) - entry.quantity);
              if (alloc) {
                return supabase.request(`shop_stocks?id=eq.${alloc.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    stock: nextQty,
                    updated_at: timestamp
                  })
                });
              }
              return supabase.request(`items?id=eq.${entry.item.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  stock: Math.max(0, entry.item.stock - entry.quantity),
                  updated_at: timestamp
                })
              });
            })
          );
        } else {
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
        }

        await syncFromSupabase(true);
        setLatestGeneratedBill({
          ...insertedBill,
          payment_method: finalPaymentMethod,
          cash_amount: cashAmount,
          upi_amount: upiAmount,
          shop_id: targetShopId,
          items: lineItemsPayload
        });
      } else {
        const newBill = {
          id: `bill-${Date.now()}`,
          bill_number: billNumber,
          total_amount: totalAmount,
          payment_method: finalPaymentMethod,
          cash_amount: cashAmount,
          upi_amount: upiAmount,
          shop_id: targetShopId,
          created_at: timestamp,
          items: lineItemsPayload
        };

        setBills((prev) => [newBill, ...prev]);
        if (targetShopId) {
          setShopStocks((prev) =>
            prev.map((ss) => {
              if (ss.shop_id !== targetShopId) return ss;
              const sold = cart.find((c) => c.item.id === ss.item_id);
              return sold ? { ...ss, stock: Math.max(0, ss.stock - sold.quantity) } : ss;
            })
          );
        } else {
          setItems((prevItems) =>
            prevItems.map((it) => {
              const sold = cart.find((c) => c.item.id === it.id);
              return sold ? { ...it, stock: Math.max(0, it.stock - sold.quantity) } : it;
            })
          );
        }
        setLatestGeneratedBill(newBill);
      }

      setCart([]);
      setSplitCashAmount('');
      setSplitUpiAmount('');
      const paymentSummary =
        finalPaymentMethod === 'Split'
          ? `Split (Cash: ₹${cashAmount.toFixed(2)}, UPI: ₹${upiAmount.toFixed(2)})`
          : finalPaymentMethod;
      showToast(
        `Live Bill ${billNumber} (${paymentSummary}) generated${
          currentActiveShop ? ` for ${currentActiveShop.name}` : ''
        } & stock updated!`
      );
    } catch (err) {
      showToast(`Failed to generate bill: ${err.message}`, 'error');
    }
  };

  // ============================================================================
  // SHARED CATALOG OPERATIONS (CATEGORY -> FLAVOUR -> TYPE / PRODUCT)
  // ============================================================================
  const handleNewItemImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file);
      setNewItemImageUrl(dataUrl);
      showToast('Product image uploaded & optimized!');
    } catch {
      showToast('Could not read selected image file.', 'error');
    }
  };

  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!newItemCategory) {
      showToast('Please create and select a category first.', 'error');
      return;
    }
    const price = parseFloat(newItemPrice);
    if (!newItemName.trim() || isNaN(price) || price < 0) {
      showToast('Please enter a valid product/type name and unit price.', 'error');
      return;
    }

    const validSubcatId =
      newItemSubcategory &&
      subcategories.some(
        (sc) => sc.id === newItemSubcategory && sc.category_id === newItemCategory
      )
        ? newItemSubcategory
        : null;

    try {
      if (isLiveSupabase) {
        await supabase.request('items', {
          method: 'POST',
          body: JSON.stringify({
            name: newItemName.trim(),
            category_id: newItemCategory,
            subcategory_id: validSubcatId,
            image_url: newItemImageUrl.trim(),
            price,
            stock: 0
          })
        });
        await syncFromSupabase(true);
      } else {
        const created = {
          id: `item-${Date.now()}`,
          name: newItemName.trim(),
          category_id: newItemCategory,
          subcategory_id: validSubcatId,
          image_url: newItemImageUrl.trim(),
          price,
          stock: 0
        };
        setItems((prev) => [...prev, created]);
      }

      setNewItemName('');
      setNewItemSubcategory('');
      setNewItemImageUrl('');
      setNewItemPrice('');
      showToast('New product/type added to shared catalog!');
    } catch (err) {
      showToast(`Error adding product: ${err.message}`, 'error');
    }
  };

  // Auto-resolve price when Category, Flavour, or Item - Type / Product changes
  const getMatchingCombinationPrice = (categoryId, subcategoryId, typeName) => {
    const cleanType = (typeName || '').trim().toLowerCase();
    const cleanSub = subcategoryId || '';
    if (!categoryId || !cleanType) return null;

    const exactMatch = items.find(
      (it) =>
        it.category_id === categoryId &&
        (it.subcategory_id || '') === cleanSub &&
        it.name.trim().toLowerCase() === cleanType
    );
    if (exactMatch) return Number(exactMatch.price);

    const categoryTypeMatch = items.find(
      (it) =>
        it.category_id === categoryId &&
        it.name.trim().toLowerCase() === cleanType
    );
    return categoryTypeMatch ? Number(categoryTypeMatch.price) : null;
  };

  useEffect(() => {
    const matchedPrice = getMatchingCombinationPrice(
      newItemCategory,
      newItemSubcategory,
      newItemName
    );
    if (matchedPrice !== null) {
      setNewItemPrice(String(matchedPrice));
    }
  }, [newItemCategory, newItemSubcategory, newItemName, items]);

  // Track which items already exist in generated bills so their category stays protected
  const billedItemIds = useMemo(() => {
    const ids = new Set();
    bills.forEach((bill) => {
      (bill.items || []).forEach((line) => {
        if (line.item_id) ids.add(line.item_id);
      });
    });
    return ids;
  }, [bills]);

  const handleUpdateCatalogItem = async (
    itemId,
    newPrice,
    newCategoryId,
    newSubcategoryId,
    newImageUrl,
    newTypeName
  ) => {
    const parsedPrice = Math.max(0, Number(newPrice) || 0);
    const targetItem = items.find((i) => i.id === itemId);
    const isItemBilled = billedItemIds.has(itemId);
    const finalCategoryId =
      isItemBilled && targetItem ? targetItem.category_id : newCategoryId || targetItem?.category_id;
    const cleanSubcatId =
      finalCategoryId === targetItem?.category_id ? newSubcategoryId || null : null;
    const cleanTypeName = (newTypeName ?? targetItem?.name ?? '').trim() || targetItem?.name;

    if (isItemBilled && newCategoryId && targetItem && newCategoryId !== targetItem.category_id) {
      showToast('Category cannot be changed for billed items. Only price/name can be updated.', 'error');
      return;
    }

    try {
      if (isLiveSupabase) {
        await supabase.request(`items?id=eq.${itemId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: cleanTypeName,
            price: parsedPrice,
            category_id: finalCategoryId,
            subcategory_id: cleanSubcatId,
            image_url: newImageUrl ?? '',
            updated_at: new Date().toISOString()
          })
        });
        await syncFromSupabase(true);
      } else {
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  name: cleanTypeName,
                  price: parsedPrice,
                  category_id: finalCategoryId,
                  subcategory_id: cleanSubcatId,
                  image_url: newImageUrl ?? it.image_url
                }
              : it
          )
        );
      }
      showToast('Price & category updated successfully!');
    } catch (err) {
      showToast(`Update failed: ${err.message}`, 'error');
    }
  };

  // Delete a single Item (Type / Product) if it is not referenced in any generated bill
  const handleDeleteCatalogItem = async (item) => {
    if (!item?.id) return;
    if (billedItemIds.has(item.id)) {
      showToast(`Cannot delete "${item.name}" because it already exists in generated bills.`, 'error');
      return;
    }

    try {
      if (isLiveSupabase) {
        await supabase.request(`shop_stocks?item_id=eq.${item.id}`, {
          method: 'DELETE'
        });
        await supabase.request(`items?id=eq.${item.id}`, {
          method: 'DELETE'
        });
        await syncFromSupabase(true);
      } else {
        setShopStocks((prev) => prev.filter((ss) => ss.item_id !== item.id));
        setItems((prev) => prev.filter((it) => it.id !== item.id));
      }
      setCart((prev) => prev.filter((c) => c.item.id !== item.id));
      showToast(`Item "${item.name}" deleted.`);
    } catch (err) {
      showToast(`Failed to delete item: ${err.message}`, 'error');
    }
  };

  // Delete a Sub-Category (Flavour / Item) and its unbilled items if none are billed
  const handleDeleteSubcategoryGroup = async (category, subcategory) => {
    if (!subcategory?.id) return;
    const subItems = items.filter((it) => String(it.subcategory_id) === String(subcategory.id));
    const hasBilledSubItem =
      subItems.some((it) => billedItemIds.has(it.id)) ||
      bills.some((bill) =>
        (bill.items || []).some(
          (line) =>
            (line.subcategory_name || '').trim().toLowerCase() ===
              subcategory.name.trim().toLowerCase() &&
            (!category ||
              (line.category_name || '').trim().toLowerCase() === category.name.trim().toLowerCase())
        )
      );

    if (hasBilledSubItem) {
      showToast(
        `Cannot delete "${subcategory.name}" because items under it already appear in generated bills.`,
        'error'
      );
      return;
    }

    try {
      const subItemIds = subItems.map((it) => it.id);
      if (isLiveSupabase) {
        if (subItemIds.length > 0) {
          const inFilter = `(${subItemIds.map((id) => `"${id}"`).join(',')})`;
          await supabase.request(`shop_stocks?item_id=in.${encodeURIComponent(inFilter)}`, {
            method: 'DELETE'
          });
          await supabase.request(`items?id=in.${encodeURIComponent(inFilter)}`, {
            method: 'DELETE'
          });
        }
        await supabase.request(`subcategories?id=eq.${subcategory.id}`, {
          method: 'DELETE'
        });
        await syncFromSupabase(true);
      } else {
        setShopStocks((prev) => prev.filter((ss) => !subItemIds.includes(ss.item_id)));
        setItems((prev) => prev.filter((it) => !subItemIds.includes(it.id)));
        setSubcategories((prev) => prev.filter((sc) => sc.id !== subcategory.id));
      }
      setCart((prev) => prev.filter((c) => !subItemIds.includes(c.item.id)));
      if (selectedSubcategoryFilter === subcategory.id) {
        setSelectedSubcategoryFilter('ALL');
      }
      showToast(`Sub-category "${subcategory.name}" deleted.`);
    } catch (err) {
      showToast(`Failed to delete sub-category: ${err.message}`, 'error');
    }
  };

  // Delete a Category and its subcategories/unbilled items if no billed items belong to it
  const handleDeleteCategoryGroup = async (category) => {
    if (!category?.id) return;
    const catItems = items.filter((it) => String(it.category_id) === String(category.id));
    const hasBilledCatItem =
      catItems.some((it) => billedItemIds.has(it.id)) ||
      bills.some((bill) =>
        (bill.items || []).some(
          (line) =>
            (line.category_name || '').trim().toLowerCase() === category.name.trim().toLowerCase()
        )
      );

    if (hasBilledCatItem) {
      showToast(
        `Cannot delete category "${category.name}" because it has items in generated bills.`,
        'error'
      );
      return;
    }

    try {
      const catItemIds = catItems.map((it) => it.id);
      if (isLiveSupabase) {
        if (catItemIds.length > 0) {
          const inFilter = `(${catItemIds.map((id) => `"${id}"`).join(',')})`;
          await supabase.request(`shop_stocks?item_id=in.${encodeURIComponent(inFilter)}`, {
            method: 'DELETE'
          });
        }
        await supabase.request(`items?category_id=eq.${category.id}`, {
          method: 'DELETE'
        });
        await supabase.request(`subcategories?category_id=eq.${category.id}`, {
          method: 'DELETE'
        });
        await supabase.request(`categories?id=eq.${category.id}`, {
          method: 'DELETE'
        });
        await syncFromSupabase(true);
      } else {
        setShopStocks((prev) => prev.filter((ss) => !catItemIds.includes(ss.item_id)));
        setItems((prev) => prev.filter((it) => String(it.category_id) !== String(category.id)));
        setSubcategories((prev) =>
          prev.filter((sc) => String(sc.category_id) !== String(category.id))
        );
        setCategories((prev) => prev.filter((c) => String(c.id) !== String(category.id)));
      }
      setCart((prev) => prev.filter((c) => String(c.item.category_id) !== String(category.id)));
      if (selectedCategoryFilter === category.id) {
        setSelectedCategoryFilter('ALL');
        setSelectedSubcategoryFilter('ALL');
      }
      showToast(`Category "${category.name}" deleted.`);
    } catch (err) {
      showToast(`Failed to delete category: ${err.message}`, 'error');
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      showToast('Enter a valid category name.', 'error');
      return;
    }

    try {
      if (isLiveSupabase) {
        await supabase.request('categories', {
          method: 'POST',
          body: JSON.stringify({
            name: newCategoryName.trim(),
            expense_percentage: 0
          })
        });
        await syncFromSupabase(true);
      } else {
        const created = {
          id: `cat-${Date.now()}`,
          name: newCategoryName.trim(),
          expense_percentage: 0
        };
        setCategories((prev) => [...prev, created]);
        if (!newItemCategory) setNewItemCategory(created.id);
      }
      setNewCategoryName('');
      showToast('Shared category created! Now set shop-wise expense % or add sub-categories.');
    } catch (err) {
      showToast(`Error creating category: ${err.message}`, 'error');
    }
  };

  const handleSaveShopCategoryExpense = async (e) => {
    e.preventDefault();
    if (!expenseConfigShopId || !expenseConfigCategoryId) {
      showToast('Select both a Shop and a Category.', 'error');
      return;
    }
    const expPct = parseFloat(expenseConfigRate);
    if (isNaN(expPct) || expPct < 0 || expPct > 100) {
      showToast('Enter a valid expense percentage between 0 and 100.', 'error');
      return;
    }
    await handleUpdateCategoryExpense(expenseConfigCategoryId, expPct, expenseConfigShopId);
  };

  const handleAddSubcategory = async (e) => {
    e.preventDefault();
    const cleanSub = newSubcategoryName.trim();
    if (!newSubcategoryParentId || !cleanSub) {
      showToast('Select a parent category and enter a sub-category name.', 'error');
      return;
    }

    if (
      subcategories.some(
        (sc) =>
          sc.category_id === newSubcategoryParentId &&
          sc.name.toLowerCase() === cleanSub.toLowerCase()
      )
    ) {
      showToast(`Sub-category "${cleanSub}" already exists under this category.`, 'error');
      return;
    }

    try {
      if (isLiveSupabase) {
        await supabase.request('subcategories', {
          method: 'POST',
          body: JSON.stringify({
            category_id: newSubcategoryParentId,
            name: cleanSub
          })
        });
        await syncFromSupabase(true);
      } else {
        setSubcategories((prev) => [
          ...prev,
          {
            id: `subcat-${Date.now()}`,
            category_id: newSubcategoryParentId,
            name: cleanSub
          }
        ]);
      }
      setNewSubcategoryName('');
      showToast(`Flavour / Item "${cleanSub}" added!`);
    } catch (err) {
      showToast(`Error creating flavour / item: ${err.message}`, 'error');
    }
  };

  const handleUpdateCategoryExpense = async (categoryId, newPercentage, targetShopId = 'DEFAULT') => {
    const clamped = Math.min(100, Math.max(0, Number(newPercentage) || 0));
    try {
      if (targetShopId && targetShopId !== 'ALL' && targetShopId !== 'DEFAULT') {
        const existingOverride = shopCategoryExpenses.find(
          (sce) => sce.shop_id === targetShopId && sce.category_id === categoryId
        );
        if (isLiveSupabase) {
          if (existingOverride) {
            await supabase.request(`shop_category_expenses?id=eq.${existingOverride.id}`, {
              method: 'PATCH',
              body: JSON.stringify({
                expense_percentage: clamped,
                updated_at: new Date().toISOString()
              })
            });
          } else {
            await supabase.request('shop_category_expenses', {
              method: 'POST',
              body: JSON.stringify({
                shop_id: targetShopId,
                category_id: categoryId,
                expense_percentage: clamped
              })
            });
          }
          await syncFromSupabase(true);
        } else {
          if (existingOverride) {
            setShopCategoryExpenses((prev) =>
              prev.map((sce) =>
                sce.id === existingOverride.id ? { ...sce, expense_percentage: clamped } : sce
              )
            );
          } else {
            setShopCategoryExpenses((prev) => [
              ...prev,
              {
                id: `sce-${Date.now()}`,
                shop_id: targetShopId,
                category_id: categoryId,
                expense_percentage: clamped
              }
            ]);
          }
        }
        const shopName = shops.find((s) => s.id === targetShopId)?.name || 'Shop';
        showToast(`Expense % updated for ${shopName}!`);
      } else {
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
        showToast('Default category expense percentage updated!');
      }
    } catch (err) {
      showToast(`Failed to update expense %: ${err.message}`, 'error');
    }
  };

  // Helper to resolve effective expense % for a given category and optional shop
  const getCategoryExpenseRate = (categoryId, categoryName, shopId = null) => {
    const catObj =
      categories.find((c) => c.id === categoryId) ||
      categories.find((c) => c.name.toLowerCase() === (categoryName || '').toLowerCase());
    if (!catObj) return 0;
    if (shopId && shopId !== 'ALL' && shopId !== 'DEFAULT') {
      const override = shopCategoryExpenses.find(
        (sce) => sce.shop_id === shopId && sce.category_id === catObj.id
      );
      if (override !== undefined) return Number(override.expense_percentage) || 0;
    }
    return Number(catObj.expense_percentage) || 0;
  };

  // ============================================================================
  // DAILY & WEEKLY CATEGORY-WISE & SHOP-WISE SALES + STOCK ANALYTICS
  // ============================================================================
  const getBillPaymentAmounts = (bill) => {
    const total = Number(bill.total_amount) || 0;
    const cash = Number(bill.cash_amount) || 0;
    const upi = Number(bill.upi_amount) || 0;
    if (cash > 0 || upi > 0) return { cash, upi };
    if ((bill.payment_method || 'Cash') === 'UPI') return { cash: 0, upi: total };
    return { cash: total, upi: 0 };
  };

  const effectiveAnalyticsShopId = isShopAdmin
    ? currentLoggedInUser?.shop_id
    : adminSelectedShopFilter;

  const isAllShopsAnalyticsSelected = isSuperAdmin && effectiveAnalyticsShopId === 'ALL';

  const analyticsData = useMemo(() => {
    const baseDate = analyticsDate
      ? (() => {
          const [y, m, d] = analyticsDate.split('-').map(Number);
          return new Date(y, m - 1, d);
        })()
      : new Date();
    const startOfSelectedDay = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate()
    );
    const endOfSelectedDay = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate() + 1
    );
    const sevenDaysStart = new Date(startOfSelectedDay);
    sevenDaysStart.setDate(startOfSelectedDay.getDate() - 6);

    const isBillInSelectedRange = (createdAt) => {
      const billDate = new Date(createdAt);
      if (salesReportPeriod === 'daily') {
        return billDate >= startOfSelectedDay && billDate < endOfSelectedDay;
      }
      return billDate >= sevenDaysStart && billDate < endOfSelectedDay;
    };

    const filteredBills = bills.filter((bill) => {
      const matchesDate = isBillInSelectedRange(bill.created_at);
      if (!matchesDate) return false;
      if (isShopAdmin) {
        return bill.shop_id === currentLoggedInUser?.shop_id;
      }
      if (effectiveAnalyticsShopId && effectiveAnalyticsShopId !== 'ALL') {
        return bill.shop_id === effectiveAnalyticsShopId;
      }
      return true;
    });

    const categoryStatsMap = {};
    categories.forEach((cat) => {
      const effectiveRate = getCategoryExpenseRate(cat.id, cat.name, effectiveAnalyticsShopId);
      categoryStatsMap[cat.name] = {
        categoryId: cat.id,
        categoryName: cat.name,
        expensePercentage: effectiveRate,
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
        const lineSub = Number(line.subtotal) || 0;
        const lineRate = getCategoryExpenseRate(
          categoryStatsMap[catName].categoryId,
          catName,
          effectiveAnalyticsShopId !== 'ALL' ? effectiveAnalyticsShopId : bill.shop_id
        );
        categoryStatsMap[catName].totalSales += lineSub;
        categoryStatsMap[catName].unitsSold += Number(line.quantity) || 0;
        categoryStatsMap[catName].expenseAmount += (lineSub * lineRate) / 100;
      });
    });

    const categoryRows = Object.values(categoryStatsMap).map((row) => {
      const effectivePct =
        effectiveAnalyticsShopId === 'ALL' && row.totalSales > 0
          ? Number(((row.expenseAmount / row.totalSales) * 100).toFixed(2))
          : row.expensePercentage;
      return {
        ...row,
        expensePercentage: effectivePct,
        netAfterExpense: row.totalSales - row.expenseAmount
      };
    });

    const visibleShopsList = isShopAdmin
      ? shops.filter((s) => s.id === currentLoggedInUser?.shop_id)
      : shops;

    const shopRows = visibleShopsList.map((shop) => {
      const shopPeriodBills = bills.filter((b) => {
        const matchesDate = isBillInSelectedRange(b.created_at);
        return matchesDate && b.shop_id === shop.id;
      });
      const totalSales = shopPeriodBills.reduce(
        (s, b) => s + (Number(b.total_amount) || 0),
        0
      );
      const cashSales = shopPeriodBills.reduce(
        (s, b) => s + getBillPaymentAmounts(b).cash,
        0
      );
      const upiSales = shopPeriodBills.reduce(
        (s, b) => s + getBillPaymentAmounts(b).upi,
        0
      );
      const totalStockUnits = shopStocks
        .filter((ss) => ss.shop_id === shop.id)
        .reduce((s, ss) => s + (Number(ss.stock) || 0), 0);

      return {
        shopId: shop.id,
        shopName: shop.name,
        salesProfileName: shop.sales_profile_name,
        location: shop.location,
        billCount: shopPeriodBills.length,
        totalSales,
        cashSales,
        upiSales,
        totalStockUnits
      };
    });

    const totalCashSales = filteredBills.reduce(
      (s, b) => s + getBillPaymentAmounts(b).cash,
      0
    );
    const totalUpiSales = filteredBills.reduce(
      (s, b) => s + getBillPaymentAmounts(b).upi,
      0
    );
    const allShopsCombinedSales = shopRows.reduce((s, r) => s + r.totalSales, 0);
    const allShopsCombinedCash = shopRows.reduce((s, r) => s + r.cashSales, 0);
    const allShopsCombinedUpi = shopRows.reduce((s, r) => s + r.upiSales, 0);
    const grandTotalSales = categoryRows.reduce((s, r) => s + r.totalSales, 0);
    const grandTotalExpense = categoryRows.reduce((s, r) => s + r.expenseAmount, 0);
    const totalAllShopsStock = shopStocks.reduce(
      (s, ss) => s + (Number(ss.stock) || 0),
      0
    );

    return {
      filteredBills,
      categoryRows,
      shopRows,
      allShopsCombinedSales,
      allShopsCombinedCash,
      allShopsCombinedUpi,
      totalCashSales,
      totalUpiSales,
      grandTotalSales,
      grandTotalExpense,
      grandNetRevenue: grandTotalSales - grandTotalExpense,
      totalAllShopsStock
    };
  }, [
    bills,
    categories,
    shops,
    shopStocks,
    shopCategoryExpenses,
    salesReportPeriod,
    analyticsDate,
    effectiveAnalyticsShopId,
    isShopAdmin,
    currentLoggedInUser
  ]);

  // Distinct in-stock Categories for Sales POS filter bar
  const distinctInStockPosCategories = useMemo(() => {
    const seen = new Set();
    return categories.filter((cat) => {
      const hasStock = shopCatalogItems.some(
        (it) => it.category_id === cat.id && Number(it.stock) > 0
      );
      if (!hasStock) return false;
      const key = cat.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [categories, shopCatalogItems]);

  // Distinct in-stock Sub-Categories (Flavours / Items) for currently selected Category filter in POS
  const activePosSubcategories = useMemo(() => {
    if (selectedCategoryFilter === 'ALL') return [];
    const seen = new Set();
    return subcategories.filter((sc) => {
      if (sc.category_id !== selectedCategoryFilter) return false;
      const hasStock = shopCatalogItems.some(
        (it) =>
          it.category_id === selectedCategoryFilter &&
          it.subcategory_id === sc.id &&
          Number(it.stock) > 0
      );
      if (!hasStock) return false;
      const key = sc.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [subcategories, selectedCategoryFilter, shopCatalogItems]);

  // Reset POS category/subcategory filter if all items in that selection sell out
  useEffect(() => {
    if (
      selectedCategoryFilter !== 'ALL' &&
      !distinctInStockPosCategories.some((c) => c.id === selectedCategoryFilter)
    ) {
      setSelectedCategoryFilter('ALL');
      setSelectedSubcategoryFilter('ALL');
    } else if (
      selectedSubcategoryFilter !== 'ALL' &&
      !activePosSubcategories.some((sc) => sc.id === selectedSubcategoryFilter)
    ) {
      setSelectedSubcategoryFilter('ALL');
    }
  }, [
    distinctInStockPosCategories,
    activePosSubcategories,
    selectedCategoryFilter,
    selectedSubcategoryFilter
  ]);

  // Filtered IN-STOCK items only for Sales POS grid & search
  const visiblePosItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return shopCatalogItems.filter((it) => {
      if (Number(it.stock) <= 0) return false;
      const matchesCat =
        selectedCategoryFilter === 'ALL' || it.category_id === selectedCategoryFilter;
      const matchesSubcat =
        selectedSubcategoryFilter === 'ALL' || it.subcategory_id === selectedSubcategoryFilter;
      const subcatName =
        subcategories.find((sc) => sc.id === it.subcategory_id)?.name.toLowerCase() || '';
      const matchesSearch =
        !q || it.name.toLowerCase().includes(q) || subcatName.includes(q);
      return matchesCat && matchesSubcat && matchesSearch;
    });
  }, [
    shopCatalogItems,
    subcategories,
    selectedCategoryFilter,
    selectedSubcategoryFilter,
    searchQuery
  ]);

  // Aggregate in-stock counts by item type name for the selected category/flavour in POS
  const aggregatedPosTypeCounts = useMemo(() => {
    const map = new Map();
    visiblePosItems.forEach((it) => {
      const displayName = (it.name || '').trim();
      const key = displayName.toLowerCase();
      if (!key) return;
      const existing = map.get(key);
      if (existing) {
        existing.stock += Number(it.stock) || 0;
      } else {
        map.set(key, { name: displayName, stock: Number(it.stock) || 0 });
      }
    });
    return Array.from(map.values());
  }, [visiblePosItems]);

  // Stock Alerts Data (Out of Stock & Out of Stock Soon — Grouped by Category & Flavour)
  const stockAlertsData = useMemo(() => {
    const threshold = Math.max(1, parseInt(lowStockThreshold, 10) || 5);
    const targetShops = isShopAdmin
      ? shops.filter((s) => s.id === currentLoggedInUser?.shop_id)
      : shops;

    const allAlerts = [];

    if (targetShops.length > 0) {
      targetShops.forEach((shop) => {
        items.forEach((item) => {
          const alloc = shopStocks.find(
            (ss) => ss.shop_id === shop.id && ss.item_id === item.id
          );
          const stock = alloc ? Number(alloc.stock) : 0;
          if (stock <= threshold) {
            const cat = categories.find((c) => c.id === item.category_id);
            const subcat = subcategories.find((sc) => sc.id === item.subcategory_id);
            allAlerts.push({
              key: `${shop.id}-${item.id}`,
              shopId: shop.id,
              shopName: shop.name,
              categoryName: cat ? cat.name : 'Uncategorized',
              flavourName: subcat ? subcat.name : item.name,
              item,
              stock,
              status: stock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK'
            });
          }
        });
      });
    } else {
      items.forEach((item) => {
        const stock = Number(item.stock) || 0;
        if (stock <= threshold) {
          const cat = categories.find((c) => c.id === item.category_id);
          const subcat = subcategories.find((sc) => sc.id === item.subcategory_id);
          allAlerts.push({
            key: `default-${item.id}`,
            shopId: null,
            shopName: 'Default Shop',
            categoryName: cat ? cat.name : 'Uncategorized',
            flavourName: subcat ? subcat.name : item.name,
            item,
            stock,
            status: stock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK'
          });
        }
      });
    }

    const shopScopedAlerts =
      isSuperAdmin && stockAlertShopFilter !== 'ALL'
        ? allAlerts.filter((a) => a.shopId === stockAlertShopFilter)
        : allAlerts;

    const outOfStockCount = shopScopedAlerts.filter((a) => a.status === 'OUT_OF_STOCK').length;
    const lowStockCount = shopScopedAlerts.filter((a) => a.status === 'LOW_STOCK').length;

    const q = stockAlertSearchQuery.trim().toLowerCase();
    const filteredAlerts = shopScopedAlerts.filter((a) => {
      if (stockAlertStatusFilter !== 'ALL' && a.status !== stockAlertStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        a.item.name.toLowerCase().includes(q) ||
        a.flavourName.toLowerCase().includes(q) ||
        a.categoryName.toLowerCase().includes(q) ||
        a.shopName.toLowerCase().includes(q)
      );
    });

    const catMap = new Map();
    filteredAlerts.forEach((entry) => {
      if (!catMap.has(entry.categoryName)) {
        catMap.set(entry.categoryName, {
          categoryName: entry.categoryName,
          entries: [],
          outOfStockCount: 0,
          lowStockCount: 0,
          flavourMap: new Map()
        });
      }
      const group = catMap.get(entry.categoryName);
      group.entries.push(entry);
      if (entry.status === 'OUT_OF_STOCK') group.outOfStockCount += 1;
      else group.lowStockCount += 1;

      const fgKey = `${entry.shopId || 'default'}-${entry.flavourName.toLowerCase()}`;
      if (!group.flavourMap.has(fgKey)) {
        group.flavourMap.set(fgKey, {
          key: fgKey,
          shopId: entry.shopId,
          shopName: entry.shopName,
          flavourName: entry.flavourName,
          entries: []
        });
      }
      group.flavourMap.get(fgKey).entries.push(entry);
    });

    const groupedByCategory = Array.from(catMap.values())
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName))
      .map(({ flavourMap, ...rest }) => ({
        ...rest,
        flavourGroups: Array.from(flavourMap.values()).sort((a, b) => {
          const shopCmp = a.shopName.localeCompare(b.shopName);
          return shopCmp !== 0 ? shopCmp : a.flavourName.localeCompare(b.flavourName);
        })
      }));

    return {
      threshold,
      allAlerts,
      outOfStockCount,
      lowStockCount,
      groupedByCategory
    };
  }, [
    items,
    shops,
    shopStocks,
    categories,
    subcategories,
    lowStockThreshold,
    isShopAdmin,
    isSuperAdmin,
    currentLoggedInUser,
    stockAlertShopFilter,
    stockAlertStatusFilter,
    stockAlertSearchQuery
  ]);

  // Distinct filters + Date Picker for Dedicated Generated Bills Tab
  const visibleLedgerBills = useMemo(() => {
    const query = billSearchQuery.trim().toLowerCase();
    return bills.filter((bill) => {
      // Role scope
      if (isShopAdmin && bill.shop_id !== currentLoggedInUser?.shop_id) {
        return false;
      }
      if (isSuperAdmin && billShopFilter !== 'ALL' && bill.shop_id !== billShopFilter) {
        return false;
      }

      // Selected Date Filter (YYYY-MM-DD in local time)
      if (billDateFilter) {
        const bDate = new Date(bill.created_at);
        const yyyy = bDate.getFullYear();
        const mm = String(bDate.getMonth() + 1).padStart(2, '0');
        const dd = String(bDate.getDate()).padStart(2, '0');
        const localDateStr = `${yyyy}-${mm}-${dd}`;
        if (localDateStr !== billDateFilter) return false;
      }

      // Payment Mode Filter
      if (billPaymentFilter !== 'ALL') {
        const billMode = bill.payment_method || 'Cash';
        if (billPaymentFilter === 'Split') {
          if (!billMode.startsWith('Split')) return false;
        } else if (billMode !== billPaymentFilter) {
          return false;
        }
      }

      if (!query) return true;

      const matchesBillNo = (bill.bill_number || '').toLowerCase().includes(query);
      const matchesLineItems = (bill.items || []).some(
        (line) =>
          (line.item_name || '').toLowerCase().includes(query) ||
          (line.subcategory_name || '').toLowerCase().includes(query) ||
          (line.category_name || '').toLowerCase().includes(query)
      );
      return matchesBillNo || matchesLineItems;
    });
  }, [
    bills,
    billDateFilter,
    billSearchQuery,
    billPaymentFilter,
    billShopFilter,
    isSuperAdmin,
    isShopAdmin,
    currentLoggedInUser
  ]);

  const ledgerPaymentTotals = useMemo(() => {
    return visibleLedgerBills.reduce(
      (acc, bill) => {
        const { cash, upi } = getBillPaymentAmounts(bill);
        acc.total += Number(bill.total_amount) || 0;
        acc.cash += cash;
        acc.upi += upi;
        return acc;
      },
      { total: 0, cash: 0, upi: 0 }
    );
  }, [visibleLedgerBills]);

  // ============================================================================
  // FULL-SCREEN LOGIN GATE (FIRST PAGE BEFORE BILLING OR DASHBOARD)
  // ============================================================================
  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] text-slate-900 font-sans flex flex-col justify-center items-center p-4 selection:bg-purple-500/20">
        {toast && (
          <div
            className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md max-w-md transition-all ${
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

        <div className="w-full max-w-md bg-white border border-purple-200/80 rounded-3xl shadow-xl shadow-purple-950/5 p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto overflow-hidden">
              {!logoLoadFailed ? (
                <img
                  src="/logo.png"
                  alt="Olive Cakes Logo"
                  onError={() => setLogoLoadFailed(true)}
                  className="w-full h-full object-contain rounded-full"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-purple-700 text-white flex items-center justify-center text-2xl font-extrabold">
                  OC
                </div>
              )}
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-purple-950">
              OLIVE CAKES POS
            </h1>
            <p className="text-xs text-slate-500">
              Sign in with your Username & Password to access the POS system.
            </p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            {loginError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="Enter your username"
                value={loginUserInput}
                onChange={(e) => setLoginUserInput(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={loginPassInput}
                onChange={(e) => setLoginPassInput(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 disabled:opacity-60 text-white font-bold text-sm shadow-md shadow-purple-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{isLoggingIn ? 'Signing In...' : 'Sign In to POS'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-900 font-sans selection:bg-purple-500/20">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-md max-w-md transition-all ${
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
          {/* Brand Logo & Active Shop Sales Profile */}
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-bold text-base sm:text-lg tracking-tight text-purple-950 flex items-center gap-2">
                OLIVE CAKES POS
                {currentActiveShop && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                    <Store className="w-3 h-3" />
                    {currentActiveShop.name} • {currentActiveShop.sales_profile_name}
                  </span>
                )}
              </h1>
            </div>
          </div>

          {/* Role Switcher */}
          <div className="flex items-center gap-2 sm:gap-3">
            {isSuperAdmin && shops.length > 0 && activeRole === 'sales' && (
              <div className="hidden md:flex items-center gap-1.5 bg-[#FAF8F5] border border-purple-200 rounded-xl px-2.5 py-1.5">
                <Store className="w-3.5 h-3.5 text-purple-600" />
                <select
                  value={activeShopId}
                  onChange={(e) => {
                    setActiveShopId(e.target.value);
                    setCart([]);
                  }}
                  className="bg-transparent text-xs font-semibold text-purple-950 focus:outline-none"
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.sales_profile_name})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(isSuperAdmin || isShopAdmin) && (
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
                  <span>{isShopAdmin ? 'Shop Dashboard' : 'Admin Panel'}</span>
                </button>
              </div>
            )}

            <button
              onClick={handleAdminLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs sm:text-sm font-semibold border border-rose-200 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout ({currentLoggedInUser?.username})</span>
            </button>
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                isLiveSupabase ? 'bg-purple-600 animate-pulse' : 'bg-amber-500'
              }`}
            />
          </div>
        </div>
      </header>

      {/* ========================================================================
          ROLE 1: SALES USER TERMINAL (IN-STOCK ITEMS ONLY + DISTINCT FILTERS)
      ======================================================================== */}
      {activeRole === 'sales' && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Mobile & Tablet Top-Right Cart Toggle Button */}
          <div className="sticky top-[4.5rem] z-30 flex justify-end lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileCartOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white shadow-lg shadow-purple-700/25 text-xs sm:text-sm font-bold transition-all cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Cart</span>
              <span className="px-2 py-0.5 rounded-full bg-white text-purple-800 text-xs font-extrabold">
                {cart.reduce((s, c) => s + c.quantity, 0)}
              </span>
              {cart.length > 0 && (
                <span className="border-l border-purple-400/60 pl-2 font-extrabold">
                  ₹{cartSubtotal.toFixed(2)}
                </span>
              )}
            </button>
          </div>

          {/* Mobile & Tablet Backdrop when Top-Right Cart is Open */}
          {isMobileCartOpen && (
            <div
              onClick={() => setIsMobileCartOpen(false)}
              className="fixed inset-0 z-30 bg-slate-900/25 backdrop-blur-[1px] lg:hidden"
            />
          )}

          {/* Left Column: Product Catalog */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            {/* Active Shop Sales Profile Banner */}
            {shops.length > 0 && (
              <div className="bg-white border border-purple-200 shadow-xs rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-purple-950">
                      Active Shop: {currentActiveShop?.name || 'Select Shop'}
                    </p>
                  </div>
                </div>

                {isSuperAdmin && (
                  <select
                    value={activeShopId}
                    onChange={(e) => {
                      setActiveShopId(e.target.value);
                      setCart([]);
                    }}
                    className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                  >
                    {shops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — Profile: {s.sales_profile_name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Search, Distinct Category & Distinct Sub-Category Filter Bar */}
            <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search in-stock flavours or items to add to bill..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500 focus:bg-white transition-colors"
                  />

                  {/* Instant Search Results Dropdown (In-Stock Items Only with Small Images) */}
                  {searchQuery.trim().length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-white border border-purple-200 rounded-xl shadow-xl max-h-72 overflow-y-auto divide-y divide-purple-50">
                      {visiblePosItems.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-400 text-center">
                          No matching in-stock items found for "{searchQuery}"
                        </div>
                      ) : (
                        visiblePosItems.slice(0, 8).map((item) => {
                          const cat = categories.find((c) => c.id === item.category_id);
                          const subcat = subcategories.find((sc) => sc.id === item.subcategory_id);
                          return (
                            <button
                              key={`search-${item.id}`}
                              type="button"
                              onClick={() => {
                                addToCart(item);
                                setSearchQuery('');
                              }}
                              className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-purple-50 cursor-pointer"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {item.image_url ? (
                                  <img
                                    src={item.image_url}
                                    alt={item.name}
                                    className="w-11 h-11 rounded-full object-cover border border-purple-200 shrink-0"
                                  />
                                ) : (
                                  <div className="w-11 h-11 rounded-full bg-purple-100/70 text-purple-600 flex items-center justify-center shrink-0">
                                    <Package className="w-5 h-5" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-900 truncate">
                                    {item.name}
                                  </p>
                                  <p className="text-xs text-slate-500 truncate">
                                    {cat?.name || 'General'}
                                    {subcat ? ` • ${subcat.name}` : ''} •{' '}
                                    <span className="text-purple-700 font-semibold">
                                      {item.stock} left
                                    </span>
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2.5 shrink-0">
                                <span className="text-sm font-bold text-purple-950">
                                  ₹{Number(item.price).toFixed(2)}
                                </span>
                                <span className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-xs font-semibold">
                                  + Add
                                </span>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                {/* Distinct Categories Filter */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => {
                      setSelectedCategoryFilter('ALL');
                      setSelectedSubcategoryFilter('ALL');
                    }}
                    className={`px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedCategoryFilter === 'ALL'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                    }`}
                  >
                    All Categories
                  </button>
                  {distinctInStockPosCategories.map((cat) => {
                    const catTotalCount = shopCatalogItems
                      .filter((it) => it.category_id === cat.id && Number(it.stock) > 0)
                      .reduce((sum, it) => sum + (Number(it.stock) || 0), 0);
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setSelectedCategoryFilter(cat.id);
                          setSelectedSubcategoryFilter('ALL');
                        }}
                        className={`px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                          selectedCategoryFilter === cat.id
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                        }`}
                      >
                        {cat.name} ({catTotalCount})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Distinct Flavour / Item Filter Row */}
              {activePosSubcategories.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pt-2.5 border-t border-purple-50">
                  <span className="text-xs font-semibold text-slate-500 mr-1">
                    Flavours / Items:
                  </span>
                  <button
                    onClick={() => setSelectedSubcategoryFilter('ALL')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      selectedSubcategoryFilter === 'ALL'
                        ? 'bg-purple-100 text-purple-900 border border-purple-300'
                        : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900'
                    }`}
                  >
                    All
                  </button>
                  {activePosSubcategories.map((sc) => {
                    const flavourTotalCount = shopCatalogItems
                      .filter(
                        (it) =>
                          it.category_id === selectedCategoryFilter &&
                          it.subcategory_id === sc.id &&
                          Number(it.stock) > 0
                      )
                      .reduce((sum, it) => sum + (Number(it.stock) || 0), 0);
                    return (
                      <button
                        key={sc.id}
                        onClick={() => setSelectedSubcategoryFilter(sc.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                          selectedSubcategoryFilter === sc.id
                            ? 'bg-purple-100 text-purple-900 border border-purple-300'
                            : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900'
                        }`}
                      >
                        {sc.name} ({flavourTotalCount})
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Category -> Flavour -> Type Live Product Count Summary Strip */}
              {selectedCategoryFilter !== 'ALL' && aggregatedPosTypeCounts.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-2.5 border-t border-purple-50 text-xs">
                  <span className="font-semibold text-purple-900">
                    {categories.find((c) => c.id === selectedCategoryFilter)?.name}
                    {selectedSubcategoryFilter !== 'ALL'
                      ? ` → ${subcategories.find((s) => s.id === selectedSubcategoryFilter)?.name}`
                      : ''}{' '}
                    :
                  </span>
                  {aggregatedPosTypeCounts.map((typeGroup) => (
                    <span
                      key={typeGroup.name}
                      className="px-2.5 py-0.5 rounded-md font-semibold border bg-purple-50 border-purple-200 text-purple-900"
                    >
                      {typeGroup.name} ({typeGroup.stock})
                    </span>
                  ))}
                  <span className="px-2.5 py-0.5 rounded-md font-bold bg-purple-700 text-white">
                    Total ({aggregatedPosTypeCounts.reduce((sum, tg) => sum + tg.stock, 0)})
                  </span>
                </div>
              )}
            </div>

            {/* Product Grid (User-Friendly Compact Cards with Round Image Inside Container) */}
            {visiblePosItems.length === 0 ? (
              <div className="bg-white border border-dashed border-purple-200 rounded-2xl p-10 text-center">
                <Package className="w-10 h-10 text-purple-300 mx-auto mb-2" />
                <h3 className="text-base font-bold text-purple-950">No in-stock products available</h3>
                <p className="text-sm text-slate-500 mt-1">
                  All matching items are currently out of stock for this shop.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {visiblePosItems.map((item) => {
                  const cat = categories.find((c) => c.id === item.category_id);
                  const subcat = subcategories.find((sc) => sc.id === item.subcategory_id);
                  const inCart = cart.find((c) => c.item.id === item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className="group relative rounded-2xl border overflow-hidden transition-all flex flex-col justify-between bg-white border-purple-100 hover:border-purple-400 hover:shadow-md hover:shadow-purple-900/5 cursor-pointer active:scale-[0.98]"
                    >
                      <div className="p-3.5 pb-2.5">
                        <div className="flex items-start gap-3">
                          {/* Round Image Inside Container */}
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-14 h-14 rounded-full object-cover border border-purple-200 shrink-0 group-hover:scale-105 transition-transform duration-200"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-full bg-purple-100/70 border border-purple-200/70 text-purple-600 flex items-center justify-center shrink-0">
                              <Package className="w-6 h-6" />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5 mb-1">
                              <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-[#FAF8F5] text-purple-800 border border-purple-100 truncate">
                                {cat?.name || 'General'}
                              </span>
                              <span
                                className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                  item.stock <= 5
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {item.stock} left
                              </span>
                            </div>
                            <h3
                              className="font-bold text-slate-900 text-sm sm:text-base leading-snug truncate"
                              title={item.name}
                            >
                              {item.name}
                            </h3>
                            {subcat && (
                              <p className="text-xs font-semibold text-purple-700 truncate mt-0.5">
                                {subcat.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-purple-50 px-3.5 py-2.5 mt-1 bg-[#FAF8F5]/60">
                        <span className="font-extrabold text-purple-950 flex items-center text-base">
                          <IndianRupee className="w-4 h-4 text-purple-600" />
                          {Number(item.price).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          className={`rounded-xl font-semibold flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                            inCart
                              ? 'bg-purple-700 text-white shadow-2xs'
                              : 'bg-purple-100/80 text-purple-800 group-hover:bg-purple-600 group-hover:text-white'
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

          {/* Right Column: Live Cart & Instant Paperless Bill */}
          <div
            className={`${
              isMobileCartOpen
                ? 'fixed top-20 right-3 sm:right-6 z-40 w-[calc(100vw-1.5rem)] max-w-md max-h-[calc(100vh-6rem)] overflow-y-auto rounded-2xl shadow-2xl'
                : 'hidden'
            } lg:static lg:block lg:w-auto lg:max-w-none lg:max-h-none lg:overflow-visible lg:shadow-none lg:col-span-5 xl:col-span-4 space-y-5`}
          >
            {/* Active Cart Panel */}
            <div className="bg-white border border-purple-100 shadow-sm rounded-2xl p-5 flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-purple-100">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-purple-950 text-base">Current Bill Cart</h2>
                    <p className="text-xs text-slate-500">
                      {cart.reduce((s, c) => s + c.quantity, 0)} items selected
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {cart.length > 0 && (
                    <button
                      onClick={() => {
                        setCart([]);
                        setSplitCashAmount('');
                        setSplitUpiAmount('');
                      }}
                      className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsMobileCartOpen(false)}
                    aria-label="Close cart"
                    className="lg:hidden p-1.5 rounded-lg bg-[#FAF8F5] hover:bg-purple-100 text-slate-600 hover:text-purple-900 border border-purple-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Cart Items List with Thumbnail Images, Direct Quantity Edit & Delete */}
              <div className="py-4 space-y-3 max-h-[360px] overflow-y-auto">
                {cart.length === 0 ? (
                  <div className="text-center py-10 px-4 bg-[#FAF8F5] rounded-xl border border-dashed border-purple-200">
                    <ShoppingCart className="w-10 h-10 text-purple-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-600">Your cart is empty.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Tap items on the left to add them to the live bill.
                    </p>
                  </div>
                ) : (
                  cart.map(({ item, quantity }) => {
                    const subcat = subcategories.find((sc) => sc.id === item.subcategory_id);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 bg-[#FAF8F5] border border-purple-100 rounded-xl p-3"
                      >
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-14 h-14 rounded-full object-cover border border-purple-200 shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-full bg-purple-100/70 text-purple-500 flex items-center justify-center shrink-0">
                            <Package className="w-6 h-6" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                            {item.name}
                          </h4>
                          {subcat && (
                            <span className="inline-block text-xs font-semibold text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded mb-0.5">
                              {subcat.name}
                            </span>
                          )}
                          <p className="text-xs sm:text-sm text-slate-600">
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
                            className="w-8 h-8 rounded-lg bg-white border border-purple-200 hover:bg-purple-50 flex items-center justify-center text-purple-900"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            max={item.stock}
                            value={quantity}
                            onChange={(e) => setExactCartQty(item.id, e.target.value)}
                            title="Edit item quantity"
                            className="w-12 h-8 text-center text-sm font-bold text-purple-950 bg-white border border-purple-200 rounded-lg focus:outline-none focus:border-purple-600"
                          />
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.id, 1)}
                            title="Increase quantity"
                            className="w-8 h-8 rounded-lg bg-white border border-purple-200 hover:bg-purple-50 flex items-center justify-center text-purple-900"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            title="Delete item from cart"
                            className="w-8 h-8 rounded-lg bg-white border border-rose-200 hover:bg-rose-100 text-rose-600 flex items-center justify-center ml-0.5"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
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

                {/* Compact Pill Payment Method Selector: Cash, UPI, or Split */}
                <div className="bg-[#FAF8F5] border border-purple-100 rounded-xl px-3 py-2 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600">
                      Payment Mode
                    </span>
                    <div className="inline-flex items-center bg-white p-0.5 rounded-lg border border-purple-200/80 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('Cash')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
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
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          paymentMethod === 'UPI'
                            ? 'bg-gradient-to-r from-purple-600 to-violet-700 text-white shadow-xs'
                            : 'text-slate-600 hover:text-purple-900'
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>UPI</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('Split')}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          paymentMethod === 'Split'
                            ? 'bg-gradient-to-r from-purple-600 to-violet-700 text-white shadow-xs'
                            : 'text-slate-600 hover:text-purple-900'
                        }`}
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>Split</span>
                      </button>
                    </div>
                  </div>

                  {paymentMethod === 'Split' && (
                    <div className="pt-2 border-t border-purple-100 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                            <Banknote className="w-3 h-3 text-purple-600" />
                            Cash (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={cartSubtotal}
                            placeholder="0.00"
                            value={splitCashAmount}
                            onChange={(e) => handleSplitCashChange(e.target.value)}
                            className="w-full bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-purple-950 focus:outline-none focus:border-purple-600"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                            <QrCode className="w-3 h-3 text-purple-600" />
                            UPI (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={cartSubtotal}
                            placeholder="0.00"
                            value={splitUpiAmount}
                            onChange={(e) => handleSplitUpiChange(e.target.value)}
                            className="w-full bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-purple-950 focus:outline-none focus:border-purple-600"
                          />
                        </div>
                      </div>
                      {cartSubtotal > 0 && (
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">
                            Split Sum: ₹
                            {(
                              (parseFloat(splitCashAmount) || 0) +
                              (parseFloat(splitUpiAmount) || 0)
                            ).toFixed(2)}
                          </span>
                          {Math.abs(
                            (parseFloat(splitCashAmount) || 0) +
                              (parseFloat(splitUpiAmount) || 0) -
                              cartSubtotal
                          ) <= 0.01 &&
                          (parseFloat(splitCashAmount) || 0) > 0 &&
                          (parseFloat(splitUpiAmount) || 0) > 0 ? (
                            <span className="font-semibold text-emerald-700">
                              Matched
                            </span>
                          ) : (
                            <span className="font-semibold text-amber-700">
                              Remaining: ₹
                              {(
                                cartSubtotal -
                                ((parseFloat(splitCashAmount) || 0) +
                                  (parseFloat(splitUpiAmount) || 0))
                              ).toFixed(2)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleGenerateBill}
                  disabled={cart.length === 0}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white font-bold text-sm shadow-lg shadow-purple-600/20 disabled:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Generate Live Bill ({paymentMethod === 'Split' ? 'Cash + UPI' : paymentMethod})
                </button>
              </div>
            </div>

            {/* Live Digital Bill Display */}
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
                  <div className="flex items-center justify-between gap-2">
                    <span>Payment Mode:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 font-semibold">
                      {latestGeneratedBill.payment_method?.startsWith('Split') ? (
                        <ArrowRightLeft className="w-3 h-3 shrink-0" />
                      ) : latestGeneratedBill.payment_method === 'UPI' ? (
                        <QrCode className="w-3 h-3 shrink-0" />
                      ) : (
                        <Banknote className="w-3 h-3 shrink-0" />
                      )}
                      {latestGeneratedBill.payment_method === 'Split'
                        ? `Split (Cash: ₹${Number(latestGeneratedBill.cash_amount || 0).toFixed(2)}, UPI: ₹${Number(latestGeneratedBill.upi_amount || 0).toFixed(2)})`
                        : latestGeneratedBill.payment_method || 'Cash'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5 mb-3 max-h-48 overflow-y-auto">
                  {latestGeneratedBill.items?.map((li, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2.5 text-sm text-slate-700">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {li.image_url && (
                          <img
                            src={li.image_url}
                            alt={li.item_name}
                            className="w-10 h-10 rounded-full object-cover border border-purple-200 shrink-0"
                          />
                        )}
                        <span className="truncate">
                          {li.item_name}
                          {li.subcategory_name ? ` (${li.subcategory_name})` : ''}{' '}
                          <span className="text-slate-500 font-medium">×{li.quantity}</span>
                        </span>
                      </div>
                      <span className="font-bold shrink-0">₹{Number(li.subtotal).toFixed(2)}</span>
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
          ROLE 2: ADMIN & SHOP-ADMIN PANEL
      ======================================================================== */}
      {activeRole === 'admin' && isAdminAuthenticated && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Admin Sub-Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-purple-100 shadow-xs p-4 rounded-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setAdminTab('analytics')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  adminTab === 'analytics'
                    ? 'bg-purple-700 text-white shadow-sm'
                    : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                {isShopAdmin ? 'My Shop Sales & Expenses' : 'Analytics'}
              </button>

              <button
                onClick={() => setAdminTab('bills')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  adminTab === 'bills'
                    ? 'bg-purple-700 text-white shadow-sm'
                    : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                }`}
              >
                <Receipt className="w-4 h-4" />
                Generated Bills
              </button>

              <button
                onClick={() => setAdminTab('stock-alerts')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  adminTab === 'stock-alerts'
                    ? 'bg-purple-700 text-white shadow-sm'
                    : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                }`}
              >
                <AlertCircle className="w-4 h-4" />
                <span>Stock Alerts</span>
                {stockAlertsData.allAlerts.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      adminTab === 'stock-alerts'
                        ? 'bg-white text-purple-800'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {stockAlertsData.allAlerts.length}
                  </span>
                )}
              </button>

              {isSuperAdmin && (
                <>
                  <button
                    onClick={() => setAdminTab('shops')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      adminTab === 'shops'
                        ? 'bg-purple-700 text-white shadow-sm'
                        : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                    }`}
                  >
                    <ArrowRightLeft className="w-4 h-4" />
                    Stock Update
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
                    Menu Editor
                  </button>
                  <button
                    onClick={() => setAdminTab('users')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      adminTab === 'users'
                        ? 'bg-purple-700 text-white shadow-sm'
                        : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    Manage Users/Shops
                  </button>
                </>
              )}

              {isShopAdmin && (
                <button
                  onClick={() => setAdminTab('shop-stock')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    adminTab === 'shop-stock'
                      ? 'bg-purple-700 text-white shadow-sm'
                      : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  My Shop Stock ({currentActiveShop?.name})
                </button>
              )}
            </div>

            {isSuperAdmin && adminTab === 'analytics' && shops.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Filter Shop:</span>
                <select
                  value={adminSelectedShopFilter}
                  onChange={(e) => setAdminSelectedShopFilter(e.target.value)}
                  className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                >
                  <option value="ALL">All Shops (Total Combined)</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.sales_profile_name})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* ADMIN TAB 1: DAILY & WEEKLY SALES + SHOP-WISE & CATEGORY ANALYTICS */}
          {adminTab === 'analytics' && (
            <div className="space-y-6">
              {/* Period Toggle & Summary KPI Cards */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-purple-950">
                    {isShopAdmin
                      ? `${currentActiveShop?.name || 'Shop'} — My Shop Sales & Expense Dashboard`
                      : adminSelectedShopFilter === 'ALL'
                      ? 'All Shops — Total Sales Overview'
                      : `${
                          shops.find((s) => s.id === adminSelectedShopFilter)?.name || 'Shop'
                        } — Shop Sales & Expense Analytics`}
                  </h2>
                  <p className="text-sm text-slate-500">
                    {salesReportPeriod === 'daily'
                      ? `Sales breakdown for ${analyticsDate || 'today'}`
                      : `7-day sales overview ending ${analyticsDate || 'today'}`}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 self-start">
                  <div className="flex items-center gap-1.5 bg-white border border-purple-200 rounded-xl px-3 py-2 shadow-xs">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    <input
                      type="date"
                      value={analyticsDate}
                      onChange={(e) => setAnalyticsDate(e.target.value)}
                      className="bg-transparent text-xs sm:text-sm font-semibold text-purple-950 focus:outline-none"
                    />
                  </div>

                  <div className="inline-flex bg-white p-1 rounded-xl border border-purple-100 shadow-xs">
                    <button
                      onClick={() => setSalesReportPeriod('daily')}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                        salesReportPeriod === 'daily'
                          ? 'bg-purple-700 text-white'
                          : 'text-slate-600 hover:text-purple-900'
                      }`}
                    >
                      <Calendar className="w-4 h-4" />
                      Daily View
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
              </div>

              {/* Top Summary Cards (Hide Expense Card when All Shops is selected) */}
              <div
                className={`grid grid-cols-1 ${
                  isAllShopsAnalyticsSelected ? 'md:grid-cols-1' : 'md:grid-cols-3'
                } gap-4`}
              >
                <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {isShopAdmin
                      ? 'My Shop Total Sales'
                      : isAllShopsAnalyticsSelected
                      ? 'Total Sales (All Shops)'
                      : 'Selected Shop Sales'}
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-purple-950 mt-2">
                    ₹{analyticsData.grandTotalSales.toFixed(2)}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {analyticsData.filteredBills.length} bills generated in the selected period
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-2.5 border-t border-purple-50 text-xs font-semibold">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FAF8F5] border border-purple-100 text-purple-900">
                      <Banknote className="w-3.5 h-3.5 text-purple-600" />
                      Cash: ₹{analyticsData.totalCashSales.toFixed(2)}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FAF8F5] border border-purple-100 text-purple-900">
                      <QrCode className="w-3.5 h-3.5 text-purple-600" />
                      UPI: ₹{analyticsData.totalUpiSales.toFixed(2)}
                    </span>
                  </div>
                </div>

                {!isAllShopsAnalyticsSelected && (
                  <>
                    <div className="bg-purple-50 border border-purple-300 shadow-xs rounded-2xl p-5">
                      <span className="text-xs font-bold uppercase tracking-wider text-purple-800 flex items-center gap-1.5">
                        <Percent className="w-3.5 h-3.5" />
                        Highlighted Expense
                      </span>
                      <div className="text-2xl sm:text-3xl font-extrabold text-purple-700 mt-2">
                        ₹{analyticsData.grandTotalExpense.toFixed(2)}
                      </div>
                      <p className="text-xs text-purple-700/80 mt-1">
                        Expense deductions
                      </p>
                    </div>

                    <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Net Revenue
                      </span>
                      <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
                        ₹{analyticsData.grandNetRevenue.toFixed(2)}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Gross Sales minus Expenses
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Super Admin: Shop-Wise Sales & Total Combined Sales Summary Table */}
              {isSuperAdmin && shops.length > 0 && (
                <div className="bg-white border border-purple-100 shadow-xs rounded-2xl overflow-hidden">
                  <div className="p-5 border-b border-purple-100 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-purple-950 text-base">
                        Sales Overview
                      </h3>
                      <p className="text-xs text-slate-500">
                        View each shop's sales & combined grand total from all shops.
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-xl bg-purple-100 text-purple-900 text-xs font-bold">
                      All Shops Combined: ₹{analyticsData.allShopsCombinedSales.toFixed(2)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#FAF8F5] border-b border-purple-100 text-xs uppercase tracking-wider text-slate-500">
                          <th className="py-3.5 px-5">Shop Name</th>
                          <th className="py-3.5 px-4">Assigned Sales Profile</th>
                          <th className="py-3.5 px-4 text-right">Bills Count</th>
                          <th className="py-3.5 px-4 text-right">Cash (₹)</th>
                          <th className="py-3.5 px-4 text-right">UPI (₹)</th>
                          <th className="py-3.5 px-5 text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-50 text-sm">
                        {analyticsData.shopRows.map((sr) => (
                          <tr key={sr.shopId} className="hover:bg-[#FAF8F5]/80">
                            <td className="py-3.5 px-5 font-semibold text-slate-900">
                              {sr.shopName}
                              {sr.location && (
                                <span className="block text-xs font-normal text-slate-400">
                                  {sr.location}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="px-2.5 py-1 rounded-md bg-purple-100 text-purple-800 text-xs font-semibold">
                                {sr.salesProfileName}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right text-slate-600">
                              {sr.billCount}
                            </td>
                            <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                              ₹{sr.cashSales.toFixed(2)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-medium text-slate-700">
                              ₹{sr.upiSales.toFixed(2)}
                            </td>
                            <td className="py-3.5 px-5 text-right font-bold text-purple-950">
                              ₹{sr.totalSales.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-purple-50/90 font-bold text-purple-950 border-t-2 border-purple-200">
                          <td className="py-3.5 px-5" colSpan={2}>
                            Total Sales From All Shops ({analyticsData.shopRows.length} Shops)
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {analyticsData.shopRows.reduce((s, r) => s + r.billCount, 0)}
                          </td>
                          <td className="py-3.5 px-4 text-right text-purple-900">
                            ₹{analyticsData.allShopsCombinedCash.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-right text-purple-900">
                            ₹{analyticsData.allShopsCombinedUpi.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-5 text-right text-base text-purple-800">
                            ₹{analyticsData.allShopsCombinedSales.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Category Breakdown Table (Hides Expense % & Expense Amount when All Shops is selected) */}
              <div className="bg-white border border-purple-100 shadow-xs rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-purple-950 text-base">
                      Category-Wise Sales
                    </h3>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#FAF8F5] border-b border-purple-100 text-xs uppercase tracking-wider text-slate-500">
                        <th className="py-3.5 px-5">Category</th>
                        <th className="py-3.5 px-4 text-right">Units Sold</th>
                        <th className="py-3.5 px-4 text-right">Total Category Sale</th>
                        {!isAllShopsAnalyticsSelected && (
                          <>
                            <th className="py-3.5 px-4 text-center">Expense %</th>
                            <th className="py-3.5 px-5 text-right bg-purple-100/70 text-purple-900">
                              Highlighted Expense Amount
                            </th>
                            <th className="py-3.5 px-5 text-right">Net Balance</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50 text-sm">
                      {analyticsData.categoryRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={isAllShopsAnalyticsSelected ? 3 : 6}
                            className="py-8 text-center text-slate-400 text-xs"
                          >
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
                            {!isAllShopsAnalyticsSelected && (
                              <>
                                <td className="py-4 px-4">
                                  {row.categoryId && (isSuperAdmin || isShopAdmin) ? (
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
                                            e.target.value,
                                            effectiveAnalyticsShopId
                                          )
                                        }
                                        className="w-20 bg-[#FAF8F5] border border-purple-200 rounded-lg px-2.5 py-1 text-center text-sm font-bold text-purple-800 focus:outline-none focus:border-purple-600 focus:bg-white"
                                      />
                                      <span className="text-slate-400 text-xs">%</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-700 font-semibold text-xs block text-center">
                                      {row.expensePercentage}%
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
                              </>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* NEW TAB FOR ADMIN & SHOP-ADMIN: GENERATED BILLS WITH DATE PICKER */}
          {adminTab === 'bills' && (
            <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-purple-100 pb-4">
                <div>
                  <h3 className="font-bold text-purple-950 text-lg flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-purple-600" />
                    Generated Bills
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Showing <strong className="text-purple-900">{visibleLedgerBills.length}</strong> bills • Filtered Total:{' '}
                    <strong className="text-purple-900">
                      ₹{ledgerPaymentTotals.total.toFixed(2)}
                    </strong>{' '}
                    • Cash:{' '}
                    <strong className="text-purple-900">
                      ₹{ledgerPaymentTotals.cash.toFixed(2)}
                    </strong>{' '}
                    • UPI:{' '}
                    <strong className="text-purple-900">
                      ₹{ledgerPaymentTotals.upi.toFixed(2)}
                    </strong>
                  </p>
                </div>

                {/* Distinct Bills Filter Bar with Date Selector */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5 bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-1.5">
                    <Calendar className="w-3.5 h-3.5 text-purple-600" />
                    <input
                      type="date"
                      value={billDateFilter}
                      onChange={(e) => setBillDateFilter(e.target.value)}
                      className="bg-transparent text-xs font-semibold text-purple-950 focus:outline-none"
                    />
                    {billDateFilter && (
                      <button
                        type="button"
                        onClick={() => setBillDateFilter('')}
                        className="text-[10px] font-bold text-slate-400 hover:text-rose-600 ml-1"
                        title="Show all dates"
                      >
                        All Dates
                      </button>
                    )}
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Bill # or item..."
                      value={billSearchQuery}
                      onChange={(e) => setBillSearchQuery(e.target.value)}
                      className="bg-[#FAF8F5] border border-purple-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white w-36 sm:w-44"
                    />
                  </div>

                  <div className="inline-flex bg-[#FAF8F5] p-0.5 rounded-xl border border-purple-200">
                    {['ALL', 'Cash', 'UPI', 'Split'].map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setBillPaymentFilter(mode)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                          billPaymentFilter === mode
                            ? 'bg-purple-700 text-white'
                            : 'text-slate-600 hover:text-purple-900'
                        }`}
                      >
                        {mode === 'ALL' ? 'All Modes' : mode}
                      </button>
                    ))}
                  </div>

                  {isSuperAdmin && shops.length > 0 && (
                    <select
                      value={billShopFilter}
                      onChange={(e) => setBillShopFilter(e.target.value)}
                      className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                    >
                      <option value="ALL">All Shops</option>
                      {shops.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {(billSearchQuery || billPaymentFilter !== 'ALL' || billShopFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setBillSearchQuery('');
                        setBillPaymentFilter('ALL');
                        setBillShopFilter('ALL');
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {visibleLedgerBills.length === 0 ? (
                <div className="text-center py-10 bg-[#FAF8F5] rounded-xl border border-dashed border-purple-200">
                  <Receipt className="w-8 h-8 text-purple-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-600">
                    No bills found for the selected date and filters.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                  {visibleLedgerBills.map((bill) => {
                    const billShop = shops.find((s) => s.id === bill.shop_id);
                    return (
                      <div
                        key={bill.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#FAF8F5] border border-purple-100 rounded-xl px-4 py-3"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-purple-700">
                              {bill.bill_number}
                            </span>
                            {billShop && (
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white border border-purple-200 text-purple-900">
                                {billShop.name}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-800">
                              {bill.payment_method?.startsWith('Split') ? (
                                <ArrowRightLeft className="w-3 h-3" />
                              ) : bill.payment_method === 'UPI' ? (
                                <QrCode className="w-3 h-3" />
                              ) : (
                                <Banknote className="w-3 h-3" />
                              )}
                              {bill.payment_method === 'Split'
                                ? `Split (Cash: ₹${Number(bill.cash_amount || 0).toFixed(2)}, UPI: ₹${Number(bill.upi_amount || 0).toFixed(2)})`
                                : bill.payment_method || 'Cash'}
                            </span>
                            <span className="text-xs text-slate-500">
                              {new Date(bill.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            {(bill.items || [])
                              .map(
                                (i) =>
                                  `${i.item_name}${
                                    i.subcategory_name ? ` [${i.subcategory_name}]` : ''
                                  } (×${i.quantity})`
                              )
                              .join(', ')}
                          </p>
                        </div>
                        <div className="text-base font-bold text-purple-950">
                          ₹{Number(bill.total_amount).toFixed(2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STOCK ALERTS TAB (ADMIN & SHOP-ADMIN: OUT OF STOCK & OUT OF STOCK SOON — GROUPED BY CATEGORY & FLAVOUR) */}
          {adminTab === 'stock-alerts' && (isSuperAdmin || isShopAdmin) && (
            <div className="space-y-5">
              {/* Summary KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Total Stock Alerts
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-purple-950 mt-2">
                    {stockAlertsData.outOfStockCount + stockAlertsData.lowStockCount}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {isShopAdmin
                      ? `For ${currentActiveShop?.name || 'your shop'}`
                      : stockAlertShopFilter === 'ALL'
                      ? 'Across all shops'
                      : `For ${shops.find((s) => s.id === stockAlertShopFilter)?.name || 'selected shop'}`}
                  </p>
                </div>

                <div className="bg-rose-50 border border-rose-200 shadow-xs rounded-2xl p-5">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Out of Stock (0 units)
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-rose-700 mt-2">
                    {stockAlertsData.outOfStockCount}
                  </div>
                  <p className="text-xs text-rose-700/80 mt-1">
                    Requires immediate restocking
                  </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 shadow-xs rounded-2xl p-5">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    Out of Stock Soon (1–{stockAlertsData.threshold} units)
                  </span>
                  <div className="text-2xl sm:text-3xl font-extrabold text-amber-700 mt-2">
                    {stockAlertsData.lowStockCount}
                  </div>
                  <p className="text-xs text-amber-800/80 mt-1">
                    Running low — plan restock soon
                  </p>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-purple-950 text-base flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-rose-600" />
                    Stock Alerts (Grouped by Category & Flavour)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    View out-of-stock and low-stock items grouped by category and flavour, and restock inline.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Status Filter Pills */}
                  <div className="inline-flex bg-[#FAF8F5] p-0.5 rounded-xl border border-purple-200">
                    {[
                      { id: 'ALL', label: 'All Alerts' },
                      { id: 'OUT_OF_STOCK', label: 'Out of Stock' },
                      { id: 'LOW_STOCK', label: 'Soon' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setStockAlertStatusFilter(tab.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                          stockAlertStatusFilter === tab.id
                            ? 'bg-purple-700 text-white'
                            : 'text-slate-600 hover:text-purple-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Low-Stock Threshold Input */}
                  <div className="flex items-center gap-1.5 bg-[#FAF8F5] border border-purple-200 rounded-xl px-2.5 py-1">
                    <span className="text-[11px] font-semibold text-slate-500">Soon ≤</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={lowStockThreshold}
                      onChange={(e) => setLowStockThreshold(e.target.value)}
                      className="w-12 bg-white border border-purple-200 rounded-md px-1.5 py-0.5 text-center text-xs font-bold text-purple-950 focus:outline-none focus:border-purple-600"
                    />
                  </div>

                  {/* Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search category, flavour, item..."
                      value={stockAlertSearchQuery}
                      onChange={(e) => setStockAlertSearchQuery(e.target.value)}
                      className="bg-[#FAF8F5] border border-purple-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white w-44 sm:w-56"
                    />
                    {stockAlertSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setStockAlertSearchQuery('')}
                        aria-label="Clear stock alerts search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Shop Filter (Super Admin Only) */}
                  {isSuperAdmin && shops.length > 0 && (
                    <select
                      value={stockAlertShopFilter}
                      onChange={(e) => setStockAlertShopFilter(e.target.value)}
                      className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                    >
                      <option value="ALL">All Shops</option>
                      {shops.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Grouped by Category -> Flavour Rows */}
              {stockAlertsData.groupedByCategory.length === 0 ? (
                <div className="bg-white border border-dashed border-purple-200 rounded-2xl p-10 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <h4 className="text-base font-bold text-purple-950">All stocked up!</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    No out-of-stock or low-stock items match the current filters.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {stockAlertsData.groupedByCategory.map((group) => {
                    const catDirtyUpdates = group.entries
                      .filter((entry) => Boolean(entry.shopId))
                      .map((entry) => {
                        const draftKey = `${entry.shopId}::${entry.item.id}`;
                        const hasDraft = Object.prototype.hasOwnProperty.call(
                          alertStockDrafts,
                          draftKey
                        );
                        if (!hasDraft || alertStockDrafts[draftKey] === '') return null;
                        const parsed = Math.max(0, parseInt(alertStockDrafts[draftKey], 10) || 0);
                        if (parsed === Number(entry.stock)) return null;
                        return {
                          shopId: entry.shopId,
                          itemId: entry.item.id,
                          stock: parsed
                        };
                      })
                      .filter(Boolean);

                    return (
                      <div
                        key={group.categoryName}
                        className="bg-white border border-purple-100 shadow-xs rounded-2xl overflow-hidden"
                      >
                        <div className="px-5 py-3.5 bg-purple-50/70 border-b border-purple-100 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-purple-950 text-sm">
                              {group.categoryName}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white border border-purple-200 text-purple-800">
                              {group.entries.length}{' '}
                              {group.entries.length === 1 ? 'alert' : 'alerts'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                            {group.outOfStockCount > 0 && (
                              <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                                Out of Stock: {group.outOfStockCount}
                              </span>
                            )}
                            {group.lowStockCount > 0 && (
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                Soon: {group.lowStockCount}
                              </span>
                            )}
                            {group.entries.some((e) => Boolean(e.shopId)) && (
                              <button
                                type="button"
                                disabled={catDirtyUpdates.length === 0}
                                onClick={() =>
                                  handleBatchUpdateShopStock(catDirtyUpdates, 'alerts')
                                }
                                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                  catDirtyUpdates.length > 0
                                    ? 'bg-purple-700 hover:bg-purple-600 text-white shadow-sm cursor-pointer'
                                    : 'bg-white border border-purple-200/70 text-slate-400 cursor-not-allowed'
                                }`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>
                                  {catDirtyUpdates.length > 0
                                    ? `Update (${catDirtyUpdates.length})`
                                    : 'Update'}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#FAF8F5] border-b border-purple-100 text-[11px] uppercase tracking-wider text-slate-500">
                                {isSuperAdmin && shops.length > 0 && (
                                  <th className="py-2.5 px-4 w-40">Shop</th>
                                )}
                                <th className="py-2.5 px-4 w-48">Flavour / Item</th>
                                <th className="py-2.5 px-4">Types, Status & Quick Restock</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-purple-50 text-sm">
                              {group.flavourGroups.map((fg) => (
                                <tr
                                  key={`${group.categoryName}-${fg.key}`}
                                  className="hover:bg-[#FAF8F5]/70 align-middle"
                                >
                                  {isSuperAdmin && shops.length > 0 && (
                                    <td className="py-2.5 px-4">
                                      <span className="px-2.5 py-1 rounded-md bg-purple-100 text-purple-900 text-xs font-semibold">
                                        {fg.shopName}
                                      </span>
                                    </td>
                                  )}
                                  <td className="py-2.5 px-4 font-bold text-purple-950 text-xs sm:text-sm">
                                    {fg.flavourName}
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {fg.entries.map((entry) => {
                                        const draftKey = entry.shopId
                                          ? `${entry.shopId}::${entry.item.id}`
                                          : null;
                                        const draftValue =
                                          draftKey &&
                                          Object.prototype.hasOwnProperty.call(
                                            alertStockDrafts,
                                            draftKey
                                          )
                                            ? alertStockDrafts[draftKey]
                                            : entry.stock;

                                        return (
                                          <SingleRowStockAlertItemEditor
                                            key={entry.key}
                                            entry={entry}
                                            value={draftValue}
                                            onChange={
                                              draftKey
                                                ? (val) =>
                                                    setAlertStockDrafts((prev) => ({
                                                      ...prev,
                                                      [draftKey]: val
                                                    }))
                                                : null
                                            }
                                          />
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SUPER ADMIN TAB: STOCK UPDATE (CASCADING DROPDOWNS & FLAVOUR-GROUPED ROWS) */}
          {adminTab === 'shops' && isSuperAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Assign Stock to Shop (Shop -> Category -> Flavour -> Item Type -> Count) */}
              <div className="lg:col-span-4 space-y-6">
                <form
                  onSubmit={handleAssignStockToShop}
                  className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center gap-2 text-purple-950 font-bold">
                    <ArrowRightLeft className="w-5 h-5 text-purple-600" />
                    <h3>Assign Stock to Shop</h3>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Shop
                    </label>
                    <SearchableSelect
                      value={assignShopId}
                      onChange={setAssignShopId}
                      placeholder="Select shop..."
                      searchPlaceholder="Search shop..."
                      emptyMessage="Create a shop first"
                      options={shops.map((s) => ({
                        value: s.id,
                        label: `${s.name} (${s.sales_profile_name})`
                      }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Category
                    </label>
                    <SearchableSelect
                      value={assignCategoryId}
                      onChange={(val) => {
                        setAssignCategoryId(val);
                        setAssignSubcategoryId('');
                      }}
                      placeholder="Select category..."
                      searchPlaceholder="Search category..."
                      emptyMessage="Create a category first"
                      options={categories.map((cat) => ({
                        value: cat.id,
                        label: cat.name
                      }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Flavour / Item
                    </label>
                    <SearchableSelect
                      value={assignSubcategoryId}
                      onChange={setAssignSubcategoryId}
                      placeholder="All Flavours / Items"
                      searchPlaceholder="Search flavour / item..."
                      emptyMessage="No flavours found"
                      options={[
                        { value: '', label: 'All Flavours / Items' },
                        ...assignCategorySubcategories.map((sc) => ({
                          value: sc.id,
                          label: sc.name
                        })),
                        { value: 'GENERAL', label: 'General / None' }
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Item Type / Product
                    </label>
                    <SearchableSelect
                      value={assignItemId}
                      onChange={setAssignItemId}
                      placeholder="Select item type..."
                      searchPlaceholder="Search item type..."
                      emptyMessage="No types found for this flavour"
                      options={assignFilteredItems.map((it) => {
                        const sub = subcategories.find((sc) => sc.id === it.subcategory_id);
                        return {
                          value: it.id,
                          label: `${!assignSubcategoryId && sub ? `${sub.name} → ` : ''}${it.name} (₹${Number(it.price).toFixed(2)})`
                        };
                      })}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Quantity to Add
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="e.g., 20"
                      value={assignStockQty}
                      onChange={(e) => setAssignStockQty(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={shops.length === 0 || !assignItemId}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm shadow-sm transition-colors"
                  >
                    Assign Stock to Shop
                  </button>
                </form>
              </div>

              {/* Right Column: Manage Inventory (Shop -> Category -> Flavour Grouped Rows) */}
              <div className="lg:col-span-8 space-y-5">
                <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-purple-950 text-base">
                      Manage Inventory (Shop → Category → Flavour)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Separate inventory sections grouped by Shop, Category, and Flavour with category-level stock updates.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search category, flavour, item..."
                        value={stockUpdateSearchQuery}
                        onChange={(e) => setStockUpdateSearchQuery(e.target.value)}
                        className="bg-[#FAF8F5] border border-purple-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white w-44 sm:w-52"
                      />
                      {stockUpdateSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setStockUpdateSearchQuery('')}
                          aria-label="Clear stock update search"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {shops.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                          <Store className="w-3.5 h-3.5 text-purple-600" />
                          Shop:
                        </span>
                        <select
                          value={stockUpdateShopFilter}
                          onChange={(e) => setStockUpdateShopFilter(e.target.value)}
                          className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                        >
                          <option value="ALL">All Shops</option>
                          {shops.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.sales_profile_name})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {shops.length === 0 || categories.length === 0 ? (
                  <div className="bg-white border border-dashed border-purple-200 rounded-2xl p-10 text-center text-xs text-slate-400">
                    Create shops and add menu items to manage per-shop inventory.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {shops
                      .filter(
                        (shop) =>
                          stockUpdateShopFilter === 'ALL' || shop.id === stockUpdateShopFilter
                      )
                      .map((shop) => {
                        const searchQ = stockUpdateSearchQuery.trim().toLowerCase();
                        const shopMatchesSearch =
                          !searchQ || shop.name.toLowerCase().includes(searchQ);

                        const visibleCategoryBlocks = categories
                          .map((cat) => {
                            const catItems = items.filter(
                              (it) => String(it.category_id) === String(cat.id)
                            );
                            if (catItems.length === 0) return null;

                            const catSubcats = subcategories.filter(
                              (sc) => String(sc.category_id) === String(cat.id)
                            );
                            const flavourGroups = [];
                            catSubcats.forEach((sc) => {
                              const scItems = catItems.filter(
                                (it) => String(it.subcategory_id) === String(sc.id)
                              );
                              if (scItems.length > 0) {
                                flavourGroups.push({
                                  key: sc.id,
                                  flavourName: sc.name,
                                  items: scItems
                                });
                              }
                            });
                            const generalCatItems = catItems.filter(
                              (it) =>
                                !it.subcategory_id ||
                                !catSubcats.some((sc) => String(sc.id) === String(it.subcategory_id))
                            );
                            generalCatItems.forEach((it) => {
                              flavourGroups.push({
                                key: `${cat.id}-direct-${it.id}`,
                                flavourName: it.name,
                                items: [it]
                              });
                            });

                            const catMatchesSearch =
                              shopMatchesSearch || cat.name.toLowerCase().includes(searchQ);
                            const filteredFlavourGroups = catMatchesSearch
                              ? flavourGroups
                              : flavourGroups
                                  .map((fg) => {
                                    if (fg.flavourName.toLowerCase().includes(searchQ)) {
                                      return fg;
                                    }
                                    const matchedItems = fg.items.filter((it) =>
                                      it.name.toLowerCase().includes(searchQ)
                                    );
                                    return matchedItems.length > 0
                                      ? { ...fg, items: matchedItems }
                                      : null;
                                  })
                                  .filter(Boolean);

                            if (filteredFlavourGroups.length === 0) return null;

                            const catDirtyUpdates = catItems
                              .map((it) => {
                                const draftKey = `${shop.id}::${it.id}`;
                                const hasDraft = Object.prototype.hasOwnProperty.call(
                                  stockDrafts,
                                  draftKey
                                );
                                if (!hasDraft || stockDrafts[draftKey] === '') return null;
                                const alloc = shopStocks.find(
                                  (ss) => ss.shop_id === shop.id && ss.item_id === it.id
                                );
                                const currentStock = alloc ? Number(alloc.stock) : 0;
                                const parsed = Math.max(
                                  0,
                                  parseInt(stockDrafts[draftKey], 10) || 0
                                );
                                if (parsed === currentStock) return null;
                                return {
                                  shopId: shop.id,
                                  itemId: it.id,
                                  stock: parsed
                                };
                              })
                              .filter(Boolean);

                            return (
                              <div
                                key={`${shop.id}-${cat.id}`}
                                className="border border-purple-100 rounded-xl overflow-hidden"
                              >
                                <div className="px-4 py-2.5 bg-purple-50 border-b border-purple-100 flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-bold text-purple-950 text-xs sm:text-sm">
                                    Category: {cat.name}
                                  </span>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-semibold text-purple-700">
                                      Category Stock:{' '}
                                      {catItems.reduce((sum, it) => {
                                        const alloc = shopStocks.find(
                                          (ss) =>
                                            ss.shop_id === shop.id && ss.item_id === it.id
                                        );
                                        return sum + (Number(alloc?.stock) || 0);
                                      }, 0)}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={catDirtyUpdates.length === 0}
                                      onClick={() =>
                                        handleBatchUpdateShopStock(catDirtyUpdates, 'stock')
                                      }
                                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                        catDirtyUpdates.length > 0
                                          ? 'bg-purple-700 hover:bg-purple-600 text-white shadow-sm cursor-pointer'
                                          : 'bg-white border border-purple-200/70 text-slate-400 cursor-not-allowed'
                                      }`}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>
                                        {catDirtyUpdates.length > 0
                                          ? `Update (${catDirtyUpdates.length})`
                                          : 'Update'}
                                      </span>
                                    </button>
                                  </div>
                                </div>

                                <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse">
                                    <thead>
                                      <tr className="bg-[#FAF8F5] border-b border-purple-100 text-[11px] uppercase tracking-wider text-slate-500">
                                        <th className="py-2.5 px-4 w-48">Flavour / Item</th>
                                        <th className="py-2.5 px-4">Types, Price & Stock Count</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-purple-50 text-sm">
                                      {filteredFlavourGroups.map((fg) => (
                                        <tr
                                          key={`${shop.id}-${cat.id}-${fg.key}`}
                                          className="hover:bg-[#FAF8F5]/70 align-middle"
                                        >
                                          <td className="py-2.5 px-4 font-bold text-purple-950 text-xs sm:text-sm">
                                            {fg.flavourName}
                                          </td>
                                          <td className="py-2.5 px-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                              {fg.items.map((item) => {
                                                const alloc = shopStocks.find(
                                                  (ss) =>
                                                    ss.shop_id === shop.id &&
                                                    ss.item_id === item.id
                                                );
                                                const currentStock = alloc ? Number(alloc.stock) : 0;
                                                const draftKey = `${shop.id}::${item.id}`;
                                                const draftValue = Object.prototype.hasOwnProperty.call(
                                                  stockDrafts,
                                                  draftKey
                                                )
                                                  ? stockDrafts[draftKey]
                                                  : currentStock;

                                                return (
                                                  <SingleRowStockItemEditor
                                                    key={`${shop.id}-${cat.id}-${item.id}`}
                                                    item={item}
                                                    stock={currentStock}
                                                    value={draftValue}
                                                    onChange={(val) =>
                                                      setStockDrafts((prev) => ({
                                                        ...prev,
                                                        [draftKey]: val
                                                      }))
                                                    }
                                                  />
                                                );
                                              })}
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })
                          .filter(Boolean);

                        return (
                          <div
                            key={shop.id}
                            className="bg-white border border-purple-200 shadow-xs rounded-2xl overflow-hidden"
                          >
                            {/* Shop Section Header */}
                            <div className="px-5 py-3.5 bg-purple-900 text-white flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Store className="w-4 h-4 text-purple-200" />
                                <span className="font-bold text-sm">{shop.name}</span>
                                <span className="text-xs text-purple-200">
                                  ({shop.sales_profile_name})
                                </span>
                              </div>
                              <span className="text-xs font-semibold bg-purple-800 px-2.5 py-0.5 rounded-full">
                                Total Shop Stock:{' '}
                                {shopStocks
                                  .filter((ss) => ss.shop_id === shop.id)
                                  .reduce((sum, ss) => sum + (Number(ss.stock) || 0), 0)}
                              </span>
                            </div>

                            {/* Separate Category Sections Inside Shop */}
                            <div className="p-4 space-y-4">
                              {visibleCategoryBlocks.length === 0 ? (
                                <div className="text-center py-6 text-xs text-slate-400">
                                  No items matching "{stockUpdateSearchQuery}" in {shop.name}.
                                </div>
                              ) : (
                                visibleCategoryBlocks
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ADMIN TAB: MENU EDITOR (TABULAR VIEW PER CATEGORY, NO IMAGES, NO REMOVE ALL / ALL ITEMS VIEW) */}
          {adminTab === 'inventory' && isSuperAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Step 1 Category -> Step 2 Shop Expense % -> Step 3 Flavour / Item -> Step 4 Type / Product */}
              <div className="lg:col-span-4 space-y-6">
                {/* 1. Create Shared Category */}
                <form
                  onSubmit={handleAddCategory}
                  className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center gap-2 text-purple-950 font-bold">
                    <Layers className="w-5 h-5 text-purple-600" />
                    <h3>1. Create Category</h3>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Category Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Cake, Pastry, Donuts"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm shadow-sm transition-colors"
                  >
                    Create Category
                  </button>
                </form>

                {/* 2. Set Shop-Wise Category Expense % */}
                <form
                  onSubmit={handleSaveShopCategoryExpense}
                  className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center gap-2 text-purple-950 font-bold">
                    <Percent className="w-5 h-5 text-purple-600" />
                    <h3>2. Set Shop-Wise Expense %</h3>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Select Shop
                    </label>
                    <select
                      value={expenseConfigShopId}
                      onChange={(e) => setExpenseConfigShopId(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    >
                      {shops.length === 0 && <option value="">Create a shop first</option>}
                      {shops.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Select Category
                    </label>
                    <select
                      value={expenseConfigCategoryId}
                      onChange={(e) => setExpenseConfigCategoryId(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    >
                      {categories.length === 0 && <option value="">Create a category first</option>}
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Expense Percentage (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      required
                      value={expenseConfigRate}
                      onChange={(e) => setExpenseConfigRate(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={shops.length === 0 || categories.length === 0}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-100 hover:bg-purple-200 disabled:bg-slate-100 disabled:text-slate-400 text-purple-900 border border-purple-200 font-semibold text-sm transition-colors"
                  >
                    Save Shop Expense %
                  </button>
                </form>

                {/* 3. Add Flavour / Item under Category */}
                <form
                  onSubmit={handleAddSubcategory}
                  className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center gap-2 text-purple-950 font-bold">
                    <FolderTree className="w-5 h-5 text-purple-600" />
                    <h3>3. Add Flavour / Item</h3>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Parent Category
                    </label>
                    <select
                      value={newSubcategoryParentId}
                      onChange={(e) => setNewSubcategoryParentId(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    >
                      {categories.length === 0 && <option value="">Create a category first</option>}
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Flavour / Item Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Tender coconut, Butter scotch, Candle"
                      value={newSubcategoryName}
                      onChange={(e) => setNewSubcategoryName(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={categories.length === 0}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-100 hover:bg-purple-200 disabled:bg-slate-100 disabled:text-slate-400 text-purple-900 border border-purple-200 font-semibold text-sm transition-colors"
                  >
                    Save
                  </button>
                </form>

                {/* 4. Add Item - Type / Product */}
                <form
                  onSubmit={handleCreateItem}
                  className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center gap-2 text-purple-950 font-bold">
                    <Plus className="w-5 h-5 text-purple-600" />
                    <h3>4. Add Item</h3>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Category
                    </label>
                    <select
                      value={newItemCategory}
                      onChange={(e) => {
                        setNewItemCategory(e.target.value);
                        setNewItemSubcategory('');
                      }}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    >
                      {categories.length === 0 && <option value="">Create a category first</option>}
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Flavour / Item
                    </label>
                    <select
                      value={newItemSubcategory}
                      onChange={(e) => setNewItemSubcategory(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    >
                      <option value="">General / None</option>
                      {subcategories
                        .filter((sc) => sc.category_id === newItemCategory)
                        .map((sc) => (
                          <option key={sc.id} value={sc.id}>
                            {sc.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Item - Type / Product Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Medium, Large, Glass, Box etc"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Unit Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="450"
                      value={newItemPrice}
                      onChange={(e) => setNewItemPrice(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Product Image (Optional)
                    </label>
                    <div className="flex items-center gap-3">
                      <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#FAF8F5] border border-dashed border-purple-300 hover:border-purple-500 text-xs font-semibold text-purple-800 cursor-pointer">
                        <ImagePlus className="w-4 h-4" />
                        <span>{newItemImageUrl ? 'Change Image' : 'Upload Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleNewItemImageUpload}
                          className="hidden"
                        />
                      </label>
                      {newItemImageUrl && (
                        <img
                          src={newItemImageUrl}
                          alt="Preview"
                          className="w-11 h-11 rounded-xl object-cover border border-purple-200"
                        />
                      )}
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={categories.length === 0}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm shadow-sm transition-colors"
                  >
                    Add to Menu
                  </button>
                </form>
              </div>

              {/* Right Column: Tabular Grouped-by-Category View (Each Flavour's Data in a Single Row, No Images) */}
              <div className="lg:col-span-8 space-y-5">
                <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-purple-950 text-base">
                      Update Details (Grouped by Category)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Edit unit prices for any item and change the category for unbilled items directly in each row.
                    </p>
                  </div>
                  <div className="relative shrink-0">
                    <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search category, flavour, item..."
                      value={menuEditorSearchQuery}
                      onChange={(e) => setMenuEditorSearchQuery(e.target.value)}
                      className="bg-[#FAF8F5] border border-purple-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white w-full sm:w-56"
                    />
                    {menuEditorSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setMenuEditorSearchQuery('')}
                        aria-label="Clear menu editor search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {categories.length === 0 ? (
                  <div className="bg-white border border-dashed border-purple-200 rounded-2xl p-10 text-center text-xs text-slate-400">
                    No categories yet.
                  </div>
                ) : (() => {
                  const menuSearchQ = menuEditorSearchQuery.trim().toLowerCase();
                  const visibleMenuCategoryCards = categories
                    .map((cat) => {
                      const catItems = items.filter(
                        (it) => String(it.category_id) === String(cat.id)
                      );
                      const catSubcats = subcategories.filter(
                        (sc) => String(sc.category_id) === String(cat.id)
                      );

                      const flavourRows = [];
                      catSubcats.forEach((sc) => {
                        const scItems = catItems.filter(
                          (it) => String(it.subcategory_id) === String(sc.id)
                        );
                        if (scItems.length > 0) {
                          flavourRows.push({
                            key: sc.id,
                            subcategoryObj: sc,
                            flavourName: sc.name,
                            items: scItems
                          });
                        }
                      });
                      const generalItems = catItems.filter(
                        (it) =>
                          !it.subcategory_id ||
                          !catSubcats.some((sc) => String(sc.id) === String(it.subcategory_id))
                      );
                      generalItems.forEach((it) => {
                        flavourRows.push({
                          key: `${cat.id}-direct-${it.id}`,
                          subcategoryObj: null,
                          flavourName: it.name,
                          items: [it]
                        });
                      });

                      const catMatchesSearch =
                        !menuSearchQ || cat.name.toLowerCase().includes(menuSearchQ);
                      const filteredFlavourRows = catMatchesSearch
                        ? flavourRows
                        : flavourRows
                            .map((row) => {
                              if (row.flavourName.toLowerCase().includes(menuSearchQ)) {
                                return row;
                              }
                              const matchedItems = row.items.filter((it) =>
                                it.name.toLowerCase().includes(menuSearchQ)
                              );
                              return matchedItems.length > 0
                                ? { ...row, items: matchedItems }
                                : null;
                            })
                            .filter(Boolean);

                      if (menuSearchQ && !catMatchesSearch && filteredFlavourRows.length === 0) {
                        return null;
                      }

                      const categoryHasBilledItems =
                        catItems.some((it) => billedItemIds.has(it.id)) ||
                        bills.some((bill) =>
                          (bill.items || []).some(
                            (line) =>
                              (line.category_name || '').trim().toLowerCase() ===
                              cat.name.trim().toLowerCase()
                          )
                        );

                      return (
                        <div
                          key={cat.id}
                          className="bg-white border border-purple-100 shadow-xs rounded-2xl overflow-hidden"
                        >
                          <div className="px-5 py-3.5 bg-purple-50/70 border-b border-purple-100 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-purple-950 text-sm">
                                {cat.name}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white border border-purple-200 text-purple-800">
                                {catItems.length} {catItems.length === 1 ? 'item' : 'items'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-semibold text-purple-700">
                                Total Count:{' '}
                                {catItems.reduce(
                                  (sum, it) =>
                                    sum +
                                    shopStocks
                                      .filter((ss) => ss.item_id === it.id)
                                      .reduce((s, ss) => s + (Number(ss.stock) || 0), 0),
                                  0
                                )}
                              </span>
                              <button
                                type="button"
                                disabled={categoryHasBilledItems}
                                onClick={() => handleDeleteCategoryGroup(cat)}
                                title={
                                  categoryHasBilledItems
                                    ? `Cannot delete "${cat.name}" — it has billed items`
                                    : `Delete category "${cat.name}"`
                                }
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                                  categoryHasBilledItems
                                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                    : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700 cursor-pointer'
                                }`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete Category</span>
                              </button>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-[#FAF8F5] border-b border-purple-100 text-[11px] uppercase tracking-wider text-slate-500">
                                  <th className="py-2.5 px-4 w-48">Flavour / Item</th>
                                  <th className="py-2.5 px-4">Types, Stock Count & Price (₹)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-purple-50 text-sm">
                                {filteredFlavourRows.length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={2}
                                      className="py-6 text-center text-slate-400 text-xs"
                                    >
                                      No product types in {cat.name} yet.
                                    </td>
                                  </tr>
                                ) : (
                                  filteredFlavourRows.map((row) => {
                                    const subcatHasBilledItems =
                                      Boolean(row.subcategoryObj) &&
                                      (row.items.some((it) => billedItemIds.has(it.id)) ||
                                        bills.some((bill) =>
                                          (bill.items || []).some(
                                            (line) =>
                                              (line.subcategory_name || '').trim().toLowerCase() ===
                                                row.subcategoryObj.name.trim().toLowerCase() &&
                                              (line.category_name || '').trim().toLowerCase() ===
                                                cat.name.trim().toLowerCase()
                                          )
                                        ));

                                    return (
                                      <tr key={row.key} className="hover:bg-[#FAF8F5]/70 align-middle">
                                        <td className="py-2.5 px-4 font-bold text-purple-950 text-xs sm:text-sm">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="truncate">{row.flavourName}</span>
                                            {row.subcategoryObj && (
                                              <button
                                                type="button"
                                                disabled={subcatHasBilledItems}
                                                onClick={() =>
                                                  handleDeleteSubcategoryGroup(cat, row.subcategoryObj)
                                                }
                                                title={
                                                  subcatHasBilledItems
                                                    ? `Cannot delete "${row.flavourName}" — has billed items`
                                                    : `Delete sub-category "${row.flavourName}"`
                                                }
                                                className={`p-1 rounded-md border transition-colors shrink-0 ${
                                                  subcatHasBilledItems
                                                    ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed'
                                                    : 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-600 cursor-pointer'
                                                }`}
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-2.5 px-4">
                                          <div className="flex flex-wrap items-center gap-2">
                                            {row.items.map((it) => {
                                              const typeCount = shopStocks
                                                .filter((ss) => ss.item_id === it.id)
                                                .reduce((s, ss) => s + (Number(ss.stock) || 0), 0);
                                              return (
                                                <SingleRowFlavourItemEditor
                                                  key={it.id}
                                                  item={it}
                                                  categories={categories}
                                                  isBilled={billedItemIds.has(it.id)}
                                                  typeCount={typeCount}
                                                  onSave={handleUpdateCatalogItem}
                                                  onDeleteItem={handleDeleteCatalogItem}
                                                />
                                              );
                                            })}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                    .filter(Boolean);

                  return visibleMenuCategoryCards.length === 0 ? (
                    <div className="bg-white border border-dashed border-purple-200 rounded-2xl p-10 text-center text-xs text-slate-400">
                      No menu items matching "{menuEditorSearchQuery}".
                    </div>
                  ) : (
                    <div className="space-y-5">{visibleMenuCategoryCards}</div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* SHOP-ADMIN TAB: MY SHOP STOCK (SEPARATE TABLES PER CATEGORY, GROUPED BY FLAVOUR, CATEGORY-LEVEL UPDATE) */}
          {adminTab === 'shop-stock' && isShopAdmin && currentActiveShop && (
            <div className="space-y-5">
              <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-purple-950 text-base">
                    My Shop Stock — {currentActiveShop.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Separate category tables grouped by flavour with category-level stock updates.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-xl bg-purple-100 text-purple-900 text-xs font-bold">
                  Total Shop Stock:{' '}
                  {shopStocks
                    .filter((ss) => ss.shop_id === currentActiveShop.id)
                    .reduce((sum, ss) => sum + (Number(ss.stock) || 0), 0)}
                </span>
              </div>

              {categories.length === 0 ? (
                <div className="bg-white border border-dashed border-purple-200 rounded-2xl p-10 text-center text-xs text-slate-400">
                  No categories available yet.
                </div>
              ) : (
                <div className="space-y-5">
                  {categories.map((cat) => {
                    const catItems = items.filter(
                      (it) => String(it.category_id) === String(cat.id)
                    );
                    if (catItems.length === 0) return null;

                    const catSubcats = subcategories.filter(
                      (sc) => String(sc.category_id) === String(cat.id)
                    );
                    const flavourGroups = [];
                    catSubcats.forEach((sc) => {
                      const scItems = catItems.filter(
                        (it) => String(it.subcategory_id) === String(sc.id)
                      );
                      if (scItems.length > 0) {
                        flavourGroups.push({
                          key: sc.id,
                          flavourName: sc.name,
                          items: scItems
                        });
                      }
                    });
                    const generalCatItems = catItems.filter(
                      (it) =>
                        !it.subcategory_id ||
                        !catSubcats.some((sc) => String(sc.id) === String(it.subcategory_id))
                    );
                    generalCatItems.forEach((it) => {
                      flavourGroups.push({
                        key: `${cat.id}-direct-${it.id}`,
                        flavourName: it.name,
                        items: [it]
                      });
                    });

                    const catDirtyUpdates = catItems
                      .map((it) => {
                        const draftKey = `${currentActiveShop.id}::${it.id}`;
                        const hasDraft = Object.prototype.hasOwnProperty.call(
                          stockDrafts,
                          draftKey
                        );
                        if (!hasDraft || stockDrafts[draftKey] === '') return null;
                        const alloc = shopStocks.find(
                          (ss) =>
                            ss.shop_id === currentActiveShop.id && ss.item_id === it.id
                        );
                        const currentStock = alloc ? Number(alloc.stock) : 0;
                        const parsed = Math.max(
                          0,
                          parseInt(stockDrafts[draftKey], 10) || 0
                        );
                        if (parsed === currentStock) return null;
                        return {
                          shopId: currentActiveShop.id,
                          itemId: it.id,
                          stock: parsed
                        };
                      })
                      .filter(Boolean);

                    return (
                      <div
                        key={`shop-admin-${cat.id}`}
                        className="bg-white border border-purple-100 shadow-xs rounded-2xl overflow-hidden"
                      >
                        <div className="px-5 py-3.5 bg-purple-50/80 border-b border-purple-100 flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-purple-950 text-sm">
                            {cat.name}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-semibold text-purple-700">
                              Category Stock:{' '}
                              {catItems.reduce((sum, it) => {
                                const alloc = shopStocks.find(
                                  (ss) =>
                                    ss.shop_id === currentActiveShop.id && ss.item_id === it.id
                                );
                                return sum + (Number(alloc?.stock) || 0);
                              }, 0)}
                            </span>
                            <button
                              type="button"
                              disabled={catDirtyUpdates.length === 0}
                              onClick={() =>
                                handleBatchUpdateShopStock(catDirtyUpdates, 'stock')
                              }
                              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                catDirtyUpdates.length > 0
                                  ? 'bg-purple-700 hover:bg-purple-600 text-white shadow-sm cursor-pointer'
                                  : 'bg-white border border-purple-200/70 text-slate-400 cursor-not-allowed'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>
                                {catDirtyUpdates.length > 0
                                  ? `Update (${catDirtyUpdates.length})`
                                  : 'Update'}
                              </span>
                            </button>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#FAF8F5] border-b border-purple-100 text-[11px] uppercase tracking-wider text-slate-500">
                                <th className="py-2.5 px-4 w-48">Flavour / Item</th>
                                <th className="py-2.5 px-4">Types, Price & Stock Count</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-purple-50 text-sm">
                              {flavourGroups.map((fg) => (
                                <tr
                                  key={`shop-admin-${cat.id}-${fg.key}`}
                                  className="hover:bg-[#FAF8F5]/70 align-middle"
                                >
                                  <td className="py-2.5 px-4 font-bold text-purple-950 text-xs sm:text-sm">
                                    {fg.flavourName}
                                  </td>
                                  <td className="py-2.5 px-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {fg.items.map((item) => {
                                        const alloc = shopStocks.find(
                                          (ss) =>
                                            ss.shop_id === currentActiveShop.id &&
                                            ss.item_id === item.id
                                        );
                                        const currentStock = alloc ? Number(alloc.stock) : 0;
                                        const draftKey = `${currentActiveShop.id}::${item.id}`;
                                        const draftValue = Object.prototype.hasOwnProperty.call(
                                          stockDrafts,
                                          draftKey
                                        )
                                          ? stockDrafts[draftKey]
                                          : currentStock;

                                        return (
                                          <SingleRowStockItemEditor
                                            key={`shop-admin-${cat.id}-${item.id}`}
                                            item={item}
                                            stock={currentStock}
                                            value={draftValue}
                                            onChange={(val) =>
                                              setStockDrafts((prev) => ({
                                                ...prev,
                                                [draftKey]: val
                                              }))
                                            }
                                          />
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ADMIN TAB 3: SHOPS CREATION, DATABASE USERS & PASSWORD MANAGEMENT */}
          {adminTab === 'users' && isSuperAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Create Shop & Add New User to DB */}
              <div className="lg:col-span-4 space-y-6">
                <form
                  onSubmit={handleCreateShop}
                  className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center gap-2 text-purple-950 font-bold">
                    <Store className="w-5 h-5 text-purple-600" />
                    <h3>Create Shop</h3>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Shop Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Olive Cakes"
                      value={newShopName}
                      onChange={(e) => setNewShopName(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Unique Sales Profile Name (1 per Shop)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., POS-CITY-01"
                      value={newShopSalesProfile}
                      onChange={(e) => setNewShopSalesProfile(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Location (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., MG Road"
                      value={newShopLocation}
                      onChange={(e) => setNewShopLocation(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm shadow-sm transition-colors"
                  >
                    Create Shop
                  </button>
                </form>

                <form
                  onSubmit={handleAddDbUser}
                  className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4"
                >
                  <div className="flex items-center gap-2 text-purple-950 font-bold">
                    <UserPlus className="w-5 h-5 text-purple-600" />
                    <h3>Create User</h3>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., shop1_admin"
                      value={newUserUsername}
                      onChange={(e) => setNewUserUsername(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="Min 4 characters"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Role
                    </label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                    >
                      <option value="staff">Sales Profile / Cashier (Billing Only)</option>
                      <option value="shop-admin">Shop Admin (Billing + Shop Dashboard)</option>
                      <option value="admin">Super Admin (All Shops & Settings)</option>
                    </select>
                  </div>

                  {(newUserRole === 'shop-admin' || newUserRole === 'staff') && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Assign to Shop
                      </label>
                      <select
                        value={newUserShopId}
                        onChange={(e) => setNewUserShopId(e.target.value)}
                        className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                      >
                        {shops.length === 0 && <option value="">Create a shop first</option>}
                        {shops.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.sales_profile_name})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-semibold text-sm shadow-sm transition-colors"
                  >
                    Save User
                  </button>
                </form>
              </div>

              {/* Saved Database Users Table */}
              <div className="lg:col-span-8 bg-white border border-purple-100 shadow-xs rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-purple-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-purple-950 text-base">
                      Registered Users
                    </h3>
                    <p className="text-xs text-slate-500">
                      Manage User Accounts.
                    </p>
                  </div>
                  {currentLoggedInUser && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-800">
                      Signed in as: {currentLoggedInUser.username}
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#FAF8F5] border-b border-purple-100 text-xs uppercase tracking-wider text-slate-500">
                        <th className="py-3.5 px-5">Username</th>
                        <th className="py-3.5 px-4">Role & Shop</th>
                        <th className="py-3.5 px-4">Update Password</th>
                        <th className="py-3.5 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50 text-sm">
                      {dbUsers.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-10 text-center text-slate-400 text-xs">
                            No database users added yet. Add a user on the left to store credentials in Supabase.
                          </td>
                        </tr>
                      ) : (
                        dbUsers.map((u) => {
                          const assignedShopObj = shops.find((s) => s.id === u.shop_id);
                          return (
                            <UserRow
                              key={u.id}
                              user={u}
                              assignedShopName={assignedShopObj?.name}
                              onUpdatePassword={handleUpdateDbUserPassword}
                              onDelete={handleDeleteDbUser}
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
    </div>
  );
}

// Inline Single-Row Flavour Alert Item Editor (Used in Stock Alerts Grouped View)
function SingleRowStockAlertItemEditor({ entry, value, onChange }) {
  const isOut = entry.status === 'OUT_OF_STOCK';
  const isDirty = value !== '' && Number(value) !== Number(entry.stock);

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-2.5 rounded-xl px-3 py-2 shrink-0 border transition-all ${
        isDirty
          ? 'bg-purple-50/70 border-purple-400 ring-1 ring-purple-300/70'
          : isOut
          ? 'bg-rose-50/60 border-rose-200/80'
          : 'bg-amber-50/60 border-amber-200/80'
      }`}
    >
      {/* Non-editable read-only item metadata */}
      <div className="flex items-center gap-2">
        <div className="flex flex-col leading-tight">
          <span className="text-xs sm:text-sm font-bold text-slate-800">
            {entry.item.name}
          </span>
          <span className="text-[11px] font-medium text-slate-500">
            ₹{Number(entry.item.price).toFixed(2)}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            isOut
              ? 'bg-rose-100/90 text-rose-800 border-rose-200'
              : 'bg-amber-100/90 text-amber-800 border-amber-200'
          }`}
        >
          <AlertCircle className="w-3 h-3" />
          {isOut ? 'Out' : `${entry.stock} left`}
        </span>
      </div>

      {/* Editable stock count */}
      {onChange ? (
        <div className="flex items-center gap-1.5 pl-2.5 border-l border-purple-200/70">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Qty
          </span>
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`w-16 rounded-lg px-2 py-1 text-center text-sm font-bold focus:outline-none transition-colors ${
              isDirty
                ? 'bg-white border-2 border-purple-600 text-purple-950'
                : 'bg-white border border-purple-200 text-purple-950 focus:border-purple-600'
            }`}
          />
        </div>
      ) : (
        <span className="text-xs font-bold text-slate-800 pl-2 border-l border-purple-200/70">
          {entry.stock}
        </span>
      )}
    </div>
  );
}

// Inline Single-Row Flavour Stock Item Editor (Used in Stock Update Grouped View)
function SingleRowStockItemEditor({ item, stock, value, onChange }) {
  const isDirty = value !== '' && Number(value) !== Number(stock);

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-2.5 rounded-xl px-3 py-2 shrink-0 border transition-all ${
        isDirty
          ? 'bg-purple-50/70 border-purple-400 ring-1 ring-purple-300/70'
          : 'bg-[#FAF8F5] border-purple-100'
      }`}
    >
      {/* Non-editable read-only item metadata */}
      <div className="flex flex-col leading-tight">
        <span className="text-xs sm:text-sm font-bold text-slate-800">
          {item.name}
        </span>
        <span className="text-[11px] font-medium text-slate-500">
          ₹{Number(item.price).toFixed(2)}
        </span>
      </div>

      {/* Editable stock count */}
      <div className="flex items-center gap-1.5 pl-2.5 border-l border-purple-200/70">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Qty
        </span>
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-16 rounded-lg px-2 py-1 text-center text-sm font-bold focus:outline-none transition-colors ${
            isDirty
              ? 'bg-white border-2 border-purple-600 text-purple-950'
              : 'bg-white border border-purple-200 text-purple-950 focus:border-purple-600'
          }`}
        />
      </div>
    </div>
  );
}

// Helper Component for Tree Inventory Stock Inline Editing (Shop -> Category -> Flavour -> Item Type)
function TreeStockEditRow({ flavourLabel, item, stock, onUpdate }) {
  const [qty, setQty] = useState(stock);
  const isDirty = Number(qty) !== Number(stock);

  useEffect(() => {
    setQty(stock);
  }, [stock]);

  return (
    <tr className="hover:bg-[#FAF8F5]/80">
      <td className="py-3 px-4 font-bold text-purple-950 text-sm whitespace-nowrap">
        {flavourLabel || ''}
      </td>
      <td className="py-3 px-4 font-semibold text-slate-900 text-sm">
        {item.name}
      </td>
      <td className="py-3 px-4 text-slate-700 font-medium text-sm">
        ₹{Number(item.price).toFixed(2)}
      </td>
      <td className="py-3 px-4 text-right">
        <div className="inline-flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-20 bg-[#FAF8F5] border border-purple-200 rounded-lg px-2.5 py-1 text-center text-sm font-bold text-purple-950 focus:outline-none focus:border-purple-600 focus:bg-white"
          />
          <button
            type="button"
            disabled={!isDirty}
            onClick={() => onUpdate(qty)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isDirty
                ? 'bg-purple-700 hover:bg-purple-600 text-white shadow-xs cursor-pointer'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            Update
          </button>
        </div>
      </td>
    </tr>
  );
}

// Inline Single-Row Flavour Type, Category (Unbilled) & Price Editor
function SingleRowFlavourItemEditor({
  item,
  categories = [],
  isBilled = false,
  typeCount = 0,
  onSave,
  onDeleteItem
}) {
  const [typeName, setTypeName] = useState(item.name);
  const [price, setPrice] = useState(item.price);
  const [categoryId, setCategoryId] = useState(item.category_id || '');

  const isDirty =
    typeName.trim() !== item.name ||
    Number(price) !== Number(item.price) ||
    (!isBilled && categoryId !== (item.category_id || ''));

  useEffect(() => {
    setTypeName(item.name);
    setPrice(item.price);
    setCategoryId(item.category_id || '');
  }, [item.name, item.price, item.category_id]);

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5 bg-[#FAF8F5] border border-purple-200/80 rounded-lg px-2.5 py-1.5 shrink-0">
      <input
        type="text"
        value={typeName}
        onChange={(e) => setTypeName(e.target.value)}
        className="w-24 bg-white border border-purple-200 rounded px-2 py-1 text-sm font-bold text-slate-900 focus:outline-none focus:border-purple-600"
      />
      <span
        className={`px-2 py-1 rounded text-xs font-bold ${
          typeCount > 0
            ? 'bg-emerald-100 text-emerald-900'
            : 'bg-slate-200/70 text-slate-600'
        }`}
        title="Total stock across shops"
      >
        ({typeCount})
      </span>
      <select
        value={categoryId}
        disabled={isBilled}
        onChange={(e) => setCategoryId(e.target.value)}
        title={
          isBilled
            ? 'Category is locked because this item already has billed records'
            : 'Change category for this unbilled item'
        }
        className={`max-w-[115px] rounded px-1.5 py-1 text-xs font-semibold border focus:outline-none ${
          isBilled
            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
            : 'bg-white border-purple-200 text-purple-900 focus:border-purple-600 cursor-pointer'
        }`}
      >
        {categories.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
        ))}
      </select>
      <span className="text-xs font-bold text-purple-700 ml-0.5">₹</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className="w-20 bg-white border border-purple-200 rounded px-2 py-1 text-sm font-bold text-purple-950 focus:outline-none focus:border-purple-600"
      />
      <button
        type="button"
        disabled={!isDirty}
        onClick={() =>
          onSave(
            item.id,
            price,
            isBilled ? item.category_id : categoryId,
            categoryId === item.category_id ? item.subcategory_id : null,
            item.image_url,
            typeName
          )
        }
        className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
          isDirty
            ? 'bg-purple-700 hover:bg-purple-600 text-white cursor-pointer'
            : 'bg-slate-200/70 text-slate-400 cursor-not-allowed'
        }`}
      >
        Save
      </button>
      {onDeleteItem && (
        <button
          type="button"
          disabled={isBilled}
          onClick={() => onDeleteItem(item)}
          title={
            isBilled
              ? 'Cannot delete item because it already exists in generated bills'
              : `Delete item "${item.name}"`
          }
          className={`p-1 rounded transition-colors ${
            isBilled
              ? 'text-slate-300 cursor-not-allowed'
              : 'text-rose-600 hover:bg-rose-100 cursor-pointer'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// Reusable Searchable Dropdown Component for Assign Stock to Shop
function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No options available'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(clean));
  }, [options, query]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          setQuery('');
        }}
        className="w-full flex items-center justify-between gap-2 bg-[#FAF8F5] border border-purple-100 hover:border-purple-300 rounded-xl px-3.5 py-2.5 text-sm text-left text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white transition-colors"
      >
        <span className={`truncate ${selectedOption ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
          {selectedOption ? selectedOption.label : options.length === 0 ? emptyMessage : placeholder}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-purple-500 shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-purple-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-purple-100 bg-[#FAF8F5]">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-purple-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                placeholder={searchPlaceholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-white border border-purple-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto divide-y divide-purple-50">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-xs text-slate-400 text-center">
                {options.length === 0 ? emptyMessage : 'No matching options'}
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={`${opt.value}-${opt.label}`}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-purple-100 text-purple-950 font-bold'
                        : 'text-slate-700 hover:bg-purple-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Component for Inline Database User Password Management
function UserRow({ user, assignedShopName, onUpdatePassword, onDelete }) {
  const [passDraft, setPassDraft] = useState('');

  const handleSavePass = () => {
    if (!passDraft.trim()) return;
    onUpdatePassword(user.id, passDraft);
    setPassDraft('');
  };

  return (
    <tr className="hover:bg-[#FAF8F5]/80">
      <td className="py-3.5 px-5 font-semibold text-slate-900">{user.username}</td>
      <td className="py-3.5 px-4">
        <span className="px-2.5 py-1 rounded-md bg-purple-100 text-purple-800 text-xs font-semibold uppercase">
          {user.role}
        </span>
        {assignedShopName && (
          <span className="block text-xs text-slate-500 mt-1">Shop: {assignedShopName}</span>
        )}
      </td>
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-2">
          <input
            type="password"
            placeholder="New password"
            value={passDraft}
            onChange={(e) => setPassDraft(e.target.value)}
            className="w-36 bg-[#FAF8F5] border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
          />
          <button
            type="button"
            disabled={passDraft.trim().length < 4}
            onClick={handleSavePass}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              passDraft.trim().length >= 4
                ? 'bg-purple-700 hover:bg-purple-600 text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            Save Password
          </button>
        </div>
      </td>
      <td className="py-3.5 px-5 text-right">
        <button
          type="button"
          onClick={() => onDelete(user)}
          title="Delete user"
          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}