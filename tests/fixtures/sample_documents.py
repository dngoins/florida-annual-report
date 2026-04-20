"""
Sample Document Fixtures for Extraction Tests

These fixtures provide test data for:
- spaCy NER accuracy testing
- LLM fallback trigger conditions
- Confidence score calculation
"""

# =============================================================================
# High-Quality Documents (should extract cleanly)
# =============================================================================

ARTICLES_OF_INCORPORATION = """
ARTICLES OF INCORPORATION OF SUNSHINE TECH LLC

ARTICLE I - NAME
The name of this Limited Liability Company is: SUNSHINE TECH LLC

ARTICLE II - REGISTERED AGENT
The registered agent of this company is: John Michael Smith
Registered Agent Address: 1234 Palm Beach Boulevard, Suite 500, Miami, FL 33139

ARTICLE III - PRINCIPAL ADDRESS
Principal Business Address: 5678 Corporate Drive, Orlando, FL 32801

ARTICLE IV - MAILING ADDRESS
Mailing Address: P.O. Box 9876, Orlando, FL 32802

ARTICLE V - OFFICERS
The officers of this company are:
President: John Michael Smith
Vice President: Sarah Jane Williams
Secretary: Robert Thomas Johnson
Treasurer: Emily Rose Martinez

ARTICLE VI - DIRECTORS
Director: Michael Andrew Chen
Director: Lisa Marie Thompson
"""

ANNUAL_REPORT_DOCUMENT = """
STATE OF FLORIDA
DEPARTMENT OF STATE
ANNUAL REPORT

Document Number: L18000012345
FEI/EIN Number: 12-3456789
Date Filed: 04/15/2024

Entity Name: COASTAL VENTURES CORP

Principal Address:
789 Ocean View Drive
Suite 200
Jacksonville, FL 32202

Mailing Address:
789 Ocean View Drive
Suite 200
Jacksonville, FL 32202

Registered Agent Name: Corporate Agents Inc.
Registered Agent Address: 100 Main Street, Tallahassee, FL 32301

OFFICER/DIRECTOR INFORMATION:
Title: CEO
Name: David Alexander Brown
Address: 123 Executive Lane, Jacksonville, FL 32202

Title: CFO  
Name: Jennifer Lynn Davis
Address: 456 Finance Ave, Jacksonville, FL 32203

Title: Secretary
Name: William James Wilson
Address: 789 Legal Way, Jacksonville, FL 32204
"""

# =============================================================================
# Low-Quality Documents (should trigger LLM fallback)
# =============================================================================

LOW_QUALITY_OCR_TEXT = """
STATE 0F FL0RIDA
DEPAR7MENT OF $TATE
ANNUA1 REP0RT

Docum3nt Numb3r: L18O0OO12345

Entity Narne: PALM TREE ENTERPR|SES LLC

Principa1 Addr3ss:
1234 B3ach Rd
Miamj FL 331 40

R3gister3d Agent: J0hn D0e
R3g Agent Addr: 5678 Palm Ave, 0rlando FL 328OI

0fficers:
Pres|dent - J0hn D0e
VP - Jan3 Sm|th
"""

PARTIAL_DOCUMENT = """
ANNUAL REPORT - PARTIAL SCAN

Entity Name: INCOMPLETE DATA INC

Principal Address: 
[UNREADABLE - POOR SCAN QUALITY]

Registered Agent: [PARTIAL] Smith
Agent Address: ... Florida, FL ...

Officers:
President: [NAME UNCLEAR]
"""

# =============================================================================
# Edge Cases
# =============================================================================

MULTIPLE_ADDRESSES_DOCUMENT = """
FLORIDA BUSINESS REGISTRATION

Company Name: MULTI LOCATION SERVICES LLC

Corporate Headquarters (Principal Address):
100 Corporate Blvd, Tampa, FL 33601

Branch Office 1:
200 Beach Road, Miami, FL 33139

Branch Office 2:
300 Oak Street, Orlando, FL 32801

Mailing Address:
P.O. Box 555, Tampa, FL 33602

Registered Agent: Legal Services Corp
Agent Address: 999 Law Center Drive, Tallahassee, FL 32301

President: Thomas Green
CEO: Thomas Green
Vice President: Nancy White
Secretary: James Black
Treasurer: Mary Gold
"""

MINIMAL_DOCUMENT = """
Business: SIMPLE LLC
Address: 1 Main St, FL 33000
Agent: Bob Jones
President: Bob Jones
"""

# =============================================================================
# Document Metadata (for testing confidence calculation)
# =============================================================================

DOCUMENT_FIXTURES = {
    "high_quality_articles": {
        "text": ARTICLES_OF_INCORPORATION,
        "expected_confidence": {
            "entity_name": 0.85,
            "registered_agent_name": 0.85,
            "principal_address": 0.80,
            "mailing_address": 0.80,
            "officers": 0.80,
        },
        "expected_fields": {
            "entity_name": "SUNSHINE TECH LLC",
            "registered_agent_name": "John Michael Smith",
            "officer_count": 6,  # 4 officers + 2 directors
        },
    },
    "annual_report": {
        "text": ANNUAL_REPORT_DOCUMENT,
        "expected_confidence": {
            "entity_name": 0.85,
            "registered_agent_name": 0.85,
            "principal_address": 0.80,
            "mailing_address": 0.80,
            "officers": 0.80,
        },
        "expected_fields": {
            "entity_name": "COASTAL VENTURES CORP",
            "registered_agent_name": "Corporate Agents Inc.",
            "officer_count": 3,
        },
    },
    "low_quality_ocr": {
        "text": LOW_QUALITY_OCR_TEXT,
        "expected_llm_fallback": True,
        "expected_confidence_below_threshold": ["entity_name", "principal_address"],
    },
    "partial_document": {
        "text": PARTIAL_DOCUMENT,
        "expected_llm_fallback": True,
        "expected_needs_review": True,
    },
    "multiple_addresses": {
        "text": MULTIPLE_ADDRESSES_DOCUMENT,
        "expected_fields": {
            "entity_name": "MULTI LOCATION SERVICES LLC",
            "officer_count": 5,
        },
    },
    "minimal": {
        "text": MINIMAL_DOCUMENT,
        "expected_low_confidence": True,
    },
}
