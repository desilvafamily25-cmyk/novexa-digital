import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "dist"

class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []
    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.hrefs.append(href)

pages = sorted(ROOT.rglob("*.html"))
errors = []
for page in pages:
    html = page.read_text(encoding="utf-8")
    rel = page.relative_to(ROOT).as_posix()
    for label, pattern in {
        "title": r"<title>.+?</title>",
        "meta description": r'<meta name="description"',
        "canonical": r'<link rel="canonical"',
        "h1": r"<h1(?:\s|>)",
    }.items():
        if not re.search(pattern, html, re.DOTALL):
            errors.append(f"{rel}: missing {label}")
    parser = LinkParser()
    parser.feed(html)
    for href in parser.hrefs:
        if not href.startswith("/") or href.startswith("//") or href.startswith("/_astro/"):
            continue
        clean = href.split("#", 1)[0].split("?", 1)[0]
        if not clean:
            continue
        if clean == "/":
            target = ROOT / "index.html"
        else:
            target = ROOT / clean.lstrip("/")
            if clean.endswith("/"):
                target = target / "index.html"
        if not target.exists():
            errors.append(f"{rel}: broken internal link {href}")

required = [ROOT / "robots.txt", ROOT / "sitemap-index.xml", ROOT / "contact" / "index.html"]
for item in required:
    if not item.exists():
        errors.append(f"missing output: {item.relative_to(ROOT)}")

contact = (ROOT / "contact" / "index.html").read_text(encoding="utf-8")
if 'data-netlify="true"' not in contact or 'name="form-name"' not in contact:
    errors.append("contact form is missing Netlify form markers")

if errors:
    print("Verification failed:")
    print("\n".join(f"- {error}" for error in errors))
    sys.exit(1)

print(f"Verified {len(pages)} HTML pages: metadata, headings and internal links")
print("Verified robots.txt, sitemap and Netlify form markers")
