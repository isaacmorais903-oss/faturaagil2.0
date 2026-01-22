import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Trash2, Printer, Plus, Download, AlertCircle, Calendar, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { Autocomplete } from './components/Autocomplete';
import { InvoiceItem, SavedLists, CompanyInfo } from './types';
// @ts-ignore
import html2canvas from 'html2canvas';
// @ts-ignore
import { jsPDF } from 'jspdf';

// Constants - UPDATED TO v8 TO FORCE CACHE CLEAR
const STORAGE_KEY_INVOICE = 'fatura_agil_current_invoice_v5';
const STORAGE_KEY_COMPANY = 'companyInfo_v8'; 
const STORAGE_KEY_LISTS = 'savedLists';

// Initial Mock Data
const INITIAL_COMPANY: CompanyInfo = {
  name: "Grupo Confiar Transportes",
  address: "Rua Otaviano de Paiva, 1035, Centro\nEdificio Collecto, sala 28 - Cristalina, GO",
  cnpj: "12.345.678/0001-90",
  logoUrl: "" // Explicitly empty
};

const INITIAL_SAVED_LISTS: SavedLists = {
  clients: ["Supermercado Central", "Indústria Metalúrgica Sul", "Agro Comercial Verde", "Safra Alimentos"],
  cargoTypes: ["Soja a Granel", "Eletrônicos", "Cimento Ensacado", "Bobinas de Aço", "Mista", "Laranja"],
  drivers: ["Carlos Silva", "Roberto Mendes", "João Ferreira"],
  plates: ["ABC-1234", "XYZ-9876", "BRA-2E19"]
};

// Helper to safely parse JSON
const safeParse = (key: string, fallback: any) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    return fallback;
  }
};

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

// Helper Component for DD/MM/YY Date
const DateInput = ({
  value,
  onChange,
  className = ""
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const displayValue = useMemo(() => {
    if (!value) return "";
    if (isFocused) return value; // Return YYYY-MM-DD for input type='date' handling
    
    // Parse YYYY-MM-DD and return DD/MM/YY
    const parts = value.split('-');
    if (parts.length !== 3) return value;
    const [year, month, day] = parts;
    return `${day}/${month}/${year.slice(2)}`;
  }, [value, isFocused]);

  return (
    <input
      type={isFocused ? "date" : "text"}
      value={displayValue}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className={`${className} text-center`}
      placeholder="DD/MM/AA"
    />
  );
};

// Helper Component for formatted inputs
const CurrencyInput = ({
  value,
  onChange,
  readOnly = false,
  className = "",
  placeholder = "0,00",
  showSymbol = true
}: {
  value: number;
  onChange?: (val: number) => void;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
  showSymbol?: boolean;
}) => {
  const [isFocused, setIsFocused] = useState(false);

  // When not focused, show formatted string. When focused, show number for editing.
  const displayValue = useMemo(() => {
    if (isFocused && !readOnly) return value === 0 ? '' : value;
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, [value, isFocused, readOnly]);

  return (
    <div className={`relative group ${className}`}>
      {showSymbol && (!isFocused || readOnly) && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-700 font-bold pointer-events-none text-base">R$</span>
      )}
      <input
        type={isFocused && !readOnly ? "number" : "text"}
        value={displayValue}
        onChange={(e) => onChange && onChange(parseFloat(e.target.value) || 0)}
        onFocus={() => !readOnly && setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        readOnly={readOnly}
        step="0.01"
        placeholder={placeholder}
        className={`w-full border border-brand-100 rounded px-2 py-2 outline-none text-right transition-colors text-lg font-medium
          ${readOnly ? 'font-bold text-slate-700 bg-slate-100 cursor-default' : 'bg-brand-50 hover:bg-brand-100 focus:bg-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500'}
          ${(!isFocused || readOnly) && showSymbol ? 'pl-10' : 'pl-2'} 
        `}
      />
    </div>
  );
};

export default function App() {
  // Load initial states from LocalStorage or defaults
  const savedInvoiceState = safeParse(STORAGE_KEY_INVOICE, {});

  // State: Company Info (Logo, Name, etc)
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(() => 
    safeParse(STORAGE_KEY_COMPANY, INITIAL_COMPANY)
  );

  // State: Saved Lists (History)
  const [savedLists, setSavedLists] = useState<SavedLists>(() => 
    safeParse(STORAGE_KEY_LISTS, INITIAL_SAVED_LISTS)
  );

  // State: Current Invoice Metadata (loaded from persistence if available)
  const [clientName, setClientName] = useState(savedInvoiceState.clientName || "");
  const [invoiceDate, setInvoiceDate] = useState(savedInvoiceState.invoiceDate || new Date().toISOString().split('T')[0]);
  const [referenceMonth, setReferenceMonth] = useState(savedInvoiceState.referenceMonth || new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [observations, setObservations] = useState(savedInvoiceState.observations || "");

  // State: Invoice Rows
  const [items, setItems] = useState<InvoiceItem[]>(() => {
    if (savedInvoiceState.items && savedInvoiceState.items.length > 0) {
      return savedInvoiceState.items;
    }
    return [{
      id: '1',
      date: new Date().toISOString().split('T')[0],
      cargoType: '',
      driver: '',
      plate: '',
      cargoValue: 0,
      icms: 0,
      insuranceValue: 0,
      totalExpense: 0
    }];
  });
  
  // State: PDF Generation
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- PERSISTENCE EFFECTS ---

  // Save Saved Lists
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LISTS, JSON.stringify(savedLists));
  }, [savedLists]);

  // Save Company Info
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_COMPANY, JSON.stringify(companyInfo));
  }, [companyInfo]);

  // Save Current Invoice Data (Auto-save)
  useEffect(() => {
    const currentInvoiceData = {
      clientName,
      invoiceDate,
      referenceMonth,
      observations,
      items
    };
    localStorage.setItem(STORAGE_KEY_INVOICE, JSON.stringify(currentInvoiceData));
  }, [clientName, invoiceDate, referenceMonth, observations, items]);


  // --- HANDLERS ---

  // Handler for Client Selection (Trigger auto-calc logic if needed)
  const handleClientChange = (name: string) => {
    setClientName(name);

    // Logic: If client is Safra Alimentos, recalculate all insurance values
    if (name === "Safra Alimentos") {
        setItems(prev => prev.map(item => {
            const cargo = Number(item.cargoValue) || 0;
            const newInsurance = cargo * 0.005; // 0.5%
            const icms = Number(item.icms) || 0;
            return {
                ...item,
                insuranceValue: newInsurance,
                totalExpense: icms + newInsurance
            };
        }));
    }
  };

  // Handlers for Items
  const handleItemChange = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        
        // Special Logic: If Client is Safra Alimentos AND Cargo Value changed
        if (field === 'cargoValue' && clientName === "Safra Alimentos") {
            const val = Number(value) || 0;
            updatedItem.insuranceValue = val * 0.005; // 0.5%
        }

        // Auto-calculate Total Despesa: ICMS + Seguro
        const icms = Number(updatedItem.icms) || 0;
        const insurance = Number(updatedItem.insuranceValue) || 0;
        updatedItem.totalExpense = icms + insurance;

        return updatedItem;
      }
      return item;
    }));
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString().split('T')[0], // Could assume currently selected month here if desired
      cargoType: '',
      driver: '',
      plate: '',
      cargoValue: 0,
      icms: 0,
      insuranceValue: 0,
      totalExpense: 0
    }]);
  };

  const removeItem = (id: string) => {
    if (items.length === 1) return; // Keep at least one
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // Handlers for Saving Data to Lists
  const saveToList = (listKey: keyof SavedLists, value: string) => {
    if (!value) return;
    setSavedLists(prev => {
      if (prev[listKey].includes(value)) return prev;
      return { ...prev, [listKey]: [...prev[listKey], value] };
    });
  };

  // Use simple FileReader - reliable for 24KB PNGs
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
          alert("A imagem é muito grande (máximo 2MB).");
          return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setCompanyInfo(prev => ({ ...prev, logoUrl: base64String }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Calculations
  const totals = useMemo(() => {
    return items.reduce((acc, item) => ({
      cargoValue: acc.cargoValue + Number(item.cargoValue || 0),
      icms: acc.icms + Number(item.icms || 0),
      insuranceValue: acc.insuranceValue + Number(item.insuranceValue || 0),
      totalExpense: acc.totalExpense + Number(item.totalExpense || 0),
    }), { cargoValue: 0, icms: 0, insuranceValue: 0, totalExpense: 0 });
  }, [items]);

  // Safra Specific Totals
  const safraSpecificTotals = useMemo(() => {
    if (clientName !== "Safra Alimentos") return null;

    return items.reduce((acc, item) => {
        const type = (item.cargoType || "").toLowerCase();
        const insurance = Number(item.insuranceValue || 0);

        if (type.includes("mista")) {
            acc.mista += insurance;
        } else if (type.includes("laranja")) {
            acc.laranja += insurance;
        }
        return acc;
    }, { mista: 0, laranja: 0 });
  }, [items, clientName]);

  // Dynamic Reference Text Generation
  const referenceText = useMemo(() => {
    if (!referenceMonth) return "Referente aos serviços de transporte/seguros de cargas.";
    
    const [year, month] = referenceMonth.split('-');
    // Create date object using local time logic (avoiding timezone offset issues by using middle of day)
    const date = new Date(parseInt(year), parseInt(month) - 1, 15);
    
    const monthName = date.toLocaleString('pt-BR', { month: 'long' });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    
    return `Referente aos serviços de transporte/seguros de cargas do mês de ${capitalizedMonth} de ${year}`;
  }, [referenceMonth]);

  // PDF Generation Handler
  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    
    try {
        const element = document.getElementById('invoice-paper');
        if (!element) {
            throw new Error("Elemento da fatura não encontrado");
        }

        // 1. Create a deep clone to manipulate for PDF generation
        const clone = element.cloneNode(true) as HTMLElement;
        
        // 2. Setup clone styles to ensure it renders perfectly off-screen
        // Fixed width ensures the table layout doesn't break or scroll
        // Using a high resolution width helps with quality, jsPDF will scale it down to fit Portrait
        // UPDATED: Using 1600px for LANDSCAPE capture
        const fixedWidth = 1600; 
        clone.style.position = 'absolute';
        clone.style.left = '-9999px';
        clone.style.top = '0';
        clone.style.width = `${fixedWidth}px`; 
        clone.style.height = 'auto'; 
        clone.style.zIndex = '-1';
        clone.style.overflow = 'visible'; 
        clone.style.backgroundColor = '#ffffff';
        
        // Reset some container styles that might interfere
        clone.classList.remove('shadow-xl', 'rounded-xl', 'mt-6', 'max-w-7xl', 'mx-auto', 'w-[98%]', 'max-w-[1600px]', 'w-full'); 
        clone.classList.add('p-0', 'm-0');

        // 3. FLATTEN INPUTS: Convert inputs/selects to text for crisp rendering
        const inputs = clone.querySelectorAll('input, select, textarea');
        inputs.forEach((input: any) => {
            let value = input.value;
            const parent = input.parentElement;
            
            // Format DATE inputs to DD/MM/YYYY for PDF
            // Check regex to catch standard date inputs (YYYY-MM-DD)
            if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
               const parts = value.split('-');
               value = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            
            // Create a div to replace the input
            const textDiv = document.createElement('div');
            textDiv.textContent = value;
            
            // Copy relevant styling classes to maintain font size/alignment
            textDiv.className = input.className;
            
            // Overrides for print look
            textDiv.style.border = 'none';
            textDiv.style.background = 'transparent'; // Ensure transparent background in PDF for clean look
            textDiv.style.resize = 'none';
            textDiv.style.overflow = 'visible';
            textDiv.style.whiteSpace = 'pre-wrap';
            textDiv.style.display = 'block';
            textDiv.style.height = 'auto';
            textDiv.style.minHeight = '1.2em';
            textDiv.style.padding = '0'; // Remove padding for tighter fit in text mode
            
            // Handle alignments explicitly
            if (input.classList.contains('text-right')) {
                textDiv.style.textAlign = 'right';
            }
            if (input.classList.contains('text-center')) {
                textDiv.style.textAlign = 'center';
            }

            // Replace
            if (parent) {
                parent.replaceChild(textDiv, input);
            }
        });

        // 4. Remove interactive elements (buttons, icons)
        const buttons = clone.querySelectorAll('button');
        buttons.forEach(btn => btn.remove());
        
        // Remove elements explicitly marked to ignore
        const ignored = clone.querySelectorAll('.no-print');
        ignored.forEach(el => el.remove());
        const ignoredData = clone.querySelectorAll('[data-html2canvas-ignore]');
        ignoredData.forEach(el => el.remove());

        // FIX: Reveal print-only elements (like the backup logo)
        // Since we removed the interactive logo (via .no-print), we need to ensure
        // the print version (which is .hidden .print:block) becomes visible in the clone.
        const hiddenPrintElements = clone.querySelectorAll('.hidden.print\\:block');
        hiddenPrintElements.forEach((el) => {
            el.classList.remove('hidden');
            // Force display
            (el as HTMLElement).style.display = 'block';
        });

        // Append clone to body
        document.body.appendChild(clone);

        // Wait for rendering
        await new Promise(resolve => setTimeout(resolve, 150));

        // 5. Capture with html2canvas
        const canvas = await html2canvas(clone, {
            scale: 2, 
            useCORS: true, 
            logging: false,
            backgroundColor: '#ffffff',
            width: fixedWidth, 
            windowWidth: fixedWidth + 50
        });

        // Clean up
        document.body.removeChild(clone);

        // 6. Generate PDF in LANDSCAPE
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        
        const pdf = new jsPDF({
            orientation: 'landscape', // CHANGED TO LANDSCAPE
            unit: 'mm',
            format: 'a4'
        });

        const pdfWidth = 297; // A4 Landscape Width
        const pdfHeight = 210; // A4 Landscape Height
        const margin = 10;
        
        const imgProps = pdf.getImageProperties(imgData);
        const ratio = imgProps.width / imgProps.height;
        
        const availableWidth = pdfWidth - (margin * 2);
        const availableHeight = pdfHeight - (margin * 2);

        let finalWidth = availableWidth;
        let finalHeight = finalWidth / ratio;

        // Fit to page
        if (finalHeight > availableHeight) {
            finalHeight = availableHeight;
            finalWidth = finalHeight * ratio;
        }

        // Center
        const x = (pdfWidth - finalWidth) / 2;
        const y = margin; 

        pdf.addImage(imgData, 'JPEG', x, y, finalWidth, finalHeight);
        
        const fileName = `fatura-${clientName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'gerada'}.pdf`;
        pdf.save(fileName);

    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        alert("Não foi possível gerar o PDF. Tentando impressão padrão...");
        window.print();
    } finally {
        setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-20 print:bg-white print:pb-0">
      
      {/* Hidden File Input for Logo */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleLogoUpload} 
        accept="image/png, image/jpeg, image/jpg" 
        className="hidden" 
      />

      {/* --- Action Bar (No Print) --- */}
      <div className="no-print sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200 shadow-sm px-4 py-3 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded-md flex items-center justify-center text-white font-bold">F</div>
          <h1 className="font-bold text-slate-800 hidden md:block">FaturaÁgil</h1>
        </div>
        
        {/* Month Filter */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-md border border-slate-200">
           <Calendar size={16} className="text-slate-500 ml-2" />
           <span className="text-sm font-medium text-slate-600 hidden sm:inline">Mês Ref:</span>
           <input 
             type="month" 
             value={referenceMonth}
             onChange={(e) => setReferenceMonth(e.target.value)}
             className="bg-transparent border-none text-sm font-semibold text-slate-800 focus:ring-0 cursor-pointer"
           />
        </div>

        <div className="flex gap-2">
          <button 
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            title="Clique para Baixar o PDF"
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition shadow-sm font-medium text-white
                ${isGeneratingPdf ? 'bg-slate-400 cursor-wait' : 'bg-slate-800 hover:bg-slate-900'}
            `}
          >
            {isGeneratingPdf ? (
                 <Loader2 size={16} className="animate-spin" />
            ) : (
                <Download size={16} />
            )}
            <span className="hidden sm:inline">{isGeneratingPdf ? 'Gerando PDF...' : 'Baixar PDF'}</span>
          </button>
        </div>
      </div>

      {/* --- Main Invoice Paper --- */}
      {/* Added ID for html2pdf targeting */}
      {/* INCREASED MAX WIDTH TO w-[98%] and max-w-[1600px] to prevent scrolling and use full screen */}
      <div id="invoice-paper" className="w-[98%] max-w-[1800px] mx-auto mt-6 bg-white shadow-xl rounded-xl overflow-hidden print:shadow-none print:mt-0 print:rounded-none print:max-w-none print-full-width">
        
        {/* Header - Modified: Blue 800 Background (Lighter Navy), Smaller Fonts */}
        <header className="p-8 border-b-2 border-blue-900 bg-blue-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 print:bg-blue-800 print:text-white">
          <div className="flex items-center gap-6">
            <div 
              className="relative group w-20 h-20 rounded-lg bg-white border border-blue-600 overflow-hidden cursor-pointer no-print-cursor no-print shadow-sm mt-1 flex items-center justify-center"
              onClick={() => fileInputRef.current?.click()}
              title="Clique para alterar a logo"
            >
              {companyInfo.logoUrl ? (
                 <img 
                    src={companyInfo.logoUrl} 
                    alt="Logo" 
                    className="w-full h-full object-contain p-1" 
                    crossOrigin={companyInfo.logoUrl.startsWith('data:') ? undefined : "anonymous"}
                 />
              ) : (
                <div className="text-center">
                    <ImageIcon className="w-6 h-6 text-slate-300 mx-auto" />
                    <span className="text-[9px] font-bold text-slate-400 block mt-1 leading-tight">ADD LOGO</span>
                </div>
              )}

              <div 
                data-html2canvas-ignore="true" 
                className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity no-print"
              >
                <Upload size={16} className="text-white mb-1" />
                <span className="text-[10px] text-white font-bold uppercase">Alterar</span>
              </div>
            </div>
            
            {/* Print-only version of logo */}
            <div className="hidden print:block h-16 w-auto max-w-[180px] rounded-lg bg-white border border-blue-600 overflow-hidden p-1 mt-1">
                {companyInfo.logoUrl ? (
                    <img 
                      src={companyInfo.logoUrl} 
                      alt="Logo" 
                      className="h-full w-auto object-contain" 
                      crossOrigin={companyInfo.logoUrl.startsWith('data:') ? undefined : "anonymous"}
                    />
                ) : (
                    <div className="w-16 h-16 bg-white"></div>
                )}
            </div>

            <div>
              {/* Reduced font sizes: text-2xl and text-base */}
              <h2 className="text-2xl font-bold text-white uppercase tracking-wide drop-shadow-sm">{companyInfo.name}</h2>
              <p className="text-blue-100 mt-2 text-base whitespace-pre-line leading-snug">{companyInfo.address}</p>
            </div>
          </div>
          <div className="text-right hidden md:block">
            <div className="text-sm font-semibold text-blue-200 uppercase tracking-wider mb-1">Data de Emissão</div>
            <div className="text-xl font-bold text-white">
               <input 
                 type="date" 
                 className="bg-transparent border-none text-right focus:ring-0 p-0 font-bold text-white cursor-pointer"
                 style={{ colorScheme: 'dark' }}
                 value={invoiceDate}
                 onChange={(e) => setInvoiceDate(e.target.value)}
               />
            </div>
          </div>
        </header>

        {/* Client Info Section */}
        <div className="p-8 bg-slate-50/50">
           <div className="grid md:grid-cols-2 gap-6">
              <div className="col-span-1">
                {/* Changed Label to 'Cliente' */}
                <Autocomplete
                  label="Cliente"
                  placeholder="Selecione ou digite o nome do cliente..."
                  value={clientName}
                  onChange={handleClientChange}
                  options={savedLists.clients}
                  onSaveOption={(val) => saveToList('clients', val)}
                  className="w-full"
                />
              </div>
              <div className="col-span-1 flex items-end">
                <div className="w-full p-4 bg-brand-50 border border-brand-100 rounded-lg text-brand-900 text-base">
                   <h3 className="font-bold text-brand-700 mb-1 flex items-center gap-2">
                     <AlertCircle size={18} />
                     FATURA DE SERVIÇOS
                   </h3>
                   <p className="text-lg">{referenceText}</p>
                </div>
              </div>
           </div>
        </div>

        {/* Invoice Items Table - Modified: Larger Text (text-lg), larger padding */}
        <div className="p-8 overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-lg">
            <thead>
              <tr className="bg-slate-100 text-slate-700 uppercase tracking-wider text-base font-bold text-left">
                {/* Modified Alignment: Centered Data Column */}
                <th className="py-3 px-2 text-center rounded-tl-lg">Data</th>
                <th className="px-2 py-3">Tipo Carga</th>
                <th className="px-2 py-3">Motorista</th>
                <th className="px-2 py-3">Placa</th>
                <th className="px-2 py-3 text-right">Valor Carga</th>
                <th className="px-2 py-3 text-right">ICMS</th>
                <th className="px-2 py-3 text-right">Seguro</th>
                {/* Modified Alignment: Removed Right Padding on last value column */}
                <th className="py-3 pl-2 pr-0 text-right">Total Despesa</th>
                <th className="px-2 py-3 rounded-tr-lg w-10 no-print"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                  {/* Modified Alignment: Centered Data Column */}
                  <td className="py-3 px-2 align-middle text-center">
                    <DateInput 
                      value={item.date} 
                      onChange={(val) => handleItemChange(item.id, 'date', val)}
                      className="w-28 bg-brand-50 hover:bg-brand-100 focus:bg-white border border-brand-100 hover:border-brand-200 focus:border-brand-500 rounded px-2 py-2 outline-none transition-colors text-lg font-medium"
                    />
                  </td>
                  <td className="px-2 py-3 align-middle">
                    <Autocomplete
                      value={item.cargoType}
                      onChange={(val) => handleItemChange(item.id, 'cargoType', val)}
                      options={savedLists.cargoTypes}
                      onSaveOption={(val) => saveToList('cargoTypes', val)}
                      placeholder="Tipo"
                      className="min-w-[140px]"
                    />
                  </td>
                  <td className="px-2 py-3 align-middle">
                     <Autocomplete
                      value={item.driver}
                      onChange={(val) => handleItemChange(item.id, 'driver', val)}
                      options={savedLists.drivers}
                      onSaveOption={(val) => saveToList('drivers', val)}
                      placeholder="Motorista"
                      className="min-w-[160px]"
                    />
                  </td>
                  <td className="px-2 py-3 align-middle">
                     <Autocomplete
                      value={item.plate}
                      onChange={(val) => handleItemChange(item.id, 'plate', val)}
                      options={savedLists.plates}
                      onSaveOption={(val) => saveToList('plates', val)}
                      placeholder="ABC-0000"
                      className="w-32"
                    />
                  </td>
                  <td className="px-2 py-3 align-middle text-right w-36">
                    <CurrencyInput
                      value={item.cargoValue || 0}
                      onChange={(val) => handleItemChange(item.id, 'cargoValue', val)}
                      showSymbol={false}
                    />
                  </td>
                  <td className="px-2 py-3 align-middle text-right w-36">
                    <CurrencyInput
                      value={item.icms || 0}
                      onChange={(val) => handleItemChange(item.id, 'icms', val)}
                      showSymbol={false}
                    />
                  </td>
                  <td className="px-2 py-3 align-middle text-right w-36">
                    <CurrencyInput
                      value={item.insuranceValue || 0}
                      onChange={(val) => handleItemChange(item.id, 'insuranceValue', val)}
                      showSymbol={false}
                    />
                  </td>
                  {/* Modified Alignment: Removed Right Padding */}
                  <td className="py-3 pl-2 pr-0 align-middle text-right w-40">
                    <CurrencyInput
                      value={item.totalExpense || 0}
                      readOnly={true}
                      showSymbol={false}
                    />
                  </td>
                  <td className="px-2 py-3 align-middle text-center no-print w-10">
                    <button 
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-slate-300 hover:text-red-500 transition-colors p-2"
                      title="Remover linha"
                      data-html2canvas-ignore="true"
                    >
                      <Trash2 size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Modified Footer: Changed font-size to text-lg to match body */}
            <tfoot className="border-t-2 border-slate-200 font-bold text-slate-900 bg-slate-50 text-lg">
               <tr>
                 {/* Modified: Removed text-sm, added text-lg, removed left padding */}
                 <td colSpan={4} className="py-5 pr-5 pl-0 text-right uppercase tracking-wide text-slate-500 font-bold">Totais da Fatura</td>
                 <td className="p-5 text-right">{formatCurrency(totals.cargoValue)}</td>
                 <td className="p-5 text-right">{formatCurrency(totals.icms)}</td>
                 <td className="p-5 text-right">{formatCurrency(totals.insuranceValue)}</td>
                 {/* Modified: Removed right padding and removed text-2xl */}
                 <td className="py-5 pl-5 pr-0 text-right text-brand-700">{formatCurrency(totals.totalExpense)}</td>
                 <td className="no-print" data-html2canvas-ignore="true"></td>
               </tr>
            </tfoot>
          </table>

          {/* SAFRA ALIMENTOS SPECIFIC SECTION */}
          {safraSpecificTotals && (
             <div className="mt-4 flex justify-end">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex gap-8 items-center text-lg">
                    <div className="flex flex-col items-end">
                        <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Seguro (Carga Mista)</span>
                        <span className="font-bold text-slate-900">{formatCurrency(safraSpecificTotals.mista)}</span>
                    </div>
                    <div className="h-10 w-px bg-slate-300"></div>
                    <div className="flex flex-col items-end">
                        <span className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Seguro (Carga Laranja)</span>
                        <span className="font-bold text-slate-900">{formatCurrency(safraSpecificTotals.laranja)}</span>
                    </div>
                </div>
             </div>
          )}
          
          <div className="mt-4 no-print" data-html2canvas-ignore="true">
            <button 
              type="button"
              onClick={addItem}
              className="flex items-center gap-2 text-brand-600 hover:text-brand-700 font-medium text-base px-6 py-3 hover:bg-brand-50 rounded transition"
            >
              <Plus size={20} />
              Adicionar nova linha
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-8 border-t border-slate-200 flex flex-col justify-start print:bg-white print:border-none">
          <div className="text-sm text-slate-600 w-full">
            <p className="font-bold mb-2 text-base">Observações:</p>
            <textarea 
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              className="w-full bg-brand-50 border border-brand-100 rounded p-4 text-brand-900 font-medium text-lg h-24 resize-none print:border-none print:p-0 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" 
              placeholder="Digite observações adicionais para sair na fatura..."
            ></textarea>
          </div>
          <div className="text-center mt-6 text-slate-300 text-xs no-print">
            Sistema FaturaÁgil v4.0 (Landscape)
          </div>
        </div>
      </div>
    </div>
  );
}