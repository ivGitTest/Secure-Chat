---
name: Symmetric contact visibility
description: The contact visibility model uses a symmetric deny-list to preserve all-visible defaults without one-way visibility.
---

Contact visibility is represented as a symmetric deny-list: a stored pair means both users are hidden from each other, while no row means they can see each other.

**Why:** A whitelist with “no rows means everyone” can create one-way visibility after removing a pair when only one user has other restrictions. A deny-list preserves the default for existing and newly created users.

**How to apply:** Any admin operation that changes a pair must write or delete both directions atomically. Read queries should fail closed and treat either direction as hiding the pair.