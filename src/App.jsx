import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  X,
  Loader2,
  Save,
  ClipboardList,
  Clock,
  Phone,
  Sparkles,
  Globe,
  Edit3,
  Printer
} from 'lucide-react';
import MenuItemEditor from './components/MenuItemEditor.jsx';
import SearchableSelect from './components/SearchableSelect.jsx';
import StockItemEditor from './components/StockItemEditor.jsx';

const compressImageToDataUrl = (file, maxDimension = 480) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const image = new Image();
      image.onload = () => {
        let { width, height } = image;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      image.onerror = reject;
      image.src = event.target.result;
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
const COMMON_ERROR_MESSAGE = 'An error occured Contact Admin';
const ORDERS_FALLBACK_STORAGE_KEY = 'olive_pos_orders_fallback';
const BILL_SALES_CHANNELS = [
  { id: 'shop_pos', label: 'Shop POS' },
  { id: 'zomato', label: 'Zomato' },
  { id: 'swiggy', label: 'Swiggy' }
];
const getBillSalesChannel = (bill) =>
  BILL_SALES_CHANNELS.some((channel) => channel.id === bill?.sales_channel)
    ? bill.sales_channel
    : 'shop_pos';
const getBillSalesChannelLabel = (bill) =>
  BILL_SALES_CHANNELS.find((channel) => channel.id === getBillSalesChannel(bill))?.label ||
  'Shop POS';
const isPlatformSale = (bill) =>
  bill?.payment_method === 'Online' || getBillSalesChannel(bill) !== 'shop_pos';
const isItemDisplayed = (item) => item?.is_displayed !== false;
const isItemAvailableAtShop = (item, shopId) =>
  !shopId ||
  !Array.isArray(item?.available_shop_ids) ||
  item.available_shop_ids.some((availableShopId) => String(availableShopId) === String(shopId));

const getLocalDateStr = (dateObj = new Date()) => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const formatTime12Hour = (timeStr) => {
  if (!timeStr) return '--:--';
  const [hRaw, mRaw] = timeStr.split(':');
  const h = parseInt(hRaw, 10);
  if (isNaN(h)) return timeStr;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${mRaw || '00'} ${suffix}`;
};

const formatLongDate = (dateStr, shortMonth = false) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: shortMonth ? 'short' : 'long',
    day: 'numeric',
    year: 'numeric'
  });
};

const loadFallbackOrders = () => {
  try {
    const raw = localStorage.getItem(ORDERS_FALLBACK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveFallbackOrders = (ordersList) => {
  try {
    localStorage.setItem(ORDERS_FALLBACK_STORAGE_KEY, JSON.stringify(ordersList));
  } catch {
    // Ignore storage quota errors
  }
};

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

  // Stock Transfer Cascading Dropdown States (From Shop -> To Shop -> Category -> Flavour -> Item Type -> Qty)
  const [transferFromShopId, setTransferFromShopId] = useState('');
  const [transferToShopId, setTransferToShopId] = useState('');
  const [transferCategoryId, setTransferCategoryId] = useState('');
  const [transferSubcategoryId, setTransferSubcategoryId] = useState('');
  const [transferItemId, setTransferItemId] = useState('');
  const [transferQty, setTransferQty] = useState('');

  // Unified Stock Management Filters & Add-Stock Draft Map
  const [stockAlertStatusFilter, setStockAlertStatusFilter] = useState('ALL');
  const [stockUpdateShopFilter, setStockUpdateShopFilter] = useState('ALL');
  const [stockUpdateCategoryFilter, setStockUpdateCategoryFilter] = useState('ALL');
  const [stockGlanceFlavourFilter, setStockGlanceFlavourFilter] = useState('ALL');
  const [stockGlanceItemTypeFilter, setStockGlanceItemTypeFilter] = useState('ALL');
  const [stockUpdateSearchQuery, setStockUpdateSearchQuery] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState(2);
  const [menuEditorSearchQuery, setMenuEditorSearchQuery] = useState('');
  const [menuItemDrafts, setMenuItemDrafts] = useState({});
  const [savingMenuCategoryIds, setSavingMenuCategoryIds] = useState(() => new Set());
  const [stockDrafts, setStockDrafts] = useState({});
  const handleMenuItemDraftChange = useCallback((itemId, draft) => {
    setMenuItemDrafts((current) => {
      if (draft == null) {
        if (!Object.prototype.hasOwnProperty.call(current, itemId)) return current;
        const next = { ...current };
        delete next[itemId];
        return next;
      }
      return { ...current, [itemId]: draft };
    });
  }, []);

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

  // Sales POS Orders State (Accept Order + Advance Billing + Due Billing on Order Date)
  const [orders, setOrders] = useState(() => loadFallbackOrders());
  const [isOrdersTableAvailable, setIsOrdersTableAvailable] = useState(false);
  const [orderDueViewMode, setOrderDueViewMode] = useState('due');
  const [orderTypeInput, setOrderTypeInput] = useState('Regular');
  const [orderCustomerNameInput, setOrderCustomerNameInput] = useState('');
  const [orderContactPhoneInput, setOrderContactPhoneInput] = useState('');
  const [orderDateTimeInput, setOrderDateTimeInput] = useState(() => `${getLocalDateStr()}T18:00`);
  const [orderCategoryId, setOrderCategoryId] = useState('');
  const [orderCakeFlavorInput, setOrderCakeFlavorInput] = useState('');
  const [orderCustomFlavorInput, setOrderCustomFlavorInput] = useState('');
  const [orderCakeSizeInput, setOrderCakeSizeInput] = useState('');
  const [orderCustomSizeInput, setOrderCustomSizeInput] = useState('');
  const [orderThemeSpecsInput, setOrderThemeSpecsInput] = useState('');
  const [orderDesignImageUrl, setOrderDesignImageUrl] = useState('');
  const [orderWishesInput, setOrderWishesInput] = useState('');
  const [orderTotalInput, setOrderTotalInput] = useState('');
  const [orderAdvanceInput, setOrderAdvanceInput] = useState('');
  const [orderAdvancePaymentMethod, setOrderAdvancePaymentMethod] = useState('Cash');
  const [orderSplitCashAmount, setOrderSplitCashAmount] = useState('');
  const [orderSplitUpiAmount, setOrderSplitUpiAmount] = useState('');

  // Admin Orders Dashboard State
  const [adminOrdersDate, setAdminOrdersDate] = useState(() => getLocalDateStr());
  const [adminOrdersShopFilter, setAdminOrdersShopFilter] = useState('ALL');
  const [printReportCategoryFilter, setPrintReportCategoryFilter] = useState('ALL');
  const [editingOrder, setEditingOrder] = useState(null);
  const [isSavingOrderEdit, setIsSavingOrderEdit] = useState(false);

  // Sales POS Cart State
  const [cart, setCart] = useState([]);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [salesChannel, setSalesChannel] = useState('shop_pos');
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
  const [billSalesChannelFilter, setBillSalesChannelFilter] = useState('ALL');
  const [billShopFilter, setBillShopFilter] = useState('ALL');
  const [editingBillDateId, setEditingBillDateId] = useState(null);
  const [billDateDraft, setBillDateDraft] = useState('');
  const [processingBillAction, setProcessingBillAction] = useState(null);

  // UI Feedback State
  const [toast, setToast] = useState(null);

  // Submit / Action Loading States (prevent duplicate clicks)
  const [isGeneratingBill, setIsGeneratingBill] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isCreatingShop, setIsCreatingShop] = useState(false);
  const [isAssigningStock, setIsAssigningStock] = useState(false);
  const [isTransferringStock, setIsTransferringStock] = useState(false);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [isSavingExpenseConfig, setIsSavingExpenseConfig] = useState(false);
  const [isAddingSubcategory, setIsAddingSubcategory] = useState(false);
  const [updatingBatchKey, setUpdatingBatchKey] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handlePrintReportSection = (sectionKey) => {
    document.body.dataset.printReport = sectionKey;
    try {
      window.print();
    } finally {
      delete document.body.dataset.printReport;
    }
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
      const categoriesPromise = supabase.request('categories?select=*&order=name.asc');
      const itemsPromise = supabase.request(
        'items?select=id,name,category_id,subcategory_id,price,stock,is_displayed,available_shop_ids,updated_at&order=name.asc'
      );
      const billsPromise = supabase.request('bills?select=*&order=created_at.desc&limit=500');
      const billItemsPromise = supabase.request(
        'bill_items?select=*&order=created_at.desc&limit=2500'
      );

      const subcategoriesPromise = supabase
        .request('subcategories?select=*&order=name.asc')
        .catch(() => null);
      const shopsPromise = supabase.request('shops?select=*&order=name.asc').catch(() => null);
      const shopStocksPath =
        currentLoggedInUser?.role === 'shop-admin' && currentLoggedInUser.shop_id
          ? `shop_stocks?select=*&shop_id=eq.${encodeURIComponent(currentLoggedInUser.shop_id)}`
          : 'shop_stocks?select=*';
      const shopStocksPromise = supabase.request(shopStocksPath).catch(() => null);
      const isCurrentUserShopAdmin = currentLoggedInUser?.role === 'shop-admin';
      if (isCurrentUserShopAdmin) {
        shopsPromise.then((data) => setShops(data || []));
      }
      const shopCategoryExpensesPromise = supabase
        .request('shop_category_expenses?select=*')
        .catch(() => null);
      const usersPromise = supabase
        .request('app_users?select=*&order=created_at.asc')
        .catch(() => null);
      const ordersPromise = supabase
        .request(
          'orders?select=id,order_ref,order_type,customer_name,contact_phone,order_date,order_time,cake_flavor,cake_size,theme_specs,wishes_on_cake,total_amount,advance_paid,balance_due,status,shop_id,advance_bill_id,created_at&order=order_date.asc,created_at.desc'
        )
        .catch(() => null);

      const [catsData, itemsData, shopsData, shopStocksData] = await Promise.all([
        categoriesPromise,
        itemsPromise,
        isCurrentUserShopAdmin ? Promise.resolve(null) : shopsPromise,
        shopStocksPromise
      ]);
      setCategories(catsData || []);
      setItems(itemsData || []);
      setShops(shopsData || []);
      setShopStocks(shopStocksData || []);
      setIsLiveSupabase(true);

      if (!itemsData || itemsData.length === 0) {
        setCart([]);
        setLatestGeneratedBill(null);
        setAssignItemId('');
      }

      if (!isCurrentUserShopAdmin && (!shopsData || shopsData.length === 0)) {
        setActiveShopId('');
        setAssignShopId('');
        setNewUserShopId('');
        setExpenseConfigShopId('');
      }

      const [
        billsData,
        billItemsData,
        subcatsData,
        shopCatExpData,
        usersData,
        ordersData
      ] = await Promise.all([
        billsPromise,
        billItemsPromise,
        subcategoriesPromise,
        shopCategoryExpensesPromise,
        usersPromise,
        ordersPromise
      ]);
      const billItemsByBillId = new Map();
      (billItemsData || []).forEach((billItem) => {
        const billItems = billItemsByBillId.get(billItem.bill_id);
        if (billItems) {
          billItems.push(billItem);
        } else {
          billItemsByBillId.set(billItem.bill_id, [billItem]);
        }
      });
      const billsWithItems = (billsData || []).map((b) => ({
        ...b,
        items: billItemsByBillId.get(b.id) || []
      }));

      setBills(billsWithItems);
      setSubcategories(subcatsData || []);
      setShopCategoryExpenses(shopCatExpData || []);
      setDbUsers(usersData || []);

      if (currentLoggedInUser) {
        const refreshedUser = (usersData || []).find(
          (user) => String(user.id) === String(currentLoggedInUser.id)
        );
        const userChanged =
          refreshedUser &&
          Object.keys(refreshedUser).some(
            (key) => refreshedUser[key] !== currentLoggedInUser[key]
          );

        if (userChanged) {
          setCurrentLoggedInUser(refreshedUser);
          if (refreshedUser.shop_id && refreshedUser.shop_id !== currentLoggedInUser.shop_id) {
            setActiveShopId(refreshedUser.shop_id);
          }
          const activeSession = loadActiveSession();
          if (activeSession) {
            try {
              localStorage.setItem(
                AUTH_SESSION_STORAGE_KEY,
                JSON.stringify({
                  user: refreshedUser,
                  expiresAt: activeSession.expiresAt
                })
              );
            } catch {
              // Ignore storage quota errors
            }
          }
        }
      }

      if (ordersData !== null) {
        setOrders(ordersData || []);
        setIsOrdersTableAvailable(true);
      } else {
        setIsOrdersTableAvailable(false);
        setOrders(loadFallbackOrders());
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
      if (!silent) showToast(COMMON_ERROR_MESSAGE, 'error');
    }
  };

  const syncFromSupabaseRef = useRef(syncFromSupabase);
  syncFromSupabaseRef.current = syncFromSupabase;
  const hasSyncedForAuthSessionRef = useRef(false);

  useEffect(() => {
    if (!isAdminAuthenticated) {
      hasSyncedForAuthSessionRef.current = false;
      return;
    }
    if (!supabase.isConfigured()) return;
    if (!hasSyncedForAuthSessionRef.current) {
      hasSyncedForAuthSessionRef.current = true;
      syncFromSupabaseRef.current(true);
    }

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
  }, [isAdminAuthenticated, supabase]);

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
      if (!categories.some((c) => c.id === transferCategoryId)) {
        setTransferCategoryId(categories[0].id);
      }
    }
  }, [categories, newItemCategory, newSubcategoryParentId, expenseConfigCategoryId, assignCategoryId, transferCategoryId]);

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
      if (!transferFromShopId || !shops.some((s) => s.id === transferFromShopId)) {
        setTransferFromShopId(shops[0].id);
      }
      if (
        !transferToShopId ||
        !shops.some((s) => s.id === transferToShopId) ||
        (shops.length > 1 && transferToShopId === transferFromShopId)
      ) {
        const otherShop = shops.find((s) => s.id !== (transferFromShopId || shops[0].id));
        setTransferToShopId(otherShop ? otherShop.id : shops[0].id);
      }
      if (!newUserShopId || !shops.some((s) => s.id === newUserShopId)) {
        setNewUserShopId(shops[0].id);
      }
      if (!expenseConfigShopId || !shops.some((s) => s.id === expenseConfigShopId)) {
        setExpenseConfigShopId(shops[0].id);
      }
    }
  }, [shops, currentLoggedInUser, activeShopId, assignShopId, transferFromShopId, transferToShopId, newUserShopId, expenseConfigShopId]);

  // Keep Stock Assignment cascading dropdowns (Category -> Flavour -> Item Type) synchronized
  const getDistinctByName = (list = []) => {
    const seen = new Set();
    return list.filter((entry) => {
      const key = (entry?.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const distinctShops = useMemo(() => getDistinctByName(shops), [shops]);
  const distinctCategories = useMemo(() => getDistinctByName(categories), [categories]);

  const assignCategorySubcategories = useMemo(() => {
    if (!assignCategoryId) return [];
    return getDistinctByName(
      subcategories.filter((sc) => sc.category_id === assignCategoryId)
    );
  }, [subcategories, assignCategoryId]);

  const assignFilteredItems = useMemo(() => {
    return items.filter((it) => {
      if (!isItemDisplayed(it) || !isItemAvailableAtShop(it, assignShopId)) return false;
      if (!assignCategoryId) return true;
      if (it.category_id !== assignCategoryId) return false;
      if (assignSubcategoryId === 'GENERAL') {
        return !it.subcategory_id;
      }
      if (assignSubcategoryId) {
        return it.subcategory_id === assignSubcategoryId;
      }
      return true;
    });
  }, [items, assignCategoryId, assignSubcategoryId, assignShopId]);

  useEffect(() => {
    if (assignFilteredItems.length > 0) {
      if (!assignFilteredItems.some((i) => i.id === assignItemId)) {
        setAssignItemId(assignFilteredItems[0].id);
      }
    } else {
      setAssignItemId('');
    }
  }, [assignFilteredItems, assignItemId]);

  // Keep Stock Transfer cascading dropdowns (Category -> Flavour -> Item Type) synchronized
  const transferCategorySubcategories = useMemo(() => {
    if (!transferCategoryId) return [];
    return getDistinctByName(
      subcategories.filter((sc) => sc.category_id === transferCategoryId)
    );
  }, [subcategories, transferCategoryId]);

  const transferFilteredItems = useMemo(() => {
    return items.filter((it) => {
      if (
        !isItemDisplayed(it) ||
        !isItemAvailableAtShop(it, transferFromShopId) ||
        !isItemAvailableAtShop(it, transferToShopId)
      ) {
        return false;
      }
      if (!transferCategoryId) return true;
      if (it.category_id !== transferCategoryId) return false;
      if (transferSubcategoryId === 'GENERAL') {
        return !it.subcategory_id;
      }
      if (transferSubcategoryId) {
        return it.subcategory_id === transferSubcategoryId;
      }
      return true;
    });
  }, [items, transferCategoryId, transferSubcategoryId, transferFromShopId, transferToShopId]);

  useEffect(() => {
    if (transferFilteredItems.length > 0) {
      if (!transferFilteredItems.some((i) => i.id === transferItemId)) {
        setTransferItemId(transferFilteredItems[0].id);
      }
    } else {
      setTransferItemId('');
    }
  }, [transferFilteredItems, transferItemId]);

  const transferSourceAvailableStock = useMemo(() => {
    if (!transferFromShopId || !transferItemId) return 0;
    const alloc = shopStocks.find(
      (ss) => ss.shop_id === transferFromShopId && ss.item_id === transferItemId
    );
    return alloc ? Number(alloc.stock) : 0;
  }, [shopStocks, transferFromShopId, transferItemId]);

  const isSuperAdmin = currentLoggedInUser?.role === 'superadmin';
  const isAdmin = isSuperAdmin || currentLoggedInUser?.role === 'admin';
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
      console.error(err);
      setLoginError(COMMON_ERROR_MESSAGE);
      showToast(COMMON_ERROR_MESSAGE, 'error');
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
    if (isAddingUser) return;
    if (newUserRole === 'superadmin' && !isSuperAdmin) {
      showToast('Only a Super Admin can create a Super Admin account.', 'error');
      return;
    }
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

    setIsAddingUser(true);
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
      showToast(`User "${cleanUser}" (${newUserRole}) saved successfully!`);
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    } finally {
      setIsAddingUser(false);
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
      showToast('User password updated successfully!');
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    }
  };

  const handleUpdateDbUserRole = async (userId, updatedRole, selectedShopId) => {
    if (!isSuperAdmin) {
      showToast('Only a Super Admin can change user roles.', 'error');
      return;
    }
    if (String(userId) === String(currentLoggedInUser?.id)) {
      showToast('You cannot change your own role.', 'error');
      return;
    }

    const validRoles = ['staff', 'shop-admin', 'admin', 'superadmin'];
    if (!validRoles.includes(updatedRole)) {
      showToast('Select a valid user role.', 'error');
      return;
    }
    const roleNeedsShop = updatedRole === 'staff' || updatedRole === 'shop-admin';
    const assignedShopExists = shops.some(
      (shop) => String(shop.id) === String(selectedShopId)
    );
    if (roleNeedsShop && !assignedShopExists) {
      showToast('Select a shop for this user role.', 'error');
      return;
    }

    try {
      if (isLiveSupabase) {
        const updatedUsers = await supabase.request(
          `app_users?id=eq.${encodeURIComponent(userId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              role: updatedRole,
              shop_id: roleNeedsShop ? selectedShopId : null
            })
          }
        );
        if (!updatedUsers?.[0]) throw new Error('User role was not updated.');
        await syncFromSupabase(true);
      } else {
        setDbUsers((previousUsers) =>
          previousUsers.map((user) =>
            user.id === userId
              ? {
                  ...user,
                  role: updatedRole,
                  shop_id: roleNeedsShop ? selectedShopId : null
                }
              : user
          )
        );
      }
      showToast('User role updated. They must sign in again for it to take effect.');
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
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
      showToast(`User "${user.username}" removed successfully.`);
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    }
  };

  const handleSaveBillDate = async (bill) => {
    if (!isSuperAdmin || processingBillAction || !billDateDraft) return;

    const originalDate = new Date(bill.created_at);
    const [year, month, day] = billDateDraft.split('-').map(Number);
    const updatedDate = new Date(originalDate);
    updatedDate.setFullYear(year, month - 1, day);
    if (
      Number.isNaN(originalDate.getTime()) ||
      Number.isNaN(updatedDate.getTime()) ||
      getLocalDateStr(updatedDate) !== billDateDraft
    ) {
      showToast('Choose a valid bill date.', 'error');
      return;
    }

    setProcessingBillAction({ id: bill.id, action: 'date' });
    try {
      let updatedAt = updatedDate.toISOString();
      if (isLiveSupabase) {
        const updatedBills = await supabase.request(
          `bills?id=eq.${encodeURIComponent(bill.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ created_at: updatedAt })
          }
        );
        if (!updatedBills?.[0]) throw new Error('Bill was not updated.');
        updatedAt = updatedBills[0].created_at;
      }

      setBills((previousBills) =>
        previousBills.map((currentBill) =>
          currentBill.id === bill.id ? { ...currentBill, created_at: updatedAt } : currentBill
        )
      );
      setEditingBillDateId(null);
      setBillDateDraft('');
      showToast(`Bill ${bill.bill_number} date updated.`);
    } catch (err) {
      console.error(err);
      showToast('Could not update the bill date. Please try again.', 'error');
    } finally {
      setProcessingBillAction(null);
    }
  };

  const handleDeleteBill = async (bill) => {
    if (!isSuperAdmin || processingBillAction) return;
    const confirmed = window.confirm(
      `Delete bill ${bill.bill_number} and its line items? Stock and linked order records will not change.`
    );
    if (!confirmed) return;

    setProcessingBillAction({ id: bill.id, action: 'delete' });
    try {
      if (isLiveSupabase) {
        const deletedBills = await supabase.request(
          `bills?id=eq.${encodeURIComponent(bill.id)}`,
          { method: 'DELETE' }
        );
        if (!deletedBills?.length) throw new Error('Bill was not deleted.');
      }

      setBills((previousBills) => previousBills.filter((currentBill) => currentBill.id !== bill.id));
      if (editingBillDateId === bill.id) {
        setEditingBillDateId(null);
        setBillDateDraft('');
      }
      showToast(`Bill ${bill.bill_number} deleted.`);
    } catch (err) {
      console.error(err);
      showToast('Could not delete the bill. Please try again.', 'error');
    } finally {
      setProcessingBillAction(null);
    }
  };

  // ============================================================================
  // SHOP CREATION & STOCK ALLOCATION HANDLERS (ADMIN)
  // ============================================================================
  const handleCreateShop = async (e) => {
    e.preventDefault();
    if (isCreatingShop) return;
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

    setIsCreatingShop(true);
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
      showToast(`Shop "${cleanShop}" created successfully!`);
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    } finally {
      setIsCreatingShop(false);
    }
  };

  const handleAssignStockToShop = async (e) => {
    e.preventDefault();
    if (isAssigningStock) return;
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
    if (!isItemDisplayed(masterItem) || !isItemAvailableAtShop(masterItem, assignShopId)) {
      showToast('This item is hidden or unavailable for the selected shop.', 'error');
      return;
    }

    const existingAllocation = shopStocks.find(
      (ss) => ss.shop_id === assignShopId && ss.item_id === assignItemId
    );
    const nextShopStock = (existingAllocation ? Number(existingAllocation.stock) : 0) + qtyToAdd;

    setIsAssigningStock(true);
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
      showToast(`Assigned +${qtyToAdd} units of "${masterItem.name}" to ${targetShop?.name || 'Shop'} successfully!`);
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    } finally {
      setIsAssigningStock(false);
    }
  };

  const handleTransferStockBetweenShops = async (e) => {
    e.preventDefault();
    if (isTransferringStock) return;
    if (!transferFromShopId || !transferToShopId || !transferItemId) {
      showToast('Select From Shop, To Shop, and Item Type.', 'error');
      return;
    }
    if (transferFromShopId === transferToShopId) {
      showToast('Source and destination shops must be different.', 'error');
      return;
    }
    const qtyToTransfer = parseInt(transferQty, 10);
    if (isNaN(qtyToTransfer) || qtyToTransfer <= 0) {
      showToast('Enter a valid transfer quantity greater than 0.', 'error');
      return;
    }

    const masterItem = items.find((i) => i.id === transferItemId);
    if (!masterItem) return;
    if (
      !isItemDisplayed(masterItem) ||
      !isItemAvailableAtShop(masterItem, transferFromShopId) ||
      !isItemAvailableAtShop(masterItem, transferToShopId)
    ) {
      showToast('This item is hidden or unavailable in one of the selected shops.', 'error');
      return;
    }

    const fromAlloc = shopStocks.find(
      (ss) => ss.shop_id === transferFromShopId && ss.item_id === transferItemId
    );
    const currentFromStock = fromAlloc ? Number(fromAlloc.stock) : 0;
    if (qtyToTransfer > currentFromStock) {
      showToast(
        `Only ${currentFromStock} units available in the source shop to transfer.`,
        'error'
      );
      return;
    }

    const toAlloc = shopStocks.find(
      (ss) => ss.shop_id === transferToShopId && ss.item_id === transferItemId
    );
    const nextFromStock = currentFromStock - qtyToTransfer;
    const nextToStock = (toAlloc ? Number(toAlloc.stock) : 0) + qtyToTransfer;
    const timestamp = new Date().toISOString();

    setIsTransferringStock(true);
    try {
      if (isLiveSupabase) {
        await supabase.request(`shop_stocks?id=eq.${fromAlloc.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            stock: nextFromStock,
            updated_at: timestamp
          })
        });

        if (toAlloc) {
          await supabase.request(`shop_stocks?id=eq.${toAlloc.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              stock: nextToStock,
              updated_at: timestamp
            })
          });
        } else {
          await supabase.request('shop_stocks', {
            method: 'POST',
            body: JSON.stringify({
              shop_id: transferToShopId,
              item_id: transferItemId,
              stock: nextToStock
            })
          });
        }
        await syncFromSupabase(true);
      } else {
        setShopStocks((prev) => {
          const updated = prev.map((ss) => {
            if (ss.shop_id === transferFromShopId && ss.item_id === transferItemId) {
              return { ...ss, stock: nextFromStock };
            }
            if (ss.shop_id === transferToShopId && ss.item_id === transferItemId) {
              return { ...ss, stock: nextToStock };
            }
            return ss;
          });
          if (!toAlloc) {
            updated.push({
              id: `ss-${Date.now()}`,
              shop_id: transferToShopId,
              item_id: transferItemId,
              stock: nextToStock
            });
          }
          return updated;
        });
      }

      setTransferQty('');
      const fromShop = shops.find((s) => s.id === transferFromShopId);
      const toShop = shops.find((s) => s.id === transferToShopId);
      showToast(
        `Transferred ${qtyToTransfer} units of "${masterItem.name}" from ${fromShop?.name || 'Shop'} to ${toShop?.name || 'Shop'} successfully!`
      );
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    } finally {
      setIsTransferringStock(false);
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
      showToast('Shop stock updated successfully!');
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    }
  };

  const handleBatchUpdateShopStock = async (updates, draftTarget = 'stock', batchKey = 'default') => {
    if (!updates || updates.length === 0 || updatingBatchKey) return;
    if (!isAdmin && updates.some((update) => update.replace)) {
      showToast('Only an Admin can replace stock counts.', 'error');
      return;
    }

    const timestamp = new Date().toISOString();
    setUpdatingBatchKey(batchKey);
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
      setStockDrafts(clearDrafts);

      showToast(
        `Stock updated successfully for ${updates.length} ${updates.length === 1 ? 'item' : 'items'}!`
      );
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    } finally {
      setUpdatingBatchKey(null);
    }
  };

  // ============================================================================
  // SALES USER OPERATIONS (SHOP-SCOPED STOCK, CART EDIT, DELETE, CHECKOUT)
  // ============================================================================
  const shopCatalogItems = useMemo(() => {
    const displayedItems = items.filter(isItemDisplayed);
    if (!activeShopId) return displayedItems;
    const stockByItemId = new Map(
      shopStocks
        .filter((stock) => stock.shop_id === activeShopId)
        .map((stock) => [stock.item_id, stock])
    );
    return displayedItems
      .filter((it) => isItemAvailableAtShop(it, activeShopId))
      .map((it) => {
        const alloc = stockByItemId.get(it.id);
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
    if (cart.length === 0 || isGeneratingBill) return;

    const unavailableCartItem = cart.find(({ item }) => {
      const currentItem = items.find((catalogItem) => catalogItem.id === item.id) || item;
      return (
        !isItemDisplayed(currentItem) ||
        !isItemAvailableAtShop(currentItem, activeShopId)
      );
    });
    if (unavailableCartItem) {
      showToast(
        `"${unavailableCartItem.item.name}" is hidden or unavailable for the selected shop.`,
        'error'
      );
      return;
    }

    const timestamp = new Date().toISOString();
    const billNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const totalAmount = cartSubtotal;
    const targetShopId = activeShopId || null;

    const isOnlineSale = salesChannel !== 'shop_pos';
    let finalPaymentMethod = isOnlineSale ? 'Online' : paymentMethod;
    let cashAmount =
      !isOnlineSale && paymentMethod === 'Cash' ? Number(totalAmount.toFixed(2)) : 0;
    let upiAmount =
      !isOnlineSale && paymentMethod === 'UPI' ? Number(totalAmount.toFixed(2)) : 0;

    if (!isOnlineSale && paymentMethod === 'Split') {
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
        quantity: entry.quantity,
        unit_price: Number(entry.item.price),
        subtotal: Number(entry.item.price) * entry.quantity
      };
    });

    setIsGeneratingBill(true);
    try {
      if (isLiveSupabase) {
        const [insertedBill] = await supabase.request('bills', {
          method: 'POST',
          body: JSON.stringify({
            bill_number: billNumber,
            total_amount: totalAmount,
            payment_method: finalPaymentMethod,
            sales_channel: salesChannel,
            cash_amount: cashAmount,
            upi_amount: upiAmount,
            shop_id: targetShopId,
            created_at: timestamp
          })
        });

        await supabase.request('bill_items', {
          method: 'POST',
          body: JSON.stringify(
            lineItemsPayload.map((lineItem) => ({
              ...lineItem,
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
          sales_channel: salesChannel,
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
          sales_channel: salesChannel,
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
      setSalesChannel('shop_pos');
      showToast(`Bill ${billNumber} successfully created!`);
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    } finally {
      setIsGeneratingBill(false);
    }
  };

  // ============================================================================
  // SALES POS ORDER ACCEPTANCE, ADVANCE BILLING & ORDER-DATE DUE BILLING
  // ============================================================================
  // Flavors filtered by selected Category in the Order form
  const availableCakeFlavors = useMemo(() => {
    const seen = new Set();
    const list = [];
    subcategories.forEach((sc) => {
      if (orderCategoryId && String(sc.category_id) !== String(orderCategoryId)) {
        return;
      }
      const clean = (sc?.name || '').trim();
      const key = clean.toLowerCase();
      if (clean && !seen.has(key)) {
        seen.add(key);
        list.push(clean);
      }
    });
    return list.sort((a, b) => a.localeCompare(b));
  }, [subcategories, orderCategoryId]);

  // Item Types (Quantity / Size) filtered by selected Category (and Flavor if chosen from catalog)
  const orderAvailableSizes = useMemo(() => {
    const catItems = orderCategoryId
      ? items.filter((it) => String(it.category_id) === String(orderCategoryId))
      : items;

    let scopedItems = catItems;
    if (orderCakeFlavorInput && orderCakeFlavorInput !== '__CUSTOM__') {
      const flavorMatched = catItems.filter((it) => {
        const sub = subcategories.find((sc) => String(sc.id) === String(it.subcategory_id));
        return (sub?.name || '').trim().toLowerCase() === orderCakeFlavorInput.trim().toLowerCase();
      });
      if (flavorMatched.length > 0) {
        scopedItems = flavorMatched;
      }
    }

    const seen = new Set();
    const list = [];
    scopedItems.forEach((it) => {
      const clean = (it?.name || '').trim();
      const key = clean.toLowerCase();
      if (clean && !seen.has(key)) {
        seen.add(key);
        list.push(clean);
      }
    });
    return list;
  }, [items, subcategories, orderCategoryId, orderCakeFlavorInput]);

  // All known sizes for the Edit Order modal datalist
  const availableCakeSizes = useMemo(() => {
    const defaults = ['Small', 'Medium', 'Large', '0.5 Kg', '1 Kg', '1.5 Kg', '2 Kg', '3 Kg'];
    const seen = new Set(defaults.map((d) => d.toLowerCase()));
    const merged = [...defaults];
    items.forEach((it) => {
      const clean = (it?.name || '').trim();
      const key = clean.toLowerCase();
      if (clean && !seen.has(key)) {
        seen.add(key);
        merged.push(clean);
      }
    });
    return merged;
  }, [items]);

  const handleOrderSizeSelect = (selectedSize) => {
    setOrderCakeSizeInput(selectedSize);
    if (selectedSize === '__CUSTOM__' || !selectedSize) return;
    setOrderCustomSizeInput('');

    // Auto-fill unit price from catalog when a matching Category + Flavor + Type exists
    const matchedItem = items.find((it) => {
      if (orderCategoryId && String(it.category_id) !== String(orderCategoryId)) return false;
      if ((it.name || '').trim().toLowerCase() !== selectedSize.trim().toLowerCase()) return false;
      if (orderCakeFlavorInput && orderCakeFlavorInput !== '__CUSTOM__') {
        const sub = subcategories.find((sc) => String(sc.id) === String(it.subcategory_id));
        return (sub?.name || '').trim().toLowerCase() === orderCakeFlavorInput.trim().toLowerCase();
      }
      return true;
    }) || items.find(
      (it) =>
        (!orderCategoryId || String(it.category_id) === String(orderCategoryId)) &&
        (it.name || '').trim().toLowerCase() === selectedSize.trim().toLowerCase()
    );

    if (matchedItem && Number(matchedItem.price) > 0) {
      setOrderTotalInput(String(Number(matchedItem.price)));
    }
  };

  const handleOrderSplitCashChange = (val) => {
    setOrderSplitCashAmount(val);
    const advTotal = parseFloat(orderAdvanceInput) || 0;
    if (val === '') {
      setOrderSplitUpiAmount('');
      return;
    }
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= advTotal) {
      setOrderSplitUpiAmount(Math.max(0, advTotal - parsed).toFixed(2));
    }
  };

  const handleOrderSplitUpiChange = (val) => {
    setOrderSplitUpiAmount(val);
    const advTotal = parseFloat(orderAdvanceInput) || 0;
    if (val === '') {
      setOrderSplitCashAmount('');
      return;
    }
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= advTotal) {
      setOrderSplitCashAmount(Math.max(0, advTotal - parsed).toFixed(2));
    }
  };

  const handleOrderDesignImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setOrderDesignImageUrl(await compressImageToDataUrl(file));
    } catch (err) {
      console.error('Unable to process order design image.', err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    } finally {
      event.target.value = '';
    }
  };

  const handleAcceptOrder = async (e) => {
    e.preventDefault();
    if (isSubmittingOrder) return;

    const cleanCustomerName = orderCustomerNameInput.trim();
    const cleanPhone = orderContactPhoneInput.trim();
    const resolvedFlavor =
      orderCakeFlavorInput === '__CUSTOM__'
        ? orderCustomFlavorInput.trim()
        : orderCakeFlavorInput.trim();
    const resolvedSize =
      orderCakeSizeInput === '__CUSTOM__'
        ? orderCustomSizeInput.trim()
        : orderCakeSizeInput.trim();
    const cleanThemeSpecs = orderThemeSpecsInput.trim();
    const cleanWishes = orderWishesInput.trim();
    const [parsedOrderDate = '', parsedOrderTime = ''] = (orderDateTimeInput || '').split('T');

    const totalAmt = parseFloat(orderTotalInput);
    const advanceAmt = orderAdvanceInput === '' ? 0 : parseFloat(orderAdvanceInput);

    if (!cleanCustomerName) {
      showToast('Please enter Customer Name.', 'error');
      return;
    }
    if (!cleanPhone) {
      showToast('Please enter Contact Phone No.', 'error');
      return;
    }
    if (!parsedOrderDate) {
      showToast('Please select Order Date & Time.', 'error');
      return;
    }
    if (distinctCategories.length > 0 && !orderCategoryId) {
      showToast('Please choose a Category.', 'error');
      return;
    }
    if (!resolvedFlavor) {
      showToast('Please choose or enter a Flavor.', 'error');
      return;
    }
    if (!resolvedSize) {
      showToast('Please choose or enter a Quantity / Size.', 'error');
      return;
    }
    if (orderTypeInput === 'Theme' && !cleanThemeSpecs) {
      showToast('Please enter Theme Design Specifications.', 'error');
      return;
    }
    if (isNaN(totalAmt) || totalAmt <= 0) {
      showToast('Please enter a valid total order amount greater than ₹0.', 'error');
      return;
    }
    if (isNaN(advanceAmt) || advanceAmt < 0 || advanceAmt > totalAmt) {
      showToast('Advance paid must be between ₹0 and the total order amount.', 'error');
      return;
    }

    let finalPayMethod = orderAdvancePaymentMethod;
    let cashAmount = 0;
    let upiAmount = 0;

    if (advanceAmt > 0) {
      cashAmount = orderAdvancePaymentMethod === 'Cash' ? Number(advanceAmt.toFixed(2)) : 0;
      upiAmount = orderAdvancePaymentMethod === 'UPI' ? Number(advanceAmt.toFixed(2)) : 0;

      if (orderAdvancePaymentMethod === 'Split') {
        const cashVal = parseFloat(orderSplitCashAmount);
        const upiVal = parseFloat(orderSplitUpiAmount);
        if (
          isNaN(cashVal) ||
          isNaN(upiVal) ||
          cashVal <= 0 ||
          upiVal <= 0 ||
          Math.abs(cashVal + upiVal - advanceAmt) > 0.01
        ) {
          showToast(
            `Split amounts (Cash + UPI) must both be greater than ₹0 and equal ₹${advanceAmt.toFixed(2)}.`,
            'error'
          );
          return;
        }
        finalPayMethod = 'Split';
        cashAmount = Number(cashVal.toFixed(2));
        upiAmount = Number(upiVal.toFixed(2));
      }
    }

    const balanceDue = Number(Math.max(0, totalAmt - advanceAmt).toFixed(2));
    const status = balanceDue <= 0 ? 'Settled' : 'Pending';
    const timestamp = new Date().toISOString();
    const targetShopId = activeShopId || null;
    const selectedCategoryName =
      categories.find((c) => String(c.id) === String(orderCategoryId))?.name || '';
    const cleanRef = `${cleanCustomerName} - ${selectedCategoryName ? `[${selectedCategoryName}] ` : ''}${resolvedFlavor} (${resolvedSize})`;

    setIsSubmittingOrder(true);
    try {
      let advanceBillId = null;
      let createdAdvanceBill = null;

      if (advanceAmt > 0) {
        const billNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const lineItem = {
          item_name: `Order Advance - ${cleanRef}`,
          category_name: 'Orders',
          subcategory_name: `Order Date: ${parsedOrderDate}${parsedOrderTime ? ` ${formatTime12Hour(parsedOrderTime)}` : ''}`,
          quantity: 1,
          unit_price: Number(advanceAmt.toFixed(2)),
          subtotal: Number(advanceAmt.toFixed(2))
        };

        if (isLiveSupabase) {
          const [insertedBill] = await supabase.request('bills', {
            method: 'POST',
            body: JSON.stringify({
              bill_number: billNumber,
              total_amount: Number(advanceAmt.toFixed(2)),
              payment_method: finalPayMethod,
              cash_amount: cashAmount,
              upi_amount: upiAmount,
              shop_id: targetShopId,
              created_at: timestamp
            })
          });

          await supabase.request('bill_items', {
            method: 'POST',
            body: JSON.stringify([
              {
                ...lineItem,
                bill_id: insertedBill.id,
                created_at: timestamp
              }
            ])
          });

          advanceBillId = insertedBill.id;
          createdAdvanceBill = {
            ...insertedBill,
            payment_method: finalPayMethod,
            cash_amount: cashAmount,
            upi_amount: upiAmount,
            shop_id: targetShopId,
            items: [lineItem]
          };
        } else {
          const localBill = {
            id: `bill-${Date.now()}`,
            bill_number: billNumber,
            total_amount: Number(advanceAmt.toFixed(2)),
            payment_method: finalPayMethod,
            cash_amount: cashAmount,
            upi_amount: upiAmount,
            shop_id: targetShopId,
            created_at: timestamp,
            items: [lineItem]
          };
          setBills((prev) => [localBill, ...prev]);
          advanceBillId = localBill.id;
          createdAdvanceBill = localBill;
        }
      }

      const orderPayload = {
        order_ref: cleanRef,
        order_type: orderTypeInput,
        customer_name: cleanCustomerName,
        contact_phone: cleanPhone,
        order_date: parsedOrderDate,
        order_time: parsedOrderTime || null,
        cake_flavor: resolvedFlavor,
        cake_size: resolvedSize,
        theme_specs: orderTypeInput === 'Theme' ? cleanThemeSpecs : null,
        design_image_url: orderTypeInput === 'Theme' ? orderDesignImageUrl || null : null,
        wishes_on_cake: cleanWishes || null,
        total_amount: Number(totalAmt.toFixed(2)),
        advance_paid: Number(advanceAmt.toFixed(2)),
        balance_due: balanceDue,
        status,
        shop_id: targetShopId,
        advance_bill_id: advanceBillId,
        created_at: timestamp
      };

      if (isLiveSupabase && isOrdersTableAvailable) {
        await supabase.request('orders', {
          method: 'POST',
          body: JSON.stringify(orderPayload)
        });
        await syncFromSupabase(true);
      } else {
        const localOrder = {
          id: `order-${Date.now()}`,
          ...orderPayload
        };
        setOrders((prev) => {
          const updated = [localOrder, ...prev];
          saveFallbackOrders(updated);
          return updated;
        });
        if (isLiveSupabase && advanceAmt > 0) {
          await syncFromSupabase(true);
        }
      }

      if (createdAdvanceBill) {
        setLatestGeneratedBill(createdAdvanceBill);
      }

      setOrderTypeInput('Regular');
      setOrderCustomerNameInput('');
      setOrderContactPhoneInput('');
      setOrderCategoryId('');
      setOrderCakeFlavorInput('');
      setOrderCustomFlavorInput('');
      setOrderCakeSizeInput('');
      setOrderCustomSizeInput('');
      setOrderThemeSpecsInput('');
      setOrderDesignImageUrl('');
      setOrderWishesInput('');
      setOrderTotalInput('');
      setOrderAdvanceInput('');
      setOrderAdvancePaymentMethod('Cash');
      setOrderSplitCashAmount('');
      setOrderSplitUpiAmount('');

      showToast(
        createdAdvanceBill
          ? `Cake Order for "${cleanCustomerName}" submitted & Advance Bill ${createdAdvanceBill.bill_number} created!`
          : `Cake Order for "${cleanCustomerName}" submitted! Balance ₹${balanceDue.toFixed(2)} due on ${parsedOrderDate}.`
      );
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleUpdateOrderDetails = async (e) => {
    e.preventDefault();
    if (!editingOrder || isSavingOrderEdit) return;

    const cleanCustomerName = (editingOrder.customer_name || '').trim();
    const cleanPhone = (editingOrder.contact_phone || '').trim();
    const cleanFlavor = (editingOrder.cake_flavor || '').trim();
    const cleanSize = (editingOrder.cake_size || '').trim();
    const totalAmt = parseFloat(editingOrder.total_amount);
    const advAmt = parseFloat(editingOrder.advance_paid) || 0;

    if (!cleanCustomerName || !editingOrder.order_date || !cleanFlavor || !cleanSize || isNaN(totalAmt) || totalAmt <= 0) {
      showToast('Please fill in all required order fields.', 'error');
      return;
    }
    if (editingOrder.order_type === 'Theme' && !(editingOrder.theme_specs || '').trim()) {
      showToast('Theme Design Specifications are required for Theme/Designer cakes.', 'error');
      return;
    }

    const nextBalanceDue =
      editingOrder.status === 'Settled'
        ? 0
        : Number(Math.max(0, totalAmt - advAmt).toFixed(2));
    const nextStatus = nextBalanceDue <= 0 ? 'Settled' : 'Pending';
    const nextRef = `${cleanCustomerName} - ${cleanFlavor} (${cleanSize})`;

    const updateBody = {
      order_ref: nextRef,
      order_type: editingOrder.order_type || 'Regular',
      customer_name: cleanCustomerName,
      contact_phone: cleanPhone,
      order_date: editingOrder.order_date,
      order_time: editingOrder.order_time || null,
      cake_flavor: cleanFlavor,
      cake_size: cleanSize,
      theme_specs: editingOrder.order_type === 'Theme' ? (editingOrder.theme_specs || '').trim() : null,
      wishes_on_cake: (editingOrder.wishes_on_cake || '').trim() || null,
      total_amount: Number(totalAmt.toFixed(2)),
      advance_paid: Number(advAmt.toFixed(2)),
      balance_due: nextBalanceDue,
      status: nextStatus
    };

    setIsSavingOrderEdit(true);
    try {
      if (isLiveSupabase && isOrdersTableAvailable) {
        await supabase.request(`orders?id=eq.${editingOrder.id}`, {
          method: 'PATCH',
          body: JSON.stringify(updateBody)
        });
        await syncFromSupabase(true);
      } else {
        setOrders((prev) => {
          const updated = prev.map((o) =>
            o.id === editingOrder.id ? { ...o, ...updateBody } : o
          );
          saveFallbackOrders(updated);
          return updated;
        });
      }
      setEditingOrder(null);
      showToast('Order details updated successfully!');
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    } finally {
      setIsSavingOrderEdit(false);
    }
  };

  const handleDeleteOrder = async (order) => {
    if (!order?.id) return;
    try {
      if (isLiveSupabase && isOrdersTableAvailable) {
        await supabase.request(`orders?id=eq.${order.id}`, {
          method: 'DELETE'
        });
        await syncFromSupabase(true);
      } else {
        setOrders((prev) => {
          const updated = prev.filter((o) => o.id !== order.id);
          saveFallbackOrders(updated);
          return updated;
        });
      }
      showToast(`Order "${order.customer_name || order.order_ref}" deleted.`);
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    }
  };

  const handleSettleOrderDue = async (order, payMethod, splitCash, splitUpi) => {
    const dueAmount = Number(order.balance_due) || 0;
    if (dueAmount <= 0) return false;

    let finalPayMethod = payMethod || 'Cash';
    let cashAmount = finalPayMethod === 'Cash' ? Number(dueAmount.toFixed(2)) : 0;
    let upiAmount = finalPayMethod === 'UPI' ? Number(dueAmount.toFixed(2)) : 0;

    if (finalPayMethod === 'Split') {
      const cashVal = parseFloat(splitCash);
      const upiVal = parseFloat(splitUpi);
      if (
        isNaN(cashVal) ||
        isNaN(upiVal) ||
        cashVal <= 0 ||
        upiVal <= 0 ||
        Math.abs(cashVal + upiVal - dueAmount) > 0.01
      ) {
        showToast(
          `Split amounts (Cash + UPI) must both be greater than ₹0 and equal ₹${dueAmount.toFixed(2)}.`,
          'error'
        );
        return false;
      }
      cashAmount = Number(cashVal.toFixed(2));
      upiAmount = Number(upiVal.toFixed(2));
    }

    const timestamp = new Date().toISOString();
    const billNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const targetShopId = order.shop_id || activeShopId || null;
    const lineItem = {
      item_name: `Order Balance - ${order.order_ref}`,
      category_name: 'Orders',
      subcategory_name: `Order Date: ${order.order_date}`,
      quantity: 1,
      unit_price: Number(dueAmount.toFixed(2)),
      subtotal: Number(dueAmount.toFixed(2))
    };

    try {
      let createdDueBill = null;

      if (isLiveSupabase) {
        const [insertedBill] = await supabase.request('bills', {
          method: 'POST',
          body: JSON.stringify({
            bill_number: billNumber,
            total_amount: Number(dueAmount.toFixed(2)),
            payment_method: finalPayMethod,
            cash_amount: cashAmount,
            upi_amount: upiAmount,
            shop_id: targetShopId,
            created_at: timestamp
          })
        });

        await supabase.request('bill_items', {
          method: 'POST',
          body: JSON.stringify([
            {
              ...lineItem,
              bill_id: insertedBill.id,
              created_at: timestamp
            }
          ])
        });

        if (isOrdersTableAvailable) {
          await supabase.request(`orders?id=eq.${order.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              balance_due: 0,
              status: 'Settled',
              balance_bill_id: insertedBill.id,
              settled_at: timestamp
            })
          });
        } else {
          setOrders((prev) => {
            const updated = prev.map((o) =>
              o.id === order.id
                ? {
                    ...o,
                    balance_due: 0,
                    status: 'Settled',
                    balance_bill_id: insertedBill.id,
                    settled_at: timestamp
                  }
                : o
            );
            saveFallbackOrders(updated);
            return updated;
          });
        }

        await syncFromSupabase(true);
        createdDueBill = {
          ...insertedBill,
          payment_method: finalPayMethod,
          cash_amount: cashAmount,
          upi_amount: upiAmount,
          shop_id: targetShopId,
          items: [lineItem]
        };
      } else {
        const localBill = {
          id: `bill-${Date.now()}`,
          bill_number: billNumber,
          total_amount: Number(dueAmount.toFixed(2)),
          payment_method: finalPayMethod,
          cash_amount: cashAmount,
          upi_amount: upiAmount,
          shop_id: targetShopId,
          created_at: timestamp,
          items: [lineItem]
        };
        setBills((prev) => [localBill, ...prev]);
        setOrders((prev) => {
          const updated = prev.map((o) =>
            o.id === order.id
              ? {
                  ...o,
                  balance_due: 0,
                  status: 'Settled',
                  balance_bill_id: localBill.id,
                  settled_at: timestamp
                }
              : o
          );
          saveFallbackOrders(updated);
          return updated;
        });
        createdDueBill = localBill;
      }

      if (createdDueBill) {
        setLatestGeneratedBill(createdDueBill);
      }

      showToast(
        `Balance Bill ${billNumber} for "${order.order_ref}" successfully created!`
      );
      return true;
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
      return false;
    }
  };

  // Shop-scoped pending orders split into Due Today / Overdue vs Upcoming, plus Settled
  const shopOrdersSummary = useMemo(() => {
    const todayStr = getLocalDateStr();
    const shopScoped = orders.filter((o) => {
      if (activeShopId && o.shop_id && String(o.shop_id) !== String(activeShopId)) {
        return false;
      }
      return true;
    });

    const scopedPending = shopScoped.filter(
      (o) => o.status !== 'Settled' && Number(o.balance_due) > 0
    );

    const dueTodayOrOverdue = scopedPending
      .filter((o) => (o.order_date || '') <= todayStr)
      .sort((a, b) => (a.order_date || '').localeCompare(b.order_date || ''));

    const upcoming = scopedPending
      .filter((o) => (o.order_date || '') > todayStr)
      .sort((a, b) => (a.order_date || '').localeCompare(b.order_date || ''));

    const settled = shopScoped
      .filter((o) => o.status === 'Settled' || Number(o.balance_due) <= 0)
      .sort((a, b) =>
        (b.settled_at || b.created_at || '').localeCompare(a.settled_at || a.created_at || '')
      );

    return {
      todayStr,
      dueTodayOrOverdue,
      upcoming,
      settled,
      totalDueTodayAmount: dueTodayOrOverdue.reduce(
        (sum, o) => sum + (Number(o.balance_due) || 0),
        0
      )
    };
  }, [orders, activeShopId]);

  // Admin Orders Dashboard Data (Scheduled Cakes for Selected Delivery Date + Flavor/Size Breakdown)
  const adminOrdersDashboardData = useMemo(() => {
    const roleScopedOrders = orders.filter((o) => {
      if (isShopAdmin) {
        return !o.shop_id || String(o.shop_id) === String(currentLoggedInUser?.shop_id);
      }
      if (isAdmin && adminOrdersShopFilter !== 'ALL') {
        return String(o.shop_id) === String(adminOrdersShopFilter);
      }
      return true;
    });

    const targetDateOrders = roleScopedOrders
      .filter((o) => (o.order_date || '') === adminOrdersDate)
      .sort((a, b) => (a.order_time || '99:99').localeCompare(b.order_time || '99:99'));

    const breakdownMap = new Map();
    targetDateOrders.forEach((o) => {
      const flavor = (o.cake_flavor || o.order_ref || 'Unspecified Flavor').trim();
      const size = (o.cake_size || 'Standard').trim();
      const key = flavor.toLowerCase();
      if (!breakdownMap.has(key)) {
        breakdownMap.set(key, {
          flavor,
          totalCount: 0,
          sizes: {}
        });
      }
      const entry = breakdownMap.get(key);
      entry.totalCount += 1;
      entry.sizes[size] = (entry.sizes[size] || 0) + 1;
    });

    const flavorBreakdown = Array.from(breakdownMap.values()).sort((a, b) =>
      a.flavor.localeCompare(b.flavor)
    );

    return {
      allTimeCount: roleScopedOrders.length,
      targetDateOrders,
      flavorBreakdown
    };
  }, [orders, adminOrdersDate, adminOrdersShopFilter, isAdmin, isShopAdmin, currentLoggedInUser]);

  // ============================================================================
  // SHARED CATALOG OPERATIONS (CATEGORY -> FLAVOUR -> TYPE / PRODUCT)
  // ============================================================================
  const handleCreateItem = async (e) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      showToast('Only a Super Admin can edit the menu.', 'error');
      return;
    }
    if (isCreatingItem) return;
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

    setIsCreatingItem(true);
    try {
      if (isLiveSupabase) {
        await supabase.request('items', {
          method: 'POST',
          body: JSON.stringify({
            name: newItemName.trim(),
            category_id: newItemCategory,
            subcategory_id: validSubcatId,
            price,
            stock: 0,
            is_displayed: true,
            available_shop_ids: null
          })
        });
        await syncFromSupabase(true);
      } else {
        const created = {
          id: `item-${Date.now()}`,
          name: newItemName.trim(),
          category_id: newItemCategory,
          subcategory_id: validSubcatId,
          price,
          stock: 0,
          is_displayed: true,
          available_shop_ids: null
        };
        setItems((prev) => [...prev, created]);
      }

      setNewItemName('');
      setNewItemSubcategory('');
      setNewItemPrice('');
      showToast('New item added to menu successfully!');
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    } finally {
      setIsCreatingItem(false);
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
    newTypeName,
    isDisplayed,
    availableShopIds,
    suppressSuccessToast = false
  ) => {
    if (!isSuperAdmin) {
      showToast('Only a Super Admin can edit menu items.', 'error');
      return false;
    }
    const parsedPrice = Math.max(0, Number(newPrice) || 0);
    const targetItem = items.find((i) => i.id === itemId);
    const isItemBilled = billedItemIds.has(itemId);
    const finalCategoryId =
      isItemBilled && targetItem ? targetItem.category_id : newCategoryId || targetItem?.category_id;
    const cleanSubcatId =
      finalCategoryId === targetItem?.category_id ? newSubcategoryId || null : null;
    const cleanTypeName = (newTypeName ?? targetItem?.name ?? '').trim() || targetItem?.name;
    const finalIsDisplayed = isDisplayed ?? targetItem?.is_displayed ?? true;
    const finalAvailableShopIds =
      availableShopIds ?? targetItem?.available_shop_ids ?? null;

    if (isItemBilled && newCategoryId && targetItem && newCategoryId !== targetItem.category_id) {
      showToast('Category cannot be changed for billed items. Only price/name can be updated.', 'error');
      return false;
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
            is_displayed: finalIsDisplayed,
            available_shop_ids: finalAvailableShopIds,
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
                  is_displayed: finalIsDisplayed,
                  available_shop_ids: finalAvailableShopIds
                }
              : it
          )
        );
      }
      const noLongerSellable =
        !isItemDisplayed({
          is_displayed: finalIsDisplayed,
          available_shop_ids: finalAvailableShopIds
        }) ||
        !isItemAvailableAtShop(
          { available_shop_ids: finalAvailableShopIds },
          activeShopId
        );
      const itemWasInCart = cart.some((entry) => entry.item.id === itemId);
      if (noLongerSellable && itemWasInCart) {
        setCart((prev) => prev.filter((entry) => entry.item.id !== itemId));
        showToast(`"${cleanTypeName}" was removed from the current cart because it is hidden or unavailable.`);
      } else if (!suppressSuccessToast) {
        showToast('Price & category updated successfully!');
      }
      return true;
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
      return false;
    }
  };

  const handleSaveMenuCategory = async (categoryId, categoryName, categoryItems) => {
    if (!isSuperAdmin) {
      showToast('Only a Super Admin can edit menu items.', 'error');
      return;
    }
    if (savingMenuCategoryIds.has(categoryId)) return;
    const pendingUpdates = categoryItems
      .map((item) => ({ item, draft: menuItemDrafts[item.id] }))
      .filter(({ draft }) => draft);
    if (pendingUpdates.length === 0) return;

    setSavingMenuCategoryIds((current) => new Set(current).add(categoryId));
    let savedCount = 0;
    try {
      for (const { item, draft } of pendingUpdates) {
        const allShopsSelected =
          draft.availableShopIds.length === shops.length &&
          shops.every((shop) => draft.availableShopIds.includes(shop.id));
        const savedShopIds =
          item.available_shop_ids == null && allShopsSelected
            ? null
            : draft.availableShopIds;
        const saved = await handleUpdateCatalogItem(
          item.id,
          draft.price,
          draft.categoryId,
          draft.categoryId === item.category_id ? item.subcategory_id : null,
          draft.typeName,
          draft.isDisplayed,
          savedShopIds,
          true
        );
        if (saved) savedCount += 1;
      }
      if (savedCount > 0) {
        showToast(`${savedCount} ${savedCount === 1 ? 'item' : 'items'} saved in ${categoryName}.`);
      }
    } finally {
      setSavingMenuCategoryIds((current) => {
        const next = new Set(current);
        next.delete(categoryId);
        return next;
      });
    }
  };

  // Delete a single Item (Type / Product) if it is not referenced in any generated bill
  const handleDeleteCatalogItem = async (item) => {
    if (!isSuperAdmin) {
      showToast('Only a Super Admin can edit the menu.', 'error');
      return;
    }
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
      showToast(`Item "${item.name}" deleted successfully.`);
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    }
  };

  // Delete a Sub-Category (Flavour / Item) and its unbilled items if none are billed
  const handleDeleteSubcategoryGroup = async (category, subcategory) => {
    if (!isSuperAdmin) {
      showToast('Only a Super Admin can edit the menu.', 'error');
      return;
    }
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
      showToast(`Sub-category "${subcategory.name}" deleted successfully.`);
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    }
  };

  // Delete a Category and its subcategories/unbilled items if no billed items belong to it
  const handleDeleteCategoryGroup = async (category) => {
    if (!isSuperAdmin) {
      showToast('Only a Super Admin can edit the menu.', 'error');
      return;
    }
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
      showToast(`Category "${category.name}" deleted successfully.`);
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      showToast('Only a Super Admin can edit the menu.', 'error');
      return;
    }
    if (isCreatingCategory) return;
    if (!newCategoryName.trim()) {
      showToast('Enter a valid category name.', 'error');
      return;
    }

    setIsCreatingCategory(true);
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
      showToast('Category created successfully!');
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleSaveShopCategoryExpense = async (e) => {
    e.preventDefault();
    if (isSavingExpenseConfig) return;
    if (!expenseConfigShopId || !expenseConfigCategoryId) {
      showToast('Select both a Shop and a Category.', 'error');
      return;
    }
    const expPct = parseFloat(expenseConfigRate);
    if (isNaN(expPct) || expPct < 0 || expPct > 100) {
      showToast('Enter a valid expense percentage between 0 and 100.', 'error');
      return;
    }
    setIsSavingExpenseConfig(true);
    try {
      await handleUpdateCategoryExpense(expenseConfigCategoryId, expPct, expenseConfigShopId);
    } finally {
      setIsSavingExpenseConfig(false);
    }
  };

  const handleAddSubcategory = async (e) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      showToast('Only a Super Admin can edit the menu.', 'error');
      return;
    }
    if (isAddingSubcategory) return;
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

    setIsAddingSubcategory(true);
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
      showToast(`Flavour / Item "${cleanSub}" added successfully!`);
    } catch (err) {
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
    } finally {
      setIsAddingSubcategory(false);
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
      console.error(err);
      showToast(COMMON_ERROR_MESSAGE, 'error');
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
    if (isPlatformSale(bill)) return { cash: 0, upi: 0 };
    if (cash > 0 || upi > 0) return { cash, upi };
    if ((bill.payment_method || 'Cash') === 'UPI') return { cash: 0, upi: total };
    return { cash: total, upi: 0 };
  };

  const effectiveAnalyticsShopId = isShopAdmin
    ? currentLoggedInUser?.shop_id
    : adminSelectedShopFilter;

  const isAllShopsAnalyticsSelected = isAdmin && effectiveAnalyticsShopId === 'ALL';

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

    const channelRows = BILL_SALES_CHANNELS.map((channel) => {
      const channelBills = filteredBills.filter(
        (bill) => getBillSalesChannel(bill) === channel.id
      );
      return {
        ...channel,
        billCount: channelBills.length,
        totalSales: channelBills.reduce(
          (sum, bill) => sum + (Number(bill.total_amount) || 0),
          0
        )
      };
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
      channelRows,
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

  // Unified Stock Management Data (Merges Stock Alerts + Stock Update + Current Stock at a Glance)
  const unifiedStockData = useMemo(() => {
    const threshold = Math.max(1, parseInt(lowStockThreshold, 10) || 5);
    const displayedItems = items.filter(isItemDisplayed);
    const allAccessibleShops = isShopAdmin
      ? shops.filter((s) => s.id === currentLoggedInUser?.shop_id)
      : shops;

    // Distinct dropdown options for Flavour & Item Type
    const flavourOptionsSet = new Map();
    subcategories.forEach((sc) => {
      if (
        stockUpdateCategoryFilter !== 'ALL' &&
        String(sc.category_id) !== String(stockUpdateCategoryFilter)
      ) {
        return;
      }
      const cleanName = (sc.name || '').trim();
      const key = cleanName.toLowerCase();
      if (key && !flavourOptionsSet.has(key)) {
        flavourOptionsSet.set(key, cleanName);
      }
    });
    const availableFlavours = Array.from(flavourOptionsSet.values()).sort((a, b) =>
      a.localeCompare(b)
    );

    const itemTypeOptionsSet = new Map();
    displayedItems.forEach((it) => {
      if (
        stockUpdateCategoryFilter !== 'ALL' &&
        String(it.category_id) !== String(stockUpdateCategoryFilter)
      ) {
        return;
      }
      if (stockGlanceFlavourFilter === 'GENERAL') {
        if (it.subcategory_id) return;
      } else if (stockGlanceFlavourFilter !== 'ALL') {
        const subName =
          subcategories
            .find((sc) => String(sc.id) === String(it.subcategory_id))
            ?.name?.trim()
            .toLowerCase() || '';
        if (subName !== stockGlanceFlavourFilter.toLowerCase()) return;
      }
      const cleanName = (it.name || '').trim();
      const key = cleanName.toLowerCase();
      if (key && !itemTypeOptionsSet.has(key)) {
        itemTypeOptionsSet.set(key, cleanName);
      }
    });
    const availableItemTypes = Array.from(itemTypeOptionsSet.values()).sort((a, b) =>
      a.localeCompare(b)
    );

    // Total alert count across all accessible shops (for nav badge)
    let totalAlertCount = 0;
    allAccessibleShops.forEach((shop) => {
      displayedItems.forEach((it) => {
        if (!isItemAvailableAtShop(it, shop.id)) return;
        const alloc = shopStocks.find(
          (ss) => ss.shop_id === shop.id && ss.item_id === it.id
        );
        const qty = alloc ? Number(alloc.stock) : 0;
        if (qty <= threshold) totalAlertCount += 1;
      });
    });

    const scopedShops =
      isAdmin && stockUpdateShopFilter !== 'ALL'
        ? allAccessibleShops.filter((s) => s.id === stockUpdateShopFilter)
        : allAccessibleShops;

    const query = stockUpdateSearchQuery.trim().toLowerCase();

    let totalUnits = 0;
    let inStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    const perShopTotals = scopedShops.map((shop) => {
      let shopUnits = 0;
      displayedItems.forEach((it) => {
        if (!isItemAvailableAtShop(it, shop.id)) return;
        if (
          stockUpdateCategoryFilter !== 'ALL' &&
          String(it.category_id) !== String(stockUpdateCategoryFilter)
        ) {
          return;
        }
        if (stockGlanceFlavourFilter === 'GENERAL') {
          if (it.subcategory_id) return;
        } else if (stockGlanceFlavourFilter !== 'ALL') {
          const subName =
            subcategories
              .find((sc) => String(sc.id) === String(it.subcategory_id))
              ?.name?.trim()
              .toLowerCase() || '';
          if (subName !== stockGlanceFlavourFilter.toLowerCase()) return;
        }
        if (
          stockGlanceItemTypeFilter !== 'ALL' &&
          (it.name || '').trim().toLowerCase() !== stockGlanceItemTypeFilter.toLowerCase()
        ) {
          return;
        }
        const alloc = shopStocks.find(
          (ss) => ss.shop_id === shop.id && ss.item_id === it.id
        );
        const qty = alloc ? Number(alloc.stock) : 0;
        shopUnits += qty;
        totalUnits += qty;
        if (qty <= 0) outOfStockCount += 1;
        else if (qty <= threshold) lowStockCount += 1;
        else inStockCount += 1;
      });
      return { shopId: shop.id, shopName: shop.name, units: shopUnits };
    });

    // Build Shop -> Category -> Flavour -> Items tree applying all filters
    const shopSections = scopedShops.map((shop) => {
      const shopMatchesSearch = !query || shop.name.toLowerCase().includes(query);

      const categorySections = categories
        .filter(
          (cat) =>
            stockUpdateCategoryFilter === 'ALL' ||
            String(cat.id) === String(stockUpdateCategoryFilter)
        )
        .map((cat) => {
          const catItems = displayedItems.filter(
            (it) =>
              String(it.category_id) === String(cat.id) &&
              isItemAvailableAtShop(it, shop.id)
          );
          if (catItems.length === 0) return null;

          const catSubcats = subcategories.filter(
            (sc) => String(sc.category_id) === String(cat.id)
          );
          const flavourGroupsRaw = [];
          catSubcats.forEach((sc) => {
            const scItems = catItems.filter(
              (it) => String(it.subcategory_id) === String(sc.id)
            );
            if (scItems.length > 0) {
              flavourGroupsRaw.push({
                key: sc.id,
                flavourName: sc.name,
                isGeneral: false,
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
            flavourGroupsRaw.push({
              key: `${cat.id}-direct-${it.id}`,
              flavourName: it.name,
              isGeneral: true,
              items: [it]
            });
          });

          const catMatchesSearch =
            shopMatchesSearch || cat.name.toLowerCase().includes(query);

          let catTotalStock = 0;
          let catOutCount = 0;
          let catLowCount = 0;
          let catInCount = 0;

          const filteredFlavourGroups = flavourGroupsRaw
            .map((fg) => {
              // Flavour filter
              if (stockGlanceFlavourFilter === 'GENERAL') {
                if (!fg.isGeneral) return null;
              } else if (stockGlanceFlavourFilter !== 'ALL') {
                if (
                  fg.isGeneral ||
                  fg.flavourName.trim().toLowerCase() !==
                    stockGlanceFlavourFilter.toLowerCase()
                ) {
                  return null;
                }
              }

              const flavourMatchesSearch =
                catMatchesSearch || fg.flavourName.toLowerCase().includes(query);

              const matchedItems = fg.items
                .map((it) => {
                  // Item type filter
                  if (
                    stockGlanceItemTypeFilter !== 'ALL' &&
                    (it.name || '').trim().toLowerCase() !==
                      stockGlanceItemTypeFilter.toLowerCase()
                  ) {
                    return null;
                  }
                  // Search filter
                  if (
                    !flavourMatchesSearch &&
                    !(it.name || '').toLowerCase().includes(query)
                  ) {
                    return null;
                  }

                  const alloc = shopStocks.find(
                    (ss) => ss.shop_id === shop.id && ss.item_id === it.id
                  );
                  const currentStock = alloc ? Number(alloc.stock) : 0;
                  const status =
                    currentStock <= 0
                      ? 'OUT_OF_STOCK'
                      : currentStock <= threshold
                      ? 'LOW_STOCK'
                      : 'IN_STOCK';

                  // Status filter
                  if (stockAlertStatusFilter !== 'ALL' && status !== stockAlertStatusFilter) {
                    return null;
                  }

                  catTotalStock += currentStock;
                  if (status === 'OUT_OF_STOCK') catOutCount += 1;
                  else if (status === 'LOW_STOCK') catLowCount += 1;
                  else catInCount += 1;

                  return {
                    item: it,
                    currentStock,
                    status
                  };
                })
                .filter(Boolean);

              if (matchedItems.length === 0) return null;
              return {
                key: fg.key,
                flavourName: fg.flavourName,
                entries: matchedItems
              };
            })
            .filter(Boolean);

          if (filteredFlavourGroups.length === 0) return null;

          return {
            category: cat,
            catItems,
            flavourGroups: filteredFlavourGroups,
            catTotalStock,
            catOutCount,
            catLowCount,
            catInCount
          };
        })
        .filter(Boolean);

      const shopTotalStock = shopStocks
        .filter((ss) => {
          if (ss.shop_id !== shop.id) return false;
          const item = displayedItems.find((it) => it.id === ss.item_id);
          return item && isItemAvailableAtShop(item, shop.id);
        })
        .reduce((sum, ss) => sum + (Number(ss.stock) || 0), 0);

      return {
        shop,
        shopTotalStock,
        categorySections
      };
    });

    return {
      threshold,
      totalAlertCount,
      availableFlavours,
      availableItemTypes,
      perShopTotals,
      totalUnits,
      inStockCount,
      lowStockCount,
      outOfStockCount,
      shopSections
    };
  }, [
    shops,
    shopStocks,
    items,
    categories,
    subcategories,
    isAdmin,
    isShopAdmin,
    currentLoggedInUser,
    lowStockThreshold,
    stockAlertStatusFilter,
    stockUpdateShopFilter,
    stockUpdateCategoryFilter,
    stockGlanceFlavourFilter,
    stockGlanceItemTypeFilter,
    stockUpdateSearchQuery
  ]);

  const printStockReport = useMemo(() => {
    const displayedItems = items.filter(
      (item) =>
        isItemDisplayed(item) &&
        (printReportCategoryFilter === 'ALL' ||
          String(item.category_id) === String(printReportCategoryFilter))
    );
    const categoryNames = new Map(categories.map((category) => [String(category.id), category.name]));
    const subcategoryNames = new Map(
      subcategories.map((subcategory) => [String(subcategory.id), subcategory.name])
    );
    const stockByShop = new Map();
    shopStocks.forEach((allocation) => {
      const shopKey = String(allocation.shop_id);
      if (!stockByShop.has(shopKey)) stockByShop.set(shopKey, new Map());
      stockByShop.get(shopKey).set(String(allocation.item_id), Number(allocation.stock) || 0);
    });

    const reportShops = isShopAdmin
      ? shops.filter(
          (shop) => String(shop.id) === String(currentLoggedInUser?.shop_id)
        )
      : shops;
    const shopSections = reportShops.map((shop) => {
      const shopStock = stockByShop.get(String(shop.id));
      const shopItems = displayedItems
        .filter((item) => isItemAvailableAtShop(item, shop.id))
        .map((item) => ({
          key: `${shop.id}:${item.id}`,
          isDisplayed: item.is_displayed === true,
          categoryId: item.category_id,
          itemName: item.name || '',
          categoryName: categoryNames.get(String(item.category_id)) || 'Uncategorized',
          flavourName: subcategoryNames.get(String(item.subcategory_id)) || '',
          stock: shopStock?.get(String(item.id)) || 0
        }))
        .sort(
          (a, b) =>
            a.categoryName.localeCompare(b.categoryName) ||
            a.flavourName.localeCompare(b.flavourName) ||
            a.itemName.localeCompare(b.itemName)
        );
      const flavourGroupsByKey = new Map();
      shopItems.forEach((item) => {
        const key = JSON.stringify([
          String(item.categoryId),
          item.flavourName.trim().toLowerCase()
        ]);
        if (!flavourGroupsByKey.has(key)) {
          flavourGroupsByKey.set(key, {
            key,
            categoryName: item.categoryName,
            flavourName: item.flavourName,
            items: []
          });
        }
        flavourGroupsByKey.get(key).items.push(item);
      });

      return {
        shop,
        items: shopItems,
        flavourGroups: Array.from(flavourGroupsByKey.values()),
        outOfStockItems: shopItems.filter(
          (item) => item.stock <= 0 && item.isDisplayed
        )
      };
    });

    return { shopSections };
  }, [
    shops,
    shopStocks,
    items,
    categories,
    subcategories,
    isShopAdmin,
    currentLoggedInUser,
    printReportCategoryFilter
  ]);

  const ordersForPrintDate = useMemo(
    () =>
      orders
        .filter(
          (order) =>
            order.order_date === adminOrdersDate &&
            (!isShopAdmin ||
              !order.shop_id ||
              String(order.shop_id) === String(currentLoggedInUser?.shop_id))
        )
        .sort((a, b) => (a.order_time || '99:99').localeCompare(b.order_time || '99:99')),
    [orders, adminOrdersDate, isShopAdmin, currentLoggedInUser]
  );
  const printReportCategoryName =
    printReportCategoryFilter === 'ALL'
      ? ''
      : categories.find(
          (category) => String(category.id) === String(printReportCategoryFilter)
        )?.name || 'Selected category';

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

  // Distinct filters + Date Picker for Dedicated Generated Bills Tab
  const visibleLedgerBills = useMemo(() => {
    const query = billSearchQuery.trim().toLowerCase();
    return bills.filter((bill) => {
      // Role scope
      if (isShopAdmin && bill.shop_id !== currentLoggedInUser?.shop_id) {
        return false;
      }
      if (isAdmin && billShopFilter !== 'ALL' && bill.shop_id !== billShopFilter) {
        return false;
      }
      if (
        billSalesChannelFilter !== 'ALL' &&
        getBillSalesChannel(bill) !== billSalesChannelFilter
      ) {
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
    billSalesChannelFilter,
    billShopFilter,
    isAdmin,
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
        if (isPlatformSale(bill)) {
          acc.online += Number(bill.total_amount) || 0;
        }
        return acc;
      },
      { total: 0, cash: 0, upi: 0, online: 0 }
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
                : 'bg-emerald-600/95 border-emerald-500 text-white'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-100 shrink-0" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        )}

        <div className="w-full max-w-md bg-white border border-purple-200/80 rounded-3xl shadow-xl shadow-purple-950/5 p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto overflow-hidden">
              <img src="/logo.png" alt="Olive Cakes Logo" className="w-full h-full object-contain" />
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
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 disabled:opacity-60 text-white font-bold text-sm shadow-md shadow-purple-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoggingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
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
              : 'bg-emerald-600/95 border-emerald-500 text-white'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-100 shrink-0" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-purple-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-16 py-2 sm:py-0 flex flex-wrap items-center justify-between gap-2 sm:gap-4">
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
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            {isAdmin && shops.length > 0 && (activeRole === 'sales' || activeRole === 'orders') && (
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
                  {distinctShops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.sales_profile_name})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(isAdmin || isShopAdmin) && (
              <div className="bg-[#FAF8F5] p-1 rounded-xl border border-purple-100 flex items-center">
                <button
                  onClick={() => setActiveRole('sales')}
                  aria-label="Sales Terminal"
                  className={`flex min-h-10 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    activeRole === 'sales'
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-purple-900'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span className="sm:hidden">Sales</span>
                  <span className="hidden sm:inline">Sales Terminal</span>
                </button>
                <button
                  onClick={() => setActiveRole('admin')}
                  aria-label={isShopAdmin ? 'Shop Dashboard' : 'Admin Panel'}
                  className={`flex min-h-10 items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    activeRole === 'admin'
                      ? 'bg-purple-800 text-white shadow-sm'
                      : 'text-slate-600 hover:text-purple-900'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span className="sm:hidden">{isShopAdmin ? 'Shop' : 'Admin'}</span>
                  <span className="hidden sm:inline">{isShopAdmin ? 'Shop Dashboard' : 'Admin Panel'}</span>
                </button>
              </div>
            )}

            <button
              onClick={handleAdminLogout}
              aria-label="Log out"
              className="flex min-h-10 min-w-10 items-center justify-center gap-1.5 px-2 sm:px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs sm:text-sm font-semibold border border-rose-200 transition-colors"
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
          <div className="sticky top-28 sm:top-[4.5rem] z-30 flex justify-end lg:hidden">
            <button
              type="button"
              onClick={() => setIsMobileCartOpen((prev) => !prev)}
              className="inline-flex min-h-11 items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 text-white shadow-lg shadow-purple-700/25 text-xs sm:text-sm font-bold transition-all cursor-pointer"
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
            {/* Active Shop Sales Profile Banner with Order & Due Quick Actions */}
            <div className="bg-white border border-purple-200 shadow-xs rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <Store className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm font-bold text-purple-950">
                    Active Shop: {currentActiveShop?.name || 'Main Store'}
                  </p>
                  {shopOrdersSummary.dueTodayOrOverdue.length > 0 && (
                    <p className="text-[11px] font-semibold text-amber-700 flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {shopOrdersSummary.dueTodayOrOverdue.length} due{' '}
                      {shopOrdersSummary.dueTodayOrOverdue.length === 1 ? 'order' : 'orders'} (₹
                      {shopOrdersSummary.totalDueTodayAmount.toFixed(2)})
                    </p>
                  )}
                </div>
              </div>

              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
                {isAdmin && shops.length > 0 && (
                  <select
                    value={activeShopId}
                    onChange={(e) => {
                      setActiveShopId(e.target.value);
                      setCart([]);
                    }}
                    className="w-full min-w-0 max-w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600 sm:w-auto"
                  >
                    {distinctShops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — Profile: {s.sales_profile_name}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setOrderDueViewMode('due');
                    setActiveRole('orders');
                  }}
                  className={`inline-flex min-h-10 items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    shopOrdersSummary.dueTodayOrOverdue.length > 0
                      ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-[#FAF8F5] hover:bg-purple-50 text-purple-900 border-purple-200'
                  }`}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>
                    Due ({shopOrdersSummary.dueTodayOrOverdue.length})
                    {shopOrdersSummary.dueTodayOrOverdue.length > 0
                      ? ` • ₹${shopOrdersSummary.totalDueTodayAmount.toFixed(2)}`
                      : ''}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveRole('orders')}
                  className="inline-flex min-h-10 items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  <span>Accept Order</span>
                </button>
              </div>
            </div>

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

                  {/* Instant Search Results Dropdown */}
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
                                <div className="w-11 h-11 rounded-full bg-purple-100/70 text-purple-600 flex items-center justify-center shrink-0">
                                  <Package className="w-5 h-5" />
                                </div>
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
                <div role="group" aria-label="Filter products by category" className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto overscroll-x-contain pb-2 sm:flex-wrap sm:overflow-visible sm:pb-0">
                  <button
                    onClick={() => {
                      setSelectedCategoryFilter('ALL');
                      setSelectedSubcategoryFilter('ALL');
                    }}
                    className={`min-h-11 shrink-0 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
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
                        className={`min-h-11 shrink-0 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
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
                <div role="group" aria-label="Filter products by flavour" className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto overscroll-x-contain pt-2.5 pb-1 border-t border-purple-50 sm:flex-wrap sm:overflow-visible">
                  <span className="shrink-0 text-xs font-semibold text-slate-500 mr-1">
                    Flavours / Items:
                  </span>
                  <button
                    onClick={() => setSelectedSubcategoryFilter('ALL')}
                    className={`min-h-10 shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
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
                        className={`min-h-10 shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
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

            {/* Product Grid */}
            {visiblePosItems.length === 0 ? (
              <div className="bg-white border border-dashed border-purple-200 rounded-2xl p-10 text-center">
                <Package className="w-10 h-10 text-purple-300 mx-auto mb-2" />
                <h3 className="text-base font-bold text-purple-950">No in-stock products available</h3>
                <p className="text-sm text-slate-500 mt-1">
                  All matching items are currently out of stock for this shop.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-3.5 xl:grid-cols-3">
                {visiblePosItems.map((item) => {
                  const cat = categories.find((c) => c.id === item.category_id);
                  const subcat = subcategories.find((sc) => sc.id === item.subcategory_id);
                  const inCart = cart.find((c) => c.item.id === item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => addToCart(item)}
                      className="group relative rounded-xl sm:rounded-2xl border overflow-hidden transition-all flex flex-col justify-between bg-white border-purple-100 hover:border-purple-400 hover:shadow-md hover:shadow-purple-900/5 cursor-pointer active:scale-[0.98]"
                    >
                      <div className="p-2.5 pb-2 sm:p-3.5 sm:pb-2.5">
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-1.5 mb-1">
                            <span className="min-w-0 text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 rounded-md bg-[#FAF8F5] text-purple-800 border border-purple-100 truncate">
                              {cat?.name || 'General'}
                            </span>
                            <span
                              className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-full shrink-0 ${
                                item.stock <= 5
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {item.stock} left
                            </span>
                          </div>
                          <h3
                            className="font-bold text-slate-900 text-xs sm:text-base leading-snug line-clamp-2 sm:truncate"
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

                      <div className="flex items-center justify-between gap-1 border-t border-purple-50 px-2.5 sm:px-3.5 py-2.5 mt-1 bg-[#FAF8F5]/60">
                        <span className="font-extrabold text-purple-950 flex items-center text-sm sm:text-base">
                          <IndianRupee className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600" />
                          {Number(item.price).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          className={`min-h-10 rounded-xl font-semibold flex items-center gap-1 px-2 sm:px-3 py-1.5 text-xs transition-colors ${
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

              {/* Cart Items List with Direct Quantity Edit & Delete */}
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
                        <div className="w-14 h-14 rounded-full bg-purple-100/70 text-purple-500 flex items-center justify-center shrink-0">
                          <Package className="w-6 h-6" />
                        </div>
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

                <div className="bg-[#FAF8F5] border border-purple-100 rounded-xl px-3 py-2 space-y-2">
                  <span className="block text-xs font-semibold text-slate-600">
                    Sale Channel
                  </span>
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-white p-1 border border-purple-200/80">
                    {BILL_SALES_CHANNELS.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        aria-pressed={salesChannel === channel.id}
                        onClick={() => setSalesChannel(channel.id)}
                        className={`min-h-10 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                          salesChannel === channel.id
                            ? 'bg-purple-700 text-white shadow-xs'
                            : 'text-slate-600 hover:bg-purple-50 hover:text-purple-900'
                        }`}
                      >
                        {channel.label}
                      </button>
                    ))}
                  </div>
                  {salesChannel !== 'shop_pos' && (
                    <p className="text-[11px] text-slate-500">
                      Payment is handled by {getBillSalesChannelLabel({ sales_channel: salesChannel })}; no payment details are needed here.
                    </p>
                  )}
                </div>

                {/* Compact Pill Payment Method Selector: Cash, UPI, or Split */}
                {salesChannel === 'shop_pos' && (
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
                )}

                <button
                  onClick={handleGenerateBill}
                  disabled={cart.length === 0 || isGeneratingBill}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white font-bold text-sm shadow-lg shadow-purple-600/20 disabled:shadow-none transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isGeneratingBill ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Generating Bill...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      <span>
                        Generate Live Bill (
                        {salesChannel === 'shop_pos'
                          ? paymentMethod === 'Split'
                            ? 'Cash + UPI'
                            : paymentMethod
                          : getBillSalesChannelLabel({ sales_channel: salesChannel })}
                        )
                      </span>
                    </>
                  )}
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
                    <span>Sales Channel:</span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-semibold">
                      {getBillSalesChannelLabel(latestGeneratedBill)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Payment Mode:</span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 font-semibold">
                      {latestGeneratedBill.payment_method?.startsWith('Split') ? (
                        <ArrowRightLeft className="w-3 h-3 shrink-0" />
                      ) : latestGeneratedBill.payment_method === 'Online' ? (
                        <Globe className="w-3 h-3 shrink-0" />
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
                      <span className="min-w-0 truncate">
                        {li.item_name}
                        {li.subcategory_name ? ` (${li.subcategory_name})` : ''}{' '}
                        <span className="text-slate-500 font-medium">×{li.quantity}</span>
                      </span>
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
          SEPARATE TAB: ACCEPT ORDER & DUE BILLS
      ======================================================================== */}
      {activeRole === 'orders' && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Active Shop Banner */}
          <div className="bg-white border border-purple-200 shadow-xs rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                <Store className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold text-purple-950">
                  Active Shop: {currentActiveShop?.name || 'Main Store'}
                </p>
              </div>
            </div>

            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
              {isAdmin && shops.length > 0 && (
                <select
                  value={activeShopId}
                  onChange={(e) => {
                    setActiveShopId(e.target.value);
                    setCart([]);
                  }}
                  className="w-full min-w-0 max-w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600 sm:w-auto"
                >
                  {distinctShops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — Profile: {s.sales_profile_name}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => setActiveRole('sales')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FAF8F5] hover:bg-purple-50 text-purple-900 border border-purple-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Back to Sales Terminal</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Place Your Cake Order Form + Latest Generated Bill */}
            <div className="lg:col-span-6 space-y-5">
              <form
                onSubmit={handleAcceptOrder}
                className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-purple-100">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                      <ClipboardList className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-bold text-purple-950 text-base">
                        Place Your Cake Order
                      </h2>
                      <p className="text-xs text-slate-500">
                        Fields marked * are required. Advance payments generate a live bill automatically.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Order Snapshot Strip */}
                {(() => {
                  const snapCategory =
                    categories.find((c) => String(c.id) === String(orderCategoryId))?.name ||
                    'Not selected';
                  const snapFlavor =
                    orderCakeFlavorInput === '__CUSTOM__'
                      ? orderCustomFlavorInput.trim() || 'Not selected'
                      : orderCakeFlavorInput || 'Not selected';
                  const snapSize =
                    orderCakeSizeInput === '__CUSTOM__'
                      ? orderCustomSizeInput.trim() || 'Not selected'
                      : orderCakeSizeInput || 'Not selected';
                  const snapTotal = parseFloat(orderTotalInput) || 0;
                  const snapAdv = parseFloat(orderAdvanceInput) || 0;
                  const snapBal = Math.max(0, snapTotal - snapAdv);
                  return (
                    <div className="bg-[#FAF8F5] border border-purple-100 rounded-xl p-3 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Order Snapshot
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                        <span
                          className={`px-2.5 py-0.5 rounded-full border ${
                            orderTypeInput === 'Theme'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-purple-50 text-purple-800 border-purple-200'
                          }`}
                        >
                          Type: <strong>{orderTypeInput}</strong>
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-white text-purple-900 border border-purple-200">
                          Category: <strong>{snapCategory}</strong>
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200">
                          Flavor: <strong>{snapFlavor}</strong>
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-900 border border-purple-200">
                          Size: <strong>{snapSize}</strong>
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full border ${
                            snapTotal > 0 && snapBal <= 0
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          Balance:{' '}
                          <strong>
                            {snapTotal > 0 && snapBal <= 0
                              ? 'Paid in full'
                              : `₹${snapBal.toFixed(2)}`}
                          </strong>
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* ORDER TYPE * */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                    Order Type *
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setOrderTypeInput('Regular')}
                      className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        orderTypeInput === 'Regular'
                          ? 'bg-purple-50 border-purple-600 text-purple-900 shadow-2xs ring-1 ring-purple-500/30'
                          : 'bg-white border-purple-100 text-slate-600 hover:border-purple-300'
                      }`}
                    >
                      <span>🍰</span>
                      <span>Regular Cake</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderTypeInput('Theme')}
                      className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                        orderTypeInput === 'Theme'
                          ? 'bg-purple-50 border-purple-600 text-purple-900 shadow-2xs ring-1 ring-purple-500/30'
                          : 'bg-white border-purple-100 text-slate-600 hover:border-purple-300'
                      }`}
                    >
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>Theme/Designer Cake</span>
                    </button>
                  </div>
                </div>

                {/* CUSTOMER NAME * & ORDER DATE & TIME * */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Customer Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Enter Customer Name"
                      value={orderCustomerNameInput}
                      onChange={(e) => setOrderCustomerNameInput(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Order Date & Time *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={orderDateTimeInput}
                      onChange={(e) => setOrderDateTimeInput(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-purple-950 focus:outline-none focus:border-purple-600 focus:bg-white"
                    />
                  </div>
                </div>

                {/* CONTACT PHONE NO * */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-purple-500" />
                    Contact Phone No *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Enter Contact Phone Number"
                    value={orderContactPhoneInput}
                    onChange={(e) => setOrderContactPhoneInput(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>

                {/* STEP 1: CHOOSE CATEGORY * */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-purple-500" />
                    Choose Category *
                  </label>
                  <select
                    required={distinctCategories.length > 0}
                    value={orderCategoryId}
                    onChange={(e) => {
                      setOrderCategoryId(e.target.value);
                      setOrderCakeFlavorInput('');
                      setOrderCustomFlavorInput('');
                      setOrderCakeSizeInput('');
                      setOrderCustomSizeInput('');
                    }}
                    className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                  >
                    <option value="">-- Choose category --</option>
                    {distinctCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* STEP 2: CHOOSE FLAVOR * & SELECT TYPE (QUANTITY / SIZE) * WITH CUSTOM OPTIONS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Choose Flavor *
                    </label>
                    <select
                      required
                      value={orderCakeFlavorInput}
                      onChange={(e) => {
                        setOrderCakeFlavorInput(e.target.value);
                        if (e.target.value !== '__CUSTOM__') {
                          setOrderCustomFlavorInput('');
                        }
                        setOrderCakeSizeInput('');
                        setOrderCustomSizeInput('');
                      }}
                      className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                    >
                      <option value="">-- Choose flavor --</option>
                      {availableCakeFlavors.map((flav) => (
                        <option key={flav} value={flav}>
                          {flav}
                        </option>
                      ))}
                      <option value="__CUSTOM__">+ Enter Custom Flavor...</option>
                    </select>
                    {orderCakeFlavorInput === '__CUSTOM__' && (
                      <input
                        type="text"
                        required
                        placeholder="Enter custom flavor"
                        value={orderCustomFlavorInput}
                        onChange={(e) => setOrderCustomFlavorInput(e.target.value)}
                        className="mt-2 w-full bg-white border border-purple-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-600"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Type (Quantity / Size) *
                    </label>
                    <select
                      required
                      value={orderCakeSizeInput}
                      onChange={(e) => handleOrderSizeSelect(e.target.value)}
                      className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                    >
                      <option value="">-- Choose type / size --</option>
                      {orderAvailableSizes.map((sz) => (
                        <option key={sz} value={sz}>
                          {sz}
                        </option>
                      ))}
                      <option value="__CUSTOM__">+ Enter Custom Size / Type...</option>
                    </select>
                    {orderCakeSizeInput === '__CUSTOM__' && (
                      <input
                        type="text"
                        required
                        placeholder="Enter custom size / quantity"
                        value={orderCustomSizeInput}
                        onChange={(e) => setOrderCustomSizeInput(e.target.value)}
                        className="mt-2 w-full bg-white border border-purple-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-600"
                      />
                    )}
                  </div>
                </div>

                {/* CONDITIONAL: THEME DESIGN SPECIFICATIONS */}
                {orderTypeInput === 'Theme' && (
                  <div className="bg-purple-50/50 border border-purple-200 rounded-2xl p-3.5 space-y-3">
                    <label className="block text-xs font-bold uppercase tracking-wider text-purple-900 mb-1 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      Theme Design Specifications *
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Specify design, topper specifications, or theme guidelines..."
                      value={orderThemeSpecsInput}
                      onChange={(e) => setOrderThemeSpecsInput(e.target.value)}
                      className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-purple-600"
                    />
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-purple-900">
                        Design Reference Image (Optional)
                      </label>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-purple-300 bg-white px-3 py-2 text-xs font-semibold text-purple-800 hover:border-purple-500 cursor-pointer">
                          <ImagePlus className="w-4 h-4" />
                          <span>{orderDesignImageUrl ? 'Change Image' : 'Attach Image'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleOrderDesignImageUpload}
                            className="hidden"
                          />
                        </label>
                        {orderDesignImageUrl && (
                          <div className="flex items-center gap-2">
                            <img
                              src={orderDesignImageUrl}
                              alt="Order design reference"
                              className="h-14 w-14 rounded-lg border border-purple-200 object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => setOrderDesignImageUrl('')}
                              className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* WISHES WRITTEN ON CAKE (OPTIONAL) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Wishes Written on Cake (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder='e.g., "Happy 10th Birthday Olive!"'
                    value={orderWishesInput}
                    onChange={(e) => setOrderWishesInput(e.target.value)}
                    className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>

                {/* TOTAL AMOUNT & ADVANCE PAID */}
                <div className="bg-[#FAF8F5] border border-purple-100 rounded-2xl p-3.5 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Total Amount (₹) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        required
                        placeholder="0.00"
                        value={orderTotalInput}
                        onChange={(e) => setOrderTotalInput(e.target.value)}
                        className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2.5 text-sm font-bold text-purple-950 focus:outline-none focus:border-purple-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Advance Paid (₹)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={orderAdvanceInput}
                        onChange={(e) => {
                          setOrderAdvanceInput(e.target.value);
                          setOrderSplitCashAmount('');
                          setOrderSplitUpiAmount('');
                        }}
                        className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2.5 text-sm font-bold text-purple-950 focus:outline-none focus:border-purple-600"
                      />
                    </div>
                  </div>

                  {/* Advance Payment Mode (when Advance > 0) */}
                  {(parseFloat(orderAdvanceInput) || 0) > 0 && (
                    <div className="pt-2.5 border-t border-purple-100 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-600">
                          Advance Payment Mode
                        </span>
                        <div className="inline-flex items-center bg-white p-0.5 rounded-lg border border-purple-200/80">
                          {['Cash', 'UPI', 'Split'].map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setOrderAdvancePaymentMethod(mode)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                                orderAdvancePaymentMethod === mode
                                  ? 'bg-gradient-to-r from-purple-600 to-violet-700 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-purple-900'
                              }`}
                            >
                              {mode === 'Cash' && <Banknote className="w-3 h-3" />}
                              {mode === 'UPI' && <QrCode className="w-3 h-3" />}
                              {mode === 'Split' && <ArrowRightLeft className="w-3 h-3" />}
                              <span>{mode}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {orderAdvancePaymentMethod === 'Split' && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              Cash (₹)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={orderSplitCashAmount}
                              onChange={(e) => handleOrderSplitCashChange(e.target.value)}
                              className="w-full bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-purple-950 focus:outline-none focus:border-purple-600"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                              UPI (₹)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              value={orderSplitUpiAmount}
                              onChange={(e) => handleOrderSplitUpiChange(e.target.value)}
                              className="w-full bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-purple-950 focus:outline-none focus:border-purple-600"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Live Balance Summary */}
                  {(parseFloat(orderTotalInput) || 0) > 0 && (
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-purple-100">
                      <span className="text-slate-600 font-medium">
                        Balance Due on{' '}
                        <strong className="text-purple-900">
                          {(orderDateTimeInput || '').split('T')[0] || 'order date'}
                        </strong>
                      </span>
                      <span className="font-extrabold text-purple-900">
                        ₹
                        {Math.max(
                          0,
                          (parseFloat(orderTotalInput) || 0) - (parseFloat(orderAdvanceInput) || 0)
                        ).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingOrder}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white font-bold text-sm shadow-md shadow-purple-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSubmittingOrder ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting Cake Order...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {(parseFloat(orderAdvanceInput) || 0) > 0
                          ? 'Submit Cake Order & Generate Advance Bill'
                          : 'Submit Cake Order'}
                      </span>
                    </>
                  )}
                </button>
              </form>

              {/* Latest Generated Bill (Advance or Due Settlement) */}
              {latestGeneratedBill && (
                <div className="bg-gradient-to-b from-purple-50 to-white border border-purple-300 rounded-2xl p-5 shadow-md">
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-600 text-white">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Live Bill Generated
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
                        {latestGeneratedBill.payment_method === 'Split'
                          ? `Split (Cash: ₹${Number(latestGeneratedBill.cash_amount || 0).toFixed(2)}, UPI: ₹${Number(latestGeneratedBill.upi_amount || 0).toFixed(2)})`
                          : latestGeneratedBill.payment_method || 'Cash'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2 mb-3">
                    {latestGeneratedBill.items?.map((li, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                        <span className="truncate">
                          {li.item_name}
                          {li.subcategory_name ? ` (${li.subcategory_name})` : ''}
                        </span>
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

            {/* Right Column: View Due Bills & Collect Balance */}
            <div className="lg:col-span-6 bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-purple-100">
                <div>
                  <h2 className="font-bold text-purple-950 text-base flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-purple-600" />
                    Due Bills & Orders
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {shopOrdersSummary.dueTodayOrOverdue.length > 0 ? (
                      <>
                        <strong className="text-amber-700">
                          {shopOrdersSummary.dueTodayOrOverdue.length} due today/overdue
                        </strong>{' '}
                        (₹{shopOrdersSummary.totalDueTodayAmount.toFixed(2)})
                      </>
                    ) : (
                      'No pending balances due today'
                    )}
                  </p>
                </div>

                <div className="inline-flex bg-[#FAF8F5] p-0.5 rounded-xl border border-purple-200">
                  {[
                    {
                      id: 'due',
                      label: `Due Today (${shopOrdersSummary.dueTodayOrOverdue.length})`
                    },
                    {
                      id: 'upcoming',
                      label: `Upcoming (${shopOrdersSummary.upcoming.length})`
                    },
                    {
                      id: 'settled',
                      label: `Settled (${shopOrdersSummary.settled.length})`
                    }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setOrderDueViewMode(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        orderDueViewMode === tab.id
                          ? 'bg-purple-700 text-white'
                          : 'text-slate-600 hover:text-purple-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {orderDueViewMode === 'settled' ? (
                shopOrdersSummary.settled.length === 0 ? (
                  <div className="text-center py-10 bg-[#FAF8F5] rounded-xl border border-dashed border-purple-200">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-600">No settled orders yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                    {shopOrdersSummary.settled.map((order) => (
                      <div
                        key={order.id}
                        className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">
                              {order.customer_name || order.order_ref}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Settled
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            {order.cake_flavor ? `${order.cake_flavor} • ${order.cake_size || ''}` : order.order_ref} • Order Date:{' '}
                            <strong className="text-slate-800">{order.order_date}</strong>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                            Total Paid
                          </span>
                          <span className="text-sm font-extrabold text-emerald-800">
                            ₹{Number(order.total_amount).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (() => {
                const displayOrders =
                  orderDueViewMode === 'due'
                    ? shopOrdersSummary.dueTodayOrOverdue
                    : shopOrdersSummary.upcoming;

                if (displayOrders.length === 0) {
                  return (
                    <div className="text-center py-10 bg-[#FAF8F5] rounded-xl border border-dashed border-purple-200">
                      <Clock className="w-8 h-8 text-purple-300 mx-auto mb-2" />
                      <p className="text-sm font-medium text-slate-600">
                        {orderDueViewMode === 'due'
                          ? 'No orders due today for this shop.'
                          : 'No upcoming scheduled orders.'}
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {displayOrders.map((order) => (
                      <DueOrderBillRow
                        key={order.id}
                        order={order}
                        todayStr={shopOrdersSummary.todayStr}
                        onSettle={handleSettleOrderDue}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </main>
      )}

      {/* ========================================================================
          ROLE 2: ADMIN & SHOP-ADMIN PANEL
      ======================================================================== */}
      {activeRole === 'admin' && isAdminAuthenticated && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Admin Sub-Navigation */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-purple-100 shadow-xs p-2 sm:p-4 rounded-2xl">
            <div className="admin-tab-scroll w-full sm:w-auto">
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
                onClick={() => setAdminTab('orders-dashboard')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  adminTab === 'orders-dashboard'
                    ? 'bg-purple-700 text-white shadow-sm'
                    : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                <span>Orders Dashboard</span>
                {adminOrdersDashboardData.targetDateOrders.length > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      adminTab === 'orders-dashboard'
                        ? 'bg-white text-purple-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}
                  >
                    {adminOrdersDashboardData.targetDateOrders.length}
                  </span>
                )}
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
                onClick={() => setAdminTab('shops')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  adminTab === 'shops'
                    ? 'bg-purple-700 text-white shadow-sm'
                    : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>Stock & Alerts</span>
                {unifiedStockData.totalAlertCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      adminTab === 'shops'
                        ? 'bg-white text-purple-800'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {unifiedStockData.totalAlertCount}
                  </span>
                )}
              </button>

              {isSuperAdmin && (
                <button
                  onClick={() => setAdminTab('inventory')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    adminTab === 'inventory'
                      ? 'bg-purple-700 text-white shadow-sm'
                      : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  Menu Editor
                </button>
              )}
              {(isAdmin || isShopAdmin) && (
                <button
                  onClick={() => setAdminTab('reports')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    adminTab === 'reports'
                      ? 'bg-purple-700 text-white shadow-sm'
                      : 'bg-[#FAF8F5] text-slate-600 hover:text-purple-900 border border-purple-100'
                  }`}
                >
                  <Printer className="w-4 h-4" />
                  Print Reports
                </button>
              )}
              {isAdmin && (
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
              )}
            </div>

            {isAdmin && adminTab === 'analytics' && shops.length > 0 && (
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
                <span className="text-xs font-semibold text-slate-500">Filter Shop:</span>
                <select
                  value={adminSelectedShopFilter}
                  onChange={(e) => setAdminSelectedShopFilter(e.target.value)}
                  className="w-full min-w-0 max-w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600 sm:w-auto"
                >
                  <option value="ALL">All Shops (Total Combined)</option>
                  {distinctShops.map((s) => (
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

              {/* Top Summary Cards */}
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

              <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-3">
                <div>
                  <h3 className="font-bold text-purple-950 text-base">Sales by Channel</h3>
                  <p className="text-xs text-slate-500">
                    Totals for the selected date range and shop filter.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {analyticsData.channelRows.map((channel) => (
                    <div
                      key={channel.id}
                      className="rounded-xl border border-purple-100 bg-[#FAF8F5] p-4"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {channel.label}
                      </p>
                      <p className="mt-1 text-xl font-extrabold text-purple-950">
                        ₹{channel.totalSales.toFixed(2)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {channel.billCount} {channel.billCount === 1 ? 'bill' : 'bills'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Super Admin: Shop-Wise Sales & Total Combined Sales Summary Table */}
              {isAdmin && shops.length > 0 && (
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
                    <span className="max-w-full break-words px-3 py-1 rounded-xl bg-purple-100 text-purple-900 text-xs font-bold">
                      All Shops Combined: ₹{analyticsData.allShopsCombinedSales.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <table className="responsive-stack-table w-full text-left border-collapse">
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
                            <td data-label="Shop Name" className="py-3.5 px-5 font-semibold text-slate-900">
                              {sr.shopName}
                              {sr.location && (
                                <span className="block text-xs font-normal text-slate-400">
                                  {sr.location}
                                </span>
                              )}
                            </td>
                            <td data-label="Assigned Sales Profile" className="py-3.5 px-4">
                              <span className="px-2.5 py-1 rounded-md bg-purple-100 text-purple-800 text-xs font-semibold">
                                {sr.salesProfileName}
                              </span>
                            </td>
                            <td data-label="Bills Count" className="py-3.5 px-4 text-right text-slate-600">
                              {sr.billCount}
                            </td>
                            <td data-label="Cash (₹)" className="py-3.5 px-4 text-right font-medium text-slate-700">
                              ₹{sr.cashSales.toFixed(2)}
                            </td>
                            <td data-label="UPI (₹)" className="py-3.5 px-4 text-right font-medium text-slate-700">
                              ₹{sr.upiSales.toFixed(2)}
                            </td>
                            <td data-label="Amount (₹)" className="py-3.5 px-5 text-right font-bold text-purple-950">
                              ₹{sr.totalSales.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-purple-50/90 font-bold text-purple-950 border-t-2 border-purple-200">
                          <td data-label="Total Sales" className="py-3.5 px-5" colSpan={2}>
                            Total Sales From All Shops ({analyticsData.shopRows.length} Shops)
                          </td>
                          <td data-label="Bills Count" className="py-3.5 px-4 text-right">
                            {analyticsData.shopRows.reduce((s, r) => s + r.billCount, 0)}
                          </td>
                          <td data-label="Cash (₹)" className="py-3.5 px-4 text-right text-purple-900">
                            ₹{analyticsData.allShopsCombinedCash.toFixed(2)}
                          </td>
                          <td data-label="UPI (₹)" className="py-3.5 px-4 text-right text-purple-900">
                            ₹{analyticsData.allShopsCombinedUpi.toFixed(2)}
                          </td>
                          <td data-label="Amount (₹)" className="py-3.5 px-5 text-right text-base text-purple-800">
                            ₹{analyticsData.allShopsCombinedSales.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Category Breakdown Table */}
              <div className="bg-white border border-purple-100 shadow-xs rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-purple-950 text-base">
                      Category-Wise Sales
                    </h3>
                  </div>
                </div>

                <div>
                  <table className="responsive-stack-table w-full text-left border-collapse">
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
                            <td data-label="Category" className="py-4 px-5 font-semibold text-slate-900">
                              {row.categoryName}
                            </td>
                            <td data-label="Units Sold" className="py-4 px-4 text-right text-slate-600">
                              {row.unitsSold}
                            </td>
                            <td data-label="Total Category Sale" className="py-4 px-4 text-right font-bold text-slate-900">
                              ₹{row.totalSales.toFixed(2)}
                            </td>
                            {!isAllShopsAnalyticsSelected && (
                              <>
                                <td data-label="Expense %" className="py-4 px-4">
                                  {row.categoryId && (isAdmin || isShopAdmin) ? (
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
                                <td data-label="Highlighted Expense Amount" className="py-4 px-5 text-right bg-purple-50/90 border-x border-purple-200/70">
                                  <span className="inline-flex items-center px-3 py-1 rounded-lg bg-purple-600 text-white font-bold shadow-xs">
                                    ₹{row.expenseAmount.toFixed(2)}
                                  </span>
                                </td>
                                <td data-label="Net Balance" className="py-4 px-5 text-right font-semibold text-slate-800">
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

          {/* ADMIN TAB: ORDERS DASHBOARD (SCHEDULED CAKES BY DATE + SIZE BREAKDOWN) */}
          {adminTab === 'orders-dashboard' && (
            <div className="space-y-6">
              {/* Top Header Card */}
              <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-purple-950 flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-purple-600" />
                    Orders Dashboard
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Viewing scheduled cake orders and daily kitchen breakdown.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Shop Filter (Super Admin) */}
                  {isAdmin && shops.length > 0 && (
                    <div className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-700 mb-0.5">
                        Shop
                      </span>
                      <select
                        value={adminOrdersShopFilter}
                        onChange={(e) => setAdminOrdersShopFilter(e.target.value)}
                        className="bg-transparent text-xs font-bold text-purple-950 focus:outline-none"
                      >
                        <option value="ALL">All Shops</option>
                        {distinctShops.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Select Delivery Date */}
                  <div className="bg-purple-50/70 border border-purple-200 rounded-xl px-3.5 py-2">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-700 mb-0.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Select Delivery Date
                    </span>
                    <input
                      type="date"
                      value={adminOrdersDate}
                      onChange={(e) => setAdminOrdersDate(e.target.value)}
                      className="bg-white border border-purple-200 rounded-lg px-2.5 py-1 text-xs font-bold text-purple-950 focus:outline-none focus:border-purple-600"
                    />
                  </div>

                  {/* Target Date Orders KPI */}
                  <div className="bg-rose-50/70 border border-rose-200 rounded-xl px-4 py-2 text-center min-w-[120px]">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-700">
                      Target Date Orders
                    </span>
                    <span className="text-2xl font-extrabold text-rose-700">
                      {adminOrdersDashboardData.targetDateOrders.length}
                    </span>
                  </div>

                  {/* All-Time Orders KPI */}
                  <div className="bg-amber-50/80 border border-amber-200 rounded-xl px-4 py-2 text-center min-w-[120px]">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-800">
                      All-Time Orders
                    </span>
                    <span className="text-2xl font-extrabold text-amber-800">
                      {adminOrdersDashboardData.allTimeCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scheduled Cakes Table */}
              <div className="bg-white border border-purple-100 shadow-xs rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-purple-100 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-purple-950 text-base flex items-center gap-2">
                    <Clock className="w-4 h-4 text-purple-600" />
                    Scheduled Cakes for {formatLongDate(adminOrdersDate)}
                  </h3>
                  <span className="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1 rounded-full">
                    {adminOrdersDashboardData.targetDateOrders.length}{' '}
                    {adminOrdersDashboardData.targetDateOrders.length === 1 ? 'order' : 'orders'}
                  </span>
                </div>

                {adminOrdersDashboardData.targetDateOrders.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <ClipboardList className="w-10 h-10 text-purple-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-purple-950">
                      No cakes scheduled for {formatLongDate(adminOrdersDate)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Select another delivery date above to view scheduled orders.
                    </p>
                  </div>
                ) : (
                  <div>
                    <table className="responsive-stack-table w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#FAF8F5] border-b border-purple-100 text-[11px] uppercase tracking-wider text-slate-500">
                          <th className="py-3.5 px-4">Due Time</th>
                          <th className="py-3.5 px-4">Cake Details</th>
                          <th className="py-3.5 px-4">Writing</th>
                          <th className="py-3.5 px-4">Customer Name</th>
                          <th className="py-3.5 px-4">Contact Phone</th>
                          <th className="py-3.5 px-4 text-right">Amount (Total / Paid / Due)</th>
                          <th className="py-3.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-50 text-sm">
                        {adminOrdersDashboardData.targetDateOrders.map((order) => {
                          const orderShop = shops.find((s) => String(s.id) === String(order.shop_id));
                          const isTheme = (order.order_type || 'Regular') === 'Theme';
                          const paidAmt =
                            order.status === 'Settled'
                              ? Number(order.total_amount) || 0
                              : Number(order.advance_paid) || 0;
                          const dueAmt =
                            order.status === 'Settled'
                              ? 0
                              : Number(order.balance_due) || 0;

                          return (
                            <tr key={order.id} className="hover:bg-[#FAF8F5]/80 align-top">
                              <td data-label="Due Time" className="py-3.5 px-4 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-100 text-purple-900 text-xs font-bold">
                                  <Clock className="w-3 h-3" />
                                  {formatTime12Hour(order.order_time)}
                                </span>
                                {orderShop && (
                                  <span className="block text-[10px] font-semibold text-slate-400 mt-1.5">
                                    {orderShop.name}
                                  </span>
                                )}
                              </td>

                              <td data-label="Cake Details" className="py-3.5 px-4 min-w-[210px]">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-bold text-slate-900">
                                    {order.cake_flavor || order.order_ref}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                      isTheme
                                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                                        : 'bg-purple-50 text-purple-800 border-purple-200'
                                    }`}
                                  >
                                    {isTheme ? 'Theme' : 'Regular'}
                                  </span>
                                </div>
                                {order.cake_size && (
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    Size: <strong className="text-slate-700">{order.cake_size}</strong>
                                  </p>
                                )}
                                {isTheme && order.theme_specs && (
                                  <p className="text-xs text-purple-900 bg-purple-50/70 border border-purple-100 rounded-lg px-2 py-1 mt-1.5">
                                    <span className="font-bold">Design:</span> {order.theme_specs}
                                  </p>
                                )}
                              </td>

                              <td data-label="Writing" className="py-3.5 px-4 max-w-[180px]">
                                {order.wishes_on_cake ? (
                                  <div className="bg-amber-50/80 border border-amber-200 rounded-xl px-2.5 py-1.5 text-xs text-amber-950">
                                    <span className="block text-[9px] font-bold uppercase tracking-wider text-amber-700">
                                      Wishes on Cake:
                                    </span>
                                    <span className="font-semibold">"{order.wishes_on_cake}"</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400">—</span>
                                )}
                              </td>

                              <td data-label="Customer Name" className="py-3.5 px-4 whitespace-nowrap font-semibold text-slate-800">
                                {order.customer_name || order.order_ref}
                              </td>

                              <td data-label="Contact Phone" className="py-3.5 px-4 whitespace-nowrap text-xs font-medium text-slate-700">
                                {order.contact_phone ? (
                                  <span className="inline-flex items-center gap-1">
                                    <Phone className="w-3.5 h-3.5 text-purple-500" />
                                    {order.contact_phone}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>

                              <td data-label="Amount (Total / Paid / Due)" className="py-3.5 px-4 text-right whitespace-nowrap text-xs font-mono">
                                <div className="font-bold text-slate-900">
                                  Total: ₹{Number(order.total_amount).toFixed(2)}
                                </div>
                                <div className="font-bold text-emerald-700">
                                  {order.status === 'Settled' ? 'Paid' : 'Adv'}: ₹{paidAmt.toFixed(2)}
                                </div>
                                <div
                                  className={`font-bold ${
                                    dueAmt > 0 ? 'text-amber-700' : 'text-slate-400'
                                  }`}
                                >
                                  Due: ₹{dueAmt.toFixed(2)}
                                </div>
                              </td>

                              <td data-label="Actions" className="py-3.5 px-4 text-right whitespace-nowrap">
                                <div className="inline-flex flex-wrap items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingOrder({ ...order })}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    <span>Edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteOrder(order)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Delete</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Orders & Size Breakdown for Selected Date */}
              <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4">
                <h3 className="font-bold text-purple-950 text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-600" />
                  Orders & Size Breakdown for {formatLongDate(adminOrdersDate, true)}
                </h3>

                {adminOrdersDashboardData.flavorBreakdown.length === 0 ? (
                  <p className="text-xs text-slate-400">
                    No flavor breakdown available for this date.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {adminOrdersDashboardData.flavorBreakdown.map((item) => (
                      <div
                        key={item.flavor}
                        className="rounded-xl border border-purple-100 bg-[#FAF8F5] px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-1.5">
                          <div className="font-bold text-sm text-purple-950">
                            {item.flavor}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {Object.entries(item.sizes).map(([sizeName, count]) => (
                              <span
                                key={sizeName}
                                className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-purple-100/80 text-purple-900 border border-purple-200"
                              >
                                {sizeName}: {count}
                              </span>
                            ))}
                          </div>
                        </div>

                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          {item.totalCount} order(s)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
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
                    </strong>{' '}
                    • Online:{' '}
                    <strong className="text-purple-900">
                      ₹{ledgerPaymentTotals.online.toFixed(2)}
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
                    {['ALL', 'Cash', 'UPI', 'Split', 'Online'].map((mode) => (
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

                  <select
                    aria-label="Filter by sales channel"
                    value={billSalesChannelFilter}
                    onChange={(e) => setBillSalesChannelFilter(e.target.value)}
                    className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                  >
                    <option value="ALL">All Channels</option>
                    {BILL_SALES_CHANNELS.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.label}
                      </option>
                    ))}
                  </select>

                  {isAdmin && shops.length > 0 && (
                    <select
                      value={billShopFilter}
                      onChange={(e) => setBillShopFilter(e.target.value)}
                      className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                    >
                      <option value="ALL">All Shops</option>
                      {distinctShops.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {(billSearchQuery ||
                    billPaymentFilter !== 'ALL' ||
                    billSalesChannelFilter !== 'ALL' ||
                    billShopFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setBillSearchQuery('');
                        setBillPaymentFilter('ALL');
                        setBillSalesChannelFilter('ALL');
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
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-900">
                              {getBillSalesChannelLabel(bill)}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-100 text-purple-800">
                              {bill.payment_method?.startsWith('Split') ? (
                                <ArrowRightLeft className="w-3 h-3" />
                              ) : bill.payment_method === 'Online' ? (
                                <Globe className="w-3 h-3" />
                              ) : bill.payment_method === 'UPI' ? (
                                <QrCode className="w-3 h-3" />
                              ) : (
                                <Banknote className="w-3 h-3" />
                              )}
                              {bill.payment_method === 'Split'
                                ? `Split (Cash: ₹${Number(bill.cash_amount || 0).toFixed(2)}, UPI: ₹${Number(bill.upi_amount || 0).toFixed(2)})`
                                : bill.payment_method || 'Cash'}
                            </span>
                            {editingBillDateId === bill.id && isSuperAdmin ? (
                              <span className="inline-flex flex-wrap items-center gap-1">
                                <input
                                  type="date"
                                  aria-label={`New date for bill ${bill.bill_number}`}
                                  value={billDateDraft}
                                  onChange={(e) => setBillDateDraft(e.target.value)}
                                  disabled={Boolean(processingBillAction)}
                                  className="bg-white border border-purple-200 rounded-lg px-2 py-1 text-xs text-purple-950 focus:outline-none focus:border-purple-600"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveBillDate(bill)}
                                  disabled={!billDateDraft || Boolean(processingBillAction)}
                                  title="Save bill date"
                                  className="p-2 rounded-lg text-purple-700 hover:bg-purple-100 disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  {processingBillAction?.id === bill.id &&
                                  processingBillAction.action === 'date' ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Save className="w-4 h-4" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingBillDateId(null);
                                    setBillDateDraft('');
                                  }}
                                  disabled={Boolean(processingBillAction)}
                                  title="Cancel date edit"
                                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 disabled:text-slate-300 cursor-pointer"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </span>
                            ) : (
                              <span className="inline-flex flex-wrap items-center gap-1 text-xs text-slate-500">
                                {new Date(bill.created_at).toLocaleString()}
                                {isSuperAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingBillDateId(bill.id);
                                      setBillDateDraft(getLocalDateStr(new Date(bill.created_at)));
                                    }}
                                    disabled={Boolean(processingBillAction)}
                                    title={`Edit date for bill ${bill.bill_number}`}
                                    aria-label={`Edit date for bill ${bill.bill_number}`}
                                    className="p-2 rounded-lg text-purple-600 hover:bg-purple-100 disabled:text-slate-300 cursor-pointer"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                )}
                              </span>
                            )}
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
                        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                          <span className="text-base font-bold text-purple-950">
                            ₹{Number(bill.total_amount).toFixed(2)}
                          </span>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteBill(bill)}
                              disabled={Boolean(processingBillAction)}
                              title={`Delete bill ${bill.bill_number}`}
                              aria-label={`Delete bill ${bill.bill_number}`}
                              className="p-2 rounded-lg text-rose-600 hover:bg-rose-100 disabled:text-slate-300 disabled:cursor-not-allowed cursor-pointer"
                            >
                              {processingBillAction?.id === bill.id &&
                              processingBillAction.action === 'delete' ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {adminTab === 'reports' && (isAdmin || isShopAdmin) && (
            <div className="print-report-root space-y-5 rounded-2xl border border-purple-100 bg-white p-5 shadow-xs">
              <div className="no-print flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-bold text-purple-950 text-lg">Printable Shop Reports</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    The category filter applies to stock reports; the selected date applies to orders.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="print-stock-category" className="text-xs font-semibold text-slate-600">
                    Stock category
                  </label>
                  <select
                    id="print-stock-category"
                    value={printReportCategoryFilter}
                    onChange={(e) => setPrintReportCategoryFilter(e.target.value)}
                    className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                  >
                    <option value="ALL">All categories</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="print-orders-date" className="text-xs font-semibold text-slate-600">
                    Orders due date
                  </label>
                  <input
                    id="print-orders-date"
                    type="date"
                    value={adminOrdersDate}
                    onChange={(e) => setAdminOrdersDate(e.target.value)}
                    className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                  />
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 rounded-xl bg-purple-700 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-600 cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Print Reports
                  </button>
                </div>
              </div>

              <div className="space-y-6 print-report-paper">
                <section id="report-orders-due" className="print-report-section space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-purple-950">
                      Orders Due for {adminOrdersDate ? formatLongDate(adminOrdersDate) : 'Selected Date'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => handlePrintReportSection('orders-due')}
                      className="no-print inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-semibold text-purple-800 hover:bg-purple-50 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print section
                    </button>
                  </div>
                  {ordersForPrintDate.length === 0 ? (
                    <p className="text-sm text-slate-500">No orders found for this date.</p>
                  ) : (
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#FAF8F5] text-left text-slate-600">
                          <th className="border border-purple-100 px-2 py-1.5">Shop</th>
                          <th className="border border-purple-100 px-2 py-1.5">Time</th>
                          <th className="border border-purple-100 px-2 py-1.5">Customer</th>
                          <th className="border border-purple-100 px-2 py-1.5">Contact</th>
                          <th className="border border-purple-100 px-2 py-1.5">Order</th>
                          <th className="border border-purple-100 px-2 py-1.5">Status</th>
                          <th className="border border-purple-100 px-2 py-1.5 text-right">Balance Due</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordersForPrintDate.map((order) => (
                          <tr key={order.id}>
                            <td className="border border-purple-100 px-2 py-1.5">
                              {shops.find((shop) => String(shop.id) === String(order.shop_id))?.name || '—'}
                            </td>
                            <td className="border border-purple-100 px-2 py-1.5">{order.order_time || '—'}</td>
                            <td className="border border-purple-100 px-2 py-1.5">{order.customer_name || '—'}</td>
                            <td className="border border-purple-100 px-2 py-1.5">{order.contact_phone || '—'}</td>
                            <td className="border border-purple-100 px-2 py-1.5">
                              {[order.order_ref, order.cake_flavor, order.cake_size].filter(Boolean).join(' · ') || order.order_type || '—'}
                            </td>
                            <td className="border border-purple-100 px-2 py-1.5">{order.status || 'Pending'}</td>
                            <td className="border border-purple-100 px-2 py-1.5 text-right">
                              ₹{(Number(order.balance_due) || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>

                <section id="report-out-of-stock" className="print-report-section space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-purple-950">
                      Out-of-Stock Items by Shop
                      {printReportCategoryName ? ` — ${printReportCategoryName}` : ''}
                    </h3>
                    <button
                      type="button"
                      onClick={() => handlePrintReportSection('out-of-stock')}
                      className="no-print inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-semibold text-purple-800 hover:bg-purple-50 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print section
                    </button>
                  </div>
                  {printStockReport.shopSections.length === 0 ? (
                    <p className="text-sm text-slate-500">No shops found.</p>
                  ) : (
                    printStockReport.shopSections.map(({ shop, outOfStockItems }) => (
                      <div key={shop.id} className="space-y-2">
                        <h4 className="text-sm font-semibold text-purple-900">
                          {shop.name} ({outOfStockItems.length})
                        </h4>
                        {outOfStockItems.length === 0 ? (
                          <p className="text-xs text-slate-500">No out-of-stock items.</p>
                        ) : (
                          <table className="w-full border-collapse text-xs">
                            <thead>
                              <tr className="bg-[#FAF8F5] text-left text-slate-600">
                                <th className="border border-purple-100 px-2 py-1.5">Flavour</th>
                                <th className="border border-purple-100 px-2 py-1.5">Category</th>
                                <th className="border border-purple-100 px-2 py-1.5">Item</th>
                                <th className="border border-purple-100 px-2 py-1.5 text-right">Stock</th>
                              </tr>
                            </thead>
                            <tbody>
                              {outOfStockItems.map((item) => (
                                <tr key={item.key}>
                                  <td className="border border-purple-100 px-2 py-1.5">{item.flavourName || '—'}</td>
                                  <td className="border border-purple-100 px-2 py-1.5">{item.categoryName}</td>
                                  <td className="border border-purple-100 px-2 py-1.5">{item.itemName}</td>
                                  <td className="border border-purple-100 px-2 py-1.5 text-right">{item.stock}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    ))
                  )}
                </section>

                <section id="report-current-stock" className="print-report-section space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-purple-950">
                      {printReportCategoryName
                        ? `Current Stock — ${printReportCategoryName}${
                            isShopAdmin
                              ? ` (${currentActiveShop?.name || 'My Shop'})`
                              : ' (All Shops)'
                          }`
                        : isShopAdmin
                        ? `Current Stock — ${currentActiveShop?.name || 'My Shop'}`
                        : 'Current Stock Across All Shops'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => handlePrintReportSection('current-stock')}
                      className="no-print inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-xs font-semibold text-purple-800 hover:bg-purple-50 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print section
                    </button>
                  </div>
                  {printStockReport.shopSections.length === 0 ? (
                    <p className="text-sm text-slate-500">No shops found.</p>
                  ) : (
                    printStockReport.shopSections.map(({ shop, items: shopItems, flavourGroups }) => {
                      return (
                        <div key={shop.id} className="space-y-2">
                          <h4 className="text-sm font-semibold text-purple-900">{shop.name}</h4>
                          {shopItems.length === 0 ? (
                            <p className="text-xs text-slate-500">No stock items available for this shop.</p>
                          ) : (
                            <table className="w-full border-collapse text-xs">
                              <thead>
                                <tr className="bg-[#FAF8F5] text-left text-slate-600">
                                  <th className="border border-purple-100 px-2 py-1.5">Category</th>
                                  <th className="border border-purple-100 px-2 py-1.5">Flavour</th>
                                  <th className="border border-purple-100 px-2 py-1.5">Item - Count</th>
                                </tr>
                              </thead>
                              <tbody>
                                {flavourGroups.map((group) => (
                                  <tr key={group.key}>
                                    <td className="border border-purple-100 px-2 py-1.5">{group.categoryName}</td>
                                    <td className="border border-purple-100 px-2 py-1.5">{group.flavourName || '—'}</td>
                                    <td className="border border-purple-100 px-2 py-1.5">
                                      <div className="space-y-1">
                                        {group.items.map((item) => (
                                          <div key={item.key}>{item.itemName} - {item.stock}</div>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })
                  )}
                </section>

              </div>
            </div>
          )}

          {/* UNIFIED STOCK & ALERTS TAB (MERGES STOCK ALERTS + STOCK UPDATE + CURRENT STOCK AT A GLANCE) */}
          {adminTab === 'shops' && (isAdmin || isShopAdmin) && (
            <div className="space-y-6">
              {/* Top Summary KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Total Stock Units
                  </span>
                  <div className="text-2xl font-extrabold text-purple-950 mt-1.5">
                    {unifiedStockData.totalUnits}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isShopAdmin
                      ? currentActiveShop?.name || 'My Shop'
                      : stockUpdateShopFilter === 'ALL'
                      ? 'Across all shops'
                      : shops.find((s) => s.id === stockUpdateShopFilter)?.name || 'Selected shop'}
                  </p>
                </div>

                <div className="bg-emerald-50/80 border border-emerald-200 shadow-xs rounded-2xl p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    In Stock (&gt;{unifiedStockData.threshold})
                  </span>
                  <div className="text-2xl font-extrabold text-emerald-700 mt-1.5">
                    {unifiedStockData.inStockCount}
                  </div>
                  <p className="text-[11px] text-emerald-700/80 mt-0.5">Healthy stock levels</p>
                </div>

                <div className="bg-amber-50/80 border border-amber-200 shadow-xs rounded-2xl p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    Out of Stock Soon (1–{unifiedStockData.threshold})
                  </span>
                  <div className="text-2xl font-extrabold text-amber-700 mt-1.5">
                    {unifiedStockData.lowStockCount}
                  </div>
                  <p className="text-[11px] text-amber-800/80 mt-0.5">Plan restock soon</p>
                </div>

                <div className="bg-rose-50/80 border border-rose-200 shadow-xs rounded-2xl p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                    Out of Stock (0)
                  </span>
                  <div className="text-2xl font-extrabold text-rose-700 mt-1.5">
                    {unifiedStockData.outOfStockCount}
                  </div>
                  <p className="text-[11px] text-rose-700/80 mt-0.5">Needs immediate restock</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Column (Super Admin): Assign Stock to Shop + Transfer Stock Between Shops */}
                {isAdmin && (
                  <div className="lg:col-span-4 space-y-6">
                    {/* Form 1: Assign Stock to Shop */}
                    <form
                      onSubmit={handleAssignStockToShop}
                      className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4"
                    >
                      <div className="flex items-center gap-2 text-purple-950 font-bold">
                        <Plus className="w-5 h-5 text-purple-600" />
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
                          options={distinctShops.map((s) => ({
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
                          options={distinctCategories.map((cat) => ({
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
                        disabled={shops.length === 0 || !assignItemId || isAssigningStock}
                        className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isAssigningStock ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Assigning Stock...</span>
                          </>
                        ) : (
                          <span>Assign Stock to Shop</span>
                        )}
                      </button>
                    </form>

                    {/* Form 2: Transfer Stock Between Shops */}
                    <form
                      onSubmit={handleTransferStockBetweenShops}
                      className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-4"
                    >
                      <div className="flex items-center gap-2 text-purple-950 font-bold">
                        <ArrowRightLeft className="w-5 h-5 text-purple-600" />
                        <h3>Transfer Stock Between Shops</h3>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            From Shop (Source)
                          </label>
                          <SearchableSelect
                            value={transferFromShopId}
                            onChange={setTransferFromShopId}
                            placeholder="Select source shop..."
                            searchPlaceholder="Search shop..."
                            emptyMessage="Need at least 2 shops"
                            options={distinctShops.map((s) => ({
                              value: s.id,
                              label: `${s.name} (${s.sales_profile_name})`
                            }))}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            To Shop (Destination)
                          </label>
                          <SearchableSelect
                            value={transferToShopId}
                            onChange={setTransferToShopId}
                            placeholder="Select destination shop..."
                            searchPlaceholder="Search shop..."
                            emptyMessage="Need at least 2 shops"
                            options={distinctShops
                              .filter((s) => s.id !== transferFromShopId)
                              .map((s) => ({
                                value: s.id,
                                label: `${s.name} (${s.sales_profile_name})`
                              }))}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Category
                        </label>
                        <SearchableSelect
                          value={transferCategoryId}
                          onChange={(val) => {
                            setTransferCategoryId(val);
                            setTransferSubcategoryId('');
                          }}
                          placeholder="Select category..."
                          searchPlaceholder="Search category..."
                          emptyMessage="Create a category first"
                          options={distinctCategories.map((cat) => ({
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
                          value={transferSubcategoryId}
                          onChange={setTransferSubcategoryId}
                          placeholder="All Flavours / Items"
                          searchPlaceholder="Search flavour / item..."
                          emptyMessage="No flavours found"
                          options={[
                            { value: '', label: 'All Flavours / Items' },
                            ...transferCategorySubcategories.map((sc) => ({
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
                          value={transferItemId}
                          onChange={setTransferItemId}
                          placeholder="Select item type..."
                          searchPlaceholder="Search item type..."
                          emptyMessage="No types found"
                          options={transferFilteredItems.map((it) => {
                            const sub = subcategories.find((sc) => sc.id === it.subcategory_id);
                            return {
                              value: it.id,
                              label: `${!transferSubcategoryId && sub ? `${sub.name} → ` : ''}${it.name}`
                            };
                          })}
                        />
                        {transferFromShopId && transferItemId && (
                          <p className="text-[11px] font-semibold text-purple-700 mt-1">
                            Available in source shop: {transferSourceAvailableStock} units
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Quantity to Transfer
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={transferSourceAvailableStock || undefined}
                          required
                          placeholder="e.g., 5"
                          value={transferQty}
                          onChange={(e) => setTransferQty(e.target.value)}
                          className="w-full bg-[#FAF8F5] border border-purple-100 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-purple-500 focus:bg-white"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={
                          shops.length < 2 ||
                          !transferItemId ||
                          transferSourceAvailableStock <= 0 ||
                          isTransferringStock
                        }
                        className="w-full py-2.5 px-4 rounded-xl bg-purple-100 hover:bg-purple-200 disabled:bg-slate-100 disabled:text-slate-400 text-purple-950 border border-purple-200 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isTransferringStock ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Transferring...</span>
                          </>
                        ) : (
                          <>
                            <ArrowRightLeft className="w-4 h-4" />
                            <span>Transfer Stock</span>
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                )}

                {/* Right Column: Unified Current Stock + Alerts + Add-to-Stock Updates */}
                <div className={`${isAdmin ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-5`}>
                  {/* Filter Bar */}
                  <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-purple-950 text-base">
                          Current Stock, Alerts & Quick Update
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Add stock to the current count. Admins can also set an exact count. Click the category-level <strong>Update</strong> button to save.
                        </p>
                      </div>

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
                    </div>

                    {/* Status Filter Pills */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex bg-[#FAF8F5] p-0.5 rounded-xl border border-purple-200">
                        {[
                          { id: 'ALL', label: 'All Stock' },
                          { id: 'OUT_OF_STOCK', label: 'Out of Stock' },
                          { id: 'LOW_STOCK', label: 'Soon' },
                          { id: 'IN_STOCK', label: 'In Stock' }
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

                      {/* Search */}
                      <div className="relative flex-1 min-w-[180px]">
                        <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search shop, category, flavour, item..."
                          value={stockUpdateSearchQuery}
                          onChange={(e) => setStockUpdateSearchQuery(e.target.value)}
                          className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl pl-8 pr-7 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                        />
                        {stockUpdateSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setStockUpdateSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Dropdown Filters Row */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-purple-50">
                      {isAdmin && shops.length > 0 && (
                        <select
                          value={stockUpdateShopFilter}
                          onChange={(e) => setStockUpdateShopFilter(e.target.value)}
                          className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                        >
                          <option value="ALL">All Shops</option>
                          {distinctShops.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      )}

                      <select
                        value={stockUpdateCategoryFilter}
                        onChange={(e) => {
                          setStockUpdateCategoryFilter(e.target.value);
                          setStockGlanceFlavourFilter('ALL');
                          setStockGlanceItemTypeFilter('ALL');
                        }}
                        className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                      >
                        <option value="ALL">All Categories</option>
                        {distinctCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      <select
                        value={stockGlanceFlavourFilter}
                        onChange={(e) => {
                          setStockGlanceFlavourFilter(e.target.value);
                          setStockGlanceItemTypeFilter('ALL');
                        }}
                        className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                      >
                        <option value="ALL">All Flavours</option>
                        {unifiedStockData.availableFlavours.map((fl) => (
                          <option key={fl} value={fl}>
                            {fl}
                          </option>
                        ))}
                        <option value="GENERAL">General / None</option>
                      </select>

                      <select
                        value={stockGlanceItemTypeFilter}
                        onChange={(e) => setStockGlanceItemTypeFilter(e.target.value)}
                        className="bg-[#FAF8F5] border border-purple-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-purple-950 focus:outline-none focus:border-purple-600"
                      >
                        <option value="ALL">All Item Types</option>
                        {unifiedStockData.availableItemTypes.map((tp) => (
                          <option key={tp} value={tp}>
                            {tp}
                          </option>
                        ))}
                      </select>

                      {(stockAlertStatusFilter !== 'ALL' ||
                        stockUpdateShopFilter !== 'ALL' ||
                        stockUpdateCategoryFilter !== 'ALL' ||
                        stockGlanceFlavourFilter !== 'ALL' ||
                        stockGlanceItemTypeFilter !== 'ALL' ||
                        stockUpdateSearchQuery) && (
                        <button
                          type="button"
                          onClick={() => {
                            setStockAlertStatusFilter('ALL');
                            setStockUpdateShopFilter('ALL');
                            setStockUpdateCategoryFilter('ALL');
                            setStockGlanceFlavourFilter('ALL');
                            setStockGlanceItemTypeFilter('ALL');
                            setStockUpdateSearchQuery('');
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold cursor-pointer"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {/* Clickable By-Shop Totals Strip (when All Shops selected) */}
                    {isAdmin &&
                      stockUpdateShopFilter === 'ALL' &&
                      unifiedStockData.perShopTotals.length > 1 && (
                        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-purple-50 text-xs">
                          <span className="font-semibold text-slate-500">By Shop:</span>
                          {unifiedStockData.perShopTotals.map((st) => (
                            <button
                              key={st.shopId}
                              type="button"
                              onClick={() => setStockUpdateShopFilter(st.shopId)}
                              className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] hover:bg-purple-100 border border-purple-200 text-purple-950 font-semibold transition-colors cursor-pointer"
                            >
                              {st.shopName}: <strong className="text-purple-700">{st.units}</strong>
                            </button>
                          ))}
                        </div>
                      )}
                  </div>

                  {/* Shop -> Category -> Flavour Sections */}
                  {unifiedStockData.shopSections.length === 0 ? (
                    <div className="bg-white border border-dashed border-purple-200 rounded-2xl p-10 text-center text-xs text-slate-400">
                      Create shops and add menu items to manage inventory.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {unifiedStockData.shopSections.map(({ shop, shopTotalStock, categorySections }) => (
                        <div
                          key={shop.id}
                          className="bg-white border border-purple-200 shadow-xs rounded-2xl"
                        >
                          <div className="px-5 py-3.5 rounded-t-2xl bg-purple-900 text-white flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Store className="w-4 h-4 text-purple-200" />
                              <span className="font-bold text-sm">{shop.name}</span>
                              <span className="text-xs text-purple-200">
                                ({shop.sales_profile_name})
                              </span>
                            </div>
                            <span className="text-xs font-semibold bg-purple-800 px-2.5 py-0.5 rounded-full">
                              Total Shop Stock: {shopTotalStock}
                            </span>
                          </div>

                          <div className="p-4 space-y-4">
                            {categorySections.length === 0 ? (
                              <div className="text-center py-6 text-xs text-slate-400">
                                No items match the current filters in {shop.name}.
                              </div>
                            ) : (
                              categorySections.map((catSec) => {
                                const batchKey = `stock-${shop.id}-${catSec.category.id}`;
                                const catDirtyUpdates = catSec.catItems
                                  .map((it) => {
                                    const draftKey = `${shop.id}::${it.id}`;
                                    const draft = stockDrafts[draftKey] || {};
                                    const quantity = parseInt(draft.value, 10);
                                    const isSetMode = isAdmin && draft.mode === 'set';
                                    const hasValidQuantity =
                                      draft.value !== '' &&
                                      !isNaN(quantity) &&
                                      (isSetMode ? quantity >= 0 : quantity > 0);
                                    if (!hasValidQuantity) return null;
                                    const alloc = shopStocks.find(
                                      (ss) => ss.shop_id === shop.id && ss.item_id === it.id
                                    );
                                    const currentStock = alloc ? Number(alloc.stock) : 0;
                                    return {
                                      shopId: shop.id,
                                      itemId: it.id,
                                      stock: isSetMode ? quantity : currentStock + quantity,
                                      replace: isSetMode
                                    };
                                  })
                                  .filter(Boolean);

                                const isThisBatchUpdating = updatingBatchKey === batchKey;

                                return (
                                  <div
                                    key={`${shop.id}-${catSec.category.id}`}
                                    className="border border-purple-100 rounded-xl"
                                  >
                                    <div className="sticky top-24 sm:top-16 z-20 px-4 py-2.5 rounded-t-xl bg-purple-50 border-b border-purple-100 shadow-sm flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-bold text-purple-950 text-xs sm:text-sm">
                                          Category: {catSec.category.name}
                                        </span>
                                        {catSec.catOutCount > 0 && (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                            Out of stock: {catSec.catOutCount}
                                          </span>
                                        )}
                                        {catSec.catLowCount > 0 && (
                                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                            Out of stock soon: {catSec.catLowCount}
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-3">
                                        <span className="text-xs font-semibold text-purple-700">
                                          Stock: {catSec.catTotalStock}
                                        </span>
                                        <button
                                          type="button"
                                          disabled={
                                            catDirtyUpdates.length === 0 || Boolean(updatingBatchKey)
                                          }
                                          onClick={() =>
                                            handleBatchUpdateShopStock(
                                              catDirtyUpdates,
                                              'stock',
                                              batchKey
                                            )
                                          }
                                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                            catDirtyUpdates.length > 0 && !updatingBatchKey
                                              ? 'bg-purple-700 hover:bg-purple-600 text-white shadow-sm cursor-pointer'
                                              : 'bg-white border border-purple-200/70 text-slate-400 cursor-not-allowed'
                                          }`}
                                        >
                                          {isThisBatchUpdating ? (
                                            <>
                                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                              <span>Updating...</span>
                                            </>
                                          ) : (
                                            <>
                                              <CheckCircle2 className="w-3.5 h-3.5" />
                                              <span>
                                                {catDirtyUpdates.length > 0
                                                  ? `Update (${catDirtyUpdates.length})`
                                                  : 'Update'}
                                              </span>
                                            </>
                                          )}
                                        </button>
                                      </div>
                                    </div>

                                    <div>
                                      <table className="responsive-stack-table w-full text-left border-collapse">
                                        <thead>
                                          <tr className="bg-[#FAF8F5] border-b border-purple-100 text-[11px] uppercase tracking-wider text-slate-500">
                                            <th className="py-2.5 px-4 w-48">Flavour / Item</th>
                                            <th className="py-2.5 px-4">
                                              Types, Current Stock, Add Stock & Set Count
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-purple-50 text-sm">
                                          {catSec.flavourGroups.map((fg) => (
                                            <tr
                                              key={`${shop.id}-${catSec.category.id}-${fg.key}`}
                                              className="hover:bg-[#FAF8F5]/70 align-middle"
                                            >
                                              <td data-label="Flavour / Item" className="py-2.5 px-4 font-bold text-purple-950 text-xs sm:text-sm">
                                                {fg.flavourName}
                                              </td>
                                              <td data-label="                                              Types, Current Stock & Update" className="py-2.5 px-4">
                                                <div className="flex flex-wrap items-center gap-2">
                                                  {fg.entries.map(({ item, currentStock, status }) => {
                                                    const draftKey = `${shop.id}::${item.id}`;
                                                    const draft = stockDrafts[draftKey] || {};
                                                    return (
                                                      <StockItemEditor
                                                        key={`${shop.id}-${catSec.category.id}-${item.id}`}
                                                        item={item}
                                                        stock={currentStock}
                                                        status={status}
                                                        mode={isAdmin ? draft.mode || 'add' : 'add'}
                                                        value={draft.value || ''}
                                                        canSet={isAdmin}
                                                        onModeChange={(mode) =>
                                                          setStockDrafts((prev) => ({
                                                            ...prev,
                                                            [draftKey]: {
                                                              ...prev[draftKey],
                                                              mode
                                                            }
                                                          }))
                                                        }
                                                        onValueChange={(value) =>
                                                          setStockDrafts((prev) => ({
                                                            ...prev,
                                                            [draftKey]: {
                                                              ...prev[draftKey],
                                                              mode: isAdmin
                                                                ? prev[draftKey]?.mode || 'add'
                                                                : 'add',
                                                              value
                                                            }
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
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ADMIN TAB: MENU EDITOR (TABULAR VIEW PER CATEGORY) */}
          {adminTab === 'inventory' && isSuperAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Step 1 Category -> Step 2 Shop Expense % -> Step 3 Flavour / Item -> Step 4 Type / Product */}
              <div className="lg:col-span-3 space-y-6">
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
                    disabled={isCreatingCategory}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isCreatingCategory ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : (
                      <span>Create Category</span>
                    )}
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
                      {distinctShops.map((s) => (
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
                      {distinctCategories.map((cat) => (
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
                    disabled={shops.length === 0 || categories.length === 0 || isSavingExpenseConfig}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-100 hover:bg-purple-200 disabled:bg-slate-100 disabled:text-slate-400 text-purple-900 border border-purple-200 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isSavingExpenseConfig ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Shop Expense %</span>
                    )}
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
                      {distinctCategories.map((cat) => (
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
                    disabled={categories.length === 0 || isAddingSubcategory}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-100 hover:bg-purple-200 disabled:bg-slate-100 disabled:text-slate-400 text-purple-900 border border-purple-200 font-semibold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isAddingSubcategory ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save</span>
                    )}
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
                      {distinctCategories.map((cat) => (
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
                      {getDistinctByName(
                        subcategories.filter((sc) => sc.category_id === newItemCategory)
                      ).map((sc) => (
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

                  <button
                    type="submit"
                    disabled={categories.length === 0 || isCreatingItem}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isCreatingItem ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Adding Item...</span>
                      </>
                    ) : (
                      <span>Add to Menu</span>
                    )}
                  </button>
                </form>
              </div>

              {/* Right Column: Tabular Grouped-by-Category View */}
              <div className="lg:col-span-9 space-y-5">
                <div className="bg-white border border-purple-100 shadow-xs rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-purple-950 text-base">
                      Update Details (Grouped by Category)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Edit item details in each row, then save changes from the category heading.
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
                      const categoryHasUnsavedChanges = catItems.some(
                        (item) => Boolean(menuItemDrafts[item.id])
                      );
                      const isSavingCategory = savingMenuCategoryIds.has(cat.id);

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
                              <button
                                type="button"
                                disabled={!categoryHasUnsavedChanges || isSavingCategory}
                                onClick={() =>
                                  handleSaveMenuCategory(cat.id, cat.name, catItems)
                                }
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                                  categoryHasUnsavedChanges && !isSavingCategory
                                    ? 'bg-purple-700 hover:bg-purple-600 text-white cursor-pointer'
                                    : 'bg-slate-200/70 text-slate-400 cursor-not-allowed'
                                }`}
                              >
                                {isSavingCategory ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <>
                                    <Save className="w-3 h-3" />
                                    <span>Save</span>
                                  </>
                                )}
                              </button>
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white border border-purple-200 text-purple-800">
                                {catItems.length} {catItems.length === 1 ? 'item' : 'items'}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-3">
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

                          <div className="w-full">
                            <table className="w-full table-fixed text-left border-collapse">
                              <thead>
                                <tr className="bg-[#FAF8F5] border-b border-purple-100 text-[11px] uppercase tracking-wider text-slate-500">
                                  <th className="w-32 px-2 py-2.5 sm:w-48 sm:px-4">Flavour / Item</th>
                                  <th className="px-2 py-2.5 sm:px-4">Types, Stock Count & Price (₹)</th>
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
                                        <td className="px-2 py-2.5 font-bold text-purple-950 text-xs sm:px-4 sm:text-sm">
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
                                        <td className="min-w-0 px-2 py-2.5 sm:px-4">
                                          <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
                                            {row.items.map((it) => {
                                              const typeCount = shopStocks
                                                .filter((ss) => ss.item_id === it.id)
                                                .reduce((s, ss) => s + (Number(ss.stock) || 0), 0);
                                              return (
                                                <MenuItemEditor
                                                  key={it.id}
                                                  item={it}
                                                  categories={categories}
                                                  shops={shops}
                                                  isBilled={billedItemIds.has(it.id)}
                                                  typeCount={typeCount}
                                                  onDraftChange={handleMenuItemDraftChange}
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

          {/* ADMIN TAB 3: SHOPS CREATION, DATABASE USERS & PASSWORD MANAGEMENT */}
          {adminTab === 'users' && isAdmin && (
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
                    disabled={isCreatingShop}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isCreatingShop ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating Shop...</span>
                      </>
                    ) : (
                      <span>Create Shop</span>
                    )}
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
                      <option value="admin">Admin (All Operations Except Bill Changes)</option>
                      {isSuperAdmin && (
                        <option value="superadmin">Super Admin (All Shops & Settings)</option>
                      )}
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
                    disabled={isAddingUser}
                    className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isAddingUser ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving User...</span>
                      </>
                    ) : (
                      <span>Save User</span>
                    )}
                  </button>
                </form>
              </div>

              {/* Saved Database Users Table */}
              <div className="lg:col-span-8 bg-white border border-purple-100 shadow-xs rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-purple-100 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-purple-950 text-base">
                      Registered Users
                    </h3>
                    <p className="text-xs text-slate-500">
                      Manage User Accounts.
                    </p>
                  </div>
                  {currentLoggedInUser && (
                    <span className="max-w-full break-words text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-100 text-purple-800">
                      Signed in as: {currentLoggedInUser.username}
                    </span>
                  )}
                </div>

                <div>
                  <table className="responsive-stack-table w-full text-left border-collapse">
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
                              shops={shops}
                              canChangeRole={
                                isSuperAdmin && String(currentLoggedInUser?.id) !== String(u.id)
                              }
                              isCurrentUser={
                                isSuperAdmin &&
                                String(currentLoggedInUser?.id) === String(u.id)
                              }
                              onUpdatePassword={handleUpdateDbUserPassword}
                              onUpdateRole={handleUpdateDbUserRole}
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

      {/* Edit Cake Order Modal (Admin Orders Dashboard) */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-purple-200 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-purple-100">
              <h3 className="font-bold text-purple-950 text-base flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-purple-600" />
                Edit Cake Order
              </h3>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="p-1.5 rounded-lg bg-[#FAF8F5] hover:bg-purple-100 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateOrderDetails} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                {['Regular', 'Theme'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEditingOrder((prev) => ({ ...prev, order_type: type }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      (editingOrder.order_type || 'Regular') === type
                        ? 'bg-purple-50 border-purple-600 text-purple-900'
                        : 'bg-white border-purple-100 text-slate-600'
                    }`}
                  >
                    {type === 'Regular' ? '🍰 Regular Cake' : '✨ Theme/Designer Cake'}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingOrder.customer_name || ''}
                    onChange={(e) =>
                      setEditingOrder((prev) => ({ ...prev, customer_name: e.target.value }))
                    }
                    className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Contact Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={editingOrder.contact_phone || ''}
                    onChange={(e) =>
                      setEditingOrder((prev) => ({ ...prev, contact_phone: e.target.value }))
                    }
                    className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Delivery Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={editingOrder.order_date || ''}
                    onChange={(e) =>
                      setEditingOrder((prev) => ({ ...prev, order_date: e.target.value }))
                    }
                    className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Due Time
                  </label>
                  <input
                    type="time"
                    value={editingOrder.order_time || ''}
                    onChange={(e) =>
                      setEditingOrder((prev) => ({ ...prev, order_time: e.target.value }))
                    }
                    className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Cake Flavor *
                  </label>
                  <input
                    type="text"
                    required
                    value={editingOrder.cake_flavor || ''}
                    onChange={(e) =>
                      setEditingOrder((prev) => ({ ...prev, cake_flavor: e.target.value }))
                    }
                    className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Quantity / Size *
                  </label>
                  <input
                    type="text"
                    required
                    list="edit-order-size-options"
                    placeholder="Select or type custom size"
                    value={editingOrder.cake_size || ''}
                    onChange={(e) =>
                      setEditingOrder((prev) => ({ ...prev, cake_size: e.target.value }))
                    }
                    className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                  <datalist id="edit-order-size-options">
                    {availableCakeSizes.map((sz) => (
                      <option key={sz} value={sz} />
                    ))}
                  </datalist>
                </div>
              </div>

              {editingOrder.order_type === 'Theme' && (
                <div className="bg-purple-50/50 border border-purple-200 rounded-xl p-3 space-y-2.5">
                  <div>
                    <label className="block text-xs font-bold text-purple-900 mb-1">
                      Theme Design Specifications *
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={editingOrder.theme_specs || ''}
                      onChange={(e) =>
                        setEditingOrder((prev) => ({ ...prev, theme_specs: e.target.value }))
                      }
                      className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-600"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Wishes Written on Cake
                </label>
                <input
                  type="text"
                  value={editingOrder.wishes_on_cake || ''}
                  onChange={(e) =>
                    setEditingOrder((prev) => ({ ...prev, wishes_on_cake: e.target.value }))
                  }
                  className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Total Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={editingOrder.total_amount ?? ''}
                    onChange={(e) =>
                      setEditingOrder((prev) => ({ ...prev, total_amount: e.target.value }))
                    }
                    className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2 text-sm font-bold text-purple-950 focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Advance Paid (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editingOrder.advance_paid ?? 0}
                    onChange={(e) =>
                      setEditingOrder((prev) => ({ ...prev, advance_paid: e.target.value }))
                    }
                    className="w-full bg-[#FAF8F5] border border-purple-200 rounded-xl px-3 py-2 text-sm font-bold text-purple-950 focus:outline-none focus:border-purple-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-purple-100">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingOrderEdit}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSavingOrderEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

// Inline Row Component for Settling a Due Order on its Order Date
function DueOrderBillRow({ order, todayStr, onSettle }) {
  const [payMode, setPayMode] = useState('Cash');
  const [splitCash, setSplitCash] = useState('');
  const [splitUpi, setSplitUpi] = useState('');
  const [isSettling, setIsSettling] = useState(false);

  const dueAmount = Number(order.balance_due) || 0;
  const isOverdue = (order.order_date || '') < todayStr;
  const isToday = (order.order_date || '') === todayStr;

  const handleCashChange = (val) => {
    setSplitCash(val);
    if (val === '') {
      setSplitUpi('');
      return;
    }
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= dueAmount) {
      setSplitUpi(Math.max(0, dueAmount - parsed).toFixed(2));
    }
  };

  const handleUpiChange = (val) => {
    setSplitUpi(val);
    if (val === '') {
      setSplitCash('');
      return;
    }
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= dueAmount) {
      setSplitCash(Math.max(0, dueAmount - parsed).toFixed(2));
    }
  };

  const handleClickSettle = async () => {
    if (isSettling) return;
    setIsSettling(true);
    try {
      await onSettle(order, payMode, splitCash, splitUpi);
    } finally {
      setIsSettling(false);
    }
  };

  return (
    <div
      className={`rounded-xl border p-3.5 space-y-3 ${
        isOverdue
          ? 'bg-rose-50/50 border-rose-200'
          : isToday
          ? 'bg-amber-50/50 border-amber-200'
          : 'bg-[#FAF8F5] border-purple-100'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-sm text-slate-900">
              {order.customer_name || order.order_ref}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                isOverdue
                  ? 'bg-rose-100 text-rose-800 border-rose-200'
                  : isToday
                  ? 'bg-amber-100 text-amber-800 border-amber-200'
                  : 'bg-purple-100 text-purple-800 border-purple-200'
              }`}
            >
              {isOverdue ? 'Overdue' : isToday ? 'Due Today' : order.order_date}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            {order.cake_flavor ? `${order.cake_flavor} • ${order.cake_size || ''}` : order.order_ref}
            {order.order_time ? ` • ${formatTime12Hour(order.order_time)}` : ''}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Total: ₹{Number(order.total_amount).toFixed(2)} • Advance: ₹
            {Number(order.advance_paid || 0).toFixed(2)}
          </p>
        </div>

        <div className="text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Balance Due
          </span>
          <span className="text-base font-extrabold text-purple-900">
            ₹{dueAmount.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-purple-100/80">
        <div className="inline-flex items-center bg-white p-0.5 rounded-lg border border-purple-200">
          {['Cash', 'UPI', 'Split'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setPayMode(mode)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                payMode === mode
                  ? 'bg-purple-700 text-white'
                  : 'text-slate-600 hover:text-purple-900'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={isSettling}
          onClick={handleClickSettle}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
        >
          {isSettling ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Billing...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Generate Bill (₹{dueAmount.toFixed(2)})</span>
            </>
          )}
        </button>
      </div>

      {payMode === 'Split' && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Cash (₹)"
            value={splitCash}
            onChange={(e) => handleCashChange(e.target.value)}
            className="bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-purple-950 focus:outline-none focus:border-purple-600"
          />
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="UPI (₹)"
            value={splitUpi}
            onChange={(e) => handleUpiChange(e.target.value)}
            className="bg-white border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-purple-950 focus:outline-none focus:border-purple-600"
          />
        </div>
      )}
    </div>
  );
}

// Helper Component for Inline Database User Password Management
function UserRow({
  user,
  assignedShopName,
  shops,
  canChangeRole,
  isCurrentUser,
  onUpdatePassword,
  onUpdateRole,
  onDelete
}) {
  const [passDraft, setPassDraft] = useState('');
  const [isSavingPass, setIsSavingPass] = useState(false);
  const [roleDraft, setRoleDraft] = useState(user.role);
  const [roleShopIdDraft, setRoleShopIdDraft] = useState(user.shop_id || '');
  const [isSavingRole, setIsSavingRole] = useState(false);
  let roleLabel = user.role;
  if (roleLabel === 'superadmin') roleLabel = 'Super Admin';
  else if (roleLabel === 'admin') roleLabel = 'Admin';

  useEffect(() => {
    setRoleDraft(user.role);
    setRoleShopIdDraft(user.shop_id || '');
  }, [user.role, user.shop_id]);

  const roleNeedsShop = roleDraft === 'staff' || roleDraft === 'shop-admin';
  const roleIsUnchanged =
    roleDraft === user.role &&
    String(roleShopIdDraft || '') === String(user.shop_id || '');

  const handleSavePass = async () => {
    if (!passDraft.trim() || isSavingPass) return;
    setIsSavingPass(true);
    try {
      await onUpdatePassword(user.id, passDraft);
      setPassDraft('');
    } finally {
      setIsSavingPass(false);
    }
  };

  const handleSaveRole = async () => {
    if (!canChangeRole || isSavingRole || roleIsUnchanged) return;
    setIsSavingRole(true);
    try {
      await onUpdateRole(user.id, roleDraft, roleShopIdDraft);
    } finally {
      setIsSavingRole(false);
    }
  };

  return (
    <tr className="hover:bg-[#FAF8F5]/80">
      <td data-label="Username" className="py-3.5 px-5 font-semibold text-slate-900">{user.username}</td>
      <td data-label="Role & Shop" className="py-3.5 px-4">
        <span className="px-2.5 py-1 rounded-md bg-purple-100 text-purple-800 text-xs font-semibold uppercase">
          {roleLabel}
        </span>
        {assignedShopName && (
          <span className="block text-xs text-slate-500 mt-1">Shop: {assignedShopName}</span>
        )}
        {canChangeRole && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              aria-label={`Role for ${user.username}`}
              value={roleDraft}
              onChange={(e) => setRoleDraft(e.target.value)}
              className="max-w-full bg-white border border-purple-200 rounded-lg px-2 py-1.5 text-xs text-purple-950 focus:outline-none focus:border-purple-600"
            >
              <option value="staff">Staff</option>
              <option value="shop-admin">Shop Admin</option>
              <option value="admin">Admin</option>
              <option value="superadmin">Super Admin</option>
            </select>
            {roleNeedsShop && (
              <select
                aria-label={`Assigned shop for ${user.username}`}
                value={roleShopIdDraft}
                onChange={(e) => setRoleShopIdDraft(e.target.value)}
                className="max-w-full bg-white border border-purple-200 rounded-lg px-2 py-1.5 text-xs text-purple-950 focus:outline-none focus:border-purple-600"
              >
                <option value="">Select shop</option>
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleSaveRole}
              disabled={
                isSavingRole ||
                roleIsUnchanged ||
                (roleNeedsShop && !roleShopIdDraft)
              }
              className="inline-flex items-center gap-1 rounded-lg bg-purple-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-purple-600 disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSavingRole ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save Role
            </button>
          </div>
        )}
        {!canChangeRole && isCurrentUser && (
          <span className="block mt-1 text-[11px] text-slate-500">Your own role cannot be changed here.</span>
        )}
      </td>
      <td data-label="Update Password" className="py-3.5 px-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            placeholder="New password"
            value={passDraft}
            onChange={(e) => setPassDraft(e.target.value)}
            className="w-full bg-[#FAF8F5] border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-purple-600 focus:bg-white sm:w-36"
          />
          <button
            type="button"
            disabled={passDraft.trim().length < 4 || isSavingPass}
            onClick={handleSavePass}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              passDraft.trim().length >= 4 && !isSavingPass
                ? 'bg-purple-700 hover:bg-purple-600 text-white cursor-pointer'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isSavingPass ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Password'}
          </button>
        </div>
      </td>
      <td data-label="Actions" className="py-3.5 px-5 text-right">
        <button
          type="button"
          onClick={() => onDelete(user)}
          title="Delete user"
          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
}