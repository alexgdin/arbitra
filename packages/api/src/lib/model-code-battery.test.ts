import { describe, expect, test } from "bun:test";

import { normalizeModelCode } from "./identifiers";

// Coduri de producător așa cum le arată magazinele (cu cratime, slash-uri, spații și sufixe de regiune) și
// codul de model așteptat. Scopul: o regulă prea strictă (care respinge un cod real) sau prea blândă (care
// unește produse diferite) pică aici. "20X3004DRI" și "USB3S2SAT3CB" au fost respinse de regulile
// de rezoluție și de interfață de dinainte.
const REAL_CODES: Record<string, [raw: string, code: string][]> = {
  Samsung: [
    ["MZ-V9P1T0BW", "MZV9P1T0BW"],
    ["MZ-V9P2T0BW", "MZV9P2T0BW"],
    ["MZ-V8P1T0BW", "MZV8P1T0BW"],
    ["MZ-77E500B/EU", "MZ77E500B"],
    ["MZ-77E1T0B/EU", "MZ77E1T0B"],
    ["SM-S921BZKDEUE", "SMS921BZKDEUE"],
    ["SM-S928BZKHEUE", "SMS928BZKHEUE"],
    ["SM-A546BZKCEUE", "SMA546BZKCEUE"],
    ["SM-S921B/DS", "SMS921B"],
    ["LS27AG320NUXEN", "LS27AG320NUXEN"],
    ["LF24T350FHRXEN", "LF24T350FHRXEN"],
    ["UE55CU7172UXXH", "UE55CU7172UXXH"],
    ["QE55Q60CAUXXH", "QE55Q60CAUXXH"],
  ],
  Kingston: [
    ["SA400S37/240G", "SA400S37240G"],
    ["SA400S37/480G", "SA400S37480G"],
    ["SA400S37/960G", "SA400S37960G"],
    ["KF432C16BB/8", "KF432C16BB8"],
    ["KF432C16BB/16", "KF432C16BB16"],
    ["KVR32N22S6/8", "KVR32N22S68"],
    ["KF560C40BB-16", "KF560C40BB16"],
    ["SKC3000S/1024G", "SKC3000S1024G"],
    ["SNV2S/1000G", "SNV2S1000G"],
    ["HX426C16FB3/8", "HX426C16FB38"],
    ["DT100G3/64GB", "DT100G364GB"],
  ],
  Crucial: [
    ["CT1000P3SSD8", "CT1000P3SSD8"],
    ["CT500MX500SSD1", "CT500MX500SSD1"],
    ["CT2K16G4DFRA32A", "CT2K16G4DFRA32A"],
    ["CT1000T500SSD8", "CT1000T500SSD8"],
    ["CT16G4DFRA32A", "CT16G4DFRA32A"],
    ["CT4000P3PSSD8", "CT4000P3PSSD8"],
  ],
  "Western Digital": [
    ["WDS200T4G0E", "WDS200T4G0E"],
    ["WDS100T3X0E-00AFY0", "WDS100T3X0E"],
    ["WDBYVG0010BBK-WESN", "WDBYVG0010BBK"],
    ["WDBU6Y0020BBK-WESN", "WDBU6Y0020BBK"],
    ["WD40EFPX", "WD40EFPX"],
    ["WD20EZBX", "WD20EZBX"],
    ["WDS500G3X0C-00SJG0", "WDS500G3X0C"],
    ["WD10EZEX", "WD10EZEX"],
  ],
  SanDisk: [
    ["SDSSDE61-500G-G25", "SDSSDE61500G"],
    ["SDSSDE61-1T00-G25", "SDSSDE611T00"],
    ["SDSQXAO-512G-GN6MA", "SDSQXAO512G"],
    ["SDCZ48-128G-G46", "SDCZ48128G"],
    ["SDSSDA-480G-G26", "SDSSDA480G"],
    ["SDSSDE30-1T00-G25", "SDSSDE301T00"],
    ["SDSSDH3-1T00-G26", "SDSSDH31T00"],
  ],
  Seagate: [
    ["ST1000DM010", "ST1000DM010"],
    ["ST2000DM008", "ST2000DM008"],
    ["ST4000VN006", "ST4000VN006"],
    ["ST8000VN004", "ST8000VN004"],
    ["ZP1000GM3A013", "ZP1000GM3A013"],
    ["ST2000LM015", "ST2000LM015"],
    ["STJL2000400", "STJL2000400"],
  ],
  Lenovo: [
    ["82SB00BKRM", "82SB00BKRM"],
    ["21HD0044RM", "21HD0044RM"],
    ["20XW0049RM", "20XW0049RM"],
    ["20X1S0DK00", "20X1S0DK00"],
    ["20X3004DRI", "20X3004DRI"],
    ["4X40K75064", "4X40K75064"],
  ],
  ASUS: [
    ["90NR0B91-M00A10", "90NR0B91"],
    ["90MB1CZ0-M0EAY0", "90MB1CZ0"],
    ["DUAL-RTX4060TI-O8G", "DUALRTX4060TIO8G"],
    ["TUF-RTX4070-O12G-GAMING", "TUFRTX4070O12G"],
    ["ROG-STRIX-RTX4080-O16G-GAMING", "ROGSTRIXRTX4080O16G"],
    ["PRIME B650-PLUS", "PRIMEB650"],
    ["UX3402VA-KM066W", "UX3402VA"],
    ["X515EA-BQ1222", "X515EA"],
    ["VG259QM", "VG259QM"],
    ["PA278QV", "PA278QV"],
  ],
  Gigabyte: [
    ["GV-N406TGAMING OC-16GD", "GVN406TGAMINGOC16GD"],
    ["GV-N4070WF3OC-12GD", "GVN4070WF3OC12GD"],
    ["B650M-DS3H", "B650MDS3H"],
    ["Z790 UD", "Z790UD"],
    ["GP-GSM2NE3512GNTD", "GPGSM2NE3512GNTD"],
  ],
  MSI: [
    ["912-V397-423", "912V397423"],
    ["912-V516-420", "912V516420"],
  ],
  Sony: [
    ["WH-1000XM5", "WH1000XM5"],
    ["WH1000XM5B.CE7", "WH1000XM5BCE7"],
    ["WF-1000XM5", "WF1000XM5"],
    ["KD-55X80L", "KD55X80L"],
    ["CFI-1216A", "CFI1216A"],
    ["ILCE-7M4", "ILCE7M4"],
    ["ILCE-7M4K", "ILCE7M4K"],
    ["SRS-XB13", "SRSXB13"],
    ["MDR-ZX110", "MDRZX110"],
  ],
  Apple: [
    ["MQ9X3DN/A", "MQ9X3DN"],
    ["MPXQ2FN/A", "MPXQ2FN"],
    ["MTJV3ZM/A", "MTJV3ZM"],
    ["MLY13ZD/A", "MLY13ZD"],
    ["MKGR3ZE/A", "MKGR3ZE"],
    ["MWP22ZM/A", "MWP22ZM"],
    ["MU8F2ZM/A", "MU8F2ZM"],
    ["MGN63ZE/A", "MGN63ZE"],
    ["MYD92LL/A", "MYD92LL"],
  ],
  HP: [
    ["6B2A0EA#ABB", "6B2A0EA"],
    ["J8J03AA#ABB", "J8J03AA"],
    ["4W7Y6ET#ABB", "4W7Y6ET"],
    ["CF283A", "CF283A"],
    ["CE285A", "CE285A"],
    ["W1106A", "W1106A"],
    ["L0S07AE", "L0S07AE"],
  ],
  Dell: [
    ["210-BGJN", "210BGJN"],
    ["450-AGJO", "450AGJO"],
    ["S2721DGF", "S2721DGF"],
    ["XPS 9530", "XPS9530"],
    ["XPS9530-7098SLV-PUS", "XPS9530"],
  ],
  "TP-Link": [
    ["TL-WR841N(EU)", "TLWR841N"],
    ["TL-WR841N", "TLWR841N"],
    ["ARCHER-AX73", "ARCHERAX73"],
    ["Archer AX55", "ARCHERAX55"],
    ["TL-SG108", "TLSG108"],
    ["TL-SG1016D", "TLSG1016D"],
    ["TL-WN722N", "TLWN722N"],
    ["RE505X", "RE505X"],
  ],
  Corsair: [
    ["CMK16GX4M2B3200C16", "CMK16GX4M2B3200C16"],
    ["CMW32GX4M2E3200C16", "CMW32GX4M2E3200C16"],
    ["CP-9020199-EU", "CP9020199"],
    ["CH-9109011-EU", "CH9109011"],
    ["CC-9011136-WW", "CC9011136"],
    ["CMH32GX5M2B5600C36", "CMH32GX5M2B5600C36"],
  ],
  Intel: [
    ["BX8071513600K", "BX8071513600K"],
    ["BX8071514700K", "BX8071514700K"],
    ["CM8071504820705", "CM8071504820705"],
    ["BX8070110400F", "BX8070110400F"],
    ["BX80684I78700K", "BX80684I78700K"],
    ["SSDPEKNW010T8X1", "SSDPEKNW010T8X1"],
    ["SSDSC2KB480G8", "SSDSC2KB480G8"],
  ],
  AMD: [
    ["100-100000593WOF", "100100000593WOF"],
    ["100-100000063BOX", "100100000063BOX"],
    ["100-100000065BOX", "100100000065BOX"],
    ["YD170XBCAEWOF", "YD170XBCAEWOF"],
  ],
  "StarTech and LG": [
    ["USB3S2SAT3CB", "USB3S2SAT3CB"],
    ["HDMI2VGAE", "HDMI2VGAE"],
    ["SATA2IDE", "SATA2IDE"],
    ["27GP850-B", "27GP850"],
    ["OLED55C34LA", "OLED55C34LA"],
  ],
};

const ALL_CODES = Object.values(REAL_CODES).flat();

// Variante ale aceluiași model care trebuie să rămână produse diferite (capacitate, memorie video, model).
const MUST_STAY_DISTINCT: string[][] = [
  ["SDSSDE61-500G-G25", "SDSSDE61-1T00-G25", "SDSSDE61-2T00-G25"],
  ["SA400S37/240G", "SA400S37/480G", "SA400S37/960G"],
  ["KF432C16BB/8", "KF432C16BB/16"],
  ["WDS100T4G0E", "WDS200T4G0E"],
  ["DUAL-RTX4060TI-O8G", "DUAL-RTX4060TI-O16G"],
  ["DUAL-RTX3050-O6G", "DUAL-RTX3050-O8G"],
  ["GV-N406TGAMING OC-8GD", "GV-N406TGAMING OC-16GD"],
  ["TUF-RTX4070-O12G-GAMING", "TUF-RTX4070-O8G-GAMING"],
  ["ST1000DM010", "ST2000DM008"],
  ["MZ-V9P1T0BW", "MZ-V9P2T0BW"],
  ["SM-S921BZKDEUE", "SM-S928BZKHEUE"],
  ["MQ9X3DN/A", "MPXQ2FN/A"],
  ["ILCE-7M4", "ILCE-7M4K"],
  ["CT1000P3SSD8", "CT4000P3PSSD8"],
  ["BX8071513600K", "BX8071514700K"],
  ["20X1S0DK00", "20X3004DRI"],
  ["SDSSDE61 (500G)", "SDSSDE61 (1T00)"],
];

// Același model scris cu sufix de regiune sau de ambalaj diferit: e același produs, deci același cod.
const MUST_MERGE: string[][] = [
  ["MZ-77E500B/EU", "MZ-77E500B/AM", "MZ-77E500B"],
  ["WDS100T3X0E-00AFY0", "WDS100T3X0E-00AFZ0", "WDS100T3X0E"],
  ["TL-WR841N(EU)", "TL-WR841N (EU)", "TL-WR841N", "tl-wr841n"],
  ["MQ9X3DN/A", "MQ9X3DN"],
  ["SDSSDE61-500G-G25", "SDSSDE61-500G-GN25", "SDSSDE61-500G"],
  ["WH-1000XM5", "WH1000XM5", "wh-1000xm5", "Cod produs: WH-1000XM5"],
  ["CP-9020199-EU", "CP-9020199-NA", "CP-9020199"],
  ["6B2A0EA#ABB", "6B2A0EA#AKD", "6B2A0EA"],
  ["WDS200T4G0E", "WDS200T4G0E (EU)", "Part Number: WDS200T4G0E"],
];

describe("realistic manufacturer part numbers", () => {
  test("the battery has at least 60 codes from every manufacturer asked for", () => {
    expect(ALL_CODES.length).toBeGreaterThanOrEqual(60);
    expect(Object.keys(REAL_CODES)).toEqual(
      expect.arrayContaining([
        "Samsung",
        "Kingston",
        "Crucial",
        "Western Digital",
        "SanDisk",
        "Seagate",
        "Lenovo",
        "ASUS",
        "Gigabyte",
        "MSI",
        "Sony",
        "Apple",
        "HP",
        "Dell",
        "TP-Link",
        "Corsair",
        "Intel",
        "AMD",
      ])
    );
  });

  for (const [brand, codes] of Object.entries(REAL_CODES)) {
    describe(brand, () => {
      for (const [raw, code] of codes) {
        test(`${raw} -> ${code}`, () => {
          expect(normalizeModelCode(raw)).toBe(code);
        });
      }
    });
  }

  test("a stored code is not rejected or changed when it is normalized again", () => {
    for (const [, code] of ALL_CODES) {
      expect(normalizeModelCode(code)).toBe(code);
    }
  });

  test("keeps variants of one model as different products", () => {
    for (const group of MUST_STAY_DISTINCT) {
      const codes = group.map((raw) => normalizeModelCode(raw));

      expect(codes.every((code) => code !== null)).toBe(true);
      expect(new Set(codes).size).toBe(group.length);
    }
  });

  test("gives one product to the spellings of the same model", () => {
    for (const group of MUST_MERGE) {
      const codes = new Set(group.map((raw) => normalizeModelCode(raw)));

      expect(codes.size).toBe(1);
      expect(codes.has(null)).toBe(false);
    }
  });

  // Limită cunoscută: un cod doar din cifre nu leagă produse (poate fi un număr intern al magazinului sau un
  // substituent), deci codurile Logitech ("910-005401") și cele AMD fără litere nu se potrivesc după cod de model.
  // Produsele se leagă oricum după EAN. Testul fixează comportamentul, ca o schimbare să fie deliberată.
  test("does not match purely numeric part numbers, by design", () => {
    for (const raw of ["910-005401", "920-009472", "960-001105", "100-000000065"]) {
      expect(normalizeModelCode(raw)).toBeNull();
    }
  });
});
