# Google Scholar 인용 자동 갱신

## 계정과 데이터 출처

- 인용 계정은 `_data/socials.yml`의 `scholar_userid: xHzl8QQAAAAJ`입니다. 스크립트는 실행 전에 국문·영문 논문 페이지의 Scholar 링크와 일치하는지 검사합니다.
- al-folio 예제 계정 `qc6CJjYAAAAJ`는 명시적으로 거부합니다. 기존 `_data/citations.yml`의 1,044개 항목은 모두 이 계정에 속했으며, 최종 갱신일은 2026-05-15였습니다. 이 예제 데이터는 제거했습니다.
- 새로운 스냅샷에는 계정 ID, 원본 프로필 URL, 마지막으로 저장한 검증 스냅샷의 날짜를 기록합니다. 각 논문 키는 `계정 ID:논문 ID` 전체 값입니다.
- 가져온 저자 ID와 모든 논문의 계정 접두부를 검증합니다. 논문 ID·제목·인용 횟수 누락, 음수·문자열·불리언 인용 값, 중복 ID 또는 비어 있는 응답은 실패로 처리합니다. 확인된 정수 0은 유효하지만, 누락된 값을 0으로 바꾸지는 않습니다.

## 확인하지 못한 값의 처리

이번 수정에서는 실제 인용 횟수를 추가하지 않았습니다. 2026-11-02 검증 시 Scholar 프로필의 웹 조회는 HTTP 403으로 차단되었고, 스크립트의 실제 수집 시도도 45초의 로컬 제한 시간 안에 완료되지 않았습니다. 따라서 초기 데이터는 `papers: {}`, `last_updated: null`입니다. 이는 미수집 상태이며, 인용 횟수 0이나 성공적인 갱신을 의미하지 않습니다.

수집 실패나 잘못된 응답은 기존 파일을 변경하지 않습니다. 파일은 검증과 YAML 직렬화가 모두 끝난 뒤 원자적으로 교체합니다. 당일 캐시도 계정과 데이터를 먼저 검증한 뒤 재사용합니다. 값이 같으면 파일과 이전 스냅샷 날짜를 유지해 불필요한 PR을 만들지 않습니다.

논문 배지는 동일한 계정의 정확한 논문 키와 검증 날짜가 있는 값만 사용합니다. 다른 계정의 키, 부분 일치, 계정 없는 키, 기본값 0으로의 대체는 허용하지 않습니다. 현재 실제 논문 목록인 `_bibliography/papers.bib`에는 `google_scholar_id`가 없으므로 새 배지나 논문별 ID를 임의로 추가하지 않았습니다. `_config.yml`과 양쪽 논문 페이지는 계속 `papers.bib`를 사용하며, `papers_einstein.bib`는 선택하지 않습니다.

## 실행과 검증

인용 작업에 필요한 패키지는 `requirements-citations.txt`에 분리했습니다. `scholarly==1.7.11`이 사용하는 `bibtexparser.bibdatabase` API를 유지하도록 `bibtexparser==1.4.3`을 고정했습니다. 일반 `requirements.txt`에서도 이 파일을 참조합니다.

```bash
python -m pip install -r requirements-citations.txt
python -m pip check
python -c "from scholarly import scholarly; from bibtexparser.bibdatabase import BibDatabase"
python -m unittest discover -s test -p 'test_scholar_citations.py' -v
python bin/update_scholar_citations.py --validate-only
bundle exec ruby test/test_citation_badges.rb
bundle exec al-folio upgrade overrides audit
```

`--validate-only`와 회귀 테스트는 Scholar에 접속하지 않습니다. 테스트의 숫자는 임시 디렉터리/메모리에만 사용하는 가상 값이며, 실제 인용 데이터로 저장하지 않습니다. SOCKS 프록시를 사용하는 로컬 환경에서는 `httpx[socks]`의 추가 의존성이 필요할 수 있습니다.

실제 수집은 다음 명령으로 수행합니다. Scholar 접근 제한이 있으면 성공으로 표시하지 않고 실패 또는 시간 초과로 종료합니다.

```bash
timeout --kill-after=10s 90s python bin/update_scholar_citations.py
```

## 검토와 배포

정기 실행의 월·수·금 일정과 Draft PR 방식은 유지합니다. 스크립트의 종료 코드를 Actions 단계에도 그대로 전달하며, 실패 뒤의 데이터 비교와 PR 생성 단계는 실행하지 않습니다. 성공한 경우에도 저장된 데이터 출처를 다시 검증한 뒤, 변경이 있을 때만 `automation/update-citations` 브랜치로 Draft PR을 만듭니다.

PR은 자동 병합하거나 배포하지 않습니다. `GITHUB_TOKEN`으로 생성된 자동화 PR은 후속 PR 검사를 자동으로 시작하지 않을 수 있습니다. 이 경우 해당 브랜치에서 **Citation integrity checks**와 **Site build gate**를 수동 실행하고, 실제 값과 원본 Scholar 링크를 검토한 뒤 소유자의 명시적 승인을 받아야 합니다. 공개 배포 경계는 [SITE_MAINTENANCE.md](SITE_MAINTENANCE.md)를 따릅니다.
