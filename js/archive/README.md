# Archived ship models (not loaded by the page)

Kept for later use in other ways. Same conventions as `js/voyage-boat.js` (see its header), same particle-system contract, and they still run in node.

- `voyage-boat-machine-age-foiler.js`: skiff, sloop, schooner, clipper, **paddle steamer** (spoked wheels that turn with the water, sponsons, raked funnel), **ocean liner** (three tiers of decks with lit windows, portholes, three funnels, lifeboats in davits, an aerial), **foiling catamaran** (two hulls flying on T-foils, rigid wing and jib, trampoline), rocket. Includes the hosting machinery (SUPER / SPAR_HOST / RIG_HOST) and the funnel smoke / paddle-wheel exports the layer once read (SMOKE, FUNNELS, PADDLE_R).
- `voyage-boat-machine-age-container.js`: the same lineage with the **container ship** (eight bays of stacked containers, bridge and funnel aft) in the foiler's place, plus the anchor.

The current `js/voyage-boat.js` is the sailing-only lineage ending in the DynaRig yacht.
