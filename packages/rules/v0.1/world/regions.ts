/** One playable market per continent. Null means this map selection has no reference slot count. */
export const regions = {
  na: {
    name: "北美", center: [-97, 38],
    slots: {
      ABW: 1, AIA: null, ATG: 1, BHS: 1, BLM: null, BLZ: 1, BMU: 1, BRB: 1,
      CAN: 2, CRI: 1, CUB: 2, CUW: 1, CYM: 1, DMA: 1, DOM: 2, GRD: 1,
      GRL: 1, GTM: 2, HND: 2, HTI: 2, JAM: 1, KNA: 1, LCA: 1, MAF: 1,
      MEX: 2, MSR: null, NIC: 1, PAN: 1, PRI: 1, SLV: 1, SPM: null, SXM: 1,
      TCA: 1, TTO: 1, USA: 5, VCT: 1, VGB: 1, VIR: 1,
    },
  },
  sam: {
    name: "南美", center: [-60, -15],
    slots: {
      ARG: 2, BOL: 2, BRA: 3, CHL: 2, COL: 2, ECU: 2, FLK: null, GUY: 1,
      PER: 2, PRY: 2, SGS: null, SUR: 1, URY: 1, VEN: 2,
    },
  },
  eu: {
    name: "欧洲", center: [12, 51],
    slots: {
      ALB: 1, ALD: null, AND: 1, AUT: 2, BEL: 2, BGR: 2, BIH: 1, BLR: 2,
      CHE: 2, CZE: 2, DEU: 2, DNK: 2, ESP: 2, EST: 1, FIN: 2, FRA: 2,
      FRO: 1, GBR: 2, GGY: null, GRC: 2, HRV: 1, HUN: 2, IMN: 1, IRL: 3,
      ISL: 1, ITA: 2, JEY: null, KOS: 1, LIE: 1, LTU: 1, LUX: 1, LVA: 1,
      MCO: 1, MDA: 1, MKD: 1, MLT: 1, MNE: 1, NLD: 2, NOR: 2, POL: 2,
      PRT: 2, ROU: 2, SMR: 1, SRB: 2, SVK: 1, SVN: 1, SWE: 2, UKR: 2,
      VAT: null,
    },
  },
  as: {
    name: "亚洲", center: [89, 36],
    slots: {
      AFG: 2, ARE: 2, ARM: 1, AZE: 2, BGD: 2, BHR: 1, BRN: 1, BTN: 1,
      CHN: 8, CYN: null, CYP: 1, GEO: 1, HKG: 2, IDN: 4, IND: 7, IOT: null,
      IRN: 2, IRQ: 2, ISR: 2, JOR: 2, JPN: 2, KAS: null, KAZ: 2, KGZ: 2,
      KHM: 2, KOR: 2, KWT: 1, LAO: 2, LBN: 1, LKA: 2, MAC: 1, MDV: 1,
      MMR: 2, MNG: 1, MYS: 2, NPL: 2, OMN: 2, PAK: 3, PHL: 2, PRK: 2,
      PSX: 1, QAT: 1, RUS: 3, SAU: 2, SGP: 3, SYR: 2, THA: 2, TJK: 2,
      TKM: 2, TLS: 1, TUR: 2, UZB: 2, VNM: 2, YEM: 2,
    },
  },
  af: {
    name: "非洲", center: [21, 1],
    slots: {
      AGO: 2, ATF: null, BDI: 1, BEN: 1, BFA: 2, BWA: 1, CAF: 1, CIV: 2,
      CMR: 2, COD: 2, COG: 1, COM: 1, CPV: 1, DJI: 1, DZA: 2, EGY: 2,
      ERI: 1, ETH: 2, GAB: 1, GHA: 2, GIN: 1, GMB: 1, GNB: 1, GNQ: 1,
      KEN: 2, LBR: 1, LBY: 2, LSO: 1, MAR: 2, MDG: 2, MLI: 2, MOZ: 2,
      MRT: 1, MUS: 1, MWI: 1, NAM: 1, NER: 1, NGA: 2, RWA: 1, SAH: null,
      SDN: 2, SDS: 2, SEN: 2, SHN: null, SLE: 1, SOL: null, SOM: 2, STP: 1,
      SWZ: 1, SYC: 1, TCD: 1, TGO: 1, TUN: 2, TZA: 2, UGA: 1, ZAF: 2,
      ZMB: 1, ZWE: 2,
    },
  },
  oc: {
    name: "大洋洲", center: [143, -23],
    slots: {
      ASM: 1, ATC: null, AUS: 2, COK: null, FJI: 1, FSM: 1, GUM: 1, HMD: null,
      IOA: null, KIR: 1, MHL: 1, MNP: 1, NCL: 1, NFK: null, NIU: null, NRU: 1,
      NZL: 1, PCN: null, PLW: 1, PNG: 1, PYF: 1, SLB: 1, TON: 1, TUV: 1,
      VUT: 1, WLF: null, WSM: 1,
    },
  },
} as const satisfies Record<string, { name: string; center: readonly [number, number]; slots: Record<string, number | null> }>

export type RegionId = keyof typeof regions
export const regionIds = Object.keys(regions) as RegionId[]

export function regionOfCountry(countryId: string): RegionId | undefined {
  return regionIds.find(id => Object.hasOwn(regions[id].slots, countryId))
}

export function regionCapacity(id: RegionId) {
  return Object.values(regions[id].slots).reduce<number>((sum, slots) => sum + (slots ?? 0), 0)
}
