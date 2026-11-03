# Render the actual Scholar-related Liquid fragments with synthetic test data.
require 'liquid'
require 'minitest/autorun'

class CitationBadgeTest < Minitest::Test
  USER = 'xHzl8QQAAAAJ'
  OTHER = 'qc6CJjYAAAAJ'

  def setup
    source = File.read(File.expand_path('../_layouts/bib.liquid', __dir__))
    setup = source.split("{% assign entry_has_google_scholar_badge = false %}", 2).last.split("{% assign entry_has_inspirehep_badge", 2).first
    badge = source.split('{% if site.enable_publication_badges.google_scholar and entry_has_google_scholar_badge %}', 2).last.split('{% if site.enable_publication_badges.inspirehep', 2).first
    @template = Liquid::Template.parse('{% assign entry_has_google_scholar_badge = false %}' + setup + '{% if site.enable_publication_badges.google_scholar and entry_has_google_scholar_badge %}' + badge, error_mode: :strict)
  end

  def render(papers, account: USER, date: '2026-11-02', id: 'test-paper')
    @template.render!('entry' => {'google_scholar_id' => id}, 'site' => {
      'enable_publication_badges' => {'google_scholar' => true},
      'data' => {'socials' => {'scholar_userid' => USER}, 'citations' => {
        'metadata' => {'scholar_userid' => account, 'last_updated' => date}, 'papers' => papers
      }}
    })
  end

  def test_verified_positive_and_zero_counts
    [7, 0].each do |count|
      html = render({"#{USER}:test-paper" => {'citations' => count}})
      assert_includes html, "#{count} Google Scholar citations"
      assert_includes html, "citation_for_view=#{USER}:test-paper"
    end
  end

  def test_missing_count_and_partial_or_foreign_ids_are_hidden
    [{}, {"#{USER}:test-paper" => {}}, {"#{OTHER}:test-paper" => {'citations' => 999}}, {'test-paper' => {'citations' => 999}}, {"#{USER}:test-paper-extra" => {'citations' => 999}}].each do |papers|
      refute_includes render(papers), 'img.shields.io/badge/scholar'
    end
  end

  def test_wrong_provenance_or_unfetched_data_are_hidden
    paper = {"#{USER}:test-paper" => {'citations' => 999}}
    refute_includes render(paper, account: OTHER), 'Google Scholar citations'
    refute_includes render(paper, date: nil), 'Google Scholar citations'
  end

  def test_previous_entry_count_does_not_leak
    assert_includes render({"#{USER}:test-paper" => {'citations' => 7}}), '7 Google Scholar citations'
    refute_includes render({}, id: 'next-paper'), 'Google Scholar citations'
  end
end
