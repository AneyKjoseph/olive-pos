export default function StockItemEditor({ item, stock, status, addValue, onChange }) {
  const parsedAdd = parseInt(addValue, 10);
  const hasValidAdd = !isNaN(parsedAdd) && parsedAdd > 0;
  const isOut = status === 'OUT_OF_STOCK' || stock <= 0;
  const isLow = status === 'LOW_STOCK';

  return (
    <div
      className={`inline-flex min-w-0 max-w-full flex-wrap items-center gap-2.5 rounded-xl px-3 py-2 border transition-all ${
        hasValidAdd
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
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          + Add
        </span>
        <input
          type="number"
          min="0"
          placeholder="0"
          value={addValue}
          onChange={(e) => onChange(e.target.value)}
          className={`w-16 rounded-lg px-2 py-1 text-center text-sm font-bold focus:outline-none transition-colors ${
            hasValidAdd
              ? 'bg-white border-2 border-purple-600 text-purple-950'
              : 'bg-white border border-purple-200 text-purple-950 focus:border-purple-600'
          }`}
        />
        {hasValidAdd && (
          <span className="text-[11px] font-bold text-purple-700 whitespace-nowrap">
            → {stock + parsedAdd}
          </span>
        )}
      </div>
    </div>
  );
}
