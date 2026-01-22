import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';

interface AutocompleteProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  onSaveOption: (option: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export const Autocomplete: React.FC<AutocompleteProps> = ({
  label,
  value,
  onChange,
  options,
  onSaveOption,
  placeholder,
  className = "",
  required = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = options.filter(opt => 
    opt.toLowerCase().includes(value.toLowerCase())
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setFilter(newValue);
    setIsOpen(true);
  };

  const handleSelect = (opt: string) => {
    onChange(opt);
    setIsOpen(false);
  };

  const handleSaveCurrent = () => {
    if (value && !options.includes(value)) {
      onSaveOption(value);
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      {label && <label className="block text-base font-medium text-slate-700 mb-1">{label}</label>}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          required={required}
          className="w-full pl-3 pr-10 py-2 border border-brand-100 bg-brand-50 hover:bg-brand-100 focus:bg-white rounded-md focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-colors text-slate-900 text-lg font-medium"
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600"
        >
          <ChevronDown size={20} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelect(opt)}
                className="w-full text-left px-4 py-3 text-base text-slate-700 hover:bg-brand-50 hover:text-brand-600 transition-colors"
              >
                {opt}
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-base text-slate-500">Nenhum salvo encontrado.</div>
          )}
          
          {value && !options.includes(value) && (
            <button
              type="button"
              onClick={handleSaveCurrent}
              className="w-full text-left px-4 py-3 text-base text-brand-600 font-medium bg-brand-50 border-t border-slate-100 hover:bg-brand-100 flex items-center gap-2"
            >
              <Plus size={16} />
              Salvar "{value}" na lista
            </button>
          )}
        </div>
      )}
    </div>
  );
};