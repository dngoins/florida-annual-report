# Risk & Compliance

## Legal Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| Unauthorized automation | Browser automation may violate Sunbiz ToS | Require explicit user approval; display disclaimer before submission |
| Incorrect filing | Wrong data submitted on behalf of an entity | Human review gate; confidence scoring; editable form before submission |
| Missed deadline | Filing not completed before May 1 | Deadline reminders; status dashboard; email alerts |

---

## Security

### Data Protection

- **Encryption at rest:** AES-256
- **Encryption in transit:** TLS 1.2+
- **Document storage:** Private BLOB containers with SAS tokens

### Access Control

- **RBAC:** Role-based access (admin, compliance officer, viewer)
- **MFA:** Required for all user accounts
- **OAuth2:** Authentication via identity provider

---

## Audit Logging

The system logs the following events immutably:

| Event | Fields Logged |
|-------|--------------|
| Document upload | user_id, document_id, timestamp, file_hash |
| Field edit | user_id, field_name, old_value, new_value, timestamp |
| Submission attempt | user_id, company_id, filing_id, timestamp |
| Final confirmation | confirmation_number, receipt_url, timestamp |

All audit records are **append-only** and may not be modified or deleted.

---

## Operational Risks

### Sunbiz UI Changes

| Risk | Mitigation |
|------|------------|
| Sunbiz redesigns form layout | Abstract selectors into a configuration layer; monitor for selector failures |
| Field names change | Use label-based matching (not brittle IDs); alert on unexpected DOM state |

### CAPTCHA Escalation

- Automation **pauses** at CAPTCHA step
- User is notified and prompted to complete manually
- Session resumes after user signals completion

### Payment Handling

- Automation **pauses** at payment step
- User completes payment directly in the browser
- System captures confirmation after payment

---

## Disaster Recovery

| Measure | Detail |
|---------|--------|
| Backups | Daily automated backups of AzureSQL and BLOB storage |
| Multi-region storage | Documents replicated to secondary Azure region |
| Recovery time objective | < 4 hours for full restore |
