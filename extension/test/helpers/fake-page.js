// Pagini false pentru extractor: un document cu doar metodele pe care le folosește extract.js.

/**
 * Document fals: scripturi JSON-LD ca text, meta după proprietate, noduri după selector.
 * @param {{ ldTexts?: string[], metas?: Record<string, string>, nodes?: Record<string, object> }} [parts]
 */
export function fakeDoc({ ldTexts = [], metas = {}, nodes = {} } = {}) {
  return {
    querySelectorAll(selector) {
      return selector === 'script[type="application/ld+json"]'
        ? ldTexts.map((textContent) => ({ textContent }))
        : [];
    },
    querySelector(selector) {
      const property =
        selector === '[itemprop="price"]'
          ? "itemprop:price"
          : /^meta\[property="([^"]+)"\]$/.exec(selector)?.[1];
      if (property && property in metas) {
        return {
          getAttribute: (name) => (name === "content" ? metas[property] : null),
        };
      }
      return nodes[selector] ?? null;
    },
  };
}

/**
 * Documentul unei pagini capturate (fixtures/): blocurile JSON-LD, og:type și prețul din DOM.
 * @param {{ ldBlocks: object[], ogType?: string, domPriceText?: string }} fixture
 */
export function docFromFixture(fixture) {
  return fakeDoc({
    ldTexts: fixture.ldBlocks.map((block) => JSON.stringify(block)),
    metas: fixture.ogType ? { "og:type": fixture.ogType } : {},
    nodes: fixture.domPriceText
      ? { ".product-new-price": { textContent: fixture.domPriceText } }
      : {},
  });
}
