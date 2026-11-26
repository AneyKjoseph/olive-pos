import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export default function SearchableSelect({
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

  const distinctOptions = useMemo(() => {
    const seen = new Set();
    return options.filter((opt) => {
      const key = `${opt.value}::${(opt.label || '').trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [options]);

  const selectedOption = distinctOptions.find((opt) => opt.value === value);
  const filteredOptions = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return distinctOptions;
    return distinctOptions.filter((opt) => opt.label.toLowerCase().includes(clean));
  }, [distinctOptions, query]);

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
          {selectedOption ? selectedOption.label : distinctOptions.length === 0 ? emptyMessage : placeholder}
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
                {distinctOptions.length === 0 ? emptyMessage : 'No matching options'}
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
