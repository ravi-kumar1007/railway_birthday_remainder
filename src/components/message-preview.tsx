import type { ReactNode } from "react";

// WhatsApp's inline formatting: *bold*, _italic_, ~strikethrough~
const FORMATTING = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;

function formatted(text: string): ReactNode[] {
  return text.split(FORMATTING).map((part, index) => {
    const inner = part.slice(1, -1);
    if (part.length > 2 && part.startsWith("*") && part.endsWith("*")) return <strong key={index}>{inner}</strong>;
    if (part.length > 2 && part.startsWith("_") && part.endsWith("_")) return <em key={index}>{inner}</em>;
    if (part.length > 2 && part.startsWith("~") && part.endsWith("~")) return <s key={index}>{inner}</s>;
    return part;
  });
}

/** A message as it appears in the employee's WhatsApp chat */
export function MessagePreview({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-[#efeae2] p-3 sm:p-4">
      <div className="max-w-[90%] rounded-lg rounded-tl-none bg-white px-3 pt-2 pb-1.5 text-sm leading-relaxed whitespace-pre-wrap text-slate-900 shadow-xs [overflow-wrap:anywhere]">
        {formatted(text)}
        <span className="mt-0.5 block text-right text-[11px] text-slate-400">12:00</span>
      </div>
    </div>
  );
}
