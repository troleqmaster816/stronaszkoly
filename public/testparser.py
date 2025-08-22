import json
import re
from bs4 import BeautifulSoup

def to_alpha(n):
    """Konwertuje liczbę na małą literę alfabetu (1->a, 2->b)."""
    if n <= 0: return ""
    result = ""
    while n > 0:
        n, remainder = divmod(n - 1, 26)
        result = chr(97 + remainder) + result
    return result

# Mapa stylów list, odtworzona z CSS. To klucz do poprawnej numeracji.
# Format: (typ_numeracji, separator_po_numerze)
# Długie listy ID są konieczne, bo konwerter nie użył klas, tylko unikalnych ID dla każdego stylu.
LIST_STYLE_MAP = {
    re.compile(r'l(1|2|5|7|9|18|23|26|29|30|33|34|35|37|39|41|43|48|49|51|54|55|59|60|63|68|69|70|71|72|73|74|76|78|79|86|89|92|94|96|97|102|115|120|125|127|130|133|141|142|144|146|149|175|178|179|180|181)'): ('decimal', '.'),
    re.compile(r'l(6|8|10|11|19|20|24|25|27|31|32|36|38|40|42|44|45|46|47|50|52|56|58|61|62|64|65|67|75|77|80|83|84|87|88|90|91|93|95|98|101|103|109|111|112|113|116|117|118|119|121|123|124|126|128|129|131|132|134|135|137|138|139|140|143|145|147|148|150|151|152|154|155|157|159|167|176|177)'): ('decimal', ')'),
    re.compile(r'l(3|4|12|13|14|15|16|17|21|22|28|53|57|66|81|85|99|100|104|105|106|107|108|110|114|122|136|153|156|158|160|161|162|163|164|165|166|168|169|172|173|174)'): ('alpha', ')'),
    re.compile(r'l(82|170|171)'): ('dash', '')
}

def get_list_style(list_id):
    """Zwraca styl numeracji dla danego ID listy."""
    if not list_id:
        return ('decimal', '.',)
    for pattern, style in LIST_STYLE_MAP.items():
        if pattern.fullmatch(list_id):
            return style
    return ('decimal', '.',)  # Domyślny styl w razie braku dopasowania

def clean_text(text):
    """Usuwa nadmiarowe białe znaki."""
    return ' '.join(text.split()).strip()

def parse_html_statut(filepath):
    """Główna funkcja parsująca plik HTML."""
    with open(filepath, 'r', encoding='utf-8') as f:
        # Używamy 'html.parser' dla pewności działania bez dodatkowych bibliotek
        soup = BeautifulSoup(f, 'html.parser')

    # ---- 1. Ekstrakcja metadanych i tytułu ----
    main_title = soup.find('h1').get_text(strip=True) if soup.find('h1') else 'Brak Tytułu'
    subtitles = [clean_text(h2.get_text()) for h2 in soup.find_all('h2')]

    # ---- 2. Ekstrakcja podstawy prawnej ----
    legal_basis_list = soup.find('ol', id='l1')
    legal_basis = []
    if legal_basis_list:
        last_item_extra_text = clean_text(legal_basis_list.find_next_sibling('p').get_text())
        items = legal_basis_list.find_all('li', recursive=False)
        for i, li in enumerate(items):
            text = clean_text(' '.join(p.get_text() for p in li.find_all('p')))
            if i == len(items) - 1 and last_item_extra_text:
                text += " " + last_item_extra_text
            legal_basis.append(text)
            
    # ---- 3. Ekstrakcja spisu treści ----
    toc_heading = soup.find('h3', string=re.compile(r'Spis treści'))
    table_of_contents = []
    if toc_heading:
        current_element = toc_heading.find_next_sibling()
        while current_element and current_element.name == 'p':
            link = current_element.find('a')
            if link and 'href' in link.attrs and link['href'].startswith('#bookmark'):
                text_content = re.sub(r'\s+\d+$', '', current_element.get_text(strip=True))
                table_of_contents.append({"text": clean_text(text_content), "link": link['href']})
            current_element = current_element.find_next_sibling()

    # ---- 4. Parsowanie głównej treści ----
    chapters = []
    current_chapter = None
    current_section = None
    
    first_chapter_heading = soup.find('h3', id="bookmark0")
    if not first_chapter_heading:
        print("Nie znaleziono pierwszego rozdziału, parsowanie treści może być niekompletne.")
        return {}

    # Iterujemy po wszystkich tagach PO pierwszym nagłówku rozdziału
    for tag in first_chapter_heading.find_all_next(['h3', 'h4', 'p', 'ol']):
        # Nowy rozdział
        if tag.name == 'h3':
            bookmark_tag = tag.find('a', {'name': re.compile(r'bookmark\d+')})
            current_chapter = {
                "id": bookmark_tag['name'] if bookmark_tag else f"chapter-{len(chapters)+1}",
                "title": clean_text(tag.get_text()),
                "sections": []
            }
            chapters.append(current_chapter)
            current_section = None # Resetujemy sekcję po znalezieniu nowego rozdziału
            continue

        # Nowa sekcja (§)
        if tag.name == 'h4':
            if not current_chapter: continue # Pomiń, jeśli nie jesteśmy w żadnym rozdziale
            bookmark_tag = tag.find('a', {'name': re.compile(r'bookmark\d+')})
            current_section = {
                "id": bookmark_tag['name'] if bookmark_tag else f"section-{len(current_chapter['sections'])+1}",
                "title": clean_text(tag.get_text()),
                "content": []
            }
            current_chapter["sections"].append(current_section)
            continue
        
        container = current_section["content"] if current_section else None
        if container is None: continue

        # Akapit lub specjalny "podnagłówek"
        if tag.name == 'p' and tag.get_text(strip=True):
            # Sprawdzamy, czy akapit zawiera specjalny podkreślony nagłówek
            underlined = tag.find('u')
            if underlined and clean_text(tag.get_text()) == clean_text(underlined.get_text()):
                 container.append({"type": "subheading", "text": clean_text(underlined.get_text())})
            else:
                 container.append({"type": "paragraph", "html": str(tag)})
        
        # Lista
        if tag.name == 'ol':
            def process_list(list_tag, level=1):
                items = []
                list_id = list_tag.get('id', '')
                style_type, separator = get_list_style(list_id)
                
                counter = 1
                for li in list_tag.find_all('li', recursive=False):
                    number_str = ""
                    if style_type == 'decimal': number_str = f"{counter}{separator}"
                    elif style_type == 'alpha': number_str = f"{to_alpha(counter)}{separator}"
                    elif style_type == 'dash': number_str = "-"

                    # Sprawdzamy, czy w li jest nagłówek a potem lista
                    all_p = li.find_all('p', recursive=False)
                    text_parts = []
                    subheading = None
                    for p in all_p:
                        u_tag = p.find('u')
                        if u_tag and clean_text(p.get_text()) == clean_text(u_tag.get_text()):
                            subheading = clean_text(u_tag.get_text())
                        else:
                            text_parts.append(clean_text(p.get_text()))
                    
                    item = {
                        "type": "list_item",
                        "level": level,
                        "number": number_str,
                        "text": " ".join(text_parts),
                        "children": []
                    }

                    if subheading:
                        item['subheading'] = subheading

                    # Rekurencyjne przetwarzanie zagnieżdżonych list
                    nested_list = li.find(['ol', 'ul'], recursive=False)
                    if nested_list:
                        item["children"] = process_list(nested_list, level + 1)

                    items.append(item)
                    counter += 1
                return items

            container.extend(process_list(tag))

    # ---- 5. Złożenie finalnego JSONa ----
    result = {
        "documentTitle": main_title,
        "documentSubtitles": subtitles,
        "legalBasis": legal_basis,
        "tableOfContents": table_of_contents,
        "chapters": chapters
    }
    return result

# ---- Uruchomienie skryptu ----
if __name__ == "__main__":
    input_file = 'statut-szkolny.html'
    output_file = 'statut.json'

    try:
        parsed_data = parse_html_statut(input_file)
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(parsed_data, f, indent=2, ensure_ascii=False)
        print(f"Parsowanie zakończone pomyślnie. Wynik zapisano w pliku: {output_file}")
    except Exception as e:
        print(f"Wystąpił błąd podczas parsowania: {e}")