import requests
import json
import os
import re
from bs4 import BeautifulSoup
from urllib.parse import urljoin

# --- Konfiguracja ---
BASE_URL = "https://planlekcji.zse-zdwola.pl/"
# Lista planów znajduje się w tym pliku, a nie w index.html
LIST_PAGE_URL = urljoin(BASE_URL, "lista.html")
PLANS_PATH = "plany/"
# Zapisuj wynik bezpośrednio do katalogu public, obok tego skryptu,
# aby aplikacja mogła serwować /timetable_data.json
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "timetable_data.json")

POLISH_DIACRITICS = set("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ")
_MOJIBAKE_SUSPECT_CHARS = {"Ã", "Å", "Ä", "Ę", "Ĺ", "Ľ", "Â", "Ă", "", "", ""}
_MOJIBAKE_ENCODINGS = ["iso-8859-2", "cp1250", "latin-1", "cp1252"]



def _prepare_response_encoding(response: requests.Response, fallback: str = "utf-8") -> requests.Response:
    """Ensure the response uses a proper text encoding before accessing .text."""
    encoding = (response.encoding or "").lower()
    if not encoding or encoding in {"iso-8859-1", "latin-1", "latin1", "ascii"}:
        apparent = response.apparent_encoding
        if apparent:
            encoding = apparent
    if not encoding:
        encoding = fallback
    response.encoding = encoding
    return response


def _fix_mojibake(text: str) -> str:
    """Best-effort fix for UTF-8 mojibake (e.g. HaÅapup -> Hałapup)."""
    if not text or not any(ch in text for ch in _MOJIBAKE_SUSPECT_CHARS):
        return text

    for encoding in _MOJIBAKE_ENCODINGS:
        try:
            candidate = text.encode(encoding).decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
        if any(ch in candidate for ch in POLISH_DIACRITICS):
            return candidate
    return text

def discover_plan_urls_and_names(session: requests.Session):
    """
    Odkrywa wszystkie URL-e do planów lekcji (nauczyciele, sale, oddziały)
    oraz ich nazwy ze strony lista.html.
    """
    print(f"Pobieranie strony z listą planów: {LIST_PAGE_URL}")
    try:
        response = session.get(LIST_PAGE_URL)
        response.raise_for_status()
        response = _prepare_response_encoding(response)
    except requests.RequestException as e:
        print(f"Błąd podczas pobierania strony z listą planów: {e}")
        return None, None

    # Używamy response.text, bo ręcznie ustawiliśmy poprawne kodowanie
    soup = BeautifulSoup(response.text, 'html.parser')
    
    links = soup.find_all('a', href=re.compile(r'plany/.*\.html'))
    
    if not links:
        print("Nie znaleziono żadnych linków do planów na stronie. Sprawdź, czy struktura lista.html się nie zmieniła.")
        return None, None

    discovered_urls = {
        'teachers': set(),
        'rooms': set(),
        'classes': set()
    }
    
    names_map = {
        'teachers': {},
        'rooms': {},
        'classes': {}
    }

    for link in links:
        href = link['href']
        name = _fix_mojibake(link.get_text(strip=True))
        file_id = href.split('/')[-1].replace('.html', '')
        
        # Linki na liście są w formacie ../plany/n1.html
        # normalizujemy ścieżkę
        normalized_href = urljoin(LIST_PAGE_URL, href)
        # Bierzemy tylko część relatywną do base_url
        relative_href = normalized_href.replace(BASE_URL, '')

        if relative_href.startswith(PLANS_PATH):
            if file_id.startswith('n'):
                discovered_urls['teachers'].add(relative_href)
                names_map['teachers'][file_id] = name
            elif file_id.startswith('s'):
                discovered_urls['rooms'].add(relative_href)
                names_map['rooms'][file_id] = name
            elif file_id.startswith('o'):
                discovered_urls['classes'].add(relative_href)
                names_map['classes'][file_id] = name

    for key in discovered_urls:
        discovered_urls[key] = sorted(list(discovered_urls[key]))
        
    print(f"Znaleziono {len(names_map['teachers'])} nauczycieli, {len(names_map['rooms'])} sal, {len(names_map['classes'])} oddziałów.")
    return discovered_urls, names_map


def parse_lesson_chunk(chunk_soup):
    """Parsuje fragment HTML odpowiadający jednej lekcji (lub podgrupie)."""
    subject_tag = chunk_soup.find('span', class_='p')
    teacher_tag = chunk_soup.find('a', class_='n')
    group_tag = chunk_soup.find('a', class_='o')
    room_tag = chunk_soup.find('a', class_='s')

    teacher = {"id": teacher_tag['href'].split('/')[-1].replace('.html', ''), "name": _fix_mojibake(teacher_tag.get_text(strip=True))} if teacher_tag else None
    group = {"id": group_tag['href'].split('/')[-1].replace('.html', ''), "name": _fix_mojibake(group_tag.get_text(strip=True))} if group_tag else None
    room = {"id": room_tag['href'].split('/')[-1].replace('.html', ''), "name": _fix_mojibake(room_tag.get_text(strip=True))} if room_tag else None
    subject = _fix_mojibake(subject_tag.get_text(strip=True)) if subject_tag else None

    if not any([subject, teacher, group, room]):
        return None

    return {"subject": subject, "teacher": teacher, "group": group, "room": room}


def parse_timetable_html(html_content):
    """Parsuje stronę HTML z planem lekcji i zwraca listę lekcji."""
    soup = BeautifulSoup(html_content, 'html.parser')
    table = soup.find('table', class_='tabela')
    if not table: return []

    rows = table.find_all('tr')
    header_cells = rows[0].find_all('th')
    days = [day.get_text(strip=True) for day in header_cells[2:]]
    
    lessons_list = []
    for row in rows[1:]:
        cells = row.find_all('td')
        if len(cells) < 3: continue
            
        lesson_num = cells[0].get_text(strip=True)
        time = cells[1].get_text(strip=True)
        
        for i, cell in enumerate(cells[2:]):
            day = days[i]
            
            html_chunks = str(cell).replace('<br/>', '<br>').split('<br>')

            for chunk in html_chunks:
                chunk_soup = BeautifulSoup(chunk, 'html.parser')
                parsed_lesson = parse_lesson_chunk(chunk_soup)
                
                if parsed_lesson:
                    full_lesson_info = {
                        "day": day,
                        "lesson_num": lesson_num,
                        "time": time,
                        **parsed_lesson
                    }
                    lessons_list.append(full_lesson_info)
    return lessons_list


def main():
    """Główna funkcja sterująca scraperem."""
    print("--- Rozpoczynam scrapowanie planu lekcji ---")
    
    # Upewnij się, że katalog docelowy istnieje
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    with requests.Session() as session:
        discovered_urls, names_map = discover_plan_urls_and_names(session)
        
        if not discovered_urls or not any(discovered_urls.values()):
            print("\nNie udało się odkryć żadnych URL-i do planów. Zatrzymuję skrypt.")
            return

        print("\nPobieranie pełnych nazw sal...")
        for url_path in discovered_urls['rooms']:
            file_id = url_path.split('/')[-1].replace('.html', '')
            full_url = urljoin(BASE_URL, url_path)
            try:
                response = session.get(full_url)
                response.raise_for_status()
                response = _prepare_response_encoding(response)
                soup = BeautifulSoup(response.text, 'html.parser')
                title = soup.find('span', class_='tytulnapis')
                if title:
                    names_map['rooms'][file_id] = _fix_mojibake(title.get_text(strip=True))
            except requests.RequestException as e:
                print(f"Błąd przy pobieraniu nazwy sali z {full_url}: {e}")

        all_timetables = {}
        all_urls_to_process = [
            *discovered_urls['teachers'],
            *discovered_urls['rooms'],
            *discovered_urls['classes']
        ]
        
        print(f"\nRozpoczynam pobieranie i parsowanie {len(all_urls_to_process)} planów lekcji...")
        
        for i, url_path in enumerate(all_urls_to_process):
            file_id = url_path.split('/')[-1].replace('.html', '')
            full_url = urljoin(BASE_URL, url_path)
            
            print(f"[{i+1}/{len(all_urls_to_process)}] Przetwarzam: {full_url} (ID: {file_id})")

            try:
                response = session.get(full_url)
                response.raise_for_status()
                response = _prepare_response_encoding(response)

                lessons = parse_timetable_html(response.text)
                all_timetables[file_id] = lessons

            except requests.RequestException as e:
                print(f"  -> Błąd! Nie udało się pobrać {full_url}: {e}")
                all_timetables[file_id] = []

        final_data = {
            "metadata": {
                "source": BASE_URL,
                "scraped_on": __import__('datetime').datetime.now().isoformat(),
                "generation_date_from_page": ""
            },
            "teachers": names_map['teachers'],
            "rooms": names_map['rooms'],
            "classes": names_map['classes'],
            "timetables": all_timetables,
        }
        
        try:
            if all_urls_to_process:
                any_url = urljoin(BASE_URL, all_urls_to_process[0])
                response = session.get(any_url)
                response.raise_for_status()
                response = _prepare_response_encoding(response)
                soup = BeautifulSoup(response.text, 'html.parser')
                op_td = soup.find('td', class_='op')
                if op_td:
                    gen_date_text = op_td.get_text(strip=True)
                    match = re.search(r'wygenerowano (\d{2}\.\d{2}\.\d{4})', gen_date_text)
                    if match:
                        final_data["metadata"]["generation_date_from_page"] = match.group(1)
                        print(f"\nData generacji planu (ze strony): {match.group(1)}")
        except Exception as e:
            print(f"\nNie udało się odczytać daty generacji planu: {e}")

    print(f"\nZapisywanie wszystkich danych do pliku: {OUTPUT_FILE}")
    try:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(final_data, f, ensure_ascii=False, indent=2)
        print("--- Zakończono pomyślnie! ---")
    except IOError as e:
        print(f"Błąd podczas zapisu do pliku: {e}")


if __name__ == "__main__":
    main()
