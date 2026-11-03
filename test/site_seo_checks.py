#!/usr/bin/env python3
"""Regression checks for search indexing and actual italic markup after a Jekyll build."""

from datetime import date
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
    "/ko/media/history-of-science/",
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

# In every generated page header keep just the <h1>. Metadata descriptions
# still exist in <head> for search indexing and social previews.
for generated_html in SITE.rglob("*.html"):
    page_html = generated_html.read_text(encoding="utf-8")
    headings = re.findall(
        r'<header\s+class="post-header"[^>]*>(.*?)</header>',
        page_html, re.DOTALL | re.IGNORECASE,
    )
    for heading in headings:
        fail_unless("<h1" in heading,
                    f"{generated_html}: expected a visible page title")
        fail_unless("post-description" not in heading and 'class="desc"' not in heading,
                    f"{generated_html}: an unwanted generated subtitle remains")
print("PASS titles-only: no generated subtitle in any page header")

# Every YouTube video must display a valid publication date, not just new uploads.
# Check all YAML video records as well as every rendered card in both languages.
youtube_data = Path("_data/media.yml").read_text(encoding="utf-8")
youtube_section = youtube_data.split("youtube_groups:", 1)[1].split("public_items:", 1)[0]
general_items = re.split(r"(?m)^      - id: ", youtube_section)[1:]
for entry in general_items:
    item_name = entry.split("\n", 1)[0]
    match = re.search(r'date: "([0-9]{4}-[0-9]{2}-[0-9]{2})"', entry)
    fail_unless(match is not None, f"Missing YouTube publication date: {item_name}")
    date.fromisoformat(match.group(1))
fail_unless(len(general_items) == 12, "Unexpected number of general YouTube videos")
for route in ("/media/", "/ko/media/", "/ko/media/history-of-science/"):
    html, _ = parsed(route)
    cards = re.findall(r'<article class="media-video-card">(.*?)</article>', html, re.DOTALL)
    fail_unless(bool(cards), f"{route}: no video cards rendered")
    for card in cards:
        match = re.search(r'<time datetime="([0-9]{4}-[0-9]{2}-[0-9]{2})">', card)
        fail_unless(match is not None and match.group(1) in card,
                    f"{route}: video card missing visible publication date")
        date.fromisoformat(match.group(1))
print("PASS date consistency: all media video cards have publication dates")

# Exact visible section/group order matters. A generic history-of-science
# entry belongs first within the Unrealscience YouTube group, before the
# existing three-column videos. No latest-episode copy on the landing page.
history_ids = ("_WNy7BQ0gIw", "a_lwVYd8BP4", "ld0fBMB_IkM", "75FUhl4lr9A")
general_ids = ("tq9BirqS12c", "hPnVfGZk86U", "S0iTk9liUKQ", "AwHJryy_0vo",
               "1g6xOq3Hf2M", "AOaoELveR8s", "M7bTESbZi_U", "eg4plhiTFZU",
               "LrOIUwUxQfU", "4B9ke8WJ2s0", "Ryubz9AwsHc", "2c0y2yyhF8c")
for media_route, history_route in (
    ("/media/", "/ko/media/history-of-science/"),
    ("/ko/media/", "/ko/media/history-of-science/"),
):
    media_html, _ = parsed(media_route)
    history_html, _ = parsed(history_route)
    ko = media_route.startswith("/ko/")
    section_names = ("YouTube 출연", "방송 및 다큐멘터리", "공개 강연 및 인터뷰") if ko else (
        "YouTube Appearances", "Broadcasts and Documentaries", "Public Talks and Interviews"
    )
    section_headings = re.findall(r'<h2 class="media-section-heading"[^>]*>(.*?)</h2>',
                                  media_html, re.DOTALL)
    fail_unless([name.strip() for name in section_headings] == list(section_names),
                f"{media_route}: wrong section order: {section_headings}")
    channel_pos = media_html.find('class="media-channel-banner"')
    youtube_pos = media_html.find(">" + section_names[0] + "</h2>")
    fail_unless(channel_pos >= 0 and youtube_pos > channel_pos,
                f"{media_route}: own YouTube channel must be at the top")

    group_titles = re.findall(r'<h3 class="media-video-group-title"[^>]*>(.*?)</h3>',
                              media_html, re.DOTALL)
    expected_groups = ("안될과학", "보다", "사이언스프렌즈", "제로에너지바") if ko else (
        "Unrealscience", "BODA", "Science Friends", "Zero Energy Bar"
    )
    fail_unless([g.strip() for g in group_titles] == list(expected_groups),
                f"{media_route}: wrong YouTube group order: {group_titles}")
    preview = re.search(
        r'<div\s+class="media-feature-list media-history-feature"[^>]*>(.*?)</article>',
        media_html, re.DOTALL,
    )
    fail_unless(preview is not None, f"{media_route}: missing first history lecture feature")
    feature_html = preview.group(1)
    title = "과학사 시리즈" if ko else "History of Science Series"
    fail_unless(f'href="{history_route}"' in feature_html,
                f"{media_route}: archive link missing from featured lecture")
    fail_unless(f">{title}</a>" in feature_html,
                f"{media_route}: generic history lecture title missing")
    fail_unless("최신 공개 영상" not in feature_html and "Latest video" not in feature_html and
                "Watch latest video" not in feature_html and "안될과학 | 과학사 강의" not in feature_html,
                f"{media_route}: latest-episode or redundant series title still visible")
    fail_unless(feature_html.count('class="media-feature-card media-history-feature-card"') == 1,
                f"{media_route}: history should have exactly one broadcast-style feature")
    fail_unless(feature_html.count('class="media-feature-visual-link"') == 1 and
                feature_html.count('class="media-feature-body"') == 1,
                f"{media_route}: missing image-left/detail-right horizontal card")
    fail_unless('class="media-video-card"' not in feature_html,
                f"{media_route}: history must not have a landing-page thumbnail grid")
    fail_unless("watch?v=" + history_ids[0] in feature_html,
                f"{media_route}: fixed representative history cover missing")
    fail_unless(media_html.find(">" + expected_groups[0] + "</h3>") <
                media_html.find('class="media-feature-card media-history-feature-card"') <
                media_html.find('class="media-video-grid"'),
                f"{media_route}: history lecture must precede three-column Unrealscience cards")
    for video_id in general_ids:
        fail_unless("watch?v=" + video_id in media_html,
                    f"{media_route}: a general YouTube appearance is missing: {video_id}")
    fail_unless(media_html.count('class="media-video-card"') == len(general_ids),
                f"{media_route}: unexpected number of general YouTube cards")
    fail_unless(history_html.count('class="media-video-card"') == len(history_ids),
                f"{history_route}: incomplete history lecture archive")
    positions = [history_html.find("watch?v=" + video_id) for video_id in history_ids]
    fail_unless(all(pos >= 0 for pos in positions) and positions == sorted(positions),
                f"{history_route}: history episodes are not in publication order")
fail_unless(not route_file("/media/history-of-science/").exists(),
            "English history archive must not be generated")
history_markup, history_meta = parsed("/ko/media/history-of-science/")
fail_unless('<h1 class="post-title">안될과학 과학사 시리즈</h1>' in history_markup,
            "Korean history archive must have the requested title")
print("PASS Media: Korean-only history archive, renamed series card, grouped videos and requested section order")

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
S = "{http://www.w3.org/2000/svg}"
fail_unless(mixed_svg.get("viewBox") == "0 0 60 40" and
            mixed_svg.get("width") == "60" and mixed_svg.get("height") == "40",
            "Both language icons must share the 3:2 display aspect ratio")
usa_half = mixed_svg.find(f".//{S}clipPath[@id='american-half']")
uk_half = mixed_svg.find(f".//{S}clipPath[@id='british-half']")
fail_unless(usa_half is not None and uk_half is not None and
            usa_half[0].get("points") == "0,0 60,0 0,40" and
            uk_half[0].get("points") == "60,0 60,40 0,40",
            "The original diagonal layout must split UK and US into equal-area halves")
canton = mixed_svg.find(f".//{S}rect[@class='us-canton']")
fail_unless(canton is not None and
            float(canton.get("width", 0)) >= 28.5 and
            float(canton.get("height", 0)) >= 19.5,
            "US blue canton must remain large and recognizable")
canton_width, canton_height = float(canton.get("width")), float(canton.get("height"))
fail_unless(canton_width / 60 + canton_height / 40 < 1,
            "US canton corner must lie inside the upper-left diagonal half")
stars = mixed_svg.findall(f".//{S}polygon[@class='us-star']")
fail_unless(len(stars) == 50, f"US flag should include 50 individual stars, got {len(stars)}")
for star in stars:
    vertices = [tuple(map(float, v.split(","))) for v in star.get("points", "").split()]
    fail_unless(len(vertices) == 10, "Each US star should have five outer points")
    fail_unless(all(0 < x < canton_width and 0 < y < canton_height and x / 60 + y / 40 < 1
                    for x, y in vertices),
                "US star is missing or clipped by the blue canton or diagonal")
uk_source = mixed_svg.findall(f".//{S}svg")
fail_unless(len(uk_source) == 1 and
            uk_source[0].get("viewBox") == "0 0 60 30" and
            uk_source[0].get("preserveAspectRatio") == "xMidYMid slice",
            "Union Jack original geometry must stay undistorted")
kr_svg = ET.fromstring((SITE / flag_files["ko.svg"].lstrip("/")).read_text(encoding="utf-8"))
fail_unless(kr_svg.get("viewBox") == "-36 -24 72 48" and
            kr_svg.get("width") == "72" and kr_svg.get("height") == "48",
            "Korean flag must keep its correct 3:2 proportions")
source_css = Path("assets/css/main.scss").read_text(encoding="utf-8")
fail_unless(bool(re.search(r"\.navbar-language-toggle\s+\.jm-language-flag-frame\s*\{[^}]*width:\s*27px;[^}]*height:\s*18px;", source_css)),
            "Both language icons must have identical 27 by 18 wrappers")
fail_unless("border: 3px solid transparent;" in source_css and
            "border-radius: 7px;" in source_css and
            "inset: -3px;" in source_css and
            ".navbar-language-toggle > .nav-link:hover .jm-language-flag-frame::after" in source_css and
            ".navbar-language-toggle > .nav-link:focus-visible .jm-language-flag-frame::after" in source_css and
            "border-color: var(--global-hover-color);" in source_css and
            "top: 1px;" in source_css,
            "Language hover needs a gapless 3px round-corner theme-colored border")

for route, destination, icon_name in (
    ("/", "/ko/", "ko.svg"),
    ("/ko/", "/", "en-uk-us.svg"),
    ("/publications/", "/ko/publications/", "ko.svg"),
    ("/ko/publications/", "/publications/", "en-uk-us.svg"),
    ("/ko/media/history-of-science/", "/media/", "en-uk-us.svg"),
):
    html, _ = parsed(route)
    switch_match = re.search(
        r'<li\s+class="nav-item navbar-language-toggle"[^>]*>(.*?)</li>',
        html, re.DOTALL,
    )
    fail_unless(switch_match is not None, f"{route}: language switch missing")
    switch = switch_match.group(1)
    fail_unless(f'href="{destination}"' in switch, f"{route}: wrong language destination")
    fail_unless('class="jm-language-flag"' in switch and
                'class="jm-language-flag-frame"' in switch,
                f"{route}: expected separate SVG and rounded border wrapper")
    fail_unless(f'src="{flag_files[icon_name]}"' in switch, f"{route}: wrong flag image")
    expected_tooltip = "영어로 전환" if route.startswith("/ko/") else "Change language to Korean"
    fail_unless(f'title="{expected_tooltip}"' in switch,
                f"{route}: language-change hover tooltip missing")
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
source_css = Path("assets/css/main.scss").read_text(encoding="utf-8")
fail_unless(bool(re.search(r"\.navbar-language-toggle\s+\.jm-language-flag\s*\{[^}]*width:\s*27px;[^}]*height:\s*18px;", source_css)),
            "Both flags must display at exactly 27x18 px")
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
fail_unless("https://jeongmochoi.github.io/media/history-of-science/" not in urls,
            "Removed English history archive is still listed in sitemap")
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
# Removed demo sources remain recoverable from Git history.
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
    "assets/pdf/example_pdf.pdf",
    "assets/rendercv/rendercv_output/Albert_Einstein_CV.pdf",
    "assets/json/resume.json",
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
