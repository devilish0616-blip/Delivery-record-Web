import type { LucideIcon } from "lucide-react";

export interface ChipOption {
  key: string;
  label: string;
  icon: LucideIcon;
}

// 分類快選 chip 列，目前用於扣款分類選擇，未來有類似「先選分類再展開表單」的情境也可共用。
export function PresetChips({
  options,
  selected,
  onSelect,
}: {
  options: ChipOption[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const Icon = opt.icon;
        const isSelected = selected === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onSelect(opt.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
              isSelected
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-600 hover:border-blue-400 hover:text-gray-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
