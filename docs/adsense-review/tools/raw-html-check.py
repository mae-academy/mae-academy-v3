"""Fetch each URL with the Mediapartners-Google UA via curl, save raw HTML, and report status,
visible-text word count (tags/scripts/styles/noscript-css stripped), AdSense <head> snippet, canonical.
Usage: python3 -I raw-html-check.py <base-url> <out-dir> <label>"""
import html, json, os, re, subprocess, sys

base, out, label = sys.argv[1], sys.argv[2], sys.argv[3]
URLS = ["/", "/simulations", "/simulations/control-systems/pid", "/simulations/control-systems/root-locus",
        "/simulations/power-electronics/rectifier", "/simulations/plc", "/simulations/code/masm8086",
        "/library", "/library/ia:example-id", "/research", "/research/W2741809807",
        "/about", "/contact", "/privacy", "/privacy-policy", "/terms", "/attribution-policy",
        "/ar", "/es", "/robots.txt", "/sitemap.xml", "/ads.txt", "/this-page-does-not-exist"]
UA = "Mediapartners-Google"
os.makedirs(out, exist_ok=True)

def visible_words(doc):
    doc = re.sub(r"(?is)<(script|style|noscript|template)\b.*?</\1>", " ", doc)
    doc = re.sub(r"(?is)<math\b.*?</math>", " ", doc)  # equations excluded: prose words only
    doc = re.sub(r"(?s)<!--.*?-->", " ", doc)
    text = html.unescape(re.sub(r"(?s)<[^>]+>", " ", doc))
    return len(re.findall(r"\w+", text))

rows = []
for u in URLS:
    r = subprocess.run(["curl", "-s", "-A", UA, "-o", "-", "-w", "\n__STATUS__%{http_code}", base + u], capture_output=True, text=True)
    body, status = r.stdout.rsplit("\n__STATUS__", 1)
    name = (u.strip("/").replace("/", "__").replace(":", "_") or "home")
    with open(os.path.join(out, f"{label}--{name}.raw"), "w") as f:
        f.write(body)
    head = body.split("</head>")[0] if "</head>" in body else ""
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', head)
    title = re.search(r"<title>(.*?)</title>", head, re.S)
    rows.append({"url": u, "status": int(status), "bytes": len(body.encode()),
                 "words": visible_words(body) if body.lstrip().lower().startswith("<!doctype html") else None,
                 "adsense_in_head": "pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1937330840014217" in head,
                 "canonical": canon.group(1) if canon else None,
                 "title": html.unescape(title.group(1).strip()) if title else None,
                 "challenge": bool(re.search(r"cf-chl|challenge-platform|Just a moment", body))})
json.dump(rows, open(os.path.join(out, f"{label}-results.json"), "w"), indent=1)
print(f"| URL | status | words (visible, raw HTML) | AdSense in head | canonical | title |")
print("|---|---|---|---|---|---|")
for r in rows:
    print(f"| `{r['url']}` | {r['status']} | {r['words'] if r['words'] is not None else 'n/a'} | {'yes' if r['adsense_in_head'] else 'no'} | {r['canonical'] or '—'} | {r['title'] or '—'} |")
