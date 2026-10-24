
import json, re, os, math, subprocess

# ── Load intel ──────────────────────────────────────────────────────────────
slug_file = sorted([f for f in os.listdir('/mnt/user-data/outputs/') if f.endswith('-intel.json')], key=lambda x: os.path.getmtime(f'/mnt/user-data/outputs/{x}'), reverse=True)[0]
with open(f'/mnt/user-data/outputs/{slug_file}') as f:
    d = json.load(f)

# ── Load shell files ─────────────────────────────────────────────────────────
# Load shell files - try /mnt/project/ first (project knowledge, always available),
# fall back to /mnt/skills/ (skill assets, may vary by session)
import os as _os
def _load_shell(filename):
    for base in ['/mnt/project/', '/mnt/skills/user/curinos-output/assets/']:
        path = base + filename
        if _os.path.exists(path):
            with open(path) as f:
                return f.read()
    raise FileNotFoundError(f"Cannot find {filename} in /mnt/project/ or /mnt/skills/")

shell_top = _load_shell('SHELL_TOP.html')
shell_bottom = _load_shell('SHELL_BOTTOM.html')

# ── Page <title> ─────────────────────────────────────────────────────────────
# SHELL_TOP ships a __DASH_TITLE__ placeholder inside <head>. Before this was
# added the shell carried a hard-coded "United Community Banks Sales
# Intelligence" title sitting AFTER <body>, so every institution's dashboard
# was titled after a different bank and that stray tag was copied into the
# artifact body by make_artifact.py (which lifts <body>...</body> wholesale) --
# cross-institution contamination in published source. Fail loudly rather than
# ship an untitled or mis-titled page.
_name = (d.get('basic', {}) or {}).get('name') or d.get('meta', {}).get('name', '')
if '__DASH_TITLE__' not in shell_top:
    raise SystemExit('FATAL: SHELL_TOP.html has no __DASH_TITLE__ placeholder -- refusing to build')
if not _name:
    raise SystemExit('FATAL: no institution name in intel (basic.name / meta.name) -- refusing to build')
shell_top = shell_top.replace('__DASH_TITLE__', f'{_name} Sales Intelligence')

# ── CANONICAL clean() — DO NOT MODIFY ────────────────────────────────────────
# Every line here fixes a specific class of JS syntax error. All are required.
def clean(s):
    """Sanitise any value for safe inclusion in a single-quoted JS string."""
    if not isinstance(s, str): return s
    s = s.replace('\u2014', '--').replace('\u2013', '-')       # em/en dashes
    s = s.replace('\u2018', "'").replace('\u2019', "'")        # smart single quotes → plain
    s = s.replace('\u201c', '"').replace('\u201d', '"')        # smart double quotes
    s = s.replace('\u2022', '-').replace('\u00b7', '-')        # bullets
    s = s.replace('\r\n', '\\n').replace('\r', '\\n').replace('\n', '\\n')  # CRITICAL: literal newlines break single-quoted JS strings
    s = s.replace('\t', '  ')                                  # tabs
    s = s.replace('\\', '\\\\')                                # escape backslashes BEFORE quotes
    s = s.replace("'", "\\'")                                  # escape single quotes
    for _u, _a in (('\u00d7', 'x'), ('\u2192', '->'), ('\u2190', '<-'), ('\u2265', '>='), ('\u2264', '<='),
                   ('\u2260', '!='), ('\u2248', '~'), ('\u2026', '...'), ('\u00a3', 'GBP '), ('\u20ac', 'EUR '),
                   ('\u2212', '-'), ('\u00a0', ' ')):
        s = s.replace(_u, _a)                                  # transliterate before the ASCII strip (V4)
    s = s.encode('ascii', 'ignore').decode('ascii')            # strip non-ASCII
    return s

def js_str(s):
    """Single-quoted JS string."""
    return "'" + clean(str(s)) + "'"

def js_num(v, default="null"):
    """Emit a JS numeric literal, never a bare Python None/True/False/NaN.

    A JSON null reaching an f-string interpolation becomes the bare identifier
    `None`, which is valid JS SYNTAX (so node --check passes) but throws
    ReferenceError at load and kills the entire script. Five published
    dashboards rendered blank this way before anyone noticed.

    Note `.get(k, d)` does NOT protect you: the default only fires when the key
    is absent, and these intel files carry the key explicitly set to null.
    """
    if isinstance(v, bool) or v is None:
        return str(default)
    if isinstance(v, (int, float)):
        return str(v) if math.isfinite(v) else str(default)
    try:
        f = float(str(v).replace(",", "").replace("$", "").replace("%", ""))
        return str(f) if math.isfinite(f) else str(default)
    except (TypeError, ValueError):
        return str(default)

def js_num2(v, default="null"):
    """js_num rounded to 2dp -- for the NIM trend series."""
    if isinstance(v, bool) or v is None:
        return str(default)
    try:
        f = float(str(v).replace(",", "").replace("$", "").replace("%", ""))
    except (TypeError, ValueError):
        return str(default)
    return str(round(f, 2)) if math.isfinite(f) else str(default)

def js_bool(b):
    return 'true' if b else 'false'

def js_str_arr(lst):
    return '[' + ','.join(js_str(i) for i in lst) + ']'

# ── Normalise strategy field (RULE 2) ────────────────────────────────────────
strategy_raw = d.get('strategy', '')
if isinstance(strategy_raw, dict) and 'sections' in strategy_raw:
    parts = [s['title'] + ': ' + s['body'] for s in strategy_raw['sections']]
    strategy_str = '\n\n'.join(parts)  # clean() will convert \n to \\n
elif isinstance(strategy_raw, str):
    strategy_str = strategy_raw
else:
    strategy_str = 'OVERVIEW: No strategy data available.'

# ── Normalise maturity evidence field (RULE 3) ───────────────────────────────
maturity = d.get('maturity', {})
for dim in maturity.get('dimensions', []):
    if 'signals' in dim and 'evidence' not in dim:
        dim['evidence'] = dim.pop('signals')

# ── Build D object ────────────────────────────────────────────────────────────
# Follow TEMPLATE_SHELL.md schema exactly. Use js_str() on every string value.
# Use js_str_arr() for string arrays. Use js_bool() for booleans.
# Numeric values (scores, percentages, dollar amounts as numbers) go in unquoted.
# The D object MUST be the ONLY thing between shell_top and shell_bottom.

lines = []
lines.append('const D = {};')

# meta
m = d['meta']
lines.append(f"D.meta = {{slug:{js_str(m['slug'])},latestQuarter:{js_str(m['latestQuarter'])},opportunity:{js_str(m['opportunity'])},opportunityRationale:{js_str(m.get('opportunityRationale',''))},sizeBand:{js_str(m.get('sizeBand',''))},type:{js_str(m.get('type','bank'))}}};")

# basic
b = d['basic']
lines.append(f"D.basic = {{name:{js_str(b['name'])},legal:{js_str(b['legal'])},ticker:{js_str(b['ticker'])},fdic:{js_str(b['fdic'])},parent:{js_str(b['parent'])},rssd:{js_str(b.get('rssd',''))},hq:{js_str(b['hq'])},est:{js_str(b['est'])},ceo:{js_str(b['ceo'])},cfo:{js_str(b['cfo'])},employees:{js_str(b['employees'])},website:{js_str(b['website'])}}};")

# structure
st = d['structure']
par = st['parent']; bnk = st['bank']; inter = st.get('intermediate',None)
subs = st.get('subs',[]); regs = st.get('regulators',[])
inter_str = 'null'
if inter:
    inter_str = f"{{name:{js_str(inter['name'])},type:{js_str(inter['type'])},purpose:{js_str(inter.get('purpose',''))}}}"
subs_arr = []
for s in subs:
    aum = f",aum:{js_str(s['aum'])}" if s.get('aum') else ''
    subs_arr.append(f"{{name:{js_str(s['name'])},type:{js_str(s['type'])},purpose:{js_str(s.get('purpose',''))}{aum}}}")
lines.append(f"D.structure = {{parent:{{name:{js_str(par['name'])},type:{js_str(par['type'])},regulator:{js_str(par['regulator'])},nasdaq:{js_str(par.get('nasdaq','N/A'))},rssd:{js_str(par.get('rssd',''))}}},intermediate:{inter_str},bank:{{name:{js_str(bnk['name'])},type:{js_str(bnk['type'])},fdic:{js_str(bnk.get('fdic',''))},regulator:{js_str(bnk['regulator'])},charter:{js_str(bnk['charter'])}}},subs:[{','.join(subs_arr)}],regulators:{js_str_arr(regs)}}};")

# demo
dm = d['demo']
lines.append(f"D.demo = {{assets:{js_str(dm['assets'])},branches:{js_str(dm['branches'])},states:{js_str(dm['states'])},atms:{js_str(dm.get('atms',''))},markets:{js_str_arr(dm.get('markets',[]))},employees:{js_str(dm['employees'])},rank:{js_str(dm.get('rank',''))},fortune:{js_str(dm.get('fortune',''))},segments:{js_str_arr(dm.get('segments',[]))},digital:{js_str(dm.get('digital',''))}}};")

# contacts — includes execs[] (rich cards) and targetTeams[]
ct = d.get('contacts',{})
prim_arr = [f"{{name:{js_str(p['name'])},title:{js_str(p['title'])},note:{js_str(p.get('note',''))}}}" for p in ct.get('primary',[])]
func_arr = [f"{{name:{js_str(p['name'])},title:{js_str(p['title'])},product:{js_str(p.get('product',''))}}}" for p in ct.get('functional',[])]
execs_arr = []
for ex in ct.get('execs',[]):
    execs_arr.append(f"{{name:{js_str(ex.get('name',''))},title:{js_str(ex.get('title',''))},since:{js_str(ex.get('since',''))},relevance:{js_str(ex.get('relevance',''))},products:{js_str(ex.get('products',''))},col:{js_str(ex.get('col','#60a5fa'))},badge:{js_str(ex.get('badge',''))},bc:{js_str(ex.get('bc','#334155'))},insight:{js_str(ex.get('insight',''))},io:{js_str(ex.get('io',''))}}}")
teams_arr = [f"{{team:{js_str(t.get('team',''))},colour:{js_str(t.get('colour','#60a5fa'))},size:{js_str(t.get('size',''))},approach:{js_str(t.get('approach',t.get('note','')))},note:{js_str(t.get('note',t.get('approach','')))},products:{js_str(t.get('products',''))}}}" for t in ct.get('targetTeams',[])]
lines.append(f"D.contacts = {{primary:[{','.join(prim_arr)}],functional:[{','.join(func_arr)}],execs:[{','.join(execs_arr)}],targetTeams:[{','.join(teams_arr)}],strategy:{js_str(ct.get('strategy',''))}}};")

# finOverview — includes niiSensitivity{}, analystConsensus{}, feeIncome{}
fo = d.get('finOverview',{})
kd_arr = [f"{{label:{js_str(k['label'])},value:{js_str(k['value'])},highlight:{js_bool(k.get('highlight',False))}}}" for k in fo.get('keyDetails',[])]

# niiSensitivity
nii = fo.get('niiSensitivity',{})
bm_arr = [f"{{label:{js_str(bm.get('label',''))},value:{js_str(bm.get('value',''))},colour:{js_str(bm.get('colour','#60a5fa'))},note:{js_str(bm.get('note',''))}}}" for bm in nii.get('betaMetrics',[])]
nii_src_str = '[' + ','.join(f"{{n:{js_str(s.get('n',s.get('label','')))},u:{js_str(s.get('u',s.get('url','')))}}}" for s in (nii.get('src') or [])) + ']'
nii_str = f"{{upBps:{js_num(nii.get('upBps'),25)},upValue:{js_str(nii.get('upValue',''))},upLabel:{js_str(nii.get('upLabel','Per +25bps Fed move'))},upPositive:{js_bool(nii.get('upPositive',True))},downBps:{js_num(nii.get('downBps'),25)},downValue:{js_str(nii.get('downValue',''))},downLabel:{js_str(nii.get('downLabel','Per -25bps Fed move'))},downPositive:{js_bool(nii.get('downPositive',False))},betaMetrics:[{','.join(bm_arr)}],salesAngle:{js_str(nii.get('salesAngle',''))},src:{nii_src_str}}}" if nii else '{}'

# analystConsensus
ac = fo.get('analystConsensus',{})
th_arr = [f"{{label:{js_str(th.get('label',''))},colour:{js_str(th.get('colour','#60a5fa'))},detail:{js_str(th.get('detail',''))}}}" for th in ac.get('keyThemes',[])]
# Build optional badge objects
ac_stock = ac.get('stockBadge', {})
ac_cap = ac.get('capitalBadge', {})
ac_src = ac.get('src', [])
ac_stock_str = f"{{label:{js_str(ac_stock.get('label',''))},value:{js_str(ac_stock.get('value',''))},ticker:{js_str(ac_stock.get('ticker',''))},vsValue:{js_str(ac_stock.get('vsValue',''))},vsLabel:{js_str(ac_stock.get('vsLabel',''))},sub:{js_str(ac_stock.get('sub',''))}}}" if ac_stock else 'null'
ac_cap_str = f"{{label:{js_str(ac_cap.get('label',''))},value:{js_str(ac_cap.get('value',''))},sub:{js_str(ac_cap.get('sub',''))},signal:{js_str(ac_cap.get('signal',''))}}}" if ac_cap else 'null'
ac_src_str = '[' + ','.join([f"{{n:{js_str(s.get('n',''))},u:{js_str(s.get('u',''))}}}" for s in ac_src]) + ']'
ac_str = f"{{mgmtGuidance:{js_str(ac.get('mgmtGuidance',''))},mgmtLabel:{js_str(ac.get('mgmtLabel',''))},streetConsensus:{js_str(ac.get('streetConsensus',''))},streetLabel:{js_str(ac.get('streetLabel',''))},confidenceNote:{js_str(ac.get('confidenceNote',''))},confidenceLevel:{js_str(ac.get('confidenceLevel','AMBER'))},confidenceTitle:{js_str(ac.get('confidenceTitle','Guidance Confidence'))},salesRead:{js_str(ac.get('salesRead',''))},stockBadge:{ac_stock_str},capitalBadge:{ac_cap_str},src:{ac_src_str},keyThemes:[{','.join(th_arr)}]}}" if ac else '{}'

# feeIncome
fi = fo.get('feeIncome',{})
fi_items_arr = []
for item in fi.get('items',[]):
    fi_items_arr.append(f"{{label:{js_str(item.get('label',''))},value:{js_str(item.get('value',''))},trend:{js_str(item.get('trend',''))},colour:{js_str(item.get('colour','#60a5fa'))},note:{js_str(item.get('note',''))},product:{js_str(item.get('product',item.get('curinos','') or ''))},angle:{js_str(item.get('angle',item.get('salesAngle','') or ''))}}}")
fi_src_str = '[' + ','.join(f"{{n:{js_str(s.get('n',s.get('label','')))},u:{js_str(s.get('u',s.get('url','')))}}}" for s in (fi.get('src') or [])) + ']'
fi_str = f"{{items:[{','.join(fi_items_arr)}],salesAngle:{js_str(fi.get('salesAngle',''))},intro:{js_str(fi.get('intro',''))},src:{fi_src_str}}}" if fi else '{}'

lines.append(f"D.finOverview = {{salesTheme:{js_str(fo.get('salesTheme',''))},salesThemeBody:{js_str(fo.get('salesThemeBody',''))},balanceSheetSource:{js_str(fo.get('balanceSheetSource',''))},balanceSheetTrend:{js_str(fo.get('balanceSheetTrend',''))},revenueSource:{js_str(fo.get('revenueSource',''))},revenueTrend:{js_str(fo.get('revenueTrend',''))},keyDetails:[{','.join(kd_arr)}],alert:{js_str(fo.get('alert',''))},alertBody:{js_str(fo.get('alertBody',''))},niiSensitivity:{nii_str},analystConsensus:{ac_str},feeIncome:{fi_str}}};")

# metrics
met_arr = []
for mt in d.get('metrics',[]):
    t = mt.get('t',{})
    src_arr = [f"{{n:{js_str(s.get('n',''))},u:{js_str(s.get('u',''))}}}" for s in t.get('src',[])]
    met_arr.append(f"{{l:{js_str(mt['l'])},v:{js_str(mt['v'])},s:{js_str(mt.get('s',''))},tr:{js_str(mt.get('tr',''))},tu:{js_bool(mt.get('tu',True))},t:{{m:{js_str(t.get('m',''))},sa:{js_str(t.get('sa',''))},o:{js_str(t.get('o','medium'))},p:{js_str_arr(t.get('p',[]))},cite:{js_str(t.get('cite',''))},src:[{','.join(src_arr)}]}}}}")
lines.append(f"D.metrics = [{','.join(met_arr)}];")

# strategy
lines.append(f"D.strategy = {js_str(strategy_str)};")
lines.append(f"D.strategyIntro = {js_str(d.get('strategyIntro',''))};")
st_arr = [f"{{label:{js_str(s['label'])},colour:{js_str(s['colour'])},body:{js_str(s['body'])}}}" for s in d.get('salesTiming',[])]
lines.append(f"D.salesTiming = [{','.join(st_arr)}];")
# strategyPillars — numbered strategy panels in Strategy & Health tab
sp_raw = d.get('strategyPillars', [])
sp_arr = [f"{{title:{js_str(p.get('title',''))},body:{js_str(p.get('body',''))},colour:{js_str(p.get('colour','#60a5fa'))},curinosLink:{js_str(p.get('curinosLink',''))}}}" for p in sp_raw]
lines.append(f"D.strategyPillars = [{','.join(sp_arr)}];")
# businessSegments
bs_raw = d.get('businessSegments', [])
bs_arr = [f"{{name:{js_str(s.get('name',''))},head:{js_str(s.get('head',''))},stat:{js_str(s.get('stat',''))},products:{js_str(s.get('products',''))},colour:{js_str(s.get('colour','#60a5fa'))}}}" for s in bs_raw]
lines.append(f"D.businessSegments = [{','.join(bs_arr)}];")

# health
lines.append(f"D.healthRating = {js_str(d.get('healthRating','Healthy'))};")
lines.append(f"D.healthColour = {js_str(d.get('healthColour','#34d399'))};")
lines.append(f"D.healthNote = {js_str(d.get('healthNote',''))};")

# swot
sw = d.get('swot',{})
lines.append(f"D.swot = {{strengths:{js_str_arr(sw.get('strengths',[]))},weaknesses:{js_str_arr(sw.get('weaknesses',[]))},opportunities:{js_str_arr(sw.get('opportunities',[]))},threats:{js_str_arr(sw.get('threats',[]))}}};")

# curinosAngle
ca = d.get('curinosAngle',{})
lines.append(f"D.curinosAngle = {{title:{js_str(ca.get('title',''))},body:{js_str(ca.get('body',''))}}};")

# maturity
dim_arr = []
for dim in maturity.get('dimensions',[]):
    ev_arr = [f"{{icon:{js_str(ev['icon'])},text:{js_str(ev['text'])},cite:{js_str(ev.get('cite',''))}}}" for ev in dim.get('evidence',[])]
    dim_arr.append(f"{{title:{js_str(dim['title'])},score:{js_num(dim.get('score'),0)},summary:{js_str(dim.get('summary',''))},evidence:[{','.join(ev_arr)}],implication:{js_str(dim.get('implication',''))}}}")
# Handle both key formats: overall_score/overall_tier (new) and overall/tier (legacy)
mat_score = maturity.get('overall', maturity.get('overall_score', 2.0))
mat_tier_raw = maturity.get('overall_tier', None)
if mat_tier_raw is not None and isinstance(mat_tier_raw, (int, float)):
    tier_map = {1: 'Tier 1', 2: 'Tier 2', 3: 'Tier 3', 4: 'Tier 4'}
    mat_tier = tier_map.get(int(mat_tier_raw), f'Tier {int(mat_tier_raw)}')
else:
    mat_tier = maturity.get('tier', maturity.get('overall_tier', 'Tier 2'))
    if not isinstance(mat_tier, str):
        mat_tier = 'Tier 2'
lines.append(f"D.maturity = {{overall:{js_num(mat_score,2.0)},tier:{js_str(mat_tier)},dimensions:[{','.join(dim_arr)}]}};")

# productSequencing
ps_arr = [f"{{tier:{js_str(ps['tier'])},products:{js_str(ps['products'])},active:{js_bool(ps['active'])},note:{js_str(ps.get('note',''))}}}" for ps in d.get('productSequencing',[])]
lines.append(f"D.productSequencing = [{','.join(ps_arr)}];")

# peers + nimTrend + radarMetrics + summary + watchlist
# shell reads D.peers[key][] for the table
# setupPeerCharts reads D.peers.nimTrend[{name,quarters,values}], D.peers.radarMetrics[], D.peers.summary, D.peers.watchlist
peers_dict = d.get('peers',{})
peer_key = list(peers_dict.keys())[0] if peers_dict else 'regionals'
pr_arr = []
for pr in peers_dict.get(peer_key,[]):
    # A null peer value used to fall through to js_str(str(None)) and render the
    # literal word "None" in the client-facing table. Emit the same "--" the
    # shell already uses for a missing cell. Booleans are checked BEFORE the
    # numeric branch: bool is a subclass of int and would emit a bare True.
    fields = []
    for k,v in pr.items():
        if isinstance(v, bool):
            fields.append(f"{k}:{js_bool(v)}")
        elif isinstance(v, (int, float)):
            fields.append(f"{k}:{js_num(v)}")
        elif v is None or (isinstance(v, str) and not v.strip()):
            fields.append(f"{k}:{js_str('--')}")
        else:
            fields.append(f"{k}:{js_str(str(v))}")
    pr_arr.append('{' + ','.join(fields) + '}')

# Convert top-level D.nimTrend{labels,target,peers{}} -> D.peers.nimTrend[{name,quarters,values}]
nt = d.get('nimTrend',{})
nt_labels = nt.get('labels',[])
nim_series = []
if nt.get('target') and nt_labels:
    target_name = peers_dict.get(peer_key,[{}])[0].get('n','Institution')
    nim_series.append(f"{{name:{js_str(target_name)},quarters:{js_str_arr(nt_labels)},values:[{','.join(js_num2(x) for x in nt['target'])}]}}")
for peer_name, vals in nt.get('peers',{}).items():
    nim_series.append(f"{{name:{js_str(peer_name)},quarters:{js_str_arr(nt_labels)},values:[{','.join(js_num2(x) for x in vals)}]}}")

# Build radarMetrics automatically from peer table if not explicitly provided
radar_raw = peers_dict.get('radarMetrics', d.get('radarMetrics', []))
if not radar_raw and len(peers_dict.get(peer_key,[])) >= 2:
    def norm_score(val_str, all_vals_str, higher_is_better):
        try:
            v = float(str(val_str).replace('%','').replace('~','').strip())
            vals = [float(str(x).replace('%','').replace('~','').strip()) for x in all_vals_str if x]
            mn,mx = min(vals),max(vals)
            if mx == mn: return 50
            pct = (v-mn)/(mx-mn)*100
            return round(pct if higher_is_better else 100-pct)
        except: return 50
    for metric, label, hib in [('nim','NIM',True),('dep_cost','Deposit Cost',False),('eff','Efficiency',False),('cet1','CET1',True),('roaa','ROAA',True)]:
        all_vals = [r.get(metric) for r in peers_dict[peer_key] if r.get(metric) is not None]
        if all_vals:
            t_score = norm_score(peers_dict[peer_key][0].get(metric,0), all_vals, hib)
            p_scores = [norm_score(p.get(metric,0), all_vals, hib) for p in peers_dict[peer_key][1:]]
            p_avg = round(sum(p_scores)/len(p_scores)) if p_scores else 50
            radar_raw.append({'label':label,'targetScore':t_score,'peerScore':p_avg})
rm_arr = [f"{{label:{js_str(rm.get('label',''))},targetScore:{js_num(rm.get('targetScore'),50)},peerScore:{js_num(rm.get('peerScore'),50)}}}" for rm in radar_raw]

# summary and watchlist
peer_summary = peers_dict.get('summary', d.get('peerSummary', {}))
leads_arr = js_str_arr(peer_summary.get('leads', []))
watch_arr = js_str_arr(peer_summary.get('watch', []))
watchlist_raw = peers_dict.get('watchlist', d.get('peerWatchlist', []))
wl_arr = [f"{{competitor:{js_str(w.get('competitor',''))},colour:{js_str(w.get('colour','#f87171'))},urgency:{js_str(w.get('urgency',''))},detail:{js_str(w.get('detail',''))}}}" for w in watchlist_raw]

# peers.commentary drives the observation / sales-angle box under the peer table
# and under each of the four peer charts. SHELL_BOTTOM reads D.peers.commentary
# (as `pc`), but this line never emitted it — so `pc` was always {} and four of
# the five boxes silently did not render on any dashboard ever built. Only the
# table box had a fallback to salesAngle. The shell accepts both spellings for
# two of the keys (efficiency/eff, depositCost/dep), so emit both.
_pcm = peers_dict.get('commentary', {}) or {}
_pc_pairs = []
for _k in ('table', 'nim', 'radar', 'depositCost', 'efficiency'):
    _v = _pcm.get(_k, '')
    if _v:
        _pc_pairs.append(f"{_k}:{js_str(_v)}")
if _pcm.get('depositCost'):
    _pc_pairs.append(f"dep:{js_str(_pcm['depositCost'])}")
if _pcm.get('efficiency'):
    _pc_pairs.append(f"eff:{js_str(_pcm['efficiency'])}")
_pc_str = "{" + ",".join(_pc_pairs) + "}"

# peers.peerSources[] -- the citation links under the peer table. The shell's
# peer() never had a source key to read, so peer sourcing has never rendered on
# any dashboard. Recent intel files carry {n,u}; a few carry {label,url}. Older
# files carry nothing at all, and must keep rendering exactly as before.
_psrc = peers_dict.get('peerSources', []) or []
_psrc_str = '[' + ','.join(f"{{n:{js_str(s.get('n', s.get('label','')))},u:{js_str(s.get('u', s.get('url','')))}}}" for s in _psrc if isinstance(s, dict)) + ']'

lines.append(f"D.peers = {{{peer_key}:[{','.join(pr_arr)}],nimTrend:[{','.join(nim_series)}],radarMetrics:[{','.join(rm_arr)}],summary:{{leads:{leads_arr},watch:{watch_arr}}},watchlist:[{','.join(wl_arr)}],commentary:{_pc_str},peerSources:{_psrc_str},salesAngle:{js_str(peers_dict.get('salesAngle', d.get('peerSalesAngle','')))}}};")

# Also emit D.nimTrend as a top-level field (new format for chart rendering)
# setupPeerCharts checks D.nimTrend first, then D.peers.nimTrend as fallback
nt_target = '[' + ','.join(js_num(x) for x in nt.get('target',[])) + ']'
nt_peers_parts = ','.join(f"{js_str(name)}:[{','.join(js_num(x) for x in vals)}]" for name,vals in nt.get('peers',{}).items())
lines.append(f"D.nimTrend = {{labels:{js_str_arr(nt_labels)},target:{nt_target},peers:{{{nt_peers_parts}}}}};")

# loans — fundingMix[] read from D.loans.fundingMix[] in the shell (NOT D.funding)
loans = d.get('loans',{})
mix_arr = [f"{{label:{js_str(mx['label'])},pct:{js_num(mx.get('pct'),0)},value:{js_str(mx.get('value',''))},opp:{js_str(mx.get('opp','medium'))},note:{js_str(mx.get('note',''))}}}" for mx in loans.get('mix',[])]
suite = loans.get('fullSuite',{})
suite_fields = ','.join(f"{js_str(k)}:{js_str(v)}" for k,v in suite.items())
funding = d.get('funding',{})
fund_items = [f"{{label:{js_str(f.get('label',''))},value:{js_str(f.get('value',''))},pct:{js_num(f.get('pct'),50)},colour:{js_str(f.get('colour','#3b82f6'))},note:{js_str(f.get('note',''))}}}" for f in funding.get('items',[])]
lines.append(f"D.loans = {{totalLoansB:{js_num(loans.get('totalLoansB'),0)},totalDepositsB:{js_num(funding.get('totalDepositsB'),0)},source:{js_str(loans.get('source',''))},mix:[{','.join(mix_arr)}],narrative:{js_str(loans.get('narrative',''))},fullSuite:{{{suite_fields}}},fundingMix:[{','.join(fund_items)}],fundingNote:{js_str(funding.get('salesNote',''))}}};")

# maturityProfile (optional) — for loansProd Maturity & Liquidity tab
mp = d.get('maturityProfile', {})
if mp:
    bkt_arr = [f"{{label:{js_str(b.get('label',''))},value:{js_str(b.get('value',''))},pct:{js_str(b.get('pct',''))},colour:{js_str(b.get('colour','#60a5fa'))},signal:{js_str(b.get('signal',''))}}}" for b in mp.get('buckets',[])]
    lines.append(f"D.maturityProfile = {{buckets:[{','.join(bkt_arr)}],salesAngle:{js_str(mp.get('salesAngle',''))}}};")
else:
    lines.append("D.maturityProfile = null;")

# liquidity (optional) — for loansProd Liquidity KPIs panel
liq = d.get('liquidity', {})
if liq:
    kpi_arr = [f"{{label:{js_str(k.get('label',''))},value:{js_str(k.get('value',''))},colour:{js_str(k.get('colour','#60a5fa'))},note:{js_str(k.get('note',''))}}}" for k in liq.get('kpis',[])]
    lines.append(f"D.liquidity = {{kpis:[{','.join(kpi_arr)}],salesNote:{js_str(liq.get('salesNote',''))}}};")
else:
    lines.append("D.liquidity = null;")
lines.append(f"D.funding = {{items:[{','.join(fund_items)}],salesNote:{js_str(funding.get('salesNote',''))}}};")

# products — scoring integrity validation
# Validates pri/fit consistency and warns about scoring inflation
_products = d.get('products', [])

# Catalogue V4: products scored by score_v4.py carry scoring.modelVersion == "V4".
# Those scores are mechanical and must not be touched here — only warn if any
# product in the file was NOT produced by the scorer (mixed or hand-scored files).
_v4 = [p for p in _products if (p.get('scoring') or {}).get('modelVersion') == 'V4']
if _v4 and len(_v4) != len(_products):
    print(f"  SCORE WARNING: {len(_products)-len(_v4)} product(s) lack V4 scoring — re-run score_v4.py --write")
if _v4 and not d.get('scoringInputs'):
    print("  SCORE WARNING: V4-scored products but no scoringInputs block — scores cannot be audited")

# 1. Auto-correct pri based on fit score if obviously wrong
_corrected = 0
for p in _products:
    if (p.get('scoring') or {}).get('modelVersion') == 'V4':
        continue  # mechanical V4 scores (with caps/floors) are authoritative — never auto-corrected
    fit = p.get('fit', 50)
    pri = p.get('pri', 2)
    # Hard corrections: if fit < 40 → pri must be DNR (exclude), if fit < 55 → pri=3 max
    # Soft warnings only — don't override careful manual scoring
    if fit >= 75 and pri == 3:
        print(f"  SCORE WARNING: {p.get('name')} has fit={fit}% but pri=3 — consider upgrading to P2")
    if fit < 55 and pri == 1:
        print(f"  SCORE WARNING: {p.get('name')} has fit={fit}% but pri=1 — this should be P2 or P3")
        p['pri'] = 2  # Auto-correct clearly wrong assignments
        _corrected += 1
    if fit < 40 and pri <= 2:
        print(f"  SCORE WARNING: {p.get('name')} has fit={fit}% — should be P3 or excluded (DNR)")
        p['pri'] = 3
        _corrected += 1

# 2. Scoring distribution warning
all_fits = [p.get('fit', 50) for p in _products]
if all_fits and min(all_fits) > 70 and len(_products) > 8:
    print(f"  SCORING INFLATION WARNING: All {len(_products)} products score >{min(all_fits)}%")
    print(f"  Even for large banks, expect some products to score 40-65%. Review scoring rigor.")

# 3. Sort: by pri asc, then fit desc within each priority group
_products.sort(key=lambda p: (p.get('pri', 99), -p.get('fit', 0)))

if _corrected:
    print(f"  Auto-corrected {_corrected} obviously misassigned product priorities")

prod_arr = []
for p in _products:
    obj_arr = [f"{{q:{js_str(obj['q'])},a:{js_str(obj['a'])}}}" for obj in p.get('objections',[])]
    sc = p.get('scoring',{})
    scoring_str = ''
    if sc:
        scoring_str = f",scoring:{{sizeType:{js_num(sc.get('sizeType',sc.get('size')),0)},sizeRationale:{js_str(sc.get('sizeRationale',''))},segment:{js_num(sc.get('segment'),0)},segRationale:{js_str(sc.get('segRationale',''))},maturity:{js_num(sc.get('maturity'),0)},matRationale:{js_str(sc.get('matRationale',''))},need:{js_num(sc.get('need'),0)},painRationale:{js_str(sc.get('painRationale',''))},feasibility:{js_num(sc.get('feasibility'),0)},feasRationale:{js_str(sc.get('feasRationale',''))},formula:{js_str(sc.get('formula',''))},stratTags:{js_str(sc.get('stratTags',''))},modelVersion:{js_str(sc.get('modelVersion',''))},timing:{js_num(sc.get('timing'),0)},timingRationale:{js_str(sc.get('timingRationale',''))},readiness:{js_num(sc.get('readiness'),0)},gateRationale:{js_str(sc.get('gateRationale',''))},caps:{js_str(sc.get('caps',''))}}}"
    prod_arr.append(f"{{cat:{js_str(p.get('cat',''))},name:{js_str(p['name'])},fit:{js_num(p.get('fit'),0)},pri:{js_num(p.get('pri'),3)},need:{js_str(p.get('need',''))},what:{js_str(p.get('what',''))},why:{js_str(p.get('why',''))},use:{js_str_arr(p.get('use',[]))},roi:{js_str(p.get('roi',''))},time:{js_str(p.get('time',''))},talk:{js_str(p.get('talk',''))},contacts:{js_str(p.get('contacts',''))},objections:[{','.join(obj_arr)}],roadmap:{'true' if p.get('roadmap') else 'false'},availabilityUnconfirmed:{'true' if p.get('availabilityUnconfirmed') else 'false'}{scoring_str}}}")
lines.append(f"D.products = [{','.join(prod_arr)}];")

# dnrProducts — products explicitly excluded (scored < 40 or segment gate failure)
# Intel JSON: dnrProducts: [{name, reason}]
dnr_raw = d.get('dnrProducts', [])
dnr_arr = [f"{{name:{js_str(r.get('name',''))},reason:{js_str(r.get('reason','Below fit threshold'))}}}" for r in dnr_raw]
lines.append(f"D.dnrProducts = [{','.join(dnr_arr)}];")

# productScoringNote — optional override of the scoring explanation shown in the dashboard
scoring_note = d.get('productScoringNote', '')
lines.append(f"D.productScoringNote = {js_str(scoring_note)};")

# product fit text
pss = d.get('productSectionSubtitles',{})
lines.append(f"D.productFitIntro = {js_str(d.get('productFitIntro',''))};")
lines.append(f"D.productFitIntroBody = {js_str(d.get('productFitIntroBody',''))};")
lines.append(f"D.productSectionSubtitles = {{p1:{js_str(pss.get('p1',''))},p2:{js_str(pss.get('p2',''))},p3:{js_str(pss.get('p3',''))}}};")

# ── NEW FIELDS (Analytics & Technology tab + Org & People tab) ────────────

# decisionIntelligence — drives Decision Intelligence Inventory panel
# Shell expects: {categories:[{label, colour, source, items:[{name,domain,note}]}]}
# label MUST be one of: "Built In-House"|"Vendor -- Confirmed"|"Vendor -- Inferred"|"Gap -- No Capability"|"Open Source / Partner"
# Normalise any legacy category names produced by the intel skill
dii_raw = d.get('decisionIntelligence', [])
_dii_cat_colours = {'Built In-House':'#34d399','Vendor -- Confirmed':'#60a5fa','Vendor -- Inferred':'#fbbf24','Gap -- No Capability':'#f87171','Open Source / Partner':'#a78bfa'}
_dii_cat_map = {'Third-Party / Vendor':'Vendor -- Inferred','Gap / Opportunity':'Gap -- No Capability','Gap / Missing':'Gap -- No Capability','Inferred':'Vendor -- Inferred'}
cats_dict = {}
for item in dii_raw:
    raw_cat = item.get('category', 'Built In-House')
    cat_name = _dii_cat_map.get(raw_cat, raw_cat)  # normalise legacy names
    if cat_name not in cats_dict: cats_dict[cat_name] = []
    cats_dict[cat_name].append(item)
dii_cats = []
for cat_name, items in cats_dict.items():
    col = _dii_cat_colours.get(cat_name, '#60a5fa')
    items_js = [f"{{name:{js_str(it.get('name',''))},domain:{js_str(it.get('domain',''))},note:{js_str(str(it.get('signal', it.get('note','')))[:150])}}}" for it in items]
    dii_cats.append(f"{{label:{js_str(cat_name)},colour:{js_str(col)},source:{js_str('Public filings, job postings, product pages, earnings calls')},items:[{','.join(items_js)}]}}")
# Dual-format output: flat array if intel uses signal/implication/action, else categories object
_dii_is_flat = any('signal' in item or 'implication' in item for item in dii_raw)
if _dii_is_flat:
    dii_flat_arr = []
    for item in dii_raw:
        url_s = f",url:{js_str(item['url'])}" if item.get('url') else ''
        src_s = f",source:{js_str(item.get('source',''))}" if item.get('source') else ''
        dii_flat_arr.append(f"{{signal:{js_str(item.get('signal',''))},implication:{js_str(item.get('implication',''))},action:{js_str(item.get('action',''))}{src_s}{url_s}}}")
    lines.append(f"D.decisionIntelligence = [{','.join(dii_flat_arr)}];")
else:
    lines.append(f"D.decisionIntelligence = {{description:{js_str('Technology signals sourced from public filings, job postings, and vendor press releases.')},salesNote:{js_str(d.get('diiSalesNote',''))},categories:[{','.join(dii_cats)}]}};")

# techPlatforms — drives Verified Digital Platforms section
# Shell expects status as lowercase key: "verified" | "inferred" | "gap"
# Normalise any uppercase or verbose values from the intel skill
tp_data = d.get('techPlatforms', [])
tp_arr = []
for p in tp_data:
    raw_st = str(p.get('status', 'inferred')).lower()
    if 'verified' in raw_st: st = 'verified'
    elif 'gap' in raw_st: st = 'gap'
    else: st = 'inferred'
    st_label = p.get('statusLabel', {'verified':'VERIFIED -- LIVE','gap':'GAP -- OPPORTUNITY','inferred':'INFERRED'}[st])
    tp_arr.append(f"{{name:{js_str(p.get('name',''))},status:{js_str(st)},statusLabel:{js_str(st_label)},description:{js_str(p.get('description',''))},url:{js_str(p.get('url',''))}}}")
lines.append(f"D.techPlatforms = [{','.join(tp_arr)}];")

# siloAssessment — shell reads D.siloAssessment.groups[{title,status,detail,salesAngle}]
# Normalise from either groups[] format OR legacy evidence[] format
silo = d.get('siloAssessment', {})
groups_raw = silo.get('groups', [])
if groups_raw:
    grp_arr = [f"{{title:{js_str(g.get('title',''))},status:{js_str(g.get('status','partial'))},detail:{js_str(g.get('detail',''))},salesAngle:{js_str(g.get('salesAngle',''))}}}" for g in groups_raw]
else:
    grp_arr = [f"{{title:{js_str(ev.get('label',''))},status:{js_str('integrated' if ev.get('integrated') else 'fragmented')},detail:{js_str(ev.get('note',''))},salesAngle:{js_str('')}}}" for ev in silo.get('evidence', [])]
int_arr = [f"{{signal:{js_str(s['signal'])},src:{js_str(s.get('src',''))}}}" for s in silo.get('integrationSignals',[])]
sil_arr = [f"{{signal:{js_str(s['signal'])},src:{js_str(s.get('src',''))}}}" for s in silo.get('siloSignals',[])]
si_arr = [f"{{label:{js_str(s['label'])},body:{js_str(s['body'])}}}" for s in silo.get('salesImplications',[])]
ss_arr = [f"{{n:{js_str(s['n'])},u:{js_str(s['u'])}}}" for s in silo.get('siloSrc',[])]
lines.append(f"D.siloAssessment = {{integration:{js_str(silo.get('integration','partial'))},verdict:{js_str(silo.get('verdict',''))},intro:{js_str(silo.get('description',silo.get('salesAngle','')))},salesAngle:{js_str(silo.get('salesAngle',silo.get('salesImplication','')))},groups:[{','.join(grp_arr)}],integrationSignals:[{','.join(int_arr)}],siloSignals:[{','.join(sil_arr)}],salesImplications:[{','.join(si_arr)}],siloSrc:[{','.join(ss_arr)}]}};")

# capabilityGaps — drives Capability Gap Map panel on Analytics tab
# IMPORTANT: emit BOTH 'gaps' AND 'opportunities' keys so shell atGaps() always finds them
# shell reads: gaps.opportunities||gaps.gaps
cg = d.get('capabilityGaps', {})
gaps_list = cg.get('gaps', cg.get('opportunities', []))
lines.append(f"D.capabilityGaps = {{intro:{js_str(cg.get('intro',''))},strengths:{js_str_arr(cg.get('strengths',[]))},gaps:{js_str_arr(gaps_list)},opportunities:{js_str_arr(gaps_list)},salesNote:{js_str(cg.get('salesNote',''))}}};")

# news — full enhanced build with analyst ratings (URL, direction), key themes,
# earnings Q&A, press coverage (articles), and 3-window sales timing
# Required intel JSON fields:
#   news.items[]: title, body, date, source, url, colour, tag, salesAngle (opt), quote (opt)
#   news.analystRatings[]: firm, analyst, rating, target, direction, note, date, url
#   news.keyThemes[]: theme, colour, icon, urgency, detail, salesAngle, source, url
#   news.earningsQA[]: question, analyst, answer, salesAngle, source, url
#   news.articles[]: date, src, tag, tagLabel, hl, sum, url  (press coverage)
#   news.salesTiming: intro, windows[{label, colour, body, action}]
#   news.currentPrice: e.g. "~$46" (for implied upside calc in analyst panel)
#   news.consensusNote: disclaimer text shown below analyst consensus panel
nws = d.get('news',{})

# news items
items_arr = []
for item in nws.get('items',[]):
    q_str = f",quote:{js_str(item['quote'])},quoteAttrib:{js_str(item.get('quoteAttrib',''))}" if item.get('quote') else ''
    sa_str = f",salesAngle:{js_str(item['salesAngle'])}" if item.get('salesAngle') else ''
    tag = item.get('tag','')
    if not tag:
        tag = {'green':'earnings','blue':'strategy','amber':'risk','red':'risk','purple':'digital'}.get(item.get('colour','blue'),'earnings')
    url_str = f",url:{js_str(item.get('url',''))}" if item.get('url') else ''
    items_arr.append(f"{{colour:{js_str(item.get('colour','blue'))},tag:{js_str(tag)},title:{js_str(item.get('title',item.get('headline','')))},body:{js_str(item.get('body',item.get('summary','')))},source:{js_str(item.get('source',''))},date:{js_str(item.get('date',''))}{q_str}{sa_str}{url_str}}}")

# analystRatings — rich cards with direction (up/hold/down) and clickable source URL
ar_arr = []
for r in nws.get('analystRatings',[]):
    url_str = f",url:{js_str(r['url'])}" if r.get('url') else ''
    dir_str = f",direction:{js_str(r.get('direction','hold'))}"
    ar_arr.append(f"{{firm:{js_str(r.get('firm',''))},analyst:{js_str(r.get('analyst',''))},rating:{js_str(r.get('rating',''))},target:{js_str(r.get('target',''))},note:{js_str(r.get('note',''))},date:{js_str(r.get('date',''))}{dir_str}{url_str}}}")

# keyThemes — analyst theme cards with urgency badges and sales angles
kt_arr = []
for t in nws.get('keyThemes',[]):
    url_str = f",url:{js_str(t['url'])}" if t.get('url') else ''
    sa_str = f",salesAngle:{js_str(t['salesAngle'])}" if t.get('salesAngle') else ''
    kt_arr.append(f"{{theme:{js_str(t.get('theme',''))},colour:{js_str(t.get('colour','#60a5fa'))},icon:{js_str(t.get('icon','📌'))},urgency:{js_str(t.get('urgency',''))},detail:{js_str(t.get('detail',''))},source:{js_str(t.get('source',''))}{sa_str}{url_str}}}")

# earningsQA — Q&A from earnings calls with analyst name and sales angle
qa_arr = []
for q in nws.get('earningsQA',[]):
    url_str = f",url:{js_str(q['url'])}" if q.get('url') else ''
    sa_str = f",salesAngle:{js_str(q['salesAngle'])}" if q.get('salesAngle') else ''
    qa_arr.append(f"{{question:{js_str(q.get('question',q.get('q','')))},analyst:{js_str(q.get('analyst',''))},answer:{js_str(q.get('answer',''))},source:{js_str(q.get('source',''))}{sa_str}{url_str}}}")

# articles — press coverage cards with clickable source links
art_arr = []
for a in nws.get('articles',[]):
    art_arr.append(f"{{date:{js_str(a.get('date',''))},src:{js_str(a.get('src',a.get('source','')))},tag:{js_str(a.get('tag','tag-strat'))},tagLabel:{js_str(a.get('tagLabel','Strategy'))},hl:{js_str(a.get('hl',a.get('headline',a.get('title',''))))},sum:{js_str(a.get('sum',a.get('summary',a.get('body',''))))},url:{js_str(a.get('url',''))}}}")

# salesTiming — 3-window grid (NOW/NEAR/FUTURE)
nst = nws.get('salesTiming',{})
nst_win_arr = []
for w in nst.get('windows',[]):
    act_str = f",action:{js_str(w['action'])}" if w.get('action') else ''
    nst_win_arr.append(f"{{label:{js_str(w.get('label',''))},colour:{js_str(w.get('colour','#fbbf24'))},body:{js_str(w.get('body',''))}{act_str}}}")

# legacy actions fallback
nst_act = [f"{{label:{js_str(a['label'])},body:{js_str(a['body'])}}}" for a in nst.get('actions',[])]

lines.append(f"D.news = {{headline:{js_str(nws.get('headline',''))},intro:{js_str(nws.get('intro',''))},items:[{','.join(items_arr)}],analystRatings:[{','.join(ar_arr)}],keyThemes:[{','.join(kt_arr)}],earningsQA:[{','.join(qa_arr)}],articles:[{','.join(art_arr)}],currentPrice:{js_str(nws.get('currentPrice',''))},consensusNote:{js_str(nws.get('consensusNote',''))},salesTiming:{{intro:{js_str(nst.get('intro',''))},windows:[{','.join(nst_win_arr)}],title:{js_str(nst.get('title',''))},body:{js_str(nst.get('body',''))},actions:[{','.join(nst_act)}]}}}};")

# salesPlaybook
sp = d.get('salesPlaybook',{})
ap_arr = [f"{{period:{js_str(a['period'])},body:{js_str(a['body'])}}}" for a in sp.get('actionPlan',[])]
dq_groups = []
for grp in sp.get('discoveryQ',[]):
    qs = [f"{{topic:{js_str(q['topic'])},q:{js_str(q['q'])}}}" for q in grp.get('questions',[])]
    dq_groups.append(f"{{audience:{js_str(grp['audience'])},questions:[{','.join(qs)}]}}")
et_arr = [f"{{label:{js_str(t['label'])},body:{js_str(t['body'])}}}" for t in sp.get('emailTemplates',[])]
lm_arr = [f"{{competitor:{js_str(l['competitor'])},colour:{js_str(l['colour'])},objection:{js_str(l['objection'])},rebuttal:{js_str(l['rebuttal'])}}}" for l in sp.get('landmines',[])]
pp_arr = [f"{{stat:{js_str(p2['stat'])},label:{js_str(p2['label'])},colour:{js_str(p2['colour'])}}}" for p2 in sp.get('proofPoints',[])]
ag_arr = [f"{{time:{js_str(a['time'])},title:{js_str(a['title'])},detail:{js_str(a['detail'])}}}" for a in sp.get('agenda',[])]
vp_arr = [f"{{audience:{js_str(v['audience'])},pitch:{js_str(v['pitch'])}}}" for v in sp.get('valueProps',[])]
lines.append(f"D.salesPlaybook = {{intro:{js_str(sp.get('intro',''))},actionPlan:[{','.join(ap_arr)}],discoveryQ:[{','.join(dq_groups)}],emailTemplates:[{','.join(et_arr)}],landmines:[{','.join(lm_arr)}],proofPoints:[{','.join(pp_arr)}],agenda:[{','.join(ag_arr)}],valueProps:[{','.join(vp_arr)}]}};")

# sources — top-level citation list. Used as the fallback source links in
# several tooltips (balance sheet/revenue trend, entity structure, decision
# intelligence). This line was MISSING from the script entirely — D.sources
# was never assigned, so every one of those tooltip fallbacks silently
# rendered no links regardless of what the intel JSON's sources[] contained.
src_top_arr = [f"{{label:{js_str(s.get('label',''))},url:{js_str(s.get('url',''))}}}" for s in d.get('sources',[])]
lines.append(f"D.sources = [{','.join(src_top_arr)}];")

# charts
ch = d.get('charts',{})
bs = ch.get('balanceSheet',{}); rv = ch.get('revenue',{})
# Chart series are the only numbers in this builder that never pass through
# js_str()/clean(). A null quarter must become a JS `null` -- Chart.js draws a
# gap -- and NOT the bare identifier `None`, which aborts the whole script.
lines.append(f"D.charts = {{balanceSheet:{{labels:{js_str_arr(bs.get('labels',[]))},assets:[{','.join(js_num(x) for x in bs.get('assets',[]) or [])}],loans:[{','.join(js_num(x) for x in bs.get('loans',[]) or [])}],deposits:[{','.join(js_num(x) for x in bs.get('deposits',[]) or [])}]}},revenue:{{labels:{js_str_arr(rv.get('labels',[]))},nii:[{','.join(js_num(x) for x in rv.get('nii',[]) or [])}],nonii:[{','.join(js_num(x) for x in rv.get('nonii',[]) or [])}]}}}};")

d_object = '\n'.join(lines)

# ── MANDATORY: Validate JS syntax before writing ──────────────────────────────
with open('/tmp/test_d_object.js', 'w') as f:
    f.write(d_object)
result = subprocess.run(['node', '--check', '/tmp/test_d_object.js'], capture_output=True, text=True)
if result.returncode != 0:
    print("FATAL JS SYNTAX ERROR — DO NOT DELIVER:")
    print(result.stdout[:800])
    raise SystemExit("Fix syntax errors before proceeding.")
print("JS syntax: CLEAN")

# ── Concatenate ──────────────────────────────────────────────────────────────
output = shell_top + '\n' + d_object + '\n' + shell_bottom
slug = d['meta']['slug']
outfile = f'/mnt/user-data/outputs/{slug}-curinos-dashboard.html'

# ── MANDATORY GATE: no bare Python literal may reach the JS ──────────────────
# node --check above is a SYNTAX check and cannot catch this: `None` is a
# perfectly legal JS identifier, so the file parses, and then throws
# ReferenceError at load, aborting the whole concatenated script before the
# initBankBar(); rt(); rc(); bootstrap at its end -- the page renders nothing.
# Scan every emitted D.* assignment for a bare literal OUTSIDE a quoted string
# (quoted strings are masked first, so the word "None" in prose is safe) and
# refuse to write the file if one survives. A build that fails loudly is
# enormously better than one that ships a blank page.
_JS_SQ_STRING_RE = re.compile(r"'(?:\\.|[^'\\])*'")
_BARE_LITERAL_RE = re.compile(r"(?<![\w$.'\"])(None|True|False|NaN|Infinity)(?![\w$])")

def find_bare_literals(text):
    """Return [(key, literal, column, fragment)] for every bare Python literal."""
    hits = []
    in_intel = False
    for line in text.split('\n'):
        if 'id="curinos-intel"' in line:          # embedded intel JSON, if present
            in_intel = True
        if in_intel:
            if '</script>' in line:
                in_intel = False
            continue
        if not line.startswith('D.'):
            continue
        key = line.split('=', 1)[0].strip()
        # Blank out quoted strings but keep every column aligned.
        masked = _JS_SQ_STRING_RE.sub(lambda mm: "'" + ' ' * (len(mm.group(0)) - 2) + "'", line)
        for mm in _BARE_LITERAL_RE.finditer(masked):
            start = max(0, mm.start() - 60)
            hits.append((key, mm.group(1), mm.start(), line[start:mm.end() + 60]))
    return hits

_bare = find_bare_literals(output)
if _bare:
    print("FATAL: bare Python literal reached the JavaScript -- REFUSING TO WRITE")
    print("       (node --check passes on these; the page still renders blank.)")
    for key, lit, col, frag in _bare[:20]:
        print(f"  {key} col {col}: {lit!r} in ...{frag}...")
    if len(_bare) > 20:
        print(f"  ... and {len(_bare) - 20} more")
    raise SystemExit("Route these values through js_num() before delivering.")
print(f"Bare-literal gate: CLEAN ({len(output.splitlines())} lines scanned)")

# ── Write ────────────────────────────────────────────────────────────────────
with open(outfile, 'w', encoding='ascii', errors='ignore') as f:
    f.write(output)
print(f'Written: {outfile} ({len(output):,} bytes)')
