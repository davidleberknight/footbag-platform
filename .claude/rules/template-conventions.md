---
paths:
  - "src/views/**"
---

Templates are logic-light Handlebars. Branch only on pre-shaped data from the service layer. No business rules, no computed values, no direct DB access. If a template needs data it does not have, the fix is in the service, not the template.
