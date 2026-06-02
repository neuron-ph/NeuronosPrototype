/**
 * AccountingBookingsShell — Thin wrapper that gives Accounting access to
 * all Operations booking modules via a service-type tab bar.
 *
 * Zero duplication: each tab renders the existing Operations booking list
 * component directly. Detail views are handled internally by every component
 * (Forwarding, Brokerage, Trucking, Marine Insurance, Others all handle
 * detail inline via their own list→detail state).
 */

import { useState, useEffect } from "react";
import { useSearchParams, useNavigationType } from "react-router";
import { usePermission } from "../../context/PermissionProvider";
import { useUrlSelection } from "../../hooks/useUrlSelection";
import { Container, Ship, Truck, FileText, Package } from "lucide-react";
import { ForwardingBookings } from "../operations/forwarding/ForwardingBookings";
import { BrokerageBookings } from "../operations/BrokerageBookings";
import { TruckingBookings } from "../operations/TruckingBookings";
import { MarineInsuranceBookings } from "../operations/MarineInsuranceBookings";
import { OthersBookings } from "../operations/OthersBookings";

type ServiceTab = "forwarding" | "brokerage" | "trucking" | "marine-insurance" | "others";

const SERVICE_TABS: { id: ServiceTab; label: string; icon: typeof Container }[] = [
  { id: "forwarding", label: "Forwarding", icon: Container },
  { id: "brokerage", label: "Brokerage", icon: Package },
  { id: "trucking", label: "Trucking", icon: Truck },
  { id: "marine-insurance", label: "Marine Insurance", icon: Ship },
  { id: "others", label: "Others", icon: FileText },
];

export function AccountingBookingsShell() {
  const { can } = usePermission();
  const canForwarding = can("accounting_bookings_forwarding_tab", "view");
  const canBrokerage = can("accounting_bookings_brokerage_tab", "view");
  const canTrucking = can("accounting_bookings_trucking_tab", "view");
  const canMarineInsurance = can("accounting_bookings_marine_insurance_tab", "view");
  const canOthers = can("accounting_bookings_others_tab", "view");

  const firstAllowedTab: ServiceTab =
    canForwarding ? "forwarding" :
    canBrokerage ? "brokerage" :
    canTrucking ? "trucking" :
    canMarineInsurance ? "marine-insurance" :
    canOthers ? "others" :
    "forwarding";

  const [activeTab, setActiveTab] = useState<ServiceTab>(firstAllowedTab);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigationType = useNavigationType();
  const [urlBookingId, setUrlBookingId] = useUrlSelection("booking");
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [pendingHighlightId, setPendingHighlightId] = useState<string | null>(null);

  // Deep-link: auto-select booking from ?booking= query param
  // Detect service type from booking ID prefix and switch tabs
  useEffect(() => {
    // Only react to genuine navigations (real deep-links push a new history
    // entry, mount/refresh is a POP). Ignore REPLACE updates — that's how the
    // child booking lists persist their own selection to the URL, and reacting
    // to those mis-routes the UUID id to the default forwarding tab.
    if (navigationType === "REPLACE") return;
    const bookingId = searchParams.get("booking");
    const targetTab = searchParams.get("tab");
    const targetHighlight = searchParams.get("highlight");
    if (!bookingId) return;

    // Detect service type from booking number prefix (format: {PREFIX}{YYYYMM}-{NNN}).
    // Longest-prefix-first so TKG/MIP/FWD/OTH match before the shorter BR.
    // UUID booking ids carry no known prefix and fall through to the default.
    const upper = bookingId.toUpperCase();
    const prefixMap: [string, ServiceTab][] = [
      ["FWD", "forwarding"],
      ["TKG", "trucking"],
      ["MIP", "marine-insurance"],
      ["OTH", "others"],
      ["BR", "brokerage"],
    ];
    const detected = prefixMap.find(([p]) => upper.startsWith(p))?.[1] || "forwarding";
    setActiveTab(detected);
    setPendingBookingId(bookingId);
    setPendingTab(targetTab || null);
    setPendingHighlightId(targetHighlight || null);

    // Clean the query param
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, navigationType]);

  // Clear the active forwarding selection when switching tabs
  useEffect(() => {
    setUrlBookingId(null);
  }, [activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      case "forwarding":
        if (!canForwarding) return null;
        return <ForwardingBookings pendingBookingId={urlBookingId ?? pendingBookingId} initialTab={pendingTab} highlightId={pendingHighlightId} />;
      case "brokerage":
        if (!canBrokerage) return null;
        return <BrokerageBookings pendingBookingId={pendingBookingId} initialTab={pendingTab} highlightId={pendingHighlightId} />;
      case "trucking":
        if (!canTrucking) return null;
        return <TruckingBookings pendingBookingId={pendingBookingId} initialTab={pendingTab} highlightId={pendingHighlightId} />;
      case "marine-insurance":
        if (!canMarineInsurance) return null;
        return <MarineInsuranceBookings pendingBookingId={pendingBookingId} initialTab={pendingTab} highlightId={pendingHighlightId} />;
      case "others":
        if (!canOthers) return null;
        return <OthersBookings pendingBookingId={pendingBookingId} initialTab={pendingTab} highlightId={pendingHighlightId} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--neuron-bg-page)" }}>
      {/* Header */}
      <div className="px-8 pt-8 mb-8">
        <h1
          style={{
            fontSize: "32px",
            fontWeight: 600,
            letterSpacing: "-1.2px",
            color: "var(--neuron-ink-primary)",
            lineHeight: "40px",
          }}
        >
          Bookings
        </h1>
        <p
          style={{
            fontSize: "14px",
            color: "var(--neuron-ink-secondary)",
            marginTop: "4px",
          }}
        >
          View and manage bookings across all service types
        </p>
      </div>

      {/* Service type tab bar */}
      <div
        className="px-8 flex gap-1"
        style={{
          borderBottom: "1px solid var(--neuron-ui-border)",
        }}
      >
        {SERVICE_TABS.filter((tab) => {
          if (tab.id === "forwarding") return canForwarding;
          if (tab.id === "brokerage") return canBrokerage;
          if (tab.id === "trucking") return canTrucking;
          if (tab.id === "marine-insurance") return canMarineInsurance;
          if (tab.id === "others") return canOthers;
          return false;
        }).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-2.5 transition-colors"
              style={{
                fontSize: "13px",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--neuron-brand-green)" : "var(--neuron-ink-secondary)",
                borderBottom: isActive ? "2px solid var(--neuron-brand-green)" : "2px solid transparent",
                marginBottom: "-1px",
                borderRadius: "0",
                background: "transparent",
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content area — renders the Operations booking component */}
      <div className="flex-1 overflow-auto">
        {renderContent()}
      </div>
    </div>
  );
}