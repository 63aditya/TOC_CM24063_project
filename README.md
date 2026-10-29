# LLG to RLG Inter-converter

**TAE-1: Project Based Learning · Theory of Computation (N-PCCCM503T)**
Aditya Dhondiba Kangire · CM24063 · 5th Semester CSE (AI&ML)
S. B. Jain Institute of Technology, Management & Research, Nagpur · Session 2026–27 (ODD)

## Project
A browser-based tool that parses a Left-Linear Grammar (LLG), validates it, converts it **directly into an equivalent Right-Linear Grammar (RLG)**, and proves that the language is preserved. It shows the RLG, a rule-by-rule conversion table, the automaton diagram, a language-integrity check and a string check with derivations in both grammars. Pure HTML + CSS + JavaScript; no backend, database or API key.

## Problem Statement
LLG to RLG Inter-converter: create a tool that transforms a Left-Linear Grammar directly into a Right-Linear Grammar while preserving language integrity.

## Objective
Validate an LLG, convert it into an equivalent RLG, display the conversion table and diagram, verify that both grammars generate the same language, and demonstrate valid and invalid inputs.

## Theory
G = (V, T, P, S) is left-linear if every production is `A → Bw` or `A → w` (a non-terminal only at the left end). Left-linear and right-linear grammars both generate exactly the **regular languages**, so every LLG has an equivalent RLG.

The tempting shortcut of flipping each rule `A → Ba` into `A → aB` is **wrong**: it gives a right-linear grammar for the *reversed* language Lᴿ. To keep L itself, the construction reverses the automaton instead. Reading the LLG backwards gives an NFA with a new start state Z, in which the old start symbol S is the final state:

NFA M = (Q, Σ, δ, q₀, F): Q = V ∪ {Z}, Σ = T, q₀ = Z, F = {S} (and Z as well when ε ∈ L). The RLG is read off from M: every move `p --a--> q` becomes `p → aq`, every final state `f` gets `f → ε`, and the start symbol is Z.

## Conversion Rules
| LLG production | Move in the reversed automaton | RLG production |
|---|---|---|
| `A → Ba` | `B --a--> A` | `B → aA` |
| `A → a` | `Z --a--> A` | `Z → aA` |
| `A → ε` | no move of its own: every move `A --x--> C` is copied as `Z --x--> C` | `Z → xC` (and `Z → ε` if A is the start symbol) |
| start symbol `S` | final state | `S → ε` |

Z is the first unused capital letter from Z downwards (Y, X, … if the grammar already uses Z). States that are not reachable from Z, or cannot reach a final state, are removed and reported. If no terminal string can be derived, the language is empty and the RLG has no productions.

## Algorithm
```
parse + validate G = (V, T, P, S)
Z = fresh non-terminal ; q0 = Z ; F = { S }
for each production A -> alpha:
    alpha = Ba : add move B --a--> A
    alpha = a  : add move Z --a--> A
for each production A -> ε:
    copy every move A --x--> C as Z --x--> C ; if A = S then F += Z
remove states unreachable from Z or unable to reach F
RLG: for each move p --a--> q write  p -> aq ;  for each f in F write  f -> ε
verify: enumerate words of LLG and RLG independently and compare
```
Complexity: reversing O(m) for m productions; ε-removal O(e·m) for e ε-productions; pruning O(m); the RLG has at most |V| + 1 non-terminals.

## Features
- Clickable **Verification Test Cases** (5 valid, 7 invalid) with Expected vs Actual and a "Run all" button
- Section 1: grammar input, detected non-terminals / terminals / start symbol, VALID / INVALID status with the exact reason
- Section 2: summary cards, **generated RLG** (with Copy button), rule-by-rule conversion table, δ matrix, dynamic SVG diagram, language-integrity banner
- Section 3: string check with ✓ ACCEPTED / ✗ REJECTED, and the derivation of the string in the LLG and in the RLG
- Responsive for mobile and desktop

## Input Syntax
One production per line · alternatives with `|` · `->` or `→` · capital letters = non-terminals · `a–z`, `0–9` = terminals · `ε` (or `eps`, `epsilon`, `lambda`, `λ`) = empty string · first left side = start symbol. Rejected with an explanation: empty input, missing arrow, right-linear rule (`aA`), non-terminal not at the left end (`aAb`), several terminals (`ab`), two non-terminals, unit production (`A → B`), undefined non-terminal, invalid symbol.

## Examples
```
S -> Aa | b          Test 1: L = (b | aa)(ba)*; bba accepted, abc rejected as invalid string
A -> Sb | a          RLG:  Z → bS | aA     S → bA | ε     A → aS

S -> Aa | b          Test 3: A -> ε is removed by copying A's moves to Z
A -> Ab | ε          RLG:  Z → bS | aS | bA     S → ε     A → aS | bA

S -> Sa | Sb | ε    Test 4: ε ∈ L, so Z → ε is added;  RLG: Z → aS | bS | ε,  S → aS | bS | ε
```

## Testing
`node tests/test.js` runs 96 checks: the 12 verification cases, valid/invalid grammars, arrow and spacing variants, conversion rules, ε-productions, pruning, empty language, accepted/rejected strings, derivations, the language check (including a deliberately broken RLG that must be detected), a demonstration that the naive "flip each rule" grammar generates the reversed language, a property test on 400 random left-linear grammars, diagram generation and malformed input. The in-app "Run all" button evaluates the 12 verification cases.

## Project Structure
```
index.html      page layout
style.css       styling
script.js       parser, LLG→RLG converter, language check, derivations, SVG drawing, UI
tests/test.js   automated checks
README.md
```

## How to Run
Open `index.html` in any browser (no server needed). Optional: `node tests/test.js`.

## GitHub Pages Deployment
1. Create a public repository `llg-to-rlg-inter-converter`.
2. Upload `index.html`, `style.css`, `script.js`, `README.md`, `tests/`.
3. Settings → Pages → Deploy from a branch → `main` / `(root)` → Save.
4. Open `https://<your-username>.github.io/llg-to-rlg-inter-converter/` after about a minute.

## Limitations
Single-letter non-terminals; one terminal per production (normal form); unit productions are rejected, not eliminated; right-linear input is rejected, not converted back; the language check compares words up to a length bound (at most 8), while the construction itself is proved correct in theory.

## Future Scope
Multi-terminal productions (`A → Bab`), unit-production elimination, RLG → LLG (the opposite direction), NFA → DFA and minimisation, animated derivations on the diagram, CSV export of the table.
