# Google search visibility of jeongmochoi.github.io

The site is publicly hosted on GitHub Pages. Code improvements can make pages eligible for indexing, but **cannot guarantee that Google has indexed or ranked the website**. The owner must use a verified Google Search Console property to see Google's authoritative indexing decisions.

## Technical configuration

- The site uses the `selected_pages` search-indexing policy. Only pages with explicit `seo_index: true` are tagged `index,follow`; pages still containing upstream al-folio demo material and non-public course-detail content remain `noindex`.
- The eleven curated pages are included in `sitemap.xml` with `sitemap: true` front matter. The sample blog posts, projects, announcements, old theme books, and other demo collections are excluded by Jekyll default `sitemap: false` settings.
- PDF study materials must **never** be put in the sitemap. The Jekyll build check verifies that there are zero PDF URLs in the generated `sitemap.xml`. As of the old public sitemap, 410 of 589 listed URLs were PDFs; those were unintentionally advertised even though `robots.txt` discouraged crawlers.
- `robots.txt` blocks crawling of PDF URLs throughout the site, including teaching PDFs and query-string variants. HTML course detail pages are tagged `noindex,nofollow` to reduce PDF URL discovery.
- **Important limitation:** `robots.txt` is only a crawler restriction, not an enforceable `noindex` directive or access control. Google may still show a URL-only PDF result if links exist elsewhere. On GitHub Pages, we cannot directly configure a per-PDF `X-Robots-Tag: noindex` response header. To guarantee exclusion under Google rules, move PDFs to a hosting service that adds `X-Robots-Tag: noindex` (and allow crawling so the header can be read), or restrict PDF access if the material must actually remain private. If a PDF is already indexed, use Google Search Console's removal process in parallel.
- Teaching PDFs remain publicly downloadable with their existing URLs; none were moved or deleted by this change.
- The English and Korean homepages have separate descriptions, matching canonicals, reciprocal `hreflang` alternatives, and `ProfilePage` / `Person` JSON-LD identifying both `Jeong-Mo Choi` and `최정모`.
- `robots.txt` already allows public HTML crawlers and advertises `https://jeongmochoi.github.io/sitemap.xml`. No fake crawler or search-ranking claims are made.

## Required Google Search Console actions (owner)

1. Sign in at https://search.google.com/search-console/ with your own Google account.
2. Add a **URL-prefix property** with the exact URL `https://jeongmochoi.github.io/`. This is a GitHub Pages subdomain; you usually cannot verify ownership of the overarching `github.io` domain via a DNS Domain-property record.
3. Verify ownership:
   - Choose **HTML tag** and copy its `content` value from `<meta name="google-site-verification" content="...">`.
   - Supply that value to the site maintainer so it can be set in `_config.yml` as `google_site_verification` and `enable_google_verification: true` in a reviewed PR; after the change is published, click **Verify** in Search Console.
   - Alternatively use the **HTML file** method and ask the maintainer to add the exact supplied verification file in a reviewed PR before pressing **Verify**. No password, Google session token, or API credential should be shared.
4. In Search Console → **Sitemaps**, submit `sitemap.xml` and check for processing errors. The file is regenerated automatically by `jekyll-sitemap`.
5. In **URL inspection**, inspect `https://jeongmochoi.github.io/` and `https://jeongmochoi.github.io/ko/`; use **Test live URL**. If Google finds the pages eligible, use **Request indexing**. Repeat for the publications pages if necessary.
6. In **Page indexing**, inspect the crawl/indexing reason. Pay attention to `Crawled - currently not indexed`, `Discovered - currently not indexed`, robots exclusions, accidental `noindex`, and incorrect canonical selection.
7. Wait for crawl/indexing; this can take days or weeks and **requesting indexing is not a guarantee of search appearance**. Ranking for short/common personal names depends on Google's signals and competition.
8. Where reasonable, link the canonical homepage from the Pusan National University faculty directory and the existing research lab website. Legitimate relevant inbound links aid discovery; avoid artificial SEO link schemes.

## Useful direct links

- Website: https://jeongmochoi.github.io/
- Korean homepage: https://jeongmochoi.github.io/ko/
- Robots: https://jeongmochoi.github.io/robots.txt
- Sitemap: https://jeongmochoi.github.io/sitemap.xml
- Google Search Console: https://search.google.com/search-console/
- Google URL inspection documentation: https://support.google.com/webmasters/answer/9012289
- Google site ownership verification: https://support.google.com/webmasters/answer/9008080

## Typography

The Markdown source already renders `_summa cum laude_` into an HTML `<em>` tag. The old CSS applied an unusually subtle `oblique 8deg` style, while the requested Google Fonts URL only loaded roman Roboto. The original design intentionally requested a subtle `font-style: oblique 8deg`, **not** conventional italic. Simply loading Roboto italic glyphs changed the appearance without delivering an exact eight-degree slant. The revised stylesheet keeps `oblique 8deg` and uses Roboto Flex only for emphasized text with its genuine `slnt: -8` variable axis; ordinary text remains in Roboto. Homepage screenshot CI checks that a Roboto Flex face actually loaded before capturing the result.
