// Network Partners - Active International Agents
// Data sourced from Active Agents Analysis (Jan 13, 2026)

import type { QuotationChargeCategory, QuotationLineItemNew } from "../types/pricing";

export type PartnerType = "international" | "co-loader" | "all-in";

// ⚠️ DEPRECATED: Use QuotationChargeCategory[] instead
// Kept for backward compatibility during migration
export interface VendorLineItem {
  id: string;
  description: string;
  unit_price: number;
  unit_type: "per_cbm" | "per_container" | "per_shipment" | "per_kg" | "flat_fee";
  currency: string;
  category?: string; // e.g., "Origin Charges", "Freight", "Destination Charges"
}

export interface NetworkPartner {
  id: string;
  company_name: string;
  wca_id: string;
  expires: string; // YYYY-MM-DD format
  contact_person: string;
  emails: string[];
  country: string;
  territory?: string;
  is_wca_conference: boolean;
  services: string[];
  notes?: string;
  partner_type?: PartnerType;
  phone?: string;
  mobile?: string;
  website?: string;
  address?: string;
  
  // NEW: Vendor's standard rate card using same structure as quotations
  charge_categories?: QuotationChargeCategory[];
  
  // DEPRECATED: Old format - kept for backward compatibility
  line_items?: VendorLineItem[];
}

// Helper function to check if partnership is expired
export function isExpired(expiresDate: string): boolean {
  if (!expiresDate) return false;
  const today = new Date();
  const expiry = new Date(expiresDate);
  return expiry < today;
}

// Helper function to check if partnership expires soon (within 60 days)
export function expiresSoon(expiresDate: string): boolean {
  if (!expiresDate) return false;
  const today = new Date();
  const expiry = new Date(expiresDate);
  const daysUntilExpiry = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return daysUntilExpiry >= 0 && daysUntilExpiry <= 60;
}

export const NETWORK_PARTNERS: NetworkPartner[] = [
  // ========== CHINA ==========
  {
    id: "np-001",
    company_name: "THETIS LOGISTICS CO., LTD",
    wca_id: "140330",
    expires: "2026-06-05",
    contact_person: "Mona",
    emails: ["Monarong@thetislogistics.com"],
    country: "China",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"],
    partner_type: "international",
    
    // NEW FORMAT: Category-based structure (same as quotations)
    charge_categories: [
      {
        id: "cat-np001-origin",
        category_name: "Origin Charges",
        line_items: [
          {
            id: "li-001-01",
            description: "Document Fee",
            price: 50,
            currency: "USD",
            quantity: 1,
            unit: "flat fee",
            forex_rate: 1.0,
            is_taxed: false,
            remarks: "per shipment",
            amount: 50
          },
          {
            id: "li-001-02",
            description: "Local Trucking (China)",
            price: 120,
            currency: "USD",
            quantity: 1,
            unit: "per container",
            forex_rate: 1.0,
            is_taxed: false,
            remarks: "per container",
            amount: 120
          },
          {
            id: "li-001-03",
            description: "Export Customs Clearance",
            price: 80,
            currency: "USD",
            quantity: 1,
            unit: "per shipment",
            forex_rate: 1.0,
            is_taxed: false,
            remarks: "per shipment",
            amount: 80
          },
          {
            id: "li-001-05",
            description: "THC (Terminal Handling Charge)",
            price: 150,
            currency: "USD",
            quantity: 1,
            unit: "per container",
            forex_rate: 1.0,
            is_taxed: false,
            remarks: "per container",
            amount: 150
          }
        ],
        subtotal: 400
      },
      {
        id: "cat-np001-freight",
        category_name: "Freight Charges",
        line_items: [
          {
            id: "li-001-04",
            description: "Ocean Freight Handling",
            price: 200,
            currency: "USD",
            quantity: 1,
            unit: "per CBM",
            forex_rate: 1.0,
            is_taxed: false,
            remarks: "per CBM",
            amount: 200
          }
        ],
        subtotal: 200
      }
    ]
  },
  {
    id: "np-002",
    company_name: "SHANGHAI MOSIN GLOBAL LOGISTICS CO., LTD",
    wca_id: "",
    expires: "",
    contact_person: "Victor",
    emails: ["victor@smglogistics.com"],
    country: "China",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"],
    notes: "FNC Member: N/A",
    partner_type: "international"
  },
  {
    id: "np-003",
    company_name: "MAYTO CHINA LIMITED",
    wca_id: "135004",
    expires: "2026-02-21",
    contact_person: "Vito Huang",
    emails: ["bd@maytologistics.com"],
    country: "China",
    territory: "Shenzhen",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-004",
    company_name: "LONGSAIL SUPPLY CHAIN CO., LTD",
    wca_id: "282",
    expires: "2025-12-27",
    contact_person: "Mandy",
    emails: ["mandy.li@longsailing.net"],
    country: "China",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-005",
    company_name: "EIFA OCEAN INTERNATIONAL LOGISTICS CO.LTD",
    wca_id: "130108",
    expires: "2026-03-10",
    contact_person: "Nicole Zheng",
    emails: ["nicole@eifaocean.com"],
    country: "China",
    is_wca_conference: false,
    services: ["Ocean Freight"]
  },
  {
    id: "np-006",
    company_name: "DI DI GLOBAL LOGISTICS CO., LTD.",
    wca_id: "124687",
    expires: "2026-05-11",
    contact_person: "Janice Wu",
    emails: ["janice.wu@didi-global.net"],
    country: "China",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-007",
    company_name: "NINGBO FAIRY LOGISTICS CO., LTD",
    wca_id: "146028",
    expires: "2026-08-29",
    contact_person: "Amy, River",
    emails: ["overseas@nbfairy.com", "riverhuang@nbfairy.com"],
    country: "China",
    territory: "Ningbo",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-008",
    company_name: "DONATRANS (XIAMEN) LOGISTICS CO., LTD.",
    wca_id: "119932",
    expires: "",
    contact_person: "Thia",
    emails: ["op1-xm@donatrans.com"],
    country: "China",
    territory: "Xiamen",
    is_wca_conference: true,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-009",
    company_name: "SHENZHEN MAXSPEED GLOBAL FORWARDING CO., LTD",
    wca_id: "88267",
    expires: "2026-01-16",
    contact_person: "Betty Wan",
    emails: ["sales2_isc@mgflog.com"],
    country: "China",
    territory: "Shenzhen",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-010",
    company_name: "ZHEJIANG DTW INTERNATIONAL TRANSPORTATION CO., LTD.",
    wca_id: "102717",
    expires: "2025-12-27",
    contact_person: "Yennifer Mao",
    emails: ["yanping.mao@dtw.com.cn"],
    country: "China",
    territory: "Zhejiang",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-011",
    company_name: "AIR SEA TRANSPORT INC.",
    wca_id: "12881",
    expires: "2026-07-29",
    contact_person: "Carol Chen",
    emails: ["zsn-mm01@airseagroup.com.cn"],
    country: "China",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-012",
    company_name: "INTERFREIGHT LOGISTICS CO., LTD.",
    wca_id: "62953",
    expires: "2026-06-17",
    contact_person: "Nancy He",
    emails: ["global@in-freight.com"],
    country: "China",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-013",
    company_name: "FARTRANS LOGISTICS CO., LTD.",
    wca_id: "145049",
    expires: "2026-06-25",
    contact_person: "Maggie",
    emails: ["maggie@fartranscn.com"],
    country: "China",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-014",
    company_name: "TOPWORLD GLOBAL LOGISTICS (SHANGHAI) CO., LTD.",
    wca_id: "55378",
    expires: "2026-01-17",
    contact_person: "Ms. Elaine Liang",
    emails: ["sales01@topworld-logistics.com"],
    country: "China",
    territory: "Shanghai",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-015",
    company_name: "BEST SERVICES INTERNATIONAL FREIGHT LTD.",
    wca_id: "55752",
    expires: "2026-01-06",
    contact_person: "Claire",
    emails: ["gps17@bestservices.com.cn"],
    country: "China",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-016",
    company_name: "WAY-WAY INTERNATIONAL LOGISTICS CO., LTD.",
    wca_id: "58432",
    expires: "2026-09-08",
    contact_person: "Gianna",
    emails: ["gianna@way-way.com.cn"],
    country: "China",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== VIETNAM ==========
  {
    id: "np-017",
    company_name: "KIRIN GLOBAL VIETNAM COMPANY LIMITED",
    wca_id: "149318",
    expires: "2026-05-05",
    contact_person: "Gian Calderon",
    emails: ["gian@kirinworld.net"],
    country: "Vietnam",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-018",
    company_name: "ROYAL LINE JOINT STOCK COMPANY",
    wca_id: "138182",
    expires: "2026-01-18",
    contact_person: "Harry Huynh",
    emails: ["oversea04@royallineco.com"],
    country: "Vietnam",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-019",
    company_name: "NEW OCEAN FORWARDING TRADING SERVICE COMPANY LIMITED",
    wca_id: "140821",
    expires: "",
    contact_person: "Sammy Trieu",
    emails: ["sammy@newocean.vn"],
    country: "Vietnam",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-020",
    company_name: "TOP BULL LINES., JSC",
    wca_id: "118843",
    expires: "2026-08-27",
    contact_person: "Ms. Jessi Chi",
    emails: ["jessi@bullines.com"],
    country: "Vietnam",
    is_wca_conference: true,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-021",
    company_name: "BSI FREIGHT VIETNAM COMPANY LIMITED",
    wca_id: "146546",
    expires: "2026-01-06",
    contact_person: "Mr. Carry Yu",
    emails: ["carry.yu@bsifreight.com"],
    country: "Vietnam",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-022",
    company_name: "ABILITY LOGISTICS COMPANY LIMITED",
    wca_id: "133830",
    expires: "2026-03-03",
    contact_person: "Kattie Nhi",
    emails: ["kattie@ability.com.vn"],
    country: "Vietnam",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== GERMANY ==========
  {
    id: "np-023",
    company_name: "QCS-QUICK CARGO SERVICE GMBH",
    wca_id: "41922",
    expires: "2025-12-20",
    contact_person: "Mr. Oliver Krautter",
    emails: ["oliver.krautter@quick-cargo-service.de"],
    country: "Germany",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-024",
    company_name: "INTERFRACHT AIR SERVICE GMBH",
    wca_id: "62113",
    expires: "2026-03-31",
    contact_person: "Frank Schneider",
    emails: ["f.schneider@interfracht.de"],
    country: "Germany",
    is_wca_conference: false,
    services: ["Air Freight"]
  },
  {
    id: "np-025",
    company_name: "CARGOMIND (GERMANY) GMBH",
    wca_id: "47019",
    expires: "2025-12-31",
    contact_person: "Mr. Daniele Tettè",
    emails: ["daniele.tette@cargomind.com"],
    country: "Germany",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-026",
    company_name: "1 2 3 AIR SEA RAIL INTERNATIONAL TRANSPORT GMBH & CO. KG",
    wca_id: "71708",
    expires: "2026-06-25",
    contact_person: "",
    emails: ["seafreight@german-shipping.com", "airfreight@german-shipping.com"],
    country: "Germany",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight", "Rail"]
  },
  {
    id: "np-027",
    company_name: "ALFONS KOESTER & CO GMBH",
    wca_id: "14076",
    expires: "2026-04-26",
    contact_person: "",
    emails: ["c.bode@alfons-koester.de"],
    country: "Germany",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-028",
    company_name: "CGATE LOGISTICS GMBH",
    wca_id: "67960",
    expires: "2026-06-02",
    contact_person: "",
    emails: ["sea.pricing.de@cgate-logistics.com", "air.pricing.de@cgate-logistics.com"],
    country: "Germany",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-029",
    company_name: "EMBASSY FREIGHT SERVICES EUROPE (GERMANY) GMBH",
    wca_id: "39091",
    expires: "2026-07-27",
    contact_person: "",
    emails: ["sales-airfreight@embassyfreight.de", "sales-seafreight@embassyfreight.de"],
    country: "Germany",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-030",
    company_name: "ISA - INDEPENDENT SHIPPING AGENCIES GMBH",
    wca_id: "96319",
    expires: "2027-12-20",
    contact_person: "Lisa Hapanionek",
    emails: ["Lisa.Hapanionek@isa-ger.com"],
    country: "Germany",
    is_wca_conference: false,
    services: ["Ocean Freight"]
  },

  // ========== INDIA ==========
  {
    id: "np-031",
    company_name: "SKYWAYS AIR SERVICES PVT. LTD.",
    wca_id: "47376",
    expires: "2026-05-22",
    contact_person: "Satyam Gupta",
    emails: ["satyam.gupta@skyways-group.com"],
    country: "India",
    is_wca_conference: false,
    services: ["Air Freight"]
  },
  {
    id: "np-032",
    company_name: "OCEAN SKY LOGISTICS",
    wca_id: "119653",
    expires: "2026-10-07",
    contact_person: "Jayalekshmi",
    emails: ["sales.maa@oceanskylogistics.net"],
    country: "India",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-033",
    company_name: "SHEARWATER GLS PVT. LTD.",
    wca_id: "142440",
    expires: "2026-01-11",
    contact_person: "Abdullah A",
    emails: ["sales1@shearwatergls.com"],
    country: "India",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-034",
    company_name: "RYDER SHIPPING LINES PVT. LTD.",
    wca_id: "72902",
    expires: "2026-07-22",
    contact_person: "Pratik",
    emails: ["pratik.patil@ryderlines.com"],
    country: "India",
    is_wca_conference: false,
    services: ["Ocean Freight"]
  },
  {
    id: "np-035",
    company_name: "SWENLOG SUPPLY CHAIN SOLUTIONS PRIVATE LIMITED",
    wca_id: "129781",
    expires: "2025-12-20",
    contact_person: "Venky R",
    emails: ["venky@swenlog.com"],
    country: "India",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== ITALY ==========
  {
    id: "np-036",
    company_name: "OCEAN SPED SRL",
    wca_id: "16827",
    expires: "2026-05-02",
    contact_person: "Maurizio Avvenente",
    emails: ["maurizio@oceansped.it"],
    country: "Italy",
    is_wca_conference: false,
    services: ["Ocean Freight"]
  },
  {
    id: "np-037",
    company_name: "CARGO COMPASS S.P.A",
    wca_id: "76928",
    expires: "2026-04-23",
    contact_person: "Alberto Burini",
    emails: ["aburini@cargocompass.it"],
    country: "Italy",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-038",
    company_name: "AIRONE LOG S.R.L.",
    wca_id: "133583",
    expires: "2026-03-17",
    contact_person: "Dario Mansi",
    emails: ["Sourcing.dario@gmail.com"],
    country: "Italy",
    is_wca_conference: true,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-039",
    company_name: "TEC CARGO ITALIA S.R.L.",
    wca_id: "102984",
    expires: "2026-01-28",
    contact_person: "Mr. Massimo Mazzantini",
    emails: ["massimo.mazzantini@teccargoitalia.it"],
    country: "Italy",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-040",
    company_name: "ITALMONDO S.P.A.",
    wca_id: "35608",
    expires: "2026-02-25",
    contact_person: "Massimo Gerardo Pozzi Chiesa",
    emails: ["M.Pozzichiesa@italmondo.com"],
    country: "Italy",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-041",
    company_name: "INTERNATIONAL SERVICES SRL",
    wca_id: "105285",
    expires: "2026-07-06",
    contact_person: "Michela Magliani",
    emails: ["mmagliana@transport-is.com"],
    country: "Italy",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-042",
    company_name: "SEBI S.R.L.",
    wca_id: "71430",
    expires: "2025-12-16",
    contact_person: "Mr. Massimo Bonicalzi",
    emails: ["massimo.bonicalzi@sebigroup.com"],
    country: "Italy",
    territory: "Milan",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-043",
    company_name: "VOLANTIS INTERNATIONAL LOGISTICS CO.",
    wca_id: "137752",
    expires: "2025-11-29",
    contact_person: "Bugracan Gundogdu",
    emails: ["bugra@volantislogistics.com"],
    country: "Italy",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-044",
    company_name: "TUSCANIA (A DIVISION OF FANFANI SRL)",
    wca_id: "71910",
    expires: "2026-11-07",
    contact_person: "Nicola Pir",
    emails: ["n.pirrone@fanfani.eu"],
    country: "Italy",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== SPAIN ==========
  {
    id: "np-045",
    company_name: "SPARBER GROUP",
    wca_id: "15305",
    expires: "2025-11-15",
    contact_person: "Fernando Martinez",
    emails: ["valencia@sparber.es"],
    country: "Spain",
    territory: "Valencia",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-046",
    company_name: "BCL GROUP SL",
    wca_id: "74594",
    expires: "2026-09-11",
    contact_person: "Alfons Campinya",
    emails: ["sales@bclgroup.net"],
    country: "Spain",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-047",
    company_name: "AIRTRANSA T.A.I.R S.A.",
    wca_id: "37721",
    expires: "2026-03-08",
    contact_person: "Jorge Losada",
    emails: ["jorgel@airtransa.es"],
    country: "Spain",
    is_wca_conference: false,
    services: ["Air Freight"]
  },
  {
    id: "np-048",
    company_name: "ALTAIR CONSULTORES LOGISTICOS, S.L",
    wca_id: "118029",
    expires: "2026-02-16",
    contact_person: "Jesus Mendez",
    emails: ["pricing@altaircl.com"],
    country: "Spain",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-049",
    company_name: "LOGISFASHION FORWARDING SPAIN, SLU",
    wca_id: "139088",
    expires: "2026-06-14",
    contact_person: "Laura García",
    emails: ["lgsotillos.esp@logisfashion.com"],
    country: "Spain",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-050",
    company_name: "A.M. CARGO (GROUP)",
    wca_id: "111307",
    expires: "2026-10-12",
    contact_person: "Airam Hermogenes / Rafael Fernandez",
    emails: ["airam@amcargo.es", "rafael@amcargo.es"],
    country: "Spain",
    territory: "Valencia",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== JAPAN ==========
  {
    id: "np-051",
    company_name: "SANYO LOGISTICS INC.",
    wca_id: "108013",
    expires: "2026-03-05",
    contact_person: "Peggy Chen",
    emails: ["s.iwashima@sanyo-logi.com", "daniel@sanyo-logi.com", "export@sanyo-logi.com", "reileen@sanyo-logi.com", "y.koinuma@sanyo-logi.com"],
    country: "Japan",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-052",
    company_name: "TOP ONE EXPRESS CO., LTD.",
    wca_id: "118239",
    expires: "2026-06-08",
    contact_person: "Toshi Nagamura",
    emails: ["nagamura@toponeexpress.co.jp", "sales@toponeexpress.co.jp"],
    country: "Japan",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-053",
    company_name: "OPTEC EXPRESS INC.",
    wca_id: "120991",
    expires: "2025-12-05",
    contact_person: "Lara Luo",
    emails: ["quote@optec-exp.com.cn"],
    country: "Japan",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-054",
    company_name: "APEX INTERNATIONAL INC.",
    wca_id: "35908",
    expires: "2026-07-16",
    contact_person: "Joe Hashimoto",
    emails: ["joe@apexintl.co.jp", "steve@apexintl.co.jp", "miyama@apexintl.co.jp", "grace@apexintl.co.jp", "wca@apexintl.co.jp"],
    country: "Japan",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-055",
    company_name: "SANKYU INC",
    wca_id: "36269",
    expires: "2026-10-24",
    contact_person: "Sankyu Inc",
    emails: ["wca@sankyu.co.jp"],
    country: "Japan",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-056",
    company_name: "INTERFRACHT",
    wca_id: "124499",
    expires: "2026-07-12",
    contact_person: "Alexander Tse",
    emails: ["at@interfracht.jp"],
    country: "Japan",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-057",
    company_name: "KOBELCO LOGISTICS, LTD.",
    wca_id: "130390",
    expires: "2025-11-29",
    contact_person: "Kira",
    emails: ["logis.wca@kobelco.com"],
    country: "Japan",
    is_wca_conference: false,
    services: ["Ocean Freight"],
    notes: "FCL, RORO, BB"
  },
  {
    id: "np-058",
    company_name: "UTOC CORPORATION",
    wca_id: "113601",
    expires: "2026-02-26",
    contact_person: "",
    emails: ["utoc-nvo-sales@utoc.co.jp", "masataka.yoshida@utoc.co.jp", "yasuhiro.kamiyama@utoc.co.jp"],
    country: "Japan",
    is_wca_conference: false,
    services: ["Ocean Freight"]
  },
  {
    id: "np-059",
    company_name: "TECHNOTRANS CORPORATION",
    wca_id: "89939",
    expires: "2026-05-29",
    contact_person: "",
    emails: ["wca@techno-trans.co.jp", "hirano@techno-trans.co.jp"],
    country: "Japan",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-060",
    company_name: "AERO ENTERPRISE INC",
    wca_id: "8057",
    expires: "2026-02-06",
    contact_person: "",
    emails: ["y-suzuki@aeroenterprise.co.jp", "m-housho@aeroenterprise.co.jp"],
    country: "Japan",
    is_wca_conference: false,
    services: ["Air Freight"]
  },
  {
    id: "np-061",
    company_name: "ASIAX CO LTD",
    wca_id: "117434",
    expires: "2026-03-26",
    contact_person: "",
    emails: ["wca@asiax.jp", "honjo@asiax.jp"],
    country: "Japan",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== KOREA ==========
  {
    id: "np-062",
    company_name: "ABAD LOGISTICS CO., LTD.",
    wca_id: "101900",
    expires: "2026-02-07",
    contact_person: "Liz Roh",
    emails: ["Liz.roh@abadkr.com", "os1@abadkr.com"],
    country: "Korea",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-063",
    company_name: "HJGLS CO., LTD.",
    wca_id: "136504",
    expires: "2026-10-18",
    contact_person: "Patrick Jun",
    emails: ["PATRICK@e-hjgls.co.kr"],
    country: "Korea",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-064",
    company_name: "BEX LOGIX CO., LTD.",
    wca_id: "120271",
    expires: "2026-09-01",
    contact_person: "SJ Mun",
    emails: ["sj.mun@bexlogix.com"],
    country: "Korea",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-065",
    company_name: "BESTWAY TRANSPORT CORP",
    wca_id: "122364",
    expires: "2026-03-08",
    contact_person: "Ko Yeonju",
    emails: ["kor@bestwayex.com"],
    country: "Korea",
    is_wca_conference: true,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-066",
    company_name: "FORMAN SHIPPING CO., LTD.",
    wca_id: "59628",
    expires: "2026-07-29",
    contact_person: "Jane",
    emails: ["jane@iforman.co.kr"],
    country: "Korea",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-067",
    company_name: "OCL KOREA (ONE CIRCLE LOGISTICS CO., LTD.)",
    wca_id: "86508",
    expires: "2026-01-02",
    contact_person: "Mr. Alex Moon",
    emails: ["alex.kr@oclogis.com"],
    country: "Korea",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== MALAYSIA ==========
  {
    id: "np-068",
    company_name: "IGL WORLDWIDE SDN. BHD.",
    wca_id: "68496",
    expires: "2026-06-22",
    contact_person: "Loges",
    emails: ["loges@iglworldwide.com"],
    country: "Malaysia",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-069",
    company_name: "GLOBE RIDER LOGISTICS SDN BHD",
    wca_id: "104353",
    expires: "2026-08-16",
    contact_person: "",
    emails: ["sales@globeriderlog.com"],
    country: "Malaysia",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-070",
    company_name: "BLUE WAVE SHIPPING (M) SDN. BHD.",
    wca_id: "104300",
    expires: "2026-07-13",
    contact_person: "Sathees Kumar",
    emails: ["sm1@bluewave.com.my"],
    country: "Malaysia",
    is_wca_conference: true,
    services: ["Ocean Freight"]
  },
  {
    id: "np-071",
    company_name: "MMA FREIGHT SERVICES SDN BHD",
    wca_id: "127835",
    expires: "2026-01-05",
    contact_person: "Mr. Lim Wei Bin Baker",
    emails: ["weibin@mmafrt.com.my"],
    country: "Malaysia",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-072",
    company_name: "SEVEN SEAS LINES SDN. BHD.",
    wca_id: "135724",
    expires: "2025-11-17",
    contact_person: "Ms. Leena",
    emails: ["rleena@ssclines.com"],
    country: "Malaysia",
    is_wca_conference: false,
    services: ["Ocean Freight"]
  },

  // ========== SINGAPORE ==========
  {
    id: "np-073",
    company_name: "CARGOSAVVY PTE LTD",
    wca_id: "104628",
    expires: "2026-07-04",
    contact_person: "Esther Saalem",
    emails: ["pricing3@cargosavvy.sg"],
    country: "Singapore",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-074",
    company_name: "GFS GLOBAL FREIGHT SERVICES (S) PTE. LTD.",
    wca_id: "74678",
    expires: "2026-03-16",
    contact_person: "Jariah Mister",
    emails: ["jariahmister@gfsmanagement.com"],
    country: "Singapore",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-075",
    company_name: "EES FREIGHT SERVICES PTE LTD",
    wca_id: "8436",
    expires: "2026-08-13",
    contact_person: "Ria Alviona",
    emails: ["ria@eesfrt.com.sg"],
    country: "Singapore",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-076",
    company_name: "ASTRO EXPRESS LOGISTICS PTE. LTD",
    wca_id: "8079",
    expires: "2026-04-13",
    contact_person: "Samuel Lee",
    emails: ["samuel@astro-elogistics.com"],
    country: "Singapore",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-077",
    company_name: "AF GLOBAL LOGISTICS PTE LTD.",
    wca_id: "86397",
    expires: "2026-01-15",
    contact_person: "Wendy Tan",
    emails: ["wendy@afglog.com"],
    country: "Singapore",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-078",
    company_name: "UNION AIR FREIGHT (S) PTE. LTD.",
    wca_id: "42068",
    expires: "2026-04-25",
    contact_person: "Marilyn Lee",
    emails: ["marilynlee@uafsin.com.sg"],
    country: "Singapore",
    is_wca_conference: false,
    services: ["Air Freight"]
  },
  {
    id: "np-079",
    company_name: "TRANSWORLD GLS (SINGAPORE) PTE LTD",
    wca_id: "66484",
    expires: "2026-02-22",
    contact_person: "Lavanya",
    emails: ["lavanya@tglssin.com"],
    country: "Singapore",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-080",
    company_name: "EVO LOGISTICS PTE LTD",
    wca_id: "64524",
    expires: "2026-05-19",
    contact_person: "Dave Low",
    emails: ["dave@evologistics.com.sg"],
    country: "Singapore",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-081",
    company_name: "OCEANAIRE GLOBAL PTE. LTD.",
    wca_id: "127497",
    expires: "2026-05-19",
    contact_person: "Ms. Samantha Shee",
    emails: ["samantha@ocean-aire.com"],
    country: "Singapore",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== USA ==========
  {
    id: "np-082",
    company_name: "AIR 7 SEAS TRANSPORT LOGISTICS INC",
    wca_id: "16639",
    expires: "2026-02-14",
    contact_person: "Gary",
    emails: ["Gary@air7seas.us"],
    country: "USA",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-083",
    company_name: "COMPASS LOGISTICS, INC.",
    wca_id: "113574",
    expires: "2026-02-28",
    contact_person: "Lean Concepcion",
    emails: ["compassquotes@compass-logistics.com"],
    country: "USA",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-084",
    company_name: "SCANWELL LOGISTICS (CHI) INC.",
    wca_id: "24632",
    expires: "2025-11-28",
    contact_person: "Winnie Kong",
    emails: ["WinnieKong@scanwell.com"],
    country: "USA",
    is_wca_conference: true,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-085",
    company_name: "INTERNATIONAL LOGISTICS EXPRESS, INC.",
    wca_id: "76126",
    expires: "2026-06-27",
    contact_person: "Ms. Orit Horn",
    emails: ["orit@intl-logistics.com"],
    country: "USA",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"],
    notes: "For FCL and AIR only"
  },
  {
    id: "np-086",
    company_name: "DEL CORONA & SCARDIGLI USA INC.",
    wca_id: "77984",
    expires: "2026-10-15",
    contact_person: "Mr. Edward Ortega",
    emails: ["edward.ortega@us.dcsfreight.com"],
    country: "USA",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-087",
    company_name: "RTW LOGISTICS INC.",
    wca_id: "110766",
    expires: "2026-10-19",
    contact_person: "Sathish Kumar M",
    emails: ["sathishk@rtwlogistics.net", "lakshmis@rtwlogistics.net"],
    country: "USA",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-088",
    company_name: "DELTA EXPRESS INC.",
    wca_id: "117983",
    expires: "2026-04-29",
    contact_person: "Janvi Sharma",
    emails: ["Janvi@deltaexpressinc.com"],
    country: "USA",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-089",
    company_name: "FIRSTLIFT LOGISTICS USA, INC.",
    wca_id: "144866",
    expires: "2026-05-30",
    contact_person: "Matt Melvin",
    emails: ["matt@firstliftusa.com"],
    country: "USA",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== BRAZIL ==========
  {
    id: "np-090",
    company_name: "MARCO POLO MULTIMODAL",
    wca_id: "120032",
    expires: "2026-07-01",
    contact_person: "Brayan Lopes Madalena",
    emails: ["comercial3@marcopolomultimodal.com.br"],
    country: "Brazil",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-091",
    company_name: "AMBRA AGENCIAMENTO E LOGISTICA LTDA.",
    wca_id: "77099",
    expires: "2026-11-08",
    contact_person: "Pedro Henrique Appi",
    emails: ["pedro@ambra-curitiba.com.br"],
    country: "Brazil",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-092",
    company_name: "SAVILOG SERVICOS DE COMERCIO EXTERIOR LTDA",
    wca_id: "117959",
    expires: "2026-08-26",
    contact_person: "Julia Frerichs",
    emails: ["partners@savilog.com"],
    country: "Brazil",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== BELGIUM ==========
  {
    id: "np-093",
    company_name: "DEBEAUX TRANSIT ANTWERP",
    wca_id: "140030",
    expires: "2026-07-12",
    contact_person: "Caroline",
    emails: ["caroline.blanc@debeaux.com"],
    country: "Belgium",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== TAIWAN ==========
  {
    id: "np-094",
    company_name: "GRAND OCEAN LOGISTICS CO., LTD.",
    wca_id: "118067",
    expires: "2026-09-23",
    contact_person: "Daniel Su",
    emails: ["daniel_su@tpe.gol-group.com"],
    country: "Taiwan",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-095",
    company_name: "GLOBAL POWER LOGISTICS SERVICE INC.",
    wca_id: "132064",
    expires: "2025-11-30",
    contact_person: "Vanessa Tang",
    emails: ["vanessa.tang@tpe.global-gp.com"],
    country: "Taiwan",
    territory: "Taipei",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-096",
    company_name: "WINTOP LOGISTICS TAIWAN LTD.",
    wca_id: "119788",
    expires: "2026-09-01",
    contact_person: "Dylan Hi",
    emails: ["dylan.hi.twn@wintopww.com"],
    country: "Taiwan",
    territory: "Taipei",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== HONG KONG ==========
  {
    id: "np-097",
    company_name: "EASY SPEED INTERNATIONAL LOGISTICS LTD.",
    wca_id: "134582",
    expires: "2026-05-02",
    contact_person: "Diane Zou",
    emails: ["diane.zou@sz-ysxd.com"],
    country: "Hong Kong",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== PAKISTAN ==========
  {
    id: "np-098",
    company_name: "ACTIVE FREIGHT SERVICES (PVT) LTD",
    wca_id: "75274",
    expires: "2026-05-20",
    contact_person: "Yasir",
    emails: ["odd3@activefreightpak.com"],
    country: "Pakistan",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-099",
    company_name: "GOLD LINE SHIPPING AGENCY",
    wca_id: "146462",
    expires: "2025-11-27",
    contact_person: "Shahzad Ahmed",
    emails: ["ahmed@goldlineshippingagency.com"],
    country: "Pakistan",
    is_wca_conference: false,
    services: ["Ocean Freight"]
  },

  // ========== THAILAND ==========
  {
    id: "np-100",
    company_name: "ASL LOGISTICS CO., LTD.",
    wca_id: "119564",
    expires: "2026-11-03",
    contact_person: "Chayut",
    emails: ["chayut@asl.co.th"],
    country: "Thailand",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-101",
    company_name: "FREIGHT RANGERS CO., LTD.",
    wca_id: "96100",
    expires: "2026-05-31",
    contact_person: "Wutthinan",
    emails: ["oversea@rangers.co.th"],
    country: "Thailand",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-102",
    company_name: "MASS WORLDWIDE LOGISTICS (THAILAND) CO., LTD.",
    wca_id: "35693",
    expires: "2025-12-01",
    contact_person: "Kanokkan",
    emails: ["kanokkan@mass.co.th"],
    country: "Thailand",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-103",
    company_name: "ALLIANZ GLOBAL LOGISTICS CO., LTD.",
    wca_id: "140199",
    expires: "2026-01-26",
    contact_person: "Tanjai",
    emails: ["salesagl3@allianzlog.com"],
    country: "Thailand",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-104",
    company_name: "CROSS WORLD INTERNATIONAL CO., LTD.",
    wca_id: "53128",
    expires: "2026-03-16",
    contact_person: "Mongkol",
    emails: ["mongkol@cwi.co.th"],
    country: "Thailand",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-105",
    company_name: "K. CONNECT WORLDWIDE (THAILAND) CO., LTD.",
    wca_id: "89882",
    expires: "2026-06-27",
    contact_person: "Sirikran",
    emails: ["sirikran.pl@kconnectworldwide.com"],
    country: "Thailand",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-106",
    company_name: "SPOTI FREIGHT CO., LTD.",
    wca_id: "135239",
    expires: "2026-03-10",
    contact_person: "Rudolf Justin Benson",
    emails: ["rjbenson@spotifreight.com"],
    country: "Thailand",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== TURKEY ==========
  {
    id: "np-107",
    company_name: "INNOVA GLOBAL SISTEM DANISMANLIK LOJISTIK HIZMETLERI VE TICARET LTD. STL.",
    wca_id: "76028",
    expires: "2026-08-10",
    contact_person: "Merve",
    emails: ["merve@innovaturkey.com"],
    country: "Turkey",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-108",
    company_name: "ST GLOBAL FORWARDING & LOGISTICS SERVICES S.A.",
    wca_id: "71420",
    expires: "2026-03-25",
    contact_person: "Ms. Ilknur Alp Celik",
    emails: ["ilknur@stlojistik.com.tr"],
    country: "Turkey",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== CANADA ==========
  {
    id: "np-109",
    company_name: "A.G.O. TRANSPORTATION INC.",
    wca_id: "53215",
    expires: "2026-08-30",
    contact_person: "Celeste Hill",
    emails: ["celesteh@agotrans.com"],
    country: "Canada",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-110",
    company_name: "BNX SHIPPING TORONTO INC.",
    wca_id: "91143",
    expires: "2025-12-19",
    contact_person: "Matthew Han",
    emails: ["bnxt.export@bnxlogistics.com"],
    country: "Canada",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-111",
    company_name: "CARGODECK INC.",
    wca_id: "117519",
    expires: "2025-11-24",
    contact_person: "Karishma Dmello",
    emails: ["pricing@cargodeck.ca"],
    country: "Canada",
    is_wca_conference: true,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-112",
    company_name: "SKYFER LOGISTIC INC.",
    wca_id: "82565",
    expires: "2026-03-04",
    contact_person: "Charis Noronha",
    emails: ["charis@skyferlogistic.com"],
    country: "Canada",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-113",
    company_name: "CONNEXO GLOBAL LOGISTICS INC.",
    wca_id: "72754",
    expires: "2026-04-10",
    contact_person: "Mr. Xavier Lacroix Duperre",
    emails: ["xlduperre@connexologistics.com"],
    country: "Canada",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== KUWAIT ==========
  {
    id: "np-114",
    company_name: "BWL SHIPPING CO. W.L.L",
    wca_id: "138587",
    expires: "2026-07-20",
    contact_person: "Boby Joseph",
    emails: ["boby@bluestarlogistics.org"],
    country: "Kuwait",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== BANGLADESH ==========
  {
    id: "np-115",
    company_name: "MSA SHIPPING MALDIVES PVT. LTD.",
    wca_id: "145168",
    expires: "2026-06-03",
    contact_person: "Savinda De Silva",
    emails: ["savinda@msaaviation.com"],
    country: "Bangladesh",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-116",
    company_name: "MARVEL FREIGHT LIMITED",
    wca_id: "21256",
    expires: "2026-07-27",
    contact_person: "Md. Khorshed Alam",
    emails: ["khorshed@marvelgroupbd.com"],
    country: "Bangladesh",
    territory: "Dhaka",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== INDONESIA ==========
  {
    id: "np-117",
    company_name: "PT. GAP LOGISTICS",
    wca_id: "69292",
    expires: "2026-09-10",
    contact_person: "Devy",
    emails: ["gap-sem@gaplogistics.com"],
    country: "Indonesia",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== UNITED ARAB EMIRATES ==========
  {
    id: "np-118",
    company_name: "GLOBWIN LOGISTICS L.L.C.",
    wca_id: "146843",
    expires: "2026-11-03",
    contact_person: "Robin Marhew",
    emails: ["robin@globwinlogistics.com"],
    country: "UAE",
    territory: "Dubai",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-119",
    company_name: "ECARGOWORLD UAE",
    wca_id: "137765",
    expires: "2026-09-12",
    contact_person: "Gerhard Gotsch",
    emails: ["gerhard.gotsch@ecargoplus.com"],
    country: "UAE",
    territory: "Dubai",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },
  {
    id: "np-120",
    company_name: "GLINK FREIGHT LLC",
    wca_id: "139934",
    expires: "2026-07-10",
    contact_person: "Mr. Mizanur Rahman",
    emails: ["mizan@glink-global.com"],
    country: "UAE",
    territory: "Dubai",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== UNITED KINGDOM ==========
  {
    id: "np-121",
    company_name: "A.J. WORLDWIDE SERVICES LIMITED",
    wca_id: "85379",
    expires: "2026-08-25",
    contact_person: "Tom Harris",
    emails: ["tom@ajww.co.uk"],
    country: "United Kingdom",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== IRELAND ==========
  {
    id: "np-122",
    company_name: "KRL FORWARDING IRELAND LIMITED",
    wca_id: "103274",
    expires: "2026-08-29",
    contact_person: "Greig Allan",
    emails: ["greig.allan@kr-I.com"],
    country: "Ireland",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"]
  },

  // ========== SLOVENIA ==========
  {
    id: "np-123",
    company_name: "DALIBOR STIPANIC",
    wca_id: "132636",
    expires: "2026-02-18",
    contact_person: "Ms. Khadija Ouahraoui",
    emails: ["dalibor@seg.si"],
    country: "Slovenia",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"],
    partner_type: "international"
  },

  // ========== CO-LOADER PARTNERS (PHILIPPINES) ==========
  {
    id: "cl-001",
    company_name: "SHIPCO TRANSPORT (PHILS.) INC.",
    wca_id: "",
    expires: "",
    contact_person: "Joshua Carlo B. Garcia",
    emails: ["jgarcia@shipco.com"],
    country: "Philippines",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"],
    partner_type: "co-loader",
    phone: "+63 2 83968880 128",
    mobile: "+63 9178359465",
    website: "www.shipco.com",
    address: "6th Flr., TIM Bldg. @5600 Osmeña Hwy., Brgy. Palanan, Makati City 1235",
    notes: "Sales Executive"
  },
  {
    id: "cl-002",
    company_name: "CHARTER LINK LOGISTICS PHILIPPINES, INC.",
    wca_id: "",
    expires: "",
    contact_person: "Krista Cabadongga",
    emails: ["krista.cabadongga@charter-link.com.ph"],
    country: "Philippines",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"],
    partner_type: "co-loader",
    phone: "09-17112-0329",
    website: "www.charter-link.com.hk",
    address: "Unit 504, One Corporate Plaza Condominium Bldg., 845 A. Arnaiz Avenue, San Lorenzo 1223, Makati",
    notes: "Sales Representative"
  },
  {
    id: "cl-003",
    company_name: "GATEWAY CONTAINER LINE PHILS. INC.",
    wca_id: "",
    expires: "",
    contact_person: "Jenny V. Quito",
    emails: ["jenny@gatewaycontainerline.com.ph"],
    country: "Philippines",
    is_wca_conference: false,
    services: ["Ocean Freight"],
    partner_type: "co-loader",
    phone: "+632 8860-9702 local 4102",
    mobile: "0917.859.8556 / 0998.598.2569",
    website: "www.gatewaycontainerline.com.ph",
    address: "Unit 101 #695 Quirino Avenue Ext., Tambo, Paranaque City 1701",
    notes: "Sales Manager"
  },
  {
    id: "cl-004",
    company_name: "RTFJ MOVERS INC",
    wca_id: "",
    expires: "",
    contact_person: "Lena B. Gonzales",
    emails: ["lena@rtfjmovers.com.ph"],
    country: "Philippines",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"],
    partner_type: "co-loader",
    phone: "+63908885415 / 02899091301",
    website: "www.rtfjmovers.com.ph",
    address: "RTFJ Building L12, B10 Road, Lot 2 and Rd Lot 1, BF Homes Martinville, Brgy. Manuyo 2, Las Pinas City 1742",
    notes: "Business Development Manager"
  },
  {
    id: "cl-005",
    company_name: "TRANS-GLOBAL CONSOLIDATORS, INC",
    wca_id: "",
    expires: "",
    contact_person: "Luigi M. Sangalang",
    emails: ["lmsangalang@transglobal.com.ph"],
    country: "Philippines",
    is_wca_conference: false,
    services: ["Ocean Freight", "Air Freight"],
    partner_type: "co-loader",
    mobile: "09563085844",
    address: "PK Building Pascor Drive, Brgy. Sto Nino, Paranaque City",
    notes: "Sales Executive"
  },

  // ========== ALL-IN PARTNERS (PHILIPPINES) ==========
  {
    id: "ai-001",
    company_name: "Y.R. YMATA CUSTOMS BROKERAGE",
    wca_id: "",
    expires: "",
    contact_person: "Yman F. Ymata, LCB",
    emails: ["operations.yry@gmail.com"],
    country: "Philippines",
    is_wca_conference: false,
    services: ["Customs Brokerage"],
    partner_type: "all-in",
    phone: "(02) 7211 9300 / (02) 8254 5024",
    mobile: "+63 9270799121",
    address: "Rm. 311, 352 Peterson Bldg. T. Pinpin, Binondo, 1006 Metro Manila",
    notes: "Operations Manager"
  },
  {
    id: "ai-002",
    company_name: "CARGONECTOR PHILIPPINES INC. / G.M.A",
    wca_id: "",
    expires: "",
    contact_person: "Aaron I. Buensuceso, LCB",
    emails: ["sales01@cargonector.ph"],
    country: "Philippines",
    is_wca_conference: false,
    services: ["Customs Brokerage"],
    partner_type: "all-in",
    mobile: "+63 9076669989 / +63 9453615720",
    website: "www.cargonector.ph",
    address: "Unit 203, Intramuros Corporate Plaza Bldg. Recoletos St. Manila, Philippines 1002",
    notes: "Sales Manager"
  },
  {
    id: "ai-003",
    company_name: "SPARK-TALES CONSUMER GOODS TRADING",
    wca_id: "",
    expires: "",
    contact_person: "Boss Bhv",
    emails: ["bhy.smc@gmail.com"],
    country: "Philippines",
    is_wca_conference: false,
    services: ["Consumer Goods Trading"],
    partner_type: "all-in",
    mobile: "+639 669838467",
    address: "120 2nd flr unit 3 Giv Alejo Santos Rd. San Jose Purok Camia Plaridel Bulacan",
    notes: "Fax: 028-247-0379"
  },
  {
    id: "ai-004",
    company_name: "RAPTORS CUSTOMS BROKERAGE",
    wca_id: "",
    expires: "",
    contact_person: "Marie Rose Gocela",
    emails: ["gocelamanerose@gmail.com"],
    country: "Philippines",
    territory: "Davao City",
    is_wca_conference: false,
    services: ["Customs Brokerage"],
    partner_type: "all-in",
    phone: "(082) 236 3747",
    mobile: "+639 9275524497",
    notes: "Licensed Customs Broker"
  },
  {
    id: "ai-005",
    company_name: "BINOREZ CONSUMER GOODS TRADING",
    wca_id: "",
    expires: "",
    contact_person: "Wendel Lecen / Sir Welec",
    emails: ["lecen.wendel@gmail.com"],
    country: "Philippines",
    territory: "Cebu City",
    is_wca_conference: false,
    services: ["Consumer Goods Trading"],
    partner_type: "all-in",
    mobile: "+639 177004493",
    address: "Room 302 WDC Bldg Osmeña Blvd San Roque Cebu City"
  },
  {
    id: "ai-006",
    company_name: "WOW2 NON-SPECIALIZED WHOLESALE TRADING",
    wca_id: "",
    expires: "",
    contact_person: "Boss Kiko / Ms. Charry",
    emails: [],
    country: "Philippines",
    territory: "Muntinlupa City",
    is_wca_conference: false,
    services: ["Wholesale Trading"],
    partner_type: "all-in",
    mobile: "+639 088806976",
    address: "710-A ML Quezon St. Cupang, Muntinlupa City, 1773, Philippines"
  },
];

// Get unique countries for filtering
export const COUNTRIES = Array.from(new Set(NETWORK_PARTNERS.map(p => p.country))).sort();

// Get counts by status
export function getPartnerStats() {
  const expired = NETWORK_PARTNERS.filter(p => p.expires && isExpired(p.expires)).length;
  const expiringSoon = NETWORK_PARTNERS.filter(p => p.expires && expiresSoon(p.expires) && !isExpired(p.expires)).length;
  const active = NETWORK_PARTNERS.filter(p => !p.expires || (!isExpired(p.expires) && !expiresSoon(p.expires))).length;
  const wcaConference = NETWORK_PARTNERS.filter(p => p.is_wca_conference).length;

  return {
    total: NETWORK_PARTNERS.length,
    active,
    expired,
    expiringSoon,
    wcaConference
  };
}

// Format expiry date for display
export function formatExpiryDate(dateStr: string): string {
  if (!dateStr) return "No expiry date";
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Get days until expiry
export function getDaysUntilExpiry(dateStr: string): number {
  if (!dateStr) return 9999;
  const today = new Date('2026-01-13');
  const expiry = new Date(dateStr);
  return Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}