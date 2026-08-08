# HFS v3 — a haplotype-frequency model rebuilt on the lab's own per-region observations

*Companion to the 研究指引 pages `site/sr1.html` (上篇) and `site/sr2.html` (下篇).
Revision after re-reading 廖子游's thesis-defence deck (2026-07-30). The deck is an ongoing
engineering effort, not a finished study, but its per-region data invalidates one core assumption of
v2 and relocates another. This document says what changed and why.*

Scope note: **haplotype only.** Methylation appears once, in §9.4, as a limitation on how a topology
node should be read. It is not part of the model here.

---

## 0. The one-line summary of what changed

v2 treated a unit's data as a multinomial over the 2^k configurations, and made the
**within-lineage frequency ϱ** the object binned into a genome-wide spectrum.

The deck's real state table shows that is not what the data looks like. In the worked example
(HCC1395_HKU, chr12:981,725–1,021,146, HP1, k = 3, 194 reads):

```
覆蓋 3 個位點的 read:    3   ( 1.5%)
覆蓋 2 個位點的 read:   31   (16.0%)
覆蓋 1 個位點的 read:  160   (82.5%)
```

**82.5 % of reads see exactly one of the three sites.** A multinomial over 2^k is the wrong
likelihood, and ϱ is not estimable per unit at anything like the precision v2 assumed.

The correction, and the whole of v3:

> **A unit is not one joint sample. It is a set of *pairwise spanning sub-samples*, one per site
> pair, with wildly unequal sizes — and the topology is assembled from those pairwise calls.**
> Frequency does not disappear; it moves from being the *binned object* to being the *likelihood
> that ranks candidate topologies*, which is where the deck already puts read-AF and where the
> purity-cancellation result of v2 actually earns its keep.

---

## 1. What the deck's data shows

Five facts, each of which constrains the model.

### 1.1 The effective sample size is per site pair, not per unit

Decomposing the same 194-read table by which pairs each read spans:

| pair | spanning reads | observed patterns | what it decides |
|---|---:|---|---|
| S1 × S2 | **17** (8.8 %) | `RA` 12, `AR` 5, no `AA` | fork — S1 and S2 in disjoint lineages |
| S2 × S3 | **20** (10.3 %) | `AA` 6, `AR` 9, `RR` 5 | chain — S3 arose inside S2's lineage |
| S1 × S3 | **3** (1.5 %) | `RR` 3 | nothing |

The reconstructed topology in the deck — `000 →+S2→ 010 →+S3→ 011` with `000 →+S1→ 100` branching
off — is exactly what these three sub-samples say. So the tree rests on **n = 17 and n = 20**, and
one of its three pairwise relations (S1 × S3) is decided by **no data at all**.

That last point is the important one, and it is a defect in the current pipeline, not a limitation of
the biology — see §3.2.

### 1.2 The window is far wider than a read

That window is **39.4 kb**, roughly twice a typical ONT read span. Widening the window is what
creates the partial-coverage regime in §0. It is also what makes the unit count large: the deck
reports **85,941** mutation-containing units across 7 datasets / 6 samples / chr1–22.

v2's Poisson estimate (§12 of that document) predicted a few hundred to ~20,000 same-family units.
The empirical count is far higher because windows are cut around mutation clusters rather than capped
at the read span. **This is a knob, and it is a trade-off I did not model** — see §6.

### 1.3 The genome-wide output already exists, and it is a topology-class distribution

The deck classifies every unit into four topology shapes plus *unresolved*, and reports the
distribution per sample (n = 4,245 – 23,128 per dataset):

| class | observed range |
|---|---|
| unbranched single-layer (clone ≥ 1) | 19.5 % – 46.8 % |
| **unbranched multistep** (clone ≥ 1, subclone ≥ 1) | **38.1 % – 53.3 %** — modal in 6 of 7 datasets |
| branched single-layer (clone ≥ 2) | ~5.5 % – 10.6 % |
| branched multistep (clone ≥ 2, subclone ≥ 1) | ~6.8 % – 13.8 % |
| unresolved | up to 21.8 % (H2009), 13.8 % (H1437), 11.0 % (COLO829) |

**This is already a genome-wide haplotype-resolved spectrum.** v3 should build on it rather than
propose a different one. §5 does.

### 1.4 It is reproducible, which is the strongest result in the deck

Pairwise similarity of topology-class composition:

- HCC1395_HKU vs HCC1395_NYGC: **0.909** — same cell line, different centre, different basecaller
- breast vs breast (HCC1395 / 1937 / 1954): 0.839 – 0.901
- lung vs lung (H1437 vs H2009): 0.861
- across cancer types: 0.590 – 0.776

A statistic that survives a basecaller change at 0.909 while separating cancer types at 0.6–0.78 is
carrying real signal. **Any redesign that throws this away is a regression.**

### 1.5 Uncertainty is already reported honestly

75,224 of 85,941 units (**87.53 %**) had their candidate tree set fully enumerated; the rest are
reported as unresolved rather than forced to a single answer. The deck states the policy explicitly:
keep the minimum-cost candidates, rank by read-AF, and *if the top score ties, keep all of them*.

That is the "report a set, not a tree" discipline v2 proposed in its §9.2 and §10. **It already
exists.** v3 must credit it and stop claiming it as new.

> **Bookkeeping item to reconcile.** The per-dataset n in the class table sum to 71,955, against
> 85,941 units quoted in the conclusion. The two are probably counting different things (all
> mutation-containing units vs units surviving some filter). Worth pinning down before either number
> goes into a manuscript.

---

## 2. The corrected data model

### 2.1 Observation

Unit `u = (chrom, PS, window, HP family)` — unchanged from v2, and matching the deck (slide "區域形成
與單倍型家族分組": windows within one PS, then split by HP family).

For each read `r` in the unit:

- a **coverage set** `O_r ⊆ {1..k}` — the sites it actually spans
- an **allele vector** on `O_r` only

Group reads by coverage set. The unit's datum is

```
{ (O, n_O(x)) : O ⊆ {1..k},  x ∈ {0,1}^{|O|} }
```

a *collection of marginal tables of different orders*, not one joint table. In the worked example the
order-1 tables hold 82.5 % of the reads and the order-3 table holds 3 reads.

### 2.2 Which pairs are even decidable

For each pair (i, j) define the **pairwise spanning depth**

$$
n_{ij} \;=\; \#\{\,r : i \in O_r \text{ and } j \in O_r\,\}
$$

Only pairs with adequate `n_ij` can have their ancestry relation called. With reads placed roughly
uniformly and length distribution `L`,

$$
\mathbb E[n_{ij}] \;\approx\; D\cdot\frac{\mathbb E[(L-d_{ij})_+]}{\mathbb E[L]}
$$

where `d_ij` is the distance between the sites. **Pairwise power decays with inter-mutation
distance** — 17, 20 and 3 in the example are not noise, they are geometry.

### 2.3 What partial reads can and cannot support

A read observing `A` at site 1 and nothing at site 2 is compatible with **both** `10` and `11`. It
therefore supports "some state with S1 = 1" but **cannot distinguish chain from fork**. Formally, a
partial observation supports a *face* of the hypercube, not a vertex.

This gives a two-tier node support, which the deck already draws (solid vs dashed nodes in the
worked-example figure) but does not, as far as the deck shows, propagate into the cost function:

- **Tier A** — vertex supported by ≥1 read covering all k sites
- **Tier B** — vertex supported only by intersecting faces from several partial reads

Tier B vertices are *inferences*, and combining faces from different molecules is exactly the
marginal-to-joint leap that the 上篇 page says cannot be made. They must be carried with a confidence, not
promoted to fixed nodes.

---

## 3. Layer 1 — state set → candidate topologies

### 3.1 The deck's formulation, kept

Camin–Sokal parsimony on the directed Boolean hypercube: single-point mutations, one fixed root
`0^k`, edges only `0 → 1`, every non-root node exactly one parent, unit edge cost. With fixed node
count `C` (root + retained observed states) and latent nodes `H`:

$$
\mathrm{cost}(T)=|E(T)|=|V(T)|-1=C+|H(T)|-1
$$

so **minimising cost ≡ minimising latent nodes**, and the search is a Minimum-Cost Group Steiner
Arborescence on the hypercube. Enumerate by increasing `|H|` and keep the whole minimum-cost set.

This is sound and I am not proposing to replace it. Two corrections follow.

### 3.2 Correction A — absence of evidence is being read as evidence of absence *(the important one)*

An unobserved vertex has two very different causes:

```
(a) no cell carries that combination            → real biological absence
(b) no read spans those sites                   → we simply cannot see it
```

The Steiner solver treats them identically. In the worked example, S1 × S3 has `n₁₃ = 3` and the
solver nonetheless commits to a relation between them. With `n = 3`, the probability of missing a
state present in 30 % of that lineage's molecules is `0.7³ ≈ 0.34` — a coin flip dressed as a
conclusion.

**Fix.** Gate every pair on its own spanning depth before it constrains the tree:

```
for each pair (i,j):
    n_ij  = spanning depth
    π_ij  = power to detect a state at within-lineage fraction ϱ_min given n_ij and error ε
    if π_ij < π*:  mark (i,j) UNDETERMINED
                   → the solver may not use the absence of a vertex distinguishing i and j
```

Concretely: run the enumeration over the *partial order induced only by decidable pairs*, and report
the undecidable pairs explicitly, exactly as the deck already reports unresolved units. A unit whose
pairs are all undecidable is unresolved — it is not "unbranched single-layer".

I expect this to move a non-trivial slice of the 19.5–46.8 % "unbranched single-layer" bucket into
"unresolved", because that class is precisely where few states were observed.

### 3.3 Correction B — the class distribution is confounded by coverage geometry

Chain and fork are **not detected with equal probability**:

- calling a **chain** needs the double-mutant vertex `11` observed → requires a spanning read *and* a
  molecule from the double-mutant lineage
- calling a **fork** needs `10` and `01` observed *and* `11` shown absent → requires enough spanning
  reads to make the absence meaningful

Both depend on `n_ij`, i.e. on `d_ij`, i.e. on how far apart the mutations are. Therefore

> **Part of the observed topology-class spectrum is read-length geometry, not tumour biology.**

This is directly testable on output that already exists — see §10.1. Until it is done, the 6–22 %
branched fraction cannot be interpreted evolutionarily, and neither can my old P3.

---

## 4. Layer 2 — ranking, and where frequency actually belongs

### 4.1 The deck's score and its structural bias

The deck ranks minimum-cost candidates by summing read-AF differences over ancestor–descendant pairs:

$$
\mathrm{Score}(T)=\sum_{(i,j)\,:\, i \prec j}\bigl(a_i-a_j\bigr),\qquad a_i=\text{read-AF of site } i
$$

The intent is right — earlier mutations sit on more molecules. But the sum is **unnormalised over a
structure-dependent number of terms**, and that creates a systematic preference. For three mutations:

| topology | ancestor–descendant pairs | score |
|---|---:|---|
| chain `1→2→3` | 3 | `2(a₁ − a₃)` |
| one chain + one branch | 1 | `a₁ − a₂` |
| star (all three from root) | 0 | **0** |

**A branched topology can never outscore a chain**, because a star scores exactly zero while any
chain with non-equal read-AFs scores positive. Whenever the minimum-cost set contains both shapes,
the chain wins by construction.

The observed modal class is *unbranched multistep* at 38–53 %. I am not claiming the score explains
all of that — but it biases in exactly that direction, and the size of the effect is measurable
(§10.2). This is a concrete, checkable defect.

### 4.2 The replacement — a proper frequency likelihood

Replace the heuristic with `P(observed read-AFs | topology)`. This is where v2's composition model
belongs, and it is the right home for it:

Let clone `j` have within-family molecule fraction `f_j`, and let `S(v)` be the set of clones whose
state is at or below vertex `v`. Then site `i`'s expected read-AF is

$$
\mathbb E[a_i] \;=\; \sum_{j:\,i \in \mathrm{muts}(j)} f_j
$$

and the topology constrains `f`:

```
chain  v → w :   f(w-subtree) ≤ f(v-subtree)                 (nested)
fork   v → w₁, w₂ :  f(w₁-subtree) + f(w₂-subtree) ≤ f(v-subtree)   (pigeonhole)
```

Given a topology, fit `f` by constrained least squares / MLE against the observed `a_i` with binomial
weights `n_i` (each site's own coverage — they differ a lot: 73, 98, 60 in the worked example), and
score by the maximised likelihood. Compare topologies by likelihood ratio, not by a difference sum.

Three things this buys:

1. **Comparable across shapes.** A chain and a fork are scored by how well each explains the same
   numbers, so shape no longer decides the winner in advance.
2. **Per-site coverage enters correctly.** A read-AF from 60 reads and one from 98 currently carry
   equal weight in the difference sum; here they do not.
3. **Purity, copy number and multiplicity still cancel.** The v2 result survives untouched, because
   all `a_i` in a unit share one denominator (same region, same family). It cancels in the *ratios*
   the constraints are written in. This is the one part of v2 that comes through unchanged — and it
   is now doing real work rather than feeding a spectrum that cannot be estimated.

### 4.3 What happens to ϱ

Demoted, and correctly so. `ϱ = p(AB)/(p(A)+p(AB))` is estimable **only from the spanning
sub-sample** of that pair, so its standard error is `sqrt(ϱ(1−ϱ)/n_ij)` — with `n_ij` = 17 or 20, not
194. In the worked example the best pair gives `SE ≈ 0.11`; the S1 × S3 pair gives nothing.

So the v2 ϱ-spectrum is not dead, but it is a **narrow-window product**, not a wide-window one — see
§6. Report it with its `n_ij` attached, always.

---

## 5. Layer 3 — the redesigned genome-wide spectra

The binned object is no longer ϱ. Four spectra, all computable on every unit, all built from
within-unit quantities only (hence spin-invariant, §7), all purity-free.

| # | spectrum | what it measures | status |
|---|---|---|---|
| **S1** | topology class | shape of local evolution | **already measured**, reproducible at 0.909 |
| **S2** | minimum latent-node count `|H|` | how much required evolution is unobserved | derivable from existing output |
| **S3** | candidate multiplicity `|𝒯|`, distinct topologies | identifiability | partly measured (87.53 % enumerable) |
| **S4** | likelihood margin between best and runner-up | how much frequency actually decides | new, needs §4.2 |

**S2 deserves emphasis.** `|H|` is exactly guardrail #9 ("latent node 不是未觀測到的細胞") made
quantitative: it counts states the tree *needs* but nothing observed. Its genome-wide distribution is
a direct, honest measure of how much of the reconstruction is inference. No VAF-based method can
produce it, and it costs nothing — the solver already computes it as the cost.

**S1 must be reported twice**: raw, and after the §3.2 gating. The difference between the two *is*
the geometry correction, and publishing both is more informative than publishing either.

### 5.1 Neutral-evolution predictions, revised

v2's P1/P2/P3 were built on the ϱ-spectrum and mostly do not survive contact with §1.1.

- **P1 / P2** (1/f slope match, stratified self-similarity) — still meaningful, but only on the
  narrow-window product (§6), and only where `n_ij` is adequate. Demote to a secondary analysis and
  report the effective sample size.
- **P3** (chain fraction ≈ ϱ_A) — **cannot be tested against S1 until §3.3 is done.** The raw chain
  fraction is ~85–90 % of resolved units, far above what my derivation predicts for a plausible
  distribution of ϱ_A, and both §3.3 (geometry) and §4.1 (score bias) push in that direction. Treat
  the discrepancy as diagnostic of the pipeline, not of the biology, until those two are excluded.

That is a real retraction of a v2 claim, and the deck's data is what forced it.

---

## 6. The window-width knob

v2 never modelled this. It is the central design trade-off:

```
wide window (deck: ~39 kb)          narrow window (≤ read span, ~15–20 kb)
  + many units (85,941)               − far fewer units
  + more sites per unit (k=3+)        − mostly k=2
  − joints very sparse (n_ij ≪ D)     + most reads span all sites
  − ϱ not estimable                   + ϱ estimable, SE ≈ sqrt(ϱ(1−ϱ)/D)
  → good for S1/S2/S3                 → good for S4 and P1/P2
```

**Recommendation: run both.** They are the same pipeline with one parameter changed, and they answer
different questions. The wide pass gives the reproducible class spectrum; the narrow pass gives the
frequency estimates that can actually carry a neutrality test. Reporting only one is what makes the
current output hard to interpret.

---

## 7. Block spin — unchanged and still required

Everything in v2 §1.1 stands: H1 in block *b* and H1 in block *b′* are not the same chromosome, the
per-unit likelihood is invariant under the per-block flip so the topology costs nothing to
marginalise, and every genome-wide statistic must be a function of within-unit quantities only. All
four spectra in §5 satisfy that by construction. The deck's unit key already includes PS, which is
the thing that matters.

---

## 8. Trans still mimics branching

Also unchanged, and worth restating because §3.3 compounds it: two mutations in *trans* produce
`10`, `01`, no `11` — the fork signature. The deck avoids this by splitting into HP families before
building the state table, which is correct. Phasing extends the protection across the whole phase
block, far beyond the read span.

---

## 9. Failure modes

### 9.1 Under-powered pairs silently constraining the tree
§3.2. The highest-priority fix.

### 9.2 Score shape bias
§4.1. Second priority; cheap to test.

### 9.3 Tier-B vertices promoted to fixed nodes
§2.3. A vertex assembled from several partial reads is an inference; if it becomes a fixed Steiner
terminal it can force latent nodes and change the class.

### 9.4 A topology node is not necessarily one clone
The deck's own methylation panels show this: at HCC1395 chr11:65,758,101, a single HP+allele state
splits into **5 methylation groups** (3 within HP2's ALT, 2 within HP1's REF). So even a correctly
reconstructed node can contain several subpopulations. This is a limit on *interpretation* of the
haplotype-only model, and the honest phrasing is "at least this many clones", never "exactly".

### 9.5 False-positive somatic calls
At k = 2 one bad call corrupts one of four cells. Run downstream of filtering, as the deck does.

---

## 10. Three analyses that can be run on output that already exists

Ordered by value per unit of effort. None needs new sequencing or a rewritten solver.

### 10.1 Is the class spectrum explained by geometry?
Bin units by the spread of their mutation positions (or by median `n_ij`). Plot the topology-class
composition per bin. If the branched fraction rises with `n_ij`, §3.3 is real and the raw spectrum is
partly an artefact. **This is the single most informative plot available right now.**

### 10.2 How much does the score's shape bias cost?
Re-rank the existing candidate sets with the score normalised by the number of ancestor–descendant
pairs, and again with the §4.2 likelihood. Report the class-distribution shift. If S1 is stable, the
concern is closed and the result is stronger for having been checked.

### 10.3 Does reproducibility survive gating?
Recompute the 0.909 HCC1395_HKU / NYGC similarity after §3.2 gating. If it holds or improves, the
gating is removing noise; if it collapses, the 0.909 was partly driven by shared coverage geometry
rather than shared biology — which would be important to know.

---

## 11. What v3 keeps from v2, and what it drops

| v2 claim | v3 status |
|---|---|
| unit = (chrom, PS, window, HP family) | **kept** — matches the deck |
| purity / CN / multiplicity cancel in within-unit ratios | **kept**, now used in the ranking likelihood (§4.2) |
| block spin must be handled; statistics must be within-unit | **kept** |
| trans mimics branching; split by family first | **kept**; the deck already does it |
| multinomial over 2^k configurations | **dropped** — 82.5 % of reads are order-1 |
| ϱ-spectrum as the genome-wide binned object | **dropped** — demoted to a narrow-window secondary product |
| P3 nestedness excess as a testable prediction | **suspended** pending §3.3 and §4.2 |
| "report a candidate set, not one tree" as a novelty | **withdrawn** — the deck already does this |
| falsification report as a novelty | **withdrawn** — 87.53 % enumerability is the same discipline |
| latent-node count as a genome-wide spectrum | **new** (S2) |
| pairwise spanning-depth gating | **new** (§3.2), highest-priority fix |
| score shape-bias correction | **new** (§4.1) |
| window-width as an explicit two-pass knob | **new** (§6) |

---

## References

Unchanged from v2 for the population-genetics and benchmarking results (Durrett 2013; Williams et al.
2016 / 2018; Tarabichi et al. 2018 / 2021; Caravagna et al. 2020; Salcedo et al. 2024), plus:

- Camin JH, Sokal RR. A method for deducing branching sequences in phylogeny. *Evolution*
  1965;19:311–326 — the parsimony model the deck uses.
- The Group Steiner / minimum-cost arborescence framing is the deck's own; the standard reference for
  the directed variant is Charikar et al., *J Algorithms* 1999;33:73–91.
- 廖子游, *Subclonal reconstruction using somatic haplotagging and methylation profiles with Nanopore
  sequencing*, master's thesis defence, CCU CSIE, 2026-07-30 — the source of every empirical number
  in §1.
