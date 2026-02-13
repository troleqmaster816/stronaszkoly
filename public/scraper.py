import datetime
import json
import os
import re
from collections import defaultdict
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "timetable_data.json")

# Strona WordPress osadzająca iframe z właściwym planem
TIMETABLE_LANDING_URL = os.environ.get(
    "TIMETABLE_LANDING_URL",
    "https://e-qwerty.zse-zdwola.pl/plan-lekcji-2024-2025/",
)
# Fallback bezpośrednio do źródła planu
TIMETABLE_FALLBACK_URL = os.environ.get(
    "TIMETABLE_FALLBACK_URL",
    "https://planlekcji.zse-zdwola.pl/",
)

REQUEST_TIMEOUT = float(os.environ.get("SCRAPER_TIMEOUT", "20"))
REQUEST_RETRIES = max(1, int(os.environ.get("SCRAPER_RETRIES", "3")))
USER_AGENT = os.environ.get(
    "SCRAPER_UA",
    "Mozilla/5.0 (compatible; ZSE-TimetableScraper/2.0; +https://zse-zdwola.pl)",
)


def normalize_text(value):
    if value is None:
        return ""
    value = str(value).replace("\xa0", " ")
    return re.sub(r"\s+", " ", value).strip()


def normalize_time(value):
    text = normalize_text(value)
    text = text.replace("–", "-").replace("—", "-")
    text = re.sub(r"\s*-\s*", " - ", text)
    return normalize_text(text)


def parse_int_attr(value, default=1):
    try:
        parsed = int(value)
        return parsed if parsed > 0 else default
    except Exception:
        return default


def canonical_id(domain, raw_id):
    prefixes = {"teachers": "n", "rooms": "s", "classes": "o"}
    return f"{prefixes[domain]}{raw_id}"


def extract_hash_id(href):
    if not href:
        return None
    href = str(href).strip()
    if not href.startswith("#"):
        return None
    rid = href[1:].strip()
    return rid or None


def ensure_entity(domain, raw_id, label, raw_to_canon, names_map):
    if not raw_id:
        return None
    raw = normalize_text(raw_id)
    if not raw:
        return None
    canon = raw_to_canon[domain].get(raw)
    if not canon:
        canon = canonical_id(domain, raw)
        raw_to_canon[domain][raw] = canon
    lbl = normalize_text(label)
    if lbl and canon not in names_map[domain]:
        names_map[domain][canon] = lbl
    elif canon not in names_map[domain]:
        names_map[domain][canon] = raw
    return canon


def prepare_response_encoding(response, fallback="utf-8"):
    """Prefer apparent UTF-8 when server omits/sets legacy latin-1 charset."""
    encoding = (response.encoding or "").lower()
    if not encoding or encoding in {"iso-8859-1", "latin-1", "latin1", "ascii"}:
        apparent = (response.apparent_encoding or "").strip()
        if apparent:
            response.encoding = apparent
        else:
            response.encoding = fallback
    return response


def request_with_retries(session, url):
    last_err = None
    for attempt in range(1, REQUEST_RETRIES + 1):
        try:
            resp = session.get(url, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            return prepare_response_encoding(resp)
        except requests.RequestException as e:
            last_err = e
            print(f"  -> Próba {attempt}/{REQUEST_RETRIES} nieudana dla {url}: {e}")
    raise last_err


def discover_source_url(session):
    print(f"Pobieranie strony osadzającej plan: {TIMETABLE_LANDING_URL}")
    try:
        landing_resp = request_with_retries(session, TIMETABLE_LANDING_URL)
        soup = BeautifulSoup(landing_resp.text, "html.parser")
        iframe = soup.find("iframe", id="planIframe") or soup.find("iframe")
        if iframe and iframe.get("src"):
            source = urljoin(landing_resp.url, iframe["src"])
            print(f"Wykryto źródło planu z iframe: {source}")
            return source
        print("Nie znaleziono iframe z planem. Używam fallback URL.")
    except requests.RequestException as e:
        print(f"Nie udało się pobrać strony landing: {e}. Używam fallback URL.")
    return TIMETABLE_FALLBACK_URL


def parse_navigation_entities(soup):
    raw_to_canon = {"teachers": {}, "rooms": {}, "classes": {}}
    names_map = {"teachers": {}, "rooms": {}, "classes": {}}

    nav_root = soup.select_one("nav > div")
    if not nav_root:
        raise RuntimeError("Nie znaleziono sekcji nawigacji z listami oddziałów/nauczycieli/sal.")

    current_domain = None
    for node in nav_root.children:
        if not getattr(node, "name", None):
            continue
        node_name = node.name.lower()
        classes = set(node.get("class", []) or [])

        if node_name == "div" and "h" in classes:
            header = normalize_text(node.get_text(" ", strip=True)).lower()
            if "oddzia" in header:
                current_domain = "classes"
            elif "nauczyc" in header:
                current_domain = "teachers"
            elif "sale" in header:
                current_domain = "rooms"
            else:
                current_domain = None
            continue

        if node_name == "a" and "l" in classes and current_domain:
            raw_id = extract_hash_id(node.get("href"))
            label = normalize_text(node.get_text(" ", strip=True))
            ensure_entity(current_domain, raw_id, label, raw_to_canon, names_map)

    print(
        "Wykryto encje: "
        f"{len(names_map['teachers'])} nauczycieli, "
        f"{len(names_map['rooms'])} sal, "
        f"{len(names_map['classes'])} oddziałów."
    )
    return raw_to_canon, names_map


def extract_generation_date(soup):
    footer = soup.find("footer")
    if not footer:
        return ""
    txt = normalize_text(footer.get_text(" ", strip=True))
    m = re.search(r"(\d{2}\.\d{2}\.\d{4})", txt)
    return m.group(1) if m else ""


def extract_day_columns(table):
    header_row = table.select_one("thead tr")
    if not header_row:
        return []
    cells = header_row.find_all("td", recursive=False)
    if len(cells) < 3:
        return []
    day_cols = []
    col_idx = 2
    for cell in cells[2:]:
        day = normalize_text(cell.get_text(" ", strip=True))
        span = parse_int_attr(cell.get("colspan"), 1)
        if day:
            day_cols.append((day, col_idx, span))
        col_idx += span
    return day_cols


def expand_tbody_rows(tbody):
    rows = []
    active = {}  # col_idx -> (cell, remaining_rows)

    for tr in tbody.find_all("tr", recursive=False):
        row = {}  # col_idx -> (cell, from_active)
        col = 0

        def consume_active_until_gap(start_col):
            c = start_col
            while c in active:
                cell, remaining = active[c]
                row[c] = (cell, True)
                if remaining <= 1:
                    del active[c]
                else:
                    active[c] = (cell, remaining - 1)
                c += 1
            return c

        col = consume_active_until_gap(col)
        for cell in tr.find_all("td", recursive=False):
            col = consume_active_until_gap(col)
            rowspan = parse_int_attr(cell.get("rowspan"), 1)
            colspan = parse_int_attr(cell.get("colspan"), 1)

            for offset in range(colspan):
                idx = col + offset
                row[idx] = (cell, False)
                if rowspan > 1:
                    active[idx] = (cell, rowspan - 1)
            col += colspan
            col = consume_active_until_gap(col)

        while True:
            if col in active:
                cell, remaining = active[col]
                row[col] = (cell, True)
                if remaining <= 1:
                    del active[col]
                else:
                    active[col] = (cell, remaining - 1)
                col += 1
                continue
            higher = [k for k in active.keys() if k > col]
            if not higher:
                break
            col = min(higher)

        rows.append(row)

    return rows


def parse_ref_from_cell(cell, domain, raw_to_canon, names_map):
    if cell is None:
        return None
    anchor = cell.find("a", href=True)
    if not anchor:
        return None
    raw_id = extract_hash_id(anchor.get("href"))
    label = normalize_text(anchor.get_text(" ", strip=True))
    canon = ensure_entity(domain, raw_id, label, raw_to_canon, names_map)
    if not canon:
        return None
    return {"id": canon, "name": names_map[domain].get(canon) or label}


def parse_subject_and_group(cell, raw_to_canon, names_map):
    if cell is None:
        return None, None, None

    group_ref = None
    subgroup_mark = None

    group_block = cell.find("div", class_="g")
    if group_block:
        group_anchor = group_block.find("a", href=True)
        if group_anchor:
            raw_group_id = extract_hash_id(group_anchor.get("href"))
            group_name = normalize_text(group_anchor.get_text(" ", strip=True))
            canon_group_id = ensure_entity("classes", raw_group_id, group_name, raw_to_canon, names_map)
            if canon_group_id:
                group_ref = {
                    "id": canon_group_id,
                    "name": names_map["classes"].get(canon_group_id) or group_name,
                }
        gtxt = normalize_text(group_block.get_text(" ", strip=True))
        m = re.search(r"\(([^()]+)\)\s*$", gtxt)
        if m:
            subgroup_mark = normalize_text(m.group(1))

    clone = BeautifulSoup(str(cell), "html.parser")
    for g in clone.select("div.g"):
        g.decompose()
    subject = normalize_text(clone.get_text(" ", strip=True))
    if not subject:
        subject = None

    return subject, group_ref, subgroup_mark


def normalize_subject_for_match(subject):
    s = normalize_text(subject).lower()
    if not s:
        return ""
    s = re.sub(r"\s*-\s*([0-9]+/[0-9]+|[a-ząćęłńóśżź]\d+)\s*$", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*\(([0-9]+/[0-9]+|[a-ząćęłńóśżź]\d+)\)\s*$", "", s, flags=re.IGNORECASE)
    return normalize_text(s)


def add_mark_to_subject(subject, mark):
    subject = normalize_text(subject)
    mark = normalize_text(mark)
    if not subject or not mark:
        return subject
    if re.search(rf"(?:^|[\s\-(]){re.escape(mark)}(?:$|[\s)])", subject, flags=re.IGNORECASE):
        return subject
    return f"{subject} - {mark}"


def lesson_key(lesson):
    group_id = lesson.get("group", {}).get("id", "") if lesson.get("group") else ""
    teacher_id = lesson.get("teacher", {}).get("id", "") if lesson.get("teacher") else ""
    room_id = lesson.get("room", {}).get("id", "") if lesson.get("room") else ""
    subject_norm = normalize_subject_for_match(lesson.get("_subject_base") or lesson.get("subject") or "")
    return (
        group_id,
        lesson.get("day") or "",
        lesson.get("lesson_num") or "",
        lesson.get("time") or "",
        subject_norm,
        teacher_id,
        room_id,
    )


def mark_sort_key(mark):
    mark = normalize_text(mark)
    m = re.match(r"^(\d+)/(\d+)$", mark)
    if m:
        num = int(m.group(1))
        den = int(m.group(2))
        return (0, den, num, mark)
    return (1, mark.lower(), mark)


def parse_table(
    table,
    domain,
    current_ref,
    raw_to_canon,
    names_map,
):
    day_columns = extract_day_columns(table)
    tbody = table.find("tbody")
    if not tbody:
        return []

    parsed_lessons = []
    expanded_rows = expand_tbody_rows(tbody)

    for row in expanded_rows:
        lesson_num_cell = row.get(0)
        time_cell = row.get(1)
        lesson_num = normalize_text(lesson_num_cell[0].get_text(" ", strip=True) if lesson_num_cell else "")
        time = normalize_time(time_cell[0].get_text(" ", strip=True) if time_cell else "")
        if not lesson_num or not time:
            continue

        for day, start_col, span in day_columns:
            if span not in (2, 3):
                continue

            subject_entry = row.get(start_col)
            other_entry_1 = row.get(start_col + 1)
            other_entry_2 = row.get(start_col + 2) if span == 3 else None

            subject_cell = subject_entry[0] if subject_entry else None
            subject_from_active = subject_entry[1] if subject_entry else False

            subject, parsed_group, subgroup_mark = parse_subject_and_group(subject_cell, raw_to_canon, names_map)
            teacher = None
            room = None
            group = None
            from_active_flags = []

            if subject_entry:
                from_active_flags.append(subject_from_active)
            if other_entry_1:
                from_active_flags.append(other_entry_1[1])
            if other_entry_2:
                from_active_flags.append(other_entry_2[1])

            # Gdy cały slot to tylko kontynuacja rowspan z poprzedniego wiersza, pomijamy duplikat.
            if from_active_flags and all(from_active_flags):
                continue

            if span == 3:
                teacher_cell = other_entry_1[0] if other_entry_1 else None
                room_cell = other_entry_2[0] if other_entry_2 else None
                teacher = parse_ref_from_cell(teacher_cell, "teachers", raw_to_canon, names_map)
                room = parse_ref_from_cell(room_cell, "rooms", raw_to_canon, names_map)
                if not any([subject, teacher, room, parsed_group]):
                    continue
                group = parsed_group or dict(current_ref)
            else:
                other_cell = other_entry_1[0] if other_entry_1 else None
                if domain == "teachers":
                    teacher = dict(current_ref)
                    room = parse_ref_from_cell(other_cell, "rooms", raw_to_canon, names_map)
                    group = parsed_group
                    if not any([subject, room, parsed_group]):
                        continue
                elif domain == "rooms":
                    teacher = parse_ref_from_cell(other_cell, "teachers", raw_to_canon, names_map)
                    room = dict(current_ref)
                    group = parsed_group
                    if not any([subject, teacher, parsed_group]):
                        continue
                else:
                    # Teoretycznie nie powinno wystąpić dla tabel klas.
                    group = parsed_group or dict(current_ref)
                    if not any([subject, teacher, room, parsed_group]):
                        continue

            if subgroup_mark and subject:
                subject = add_mark_to_subject(subject, subgroup_mark)

            if not any([subject, teacher, group, room]):
                continue

            parsed_lessons.append(
                {
                    "day": day,
                    "lesson_num": lesson_num,
                    "time": time,
                    "subject": subject or "",
                    "teacher": teacher,
                    "group": group,
                    "room": room,
                    "_source_domain": domain,
                    "_subject_base": subject or "",
                    "_subgroup_mark": subgroup_mark,
                }
            )

    return parsed_lessons


def build_subgroup_pools(all_timetables):
    teacher_pool = defaultdict(list)
    room_pool = defaultdict(list)

    for lessons in all_timetables.values():
        for lesson in lessons:
            mark = normalize_text(lesson.get("_subgroup_mark"))
            group = lesson.get("group")
            if not mark or not group or not str(group.get("id", "")).startswith("o"):
                continue
            key = lesson_key(lesson)
            if lesson.get("_source_domain") == "teachers":
                teacher_pool[key].append(mark)
            elif lesson.get("_source_domain") == "rooms":
                room_pool[key].append(mark)
    return teacher_pool, room_pool


def apply_subgroup_mark(lesson, mark):
    mark = normalize_text(mark)
    if not mark:
        return
    lesson["_subgroup_mark"] = mark
    if lesson.get("subject"):
        lesson["subject"] = add_mark_to_subject(lesson["subject"], mark)
    group = lesson.get("group")
    if group and group.get("name"):
        base_name = re.sub(r"\s*\([^()]+\)\s*$", "", normalize_text(group["name"]))
        group["name"] = f"{base_name} ({mark})"


def reconstruct_class_subgroups(all_timetables):
    teacher_pool, room_pool = build_subgroup_pools(all_timetables)
    assigned = 0
    ambiguous = 0

    class_groups = defaultdict(list)  # key -> list of lesson refs
    for lessons in all_timetables.values():
        for lesson in lessons:
            if lesson.get("_source_domain") != "classes":
                continue
            if lesson.get("_subgroup_mark"):
                continue
            class_groups[lesson_key(lesson)].append(lesson)

    for key, class_lessons in class_groups.items():
        if not class_lessons:
            continue

        marks = teacher_pool.get(key) or room_pool.get(key) or []
        marks = [normalize_text(m) for m in marks if normalize_text(m)]
        if not marks:
            continue

        unique_marks = sorted(set(marks), key=mark_sort_key)
        if len(unique_marks) == 1:
            for lesson in class_lessons:
                apply_subgroup_mark(lesson, unique_marks[0])
                assigned += 1
            continue

        if len(marks) == len(class_lessons):
            sorted_marks = sorted(marks, key=mark_sort_key)
            for lesson, mark in zip(class_lessons, sorted_marks):
                apply_subgroup_mark(lesson, mark)
                assigned += 1
            continue

        ambiguous += len(class_lessons)

    return assigned, ambiguous


def to_public_lessons(lessons):
    out = []
    for lesson in lessons:
        out.append(
            {
                "day": lesson.get("day", ""),
                "lesson_num": lesson.get("lesson_num", ""),
                "time": lesson.get("time", ""),
                "subject": lesson.get("subject", ""),
                "teacher": lesson.get("teacher"),
                "group": lesson.get("group"),
                "room": lesson.get("room"),
            }
        )
    return out


def main():
    print("--- Rozpoczynam scrapowanie planu lekcji ---")
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    source_url = discover_source_url(session)
    print(f"Pobieranie właściwego planu: {source_url}")

    try:
        response = request_with_retries(session, source_url)
    except requests.RequestException as e:
        print(f"Błąd pobierania planu: {e}")
        return

    source_url = response.url
    soup = BeautifulSoup(response.text, "html.parser")

    try:
        raw_to_canon, names_map = parse_navigation_entities(soup)
    except RuntimeError as e:
        print(f"Błąd parsowania nawigacji: {e}")
        return

    all_timetables_internal = {}
    table_count = 0
    unknown_table_ids = 0

    for table in soup.select("table.plan"):
        table_count += 1
        raw_table_id = table.get("id")
        if not raw_table_id:
            continue
        raw_table_id = normalize_text(raw_table_id)
        if not raw_table_id:
            continue

        if raw_table_id in raw_to_canon["classes"]:
            domain = "classes"
        elif raw_table_id in raw_to_canon["teachers"]:
            domain = "teachers"
        elif raw_table_id in raw_to_canon["rooms"]:
            domain = "rooms"
        else:
            # awaryjnie dopisz do klas (żeby nie stracić danych)
            unknown_table_ids += 1
            domain = "classes"
            label = normalize_text(table.find("caption").get_text(" ", strip=True) if table.find("caption") else raw_table_id)
            ensure_entity(domain, raw_table_id, label, raw_to_canon, names_map)

        canon_table_id = raw_to_canon[domain].get(raw_table_id)
        if not canon_table_id:
            label = normalize_text(table.find("caption").get_text(" ", strip=True) if table.find("caption") else raw_table_id)
            canon_table_id = ensure_entity(domain, raw_table_id, label, raw_to_canon, names_map)

        current_name = names_map[domain].get(canon_table_id) or normalize_text(
            table.find("caption").get_text(" ", strip=True) if table.find("caption") else raw_table_id
        )
        current_ref = {"id": canon_table_id, "name": current_name}

        lessons = parse_table(table, domain, current_ref, raw_to_canon, names_map)
        all_timetables_internal[canon_table_id] = lessons

    # Upewnij się, że każda encja ma klucz w timetables (nawet pusty)
    for domain in ("teachers", "rooms", "classes"):
        for canon_id in names_map[domain].keys():
            all_timetables_internal.setdefault(canon_id, [])

    assigned_subgroups, ambiguous_subgroups = reconstruct_class_subgroups(all_timetables_internal)

    total_lessons = sum(len(v) for v in all_timetables_internal.values())
    print(
        "Podsumowanie parsowania: "
        f"tabele={table_count}, "
        f"lekcje={total_lessons}, "
        f"uzupełnione_podgrupy={assigned_subgroups}, "
        f"niejednoznaczne_podgrupy={ambiguous_subgroups}, "
        f"nieznane_tabele={unknown_table_ids}"
    )

    generation_date = extract_generation_date(soup)
    if generation_date:
        print(f"Data obowiązywania planu: {generation_date}")

    all_timetables_public = {
        tid: to_public_lessons(lessons)
        for tid, lessons in all_timetables_internal.items()
    }

    final_data = {
        "metadata": {
            "source": source_url,
            "scraped_on": datetime.datetime.now().isoformat(),
            "generation_date_from_page": generation_date,
        },
        "teachers": names_map["teachers"],
        "rooms": names_map["rooms"],
        "classes": names_map["classes"],
        "timetables": all_timetables_public,
    }

    tmp_file = OUTPUT_FILE + ".tmp"
    print(f"Zapisywanie danych do: {OUTPUT_FILE}")
    try:
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(final_data, f, ensure_ascii=False, indent=2)
        os.replace(tmp_file, OUTPUT_FILE)
        print("--- Zakończono pomyślnie! ---")
    except IOError as e:
        print(f"Błąd podczas zapisu: {e}")
        try:
            if os.path.exists(tmp_file):
                os.remove(tmp_file)
        except OSError:
            pass


if __name__ == "__main__":
    main()
