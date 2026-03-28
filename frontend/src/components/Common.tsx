
import React from 'react';

export const Card: React.FC<{
  title?: string,
  children: React.ReactNode,
  className?: string,
  variant?: 'default' | 'premium'
}> = ({ title, children, className = "", variant = 'default' }) => {
  const baseStyles = variant === 'premium'
    ? "bg-white rounded-xl border border-slate-200 shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
    : "bg-white rounded-lg border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.02)]";

  return (
    <div className={`${baseStyles} overflow-hidden ${className}`}>
      {title && (
        <div className={`px-5 py-4 border-b border-slate-100 ${variant === 'premium' ? 'bg-slate-50/50' : 'bg-transparent'}`}>
          <h3 className="font-semibold text-slate-800 text-sm tracking-tight">{title}</h3>
        </div>
      )}
      <div className="p-5">
        {children}
      </div>
    </div>
  );
};

export const Button: React.FC<{
  onClick?: () => void,
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'high-impact',
  children: React.ReactNode,
  className?: string,
  disabled?: boolean,
  type?: 'button' | 'submit',
  rounded?: 'lg' | 'full'
}> = ({ onClick, variant = 'primary', children, className = "", disabled, type = 'button', rounded = 'lg' }) => {
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-sm",
    secondary: "bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 hover:text-slate-900",
    danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    'high-impact': "bg-slate-900 text-white hover:bg-slate-800 shadow-sm"
  };

  const rounding = {
    lg: "rounded-lg",
    full: "rounded-full"
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 text-sm ${rounding[rounded]} font-medium transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export const Input: React.FC<{
  label?: string,
  value: string | number,
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
  placeholder?: string,
  type?: string,
  className?: string
}> = ({ label, value, onChange, placeholder, type = "text", className = "" }) => (
  <div className={`space-y-1.5 ${className}`}>
    {label && <label className="text-sm font-medium text-slate-700">{label}</label>}
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors shadow-sm placeholder:text-slate-400"
    />
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode, variant?: 'success' | 'warning' | 'danger' | 'info' | 'gray' }> = ({ children, variant = 'gray' }) => {
  const styles = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200/60",
    warning: "bg-amber-50 text-amber-700 border-amber-200/60",
    danger: "bg-red-50 text-red-700 border-red-200/60",
    info: "bg-blue-50 text-blue-700 border-blue-200/60",
    gray: "bg-slate-50 text-slate-700 border-slate-200"
  };
  return (
    <span className={`px-2 py-0.5 text-[11px] font-medium rounded-md border ${styles[variant]}`}>
      {children}
    </span>
  );
};
