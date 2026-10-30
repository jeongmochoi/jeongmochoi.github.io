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

# The language switch uses local SVG flag images, not OS-dependent emoji.
# Its destination must continue to target the counterpart of the current page.
flag_files = {
    "ko.svg": "/assets/img/language-flags/ko.svg",
    "en-uk-us.svg": "/assets/img/language-flags/en-uk-us.svg",
}
for name, url in flag_files.items():
    source = SITE / url.lstrip("/")
    fail_unless(source.is_file(), f"Missing local flag image: {url}")
    svg_root = ET.fromstring(source.read_text(encoding="utf-8"))
    fail_unless(svg_root.tag.endswith("svg"), f"Invalid flag SVG: {name}")

mixed_svg = ET.fromstring((SITE / flag_files["en-uk-us.svg"].lstrip("/")).read_text(encoding="utf-8"))
clips = mixed_svg.findall(".//{http://www.w3.org/2000/svg}clipPath")
fail_unless(len(clips) == 2, "English flag must contain two diagonally clipped halves")

for route, destination, icon_name in (
    ("/", "/ko/", "ko.svg"),
    ("/ko/", "/", "en-uk-us.svg"),
    ("/publications/", "/ko/publications/", "ko.svg"),
    ("/ko/publications/", "/publications/", "en-uk-us.svg"),
):
    html, _ = parsed(route)
    switch_match = re.search(
        r'<li\s+class="nav-item navbar-language-toggle"[^>]*>(.*?)</li>',
        html, re.DOTALL,
    )
    fail_unless(switch_match is not None, f"{route}: language switch missing")
    switch = switch_match.group(1)
    fail_unless(f'href="{destination}"' in switch, f"{route}: wrong language destination")
    fail_unless('class="jm-language-flag"' in switch, f"{route}: expected SVG image markup")
    fail_unless(f'src="{flag_files[icon_name]}"' in switch, f"{route}: wrong flag image")
    fail_unless('aria-hidden="true"' in switch and 'alt=""' in switch,
                f"{route}: missing accessible decorative SVG attributes")

for route in ("/", "/ko/"):
    html, page = parsed(route)
    fail_unless(bool(re.search(r"<em>summa cum laude</em>", html)), f"{route}: actual italic tag missing")
    for lang, href in (("en", "https://jeongmochoi.github.io/"),
                       ("ko", "https://jeongmochoi.github.io/ko/")):
        fail_unless(any(l.get("rel") == "alternate" and l.get("hreflang") == lang and l.get("href") == href
                        for l in page.links), f"{route}: missing {lang} hreflang")
    fail_unless("Roboto+Flex:" not in html,
                f"{route}: previous separate italic font is still requested")
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
fail_unless(bool(re.search(r"transform:\s*skewX\(-8deg\)", css)),
            "Actual eight-degree slant must be applied to original Roboto")
fail_unless("Roboto Flex" not in css and "font-weight: 350" not in css,
            "Original typeface and inherited font weight must be preserved")
fail_unless(bool(re.search(r"\.jm-self-author\s*\{[^}]*text-decoration:\s*underline", css)),
            "Author underline must be preserved")

for route in ("/publications/", "/ko/publications/"):
    html, _ = parsed(route)
    author_blocks = re.findall(r'<div class="author">(.*?)</div>', html, re.DOTALL)
    fail_unless(author_blocks, f"{route}: no publication authors found")
    fail_unless(all("<em" not in block.lower() for block in author_blocks),
                f"{route}: italic author names remain")
    self_names = re.findall(r'<span class="jm-self-author">(.*?)</span>', html, re.DOTALL)
    fail_unless(self_names and all("Choi" in text for text in self_names),
                f"{route}: owner name missing from underlined, upright author spans")

sample = route_file("/blog/2015/formatting-and-links/")
if sample.exists():
    _, demo = parsed("/blog/2015/formatting-and-links/")
    fail_unless(any(m.get("name") == "robots" and m.get("content", "").startswith("noindex")
                    for m in demo.meta), "Upstream demo blog must not be indexed")

# Google Search Console ownership verification must be published byte-for-byte.
verification_name = "googlea861a1c63cb92d6d.html"
verification_file = SITE / verification_name
fail_unless(verification_file.is_file(), "Missing Google Search Console verification file")
fail_unless(verification_file.read_text(encoding="utf-8") ==
            f"google-site-verification: {verification_name}",
            "Google Search Console verification challenge was modified during build")

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
pdf_urls = [url for url in urls if re.search(r"\.pdf(?:$|[?#])", url, re.IGNORECASE)]
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

# Demo content must never be shipped by the Jekyll output, even as noindex.
# All sources remain safely tracked in Git for restoration if genuinely needed.
for prefix in ("blog", "projects", "news", "teachings"):
    fail_unless(not (SITE / prefix).exists(),
                f"Upstream al-folio demo folder was published: {prefix}")
for demo in (
    "_pages/dropdown/index.html",
    "cv/index.html",
    "people/index.html",
    "plugins/index.html",
    "repositories/index.html",
    "books/the_godfather/index.html",
    "assets/html/relativity.html",
    "assets/jupyter/blog.ipynb.html",
    "assets/plotly/demo.html",
):
    fail_unless(not (SITE / demo).exists(),
                f"Unused al-folio demonstration page was published: {demo}")

# Course files and both languages remain publicly usable; no PDF is deleted.
from_course = list(Path("teaching").rglob("*.pdf"))
fail_unless(len(from_course) >= 400, "Unexpected loss of existing teaching PDF source files")
missing_pdfs = [str(p) for p in from_course if not (SITE / p).is_file()]
fail_unless(not missing_pdfs,
            f"Course PDF files missing from built website: {missing_pdfs[:8]}")
for prefix in ("teaching", "ko/teaching"):
    course_pages = list((SITE / prefix).glob("*/index.html"))
    fail_unless(len(course_pages) >= 30,
                f"Unexpectedly missing real course pages under {prefix}: {len(course_pages)}")
print(f"PASS preserved teaching: {len(from_course)} PDFs and bilingual course detail pages")
print("PASS excluded all upstream demo blog, project, news, book and layout routes")

print(f"PASS: {len(PUBLIC_ROUTES)} canonical/indexable public routes, reciprocal home languages, 8-degree oblique emphasis, ProfilePage, PDF-safe sitemap ({len(urls)} URLs)")
