import { getStoreConfig, shippingCost } from "./store-config";
import type { StoreConfig } from "./store-config";

// Toate sumele sunt în bani (129.99 RON = 12999). Funcții pure, fără acces la DB.

export type OptimizerOffer = {
  productId: string;
  store: string;
  unitPrice: number;
  title: string;
  url: string;
  imageUrl: string | null;
};

export type OptimizerItem = {
  productId: string;
  title: string;
  quantity: number;
  // Ofertele în stoc, cu preț, pentru același EAN (sau produsul însuși fără EAN).
  offers: OptimizerOffer[];
};

export type OptimizedLine = {
  // Cheia articolului din coș; title, url și imageUrl vin de la oferta aleasă.
  productId: string;
  title: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  url: string;
  imageUrl: string | null;
};

export type StorePlan = {
  store: string;
  lines: OptimizedLine[];
  subtotal: number;
  shipping: number;
  // Bani lipsă până la transportul gratuit; 0 dacă e deja gratuit sau nu există prag.
  freeShippingRemaining: number;
  total: number;
};

export type UnavailableItem = {
  productId: string;
  title: string;
  quantity: number;
};

export type SingleStoreOption = {
  store: string;
  // Null când magazinul nu poate livra toate articolele disponibile.
  total: number | null;
  missing: number;
};

export type CartOptimization = {
  currency: string;
  plan: StorePlan[];
  unavailable: UnavailableItem[];
  singleStoreOptions: SingleStoreOption[];
  totals: {
    optimized: number;
    bestSingleStore: { store: string; total: number } | null;
    naiveCheapest: number;
    savingsVsSingleStore: number;
    savingsVsNaive: number;
  };
  method: "exhaustive" | "heuristic";
};

export type OptimizeOptions = {
  nodeLimit?: number;
};

const MAX_EXHAUSTIVE_ITEMS = 12;
const DEFAULT_NODE_LIMIT = 2_000_000;
// Numărul de magazine din problemă crește căutarea și memoria. Apelantul trimite doar magazinele cunoscute
// (3 acum), deci peste această limită înseamnă un filtru uitat: se aruncă eroare, nu se rezolvă problema.
const MAX_STORES = 8;

type Problem = {
  // Alfabetic: indicele unui magazin rezolvă egalitățile în mod determinist.
  stores: string[];
  configs: StoreConfig[];
  sources: OptimizerItem[];
  // [articol][magazin]
  offers: (OptimizerOffer | undefined)[][];
  // [articol][magazin]: cantitate * preț unitar, Infinity unde nu există ofertă.
  lines: number[][];
  offered: number[][];
};

// assignment[i] = indicele magazinului ales pentru articolul i.
type Solution = {
  assignment: number[];
  total: number;
  used: number[];
};

function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

function compareLists(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return a.length - b.length;
}

function cell(
  matrix: readonly (readonly number[])[],
  row: number,
  column: number
): number {
  return matrix[row]?.[column] ?? 0;
}

// Cea mai ieftină ofertă a fiecărui magazin; la egalitate, id-ul produsului decide.
function cheapestByStore(
  offers: readonly OptimizerOffer[]
): Map<string, OptimizerOffer> {
  const byStore = new Map<string, OptimizerOffer>();
  for (const offer of offers) {
    const current = byStore.get(offer.store);
    const cheaper =
      !current ||
      offer.unitPrice < current.unitPrice ||
      (offer.unitPrice === current.unitPrice &&
        offer.productId < current.productId);
    if (cheaper) {
      byStore.set(offer.store, offer);
    }
  }
  return byStore;
}

function buildProblem(items: readonly OptimizerItem[]): {
  problem: Problem;
  unavailable: UnavailableItem[];
} {
  const unavailable: UnavailableItem[] = [];
  const available: { source: OptimizerItem; byStore: Map<string, OptimizerOffer> }[] =
    [];

  for (const source of items) {
    const byStore = cheapestByStore(source.offers);
    if (byStore.size === 0) {
      unavailable.push({
        productId: source.productId,
        title: source.title,
        quantity: source.quantity,
      });
    } else {
      available.push({ source, byStore });
    }
  }

  const stores = [
    ...new Set(available.flatMap(({ byStore }) => [...byStore.keys()])),
  ].toSorted(compareText);
  if (stores.length > MAX_STORES) {
    throw new RangeError(
      `Cart optimization supports at most ${MAX_STORES} stores, got ${stores.length}`
    );
  }

  const offers = available.map(({ byStore }) =>
    stores.map((store) => byStore.get(store))
  );
  const lines = available.map(({ source }, i) =>
    stores.map((_, s) => {
      const offer = offers[i]?.[s];
      return offer ? offer.unitPrice * source.quantity : Number.POSITIVE_INFINITY;
    })
  );
  const offered = lines.map((row) =>
    row.flatMap((line, s) => (Number.isFinite(line) ? [s] : []))
  );

  return {
    problem: {
      stores,
      configs: stores.map(getStoreConfig),
      sources: available.map(({ source }) => source),
      offers,
      lines,
      offered,
    },
    unavailable,
  };
}

function evaluate(problem: Problem, assignment: readonly number[]): Solution {
  const subtotals = problem.stores.map(() => 0);
  const counts = problem.stores.map(() => 0);

  problem.sources.forEach((_, i) => {
    const s = assignment[i] ?? 0;
    subtotals[s] = (subtotals[s] ?? 0) + cell(problem.lines, i, s);
    counts[s] = (counts[s] ?? 0) + 1;
  });

  let total = 0;
  const used: number[] = [];
  problem.configs.forEach((config, s) => {
    if ((counts[s] ?? 0) === 0) {
      return;
    }
    const subtotal = subtotals[s] ?? 0;
    used.push(s);
    total += subtotal + shippingCost(config, subtotal);
  });

  return { assignment: [...assignment], total, used };
}

// Mai bun = total mai mic, apoi mai puține magazine, apoi magazine în ordine
// alfabetică, apoi atribuirea articolelor în ordinea din coș.
function compareSolutions(a: Solution, b: Solution): number {
  if (a.total !== b.total) {
    return a.total - b.total;
  }
  if (a.used.length !== b.used.length) {
    return a.used.length - b.used.length;
  }
  return (
    compareLists(a.used, b.used) || compareLists(a.assignment, b.assignment)
  );
}

// Fiecare articol la cel mai mic preț; egalitățile merg la primul magazin alfabetic.
function greedyAssignment(problem: Problem): number[] {
  return problem.lines.map((row) => row.indexOf(Math.min(...row)));
}

// Mută un articol sau o pereche de articole în alt magazin cât timp totalul
// (sau departajarea) se îmbunătățește. Perechile prind cazurile în care două
// articole mutate împreună trec de pragul de transport gratuit.
function improve(problem: Problem, start: readonly number[]): Solution {
  let current = evaluate(problem, start);
  const count = problem.sources.length;

  const tryMoves = (moves: readonly [number, number][]): boolean => {
    const assignment = [...current.assignment];
    for (const [item, store] of moves) {
      assignment[item] = store;
    }
    const candidate = evaluate(problem, assignment);
    if (compareSolutions(candidate, current) >= 0) {
      return false;
    }
    current = candidate;
    return true;
  };

  const singleMoves = (): boolean => {
    let improved = false;
    for (let i = 0; i < count; i += 1) {
      for (const s of problem.offered[i] ?? []) {
        if (s !== current.assignment[i] && tryMoves([[i, s]])) {
          improved = true;
        }
      }
    }
    return improved;
  };

  const movePair = (i: number, j: number): boolean => {
    let improved = false;
    for (const si of problem.offered[i] ?? []) {
      for (const sj of problem.offered[j] ?? []) {
        const bothMove =
          si !== current.assignment[i] && sj !== current.assignment[j];
        if (bothMove && tryMoves([[i, si], [j, sj]])) {
          improved = true;
        }
      }
    }
    return improved;
  };

  const pairMoves = (): boolean => {
    let improved = false;
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        improved = movePair(i, j) || improved;
      }
    }
    return improved;
  };

  let improved = true;
  while (improved) {
    improved = singleMoves() || pairMoves();
  }
  return current;
}

// Pornește din cumpărarea "la cel mai mic preț" și din fiecare consolidare
// într-un singur magazin, apoi păstrează cea mai bună soluție locală.
function heuristicSolution(problem: Problem): Solution {
  const greedy = greedyAssignment(problem);
  const starts = [
    greedy,
    ...problem.stores.map((_, store) =>
      greedy.map((cheapest, i) =>
        problem.offered[i]?.includes(store) ? store : cheapest
      )
    ),
  ];

  return starts
    .map((start) => improve(problem, start))
    .reduce((best, candidate) =>
      compareSolutions(candidate, best) < 0 ? candidate : best
    );
}

// Branch and bound. Limita inferioară ignoră transportul, cu o excepție sigură:
// un magazin deja folosit care nu mai poate atinge pragul plătește sigur transportul.
function exhaustiveSearch(
  problem: Problem,
  seed: Solution,
  nodeLimit: number
): { best: Solution; complete: boolean } {
  const storeCount = problem.stores.length;
  const minLines = problem.lines.map((row) => Math.min(...row));
  const order = problem.sources
    .map((_, i) => i)
    .toSorted((a, b) => (minLines[b] ?? 0) - (minLines[a] ?? 0) || a - b);
  const depth = order.length;

  const candidates = order.map((item) =>
    (problem.offered[item] ?? []).toSorted(
      (a, b) =>
        cell(problem.lines, item, a) - cell(problem.lines, item, b) || a - b
    )
  );

  // suffixMin[k]: cel mai mic cost al articolelor k.. ; suffixReach[k][s]: cât ar
  // putea adăuga în magazinul s articolele k..
  const suffixMin = new Array<number>(depth + 1).fill(0);
  const suffixReach = Array.from({ length: depth + 1 }, () =>
    new Array<number>(storeCount).fill(0)
  );
  for (let k = depth - 1; k >= 0; k -= 1) {
    const item = order[k] ?? 0;
    suffixMin[k] = (suffixMin[k + 1] ?? 0) + (minLines[item] ?? 0);
    suffixReach[k] = problem.stores.map((_, s) => {
      const line = cell(problem.lines, item, s);
      return cell(suffixReach, k + 1, s) + (Number.isFinite(line) ? line : 0);
    });
  }

  const subtotals = new Array<number>(storeCount).fill(0);
  const counts = new Array<number>(storeCount).fill(0);
  const assignment = new Array<number>(problem.sources.length).fill(0);
  let best = seed;
  let nodes = 0;
  let complete = true;

  const lowerBound = (k: number, placed: number): number => {
    let bound = placed + (suffixMin[k] ?? 0);
    problem.configs.forEach((config, s) => {
      if ((counts[s] ?? 0) === 0) {
        return;
      }
      const reachable = (subtotals[s] ?? 0) + cell(suffixReach, k, s);
      if (
        config.freeShippingOver === null ||
        reachable < config.freeShippingOver
      ) {
        bound += config.shipping;
      }
    });
    return bound;
  };

  const visit = (k: number, placed: number): void => {
    nodes += 1;
    if (nodes > nodeLimit) {
      complete = false;
      return;
    }
    // Strict mai mare: egalitățile rămân în joc pentru departajare.
    if (lowerBound(k, placed) > best.total) {
      return;
    }
    if (k === depth) {
      const candidate = evaluate(problem, assignment);
      if (compareSolutions(candidate, best) < 0) {
        best = candidate;
      }
      return;
    }

    const item = order[k] ?? 0;
    for (const s of candidates[k] ?? []) {
      const line = cell(problem.lines, item, s);
      subtotals[s] = (subtotals[s] ?? 0) + line;
      counts[s] = (counts[s] ?? 0) + 1;
      assignment[item] = s;
      visit(k + 1, placed + line);
      subtotals[s] = (subtotals[s] ?? 0) - line;
      counts[s] = (counts[s] ?? 0) - 1;
      if (!complete) {
        return;
      }
    }
  };

  visit(0, 0);
  return { best, complete };
}

function buildPlan(problem: Problem, solution: Solution): StorePlan[] {
  const plan: StorePlan[] = [];

  problem.stores.forEach((store, s) => {
    const lines: OptimizedLine[] = [];
    problem.sources.forEach((source, i) => {
      const offer = problem.offers[i]?.[s];
      if (solution.assignment[i] !== s || !offer) {
        return;
      }
      lines.push({
        productId: source.productId,
        title: offer.title,
        quantity: source.quantity,
        unitPrice: offer.unitPrice,
        lineTotal: offer.unitPrice * source.quantity,
        url: offer.url,
        imageUrl: offer.imageUrl,
      });
    });
    if (lines.length === 0) {
      return;
    }

    const config = problem.configs[s] ?? getStoreConfig(store);
    const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const shipping = shippingCost(config, subtotal);
    plan.push({
      store,
      lines,
      subtotal,
      shipping,
      freeShippingRemaining:
        config.freeShippingOver !== null && subtotal < config.freeShippingOver
          ? config.freeShippingOver - subtotal
          : 0,
      total: subtotal + shipping,
    });
  });

  return plan.toSorted(
    (a, b) => b.total - a.total || compareText(a.store, b.store)
  );
}

function singleStoreOptions(problem: Problem): SingleStoreOption[] {
  return problem.stores
    .map((store, s): SingleStoreOption => {
      const missing = problem.offered.filter(
        (stores) => !stores.includes(s)
      ).length;
      if (missing > 0) {
        return { store, total: null, missing };
      }
      const subtotal = problem.lines.reduce(
        (sum, _, i) => sum + cell(problem.lines, i, s),
        0
      );
      const config = problem.configs[s] ?? getStoreConfig(store);
      return { store, total: subtotal + shippingCost(config, subtotal), missing };
    })
    .toSorted((a, b) => {
      if (a.total !== null && b.total !== null && a.total !== b.total) {
        return a.total - b.total;
      }
      if ((a.total === null) !== (b.total === null)) {
        return a.total === null ? 1 : -1;
      }
      return a.missing - b.missing || compareText(a.store, b.store);
    });
}

export function optimizeCart(
  items: readonly OptimizerItem[],
  currency: string,
  { nodeLimit = DEFAULT_NODE_LIMIT }: OptimizeOptions = {}
): CartOptimization {
  const { problem, unavailable } = buildProblem(items);

  if (problem.sources.length === 0) {
    return {
      currency,
      plan: [],
      unavailable,
      singleStoreOptions: [],
      totals: {
        optimized: 0,
        bestSingleStore: null,
        naiveCheapest: 0,
        savingsVsSingleStore: 0,
        savingsVsNaive: 0,
      },
      method: "exhaustive",
    };
  }

  let solution = heuristicSolution(problem);
  let method: CartOptimization["method"] = "heuristic";
  if (problem.sources.length <= MAX_EXHAUSTIVE_ITEMS) {
    const search = exhaustiveSearch(problem, solution, nodeLimit);
    solution = search.best;
    method = search.complete ? "exhaustive" : "heuristic";
  }

  const plan = buildPlan(problem, solution);
  const optimized = plan.reduce((sum, store) => sum + store.total, 0);
  const singleStore = singleStoreOptions(problem);
  const bestOption = singleStore.find((option) => option.total !== null);
  const bestSingleStore =
    bestOption && bestOption.total !== null
      ? { store: bestOption.store, total: bestOption.total }
      : null;
  const naiveCheapest = evaluate(problem, greedyAssignment(problem)).total;

  return {
    currency,
    plan,
    unavailable,
    singleStoreOptions: singleStore,
    totals: {
      optimized,
      bestSingleStore,
      naiveCheapest,
      savingsVsSingleStore: bestSingleStore
        ? Math.max(0, bestSingleStore.total - optimized)
        : 0,
      savingsVsNaive: Math.max(0, naiveCheapest - optimized),
    },
    method,
  };
}
