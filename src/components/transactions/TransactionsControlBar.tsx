import { Search, RefreshCw, ExternalLink, Filter } from "lucide-react";
import { CustomDropdown } from "../bd/CustomDropdown";
import { CustomDatePicker } from "../common/CustomDatePicker";
import type { ReviewStatus } from "./types";

interface TransactionsControlBarProps {
  activeTab: ReviewStatus;
  onTabChange: (tab: ReviewStatus) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  dateFrom: string;
  onDateFromChange: (date: string) => void;
  dateTo: string;
  onDateToChange: (date: string) => void;
  filterType: string;
  onFilterTypeChange: (type: string) => void;
  visibleTabs?: ReviewStatus[];
}

export function TransactionsControlBar({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  filterType,
  onFilterTypeChange,
  visibleTabs,
}: TransactionsControlBarProps) {

  const allTabs: { id: ReviewStatus; label: string }[] = [
    { id: 'for_review', label: 'For Review' },
    { id: 'categorized', label: 'Categorized' },
    { id: 'excluded', label: 'Excluded' }
  ];
  const tabs = visibleTabs ? allTabs.filter((t) => visibleTabs.includes(t.id)) : allTabs;

  return (
    <div className="flex flex-col bg-[var(--theme-bg-surface)] border-b border-[var(--theme-border-default)]">
      {/* Top Row: Tabs & Bank Register Link */}
      <div className="px-[45px] flex items-center justify-between mt-2">
        <div className="flex gap-8">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  py-4 relative text-sm font-medium transition-colors
                  ${isActive ? "text-[var(--theme-action-primary-bg)]" : "text-[var(--theme-text-muted)] hover:text-[var(--theme-text-secondary)]"}
                `}
              >
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--theme-action-primary-bg)] rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
             
        </div>
      </div>

      {/* Bottom Row: Filters */}
      <div className="px-[45px] py-3 bg-[var(--theme-bg-surface)] border-t border-[var(--theme-border-default)] flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--theme-text-muted)]" />
          <input
            type="text"
            placeholder="Search desc, payee, amount..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[var(--theme-action-primary-bg)] focus:border-[var(--theme-action-primary-bg)] transition-all placeholder:text-[var(--theme-text-muted)]"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
            <CustomDropdown 
                value={filterType}
                onChange={onFilterTypeChange}
                options={[
                    { value: "all", label: "All transactions" },
                    { value: "expense", label: "Money Out" },
                    { value: "deposit", label: "Money In" }
                ]}
                placeholder="Type"
                size="sm" // Use smaller size for density
                buttonStyle={{ height: "38px" }}
            />
            
            <CustomDatePicker 
                value={dateFrom} 
                onChange={onDateFromChange} 
                placeholder="Date From"
                className="h-[38px]"
                minWidth="130px"
            />
            
            <CustomDatePicker 
                value={dateTo} 
                onChange={onDateToChange} 
                placeholder="Date To"
                className="h-[38px]"
                minWidth="130px"
            />
            
            <button className="h-[38px] px-3 bg-[var(--theme-bg-surface)] border border-[var(--theme-border-default)] rounded-lg text-[var(--theme-text-muted)] hover:bg-[var(--theme-bg-surface-subtle)] hover:text-[var(--theme-text-secondary)] transition-colors flex items-center gap-2 text-sm font-medium">
                <Filter size={16} />
                More
            </button>
        </div>
      </div>
    </div>
  );
}
