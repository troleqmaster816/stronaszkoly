import json
from bs4 import BeautifulSoup
import re

# Funkcja pomocnicza do konwersji liczby na format rzymski (dla rozdziałów)
def to_roman(n):
    if not 0 < n < 4000:
        return str(n)
    ints = (1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1)
    nums = ('M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I')
    result = []
    for i in range(len(ints)):
        count = int(n / ints[i])
        result.append(nums[i] * count)
        n -= ints[i] * count
    return ''.join(result)

# Funkcja pomocnicza do konwersji liczby na format literowy (a, b, c)
def to_alpha(n):
    if n <= 0:
        return ""
    result = ""
    while n > 0:
        n, remainder = divmod(n - 1, 26)
        result = chr(65 + remainder) + result
    return result.lower()


# Mapowanie ID list na ich styl numeracji, odtworzone z CSS w pliku HTML
# (format, separator, poziom wcięcia)
LIST_STYLE_MAP = {
    # Przykłady, w pełnym skrypcie można by zmapować więcej
    # Decimal z kropką: 1. 2. 3.
    re.compile(r'l(1|2|5|7|9|18|23|26|29|30|33|34|35|37|39|41|43|48|49|51|54|55|59|60|63|68|69|70|71|72|73|74|76|78|79|86|89|92|94|96|97|102|115|120|125|127|130|133|141|142|144|146|149|175|178|179|180|181)'): ('decimal', '.', 1),
    # Decimal z nawiasem: 1) 2) 3)
    re.compile(r'l(6|8|10|11|19|20|24|25|27|31|32|36|38|40|42|44|45|46|47|50|52|56|58|61|62|64|65|67|75|77|80|83|84|87|88|90|91|93|95|98|101|103|109|111|112|113|116|117|118|119|121|123|124|126|128|129|131|132|134|135|137|138|139|140|143|145|147|148|150|151|152|154|155|157|159|167|176|177)'): ('decimal', ')', 2),
    # Lower-latin z nawiasem: a) b) c)
    re.compile(r'l(3|4|12|13|14|15|16|17|21|22|28|53|57|66|81|85|99|100|104|105|106|107|108|110|114|122|136|153|156|158|160|161|162|163|164|165|166|168|169|172|173|174)'): ('alpha', ')', 3),
     # Listy z myślnikiem
    re.compile(r'l(82|170|171)'): ('dash', '', 4)
}

def get_list_style(list_id):
    """Zwraca styl numeracji dla danego ID listy."""
    for pattern, style in LIST_STYLE_MAP.items():
        if pattern.fullmatch(list_id):
            return style
    return ('decimal', '.', 1) # Domyślny styl

def parse_html_statut(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'lxml')

    # ---- 1. Ekstrakcja metadanych i tytułu ----
    main_title = soup.find('h1').get_text(strip=True) if soup.find('h1') else ''
    subtitles = [h2.get_text(strip=True) for h2 in soup.find_all('h2')]

    # ---- 2. Ekstrakcja podstawy prawnej ----
    legal_basis_list = soup.find('ol', id='l1')
    legal_basis = []
    if legal_basis_list:
        # Tekst po liście też należy do ostatniego punktu
        last_item_extra_text = legal_basis_list.find_next_sibling('p').get_text(strip=True)
        items = legal_basis_list.find_all('li', recursive=False)
        for i, li in enumerate(items):
            text = ' '.join(p.get_text(strip=True) for p in li.find_all('p'))
            if i == len(items) - 1:
                text += " " + last_item_extra_text
            legal_basis.append(text)

    # ---- 3. Ekstrakcja spisu treści ----
    toc_heading = soup.find('h3', string=re.compile(r'Spis treści'))
    table_of_contents = []
    if toc_heading:
        for p in toc_heading.find_next_siblings('p'):
            link = p.find('a')
            if link and 'href' in link.attrs:
                href = link['href']
                # Usuwamy numer strony z tekstu
                text = re.sub(r'\s+\d+$', '', p.get_text(strip=True))
                table_of_contents.append({
                    "text": text,
                    "link": href
                })
            else:
                # Koniec spisu treści
                break

    # ---- 4. Główna pętla parsująca treść statutu ----
    chapters = []
    current_chapter = None
    current_section = None
    
    # Znajdź pierwszy rozdział, żeby zacząć parsowanie
    first_chapter_heading = soup.find('h3', id="bookmark0")
    if not first_chapter_heading:
        # Spróbuj znaleźć po tekście, jeśli ID nie zadziała
         first_chapter_heading = soup.find('h3', text=re.compile(r'ROZDZIAŁ I'))

    for tag in first_chapter_heading.find_all_next(['h3', 'h4', 'p', 'ol', 'ul']):
        # Zatrzymujemy się, jeśli dojdziemy do końca dokumentu (np. do kolejnego spisu treści)
        if tag.find_parent('head'): continue
        if tag.find('a', href=lambda h: h and h.startswith('#bookmark')) and any(item['link'] == tag.find('a')['href'] for item in table_of_contents):
             # To prawdopodobnie element ze spisu treści, a nie content - pomijamy
             pass


        # Nowy rozdział
        if tag.name == 'h3':
            chapter_title = tag.get_text(strip=True)
            bookmark_tag = tag.find('a', {'name': re.compile(r'bookmark\d+')})
            if not bookmark_tag:
                 # Czasem `a` jest przed `h3`
                 bookmark_tag = tag.find_previous('a', {'name': re.compile(r'bookmark\d+')})
            
            chapter_id = bookmark_tag['name'] if bookmark_tag else f"chapter-{len(chapters)+1}"
            
            current_chapter = {
                "id": chapter_id,
                "title": chapter_title,
                "sections": []
            }
            chapters.append(current_chapter)
            current_section = None
            continue

        # Nowa sekcja (§)
        if tag.name == 'h4':
            if current_chapter is None: continue # Ignoruj, jeśli nie ma rozdziału
            
            section_title = tag.get_text(strip=True)
            bookmark_tag = tag.find('a', {'name': re.compile(r'bookmark\d+')})
            if not bookmark_tag:
                 bookmark_tag = tag.find_previous('a', {'name': re.compile(r'bookmark\d+')})
                 
            section_id = bookmark_tag['name'] if bookmark_tag else f"section-{len(current_chapter['sections'])+1}"

            current_section = {
                "id": section_id,
                "title": section_title,
                "content": []
            }
            current_chapter["sections"].append(current_section)
            continue
        
        # Elementy contentu
        container = current_section["content"] if current_section else (current_chapter["content"] if current_chapter and "content" in current_chapter else None)
        if container is None: continue

        # Akapit
        if tag.name == 'p' and tag.get_text(strip=True):
            container.append({
                "type": "paragraph",
                "html": str(tag)
            })
        
        # Lista
        if tag.name in ['ol', 'ul']:
            
            def process_list(list_tag, level=1):
                list_items = []
                list_id = list_tag.get('id', '')
                style_type, separator, _ = get_list_style(list_id)
                
                counter = 1
                for li in list_tag.find_all('li', recursive=False):
                    number_str = ""
                    if style_type == 'decimal':
                        number_str = f"{counter}{separator}"
                    elif style_type == 'alpha':
                        number_str = f"{to_alpha(counter)}{separator}"
                    elif style_type == 'dash':
                        number_str = "-"

                    text_content = ' '.join(p.get_text(strip=True) for p in li.find_all('p', recursive=False))
                    
                    item = {
                        "type": "list_item",
                        "level": level,
                        "number": number_str,
                        "text": text_content,
                        "children": []
                    }
                    
                    # Sprawdź, czy są zagnieżdżone listy
                    nested_list = li.find(['ol', 'ul'], recursive=False)
                    if nested_list:
                        item["children"] = process_list(nested_list, level + 1)

                    list_items.append(item)
                    counter += 1
                return list_items

            # Wstawiamy sparsowane elementy listy do kontenera
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

    parsed_data = parse_html_statut(input_file)

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(parsed_data, f, indent=2, ensure_ascii=False)

    print(f"Parsowanie zakończone. Wynik zapisano w pliku: {output_file}")