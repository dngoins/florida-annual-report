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
        # The value is on the next non-empty line(s) after the label.
        next_line_patterns = [
            r"(?im)^\s*The\s+name\s+of\s+(?:the\s+|this\s+)?(?:corporation|company|limited\s+liability\s+company|entity)\s+is\s*[:\-]\s*\n+\s*([^\n]+?)\s*$",
            r"(?im)^\s*Name\s+of\s+(?:Corporation|Company|Entity|LLC)\s*[:\-]\s*\n+\s*([^\n]+?)\s*$",
            r"(?im)^\s*Entity\s+Name\s*[:\-]\s*\n+\s*([^\n]+?)\s*$",
        ]
        for pattern in next_line_patterns:
            match = re.search(pattern, text)
            if match:
                name = match.group(1).strip().strip(".,;:")
                if name and self._looks_like_entity(name):
                    return name, 0.92

        # Same-line patterns (sample text format: "name of this LLC is: X LLC")
        inline_patterns = [
            r"(?:Company|Corporation|Entity|Business)\s*Name\s*[:\-]\s*([A-Z][A-Za-z0-9\s&,.'()-]+?(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?))",
            r"(?:The\s+name\s+of\s+(?:this|the))\s+(?:limited\s+liability\s+company|corporation|company|entity)\s+is\s*[:\-]\s*([A-Z][A-Za-z0-9\s&,.'()-]+?(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?))",
            r"ARTICLES\s+OF\s+(?:INCORPORATION|ORGANIZATION)\s+(?:OF|FOR)\s+([A-Z][A-Z0-9\s&,.'()-]+?(?:LLC|L\.L\.C\.|INC\.?|INCORPORATED|CORP\.?|CORPORATION|LTD\.?))",
        ]
        for pattern in inline_patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                name = match.group(1).strip().strip(".,;:")
                if name and self._looks_like_entity(name):
                    return name, 0.88

        # Heuristic: an UPPERCASE line ending with a corporate suffix is almost certainly the name.
        upper_line = re.search(
            r"(?m)^\s*([A-Z][A-Z0-9&'.\s,-]+(?:LLC|L\.L\.C\.|INC\.?|INCORPORATED|CORP\.?|CORPORATION|LTD\.?|COMPANY))\s*$",
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
                if any(s in ent.text.upper() for s in ["LLC", "INC", "CORP", "LTD", "INCORPORATED"]):
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
        # Must contain at least one all-caps or capitalized word that isn't a stopword.
        stopwords = {"the", "a", "an", "of", "for", "and"}
        meaningful = [w for w in words if w.lower() not in stopwords]
        return len(meaningful) >= 2

    def _extract_registered_agent(self, text: str, doc) -> tuple[Optional[str], float]:
        """Extract registered agent name."""
        # Florida Articles format: agent name on a separate line after the label.
        next_line_patterns = [
            r"(?im)^\s*(?:Name\s+(?:and\s+Address\s+)?of\s+)?Registered\s+Agent\s*[:\-]?\s*\n+\s*([A-Z][A-Z .,'\-]+?)\s*$",
            r"(?im)^\s*The\s+name(?:\s+and\s+(?:Florida\s+)?street\s+address)?\s+of\s+the\s+registered\s+agent\s+(?:is)?\s*[:\-]?\s*\n+\s*([A-Z][A-Z .,'\-]+?)\s*$",
        ]
        for pattern in next_line_patterns:
            match = re.search(pattern, text)
            if match:
                name = self._clean_person_name(match.group(1))
                if name:
                    return name, 0.90

        # Same-line patterns
        inline_patterns = [
            r"Registered\s+Agent\s*[:\-]\s*([A-Z][A-Za-z .,'\-]+?)(?:\n|Address|Agent\s+Address|$)",
            r"Agent\s+Name\s*[:\-]\s*([A-Z][A-Za-z .,'\-]+?)(?:\n|$)",
            r"The\s+registered\s+agent\s+(?:is|shall\s+be)\s*[:\-]?\s*([A-Z][A-Za-z .,'\-]+?)(?:\n|,|$)",
        ]
        for pattern in inline_patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                name = self._clean_person_name(match.group(1))
                if name:
                    return name, 0.85

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
        """Trim trailing role words ('SEC', 'PRES', etc.) and punctuation from a person name."""
        name = raw.strip().strip(".,;:")
        # Drop trailing role abbreviations / titles that get glommed onto the name.
        name = re.sub(
            r"\s+(?:SEC|PRES|VP|CEO|CFO|COO|DIR|MGR|MGRM?|MANAGER|SECRETARY|PRESIDENT|TREASURER|DIRECTOR)\b.*$",
            "",
            name,
            flags=re.IGNORECASE,
        ).strip()
        # Reject single tokens.
        if len(name.split()) < 2:
            return None
        if len(name) < 4 or len(name) > 80:
            return None
        return name

    def _extract_address(self, text: str, address_type: str) -> tuple[Optional[str], float]:
        """Extract address by type (principal or mailing)."""
        if address_type == "principal":
            label_patterns = [
                r"(?:The\s+)?Principal\s+(?:Place\s+of\s+Business|Business\s+Address|Address)(?:\s+address)?(?:\s+is)?",
                r"Principal\s+(?:Business\s+)?Address(?:\s+is)?",
            ]
        else:
            label_patterns = [
                r"(?:The\s+)?Mailing\s+Address(?:\s+of\s+the\s+(?:corporation|company|entity|LLC))?(?:\s+is)?",
                r"Mail(?:ing)?\s+Address(?:\s+is)?",
            ]

        # Block-capture: label line, then 1-4 indented/non-empty lines, then blank line OR new label.
        for label in label_patterns:
            pattern = (
                rf"(?im)^\s*{label}\s*[:\-]\s*\n"
                r"((?:[ \t]*[^\n]+\n){1,4}?)"
                r"(?=\s*$|\s*(?:Article|The\s+(?:mailing|principal|name)|Registered|Name\s+and\s+Address))"
            )
            match = re.search(pattern, text)
            if match:
                addr = self._normalize_address_block(match.group(1))
                if addr:
                    return addr, 0.88

        # Same-line fallback: "Principal Address: 123 Main St, City, FL 33xxx"
        flat_pattern = (
            r"([0-9]+[A-Za-z0-9\s.,#'\-]+?,\s*[A-Za-z .]+,?\s*(?:FL|Florida)\.?\s*[,\s]+[0-9]{5}(?:-[0-9]{4})?)"
        )
        for label in label_patterns:
            full = rf"(?i){label}\s*[:\-]\s*{flat_pattern}"
            match = re.search(full, text)
            if match:
                return match.group(1).strip(), 0.80

        return None, 0.0

    @staticmethod
    def _normalize_address_block(block: str) -> Optional[str]:
        """Collapse a multi-line address block into a single comma-separated string."""
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if not lines:
            return None
        joined = ", ".join(lines)
        # Must look like an address: contain a ZIP or a state abbreviation.
        if not re.search(r"\b[A-Z]{2}\.?\s*\d{5}\b|\bFL\.?\s*\d{5}\b|\d{5}(?:-\d{4})?", joined):
            return None
        return joined

    def _extract_officers(self, text: str, doc) -> tuple[list[Officer], float]:
        """Extract officers/directors."""
        officers = []

        # Common officer titles
        titles = ["President", "Vice President", "Secretary", "Treasurer", "Director", "CEO", "CFO", "COO"]

        # Pattern: Title: Name or Name, Title
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


class NERError(Exception):
    """Custom exception for NER failures."""
    pass
