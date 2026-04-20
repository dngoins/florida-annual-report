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
        # Pattern-based extraction
        patterns = [
            r"(?:Company|Corporation|Entity|Business)\s*Name[:\s]+([A-Z][A-Za-z0-9\s&,.'()-]+(?:LLC|Inc\.?|Corp\.?|Ltd\.?)?)",
            r"(?:Name of|Named)\s+([A-Z][A-Za-z0-9\s&,.'()-]+(?:LLC|Inc\.?|Corp\.?|Ltd\.?))",
            r"ARTICLES OF (?:INCORPORATION|ORGANIZATION) (?:OF|FOR)\s+([A-Z][A-Za-z0-9\s&,.'()-]+)",
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                name = match.group(1).strip()
                return name, 0.85
        
        # Fallback to NER ORG entities
        org_entities = [ent for ent in doc.ents if ent.label_ == "ORG"]
        if org_entities:
            # Take the first ORG that looks like a company name
            for ent in org_entities:
                if any(suffix in ent.text.upper() for suffix in ["LLC", "INC", "CORP", "LTD"]):
                    return ent.text, 0.70
            return org_entities[0].text, 0.60
        
        return None, 0.0
    
    def _extract_registered_agent(self, text: str, doc) -> tuple[Optional[str], float]:
        """Extract registered agent name."""
        patterns = [
            r"Registered Agent[:\s]+([A-Z][A-Za-z\s,.'()-]+?)(?:\n|Address|$)",
            r"Agent Name[:\s]+([A-Z][A-Za-z\s,.'()-]+?)(?:\n|$)",
            r"The registered agent (?:is|shall be)[:\s]+([A-Z][A-Za-z\s,.'()-]+?)(?:\n|,|$)",
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                name = match.group(1).strip()
                # Clean up trailing punctuation
                name = re.sub(r"[,.:]+$", "", name).strip()
                return name, 0.85
        
        # NER fallback for PERSON entities near "agent" keyword
        agent_idx = text.lower().find("agent")
        if agent_idx >= 0:
            # Look for PERSON entities near the word "agent"
            for ent in doc.ents:
                if ent.label_ == "PERSON":
                    if abs(ent.start_char - agent_idx) < 200:
                        return ent.text, 0.65
        
        return None, 0.0
    
    def _extract_address(self, text: str, address_type: str) -> tuple[Optional[str], float]:
        """Extract address by type (principal or mailing)."""
        # Build pattern based on address type
        if address_type == "principal":
            prefix_patterns = [
                r"Principal (?:Business )?Address[:\s]+",
                r"Principal Place of Business[:\s]+",
                r"Business Address[:\s]+",
            ]
        else:
            prefix_patterns = [
                r"Mailing Address[:\s]+",
                r"Mail(?:ing)? Address[:\s]+",
            ]
        
        # Address pattern (street, city, state ZIP)
        address_pattern = r"([0-9]+[A-Za-z0-9\s,.'#-]+(?:FL|Florida)[,\s]+[0-9]{5}(?:-[0-9]{4})?)"
        
        for prefix in prefix_patterns:
            full_pattern = prefix + address_pattern
            match = re.search(full_pattern, text, re.IGNORECASE | re.MULTILINE)
            if match:
                address = match.group(1).strip()
                return address, 0.80
        
        # Generic address extraction as fallback
        generic_match = re.search(address_pattern, text)
        if generic_match:
            return generic_match.group(1).strip(), 0.50
        
        return None, 0.0
    
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
