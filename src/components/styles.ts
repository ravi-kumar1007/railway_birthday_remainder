// Shared Tailwind class strings for form controls and buttons

export const controlClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 aria-invalid:border-red-400 aria-invalid:focus:ring-red-500/20";

/** A control below its label */
export const inputClass = `mt-1.5 ${controlClass}`;

const buttonBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap shadow-xs transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-60";

export const primaryButtonClass = `${buttonBase} bg-emerald-600 text-white hover:bg-emerald-700`;

export const secondaryButtonClass = `${buttonBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

export const dangerButtonClass = `${buttonBase} border border-red-200 bg-white text-red-700 hover:bg-red-50`;
