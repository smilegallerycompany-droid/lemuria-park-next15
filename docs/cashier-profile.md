# Cashier profile

Route: `/cashier/profile`  
API: `GET /api/cashier/profile`

## Sections

1. Identity: name, email, role, status, locations, createdAt, lastLoginAt
2. Own stats: today/7d revenue, orders, tickets, cash/card/site, AOV, check-ins
3. Own sales history (latest 50 cashier orders)
4. Security: password change, revoke other sessions, logout
5. Preferences (localStorage): scan sound, vibration, preferred camera, compact mode

## Password change

`POST /api/cashier/password`

- current + new + confirm
- min length 10
- bcrypt hash via `hashPassword`
- wrong current password → generic unauthorized message
- rate limited
- AuditLog `PASSWORD_CHANGED`
- other sessions revoked; current session kept

## Access rules

Cashier can only read own profile endpoint (session-bound).  
Cannot change role/locations/status.
