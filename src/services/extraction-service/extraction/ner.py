"""
NER Module - spaCy Entity Extraction

Stage 2 of the extraction pipeline: extracts named entities using spaCy.
"""

import logging
import re
from typing import Optional

from extraction.models import ExtractedFields, Officer

logger = logging.getLogger(__name__)


class SpacyNER:
    """
    spaCy NER extractor for Florida Annual Report entities.

    Extracts: entity_name, registered_agent_name, principal_address, officers
    """

    CONFIDENCE_THRESHOLD = 0.75

    def __init__(self, model_name: str = "en_core_web_sm"):
        """
        Initialize spaCy NER model.

        Args:
            model_name: spaCy model to load (default: en_core_web_sm)
        """
        self.model_name = model_name
        self._nlp = None

    @property
    def nlp(self):
        """Lazy-load spaCy model."""
        if self._nlp is None:
            import spacy
            try:
                self._nlp = spacy.load(self.model_name)
                logger.info(f"Loaded spaCy model: {self.model_name}")
            except OSError:
                logger.warning(f"Model {self.model_name} not found, downloading...")
                import subprocess
                subprocess.run(["python", "-m", "spacy", "download", self.model_name])
                self._nlp = spacy.load(self.model_name)
        return self._nlp

    def extract(self, text: str) -> tuple[ExtractedFields, dict[str, float]]:
        """
        Extract entities from text using spaCy NER.

        Args:
            text: Document text to process

        Returns:
            Tuple of (ExtractedFields, confidence_scores_dict)
        """
        doc = self.nlp(text)

        # Initialize results
        fields = ExtractedFields()
        confidences = {
            "entity_name": 0.0,
            "registered_agent_name": 0.0,
            "principal_address": 0.0,
            "mailing_address": 0.0,
            "officers": 0.0,
        }

        # Extract using patterns and NER
        fields.entity_name, confidences["entity_name"] = self._extract_entity_name(text, doc)
        fields.registered_agent_name, confidences["registered_agent_name"] = self._extract_registered_agent(text, doc)
        fields.principal_address, confidences["principal_address"] = self._extract_address(text, "principal")
        fields.mailing_address, confidences["mailing_address"] = self._extract_address(text, "mailing")
        fields.officers, confidences["officers"] = self._extract_officers(text, doc)

        return fields, confidences

    def _extract_entity_name(self, text: str, doc) -> tuple[Optional[str], float]:
        """Extract company/entity name."""
        # Florida Articles format: "The name of the corporation is:\n  NAME"
        # Use \s+ (which matches newlines) so we also handle flattened OCR output
        # like "The name of the corporation is: NAME".
        suffix = (
            r"(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|"
            r"Corp\.?|Corporation|Ltd\.?|Company)"
        )
        label_value_patterns = [
            (
                r"(?i)The\s+name\s+of\s+(?:the\s+|this\s+)?"
                r"(?:corporation|company|limited\s+liability\s+company|entity)"
                r"\s+is\s*[:\-]\s*([A-Z][^\n]*?" + suffix + r")"
            ),
            (
                r"(?i)Name\s+of\s+(?:Corporation|Company|Entity|LLC)"
                r"\s*[:\-]\s*([A-Z][^\n]*?" + suffix + r")"
            ),
            (
                r"(?i)Entity\s+Name\s*[:\-]\s*([A-Z][^\n]*?" + suffix + r")"
            ),
            (
                r"(?i)ARTICLES\s+OF\s+(?:INCORPORATION|ORGANIZATION)"
                r"\s+(?:OF|FOR)\s+([A-Z][^\n]*?" + suffix + r")"
            ),
        ]
        for pattern in label_value_patterns:
            match = re.search(pattern, text)
            if match:
                name = match.group(1).strip().strip(".,;:")
                if name and self._looks_like_entity(name):
                    return name, 0.92

        # Heuristic: an UPPERCASE line ending with a corporate suffix.
        upper_suffix = (
            r"(?:LLC|L\.L\.C\.|INC\.?|INCORPORATED|"
            r"CORP\.?|CORPORATION|LTD\.?|COMPANY)"
        )
        upper_line = re.search(
            r"(?m)^\s*([A-Z][A-Z0-9&'.\s,-]+" + upper_suffix + r")\s*$",
            text,
        )
        if upper_line:
            name = upper_line.group(1).strip().strip(".,;:")
            if self._looks_like_entity(name):
                return name, 0.80

        # NER fallback for ORG entities
        org_entities = [ent for ent in doc.ents if ent.label_ == "ORG"]
        if org_entities:
            for ent in org_entities:
                up = ent.text.upper()
                if any(s in up for s in ["LLC", "INC", "CORP", "LTD", "INCORPORATED"]):
                    return ent.text.strip(), 0.70
            return org_entities[0].text.strip(), 0.55

        return None, 0.0

    @staticmethod
    def _looks_like_entity(name: str) -> bool:
        """Reject obvious junk like 'the corp' or single-word fragments."""
        if len(name) < 4 or len(name) > 200:
            return False
        words = name.split()
        if len(words) < 2:
            return False
        stopwords = {"the", "a", "an", "of", "for", "and"}
        meaningful = [w for w in words if w.lower() not in stopwords]
        return len(meaningful) >= 2

    def _extract_registered_agent(self, text: str, doc) -> tuple[Optional[str], float]:
        """Extract registered agent name."""
        # Highest confidence: the "Registered Agent Signature: NAME" line is
        # always present in Florida Articles and never contains the address.
        sig_match = re.search(
            r"(?i)Registered\s+Agent\s+Signature\s*[:\-]\s*([A-Z][A-Z .,'\-]{3,80}?)"
            r"(?=\s*(?:\n|Article|I\s+certify|I\s+am|$))",
            text,
        )
        if sig_match:
            name = self._clean_person_name(sig_match.group(1))
            if name:
                return name, 0.95

        # Florida Articles inline format (OCR flattens to a single line):
        #   "...address of the registered agent is: NAME <ADDRESS>"
        # Also handles sample format: "Registered Agent: John Michael Smith\n..."
        name_re = r"([A-Z][A-Za-z .'\-]{3,80}?)"
        # Stop the name at a digit, "P.O.", end-of-line, or a known title word.
        stop = (
            r"(?=\s+(?:\d|P\.?\s*O\.?\s*BOX|PO\s+BOX|"
            r"SEC(?:RETARY)?|PRES(?:IDENT)?|VP|VICE|TREAS(?:URER)?|"
            r"DIR(?:ECTOR)?|MGR|MANAGER|CEO|CFO|COO|"
            r"DR\.|MR\.|MS\.|MRS\.|JR\.|SR\.|PHD|RABBAH|MADAME|ESQ|"
            r"Agent\s+Address|Address)|\s*$)"
        )
        # Pattern A: bare "Registered Agent:" label at start of a line.
        # Anchored so we don't match inside the long-form sentence.
        pattern_a = (
            r"(?im)^\s*Registered\s+Agent\s*[:\-]\s+" + name_re
            + r"(?:\s*\n|\s+Address|\s*$)"
        )
        # Pattern B: long form sentence — must end in "is:" + name + address-start.
        pattern_b = (
            r"(?i)The\s+name(?:\s+and\s+(?:Florida\s+)?street\s+address)?"
            r"\s+of\s+the\s+registered\s+agent\s+is\s*[:\-]\s+"
            + name_re + stop
        )
        # Pattern C: "Agent Name: NAME" (used in some sample docs).
        pattern_c = r"(?im)^\s*Agent\s+Name\s*[:\-]\s+" + name_re + r"\s*$"

        for pattern in (pattern_a, pattern_b, pattern_c):
            match = re.search(pattern, text)
            if match:
                name = self._clean_person_name(match.group(1))
                if name:
                    return name, 0.88

        # NER fallback: PERSON entity near "agent" keyword
        agent_idx = text.lower().find("registered agent")
        if agent_idx >= 0:
            for ent in doc.ents:
                if ent.label_ == "PERSON" and abs(ent.start_char - agent_idx) < 300:
                    name = self._clean_person_name(ent.text)
                    if name:
                        return name, 0.65

        return None, 0.0

    @staticmethod
    def _clean_person_name(raw: str) -> Optional[str]:
        """Trim trailing role/honorific words and punctuation from a person name."""
        name = raw.strip().strip(".,;:")
        # Drop trailing role abbreviations / titles / honorifics that get glommed on.
        trailing_junk = (
            r"\s+(?:SEC(?:RETARY)?|PRES(?:IDENT)?|VP|VICE|TREAS(?:URER)?|"
            r"DIR(?:ECTOR)?|MGR|MANAGER|CEO|CFO|COO|"
            r"DR|MR|MS|MRS|JR|SR|PHD|RABBAH|MADAME|ESQ)\.?\b.*$"
        )
        name = re.sub(trailing_junk, "", name, flags=re.IGNORECASE).strip()
        if len(name.split()) < 2:
            return None
        if len(name) < 4 or len(name) > 80:
            return None
        return name

    def _extract_address(self, text: str, address_type: str) -> tuple[Optional[str], float]:
        """Extract address by type (principal or mailing)."""
        if address_type == "principal":
            label_patterns = [
                r"(?:The\s+)?Principal\s+(?:Place\s+of\s+Business|Business\s+Address|Address)"
                r"(?:\s+address)?(?:\s+is)?",
                r"Principal\s+(?:Business\s+)?Address(?:\s+is)?",
            ]
        else:
            label_patterns = [
                r"(?:The\s+)?Mailing\s+Address(?:\s+of\s+the\s+(?:corporation|company|entity|LLC))?"
                r"(?:\s+is)?",
                r"Mail(?:ing)?\s+Address(?:\s+is)?",
            ]

        # Address-content: starts with digits OR "P.O. BOX" / "PO BOX",
        # ends at a state+ZIP. Tolerates "FL." / "Florida," / commas anywhere.
        addr_start = r"(?:\d+|P\.?\s*O\.?\s*BOX|PO\s+BOX)"
        addr_body = r"[A-Za-z0-9\s.,#'\-]{5,200}?"
        addr_end = r"(?:FL|Florida)\.?\s*[,\s]+\d{5}(?:-\d{4})?"
        addr_re = rf"({addr_start}{addr_body}{addr_end})"

        # Same-line OR multi-line: label, optional whitespace incl. newlines,
        # then the address body. Stop matching at the address end.
        for label in label_patterns:
            pattern = rf"(?i){label}\s*[:\-]\s*{addr_re}"
            match = re.search(pattern, text)
            if match:
                addr = re.sub(r"\s+", " ", match.group(1)).strip().strip(",")
                return addr, 0.90

        return None, 0.0

    def _extract_officers(self, text: str, doc) -> tuple[list[Officer], float]:
        """Extract officers/directors.

        Florida Articles Article VII format (OCR-flattened):
            Title: <TITLE> <NAME> <ADDRESS> Title: <TITLE> <NAME> <ADDRESS> ...

        Common Florida title abbreviations: P (President), VP (Vice President),
        T (Treasurer), SEC (Secretary), DIR (Director), AP (Asst President), etc.
        """
        officers = []

        # Find the Article VII / officers section.
        section_match = re.search(
            r"(?i)Article\s+VII[^A-Z]*(?:initial\s+)?officer.{0,80}?(?:is/are|are|is)\s*[:\-]?\s*(.+?)"
            r"(?=Article\s+VIII|\Z)",
            text,
            re.DOTALL,
        )
        section = section_match.group(1) if section_match else text

        # Split on "Title:" — each entry has form "<TITLE> <NAME...> <ADDRESS>".
        # Title token: single letter, common 2-4 letter abbrev, or full word.
        title_token = (
            r"(?:VP|SEC|PRES|TREAS|DIR|AP|AS|AT|AV|P|V|T|S|D|"
            r"VICE\s+PRESIDENT|PRESIDENT|SECRETARY|TREASURER|DIRECTOR|MANAGER|CEO|CFO|COO)"
        )
        # Name: 2-5 tokens (mixed case allowed) until address starts.
        name_capture = r"([A-Z][A-Za-z .'\-]{2,80}?)"
        addr_start = r"(?:\d+|P\.?\s*O\.?\s*BOX|PO\s+BOX)"
        addr_body = r"[A-Za-z0-9\s.,#'\-]{5,200}?"
        addr_end = r"(?:FL|Florida)\.?\s*[,\s]+\d{5}(?:-\d{4})?"
        addr_capture = rf"({addr_start}{addr_body}{addr_end})"

        entry_pattern = (
            r"(?i)Title\s*[:\-]?\s*"
            r"(" + title_token + r")\.?\s+"
            + name_capture +
            r"\s+" + addr_capture
        )

        for m in re.finditer(entry_pattern, section):
            title_raw = m.group(1).upper().strip(".")
            name = self._clean_person_name(m.group(2))
            address = re.sub(r"\s+", " ", m.group(3)).strip().strip(",")
            if not name:
                continue
            officers.append(Officer(
                name=name,
                title=self._normalize_title(title_raw),
                address=address,
            ))

        if officers:
            return officers, 0.85

        # Fallback: legacy title-keyword scan (original implementation).
        titles = ["President", "Vice President", "Secretary", "Treasurer",
                  "Director", "CEO", "CFO", "COO"]
        seen = set()
        for title in titles:
            patterns = [
                rf"{title}[:\s]+([A-Z][A-Za-z\s,.'()-]+?)(?:\n|Address|$)",
                rf"([A-Z][A-Za-z\s.']+)[,\s]+{title}",
            ]
            for pattern in patterns:
                matches = re.finditer(pattern, text, re.IGNORECASE | re.MULTILINE)
                for match in matches:
                    name = match.group(1).strip()
                    name = re.sub(r"[,.:]+$", "", name).strip()
                    if len(name) > 2 and len(name) < 100:
                        officers.append(Officer(name=name, title=title))

        # Deduplicate officers
        seen = set()
        unique_officers = []
        for officer in officers:
            key = (officer.name.lower(), officer.title.lower())
            if key not in seen:
                seen.add(key)
                unique_officers.append(officer)

        # Calculate confidence based on number found
        if len(unique_officers) >= 2:
            confidence = 0.80
        elif len(unique_officers) == 1:
            confidence = 0.65
        else:
            confidence = 0.0

        return unique_officers, confidence

    @staticmethod
    def _normalize_title(abbrev: str) -> str:
        """Expand Florida title abbreviations to full names."""
        mapping = {
            "P": "President",
            "VP": "Vice President",
            "V": "Vice President",
            "VICE PRESIDENT": "Vice President",
            "PRES": "President",
            "PRESIDENT": "President",
            "T": "Treasurer",
            "TREAS": "Treasurer",
            "TREASURER": "Treasurer",
            "S": "Secretary",
            "SEC": "Secretary",
            "SECRETARY": "Secretary",
            "D": "Director",
            "DIR": "Director",
            "DIRECTOR": "Director",
            "AP": "Assistant President",
            "AS": "Assistant Secretary",
            "AT": "Assistant Treasurer",
            "AV": "Assistant Vice President",
            "MANAGER": "Manager",
            "CEO": "CEO",
            "CFO": "CFO",
            "COO": "COO",
        }
        return mapping.get(abbrev.upper(), abbrev.title())


class NERError(Exception):
    """Custom exception for NER failures."""
    pass
