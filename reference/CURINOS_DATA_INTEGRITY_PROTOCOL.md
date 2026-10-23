# CURINOS DASHBOARD — DATA INTEGRITY PROTOCOL
## Purpose: Prevent cross-FI data contamination in every dashboard
## Last updated: 2026-03-03
## Status: MANDATORY — apply before building any new FI dashboard

---

## WHY THIS EXISTS

The Regions dashboard contained `newline.regions.com` — a domain that does not exist.
"Newline" is Fifth Third Bank's embedded finance product, not Regions'.
This was a hallucination: AI-generated content that sounded plausible but belonged to a different institution.

**If a sales rep presents contaminated data to a client, Curinos loses credibility permanently.**

---

## THE THREE SOURCES OF CONTAMINATION

### Type 1: AI Hallucination
AI training data contains facts about many banks. Under pressure to fill fields, 
the model may generate plausible-sounding but wrong content — product names, 
strategy descriptions, executive titles — from the wrong bank.

**Example:** "Newline by Regions" — Newline is Fifth Third's product.

### Type 2: Template Bleed  
When building a new dashboard from a previous one (e.g. copying the Regions template),
residual content, product names, or URLs from the prior FI can survive the copy.

**Example:** A strategy description written for Regions appears unchanged in a KeyBank dashboard.

### Type 3: Generic Filler
When source data is unavailable, generic industry language gets inserted as if it were 
institution-specific — making the dashboard look specific but actually being fabricated.

**Example:** "The bank is investing in digital transformation" — true of every bank, sourced from none.

---

## THE MANDATORY PRE-BUILD CHECKLIST
### Run this BEFORE writing a single line of dashboard content for any new FI

```
INSTITUTION BEING BUILT: ________________
DATE: ________________
BUILT BY: ________________

STEP 1 — IDENTITY LOCK
[ ] Confirm full legal name: ________________________________
[ ] Confirm NYSE/NASDAQ ticker: ___________________________
[ ] Confirm FDIC Certificate number: ______________________
[ ] Confirm HQ city and state: ____________________________
[ ] Confirm primary regulator (OCC / Fed / FDIC): __________

STEP 2 — SOURCE DOCUMENTS (fetch-verified before any content is written)
[ ] Most recent earnings release URL — web_fetch confirmed 200: ____________
[ ] 10-K PDF URL — web_fetch confirmed 200 (binary PDF): __________________
[ ] FDIC IDI Resolution Plan URL — web_fetch confirmed 200: ________________
[ ] FDIC BankFind API — CERT number confirmed: ____________________________

STEP 3 — PRODUCT NAME LOCKDOWN
Before writing ANY product/platform/brand names, search:
  "[Product Name]" site:[bank's own domain]
ONLY use product names that appear on the bank's OWN website.
[ ] All product names in dashboard sourced from bank's own site: YES / NO

STEP 4 — STRATEGY LOCKDOWN  
Before writing ANY strategy descriptions, source EACH claim to ONE of:
  - Most recent earnings call transcript or press release
  - Most recent 10-K (Management Discussion & Analysis section)
  - FDIC IDI Resolution Plan
[ ] Every strategy bullet has a specific source document: YES / NO

STEP 5 — EXECUTIVE NAME LOCKDOWN
Before writing ANY executive names or titles:
  - Source ONLY from: FDIC IDI Resolution Plan, 10-K proxy statement, or IR press releases
  - NEVER generate executive names from memory
[ ] Every executive name has a document source with page/section: YES / NO

STEP 6 — PEER COMPARISON BOUNDARY CHECK
[ ] Confirm peer banks list: _______________________________
[ ] Peer data ONLY appears in the Peer Comparison tab
[ ] No peer bank product names, strategies, or data appear in any other tab
[ ] Peer data clearly labelled with source (their own earnings release, not the subject bank's)
```

---

## THE POST-BUILD CONTAMINATION AUDIT
### Run this on every completed dashboard before delivery

### AUDIT STEP A — Product Name Cross-Check
For every product name, platform name, or branded service mentioned in the dashboard:
1. Search: `"[product name]" site:[subject bank domain]`
2. If it does NOT appear on the subject bank's own website → **DELETE IT**
3. Replace with either a verified name OR mark as [NEEDS VERIFICATION]

**Red flag words that have caused contamination:**
- "Newline" → Fifth Third product
- "Zelle for Business" → generic / multiple banks, verify specific rollout
- "OnePass" → Regions-specific (safe for Regions only)
- "iTreasury" → Regions-specific (safe for Regions only)
- Any product name not confirmed on the bank's own site

### AUDIT STEP B — The "Other Bank" Scan
Search the completed HTML for names of OTHER banks:
```python
OTHER_BANKS = [
    "Fifth Third", "FITB", "Newline",        # Fifth Third brands
    "Truist", "SunTrust", "BB&T",            # Truist brands  
    "Huntington", "HBAN",                     # Huntington brands
    "KeyBank", "KeyCorp",                     # KeyCorp brands
    "Citizens", "CFG",                        # Citizens brands
    "Comerica", "CMA",                        # Comerica brands
    "Zions", "ZION",                          # Zions brands
    "Synovus", "SNV",                         # Synovus brands
    "Wintrust", "WTFC",                       # Wintrust brands
]
```
Any of these appearing OUTSIDE the Peer Comparison tab = **contamination**.

### AUDIT STEP C — Source Citation Check
For every data point in the dashboard:
- Financial metrics → must cite earnings release or 10-K with specific figure
- Strategy claims → must cite earnings call, 10-K MD&A, or press release
- Product names → must cite bank's own website or press release
- Executive names → must cite FDIC IDI Plan, proxy, or IR press release
- Branch/state counts → must cite FDIC BankFind or earnings release

Any data point without a specific source → **flag for removal or verification**

### AUDIT STEP D — URL Domain Check
Every source URL in the dashboard must have a domain belonging to one of:
- The subject bank's own domain (e.g. regions.com, ir.regions.com)
- FDIC (fdic.gov, banks.data.fdic.gov)
- Federal Reserve (federalreserve.gov)
- SEC (sec.gov, q4cdn.com)
- BusinessWire (businesswire.com) — for subject bank press releases only
- PRNewswire (prnewswire.com) — for subject bank press releases only
- Peer bank domains — ONLY in the Peer Comparison tab

---

## AUTOMATED CONTAMINATION SCANNER
### Python script to run on any completed dashboard HTML

```python
import re

def audit_dashboard(html_path, subject_bank_name, subject_bank_ticker, peer_banks):
    """
    Scans a dashboard HTML for cross-FI contamination.
    
    Args:
        html_path: path to the dashboard HTML file
        subject_bank_name: e.g. "Regions" or "Regions Financial"  
        subject_bank_ticker: e.g. "RF"
        peer_banks: list of peer bank identifiers to ALLOW in peer tab only
    """
    with open(html_path, 'r') as f:
        content = f.read()
    
    issues = []
    
    # 1. Known contamination products/brands
    CONTAMINATION_WORDS = {
        "Newline": "Fifth Third product",
        "Early Pay": "Fifth Third product", 
        "Momentum Banking": "Fifth Third product",
        "Zelle": "VERIFY - confirm this bank has rolled out Zelle",
        "Greensky": "Goldman Sachs/Fifth Third product",
        "Apple Pay Later": "Apple product - verify bank partnership",
    }
    
    for word, note in CONTAMINATION_WORDS.items():
        if word.lower() in content.lower():
            # Check if it's in peer comparison section
            peer_section_start = content.lower().find('peer comparison')
            positions = [m.start() for m in re.finditer(word, content, re.IGNORECASE)]
            for pos in positions:
                # Allow in peer comparison section
                if peer_section_start > 0 and abs(pos - peer_section_start) < 5000:
                    continue
                issues.append(f"CONTAMINATION: '{word}' found — {note} (position {pos})")
    
    # 2. Other bank names outside peer section
    peer_section = extract_peer_section(content)
    non_peer_content = content.replace(peer_section, '')
    
    for peer in peer_banks:
        if peer.lower() in non_peer_content.lower():
            issues.append(f"CONTAMINATION: Peer bank '{peer}' found outside peer comparison tab")
    
    # 3. Domains that don't belong
    all_urls = re.findall(r"window\.open\('(https?://[^']+)'", content)
    for url in all_urls:
        domain_ok = any(d in url for d in [
            'fdic.gov', 'federalreserve.gov', 'sec.gov', 'q4cdn.com',
            'businesswire.com', 'prnewswire.com',
            subject_bank_name.lower().replace(' ', ''),
        ])
        # Check if URL is from a peer bank domain
        is_peer_url = any(p.lower().replace(' ', '') in url.lower() for p in peer_banks)
        
        if not domain_ok and not is_peer_url:
            issues.append(f"UNVERIFIED DOMAIN: {url[:100]}")
    
    return issues


def extract_peer_section(html):
    """Extract the peer comparison tab section from HTML."""
    start = html.find('peer-tab') 
    if start < 0:
        start = html.find('Peer Comparison')
    end = html.find('</div>', start + 50000) if start > 0 else 0
    return html[start:end] if start > 0 else ''


# USAGE EXAMPLE:
# issues = audit_dashboard(
#     'regions_curinos_v4.html',
#     subject_bank_name='Regions',
#     subject_bank_ticker='RF',
#     peer_banks=['Truist', 'Huntington', 'Fifth Third', 'KeyCorp']
# )
# for issue in issues: print(issue)
```

---

## SAFE CONTENT GENERATION RULES

### Rule 1: Every sentence needs a source
When writing dashboard content, mentally complete this sentence:
> "I know this because I read it in _____________ on page/section _____________"

If you cannot complete that sentence → do not write the content.

### Rule 2: Product names require two-source confirmation
A product name must appear in BOTH:
1. The bank's own website (any page)
2. At least one official document (10-K, earnings release, press release)

### Rule 3: Strategy claims require direct attribution
Strategy claims must be quotes or direct paraphrases from:
- CEO/CFO statements in earnings calls
- 10-K Management Discussion & Analysis
- Investor Day presentations
NOT from: news articles, analyst reports, or AI inference

### Rule 4: Numbers require specific sourcing
Every number (assets, deposits, branches, ratios) must have:
- The exact source document
- The reporting period (Q4 2024, FY2024, etc.)
- Verification that the number applies to the subject FI, not a peer

### Rule 5: When uncertain, omit
It is far better to have a dashboard with fewer claims that are all verified
than a dashboard full of unverified or contaminated content.
Blank fields are recoverable. Wrong data destroys credibility.

---

## QUICK REFERENCE: HIGH-RISK FIELDS

These fields are most likely to contain contaminated content. Extra scrutiny required:

| Field | Risk | Required Source |
|---|---|---|
| Digital platform names | HIGH — easy to confuse across banks | Bank's own website |
| Treasury/cash mgmt product names | HIGH | Bank's own website + press release |
| Fintech partnership names | HIGH | Press release naming subject bank |
| Strategy descriptions | MEDIUM | Earnings call or 10-K MD&A |
| Executive names & titles | MEDIUM | FDIC IDI Plan or 10-K proxy |
| Subsidiary list | MEDIUM | FDIC IDI Plan Appendix |
| Branch counts | LOW | FDIC BankFind or earnings release |
| Financial ratios | LOW | Earnings release or 10-K |

---

## PEER COMPARISON — BOUNDARY RULES

The peer comparison tab is the ONLY place other banks' data belongs.

| Location | Subject bank data | Peer bank data |
|---|---|---|
| All tabs except Peer Comparison | ✅ YES | ❌ NEVER |
| Peer Comparison tab | ✅ YES (subject column) | ✅ YES (peer columns only) |
| Source tooltips (non-peer tabs) | ✅ Subject bank sources only | ❌ NEVER |
| Source tooltips (peer tab) | ✅ Subject bank sources | ✅ Peer bank sources, clearly labelled |

Peer bank data in peer comparison must:
- Come from THAT peer bank's own earnings releases or public filings
- Be clearly labelled with that peer bank's name and source
- Only include metrics (numbers), never strategy or product descriptions
