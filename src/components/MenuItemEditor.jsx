import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';

function areShopIdsEqual(left = [], right = []) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

export default function MenuItemEditor({
  item,
  categories = [],
  shops = [],
  isBilled = false,
  typeCount = 0,
  onDraftChange,
  onDeleteItem
}) {
  const [typeName, setTypeName] = useState(item.name);
  const [price, setPrice] = useState(item.price);
  const [categoryId, setCategoryId] = useState(item.category_id || '');
  const [isDisplayed, setIsDisplayed] = useState(item.is_displayed !== false);
  const [availableShopIds, setAvailableShopIds] = useState(
    () => item.available_shop_ids ?? shops.map((shop) => shop.id)
  );
  const [isShopDropdownOpen, setIsShopDropdownOpen] = useState(false);
  const shopDropdownRef = useRef(null);

  useEffect(() => {
    if (!isShopDropdownOpen) return undefined;

    const closeOnOutsidePointer = (event) => {
      const dropdown = shopDropdownRef.current;
      if (dropdown && !dropdown.contains(event.target)) {
        dropdown.open = false;
        setIsShopDropdownOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isShopDropdownOpen]);

  const currentAvailableShopIds = item.available_shop_ids ?? shops.map((shop) => shop.id);
  const currentAvailableShopIdsKey = JSON.stringify(currentAvailableShopIds);
  const isDirty =
    typeName.trim() !== item.name ||
    Number(price) !== Number(item.price) ||
    isDisplayed !== (item.is_displayed !== false) ||
    !areShopIdsEqual(availableShopIds, currentAvailableShopIds) ||
    (!isBilled && categoryId !== (item.category_id || ''));

  useEffect(() => {
    setTypeName(item.name);
    setPrice(item.price);
    setCategoryId(item.category_id || '');
    setIsDisplayed(item.is_displayed !== false);
    setAvailableShopIds(JSON.parse(currentAvailableShopIdsKey));
  }, [
    item.id,
    item.name,
    item.price,
    item.category_id,
    item.is_displayed,
    currentAvailableShopIdsKey
  ]);

  useEffect(() => {
    onDraftChange(
      item.id,
      isDirty
        ? {
            price,
            categoryId,
            typeName,
            isDisplayed,
            availableShopIds
          }
        : null
    );
  }, [
    item.id,
    isDirty,
    price,
    categoryId,
    typeName,
    isDisplayed,
    availableShopIds,
    onDraftChange
  ]);

  useEffect(
    () => () => onDraftChange(item.id, null),
    [item.id, onDraftChange]
  );

  const toggleShopAvailability = (shopId) => {
    setAvailableShopIds((current) =>
      current.includes(shopId)
        ? current.filter((id) => id !== shopId)
        : [...current, shopId]
    );
  };

  return (
    <div className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 bg-[#FAF8F5] border border-purple-200/80 rounded-lg px-2.5 py-1.5">
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

      <label className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white border border-purple-200 text-xs font-semibold text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={isDisplayed}
          onChange={(e) => setIsDisplayed(e.target.checked)}
          className="accent-purple-700"
        />
        Display
      </label>

      {shops.length > 0 && (
        <details
          ref={shopDropdownRef}
          className="relative min-w-0 max-w-full"
          onToggle={(event) => setIsShopDropdownOpen(event.currentTarget.open)}
        >
          <summary className="px-2 py-1 rounded bg-white border border-purple-200 text-xs font-semibold text-purple-900 cursor-pointer list-none">
            Shops ({availableShopIds.length}/{shops.length})
          </summary>
          <div className="mt-1 min-w-0 max-w-full rounded-lg border border-purple-200 bg-white p-2 shadow-lg">
            {shops.map((shop) => (
              <label
                key={shop.id}
                className="flex min-w-0 items-center gap-2 break-words rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-purple-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={availableShopIds.includes(shop.id)}
                  onChange={() => toggleShopAvailability(shop.id)}
                  className="accent-purple-700"
                />
                {shop.name}
              </label>
            ))}
          </div>
        </details>
      )}

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
