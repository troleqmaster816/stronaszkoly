import requests
from bs4 import BeautifulSoup
import json
from urllib.parse import urljoin, quote
import time
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Optional, Dict

# --- Konfiguracja ---
BASE_URL = "https://e-qwerty.zse-zdwola.pl/"
START_PAGE = BASE_URL
MAX_WORKERS = int(os.environ.get("SCRAPER_MAX_WORKERS", "8"))
REQUEST_TIMEOUT = float(os.environ.get("SCRAPER_TIMEOUT", "12"))
USER_AGENT = os.environ.get(
    "SCRAPER_UA",
    "Mozilla/5.0 (compatible; ZSE-NewsScraper/1.0; +https://zse-zdwola.pl)"
)

# Resolve output path next to this script for atomic writes
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "articles.json")

def clean_html_content(soup_tag):
    """
    Czyści tagi HTML ze zbędnych atrybutów, pozostawiając tylko czystą strukturę.
    """
    # Lista atrybutów do bezwzględnego usunięcia
    attributes_to_remove = ['class', 'id', 'style', 'data-type', 'data-id', 'data-wp-interactive', 'data-wp-context', 'data-wp-bind--hidden', 'aria-describedby', 'aria-label']
    
    # Lista atrybutów do ZACHOWANIA w określonych tagach
    allowed_attributes = {
        'a': ['href', 'target', 'rel', 'role'],
        'img': ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
        'iframe': ['src', 'width', 'height', 'style', 'frameborder', 'allowfullscreen'] # Zachowujemy styl dla iframe'a
    }

    for tag in soup_tag.find_all(True): # find_all(True) znajduje wszystkie tagi
        # Zbieramy atrybuty danego taga do modyfikacji
        attrs = dict(tag.attrs)
        for attr, value in attrs.items():
            # Sprawdzamy, czy atrybut powinien zostać usunięty
            if tag.name in allowed_attributes and attr in allowed_attributes[tag.name]:
                continue # Jeśli jest na liście dozwolonych, pomijamy
            if attr in attributes_to_remove or attr.startswith('data-'):
                del tag[attr]

    return str(soup_tag)


def _get_with_retry(session: requests.Session, url: str) -> Optional[requests.Response]:
    for attempt in range(3):
        try:
            r = session.get(url, timeout=REQUEST_TIMEOUT, headers={"User-Agent": USER_AGENT})
            r.raise_for_status()
            return r
        except Exception as e:
            if attempt == 2:
                print(f"     [Error] GET failed for {url}: {e}")
                return None
            time.sleep(0.5 * (attempt + 1))


def scrape_article_page(session: requests.Session, url: str):
    """Pobiera i analizuje stronę pojedynczego artykułu."""
    print(f"  -> Scraping article: {url}")
    try:
        response = _get_with_retry(session, url)
        if response is None:
            return None
        soup = BeautifulSoup(response.content, 'lxml')

        # Preferowa struktura WordPress (fallbacki dla większej odporności)
        article_content = (
            soup.select_one('article.post') or
            soup.select_one('article') or
            soup.select_one('main')
        )
        if not article_content:
            return None

        title_tag = (
            article_content.select_one('h1.page-title') or
            article_content.select_one('h1.entry-title') or
            article_content.find('h1')
        )
        title = title_tag.text.strip() if title_tag else "(bez tytułu)"
        author_tag = article_content.select_one('.meta-author .ct-meta-element-author')
        author = author_tag.text.strip() if author_tag else None
        date_tag = article_content.select_one('.meta-date time.ct-meta-element-date') or article_content.find('time')
        date = date_tag.get('datetime', '').split('T')[0] if date_tag and date_tag.get('datetime') else (date_tag.text.strip() if date_tag else None)
        
        content_div = article_content.select_one('.entry-content')
        if not content_div:
            content_div = article_content

        # Obsługa plików (PDF, DOC, DOCX) przed czyszczeniem
        for file_block in content_div.select('.wp-block-file'):
            link_tag = file_block.find('a', href=True)
            if not (link_tag and link_tag.get('href')):
                continue
            href = link_tag['href']
            abs_url = urljoin(BASE_URL, href)
            lower = abs_url.lower()
            if '.pdf' in lower:
                wrapper = soup.new_tag("div")
                iframe_tag = soup.new_tag(
                    "iframe", src=abs_url, width="100%", height="600px", style="border:1px solid #ddd;"
                )
                wrapper.append(iframe_tag)
                p = soup.new_tag("p")
                a = soup.new_tag("a", href=abs_url, target="_blank", rel="noreferrer noopener")
                a.string = "Pobierz PDF"
                p.append(a)
                wrapper.append(p)
                file_block.replace_with(wrapper)
            elif lower.endswith('.docx') or lower.endswith('.doc'):
                # Użyj Microsoft Office Web Viewer + link do pobrania
                viewer = f"https://view.officeapps.live.com/op/embed.aspx?src={quote(abs_url, safe='')}"
                wrapper = soup.new_tag("div")
                iframe_tag = soup.new_tag(
                    "iframe", src=viewer, width="100%", height="600px", style="border:1px solid #ddd;"
                )
                wrapper.append(iframe_tag)
                p = soup.new_tag("p")
                a = soup.new_tag("a", href=abs_url, target="_blank", rel="noreferrer noopener")
                a.string = "Pobierz plik DOCX"
                p.append(a)
                wrapper.append(p)
                file_block.replace_with(wrapper)

        # Używamy nowej funkcji do czyszczenia HTML
        cleaned_html = clean_html_content(content_div)

        return {
            "url": url,
            "title": title,
            "author": author,
            "date": date,
            "content_html": cleaned_html
        }
    except Exception as e:
        print(f"     [Error] Failed to process article {url}: {e}")
        return None

def main():
    """Główna funkcja scrapera."""
    all_articles: List[Dict] = []
    current_page_url = START_PAGE
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    while current_page_url:
        print(f"Scraping news list page: {current_page_url}")
        
        try:
            response = _get_with_retry(session, current_page_url)
            if response is None:
                break
            soup = BeautifulSoup(response.content, 'lxml')
            
            article_links = soup.select('div.rt-holder div.rt-detail h3.entry-title a')
            if not article_links: break

            urls = [urljoin(BASE_URL, link['href']) for link in article_links if link and link.get('href')]
            # Równoległe pobieranie stron artykułów (IO-bound)
            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
                futures = [ex.submit(scrape_article_page, session, u) for u in urls]
                for fut in as_completed(futures):
                    item = fut.result()
                    if item:
                        all_articles.append(item)

            active_page_li = soup.select_one('.rt-pagination .pagination-list li.active')
            if active_page_li and active_page_li.find_next_sibling('li'):
                next_page_link = active_page_li.find_next_sibling('li').find('a', href=True)
                current_page_url = urljoin(BASE_URL, next_page_link['href']) if next_page_link else None
            else:
                current_page_url = None
        except Exception as e:
            print(f"[Error] Failed on page {current_page_url}: {e}")
            break
    # Sort malejąco po dacie jeśli dostępna
    def _key(a: Dict):
        d = a.get('date')
        try:
            return d or ''
        except:
            return ''
    all_articles.sort(key=_key, reverse=True)

    # Zapis atomowy
    tmp_path = OUTPUT_FILE + ".tmp"
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(all_articles, f, ensure_ascii=False, indent=4)
    os.replace(tmp_path, OUTPUT_FILE)
    
    print(f"\nScraping complete! Found and saved {len(all_articles)} articles to articles.json")

if __name__ == "__main__":
    main()