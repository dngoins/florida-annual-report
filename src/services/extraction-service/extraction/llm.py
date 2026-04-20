"""
LLM Module - Claude Fallback Extraction

Stage 3 of the extraction pipeline: uses Claude for low-confidence field extraction.
"""

import json
import logging
import os
from typing import Optional

import anthropic

from extraction.models import ExtractedFields, Officer

logger = logging.getLogger(__name__)


# Extraction prompt template
EXTRACTION_PROMPT = """Extract the following fields from this Florida business document (Articles of Incorporation, Annual Report, or similar).

Return a JSON object with these fields:
- entity_name: The legal company/entity name
- registered_agent_name: Name of the registered agent
- principal_address: Principal business address
- mailing_address: Mailing address (if different from principal)
- officers: Array of objects with {name, title, address} for each officer/director

If a field cannot be found, use null.

Document text:
---
{document_text}
---

Return ONLY valid JSON, no explanation."""


class ClaudeLLM:
    """
    Claude LLM client for fallback entity extraction.
    
    Used when spaCy NER confidence is below threshold.
    """
    
    CONFIDENCE_BOOST = 0.90  # LLM extractions get high confidence
    MODEL = "claude-3-haiku-20240307"  # Fast, cost-effective model
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Anthropic Claude client.
        
        Args:
            api_key: Anthropic API key (defaults to ANTHROPIC_API_KEY env var)
        """
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            logger.warning("ANTHROPIC_API_KEY not set - LLM fallback will fail")
        
        self.client = anthropic.Anthropic(api_key=self.api_key) if self.api_key else None
    
    def extract(
        self,
        text: str,
        fields_to_extract: Optional[list[str]] = None,
    ) -> tuple[ExtractedFields, dict[str, float]]:
        """
        Extract entities from text using Claude.
        
        Args:
            text: Document text to process
            fields_to_extract: Optional list of specific fields to extract
            
        Returns:
            Tuple of (ExtractedFields, confidence_scores_dict)
        """
        if not self.client:
            raise LLMError("Anthropic client not initialized - check ANTHROPIC_API_KEY")
        
        try:
            message = self.client.messages.create(
                model=self.MODEL,
                max_tokens=1024,
                messages=[
                    {
                        "role": "user",
                        "content": EXTRACTION_PROMPT.format(document_text=text[:8000]),
                    }
                ],
            )
            
            # Parse response
            response_text = message.content[0].text
            data = self._parse_json_response(response_text)
            
            # Convert to ExtractedFields
            fields = self._to_extracted_fields(data)
            
            # Build confidence scores
            confidences = {}
            all_field_names = ["entity_name", "registered_agent_name", "principal_address", "mailing_address", "officers"]
            
            for field_name in all_field_names:
                if fields_to_extract and field_name not in fields_to_extract:
                    confidences[field_name] = 0.0
                elif getattr(fields, field_name, None):
                    confidences[field_name] = self.CONFIDENCE_BOOST
                else:
                    confidences[field_name] = 0.0
            
            logger.info(f"LLM extracted fields: {list(data.keys())}")
            return fields, confidences
            
        except anthropic.APIError as e:
            logger.error(f"Anthropic API error: {e}")
            raise LLMError(f"Claude API failed: {e}") from e
        except Exception as e:
            logger.error(f"LLM extraction failed: {e}")
            raise LLMError(f"LLM extraction failed: {e}") from e
    
    def extract_field(self, text: str, field_name: str) -> tuple[Optional[str], float]:
        """
        Extract a single field using Claude.
        
        Args:
            text: Document text
            field_name: Name of field to extract
            
        Returns:
            Tuple of (field_value, confidence)
        """
        if not self.client:
            raise LLMError("Anthropic client not initialized")
        
        prompt = f"""Extract the {field_name.replace('_', ' ')} from this Florida business document.
Return ONLY the extracted value, no explanation. If not found, return "NOT_FOUND".

Document:
---
{text[:4000]}
---"""
        
        try:
            message = self.client.messages.create(
                model=self.MODEL,
                max_tokens=256,
                messages=[{"role": "user", "content": prompt}],
            )
            
            result = message.content[0].text.strip()
            
            if result == "NOT_FOUND" or not result:
                return None, 0.0
            
            return result, self.CONFIDENCE_BOOST
            
        except Exception as e:
            logger.error(f"Single field extraction failed: {e}")
            return None, 0.0
    
    def _parse_json_response(self, response: str) -> dict:
        """Parse JSON from LLM response, handling common issues."""
        # Try direct parse
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass
        
        # Try to extract JSON from markdown code block
        import re
        json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass
        
        # Try to find raw JSON object
        json_match = re.search(r"\{.*\}", response, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass
        
        logger.warning(f"Could not parse JSON from LLM response: {response[:200]}")
        return {}
    
    def _to_extracted_fields(self, data: dict) -> ExtractedFields:
        """Convert raw dict to ExtractedFields model."""
        officers = []
        raw_officers = data.get("officers", [])
        
        if isinstance(raw_officers, list):
            for o in raw_officers:
                if isinstance(o, dict) and o.get("name"):
                    officers.append(Officer(
                        name=o.get("name", ""),
                        title=o.get("title", "Unknown"),
                        address=o.get("address"),
                    ))
        
        return ExtractedFields(
            entity_name=data.get("entity_name"),
            registered_agent_name=data.get("registered_agent_name"),
            principal_address=data.get("principal_address"),
            mailing_address=data.get("mailing_address"),
            officers=officers,
        )


class LLMError(Exception):
    """Custom exception for LLM failures."""
    pass
