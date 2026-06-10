/**
 * ProjectContractPicker — unified "Project / Contract Number" selector for the
 * booking creation panels (NEU-015).
 *
 * A booking's container can be EITHER a project OR a contract. This picker
 * searches BOTH for the customer in one dropdown, instead of the old
 * contract-only (Brokerage/Trucking/MI/Others) or project-only (Forwarding)
 * fields. Whichever is chosen becomes the booking's container link
 * (bookings.project_id or bookings.contract_id). A container is required to
 * create a booking — you cannot have one without (Marcus, 6/11).
 *
 * Self-fetching: loads the customer's active projects + active contracts so the
 * host panel only handles the selection.
 */

import { useMemo, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { CustomDropdown } from "../../bd/CustomDropdown";
import { fetchProjectsForCustomer } from "../../../utils/projectAutofill";
import {
  fetchActiveContractsForCustomer,
  filterContractsForService,
} from "../../../utils/contractLookup";

export type ContainerKind = "project" | "contract";

export interface ContainerSelection {
  kind: ContainerKind;
  id: string;
  number: string;
  name: string;
  /** Contract-only: POL/POD lists carried through so the host can constrain port pickers. */
  polOptions?: string[];
  podOptions?: string[];
}

interface Props {
  customerId?: string | null;
  customerName?: string | null;
  serviceType?: string;
  /** Current selection (kind + id); label/number are resolved internally. */
  value: { kind: ContainerKind; id: string } | null;
  onChange: (selection: ContainerSelection | null) => void;
  /**
   * Project to keep selectable immediately (e.g. the panel was launched from a
   * project) so the field is populated even before the fetch resolves.
   */
  lockedProject?: { id: string; number: string; name: string } | null;
  portalZIndex?: number;
  disabled?: boolean;
}

const PROJECT_PREFIX = "project:";
const CONTRACT_PREFIX = "contract:";

const HINT_STYLE: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "6px",
  fontSize: "13px",
  color: "var(--theme-text-muted)",
  backgroundColor: "var(--theme-bg-surface-subtle)",
  border: "1px solid var(--theme-border-default)",
  minHeight: "40px",
};

export function ProjectContractPicker({
  customerId,
  customerName,
  serviceType,
  value,
  onChange,
  lockedProject,
  portalZIndex,
  disabled,
}: Props) {
  const hasCustomer = Boolean(customerId) || (customerName?.trim().length ?? 0) >= 3;

  const projectsQuery = useQuery({
    queryKey: ["booking-container", "projects", customerId ?? "", customerName ?? ""],
    queryFn: () => fetchProjectsForCustomer(customerId, customerName),
    enabled: hasCustomer,
    staleTime: 60_000,
  });

  const contractsQuery = useQuery({
    queryKey: ["booking-container", "contracts", customerName ?? "", serviceType ?? ""],
    queryFn: async () => {
      const all = await fetchActiveContractsForCustomer(customerName ?? "");
      return filterContractsForService(all, serviceType);
    },
    enabled: (customerName?.trim().length ?? 0) >= 3,
    staleTime: 60_000,
  });

  const projects = projectsQuery.data ?? [];
  const contracts = contractsQuery.data ?? [];

  const { options, byKey } = useMemo(() => {
    const map = new Map<string, ContainerSelection>();
    const projectOptions: { value: string; label: string }[] = [];
    const seenProjects = new Set<string>();

    const pushProject = (id: string, number: string, name: string) => {
      if (!id || seenProjects.has(id)) return;
      seenProjects.add(id);
      const key = PROJECT_PREFIX + id;
      map.set(key, { kind: "project", id, number, name });
      projectOptions.push({
        value: key,
        label: `Project · ${number}${name ? " — " + name : ""}`,
      });
    };

    // Locked project first — always selectable even before the fetch resolves.
    if (lockedProject) pushProject(lockedProject.id, lockedProject.number, lockedProject.name);
    for (const project of projects) {
      pushProject(
        String(project.id),
        String(project.project_number ?? ""),
        String(project.quotation_name ?? ""),
      );
    }

    const contractOptions: { value: string; label: string }[] = [];
    for (const contract of contracts) {
      const key = CONTRACT_PREFIX + contract.id;
      map.set(key, {
        kind: "contract",
        id: contract.id,
        number: contract.quote_number ?? "",
        name: contract.quotation_name ?? "",
        polOptions: contract.pol_options,
        podOptions: contract.pod_options,
      });
      contractOptions.push({
        value: key,
        label: `Contract · ${contract.quote_number ?? ""}${contract.quotation_name ? " — " + contract.quotation_name : ""}`,
      });
    }

    return { options: [...projectOptions, ...contractOptions], byKey: map };
  }, [projects, contracts, lockedProject]);

  const loading = projectsQuery.isLoading || contractsQuery.isLoading;
  const selectedKey = value
    ? (value.kind === "project" ? PROJECT_PREFIX : CONTRACT_PREFIX) + value.id
    : "";

  if (!hasCustomer) {
    return <div style={HINT_STYLE}>Select a customer first</div>;
  }

  if (!loading && options.length === 0) {
    return <div style={HINT_STYLE}>No active projects or contracts found for this client</div>;
  }

  return (
    <CustomDropdown
      label=""
      value={selectedKey}
      onChange={(key) => onChange(key ? byKey.get(key) ?? null : null)}
      options={options}
      placeholder={loading ? "Loading projects & contracts…" : "Search project or contract…"}
      searchable
      fullWidth
      portalZIndex={portalZIndex}
      dropdownMaxWidth={640}
      disabled={disabled}
    />
  );
}
