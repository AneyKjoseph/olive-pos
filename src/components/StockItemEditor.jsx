export default function StockItemEditor({
  item,
  stock,
  status,
  mode = 'add',
  value = '',
  canSet = false,
  onModeChange,
  onValueChange
}) {
  const parsedValue = parseInt(value, 10);
  const hasValidValue =
    value !== '' &&
    !isNaN(parsedValue) &&
    (mode === 'set' ? parsedValue >= 0 : parsedValue > 0);
  const isOut = status === 'OUT_OF_STOCK' || stock <= 0;
  const isLow = status === 'LOW_STOCK';

  return (
    <div
      className={`inline-flex min-w-0 max-w-full flex-wrap items-center gap-2.5 rounded-xl px-3 py-2 border transition-all ${
        hasValidValue
          ? 'bg-purple-50/70 border-purple-400 ring-1 ring-purple-300/70'
          : isOut
          ? 'bg-rose-50/40 border-rose-200/80'
          : isLow
          ? 'bg-amber-50/40 border-amber-200/80'
          : 'bg-[#FAF8F5] border-purple-100'
      }`}
    >
      <div className="flex min-w-0 max-w-full items-center gap-2">
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="break-words text-xs sm:text-sm font-bold text-slate-800">{item.name}</span>
          <span className="text-[11px] font-medium text-slate-500">
            ₹{Number(item.price).toFixed(2)}
          </span>
        </div>

        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
            isOut
              ? 'bg-rose-100 text-rose-800 border-rose-200'
              : isLow
              ? 'bg-amber-100 text-amber-800 border-amber-200'
              : 'bg-emerald-100 text-emerald-800 border-emerald-200'
          }`}
        >
          {stock}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-2.5 border-l border-purple-200/70">
        {canSet && (
          <div
            role="group"
            aria-label="Stock update mode"
            className="inline-flex rounded-lg border border-purple-200 bg-white p-0.5"
          >
            {[
              { id: 'add', label: 'Add' },
              { id: 'set', label: 'Set' }
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={mode === option.id}
                onClick={() => onModeChange(option.id)}
                className={`rounded-md px-2 py-1 text-[10px] font-bold transition-colors ${
                  mode === option.id
                    ? 'bg-purple-700 text-white'
                    : 'text-slate-500 hover:bg-purple-50 hover:text-purple-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        {!canSet && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            + Add
          </span>
        )}
        <label className="flex items-center gap-1.5">
          <span className="sr-only">
            {mode === 'set' ? 'Set stock count' : 'Quantity to add'}
          </span>
          <input
            type="number"
            min="0"
            placeholder={mode === 'set' ? 'count' : '0'}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            className={`w-16 rounded-lg px-2 py-1 text-center text-sm font-bold focus:outline-none transition-colors ${
              hasValidValue
                ? 'bg-white border-2 border-purple-600 text-purple-950'
                : 'bg-white border border-purple-200 text-purple-950 focus:border-purple-600'
            }`}
          />
        </label>
        {hasValidValue && (
          <span className="text-[11px] font-bold text-purple-700 whitespace-nowrap">
            → {mode === 'set' ? parsedValue : stock + parsedValue}
          </span>
        )}
      </div>
    </div>
  );
}
