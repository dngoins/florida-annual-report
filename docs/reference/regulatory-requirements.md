# Regulatory Requirements (Authoritative)

Florida Statute governs Annual Report filings. This document captures the authoritative constraints the system must enforce.

## Filing Window

- **Opens:** January 1
- **Deadline:** May 1 (strict — late filings incur penalties)

## Filing Purpose

The Annual Report updates the state's record of:
- Officers / Directors
- Registered Agent
- Principal Address
- Mailing Address

## Required Input Fields

| Field | Notes |
|-------|-------|
| Document Number | Sunbiz-assigned entity ID |
| Entity Name | Non-editable in most cases |
| Principal Address | Must be a Florida street address |
| Mailing Address | May differ from principal |
| Registered Agent Name | Must be a Florida resident or registered entity |
| Registered Agent Address | Must be a Florida street address |
| Officer / Director List | Name, title, address per officer |
| Authorized Signature | Typed name of authorized signatory |

## Filing Outcomes

| Outcome | Trigger |
|---------|---------|
| Accepted | All fields valid, payment received |
| Rejected | Validation errors (e.g., invalid address, missing fields) |
| Late | Filed after May 1 → penalty fee or administrative dissolution |

## Fees (approximate — configurable per entity type)

| Entity Type | Fee |
|-------------|-----|
| Corporation | ~$150.00 |
| LLC | ~$138.75 |

## Legal Risks

- **Incorrect filing** → legal liability for the signatory
- **Missed filing** → administrative dissolution of the entity

## Engineering Implications

The system **must**:
- Validate completeness of all required fields before enabling submission
- Prevent submission of invalid or incomplete data
- Log all user decisions with timestamps
- Store immutable confirmation records post-submission
