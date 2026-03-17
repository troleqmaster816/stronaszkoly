"""
Scraper for school documents from https://zse-zdwola.pl/regulaminy-dla-ucznia/
Parses the page for document links, downloads teaching plan PDFs,
and extracts structured data using pdftotext.

Output: public/documents.json
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import time
from functools import lru_cache
from statistics import median
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from bs4 import NavigableString

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "public")
OUTPUT_FILE = os.path.join(PUBLIC_DIR, "documents.json")

SOURCE_URL = "https://zse-zdwola.pl/regulaminy-dla-ucznia/"
USER_AGENT = "Mozilla/5.0 (compatible; ZSE-DocScraper/1.0; +https://zse-zdwola.pl)"
REQUEST_TIMEOUT = 15

TEACHING_PLAN_PROFILES = {
    "TP": {
        "name": "Technik Programista",
        "code": "351406",
        "classes": [1, 2, 3, 4],
    },
    "TI": {
        "name": "Technik Informatyk",
        "code": "351203",
        "classes": [1, 2, 3, 4, 5],
    },
    "TA": {
        "name": "Technik Automatyk",
        "code": "311909",
        "classes": [1, 2, 3, 5],
    },
    "TE": {
        "name": "Technik Elektronik",
        "code": "311408",
        "classes": [1, 2, 3, 4, 5],
    },
    "TG": {
        "name": "Technik Grafiki i Poligrafii Cyfrowej",
        "code": "311943",
        "classes": [1, 2],
    },
}

TEACHING_PLAN_BASE_URL = "https://zse-zdwola.pl/wp-content/uploads/2024/06/"


def emit(msg):
    print(f"[documents_scraper] {msg}", flush=True)


def get_page(url):
    r = requests.get(url, timeout=REQUEST_TIMEOUT, headers={"User-Agent": USER_AGENT})
    r.raise_for_status()
    return r.text


def normalize_space(value):
    return re.sub(r"\s+", " ", value or "").strip()


def is_supported_document_url(url):
    return any(url.endswith(ext) for ext in [".pdf", ".docx", ".doc", ".odt", ".xlsx"])


def is_format_only_label(value):
    return bool(re.fullmatch(r"\.?(pdf|docx|doc|odt|xlsx)", value.lower()))


def make_variant(link_data):
    return {
        "label": link_data["format"].upper(),
        "url": link_data["url"],
        "format": link_data["format"],
    }


def append_variant(target, link_data):
    variants = target.setdefault("variants", [])
    variant = make_variant(link_data)
    if not any(existing["url"] == variant["url"] for existing in variants):
        variants.append(variant)


def parse_document_link(link):
    href = link.get("href", "").strip()
    text = normalize_space(link.get_text(" ", strip=True))
    if not text or not href:
        return None
    full_url = urljoin(SOURCE_URL, href)
    if not is_supported_document_url(full_url):
        return None
    ext = os.path.splitext(full_url)[1].lower().lstrip(".")
    return {
        "title": text,
        "url": full_url,
        "format": ext,
    }


def parse_document_list_item(li):
    links = [parse_document_link(link) for link in li.find_all("a", href=True)]
    links = [link for link in links if link]
    if not links:
        return None

    primary = links[0]
    document = {
        "title": primary["title"],
        "url": primary["url"],
        "format": primary["format"],
        "category": categorize_document(primary["title"]),
        "variants": [make_variant(primary)],
    }

    attachment_groups = []
    current_group = None
    current_attachment = None

    def ensure_group(label):
        nonlocal current_group
        normalized = normalize_space(label.rstrip(":"))
        if not normalized:
            normalized = "Załączniki"
        for group in attachment_groups:
            if group["label"] == normalized:
                current_group = group
                return group
        group = {"label": normalized, "items": []}
        attachment_groups.append(group)
        current_group = group
        return group

    seen_primary = False
    for child in li.children:
        if isinstance(child, NavigableString):
            text = normalize_space(str(child))
            if not text or text in {"(", ")"}:
                continue
            if text.endswith(":"):
                ensure_group(text)
                current_attachment = None
            continue

        if child.name == "br":
            current_attachment = None
            continue

        if child.name != "a":
            text = normalize_space(child.get_text(" ", strip=True))
            if text.endswith(":"):
                ensure_group(text)
                current_attachment = None
            continue

        link_data = parse_document_link(child)
        if not link_data:
            continue

        if not seen_primary and link_data["url"] == primary["url"]:
            seen_primary = True
            continue

        if is_format_only_label(link_data["title"]):
            if current_attachment is not None:
                append_variant(current_attachment, link_data)
            else:
                append_variant(document, link_data)
            continue

        if current_group is None:
            ensure_group("Załączniki")

        attachment = {
            "title": link_data["title"],
            "variants": [make_variant(link_data)],
        }
        current_group["items"].append(attachment)
        current_attachment = attachment

    if len(document["variants"]) == 1:
        document.pop("variants", None)
    if attachment_groups:
        document["attachmentGroups"] = attachment_groups

    return document


def scrape_document_links(html):
    """Extract all document links from the regulations page."""
    soup = BeautifulSoup(html, "html.parser")
    documents = []
    seen_urls = set()

    content = soup.find("div", class_="entry-content") or soup.find("article") or soup
    list_items = content.find_all("li")

    if list_items:
        for li in list_items:
            document = parse_document_list_item(li)
            if not document:
                continue
            if document["url"] in seen_urls:
                continue
            seen_urls.add(document["url"])
            documents.append(document)
        return documents

    links = content.find_all("a", href=True)
    for link in links:
        document = parse_document_link(link)
        if not document:
            continue
        if document["url"] in seen_urls:
            continue
        seen_urls.add(document["url"])
        documents.append(document)

    return documents


def classify_documents(documents):
    """Separate general documents from teaching plans."""
    general = []
    teaching_plans_urls = set()

    for profile_key, profile in TEACHING_PLAN_PROFILES.items():
        for cls in profile["classes"]:
            filename = f"{cls}{profile_key}.pdf"
            url = TEACHING_PLAN_BASE_URL + filename
            teaching_plans_urls.add(url)

    for doc in documents:
        if doc["url"] not in teaching_plans_urls:
            general.append(doc)

    return general


def categorize_document(title):
    """Assign a category to a document based on its title."""
    title_lower = title.lower()
    if "regulamin" in title_lower:
        return "regulaminy"
    if "procedura" in title_lower or "procedury" in title_lower:
        return "procedury"
    if "wniosek" in title_lower or "załącznik" in title_lower or "zwolnienie" in title_lower:
        return "wnioski"
    if "rodo" in title_lower or "ochrona" in title_lower:
        return "ochrona-danych"
    if "statut" in title_lower:
        return "statut"
    if "program" in title_lower:
        return "programy"
    return "inne"


CATEGORY_LABELS = {
    "regulaminy": "Regulaminy",
    "procedury": "Procedury",
    "wnioski": "Wnioski i załączniki",
    "ochrona-danych": "Ochrona danych",
    "statut": "Statut",
    "programy": "Programy",
    "inne": "Inne dokumenty",
}

ROMAN_CLASS_NUMBERS = {
    "I": 1,
    "II": 2,
    "III": 3,
    "IV": 4,
    "V": 5,
}

PROFILE_LETTERS = {"A", "I", "E", "G", "P"}


def download_pdf_to_temp(url):
    """Download a PDF to a temp file, return its path."""
    r = requests.get(url, timeout=REQUEST_TIMEOUT, headers={"User-Agent": USER_AGENT})
    r.raise_for_status()
    fd, path = tempfile.mkstemp(suffix=".pdf")
    os.write(fd, r.content)
    os.close(fd)
    return path


def pdf_to_text(pdf_path):
    """Convert PDF to text using pdftotext."""
    try:
        result = subprocess.run(
            ["pdftotext", "-layout", pdf_path, "-"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return result.stdout
    except Exception as e:
        emit(f"pdftotext failed: {e}")
        return ""


def extract_teaching_plan_title(lines):
    for line in lines:
        normalized = normalize_space(line)
        if normalized:
            return normalized
    return ""


def infer_school_year(header_text, url):
    match = re.search(r"rok szkolny\s*(\d{4})\s*[-/]\s*(\d{4,5})", header_text, re.IGNORECASE)
    if match:
        start = int(match.group(1))
        end = int(match.group(2)[:4]) if len(match.group(2)) >= 4 else start + 1
        if end <= start:
            end = start + 1
        return {
            "start": start,
            "end": end,
            "label": f"{start}/{end}",
            "inferredFrom": "pdf-header",
        }

    match = re.search(r"/uploads/(\d{4})/(\d{2})/", url)
    if match:
        upload_year = int(match.group(1))
        upload_month = int(match.group(2))
        start = upload_year if upload_month >= 8 else upload_year - 1
        end = start + 1
        return {
            "start": start,
            "end": end,
            "label": f"{start}/{end}",
            "inferredFrom": "upload-url",
        }

    return {
        "start": None,
        "end": None,
        "label": None,
        "inferredFrom": "fallback",
    }


def split_header_class_segments(header_text):
    working = re.sub(r"\bkl\.\s*", "klasa ", header_text, flags=re.IGNORECASE)
    working = normalize_space(working)
    markers = list(re.finditer(r"\bklasa\b", working, flags=re.IGNORECASE))
    segments = []

    for index, marker in enumerate(markers):
        start = marker.end()
        end = markers[index + 1].start() if index + 1 < len(markers) else len(working)
        segment = working[start:end]
        segment = re.split(
            r"\brok szkolny\b|\btechnikum\b|\bprzedmioty realizowane\b|\btygodniowy wymiar\b|\bnazwa i symbol\b",
            segment,
            maxsplit=1,
            flags=re.IGNORECASE,
        )[0]
        segment = segment.strip(" -,:;")
        if segment:
            segments.append(segment)

    return segments


def parse_source_class_label(label):
    match = re.match(r"^(III|IV|II|I|V|[1-5])\s*([A-Za-z][A-Za-z ]{0,7})$", label.strip(), re.IGNORECASE)
    if not match:
        return None

    year_token = match.group(1).upper()
    suffix = re.sub(r"\s+", "", match.group(2))
    year = ROMAN_CLASS_NUMBERS.get(year_token) or int(year_token)

    technikum_index = suffix.upper().find("T")
    if technikum_index >= 0:
        profile_source = suffix[technikum_index + 1 :]
    else:
        profile_source = "".join(character for character in suffix if character.isupper())

    profile_letters = [letter for letter in profile_source.upper() if letter in PROFILE_LETTERS]
    return {
        "raw": normalize_space(label),
        "compact": f"{year}{suffix}",
        "year": year,
        "profileLetters": profile_letters,
    }


def extract_source_classes(lines, fallback_class_num, profile_key):
    header_text = " ".join(normalize_space(line) for line in lines[:3] if normalize_space(line))
    classes = []
    seen = set()

    for segment in split_header_class_segments(header_text):
        for part in re.split(r"\s*,\s*", segment):
            parsed = parse_source_class_label(part)
            if not parsed:
                continue
            if parsed["compact"] in seen:
                continue
            seen.add(parsed["compact"])
            classes.append(parsed)

    if classes:
        return classes

    fallback_label = f"{fallback_class_num}{profile_key}"
    return [
        {
            "raw": fallback_label,
            "compact": fallback_label,
            "year": fallback_class_num,
            "profileLetters": [letter for letter in profile_key if letter in PROFILE_LETTERS],
        }
    ]


def strip_leading_list_number(line):
    if len(line) - len(line.lstrip()) > 8:
        return line

    match = re.match(r"^(\s*)(\d+)(\s+)(.*)$", line)
    if not match:
        return line

    remainder = match.group(4)
    stripped_remainder = remainder.lstrip()
    if stripped_remainder and stripped_remainder[0].isdigit():
        return line
    return remainder


def clean_subject_title(value):
    return re.sub(r"\s+", " ", value or "").strip(" :-")


def should_skip_subject_title(title):
    title_lower = title.lower()
    if title_lower.startswith(
        (
            "razem",
            "suma",
            "ogółem",
            "łącznie",
            "tygodniowy rozkład zajęć",
            "obowiązkowe zajęcia edukacyjne",
            "nazwa i symbol",
            "technikum nr",
        )
    ):
        return True
    if title_lower in {
        "kształcenie zawodowe",
        "obowiązkowe zajęcia edukacyjne",
        "klasa",
        "l.p.",
    }:
        return True
    return False


def extract_weekly_hour_tokens(line):
    cleaned_line = strip_leading_list_number(line)
    tokens = []
    for match in re.finditer(r"(?<![A-Za-z0-9/])\d+(?![A-Za-z0-9/])", cleaned_line):
        tokens.append((match.start(), int(match.group())))
    return cleaned_line, tokens


def compute_hour_column_positions(lines, total_classes):
    samples = []
    for raw_line in lines:
        cleaned_line, tokens = extract_weekly_hour_tokens(raw_line)
        if len(tokens) < total_classes + 1:
            continue
        title = clean_subject_title(cleaned_line[: tokens[0][0]])
        if not title or should_skip_subject_title(title):
            continue
        samples.append([position for position, _ in tokens[: total_classes + 1]])

    if not samples:
        return None

    return [
        int(median([sample[index] for sample in samples if len(sample) > index]))
        for index in range(total_classes + 1)
    ]


def assign_tokens_to_columns(tokens, columns):
    positions = [position for position, _ in tokens]
    values = [value for _, value in tokens]

    @lru_cache(maxsize=None)
    def dp(token_index, column_index):
        if token_index == len(tokens):
            return 0, ()
        if column_index == len(columns):
            return 10**9, ()

        skip_cost, skip_path = dp(token_index, column_index + 1)
        take_cost, take_path = dp(token_index + 1, column_index + 1)
        take_cost += abs(positions[token_index] - columns[column_index])

        if take_cost <= skip_cost:
            return take_cost, ((column_index, values[token_index]),) + take_path
        return skip_cost, skip_path

    return dict(dp(0, 0)[1])


def trim_tokens_to_table(tokens, columns):
    right_tolerance = 4
    filtered_tokens = [token for token in tokens if token[0] <= columns[-1] + right_tolerance]
    if not filtered_tokens:
        filtered_tokens = tokens
    if len(filtered_tokens) <= len(columns):
        return filtered_tokens
    return filtered_tokens[: len(columns)]


def parse_teaching_plan_text(text, profile_key, class_num):
    """Parse pdftotext output of a teaching plan into structured data."""
    lines = text.split("\n")
    subjects = []
    current_section = "ogólne"

    section_markers = {
        "obowiązkowe zajęcia edukacyjne w zakresie podstawowym": "podstawowe",
        "zakres podstawowy": "podstawowe",
        "przedmioty w zakresie rozszerzonym": "rozszerzone",
        "przedmioty rozszerzone": "rozszerzone",
        "przedmioty uzupełniające": "rozszerzone",
        "kształcenie zawodowe teoretyczne": "zawodowe-teoretyczne",
        "kształcenie teoretyczne": "zawodowe-teoretyczne",
        "kształcenie zawodowe praktyczne": "zawodowe-praktyczne",
        "kształcenie praktyczne": "zawodowe-praktyczne",
    }

    total_classes = 5
    table_end_idx = len(lines)
    for i, line in enumerate(lines):
        line_lower = line.lower()
        if (
            "terminy realizacji" in line_lower
            or "praktyka zawodowa" in line_lower
            or line_lower.startswith("praktyki")
            or "egzaminy zawodowe" in line_lower
        ):
            table_end_idx = i
            break

    relevant_lines = lines[:table_end_idx]
    hour_columns = compute_hour_column_positions(relevant_lines, total_classes)
    if not hour_columns:
        emit(f"  Could not infer hour columns in {class_num}{profile_key}")
        return subjects

    pending_tokens = None

    for line in relevant_lines:
        cleaned_line = strip_leading_list_number(line)
        line_stripped = cleaned_line.strip()
        if not line_stripped:
            continue

        # Check for section markers
        line_lower = line_stripped.lower()
        found_section = False
        for marker, section_name in section_markers.items():
            if marker in line_lower:
                current_section = section_name
                found_section = True
                break
        if found_section:
            pending_tokens = None
            continue

        # Skip summary/total lines
        if (
            line_lower.startswith(("razem", "suma", "ogółem", "łącznie"))
            or "razem obowiązkowe zajęcia" in line_lower
            or "łączna liczba godzin" in line_lower
        ):
            pending_tokens = None
            continue
        if "godz. do dyspozycji dyrektora" in line_lower or "godziny do dyspozycji dyrektora szkoły" in line_lower:
            current_section = "ogólne"
            line_stripped = re.split(
                r"godz\. do dyspozycji dyrektora|godziny do dyspozycji dyrektora szkoły",
                line_stripped,
                flags=re.IGNORECASE,
            )[0].rstrip()
            line_lower = line_stripped.lower()
            if not line_stripped:
                pending_tokens = None
                continue
        if line_lower.startswith("religia") or line_lower.startswith("wychowanie do życia"):
            pending_tokens = None
            continue
        if line_lower.startswith("doradztwo zawodowe"):
            pending_tokens = None
            continue
        if "zajęcia z zakresu doradztwa" in line_lower:
            pending_tokens = None
            continue
        if "dodatkowe zajęcia" in line_lower:
            pending_tokens = None
            continue
        if line_lower in {
            "obowiązkowe zajęcia edukacyjne",
            "kształcenie zawodowe",
            "przedmioty realizowane na poziomie rozszerzonym",
        }:
            pending_tokens = None
            continue

        cleaned_source_line, tokens = extract_weekly_hour_tokens(line)
        if not tokens:
            continue
        tokens = trim_tokens_to_table(tokens, hour_columns)

        subject_name = clean_subject_title(cleaned_source_line[: tokens[0][0]])
        if not subject_name:
            pending_tokens = tokens
            continue
        if should_skip_subject_title(subject_name):
            pending_tokens = None
            continue
        if pending_tokens and len(tokens) <= 2:
            tokens = sorted(pending_tokens + tokens, key=lambda item: item[0])
            pending_tokens = None
        else:
            pending_tokens = None

        assigned_tokens = assign_tokens_to_columns(tokens, hour_columns)
        total_index = len(hour_columns) - 1
        if total_index not in assigned_tokens:
            continue

        hours = {}
        for index, value in assigned_tokens.items():
            if index < total_index:
                hours[str(index + 1)] = value
        total = assigned_tokens[total_index]
        if total > 200:
            continue

        subjects.append(
            {
                "name": subject_name,
                "section": current_section,
                "hours": hours,
                "total": total,
            }
        )

    return subjects


def scrape_teaching_plans():
    """Build a simple list of teaching plan PDFs without parsing their table contents."""
    plans = {}

    for profile_key, profile in TEACHING_PLAN_PROFILES.items():
        emit(f"Processing profile: {profile['name']} ({profile_key})")
        profile_data = {
            "name": profile["name"],
            "code": profile["code"],
            "classes": [],
        }

        for cls in profile["classes"]:
            filename = f"{cls}{profile_key}.pdf"
            url = TEACHING_PLAN_BASE_URL + filename
            emit(f"  Registering {filename}...")

            title = f"{filename} · {profile['name']}"

            try:
                response = requests.get(url, timeout=REQUEST_TIMEOUT, headers={"User-Agent": USER_AGENT}, stream=True)
                response.raise_for_status()
                response.close()

                profile_data["classes"].append(
                    {
                        "classNum": cls,
                        "url": url,
                        "title": title,
                    }
                )
            except Exception as e:
                emit(f"  Error checking {filename}: {e}")
                profile_data["classes"].append(
                    {
                        "classNum": cls,
                        "url": url,
                        "title": filename,
                        "parseError": True,
                    }
                )

        plans[profile_key] = profile_data

    return plans


def main():
    started = time.time()
    emit("Starting documents scrape...")

    emit(f"Fetching {SOURCE_URL}")
    html = get_page(SOURCE_URL)
    all_docs = scrape_document_links(html)
    emit(f"Found {len(all_docs)} document links")

    general_docs = classify_documents(all_docs)

    # Categorize documents
    for doc in general_docs:
        doc["category"] = categorize_document(doc["title"])

    # Scrape teaching plans
    teaching_plans = scrape_teaching_plans()

    # Build output
    output = {
        "scrapedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sourceUrl": SOURCE_URL,
        "categoryLabels": CATEGORY_LABELS,
        "documents": general_docs,
        "teachingPlans": teaching_plans,
    }

    # Atomic write
    tmp_path = OUTPUT_FILE + f".{os.getpid()}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    os.rename(tmp_path, OUTPUT_FILE)

    elapsed = round(time.time() - started, 1)
    teaching_plan_count = sum(len(profile["classes"]) for profile in teaching_plans.values())
    emit(f"Done in {elapsed}s. Wrote {OUTPUT_FILE}")
    emit(f"  Documents: {len(general_docs)}, Teaching plans: {teaching_plan_count} files")

    # Structured output for job system
    print(
        json.dumps(
            {
                "__structured_result__": True,
                "documents": len(general_docs),
                "teachingPlans": teaching_plan_count,
                "elapsed": elapsed,
            }
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
