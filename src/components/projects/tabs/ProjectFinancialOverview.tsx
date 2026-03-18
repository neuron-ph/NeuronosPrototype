import { formatCurrency } from "../../ui/toast-utils";
import { CheckCircle2, FileText, TrendingUp, AlertCircle, Clock } from "lucide-react";
import type { FinancialData } from "../../../hooks/useProjectFinancials";

interface ProjectFinancialOverviewProps {
  financials: FinancialData;
}

export function ProjectFinancialOverview({ financials }: ProjectFinancialOverviewProps) {
  const { invoices, expenses, collections, billingItems, totals } = financials;
  const { 
    invoicedAmount,
    unbilledCharges,
    bookedCharges,
    directCost,
    collectedAmount,
    grossProfit, 
    grossMargin,
    outstandingAmount,
    overdueAmount,
  } = totals;

  // Formatter helper
  const fmt = (amount: number) => new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);

  // SHARED SCALE LOGIC:
  // We determine the maximum value among Income, Cost, and Collected to create a relative scale.
  // This ensures the longest bar represents the largest value.
  const maxValue = Math.max(bookedCharges, directCost, collectedAmount, 1);

  const incomeWidth = (bookedCharges / maxValue) * 100;
  const costWidth = (directCost / maxValue) * 100;
  const collectedWidth = (collectedAmount / maxValue) * 100;

  // Grouping Logic for Income (Invoiced + Unbilled)
  const unbilledItems = billingItems.filter(b => (b.status || "").toLowerCase() === 'unbilled');
  
  // We create a unified list for the breakdown
  const incomeByCategory = [...invoices, ...unbilledItems].reduce((acc: Record<string, number>, item) => {
    let category = item.charge_code || item.quotation_category || item.description || "General Revenue";
    const amount = Number(item.amount) || Number(item.total_amount) || 0;
    acc[category] = (acc[category] || 0) + amount;
    return acc;
  }, {});

  const costByCategory = expenses.reduce((acc: Record<string, number>, item) => {
    const category = item.expense_category || item.expense_type || item.description || "General Expense";
    const amount = Number(item.amount) || 0;
    acc[category] = (acc[category] || 0) + amount;
    return acc;
  }, {});

  return (
    <div className="space-y-8 p-6">
      {/* Hero Section (QuickBooks Style Profit & Cash Flow) */}
      <div className="bg-white rounded-xl border border-[#E5E9F0] p-6 flex items-stretch">
          
          {/* 1. Profit Margin (Left) */}
          <div className="w-[200px] flex flex-col justify-center pr-8 border-r border-[#E5E9F0]">
                <div className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider mb-1">Profit Margin</div>
                <div className={`text-[32px] font-bold ${grossMargin >= 0 ? 'text-[#12332B]' : 'text-[#DC2626]'}`}>
                  {grossMargin.toFixed(1)}%
                </div>
                <div className="text-[13px] text-[#667085] mt-1">
                  {grossProfit >= 0 ? "Net Profit" : "Net Loss"}: <span className="font-medium text-[#12332B]">{fmt(grossProfit)}</span>
                </div>
                <div className="text-[10px] text-[#9CA3AF] mt-1 italic">
                  (Based on Total Work)
                </div>
          </div>

          {/* 2. Income vs Costs Bars (Middle) - SHARED SCALE */}
          <div className="flex-1 px-8 flex flex-col justify-center gap-6">
              
              {/* Income Row */}
              <div className="flex items-center gap-4">
                  <div className="w-16 text-[13px] font-medium text-[#667085]">
                    Income
                  </div>
                  <div className="flex-1 h-3 bg-[#F3F4F6] rounded-full overflow-hidden relative group">
                      <div 
                        className="h-full bg-[#0F766E] rounded-full transition-all duration-500 ease-out" 
                        style={{ width: `${incomeWidth}%` }}
                      ></div>
                      {/* Tooltip for unbilled */}
                      <div className="absolute top-[-25px] left-0 hidden group-hover:block bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-10">
                        Invoiced: {fmt(invoicedAmount)} | Unbilled: {fmt(unbilledCharges)}
                      </div>
                  </div>
                  <div className="w-24 text-right text-[14px] font-bold text-[#12332B]" title={`Invoiced: ${fmt(invoicedAmount)} + Unbilled: ${fmt(unbilledCharges)}`}>
                    {fmt(bookedCharges)}
                  </div>
              </div>
              
              {/* Costs Row */}
              <div className="flex items-center gap-4">
                  <div className="w-16 text-[13px] font-medium text-[#667085]">Costs</div>
                  <div className="flex-1 h-3 bg-[#F3F4F6] rounded-full overflow-hidden">
                      <div 
                          className="h-full bg-[#C05621] rounded-full transition-all duration-500 ease-out" 
                          style={{ width: `${costWidth}%` }}
                      ></div>
                  </div>
                  <div className="w-24 text-right text-[14px] font-bold text-[#12332B]">{fmt(directCost)}</div>
              </div>

              {/* Collections Row */}
              <div className="flex items-center gap-4 pt-6 mt-2 border-t border-[#E5E9F0] border-dashed">
                  <div className="w-16 text-[13px] font-medium text-[#667085]">Collected</div>
                  <div className="flex-1 h-3 bg-[#F3F4F6] rounded-full overflow-hidden relative" title={`Invoiced: ${fmt(invoicedAmount)}`}>
                      <div 
                          className="h-full bg-[#10B981] rounded-full transition-all duration-500 ease-out" 
                          style={{ width: `${collectedWidth}%` }}
                          title={`Collected: ${fmt(collectedAmount)}`}
                      ></div>
                  </div>
                  <div className="w-24 text-right text-[14px] font-bold text-[#059669]">{fmt(collectedAmount)}</div>
              </div>
          </div>

          {/* 3. Invoices / Cash Flow (Right) */}
          <div className="w-[240px] pl-8 border-l border-[#E5E9F0] flex flex-col justify-center gap-4">
                <div className="flex justify-between items-center">
                    <div className="text-[13px] font-medium text-[#667085]">Open Invoices</div>
                    <div className="text-[14px] font-bold text-[#12332B]">{fmt(outstandingAmount)}</div>
                </div>
                <div className="flex justify-between items-center">
                    <div className="text-[13px] font-medium text-[#667085]">Overdue</div>
                    <div className="text-[14px] font-bold text-[#DC2626]">{fmt(overdueAmount)}</div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-[#E5E9F0]">
                    <div className="text-[13px] font-medium text-[#667085]">Paid</div>
                    <div className="text-[14px] font-bold text-[#059669]">{fmt(collectedAmount)}</div>
                </div>
          </div>

      </div>

      {/* Split Ledger View */}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Income Breakdown */}
          <div className="bg-white rounded-xl border border-[#E5E9F0] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E5E9F0] bg-[#F0FDF9] flex justify-between items-center">
                  <h3 className="text-[13px] font-bold text-[#0F766E] uppercase tracking-wide">Income Breakdown</h3>
                  {unbilledCharges > 0 && (
                     <span className="text-[11px] font-medium text-[#0F766E] bg-white px-2 py-0.5 rounded border border-[#CCFBEF]">
                       Includes {fmt(unbilledCharges)} Unbilled
                     </span>
                  )}
              </div>
              <div className="p-0">
                  <table className="w-full">
                      <thead className="bg-[#F8F9FB] border-b border-[#E5E9F0]">
                          <tr>
                              <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#667085] uppercase tracking-[0.02em]">Category</th>
                              <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#667085] uppercase tracking-[0.02em]">Amount</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E9F0]">
                          {Object.entries(incomeByCategory).map(([category, amount], idx) => (
                              <tr key={idx} className="hover:bg-[#F9FAFB]">
                                  <td className="px-6 py-3 text-[13px] text-[#12332B] font-medium">{category}</td>
                                  <td className="px-6 py-3 text-[13px] text-right text-[#059669] font-medium">{fmt(amount)}</td>
                              </tr>
                          ))}
                          {Object.keys(incomeByCategory).length === 0 && (
                              <tr>
                                  <td colSpan={2} className="px-6 py-8 text-center text-[13px] text-[#9CA3AF]">No income recorded</td>
                              </tr>
                          )}
                      </tbody>
                      <tfoot className="bg-[#F8F9FB] border-t border-[#E5E9F0]">
                          <tr>
                              <td className="px-6 py-3 text-[13px] font-bold text-[#12332B]">Total Income</td>
                              <td className="px-6 py-3 text-[13px] font-bold text-right text-[#0F766E]">{fmt(bookedCharges)}</td>
                          </tr>
                      </tfoot>
                  </table>
              </div>
          </div>

          {/* Cost Breakdown */}
          <div className="bg-white rounded-xl border border-[#E5E9F0] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E5E9F0] bg-[#FFF7ED]">
                  <h3 className="text-[13px] font-bold text-[#C05621] uppercase tracking-wide">Cost Breakdown</h3>
              </div>
              <div className="p-0">
                  <table className="w-full">
                      <thead className="bg-[#F8F9FB] border-b border-[#E5E9F0]">
                          <tr>
                              <th className="px-6 py-3 text-left text-[11px] font-semibold text-[#667085] uppercase tracking-[0.02em]">Expense Type</th>
                              <th className="px-6 py-3 text-right text-[11px] font-semibold text-[#667085] uppercase tracking-[0.02em]">Amount</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E9F0]">
                          {Object.entries(costByCategory).map(([category, amount], idx) => (
                              <tr key={idx} className="hover:bg-[#F9FAFB]">
                                  <td className="px-6 py-3 text-[13px] text-[#12332B] font-medium">{category}</td>
                                  <td className="px-6 py-3 text-[13px] text-right text-[#C05621] font-medium">{fmt(amount)}</td>
                              </tr>
                          ))}
                          {Object.keys(costByCategory).length === 0 && (
                              <tr>
                                  <td colSpan={2} className="px-6 py-8 text-center text-[13px] text-[#9CA3AF]">No costs recorded</td>
                              </tr>
                          )}
                      </tbody>
                      <tfoot className="bg-[#F8F9FB] border-t border-[#E5E9F0]">
                          <tr>
                              <td className="px-6 py-3 text-[13px] font-bold text-[#12332B]">Total Costs</td>
                              <td className="px-6 py-3 text-[13px] font-bold text-right text-[#C05621]">{fmt(directCost)}</td>
                          </tr>
                      </tfoot>
                  </table>
              </div>
          </div>
      </div>
    </div>
  );
}
