
import re

content = open(outfile).read()
errors = []
warnings = []

# ── CHECK 1: Non-ASCII in script block ───────────────────────────────────
script_start = content.rfind('<script>')
script_end = content.find('</body>')
script_block = content[script_start:script_end]
bad_chars = [(i, c) for i, c in enumerate(script_block) if ord(c) > 127]
if bad_chars:
    errors.append(f'NON-ASCII: {len(bad_chars)} chars in script block. First 3: {bad_chars[:3]}')

# ── CHECK 2: All 8 tabs present ──────────────────────────────────────────
tabs = ['Financial Overview', 'Organisation & People', 'Balance Sheet & Funding',
        'Strategy & Health', 'Analytics & Technology', 'Peer Comparison',
        'Product Fit & Playbook', 'Recent News']
for t in tabs:
    if t not in content:
        errors.append(f'MISSING TAB: {t}')

# ── CHECK 3: D.strategy serialisation ────────────────────────────────────
if '[object Object]' in content:
    errors.append('STRATEGY: D.strategy serialised as object not string')

# ── CHECK 4: maturity uses evidence[] not signals[] ──────────────────────
# Only flag if signals appears in the D object area (not as a CSS word etc.)
if '"signals"' in script_block:
    errors.append('MATURITY: uses signals[] key — must be evidence[]')

# ── CHECK 5: Product count in D.products ─────────────────────────────────
# build.py outputs single-quoted JS strings; match both single and double quotes
dproducts_start = script_block.find('D.products = [')
dproducts_end = script_block.find('];', dproducts_start) + 2 if dproducts_start >= 0 else -1
prod_section = script_block[dproducts_start:dproducts_end] if dproducts_start >= 0 else ''
prod_names = re.findall(r"name:'([^']+)'", prod_section) + re.findall(r'name:"([^"]+)"', prod_section)
print(f'Products in D.products: {len(prod_names)}')
if len(prod_names) == 0:
    errors.append('PRODUCTS: No products found in D.products')

# ── CHECK 6: Contamination — prior institution names ─────────────────────
# prior_names is DERIVED FROM THE DAILY LOG, never hand-maintained. The previous
# hardcoded list went stale and silently passed a build containing 18 references
# to the prior day's institution — a hand-edited blocklist is a blocklist that
# stops being edited. The log's covered-institutions table is the single source
# of truth, so a bank is protected the moment it is recorded there.
import os as _os

def _load_prior_names():
    """Parse institution names from the covered-institutions table in the log."""
    for _p in ('/mnt/project/daily-dashboard-log.md',
               '/mnt/user-data/outputs/daily-dashboard-log.md',
               'daily-dashboard-log.md'):
        if not _os.path.exists(_p):
            continue
        _names, _md = [], open(_p, encoding='utf-8').read()
        for _line in _md.splitlines():
            if not _line.strip().startswith('|'):
                continue
            _cells = [c.strip() for c in _line.strip().strip('|').split('|')]
            if len(_cells) < 5:
                continue
            if all(re.fullmatch(r':?-{2,}:?', c) for c in _cells):
                continue
            _cell = _cells[4].strip('` ')
            # Rows carry a bare slug OR a status marker (DELIVERED - url,
            # EMAIL SENT - slug, RESEARCHED - path). Accept both: dropping the
            # marker rows silently excluded most covered banks from screening.
            if not _cell or _cells[1].upper().startswith('SKIPPED'):
                continue
            if not (re.fullmatch(r'[a-z0-9-]+', _cell)
                    or re.match(r'(?:DELIVERED|EMAIL SENT|RESEARCHED)\b', _cell, re.I)):
                continue
            _n = re.sub(r'\([^)]*\)', '', _cells[1]).strip().rstrip(',')
            if _n:
                _names.append(_n)
                _stripped = re.sub(
                    r'(?:,?\s+(?:Inc\.?|Corporation|Corp\.?|Bancorp|Bancshares|'
                    r'Financial(?:\s+Group)?|Holdings?|Bankers|Company|Co\.?))+$',
                    '', _n).strip()
                if _stripped and _stripped != _n:
                    _names.append(_stripped)
        return _names, _p
    return None, None

prior_names, _log_path = _load_prior_names()
if prior_names is None:
    warnings.append('CONTAMINATION CHECK SKIPPED: daily-dashboard-log.md not found — '
                    'copy it to /mnt/project/ so prior institutions can be derived. '
                    'This build was NOT screened against previous institutions.')
    prior_names = []
else:
    print(f'Contamination check: {len(prior_names)} prior name(s) from {_log_path}')

# build_v2.py emits single-quoted JS values, so a double-quote-only pattern
# never matched and current_name was silently '' on every build.
institution_name = re.search(r"""D\.basic\s*=\s*\{[^}]*name:\s*['"]([^'"]+)['"]""",
                             script_block)
current_name = institution_name.group(1) if institution_name else ''
if not current_name:
    warnings.append('CONTAMINATION CHECK: could not read the institution name from '
                    'D.basic — screening every prior name without a self-exclusion.')
# D.peers and D.nimTrend are where other institutions BELONG — that is the whole
# point of the Peer Comparison tab. They live in the same script block as the
# narrative, so screening the raw block false-positives on every real peer set.
# Screen the narrative only: the block minus those two assignments.
narrative_block = '\n'.join(
    _l for _l in script_block.splitlines()
    if not re.match(r'\s*D\.(peers|nimTrend)\s*=', _l))

for prior in prior_names:
    # Guard the empty case: "" is a substring of everything, which would skip all.
    if current_name and (prior.lower() in current_name.lower()
                         or current_name.lower() in prior.lower()):
        continue  # this build's own institution
    if re.search(r'\b' + re.escape(prior) + r'\b', narrative_block):
        errors.append(f'CONTAMINATION: "{prior}" found outside the peer data')

# ── CHECK 7: Required D fields present ───────────────────────────────────
required_fields = ['D.basic', 'D.meta', 'D.metrics', 'D.strategy', 'D.swot',
                   'D.maturity', 'D.peers', 'D.loans', 'D.products',
                   'D.finOverview', 'D.contacts', 'D.news', 'D.salesPlaybook',
                   'D.charts', 'D.healthRating']
for f in required_fields:
    if f not in script_block:
        errors.append(f'MISSING FIELD: {f} not found in D object')

# ── CHECK 8: Numeric scale sanity ────────────────────────────────────────
# Extract total assets value and check for implausible scale mismatches
# (e.g. a community bank showing $1.2T assets)
assets_matches = re.findall(r'"v":"(\$[\d.,]+[BMT]?)"', script_block)
print(f'Metric values found: {assets_matches[:8]}')
# Manual review — flag any values that look disproportionate to institution size

# ── CHECK 10: Chart scale — ALL values must be in actual billions ─────────
# The shell hardcodes "$B" labels on all chart axes. If a builder writes
# values in millions (e.g. 348.7) instead of billions (0.3487), the chart
# will falsely display "$349B" for a $349M community bank.
# Rule: balance sheet asset values > 5000 are certainly millions, not billions.
# Values between 50 and 5000 are suspicious for any bank under ~$5T assets.
bs_asset_match = re.search(r'D\.charts\s*=\s*\{[^;]*?assets:\[([^\]]+)\]', script_block, re.S)
if bs_asset_match:
    try:
        asset_vals = [float(v.strip()) for v in bs_asset_match.group(1).split(',') if v.strip()]
        if any(v > 5000 for v in asset_vals):
            errors.append(
                f'CHART SCALE ERROR: Balance sheet assets appear to be in $M not $B '
                f'(values: {asset_vals[:4]}). Divide by 1,000 before writing to JSON. '
                f'Shell hardcodes "$B" axis — community banks should show values like 0.15-0.95.'
            )
        elif any(v > 50 for v in asset_vals):
            warnings.append(
                f'CHART SCALE WARNING: Balance sheet asset values {asset_vals[:4]} may be in $M not $B. '
                f'Verify: community banks <$1B should show 0.1-0.9; large regionals $50B+ show 50-700.'
            )
    except ValueError:
        pass

rv_nii_match = re.search(r'D\.charts\s*=\s*\{[^;]*?nii:\[([^\]]+)\]', script_block, re.S)
if rv_nii_match:
    try:
        nii_vals = [float(v.strip()) for v in rv_nii_match.group(1).split(',') if v.strip()]
        if any(v > 20 for v in nii_vals):
            errors.append(
                f'CHART SCALE ERROR: Revenue NII values appear to be in $M not $B '
                f'(values: {nii_vals[:4]}). Divide by 1,000. '
                f'A $350M community bank should show quarterly NII like 0.003-0.005.'
            )
    except ValueError:
        pass

# ── CHECK 9: No duplicate salesPlaybook or html tags ─────────────────────
if content.count('</html>') > 1:
    errors.append('DUPLICATION: Multiple </html> tags — file may be corrupted')
if content.count('function salesPlaybook') > 1:
    errors.append('DUPLICATION: salesPlaybook() defined more than once')

# ── REPORT ────────────────────────────────────────────────────────────────
print(f'\n{"="*50}')
print(f'VALIDATION REPORT: {outfile}')
print(f'{"="*50}')
if errors:
    print(f'\n ERRORS ({len(errors)}) — DO NOT DELIVER:')
    for e in errors: print(f'  ✗ {e}')
else:
    print('\n ALL CHECKS PASSED')
if warnings:
    print(f'\n WARNINGS ({len(warnings)}):')
    for w in warnings: print(f'  ⚠ {w}')
print(f'{"="*50}\n')
