#!/usr/bin/env python3
"""Regression checks for search indexing and actual italic markup after a Jekyll build."""

from html.parser import HTMLParser
from pathlib import Path
import json
import re
import xml.etree.ElementTree as ET

SITE = Path("_site")
PUBLIC_ROUTES = (
    "/", "/ko/",
    "/publications/", "/ko/publications/",
    "/books/", "/ko/books/", "/ko/books/alchemia/",
    "/media/", "/ko/media/",
    "/teaching/", "/ko/teaching/",
)


class HeadReader(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = []
        self.links = []
        self.structured = []
        self.ldjson = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            self.meta.append(attrs)
        if tag == "link":
            self.links.append(attrs)
        if tag == "script" and attrs.get("type") == "application/ld+json":
            self.ldjson = True

    def handle_endtag(self, tag):
        if tag == "script":
            self.ldjson = False

    def handle_data(self, data):
        if self.ldjson:
            self.structured.append(data)


def fail_unless(condition, message):
    if not condition:
        raise AssertionError(message)


def route_file(route):
    return SITE / route.strip("/") / "index.html"


def parsed(route):
    source = route_file(route)
    fail_unless(source.exists(), f"Missing published route: {route}")
    html = source.read_text(encoding="utf-8")
    reader = HeadReader()
    reader.feed(html)
    return html, reader


for route in PUBLIC_ROUTES:
    html, meta = parsed(route)
    robots = [m.get("content") for m in meta.meta if m.get("name") == "robots"]
    fail_unless(robots == ["index,follow"], f"{route}: not marked index,follow: {robots}")
    descriptions = [m.get("content") for m in meta.meta if m.get("name") == "description"]
    fail_unless(len(descriptions) == 1 and len(descriptions[0]) > 20, f"{route}: description missing")
    expected_canonical = "https://jeongmochoi.github.io" + route
    fail_unless(any(a.get("rel") == "canonical" and a.get("href") == expected_canonical for a in meta.links),
                f"{route}: wrong canonical")
    print(f"PASS public: {route}")

for route in ("/", "/ko/"):
    html, page = parsed(route)
    fail_unless(bool(re.search(r"<em>summa cum laude</em>", html)), f"{route}: actual italic tag missing")
    for lang, href in (("en", "https://jeongmochoi.github.io/"),
                       ("ko", "https://jeongmochoi.github.io/ko/")):
        fail_unless(any(l.get("rel") == "alternate" and l.get("hreflang") == lang and l.get("href") == href
                        for l in page.links), f"{route}: missing {lang} hreflang")
    fail_unless("Roboto+Flex:slnt,wght@-10..0,300..700" in html,
                f"{route}: Roboto Flex eight-degree variable slant not requested")
    profile_nodes = []
    for payload in page.structured:
        try:
            val = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if val.get("@type") == "ProfilePage":
            profile_nodes.append(val)
    fail_unless(len(profile_nodes) == 1, f"{route}: missing or invalid ProfilePage JSON-LD")
    person = profile_nodes[0]["mainEntity"]
    fail_unless(person["name"] == "Jeong-Mo Choi" and person["alternateName"] == "최정모",
                f"{route}: person name metadata mismatches")

css = (SITE / "assets/css/main.css").read_text(encoding="utf-8")
fail_unless(bool(re.search(r"font-style:\\s*oblique\\s+8deg", css)),
            "Compiled site CSS does not preserve the chosen oblique 8deg")
fail_unless(bool(re.search(r"font-variation-settings:\\s*['\\\"]slnt['\\\"]\\s*-8", css)),
            "Variable font slant axis must be -8 for real eight-degree leaning")

sample = route_file("/blog/2015/formatting-and-links/")
if sample.exists():
    _, demo = parsed("/blog/2015/formatting-and-links/")
    fail_unless(any(m.get("name") == "robots" and m.get("content", "").startswith("noindex")
                    for m in demo.meta), "Upstream demo blog must not be indexed")

sitemap = SITE / "sitemap.xml"
fail_unless(sitemap.exists(), "jekyll-sitemap not generated")
root = ET.fromstring(sitemap.read_text(encoding="utf-8"))
namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
urls = {loc.text for loc in root.findall(".//sm:loc", namespace)}
for route in PUBLIC_ROUTES:
    fail_unless("https://jeongmochoi.github.io" + route in urls,
                f"Public URL missing from sitemap: {route}")
additional = sorted(urls.difference({"https://jeongmochoi.github.io" + route for route in PUBLIC_ROUTES}))
print("Additional sitemap URLs not in the curated public-page set:")
for url in additional:
    print("  SITEMAP_EXTRA:", url)
fail_unless(not additional, f"Unrelated or generated demo URLs remain in the sitemap: {len(additional)}")
# PDF privacy/discovery audit: prevent direct crawling and never advertise document URLs.
robots_text = (SITE / "robots.txt").read_text(encoding="utf-8")
fail_unless("User-agent: *" in robots_text, "robots.txt has no global Googlebot rule")
for rule in ("Disallow: /*.pdf", "Disallow: /*.PDF", "Disallow: /assets/pdf/"):
    fail_unless(rule in robots_text, f"PDF crawler policy missing: {rule}")
pdf_urls = [url for url in urls if re.search(r"\\.pdf(?:$|[?#])", url, re.IGNORECASE)]
fail_unless(not pdf_urls, f"PDF documents found in the sitemap: {len(pdf_urls)}")
for route in ("/teaching/2020-fall-general-chemistry-2-002/",):
    if route_file(route).exists():
        _, detail = parsed(route)
        directives = [meta.get("content", "") for meta in detail.meta if meta.get("name") == "robots"]
        fail_unless(len(directives) == 1 and "noindex" in directives[0] and "nofollow" in directives[0],
                    f"{route}: course detail must not advertise PDFs to crawlers")
print("PASS PDF policy: robots disallows PDF crawling, sitemap has zero PDFs, course pages nofollow")
# Note: disallow alone cannot guarantee removal of URL-only results on Google.

for route in (
    "/blog/2015/formatting-and-links/",
    "/projects/1_project/",
    "/news/announcement_1/",
    "/books/the_godfather/",
    "/teachings/data-science-fundamentals/",
):
    fail_unless("https://jeongmochoi.github.io" + route not in urls,
                f"Demo URL still advertised in sitemap: {route}")

print(f"PASS: {len(PUBLIC_ROUTES)} canonical/indexable public routes, reciprocal home languages, 8-degree oblique emphasis, ProfilePage, PDF-safe sitemap ({len(urls)} URLs)")
